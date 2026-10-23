// ===== 對局流程：經濟、卡池、升星、送禮、回合、AI =====
const isPve = R => R <= 3 || (R - 3) % 5 === 0;
const stageOf = R => R <= 3 ? 1 : 2 + Math.floor((R - 4) / 5);
const stageStart = R => R === 1 || (R >= 4 && (R - 4) % 5 === 0);
// team 本地座標（自己半場 r0 後排 → r3 前排）↔ 全場座標
// side：0 = 下半場、1 = 上半場（team1 的座標點對稱翻轉）
const CENTER_COLS = () => { const m = (CFG.COLS - 1) >> 1, o = [m]; for (let d = 1; d <= m; d++) o.push(m - d, m + d); return o.slice(0, 5); }; // 由中間往兩邊
const toGlobal = (side, c, r) => side === 0 ? [c, r] : [CFG.COLS - 1 - c, CFG.ROWS - 1 - r];
const toLocal = toGlobal; // 對稱
// 多隊模式：每兩隊共用一塊棋盤存放（隊 0/1 用 0～55，隊 2/3 用 100～155…），戰鬥時再搬到同一張戰場
const BSTRIDE = 100;
const SIDE = t => t & 1, GRP = t => t >> 1;
const cellBase = k => k % BSTRIDE;
const cellRC = k => { const b = k % BSTRIDE; return [b % CFG.COLS, Math.floor(b / CFG.COLS)]; };
const teamCell = (team, gcell) => GRP(team) * BSTRIDE + gcell; // 隊伍棋盤上的格子編號
const aliveTeams = G => G.teams.map((T, i) => T.out ? -1 : i).filter(i => i >= 0);
const sellValue = u => { const c = ANIMALS[u.key].cost; const n = Math.pow(3, u.star - 1); return c * n - (u.star > 1 && c > 1 ? 1 : 0); };
const power = u => ANIMALS[u.key].cost * u.star * u.star + u.items.length;

// 自訂房間規則（大廳可改）
const DEFAULT_RULES = { teams: 2, teamHp: CFG.TEAM_HP, prepSec: CFG.PREP_SEC, maxRound: CFG.MAX_ROUND, augments: true, portals: true, encounters: true, weather: true, carousel: true, neutrals: true, frontline: false, commands: true, bans: [], aiLevel: 'normal' };
function createGame(opt) {
  const rules = Object.assign({}, DEFAULT_RULES, opt.rules || {});
  const G = {
    seed: opt.seed >>> 0, rng: makeRng(opt.seed), round: 0, phase: 'lobby', timer: 0, rules, portal: null, portalVote: null, weather: 'sunny', stormLeft: 0,
    draft: null, encounter: null, migration: null, pings: [], lootLog: [], speed: 1,
    solo: !!(opt.solo || rules.solo), // 單人混戰：每人自己一隊
    teams: Array.from({ length: (opt.solo || rules.solo) ? opt.players.length : opt.players.length >> 1 }, (_, t) => ({ hp: rules.teamHp, streak: 0, ark: 0, bank: 0, captain: (opt.solo || rules.solo) ? t : t * 2, out: false, place: 0 })),
    players: opt.players.map((p, i) => ({
      id: i, name: p.name, team: (opt.solo || rules.solo) ? i : i >> 1, slot: (opt.solo || rules.solo) ? 0 : i % 2, ai: !!p.ai, out: false,
      gold: CFG.START_GOLD, xp: 0, level: CFG.START_LEVEL, bench: new Array(CFG.BENCH).fill(null),
      items: [], ready: false, giftedGold: 0, lastIncome: null, shop: [], locked: false,
      augs: [], augChoice: null, augRolled: [], popBonus: 0, discount: 0, freeRoll: 0, killGold: 0, reserved: {}, avoidCells: {}, vote: null, firstRollFree: false,
    })),
    meta: opt.meta || [], // 伺服器整理的高勝率玩家陣容（電腦模仿用；開局分配完就刪掉，不進畫面同步）
    board: {}, pool: {}, terrain: {}, height: {}, arena: 'jungle', arenaStart: 0, uid: 1, battles: [], log: [], winner: -1, lastResult: null, acc: 0,
  };
  const poolMul = G.teams.length > 2 ? CFG.POOL_8P_PCT : 100; // 8 人局卡池放大
  for (const k in ANIMALS) G.pool[k] = (rules.bans.includes(k) || !(ANIMALS[k].cost >= 1)) ? 0 : Math.floor((CFG.POOL[ANIMALS[k].cost] || 0) * poolMul / 100); // 費用 0 ＝ 停用
  G.lastOpp = G.teams.map(() => -1);
  return G;
}
const teammate = (G, pid) => G.players.find(p => p.team === G.players[pid].team && p.id !== pid);
function ownUnits(G, pid) {
  const res = [];
  for (const k in G.board) if (G.board[k].owner === pid) res.push({ u: G.board[k], zone: 'board', cell: +k });
  G.players[pid].bench.forEach((u, i) => { if (u) res.push({ u, zone: 'bench', i }); });
  return res;
}
const boardCount = (G, pid) => Object.values(G.board).filter(u => u.owner === pid).length;
function inHalf(team, cell) { if (Math.floor(cell / BSTRIDE) !== GRP(team)) return false; const r = cellRC(cell)[1]; return SIDE(team) === 0 ? r < CFG.ROWS_HALF : r >= CFG.ROWS_HALF; }
// 前線爭奪：開啟時可以把棋子放進敵方最前排（每人最多 1 隻；只有 2 隊模式）
const enemyFront = (team, cell) => Math.floor(cell / BSTRIDE) === GRP(team) && cellRC(cell)[1] === (SIDE(team) === 0 ? CFG.ROWS_HALF : CFG.ROWS_HALF - 1);
function canPlace(G, P, cell) { return inHalf(P.team, cell) || (G.rules.frontline && G.teams.length === 2 && enemyFront(P.team, cell)); }
const intruders = (G, pid) => Object.keys(G.board).filter(k => G.board[k].owner === pid && !inHalf(G.players[pid].team, +k)).length;

function newUnit(G, key, star, owner) { return { uid: G.uid++, key, star: star || 1, owner, items: [] }; }

function checkMerge(G, pid) {
  const P = G.players[pid];
  for (let guard = 0; guard < 6; guard++) {
    const groups = {};
    const benchOnly = G.phase !== 'prep'; // 戰鬥中只合成備戰席上的，場上的等回合結束再合
    for (const o of ownUnits(G, pid)) { if (o.u.star >= 3 || (benchOnly && o.zone === 'board')) continue; const k = o.u.key + '|' + o.u.star; (groups[k] = groups[k] || []).push(o); }
    let merged = false;
    for (const k in groups) {
      const g = groups[k]; if (g.length < 3) continue;
      g.sort((a, b) => (a.zone === 'board' ? 0 : 1) - (b.zone === 'board' ? 0 : 1));
      const keep = g[0], rest = g.slice(1, 3);
      let items = keep.u.items.slice();
      for (const o of rest) { items = items.concat(o.u.items); if (o.zone === 'board') delete G.board[o.cell]; else P.bench[o.i] = null; }
      keep.u.star++;
      keep.u.items = items.slice(0, CFG.MAX_ITEMS);
      P.items.push(...items.slice(CFG.MAX_ITEMS));
      G.log.push({ k: 'merge', pid, key: keep.u.key, star: keep.u.star, uid: keep.u.uid, eaten: rest.map(o => o.u.uid) });
      merged = true; break;
    }
    if (!merged) break;
  }
}

function canAfford(P, key) { return P.gold >= ANIMALS[key].cost; }
function rollShop(G, P) {
  const odds = CFG.SHOP_ODDS[P.level];
  P.shop = [];
  for (let i = 0; i < CFG.SHOP_SIZE; i++) {
    let roll = G.rng(100), cost = 1;
    for (let c = 0; c < odds.length; c++) { if (roll < odds[c]) { cost = c + 1; break; } roll -= odds[c]; }
    const mig = k => !G.migration || ANIMALS[k].traits.includes(G.migration);
    let keys = Object.keys(ANIMALS).filter(k => ANIMALS[k].cost === cost && G.pool[k] > 0 && mig(k));
    if (!keys.length && G.migration) keys = Object.keys(ANIMALS).filter(k => G.pool[k] > 0 && mig(k) && ANIMALS[k].cost <= cost);
    if (!keys.length) keys = Object.keys(ANIMALS).filter(k => G.pool[k] > 0 && ANIMALS[k].cost <= cost);
    if (!keys.length) { P.shop.push(null); continue; }
    let tot = 0; for (const k of keys) tot += G.pool[k];
    let r = G.rng(tot), pick = keys[0];
    for (const k of keys) { if (r < G.pool[k]) { pick = k; break; } r -= G.pool[k]; }
    P.shop.push(pick);
  }
}

// ---- 玩家動作（連線版由房主套用） ----
function act(G, pid, a) {
  const P = G.players[pid];
  if (G.phase === 'over' || G.phase === 'lobby' || P.out) return 'bad';
  if (G.phase !== 'prep') {
    // 戰鬥中：可以買賣、刷新、升級、整理備戰席；場上的棋子不能動
    const onBoard = uid => ownUnits(G, pid).some(o => o.u.uid === uid && o.zone === 'board');
    if (a.t === 'move' && (a.to.zone !== 'bench' || onBoard(a.uid))) return 'board_locked';
    if ((a.t === 'sell' || a.t === 'equip' || (a.t === 'gift' && a.uid)) && onBoard(a.uid)) return 'board_locked';
  }
  switch (a.t) {
    case 'reroll': {
      const cost = P.firstRollFree ? 0 : rerollCost(P);
      if (P.gold < cost) return 'no_gold';
      P.gold -= cost; if (P.firstRollFree) P.firstRollFree = false; else if (P.freeRoll > 0 && cost === 0) P.freeRoll--;
      rollShop(G, P); G.log.push({ k: 'reroll', pid }); return 'ok';
    }
    case 'aug': {
      if (!P.augChoice || !P.augChoice.includes(a.id)) return 'bad';
      P.augChoice = null; P.augs.push(a.id); applyAugNow(G, P, a.id);
      G.log.push({ k: 'aug', pid, id: a.id }); return 'ok';
    }
    case 'lock': P.locked = !P.locked; return 'ok';
    case 'buy': {
      a.key = P.shop[a.slot]; const A = ANIMALS[a.key]; if (!A) return 'bad';
      if (G.pool[a.key] <= 0) return 'pool_empty';
      if (P.gold < A.cost) return 'no_gold';
      let slot = P.bench.indexOf(null);
      if (slot < 0) {
        const same = ownUnits(G, pid).filter(o => o.u.key === a.key && o.u.star === 1).length;
        if (same < 2) return 'bench_full';
      }
      P.gold -= A.cost; G.pool[a.key]--; P.shop[a.slot] = null;
      const u = newUnit(G, a.key, 1, pid);
      G.log.push({ k: 'buy', pid, uid: u.uid, slot: a.slot });
      if (slot >= 0) P.bench[slot] = u;
      else { P.bench.push(u); checkMerge(G, pid); compactBench(G, P); return 'ok'; }
      checkMerge(G, pid);
      return 'ok';
    }
    case 'sell': {
      const o = ownUnits(G, pid).find(o => o.u.uid === a.uid); if (!o) return 'bad';
      P.gold += sellValue(o.u); G.pool[o.u.key] += Math.pow(3, o.u.star - 1); G.log.push({ k: 'sell', pid, uid: o.u.uid, gold: sellValue(o.u) });
      P.items.push(...o.u.items);
      if (o.zone === 'board') delete G.board[o.cell]; else P.bench[o.i] = null;
      return 'ok';
    }
    case 'move': {
      const o = ownUnits(G, pid).find(o => o.u.uid === a.uid); if (!o) return moveMateUnit(G, pid, a); // 不是自己的：可能是在搬電腦隊友的棋子
      if (a.to.zone === 'bench') {
        const i = a.to.i, other = P.bench[i];
        if (o.zone === 'bench') { P.bench[o.i] = other; P.bench[i] = o.u; return 'ok'; }
        delete G.board[o.cell]; P.bench[i] = o.u; if (other) G.board[o.cell] = other;
        return 'ok';
      }
      const cell = a.to.cell;
      if (!canPlace(G, P, cell) || G.terrain[cellBase(cell)] === 'rock') return 'bad_cell';
      if (!inHalf(P.team, cell) && !(o.zone === 'board' && !inHalf(P.team, o.cell)) && intruders(G, pid) >= 1) return 'front_full';
      const occ = G.board[cell];
      if (occ && G.players[occ.owner].team !== P.team) return 'enemy_cell';
      if (occ && occ.owner !== pid) {
        // 跟隊友的棋子互換：只限電腦隊友（真人隊友的棋子不能動）
        const Mo = G.players[occ.owner];
        if (Mo.team !== P.team || !Mo.ai) return 'teammate_cell';
        if (o.zone === 'bench') { // 從備戰席放到電腦隊友的位置：電腦的棋子讓到它的備戰席
          if (G.phase !== 'prep' || boardCount(G, pid) >= popCap(P)) return 'teammate_cell';
          const sl = Mo.bench.indexOf(null); if (sl < 0) return 'teammate_cell';
          delete G.board[cell]; Mo.bench[sl] = occ; occ.pinned = false; P.bench[o.i] = null; G.board[cell] = o.u; return 'ok';
        }
        occ.pinned = true;
        G.board[o.cell] = occ; G.board[cell] = o.u; G.log.push({ k: 'swap', pid, uid: o.u.uid, other: occ.uid }); return 'ok';
      }
      if (o.zone === 'board') { delete G.board[o.cell]; if (occ) G.board[o.cell] = occ; G.board[cell] = o.u; return 'ok'; }
      if (!occ && boardCount(G, pid) >= popCap(P)) return 'pop_full';
      P.bench[o.i] = occ || null; G.board[cell] = o.u;
      return 'ok';
    }
    case 'level': {
      if (P.level >= CFG.MAX_LEVEL || P.gold < CFG.XP_COST) return 'no';
      P.gold -= CFG.XP_COST; addXp(P, CFG.XP_BUY); return 'ok';
    }
    case 'equip': {
      const it = P.items[a.idx]; if (!it) return 'bad';
      const tgt = ownUnits(G, pid).find(o => o.u.uid === a.uid); if (!tgt) return 'bad';
      const u = tgt.u;
      if (CONSUMABLES[it]) return useConsumable(G, P, a.idx, tgt);
      if (EMBLEMS[it]) {
        if (ANIMALS[u.key].traits.includes(EMBLEMS[it].trait) || u.items.includes(it)) return 'emblem_dup';
      }
      if (MATS[it]) {
        const mi = u.items.findIndex(x => MATS[x] && RECIPE[[x, it].sort().join('+')]);
        if (mi >= 0) { u.items[mi] = RECIPE[[u.items[mi], it].sort().join('+')]; P.items.splice(a.idx, 1); G.log.push({ k: 'craft', pid, item: u.items[mi], uid: u.uid }); return 'ok'; }
      }
      if (u.items.length >= CFG.MAX_ITEMS) return 'full';
      u.items.push(it); P.items.splice(a.idx, 1); G.log.push({ k: 'equip', pid, item: it, uid: u.uid }); return 'ok';
    }
    case 'gift': {
      const T = teammate(G, pid); if (!T) return 'bad';
      if (a.gold) {
        const g = Math.min(a.gold, P.gold, CFG.GIFT_GOLD_MAX - P.giftedGold); if (g <= 0) return 'limit';
        P.gold -= g; T.gold += g; P.giftedGold += g; G.log.push({ k: 'gift', pid, to: T.id, s: g + ' 金' }); return 'ok';
      }
      if (a.uid) {
        const o = ownUnits(G, pid).find(o => o.u.uid === a.uid); if (!o) return 'bad';
        const slot = T.bench.indexOf(null); if (slot < 0) return 'their_bench_full';
        if (o.zone === 'board') delete G.board[o.cell]; else P.bench[o.i] = null;
        o.u.owner = T.id; T.bench[slot] = o.u; checkMerge(G, T.id);
        G.log.push({ k: 'gift', pid, to: T.id, s: ANIMALS[o.u.key].name }); return 'ok';
      }
      if (a.item !== undefined) {
        const it = P.items[a.item]; if (!it) return 'bad';
        P.items.splice(a.item, 1); T.items.push(it);
        G.log.push({ k: 'gift', pid, to: T.id, s: (MATS[it] || ITEMS[it]).name }); return 'ok';
      }
      return 'bad';
    }
    case 'ready': P.ready = !P.ready; return 'ok';
    case 'vote': if (!G.portalVote || !G.portalVote.options.includes(a.id)) return 'bad'; P.vote = a.id; return 'ok';
    case 'draft': return draftPick(G, pid, a.i);
    case 'encounter': if (!G.encounter || !G.encounter.pending || G.teams[P.team].captain !== pid) return 'bad'; resolveEncounter(G, a.choice); return 'ok';
    case 'deposit': { const n = Math.min(a.n || 1, P.gold); if (n <= 0) return 'no_gold'; P.gold -= n; G.teams[P.team].bank += n; G.log.push({ k: 'bank', pid, n }); return 'ok'; }
    case 'withdraw': { const T = G.teams[P.team], n = Math.min(a.n || 1, T.bank); if (n <= 0) return 'bank_empty'; T.bank -= n; P.gold += n; G.log.push({ k: 'bank', pid, n: -n }); return 'ok'; }
    case 'captain': { const T = G.teams[P.team]; if (T.captain !== pid || !teammate(G, pid)) return 'not_captain'; T.captain = teammate(G, pid).id; G.log.push({ k: 'captain', pid, to: T.captain }); return 'ok'; }
    case 'cmd': {
      if (!G.rules.commands || G.phase !== 'combat') return 'bad';
      const bt = G.battles.find(b => b.teams.includes(P.team)); if (!bt) return 'bad';
      return battleCommand(bt.B, pid, a.type) ? 'ok' : 'cmd_used';
    }
    case 'aitoggle': { P.ai = !P.ai; if (P.ai) { P.ready = true; if (G.phase === 'prep') aiPrep(G, pid); } else P.ready = false; return 'ok'; }
    case 'surrender': { if (G.teams[P.team].out) return 'bad'; G.teams[P.team].hp = 0; G.surrendered = P.team; eliminate(G); return 'ok'; }
    case 'augroll': {
      if (!P.augChoice || P.augRolled[a.i] || !P.augChoice[a.i]) return 'bad';
      const tier = AUG[P.augChoice[a.i]].tier;
      const pool = AUGMENTS.filter(x => x.tier === tier && !P.augs.includes(x.id) && !P.augChoice.includes(x.id) && augOk(G, x)).map(x => x.id);
      if (!pool.length) return 'bad';
      P.augChoice[a.i] = pool[G.rng(pool.length)]; P.augRolled[a.i] = true; return 'ok';
    }
    case 'ping': {
      const T = teammate(G, pid) || { ai: false };
      G.pings.push({ pid, kind: a.kind, cell: a.cell, key: a.key, t: G.round });
      if (T.ai) {
        if (a.kind === 'want' && a.key) { T.reserved[a.key] = true; aiSay(G, T.id, pid, `好，${ANIMALS[a.key].name}讓給你`); const mine = ownUnits(G, T.id).find(o => o.u.key === a.key && o.u.star === 1); if (mine && act(G, T.id, { t: 'gift', uid: mine.u.uid }) === 'ok') aiSay(G, T.id, pid, `我這隻${ANIMALS[a.key].name}先給你`); }
        if (a.kind === 'place' && a.cell !== undefined) { T.avoidCells[a.cell] = true; aiSay(G, T.id, pid, '收到，那格留給你'); }
        if (a.kind === 'danger') aiSay(G, T.id, pid, '了解，我會小心那邊');
        if (a.kind === 'rally') aiSay(G, T.id, pid, '好，往那邊集合');
        if (a.kind === 'buy' && a.key) {
          const i = T.shop.indexOf(a.key);
          if (i >= 0 && T.gold >= ANIMALS[a.key].cost && P.bench.indexOf(null) >= 0 && act(G, T.id, { t: 'buy', slot: i }) === 'ok') {
            const bought = ownUnits(G, T.id).filter(o => o.zone === 'bench' && o.u.key === a.key).pop();
            if (bought && act(G, T.id, { t: 'gift', uid: bought.u.uid }) === 'ok') aiSay(G, T.id, pid, `買好了，${ANIMALS[a.key].name}給你！`);
          } else G.log.push({ k: 'pingfail', pid, to: T.id, key: a.key });
        }
      }
      G.log.push({ k: 'ping', pid, kind: a.kind, cell: a.cell, key: a.key }); return 'ok';
    }
  }
  return 'bad';
}
// 真人可以搬動 AI 隊友場上的棋子（只限準備階段、只在我方半場）；搬過的棋子 AI 不會再自己移回去
function moveMateUnit(G, pid, a) {
  const P = G.players[pid], M = teammate(G, pid);
  if (!M || !M.ai || P.ai || G.phase !== 'prep' || !a.to || a.to.zone !== 'board') return 'bad';
  const o = ownUnits(G, M.id).find(x => x.u.uid === a.uid && x.zone === 'board'); if (!o) return 'bad';
  const cell = a.to.cell;
  if (!inHalf(P.team, cell) || G.terrain[cellBase(cell)] === 'rock') return 'bad_cell';
  const occ = G.board[cell];
  if (occ && G.players[occ.owner].team !== P.team) return 'enemy_cell';
  delete G.board[o.cell]; if (occ) { G.board[o.cell] = occ; if (occ.owner === M.id) occ.pinned = true; }
  G.board[cell] = o.u; o.u.pinned = true;
  G.log.push({ k: 'swap', pid, uid: o.u.uid, other: occ ? occ.uid : 0, mate: true }); return 'ok';
}
function addXp(P, n) {
  P.xp += n;
  while (P.level < CFG.MAX_LEVEL && P.xp >= CFG.XP_NEED[P.level]) { P.xp -= CFG.XP_NEED[P.level]; P.level++; }
  if (P.level >= CFG.MAX_LEVEL) P.xp = 0;
}

// ---- 地形 ----
function rollTerrain(G) {
  const st = stageOf(G.round);
  G.arena = ARENA_ORDER[(G.arenaStart + st - 1) % ARENA_ORDER.length];
  const A = ARENAS[G.arena];
  const n = A.count[0] + G.rng(A.count[1] - A.count[0] + 1) + (G.portal === 'quake' ? 2 : 0);
  const bag = []; for (const t in A.weights) for (let i = 0; i < A.weights[t]; i++) bag.push(t);
  const chosen = []; let rock = 0;
  for (let guard = 0; chosen.length < n && guard < 50; guard++) {
    const t = bag[G.rng(bag.length)];
    if (t === 'rock' && rock >= A.maxRock) continue;
    if (t === 'rock') rock++; chosen.push(t);
  }
  const used = {}; G.terrain = {}; G.height = {};
  // 高台：每座 2～3 格相連，雙方鏡像對稱；不放在已被岩石佔的位置
  const nh = (A.hills || [0, 0])[0] + G.rng(((A.hills || [0, 0])[1] - (A.hills || [0, 0])[0]) + 1);
  for (let h = 0; h < nh; h++) {
    for (let tries = 0; tries < 30; tries++) {
      const c = G.rng(CFG.COLS), r = G.rng(CFG.ROWS_HALF), size = 2 + G.rng(2), cells = [[c, r]];
      const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      for (let g = 0; cells.length < size && g < 12; g++) { const b = cells[G.rng(cells.length)], d = dirs[G.rng(4)], nc = b[0] + d[0], nr = b[1] + d[1]; if (nc >= 0 && nc < CFG.COLS && nr >= 0 && nr < CFG.ROWS_HALF && !cells.some(x => x[0] === nc && x[1] === nr)) cells.push([nc, nr]); }
      if (cells.some(([cc, rr]) => G.height[rr * CFG.COLS + cc])) continue;
      for (const [cc, rr] of cells) { const k = rr * CFG.COLS + cc, [gc, gr] = toGlobal(1, cc, rr); G.height[k] = 1; G.height[gr * CFG.COLS + gc] = 1; }
      break;
    }
  }
  for (const t of chosen) {
    for (let tries = 0; tries < 40; tries++) {
      const c = G.rng(CFG.COLS), r = G.rng(CFG.ROWS_HALF), k = r * CFG.COLS + c;
      if (used[k]) continue;
      const [gc, gr] = toGlobal(1, c, r), k2 = gr * CFG.COLS + gc;
      if (t === 'rock' && Object.keys(G.board).some(b => cellBase(+b) === k || cellBase(+b) === k2)) continue;
      if (G.height[k] && (t === 'water' || t === 'rock' || t === 'bounce')) continue; // 高台上不放水、岩石、彈射
      used[k] = 1; G.terrain[k] = t; G.terrain[k2] = t; break;
    }
  }
}

// ---- 回合流程 ----
function startGame(G) {
  // 電腦模仿玩家：從高勝率的玩家陣容裡挑一套當目標（依勝率加權）
  for (const P of G.players) if (P.ai) P.target = G.rng(100) < aiLv(G, P).meta ? metaPick(G) : null;
  delete G.meta;
  G.round = 0; G.arenaStart = G.rng(ARENA_ORDER.length);
  if (G.rules.portals) {
    const pool = PORTALS.map(p => p.id), opts = []; while (opts.length < 3) opts.push(pool.splice(G.rng(pool.length), 1)[0]);
    G.portalVote = { options: opts, votes: {} };
    for (const P of G.players) if (P.ai) P.vote = opts[G.rng(3)];
  }
  startPrep(G);
}
function resolvePortal(G) {
  if (!G.portalVote) return;
  const opts = G.portalVote.options, cnt = {};
  for (const P of G.players) { const v = P.vote || opts[G.rng(3)]; cnt[v] = (cnt[v] || 0) + 1; }
  let best = opts[0], bn = -1; for (const o of opts) { const n = (cnt[o] || 0) + G.rng(100) / 1000; if (n > bn) { bn = n; best = o; } }
  G.portal = best; G.portalVote = null; G.log.push({ k: 'portal', id: best });
  if (best === 'blitz') { G.rules.prepSec = 20; for (const T of G.teams) T.hp = Math.min(T.hp, 80); }
  if (best === 'headstart') for (const P of G.players) { P.level = Math.max(P.level, 3); P.xp = 0; P.gold += 3; rollShop(G, P); }
  if (best === 'crowd') for (const k in G.pool) if (G.pool[k] > 0) G.pool[k] = Math.floor(G.pool[k] * 13 / 10);
  if (best === 'freeroll') for (const P of G.players) P.firstRollFree = true;
  for (const P of G.players) if (P.ai) aiPrep(G, P.id);
}
function startPrep(G) {
  G.round++;
  const R = G.round;
  if (stageStart(R)) rollTerrain(G);
  for (const P of G.players) {
    P.ready = false; P.giftedGold = 0;
    if (P.out) { P.ready = true; P.augChoice = null; continue; }
    if (R === 1) {
      const keys = Object.keys(ANIMALS).filter(k => ANIMALS[k].cost === 1);
      const k = keys[G.rng(keys.length)]; G.pool[k]--; P.bench[0] = newUnit(G, k, 1, P.id);
    } else {
      const T = G.teams[P.team], s = Math.abs(T.streak);
      const inc = { base: CFG.INCOME_BY_STAGE[Math.min(stageOf(R), CFG.INCOME_BY_STAGE.length - 1)] || CFG.BASE_INCOME, interest: Math.min(CFG.MAX_INTEREST + (P.augs.includes('piggy') ? 1 : 0), Math.floor(P.gold / 10)), streak: s >= 6 ? 3 : s >= 4 ? 2 : s >= 2 ? 1 : 0 };
      if (G.portal === 'goldseason') inc.base += 1;
      P.gold += inc.base + inc.interest + inc.streak; P.lastIncome = inc;
      addXp(P, CFG.XP_ROUND + (G.portal === 'xpboost' ? 2 : 0));
      if (G.portal === 'freeroll') P.firstRollFree = true;
    }
    if (!P.locked) rollShop(G, P); P.locked = false;
    if (P.discount > 0 && R > 1) P.discount--;
  }
  G.phase = 'prep'; for (const P of G.players) checkMerge(G, P.id);
  if (R > 1) for (const T of G.teams) { const i = Math.min(CFG.BANK_INTEREST_MAX, Math.floor(T.bank / 10)); T.bank += i; T.bankInt = i; }
  for (const P of G.players) { P.reserved = {}; P.avoidCells = {}; }
  G.pings = [];
  rollWeather(G);
  G.migration = null;
  if (G.rules.encounters && CFG.ENCOUNTER_ROUNDS.includes(R)) startEncounter(G);
  if (G.rules.augments && CFG.AUG_ROUNDS.includes(R)) offerAugments(G);
  if (G.rules.carousel && CFG.CAROUSEL_ROUNDS.includes(R)) startDraft(G);
  G.phase = 'prep'; G.timer = G.rules.prepSec * 1000;
  // AI 行動順序每回合輪替，避免某一隊總是先搶卡池
  const order = G.players.map(p => p.id); for (let i = 0; i < G.round % 4; i++) order.push(order.shift());
  for (const id of order) if (G.players[id].ai && !G.players[id].out) aiPrep(G, id);
}

function battleUnitsForTeam(G, team, asTeam) {
  // 把 team 的棋子轉成戰鬥輸入；asTeam 為在該場戰鬥中的陣營（0 下半場、1 上半場）
  const out = [];
  for (const k in G.board) {
    const u = G.board[k]; const P = G.players[u.owner]; if (P.team !== team) continue;
    const [c, r] = cellRC(+k);
    const [lc, lr] = toLocal(SIDE(team), c, r); const [gc, gr] = toGlobal(asTeam, lc, lr);
    out.push({ uid: u.uid, key: u.key, star: u.star, owner: u.owner, team: asTeam, c: gc, r: gr, items: u.items });
  }
  return out;
}
function heightFor(G, team) {
  const h = G.height || {};
  if (SIDE(team) === 0) return Object.assign({}, h);
  const t = {}; for (const k in h) { const c = +k % CFG.COLS, r = Math.floor(+k / CFG.COLS); const [gc, gr] = toGlobal(1, c, r); t[gr * CFG.COLS + gc] = h[k]; }
  return t;
}
function terrainFor(G, team) {
  // team 作為戰鬥 team0 時的地形（team1 視角需翻轉）
  if (SIDE(team) === 0) return Object.assign({}, G.terrain);
  const t = {};
  for (const k in G.terrain) { const c = +k % CFG.COLS, r = Math.floor(+k / CFG.COLS); const [gc, gr] = toGlobal(1, c, r); t[gr * CFG.COLS + gc] = G.terrain[k]; }
  return t;
}
function startCombat(G) {
  for (const P of G.players) if (!P.ai && !P.out) P.lastComp = compOf(G, P.id); // 記下真人這回合的陣容（結束時給伺服器學）
  const R = G.round, seed = (G.seed ^ Math.imul(R, 2654435761)) >>> 0;
  G.battles = [];
  if (isPve(R)) {
    for (const team of aliveTeams(G)) {
      const units = battleUnitsForTeam(G, team, 0);
      for (const [key, c, r] of pveOf(R)) { const [gc, gr] = toGlobal(1, c, r); units.push({ key, star: PVE_STAR[R] || 3, owner: -1, team: 1, c: gc, r: gr, items: [] }); }
      const input = { seed: seed + team, terrain: terrainFor(G, team), height: heightFor(G, team), units, pve: true, aug: augMap(G), low: lowMap(G), flags: battleFlags(G), weather: G.weather };
      G.battles.push({ teams: [team, -1], input: JSON.parse(JSON.stringify(input)), B: createBattle(input) });
    }
  } else {
    for (const [a, b, ghost] of pairTeams(G)) {
      const units = battleUnitsForTeam(G, a, 0).concat(battleUnitsForTeam(G, b, 1));
      const input = { seed: seed + a * 7, terrain: Object.assign({}, G.terrain), height: Object.assign({}, G.height || {}), units, aug: augMap(G), low: lowMap(G), flags: battleFlags(G), weather: G.weather, neutrals: rollNeutrals(G, units) };
      G.battles.push({ teams: [a, b], ghost: !!ghost, input: JSON.parse(JSON.stringify(input)), B: createBattle(input) });
    }
  }
  G.phase = 'combat'; G.acc = 0;
  // AI 戰鬥指令時間點
  G.aiCmd = {}; for (const P of G.players) if (P.ai && G.rules.commands) G.aiCmd[P.id] = { t: 120 + G.rng(200), type: ['charge', 'rally', 'hold'][G.rng(3)] };
}
function combatDone(G) { return G.battles.every(b => b.B.over); }
// 對戰配對：2 隊就是 0 對 1；4 隊每回合隨機配對、盡量不連續打同一隊；剩奇數隊時有一隊打「幽靈」（別隊的複製，輸贏不影響對方）
function pairTeams(G) {
  const alive = aliveTeams(G);
  if (alive.length === 2) { G.lastOpp[alive[0]] = alive[1]; G.lastOpp[alive[1]] = alive[0]; return [[alive[0], alive[1], false]]; }
  let best = null, bestBad = 99;
  for (let tries = 0; tries < 12; tries++) {
    const a = alive.slice(); for (let i = a.length - 1; i > 0; i--) { const j = G.rng(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    const pairs = []; for (let i = 0; i + 1 < a.length; i += 2) pairs.push([a[i], a[i + 1], false]);
    if (a.length % 2) { const x = a[a.length - 1], others = alive.filter(t => t !== x); pairs.push([x, others[G.rng(others.length)], true]); }
    const bad = pairs.filter(([p, q, gh]) => !gh && G.lastOpp[p] === q).length;
    if (bad < bestBad) { best = pairs; bestBad = bad; if (!bad) break; }
  }
  for (const [p, q, gh] of best) { G.lastOpp[p] = q; if (!gh) G.lastOpp[q] = p; }
  return best;
}
// 淘汰：血量歸零的隊伍出局，依血量決定名次；剩 1 隊（或回合上限）時結束
function eliminate(G, force) {
  const alive = aliveTeams(G), dead = alive.filter(t => G.teams[t].hp <= 0).sort((x, y) => G.teams[y].hp - G.teams[x].hp);
  let place = alive.length;
  for (let i = dead.length - 1; i >= 0; i--) { const t = dead[i], T = G.teams[t]; T.out = true; T.place = place--; G.log.push({ k: 'out', team: t, place: T.place });
    for (const P of G.players) if (P.team === t) { P.out = true; P.ready = true; P.augChoice = null;
      for (const o of ownUnits(G, P.id)) { G.pool[o.u.key] += Math.pow(3, o.u.star - 1); if (o.zone === 'board') delete G.board[o.cell]; else P.bench[o.i] = null; } } }
  const left = aliveTeams(G);
  if (left.length <= 1 || force) {
    left.sort((x, y) => G.teams[y].hp - G.teams[x].hp).forEach((t, i) => { G.teams[t].place = i + 1; });
    if (!left.length) { const all = G.teams.map((T, i) => i).sort((x, y) => G.teams[y].hp - G.teams[x].hp); all.forEach((t, i) => { G.teams[t].place = i + 1; }); }
    G.winner = G.teams.findIndex(T => T.place === 1);
    G.phase = 'over';
    return true;
  }
  return false;
}

function endCombat(G) {
  const R = G.round, st = stageOf(R), n = G.teams.length, res = { round: R, pve: isPve(R), dmg: new Array(n).fill(0), win: new Array(n).fill(false), opp: new Array(n).fill(-1) };
  if (isPve(R)) {
    for (const bt of G.battles) {
      const team = bt.teams[0]; res.win[team] = bt.B.winner === 0;
      for (const P of G.players) if (P.team === team) {
        const times = G.portal === 'harvest' ? 2 : 1;
        for (let k = 0; k < times; k++) for (const d of rollLoot(G, R)) giveLoot(G, P, d);
      }
    }
  } else {
    for (const bt of G.battles) {
      const B = bt.B, w = B.winner;
      bt.teams.forEach((team, side) => {
        if (side === 1 && bt.ghost) return; // 幽靈對手：不影響被複製的那隊
        const T = G.teams[team]; res.opp[team] = bt.teams[1 - side];
        if (w === side) { res.win[team] = true; T.streak = T.streak > 0 ? T.streak + 1 : 1; for (const P of G.players) if (P.team === team) P.gold += CFG.WIN_GOLD; }
        else {
          let d = CFG.DMG_BASE + Math.floor(survivorStars(B, 1 - side) * CFG.DMG_STAR_PCT / 100) + CFG.DMG_STAGE * (st - 1);
          if (T.ark > 0) { T.ark--; d = 0; res.ark = true; }
          T.hp -= d; res.dmg[team] = d; T.streak = T.streak < 0 ? T.streak - 1 : -1;
        }
      });
    }
  }
  // 增幅：戰後經濟
  for (const bt of G.battles) {
    const B = bt.B;
    for (const l of B.loot || []) { const P = G.players[l.owner]; if (!P) continue; giveLoot(G, P, { type: 'gold', n: l.key === 'chest' ? 2 : 1 }); if (l.key === 'chest') giveLoot(G, P, { type: 'mat', k: Object.keys(MATS)[G.rng(6)] }); }
    for (const P of G.players) {
      if (P.augs.includes('recycle') && B.deaths[P.id]) P.gold += Math.min(4, B.deaths[P.id]);
      if (P.augs.includes('goldrain')) { if (B.kills[P.id]) P.gold += Math.min(3, B.kills[P.id]); if (B.bigKill[P.id]) P.freeRoll++; }
    }
  }
  G.lastResult = res;
  if (!eliminate(G, G.rules.maxRound > 0 && R >= G.rules.maxRound)) { G.phase = 'result'; G.timer = 3000; }
}

// 主更新：dt 毫秒
function update(G, dt) {
  if (G.phase === 'prep') {
    const humans = G.players.filter(p => !p.ai && !p.out);
    if (G.portalVote && humans.every(p => p.vote)) resolvePortal(G);
    if (G.draft) aiDraftTurns(G);
    const waiting = humans.some(p => p.augChoice) || G.portalVote || G.draft || (G.encounter && G.encounter.pending) || G.paused;
    if (!waiting) G.timer -= dt; // 有人在選擇時暫停倒數
    if (G.timer <= 5000 && G.aiLate !== G.round) { G.aiLate = G.round; for (const P of G.players) if (P.ai && !P.out) aiLate(G, P.id); } // 準備最後 5 秒：電腦隊友再看一次真人隊友的擺法
    if (G.aiMid !== G.round && G.timer < G.rules.prepSec * 600) { G.aiMid = G.round; for (const P of G.players) if (P.ai && !P.out) aiHelpMate(G, P.id); } // 準備到一半：AI 隊友看玩家買了什麼，再幫一次
    if (G.timer <= 0 || (humans.length && humans.every(p => p.ready))) {
      for (const P of G.players) if (P.augChoice) act(G, P.id, { t: 'aug', id: P.augChoice[0] });
      if (G.portalVote) resolvePortal(G);
      while (G.draft) draftPick(G, G.draft.order[G.draft.idx], 0);
      if (G.encounter && G.encounter.pending) resolveEncounter(G, G.encounter.choice[0]);
      startCombat(G);
    }
  } else if (G.phase === 'combat') {
    G.acc += dt * (G.speed || 1);
    while (G.acc >= CFG.TICK_MS && !combatDone(G)) {
      G.acc -= CFG.TICK_MS;
      for (const b of G.battles) {
        for (const pid in G.aiCmd || {}) { const c = G.aiCmd[pid]; if (c && b.B.t === c.t && b.teams.includes(G.players[pid].team)) battleCommand(b.B, +pid, c.type); }
        step(b.B);
      }
    }
    if (combatDone(G)) endCombat(G);
  } else if (G.phase === 'result') {
    G.timer -= dt; if (G.timer <= 0) startPrep(G);
  }
}

// ---- AI ----
function aiSay(G, from, to, text) { G.log.push({ k: 'aichat', pid: from, to, text }); }
// AI 隊友主動幫忙：送玩家湊三星的棋子、幫買、玩家沒錢時送金幣，並朝玩家的羈絆湊陣容
function aiHelpMate(G, pid) {
  const P = G.players[pid], H = teammate(G, pid);
  if (!H || H.ai || H.out) return {};
  const hc = {}; for (const o of ownUnits(G, H.id)) if (o.u.star === 1) hc[o.u.key] = (hc[o.u.key] || 0) + 1;
  let gave = 0;
  // 1. 我手上有玩家正在湊的 1 星棋子 → 送過去（玩家已有 2 隻優先，其次 1 隻且是玩家標記想要的）
  for (const o of ownUnits(G, pid)) {
    if (gave >= 2) break;
    const k = o.u.key; if (o.u.star !== 1 || !(hc[k] >= 2 || (hc[k] >= 1 && P.reserved[k]))) continue;
    if (H.bench.indexOf(null) < 0) break;
    if (act(G, pid, { t: 'gift', uid: o.u.uid }) === 'ok') { aiSay(G, pid, H.id, `送你一隻${ANIMALS[k].name}，湊三星！`); hc[k]++; gave++; }
  }
  // 2. 商店有玩家差一隻就升星的 → 幫買再送
  for (let i = 0; i < P.shop.length && gave < 2; i++) {
    const k = P.shop[i]; if (!k || hc[k] !== 2 || P.gold < ANIMALS[k].cost || H.bench.indexOf(null) < 0) continue;
    if (act(G, pid, { t: 'buy', slot: i }) !== 'ok') continue;
    const b = ownUnits(G, pid).filter(o => o.zone === 'bench' && o.u.key === k && o.u.star === 1).pop();
    if (b && act(G, pid, { t: 'gift', uid: b.u.uid }) === 'ok') { aiSay(G, pid, H.id, `商店剛好有${ANIMALS[k].name}，幫你買了`); gave++; }
  }
  // 3. 玩家快沒錢、我很有錢 → 送金幣
  if (H.gold < 4 && P.gold >= 16 && P.giftedGold < CFG.GIFT_GOLD_MAX) { const g = Math.min(CFG.GIFT_GOLD_MAX - P.giftedGold, 5); if (act(G, pid, { t: 'gift', gold: g }) === 'ok') aiSay(G, pid, H.id, `你錢不多，先拿 ${g} 金去用`); }
  // 4. 玩家主力羈絆（場上最多的那個）→ 我買棋子時加分
  const tr = {}; for (const k in G.board) { const u = G.board[k]; if (u.owner === H.id) for (const t of ANIMALS[u.key].traits) tr[t] = (tr[t] || 0) + 1; }
  return tr;
}
// ---- AI（v0.12：會跟玩家配合、照陣容買、會存利息、懂站位）----
// 數值都可以在 AI_CFG 調整
const AI_CFG = {
  LEVEL_AT: { 2: 3, 4: 4, 6: 5, 10: 6, 14: 7, 19: 8, 25: 9 }, // 第幾回合起想要升到幾級（普通難度）
  SAVE: 50,                // 血量健康時存到多少金（吃滿利息）
  ROLL_HP: 40,             // 團隊血量低於這個就開始刷新找牌
};
// 電腦強度（練習時在「選擇模式」切換；只影響對手，電腦隊友固定普通）
// lvl：升級目標加減｜rollKeep：刷新時至少留多少金｜rollLv：到幾級開始固定刷新
// meta：照玩家高勝率陣容打的機率%｜plan：照羈絆計畫買牌的程度｜noise：買牌亂數｜misplace：每隻棋子亂站的機率%｜combo：會不會湊合體技｜smartItems：裝備給對的人
const AI_LEVELS = {
  easy:   { meta: 0,   plan: 0.3, noise: 30, misplace: 70, combo: false, smartItems: false, lvl: -1, rollKeep: 999, rollLv: 99 },
  normal: { meta: 50,  plan: 0.8, noise: 14, misplace: 20, combo: true,  smartItems: true,  lvl: 0,  rollKeep: 20,  rollLv: 7 },
  hard:   { meta: 100, plan: 1,   noise: 8,  misplace: 0,  combo: true,  smartItems: true,  lvl: 0,  rollKeep: 20,  rollLv: 7 },
};
const aiLvName = (G, P) => P.aiLv || (G.players.some(q => q.team === P.team && !q.ai) ? 'normal' : (G.rules.aiLevel || 'normal'));
const aiLv = (G, P) => AI_LEVELS[aiLvName(G, P)] || AI_LEVELS.normal;
const aiRoleOf = key => { const A = ANIMALS[key]; if (!A) return 'fighter'; const r = A.role || ''; return r.includes('坦') ? 'tank' : r.includes('刺客') ? 'assassin' : A.rng >= 2 ? 'carry' : 'fighter'; };
const aiHumanMate = (G, pid) => { const T = teammate(G, pid); return T && !T.ai && !T.out ? T : null; };
// 隊伍的羈絆計畫：看我和隊友場上＋備戰席已經有的種類，挑最有希望的 2～3 個羈絆
const META_CFG = { USE_PCT: 70, TARGET_BUY: 18, TARGET_KEEP: 10 }; // 有玩家陣容時照著打的機率%、買目標棋子加分、留著目標棋子加分
function compOf(G, pid) {
  const P = G.players[pid], list = [];
  for (const k in G.board) { const u = G.board[k]; if (u.owner !== pid) continue; const [c, r] = cellRC(+k), [lc, lr] = toLocal(SIDE(P.team), c, r); list.push([u.key, u.star, lc, lr]); }
  return list;
}
function metaPick(G) {
  const L = (G.meta || []).filter(m => m.units && m.units.length >= 3); if (!L.length || G.rng(100) >= META_CFG.USE_PCT) return null;
  let tot = 0; for (const m of L) tot += Math.max(1, Math.round((m.wr || 0.5) * 100)); let r = G.rng(tot);
  for (const m of L) { r -= Math.max(1, Math.round((m.wr || 0.5) * 100)); if (r < 0) return { id: m.id, units: m.units }; }
  return null;
}
function aiPlan(G, pid) {
  const P = G.players[pid], seen = {}, cnt = {};
  if (P.target) for (const [k] of P.target.units) if (ANIMALS[k]) for (const t of ANIMALS[k].traits) cnt[t] = (cnt[t] || 0) + (G.round >= 6 ? 1.5 : 0.6); // 目標陣容的羈絆
  const add = (key, w) => { if (!ANIMALS[key] || seen[key]) return; seen[key] = 1; for (const t of ANIMALS[key].traits) cnt[t] = (cnt[t] || 0) + w; };
  for (const k in G.board) { const u = G.board[k]; if (G.players[u.owner].team === P.team) add(u.key, u.owner === pid ? 1.2 : 1); }
  for (const u of P.bench) if (u) add(u.key, 0.8);
  const order = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
  const plan = {}; order.slice(0, 3).forEach((t, i) => { plan[t] = 3 - i; });
  return plan;
}
function aiUnitValue(G, pid, u, plan) {
  const A = ANIMALS[u.key]; if (!A) return 0;
  let v = A.cost * u.star * u.star * 10 + u.items.length * 8;
  for (const t of A.traits) v += (plan[t] || 0) * 4;
  const P = G.players[pid]; if (P.target && P.target.units.some(x => x[0] === u.key)) v += META_CFG.TARGET_KEEP;
  return v;
}
function aiPickAug(G, P) {
  const R = G.round, T = G.teams[P.team];
  const plan = aiPlan(G, P.id);
  const score = id => {
    const a = AUG[id]; let s = 10 + G.rng(6);
    if (a.hook === 'econ') s += R <= 9 ? 8 : -4;
    if (id === 'ark' && T.hp < 50) s += 12;
    if (id === 'lastStand' && T.hp < 50) s += 8;
    if (id === 'howl' && plan.pack) s += 10;
    if ((id === 'amphibious' || id === 'wavestep') && plan.water) s += 8;
    if (id === 'fortress' || id === 'mutation' || id === 'beastking') s += 4;
    return s;
  };
  return P.augChoice.slice().sort((a, b) => score(b) - score(a))[0];
}
function aiPrep(G, pid) {
  const P = G.players[pid], R = G.round, lv = aiLvName(G, P), L = aiLv(G, P), T = G.teams[P.team];
  if (P.out) return;
  if (P.augChoice) act(G, pid, { t: 'aug', id: aiPickAug(G, P) });
  const human = aiHumanMate(G, pid);
  // 1) 想要的等級
  let target = 2; for (const r in AI_CFG.LEVEL_AT) if (R >= +r) target = AI_CFG.LEVEL_AT[r];
  target = Math.max(2, Math.min(CFG.MAX_LEVEL, target + L.lvl + (T.hp < AI_CFG.ROLL_HP ? 1 : 0)));
  const healthy = T.hp >= 50, save = L.lvl < 0 ? 10 : (R >= 6 && healthy ? Math.min(AI_CFG.SAVE, 10 * Math.floor(P.gold / 10)) : 0);
  while (P.level < target && P.gold >= CFG.XP_COST && P.gold - CFG.XP_COST >= Math.min(save, 20)) if (act(G, pid, { t: 'level' }) !== 'ok') break;
  // 2) 先照顧真人隊友：他快湊滿三隻的，我手上有就送他
  const mateTr = aiHelpMate(G, pid); // 回應真人隊友（送棋子、送錢、幫買）—— 互動用 v0.12 甲版
  // 3) 買牌
  const plan = aiPlan(G, pid); for (const t in plan) plan[t] *= L.plan;
  const keepGold = () => (P.level >= target || P.level >= CFG.MAX_LEVEL) ? Math.min(save, 50) : save;
  const buyPass = () => {
    for (let loop = 0; loop < CFG.SHOP_SIZE; loop++) {
      const own = ownUnits(G, pid), cnt = {};
      for (const o of own) if (o.u.star === 1) cnt[o.u.key] = (cnt[o.u.key] || 0) + 1;
      const benchFree = P.bench.filter(x => !x).length;
      let best = -1, bs = 0;
      P.shop.forEach((k, i) => {
        if (!k || G.pool[k] <= 0 || P.reserved[k]) return;
        const A = ANIMALS[k], c = cnt[k] || 0;
        if (P.gold < A.cost) return;
        const merges = c >= 2;
        if (!merges && P.gold - A.cost < keepGold()) return;
        if (!merges && benchFree <= 1) return;
        let s = A.cost * 6 + c * 22 + G.rng(L.noise) + (P.target && P.target.units.some(x => x[0] === k) ? META_CFG.TARGET_BUY : 0);
        for (const t of A.traits) s += (plan[t] || 0) * 7 + (mateTr[t] || 0) * 3; // 跟著真人隊友的羈絆湊
        if (A.cost > P.level - 1 && !c) s -= 8; // 太貴、還湊不起來的先不急
        if (own.length >= popCap(P) + 4 && !c) s -= 30;
        if (s > bs) { bs = s; best = i; }
      });
      if (best < 0 || bs < 12) break;
      if (act(G, pid, { t: 'buy', slot: best }) !== 'ok') break;
    }
  };
  buyPass();
  // 4) 刷新：血少或到了固定刷新的等級
  const keep = L.rollKeep, rollLv = L.rollLv;
  const wantRoll = T.hp < AI_CFG.ROLL_HP || P.level >= rollLv;
  for (let n = 0; n < 12 && wantRoll && P.gold >= keep + rerollCost(P) && (T.hp < AI_CFG.ROLL_HP || P.gold >= Math.max(keep, 30)); n++) { if (act(G, pid, { t: 'reroll' }) !== 'ok') break; buyPass(); }
  // 5) 備戰席太滿：賣最沒用的（不賣有對子的）
  const sellWorst = () => {
    const cnt = {}; for (const o of ownUnits(G, pid)) if (o.u.star === 1) cnt[o.u.key] = (cnt[o.u.key] || 0) + 1;
    const cand = ownUnits(G, pid).filter(o => o.zone === 'bench').sort((a, b) => (aiUnitValue(G, pid, a.u, plan) + (cnt[a.u.key] >= 2 && a.u.star === 1 ? 60 : 0)) - (aiUnitValue(G, pid, b.u, plan) + (cnt[b.u.key] >= 2 && b.u.star === 1 ? 60 : 0)));
    if (cand[0]) act(G, pid, { t: 'sell', uid: cand[0].u.uid });
  };
  for (let g = 0; g < 10 && P.bench.filter(x => !x).length < 1; g++) sellWorst();
  aiPlace(G, pid);
  // 6) 場上用不到、又不在計畫裡的低費卡，後期賣掉換錢
  if (R >= 10) for (const o of ownUnits(G, pid).filter(o => o.zone === 'bench' && o.u.star === 1 && ANIMALS[o.u.key].cost <= 2)) { const same = ownUnits(G, pid).filter(x => x.u.key === o.u.key && x.u.star === 1).length; if (same < 2 && !ANIMALS[o.u.key].traits.some(t => plan[t])) act(G, pid, { t: 'sell', uid: o.u.uid }); }
  aiItems(G, pid);
  P.ready = true;
}
function aiItems(G, pid) {
  const P = G.players[pid];
  const board = ownUnits(G, pid).filter(o => o.zone === 'board' && !o.u.summon);
  if (!board.length) return;
  const score = (o, role) => ANIMALS[o.u.key].cost * o.u.star * o.u.star + (aiRoleOf(o.u.key) === role ? 6 : 0) - o.u.items.length * 2;
  const carry = board.slice().sort((a, b) => score(b, 'carry') - score(a, 'carry'))[0];
  const tank = board.slice().sort((a, b) => score(b, 'tank') - score(a, 'tank'))[0];
  const DEF = { acorn: 1, shell: 1, dew: 1 };
  if (!aiLv(G, P).smartItems) { for (let i = P.items.length - 1; i >= 0; i--) { if (CONSUMABLES[P.items[i]]) continue; const o = board[G.rng(board.length)]; act(G, pid, { t: 'equip', idx: i, uid: o.u.uid }); } return; }
  for (let i = P.items.length - 1; i >= 0; i--) {
    const it = P.items[i]; if (CONSUMABLES[it]) continue;
    let order;
    if (EMBLEMS[it]) order = board.filter(o => !ANIMALS[o.u.key].traits.includes(EMBLEMS[it].trait)).sort((a, b) => score(b, 'carry') - score(a, 'carry'));
    else if (MATS[it]) {
      const pair = board.find(o => o.u.items.some(x => MATS[x] && RECIPE[[x, it].sort().join('+')])); // 能合成就先合成
      const main = DEF[it] ? tank : carry;
      order = [pair && (pair === main || pair.u.items.length < CFG.MAX_ITEMS) ? pair : null, main, carry, tank].filter(Boolean).concat(board);
    } else order = [ITEMS[it] && /受到傷害|護盾|生命|護甲|閃避|免疫/.test(ITEMS[it].desc) ? tank : carry, carry, tank].concat(board);
    for (const o of order) if (act(G, pid, { t: 'equip', idx: i, uid: o.u.uid }) === 'ok') break;
  }
}
function aiPlace(G, pid) {
  const P = G.players[pid], L = aiLv(G, P);
  const inMine = k => inHalf(P.team, +k);
  // 被真人隊友移動過的棋子（pinned）留在原地；其他的先收回重新排
  for (const k in G.board) { const u = G.board[k]; if (u.owner !== pid) continue; if (u.pinned && inMine(k)) continue; delete G.board[k]; const s = P.bench.indexOf(null); if (s >= 0) P.bench[s] = u; else P.bench.push(u); }
  const plan = aiPlan(G, pid);
  const onBoard = boardCount(G, pid);
  const list = ownUnits(G, pid).filter(o => o.zone === 'bench').sort((a, b) => aiUnitValue(G, pid, b.u, plan) - aiUnitValue(G, pid, a.u, plan)).slice(0, Math.max(0, popCap(P) - onBoard));
  const free = [];
  for (let r = 0; r < CFG.ROWS_HALF; r++) for (let c = 0; c < CFG.COLS; c++) {
    const [gc, gr] = toGlobal(SIDE(P.team), c, r), k = teamCell(P.team, gr * CFG.COLS + gc);
    if (!G.board[k] && G.terrain[cellBase(k)] !== 'rock' && !P.avoidCells[k]) free.push({ k, c, r });
  }
  const mid = (CFG.COLS - 1) / 2 + 0.25;
  const centerScore = f => { const [c, r] = cellRC(f.k); return Math.abs(hexX(c, r) - mid); };
  // 先放坦克、戰士，再放輸出、刺客（後排的才知道要躲在誰後面）
  const rank = { tank: 0, fighter: 1, carry: 2, assassin: 3 };
  list.sort((a, b) => rank[aiRoleOf(a.u.key)] - rank[aiRoleOf(b.u.key)]);
  const front = CFG.ROWS_HALF - 1; // r：0 後排 … ROWS_HALF−1 最前排（本地座標）
  for (const o of list) {
    const A = ANIMALS[o.u.key], role = aiRoleOf(o.u.key);
    let spot = null;
    if (P.target) { const tp = P.target.units.find(x => x[0] === o.u.key); if (tp) spot = free.find(f => f.c === tp[2] && f.r === tp[3]) || null; } // 照玩家陣容的站位
    if (!spot && L.misplace && G.rng(100) < L.misplace && free.length) spot = free[G.rng(free.length)]; // 較弱的電腦：亂站
    // 合體技：靠近搭檔（隊友的或自己的）
    if (!spot && L.combo) for (const cb of COMBOS) {
      const partner = cb.a === o.u.key ? cb.b : cb.b === o.u.key ? cb.a : null; if (!partner) continue;
      for (const k in G.board) {
        const pu = G.board[k]; if (pu.key !== partner || G.players[pu.owner].team !== P.team || (pu.owner === pid && !G.solo)) continue;
        const [pc, pr] = cellRC(+k);
        const adj = free.filter(f => { const [fc, fr] = cellRC(f.k); return hexD(fc, fr, pc, pr) <= 1; });
        adj.sort((x, y) => (A.rng === 1 ? y.r - x.r : x.r - y.r) || centerScore(x) - centerScore(y));
        spot = adj[0]; if (spot) break;
      }
      if (spot) break;
    }
    if (!spot && G.rules.frontline && G.teams.length === 2 && (o.u.key === 'bat' || o.u.key === 'cheetah') && intruders(G, pid) < 1 && G.rng(2)) {
      const row = SIDE(P.team) === 0 ? CFG.ROWS_HALF : CFG.ROWS_HALF - 1;
      for (const c of CENTER_COLS()) { const k = teamCell(P.team, row * CFG.COLS + c); if (!G.board[k] && G.terrain[cellBase(k)] !== 'rock') { if (act(G, pid, { t: 'move', uid: o.u.uid, to: { zone: 'board', cell: k } }) === 'ok') spot = 'done'; break; } }
      if (spot === 'done') continue;
    }
    if (!spot) {
      const tScore = f => { const tt = G.terrain[f.k], hi = (G.height || {})[f.k]; let s = 0;
        if (tt === 'burn') s += 1.5; if (A.rng >= 2 && (hi || tt === 'shadow' || tt === 'tree')) s -= 1.2; if (tt === 'bounce') s += A.rng >= 2 || role === 'tank' ? 2 : -0.8; if (tt === 'water' && A.traits.includes('water')) s -= 0.8; return s; };
      // 想站的列：坦克最前、戰士第二排、輸出後排（射程越遠越後面）、刺客後排角落（開場會跳）
      const wantRow = role === 'tank' ? front : role === 'fighter' ? Math.max(0, front - 1) : role === 'assassin' ? 0 : Math.max(0, Math.min(front - 1, front - A.rng));
      const sideBias = f => role === 'assassin' ? -Math.abs(f.c - (CFG.COLS - 1) / 2) * 0.35 : role === 'carry' ? centerScore(f) * 0.25 : centerScore(f) * 0.15;
      // 輸出躲在坦克後面：同一欄前方有隊友比較好
      const covered = f => { if (role !== 'carry') return 0; for (const k in G.board) { const u = G.board[k]; if (G.players[u.owner].team !== P.team) continue; const [c, r] = cellRC(+k), [lc, lr] = toLocal(SIDE(P.team), c, r); if (Math.abs(lc - f.c) <= 1 && lr > f.r) return -0.6; } return 0; };
      const cand = free.slice().sort((a, b) => (Math.abs(a.r - wantRow) + tScore(a) + sideBias(a) + covered(a)) - (Math.abs(b.r - wantRow) + tScore(b) + sideBias(b) + covered(b)) || a.c - b.c);
      spot = cand[0];
    }
    if (!spot) break;
    free.splice(free.indexOf(spot), 1);
    act(G, pid, { t: 'move', uid: o.u.uid, to: { zone: 'board', cell: spot.k } });
  }
  compactBench(G, P);
}
// 準備階段最後幾秒：AI 隊友再看一次真人隊友的擺法（讓開被標記的位置、補位）
function aiLate(G, pid) {
  const P = G.players[pid], human = aiHumanMate(G, pid); if (!human || P.out) return;
  aiHelpMate(G, pid);
  aiPlace(G, pid); aiItems(G, pid);
}
function compactBench(G, P) {
  const extra = P.bench.slice(CFG.BENCH).filter(Boolean);
  P.bench.length = CFG.BENCH;
  for (const u of extra) {
    const s = P.bench.indexOf(null);
    if (s >= 0) P.bench[s] = u;
    else { P.gold += sellValue(u); G.pool[u.key] += Math.pow(3, u.star - 1); P.items.push(...u.items); }
  }
  for (let i = 0; i < CFG.BENCH; i++) if (P.bench[i] === undefined) P.bench[i] = null;
}

// ---- 海克斯增幅 ----
const popCap = P => Math.min(10, P.level + P.popBonus);
const rerollCost = P => P.freeRoll > 0 ? 0 : P.discount > 0 ? 1 : CFG.REROLL_COST;
function augMap(G) { const m = {}; for (const P of G.players) m[P.id] = P.augs.slice(); return m; }
function lowMap(G) { const m = {}; for (const P of G.players) m[P.id] = G.teams[P.team].hp < 40; return m; }
const augOk = (G, a) => !(a.minRound > G.round) && !(a.solo === false && G.solo); // 太強的海克斯只在後面回合出現
function offerAugments(G) {
  const idx = CFG.AUG_ROUNDS.indexOf(G.round), odds = CFG.AUG_TIER_ODDS[Math.min(idx, CFG.AUG_TIER_ODDS.length - 1)];
  let r = G.rng(100), tier = 1; for (let i = 0; i < 3; i++) { if (r < odds[i]) { tier = i + 1; break; } r -= odds[i]; }
  if (G.portal === 'prismatic' && idx === 0) tier = 3; // 傳送門「海克斯狂熱」：第一次就彩色（但仍受每個海克斯的最早回合限制）
  G.augTier = tier;
  for (const P of G.players) {
    if (P.out) continue;
    const pool = AUGMENTS.filter(a => a.tier === tier && !P.augs.includes(a.id) && augOk(G, a)).map(a => a.id);
    const pick = [];
    while (pick.length < 3 && pool.length) pick.push(pool.splice(G.rng(pool.length), 1)[0]);
    P.augChoice = pick; P.augRolled = [];
  }
}
function applyAugNow(G, P, id) {
  if (id === 'piggy') P.gold += 8;
  if (id === 'discount') P.discount = 4;
  if (id === 'ark') { G.teams[P.team].hp += 20; G.teams[P.team].ark += 2; }
  if (id === 'armsrace') { P.level = Math.min(CFG.MAX_LEVEL, P.level + 1); P.xp = 0; P.gold += 20; P.popBonus += 1; }
  if (id === 'beastgod') {
    const keys = Object.keys(ANIMALS).filter(k => ANIMALS[k].cost === 5);
    const k = keys[G.rng(keys.length)];
    if (P.bench.indexOf(null) < 0) { const w = ownUnits(G, P.id).filter(o => o.zone === 'bench').sort((a, b) => power(a.u) - power(b.u))[0]; act(G, P.id, { t: 'sell', uid: w.u.uid }); }
    const u = newUnit(G, k, 2, P.id); P.bench[P.bench.indexOf(null)] = u;
    G.log.push({ k: 'gain', pid: P.id, uid: u.uid, key: k });
  }
}

function pveOf(R) { const dc = (CFG.COLS - 7) >> 1, dr = CFG.ROWS_HALF - 4; return (PVE[R] || PVE[23]).map(([k, c, r]) => [k, c + dc, r + dr]); } // PVE 座標以 7×4 半場寫，換算到目前棋盤（置中、前排對齊）

// ===== 天氣、遭遇、選秀、掉落、消耗品、中立物件 =====
function battleFlags(G) { return { eternalnight: G.portal === 'eternalnight', bond: G.portal === 'bond', solo: !!G.solo }; }
function rollWeather(G) {
  if (!G.rules.weather) { G.weather = 'sunny'; return; }
  let list = ARENA_WEATHER[G.arena] || ['sunny'];
  if (G.portal === 'wildweather' || G.stormLeft > 0) list = list.filter(w => w !== 'sunny');
  if (G.stormLeft > 0) G.stormLeft--;
  G.weather = list[G.rng(list.length)];
}
function startEncounter(G) {
  const E = ENCOUNTERS[G.rng(ENCOUNTERS.length)];
  G.encounter = { id: E.id, round: G.round, pending: false, choice: E.choice || null };
  const mats = Object.keys(MATS), embs = Object.keys(EMBLEMS);
  for (const P of G.players) {
    if (E.id === 'merchant') P.freeRoll += 2;
    if (E.id === 'picnic') P.items.push(mats[G.rng(mats.length)]);
    if (E.id === 'zoo') { const ks = Object.keys(ANIMALS).filter(k => ANIMALS[k].cost === 2 && G.pool[k] > 0); if (ks.length && P.bench.indexOf(null) >= 0) { const k = ks[G.rng(ks.length)]; G.pool[k]--; P.bench[P.bench.indexOf(null)] = newUnit(G, k, 1, P.id); checkMerge(G, P.id); } }
    if (E.id === 'spring') addXp(P, 6);
    if (E.id === 'goldrain') P.gold += 5;
    if (E.id === 'emblemrain') P.items.push(embs[G.rng(embs.length)]);
    if (E.id === 'toolbox') P.items.push('reforge', 'remover');
  }
  if (E.id === 'migration') { const ts = Object.keys(TRAITS); G.migration = ts[G.rng(ts.length)]; for (const P of G.players) if (!P.locked) rollShop(G, P); }
  if (E.id === 'storm') { G.stormLeft = 3; rollWeather(G); }
  if (E.id === 'captain') {
    G.encounter.pending = true;
    // AI 隊長直接決定；玩家隊長要自己選
    for (const T of G.teams) if (!T.out && G.players[T.captain].ai) applyCaptain(G, G.teams.indexOf(T), E.choice[G.rng(2)]);
    G.encounter.pendingTeams = G.teams.map((T, i) => T.out || G.players[T.captain].ai ? null : i).filter(x => x !== null);
    if (!G.encounter.pendingTeams.length) G.encounter.pending = false;
  }
  G.log.push({ k: 'encounter', id: E.id, trait: G.migration });
}
function applyCaptain(G, team, choice) {
  const done = Object.keys(ITEMS);
  for (const P of G.players) if (P.team === team) { if (choice === 'gold') P.gold += 4; else P.items.push(done[G.rng(done.length)]); }
  G.log.push({ k: 'captainChoice', team, choice });
}
function resolveEncounter(G, choice) {
  const E = G.encounter; if (!E || !E.pending) return;
  for (const t of E.pendingTeams || []) applyCaptain(G, t, choice);
  E.pending = false; E.pendingTeams = [];
}
function startDraft(G) {
  const st = stageOf(G.round), maxCost = Math.min(5, Math.max(1, st)), opts = [];
  const mats = Object.keys(MATS), done = Object.keys(ITEMS), embs = Object.keys(EMBLEMS);
  for (let i = 0; i < 8; i++) {
    const ks = Object.keys(ANIMALS).filter(k => ANIMALS[k].cost <= maxCost && G.pool[k] > 0); if (!ks.length) break;
    const key = ks[G.rng(ks.length)];
    const r = G.rng(100), item = G.round < 11 ? mats[G.rng(mats.length)] : r < 25 ? embs[G.rng(embs.length)] : r < 70 ? done[G.rng(done.length)] : mats[G.rng(mats.length)];
    opts.push({ key, item, taken: false });
  }
  const order = G.players.filter(p => !p.out).sort((a, b) => (G.teams[a.team].hp - G.teams[b.team].hp) || (a.slot - b.slot) || (a.team - b.team)).map(p => p.id);
  G.draft = { options: opts, order, idx: 0 };
  G.log.push({ k: 'draft' });
}
function draftPick(G, pid, i) {
  const D = G.draft; if (!D) return 'bad';
  if (D.order[D.idx] !== pid) return 'not_turn';
  let o = D.options[i];
  if (!o || o.taken) { o = D.options.find(x => !x.taken); if (!o) { G.draft = null; return 'bad'; } }
  o.taken = pid; const P = G.players[pid];
  if (G.pool[o.key] > 0) {
    G.pool[o.key]--;
    const slot = P.bench.indexOf(null);
    if (slot >= 0) { P.bench[slot] = newUnit(G, o.key, 1, pid); } else P.gold += ANIMALS[o.key].cost;
  }
  P.items.push(o.item);
  G.log.push({ k: 'drafted', pid, key: o.key, item: o.item });
  checkMerge(G, pid);
  D.idx++;
  if (D.idx >= D.order.length) G.draft = null;
  return 'ok';
}
function aiDraftTurns(G) {
  while (G.draft && G.players[G.draft.order[G.draft.idx]].ai) {
    const pid = G.draft.order[G.draft.idx], own = {};
    for (const o of ownUnits(G, pid)) own[o.u.key] = (own[o.u.key] || 0) + 1;
    let best = 0, bs = -1;
    G.draft.options.forEach((o, i) => { if (o.taken) return; const sc = ANIMALS[o.key].cost * 10 + (own[o.key] || 0) * 15 + (ITEMS[o.item] ? 8 : 0) + G.rng(5); if (sc > bs) { bs = sc; best = i; } });
    draftPick(G, pid, best);
  }
}
function rollLoot(G, R) {
  if (R <= 3) return [{ type: 'mat', k: Object.keys(MATS)[G.rng(6)] }].concat(R === 3 ? [{ type: 'gold', n: 2 }] : []);
  const out = [], st = stageOf(R);
  for (let i = 0; i < 2; i++) {
    const r = G.rng(100);
    if (r < 25) out.push({ type: 'gold', n: 3 + G.rng(3) });
    else if (r < 55) out.push({ type: 'mat', k: Object.keys(MATS)[G.rng(6)] });
    else if (r < 75) { const ks = Object.keys(ANIMALS).filter(k => ANIMALS[k].cost <= Math.min(5, st) && G.pool[k] > 0); if (ks.length) out.push({ type: 'unit', k: ks[G.rng(ks.length)] }); else out.push({ type: 'gold', n: 3 }); }
    else if (r < 90 || R < 13) { const cs = Object.keys(CONSUMABLES); out.push({ type: 'item', k: cs[G.rng(cs.length)] }); }
    else { const es = Object.keys(EMBLEMS); out.push({ type: 'item', k: es[G.rng(es.length)] }); }
  }
  return out;
}
function giveLoot(G, P, d) {
  if (d.type === 'gold') P.gold += d.n;
  else if (d.type === 'mat' || d.type === 'item') P.items.push(d.k);
  else if (d.type === 'unit') {
    if (G.pool[d.k] > 0 && P.bench.indexOf(null) >= 0) { G.pool[d.k]--; P.bench[P.bench.indexOf(null)] = newUnit(G, d.k, 1, P.id); checkMerge(G, P.id); }
    else { d = { type: 'gold', n: ANIMALS[d.k].cost }; P.gold += d.n; }
  }
  G.log.push({ k: 'loot', pid: P.id, d });
}
function useConsumable(G, P, idx, tgt) {
  const it = P.items[idx], u = tgt.u;
  if (it === 'remover') { if (!u.items.length) return 'no_items'; P.items.push(...u.items); u.items = []; }
  else if (it === 'reforge') {
    if (!u.items.length) return 'no_items';
    const mats = Object.keys(MATS), done = Object.keys(ITEMS), embs = Object.keys(EMBLEMS);
    u.items = u.items.map(x => { const pool = MATS[x] ? mats : EMBLEMS[x] ? embs.filter(e => !ANIMALS[u.key].traits.includes(EMBLEMS[e].trait)) : done; const c = pool.filter(y => y !== x); return c.length ? c[G.rng(c.length)] : x; });
  } else if (it === 'dupe') {
    if (G.pool[u.key] <= 0) return 'pool_empty';
    const slot = P.bench.indexOf(null); if (slot < 0) return 'bench_full';
    G.pool[u.key]--; P.bench[slot] = newUnit(G, u.key, 1, P.id);
  } else return 'bad';
  P.items.splice(P.items.indexOf(it), 1);
  G.log.push({ k: 'consume', pid: P.id, item: it, uid: u.uid });
  if (it === 'dupe') checkMerge(G, P.id);
  return 'ok';
}
function rollNeutrals(G, units) {
  if (!G.rules.neutrals) return [];
  const st = stageOf(G.round), out = [], occ = {};
  for (const u of units || []) occ[u.r * CFG.COLS + u.c] = 1;
  const free = (c, r) => !occ[r * CFG.COLS + c] && G.terrain[r * CFG.COLS + c] !== 'rock';
  // 中線寶箱：放在雙方前排之一（隨機），兩隊都有機會打到
  const cols = [3, 2, 4, 1, 5, 0, 6];
  const row = G.rng(2) ? CFG.ROWS_HALF - 1 : CFG.ROWS_HALF;
  for (const c of cols) if (free(c, row)) { out.push({ key: 'chest', c, r: row, hp: 350 + st * 120 }); break; }
  // 木箱：雙方對稱各一個
  for (let tries = 0; tries < 20; tries++) {
    const c = G.rng(CFG.COLS), r = 1 + G.rng(2), [c2, r2] = toGlobal(1, c, r);
    if (free(c, r) && free(c2, r2)) { out.push({ key: 'crate', c, r, hp: 200 + st * 60 }, { key: 'crate', c: c2, r: r2, hp: 200 + st * 60 }); break; }
  }
  return out;
}
