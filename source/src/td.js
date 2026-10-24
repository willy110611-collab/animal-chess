// ===== 新模式：潮線守衛（塔防，單人，章節通關）=====
// 規則：敵人從對面不斷補上來往我方底線走；我方棋子守位置不追。
//   前線＝能擺棋子的排數（從底線算起）。一波沒漏怪→前線往前推 1 排；有漏怪→後退 1 排（漏很多退 2 排），退到 0 排就輸。
//   收編：敵人在「收編線」（我方前線前一排以內）被打倒，有機率變成你的棋子（沒有商店，敵人就是你的商店）。
//   退潮（準備）時可以提早開打，剩餘秒數換金幣。
// 可調參數都在 TD_CFG 與 TD_LEVELS。
const TD_CFG = {
  START_FRONT: 3,     // 開局前線排數（最多 5）
  MAX_FRONT: 5,
  PREP_SEC: 20,       // 每波之間的準備秒數
  EARLY_GOLD_SEC: 5,  // 提早開打：每剩幾秒換 1 金
  EARLY_GOLD_MAX: 3,
  WAVE_GOLD: 4,       // 每波基本收入
  PERFECT_GOLD: 2,    // 沒漏怪的獎勵
  CAPTURE: 35,        // 收編機率（%）
  TIDE_COUNT: 1.6,    // 大潮時敵人數量倍率（收編機率 ×2）
  CAPTURE_ROW: 1,     // 收編線：前線往前幾排內打倒都算
  HOLD_LEAK: 2,       // 一波漏這麼多隻以內：前線不動（0 隻才會往前推）
  BIG_LEAK: 6,        // 一波漏幾隻以上前線退 2 排
  WAVE_MUL_STEP: 6,   // 每過一波敵人變強幾 %
  ENGAGE: 3,          // 敵人離我方棋子幾格內會被吸引過來打（超過就繞路往底線走；飛行的不停）
  LEASH: 2,           // 我方近戰棋子會往前追幾格（遠程不動）
  WAVE_MAX_SEC: 70,   // 一波最長秒數，時間到還沒打完的都算漏
  START_LEVEL: 3,     // 開局等級（＝可上場數量）
  SHOP_SIZE: 3,       // 退潮小商店格數（只賣這關出現過的敵人）
  REROLL: 1,          // 小商店刷新費用
};
// 關卡：waves 每波是 [動物, 星級, 數量, 間隔秒, 開始秒]；mul＝敵人血量與攻擊倍率（%）
const TD_LEVELS = [
  { id: '1-1', name: '沙丘試煉', desc: '教學：擺好棋子守住底線，打倒靠近的敵人有機會收編。', arena: 'desert', start: ['wolf', 'hedgehog', 'squirrel'], gold: 2, mul: 45,
    waves: [[['squirrel', 1, 3, 1.6, 0]], [['hedgehog', 1, 4, 1.4, 0]], [['squirrel', 1, 3, 1.2, 0], ['hedgehog', 1, 2, 1.5, 2]], [['wolf', 1, 4, 1.2, 0]], [['wolf', 1, 3, 1.0, 0], ['hedgehog', 1, 3, 1.2, 1], ['squirrel', 1, 2, 1, 4]]] },
  { id: '1-2', name: '蝙蝠夜襲', desc: '飛行的敵人不會停下來打，會直接飛過前排，要靠遠程攔下。', arena: 'desert', start: ['frog', 'squirrel', 'wolf'], gold: 3, mul: 36,
    waves: [[['bat', 1, 3, 1.6, 0]], [['wolf', 1, 3, 1.2, 0], ['bat', 1, 2, 1.5, 2]], [['bee', 1, 4, 1.0, 0]], [['bat', 1, 3, 1.0, 0], ['bee', 1, 3, 1.0, 1]], [['wolf', 1, 4, 1.0, 0], ['bat', 1, 3, 1.0, 2], ['bee', 1, 3, 1.0, 3]], [['bat', 2, 2, 1.5, 0], ['bee', 1, 4, 0.8, 1]]] },
  { id: '1-3', name: '犀牛衝鋒', desc: '坦克型敵人很耐打，會把前排撞開，要集中火力。', arena: 'desert', start: ['hedgehog', 'frog', 'redpanda'], gold: 3, mul: 46,
    waves: [[['rhino', 1, 2, 3, 0]], [['croc', 1, 3, 2, 0], ['squirrel', 1, 3, 1, 1]], [['rhino', 1, 3, 2, 0], ['bat', 1, 2, 1.5, 2]], [['croc', 1, 3, 1.5, 0], ['rhino', 1, 2, 2, 2]], [['rhino', 2, 2, 3, 0], ['wolf', 1, 4, 1, 1]], [['rhino', 1, 4, 1.5, 0], ['croc', 1, 3, 1.5, 1], ['bee', 1, 3, 1, 3]]] },
  { id: '1-4', name: '大潮', desc: '每兩波來一次大潮：敵人變多，但收編機率加倍。', arena: 'desert', start: ['frog', 'wolf', 'penguin'], gold: 4, mul: 32, tide: true,
    waves: [[['penguin', 1, 3, 1.2, 0]], [['penguin', 1, 3, 1, 0], ['croc', 1, 2, 1.5, 1]], [['wolf', 1, 4, 1, 0], ['bat', 1, 2, 1.2, 2]], [['croc', 1, 3, 1.2, 0], ['penguin', 1, 3, 1, 1]], [['rhino', 1, 2, 2, 0], ['bee', 1, 3, 1, 1]], [['penguin', 2, 2, 1.5, 0], ['croc', 1, 3, 1.2, 1]], [['wolf', 2, 2, 1.5, 0], ['bat', 1, 4, 0.9, 1]], [['rhino', 2, 2, 2, 0], ['penguin', 1, 4, 1, 1], ['bee', 1, 3, 1, 3]]] },
  { id: '1-5', name: '野豬王', desc: '魔王帶著小兵來了。魔王不能收編，但打倒牠就通關。', arena: 'desert', start: ['wolf', 'frog', 'hedgehog'], gold: 5, mul: 52,
    waves: [[['boar', 1, 4, 1.2, 0]], [['boar', 1, 3, 1, 0], ['bat', 1, 2, 1.2, 1]], [['rhino', 1, 2, 2, 0], ['boar', 1, 3, 1, 1]], [['croc', 1, 3, 1.2, 0], ['bee', 1, 3, 1, 1]], [['boar', 2, 3, 1.2, 0], ['penguin', 1, 3, 1, 1]], [['wolf', 2, 3, 1, 0], ['bat', 2, 2, 1.5, 2]], [['rhino', 2, 2, 2, 0], ['croc', 1, 3, 1, 1]], [['kingboar', 1, 1, 1, 0], ['boar', 1, 6, 1.4, 1]]] },
];
const TD_BOSS = { kingboar: 1 };
const tdProfile = () => { if (!PROFILE.td || typeof PROFILE.td !== 'object') PROFILE.td = { best: {} }; if (!PROFILE.td.best) PROFILE.td.best = {}; return PROFILE.td; };

// ---- 關卡選單 ----
function openTd() {
  const T = tdProfile();
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>潮線守衛</h2><p class="tdhint">敵人會一直從對面湧來。守住每一波，前線就往前推；漏怪前線就後退。打倒靠近的敵人有機會收編成自己的棋子。</p>
    <h3>第一章　沙丘</h3><div class="tdlv">${TD_LEVELS.map((L, i) => { const open = i === 0 || T.best[TD_LEVELS[i - 1].id]; const st = T.best[L.id] || 0;
      return `<button class="btn tdl ${open ? '' : 'lock'}" data-td="${i}" ${open ? '' : 'disabled'}><b>${L.id}　${L.name}</b><small>${open ? L.desc : '通關上一關後開啟'}</small><i>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</i></button>`; }).join('')}</div>`;
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; };
  $('panel').querySelectorAll('[data-td]').forEach(b => b.onclick = () => { $('overlay').hidden = true; tdStart(+b.dataset.td); });
}

// ---- 開局 ----
function tdStart(li) {
  const L = TD_LEVELS[li]; if (!L) return;
  ME = 0; netReset(); newGame(2, true);
  G.rules.augments = false; G.rules.encounters = false; G.rules.carousel = false; G.encounter = null; G.portal = null; G.portalVote = null; G.draft = null;
  const t = myTeam(), P = G.players[ME];
  for (const k in G.board) delete G.board[k];
  for (const Q of G.players) { Q.bench = Q.bench.map(() => null); if (Q.id !== ME) { Q.ai = false; Q.out = false; } Q.augChoice = null; }
  P.gold = L.gold; P.level = TD_CFG.START_LEVEL; P.xp = 0; P.shop = []; P.ready = false; P.items = [];
  if (ARENAS[L.arena]) G.arena = L.arena;
  G.terrain = {}; G.height = {}; G.weather = 'sunny';
  // 起始棋子放在底線前一排
  L.start.forEach((key, i) => { const u = newUnit(G, key, 1, ME); const cell = tdCell(t, 3 + i, 1); if (cell >= 0) G.board[cell] = u; else P.bench[i] = u; });
  G.td = { li, wave: 0, front: TD_CFG.START_FRONT, leaks: 0, totalLeaks: 0, captured: 0, state: 'prep' };
  G.phase = 'prep'; G.timer = TD_CFG.PREP_SEC * 1000; G.round = 1;
  P.locked = false; tdRollShop(G, P);
  $('game').classList.add('td');
  lastPhase = ''; // 讓 onPhase 跑一次
  tdPanel();
}
// 我方半場第 (lc, lr) 格的棋盤格號（lr：0＝底線）
function tdCell(team, lc, lr) { const [c, r] = toGlobal(SIDE(team), lc, lr); return teamCell(team, r * CFG.COLS + c); }
function tdRowOf(team, cell) { const [c, r] = cellRC(cell); return toLocal(SIDE(team), c, r)[1]; }
function tdCanPlace(G, cell) { return !G.td || tdRowOf(myTeam(), cell) < G.td.front; }

// ---- 每幀（取代一般的 update）----
function tdUpdate(G, dt) {
  const D = G.td, P = G.players[ME];
  if (D.state === 'over') return;
  if (G.phase === 'prep') {
    if (!G.paused) G.timer -= dt;
    const sec = Math.ceil(G.timer / 1000); if (sec !== D.lastSec) { D.lastSec = sec; tdPanel(); }
    if (G.timer <= 0 || P.ready) tdStartWave(G);
    return;
  }
  if (G.phase !== 'combat') return;
  const bt = G.battles[0], B = bt.B;
  G.acc += dt * (G.speed || 1);
  while (G.acc >= CFG.TICK_MS) {
    G.acc -= CFG.TICK_MS;
    // 補兵：敵人一直從對面最後一排冒出來
    while (D.q.length && D.q[0].t <= B.t) { const s = D.q.shift(); tdSpawn(B, s); }
    step(B);
    tdCheck(G, B);
    const left = B.units.some(u => u.alive && u.team === 1);
    if ((!D.q.length && !left) || B.t >= TD_CFG.WAVE_MAX_SEC * 1000 / CFG.TICK_MS) { tdEndWave(G, B); return; }
  }
}
function tdSpawn(B, s) {
  const cols = [4, 3, 5, 2, 6, 1, 7, 0, 8].sort(() => Math.random() - 0.5);
  for (const rr of [CFG.ROWS - 1, CFG.ROWS - 2]) for (const c of cols) {
    if (B.grid[idx(c, rr)] !== -1 || B.terrain[idx(c, rr)] === 'rock') continue;
    const u = spawn(B, s.key, s.star, -1, 1, c, rr, [], false); u.target = -1;
    if (s.mul) { u.maxhp = u.hp = Math.floor(u.maxhp * s.mul / 100); u.atk = Math.floor(u.atk * s.mul / 100); }
    if (TD_BOSS[s.key]) u.tdBoss = true;
    B.ev.push({ k: 'tdspawn', id: u.id });
    return u;
  }
  s.t = B.t + 5; G.td.q.push(s); G.td.q.sort((a, b) => a.t - b.t); // 出生點被擋住：晚一點再試
}
// 漏怪與收編
function tdCheck(G, B) {
  const D = G.td;
  for (const u of B.units) {
    if (u.team !== 1 || u._td) continue;
    if (u.alive && u.r === 0) { // 走到我方底線＝漏掉
      u._td = 'leak'; u.alive = false; u.hp = 0; B.grid[idx(u.c, u.r)] = -1; D.leaks++;
      B.ev.push({ k: 'tdleak', id: u.id });
    } else if (!u.alive) {
      u._td = 'dead';
      if (!u.tdBoss && !u.summon && u.r <= D.front - 1 + TD_CFG.CAPTURE_ROW && ANIMALS[u.key]) {
        const ch = TD_CFG.CAPTURE * (D.tide ? 2 : 1);
        if (Math.random() * 100 < ch) B.ev.push({ k: 'tdcap', id: u.id, key: u.key, star: u.star });
      }
    }
  }
}
function tdStartWave(G) {
  const D = G.td, L = TD_LEVELS[D.li], P = G.players[ME], t = myTeam();
  const early = Math.min(TD_CFG.EARLY_GOLD_MAX, Math.floor(Math.max(0, G.timer) / 1000 / TD_CFG.EARLY_GOLD_SEC));
  if (early > 0) { P.gold += early; toast(`提早開打 +${early} 金`, 1400); }
  P.ready = false;
  D.tide = !!(L.tide && D.wave % 2 === 1);
  const wave = L.waves[D.wave], q = [], mul = L.mul + D.wave * TD_CFG.WAVE_MUL_STEP;
  for (const [key, star, n, gap, st] of wave) for (let i = 0; i < Math.round(n * (D.tide ? TD_CFG.TIDE_COUNT : 1)); i++) q.push({ key, star, mul, t: Math.round((st + i * gap / (D.tide ? 1.6 : 1)) * 1000 / CFG.TICK_MS) });
  q.sort((a, b) => a.t - b.t); D.q = q; D.leaks = 0; D.spawnTotal = q.length;
  const units = battleUnitsForTeam(G, t, 0);
  const B = createBattle({ seed: (Date.now() & 0xffff), terrain: {}, height: {}, units, pve: true, aug: {}, low: {}, flags: {}, weather: G.weather });
  B.td = { engage: TD_CFG.ENGAGE, leash: TD_CFG.LEASH };
  G.battles = [{ B, teams: [t, 1 - t], input: null, td: true }];
  G.acc = 0; G.phase = 'combat'; D.state = 'combat';
}
function tdEndWave(G, B) {
  const D = G.td, L = TD_LEVELS[D.li], P = G.players[ME];
  for (const u of B.units) if (u.team === 1 && u.alive) { u.alive = false; D.leaks++; } // 時間到還在場上的也算漏
  D.leaks += D.q.length; D.q = [];
  D.totalLeaks += D.leaks;
  const before = D.front;
  if (D.leaks === 0) D.front = Math.min(TD_CFG.MAX_FRONT, D.front + 1);
  else if (D.leaks > TD_CFG.HOLD_LEAK) D.front -= D.leaks >= TD_CFG.BIG_LEAK ? 2 : 1;
  const gold = TD_CFG.WAVE_GOLD + Math.floor(D.wave / 2) + (D.leaks === 0 ? TD_CFG.PERFECT_GOLD : 0);
  P.gold += gold; D.lastMsg = { leaks: D.leaks, gold, front: D.front, moved: D.front - before };
  D.wave++;
  G.battles = []; G.phase = 'prep'; D.state = 'prep'; G.timer = TD_CFG.PREP_SEC * 1000; G.round++;
  if (!P.locked) tdRollShop(G, P); P.locked = false;
  if (D.front <= 0) { tdOver(G, false); return; }
  if (D.wave >= L.waves.length) { tdOver(G, true); return; }
  // 前線後退：被擠出去的棋子回備戰席（滿了就留在最後一排的空位）
  if (D.front < before) {
    const t = myTeam();
    for (const k of Object.keys(G.board)) { const u = G.board[k]; if (u.owner !== ME || tdRowOf(t, +k) < D.front) continue;
      const sl = P.bench.indexOf(null); delete G.board[k]; if (sl >= 0) P.bench[sl] = u; else { const free = tdFreeCell(G, t); if (free >= 0) G.board[free] = u; else P.gold += ANIMALS[u.key] ? ANIMALS[u.key].cost : 1; } }
  }
}
function tdFreeCell(G, t) { for (let lr = 0; lr < G.td.front; lr++) for (let lc = 0; lc < CFG.COLS; lc++) { const c = tdCell(t, lc, lr); if (!G.board[c]) return c; } return -1; }
function tdOver(G, win) {
  const D = G.td, L = TD_LEVELS[D.li];
  D.state = 'over'; D.win = win;
  const stars = win ? (D.front >= TD_CFG.MAX_FRONT ? 3 : D.front >= 4 ? 2 : 1) : 0;
  D.stars = stars;
  if (win) { const T = tdProfile(); T.best[L.id] = Math.max(T.best[L.id] || 0, stars); saveProfile(); }
  setTimeout(() => tdOverModal(), 900);
}
function tdOverModal() {
  const D = G && G.td; if (!D) return; const L = TD_LEVELS[D.li], next = TD_LEVELS[D.li + 1];
  sfx(D.win ? 'win' : 'lose');
  $('panel').innerHTML = `<h2>${D.win ? '守住了！' : '防線失守'}</h2><div class="tdover"><div class="tdstars">${D.win ? '★'.repeat(D.stars) + '☆'.repeat(3 - D.stars) : ''}</div>
    <p>${L.id} ${L.name}・撐過 ${D.wave} 波・最後前線 ${Math.max(0, D.front)} 排・收編 ${D.captured} 隻・漏怪 ${D.totalLeaks} 隻</p>
    ${D.win ? '<p class="tdsmall">三星條件：最後前線推到 5 排</p>' : ''}</div>
    <div class="row2"><button class="btn" id="tdAgain">再玩一次</button>${D.win && next ? '<button class="btn primary" id="tdNext">下一關</button>' : ''}<button class="btn" id="tdLobby">回大廳</button></div>`;
  $('overlay').hidden = false;
  $('tdAgain').onclick = () => { $('overlay').hidden = true; tdStart(D.li); };
  if ($('tdNext')) $('tdNext').onclick = () => { $('overlay').hidden = true; tdStart(D.li + 1); };
  $('tdLobby').onclick = () => { tdLeave(); };
}
function tdLeave() { $('game').classList.remove('td'); tdFrontMesh(null); leaveToLobby(); }

// 小商店：只賣這一關到下一波為止出現過的動物（含起始棋子），每波免費換一次
function tdRollShop(G, P) {
  const D = G.td, L = TD_LEVELS[D.li], keys = new Set(L.start);
  for (let w = 0; w <= Math.min(D.wave, L.waves.length - 1); w++) for (const g of L.waves[w]) if (ANIMALS[g[0]]) keys.add(g[0]);
  const list = [...keys].filter(k => (G.pool[k] || 0) > 0);
  P.shop = []; for (let i = 0; i < TD_CFG.SHOP_SIZE; i++) P.shop.push(list.length ? list[Math.floor(Math.random() * list.length)] : null);
}
// ---- 畫面 ----
// 階段切換（由 onPhase 呼叫；回傳 true 表示已處理）
function tdOnPhase(ph) {
  const D = G.td; if (!D) return false;
  if (ph === 'prep') {
    waitChip(0); cv = null; WATCH = -1; MYB = null; sel = null; S3.nightTarget = 0;
    for (const k in S3.V) if (k[0] === 'b') s3Remove(k);
    processLog(); renderPrep();
    if (D.state === 'over') { tdPanel(); tdFrontMesh(D.front); return true; }
    const L = TD_LEVELS[D.li], m = D.lastMsg;
    banner(`${L.id}　第 ${D.wave + 1}/${L.waves.length} 波`, m ? (m.leaks ? `漏了 ${m.leaks} 隻・${m.moved < 0 ? '前線後退' + (m.moved < -1 ? ' 2 排' : '') : '前線守住'}` : '完美防守・前線往前推！') + `　+${m.gold} 金` : L.desc);
    if (m && m.moved > 0) sfx('chime'); if (m && m.moved < 0) sfx('sting');
  } else if (ph === 'combat') {
    startCombatView(); sfx('horn');
    banner(D.tide ? '大潮來襲！' : `第 ${D.wave + 1} 波來襲`, D.tide ? '敵人加倍・收編機率加倍' : '守住底線！');
  }
  tdPanel(); tdFrontMesh(D.front);
  return true;
}
// 戰鬥事件：漏怪、收編、補兵
function tdEvent(B, ev) {
  if (!G || !G.td) return;
  const D = G.td, P = G.players[ME];
  if (ev.k === 'tdleak') { sfx('leak', 120); screenFlash('rgba(255,60,40,.35)'); tdPanel(); }
  else if (ev.k === 'tdcap') {
    const sl = P.bench.indexOf(null), A = ANIMALS[ev.key];
    if (sl >= 0) { P.bench[sl] = newUnit(G, ev.key, 1, ME); D.captured++; checkMerge(G, ME); toast(`收編了 ${A.name}！`, 1500); sfx('capture'); }
    else { P.gold += 1; toast(`備戰席滿了，${A.name} 換成 1 金`, 1500); }
    const v = S3.V['b' + ev.id]; if (v) { const p = v.pos.clone().add(V3(0, 0.6, 0)); sprite('ring', p, { color: 0xffe27a, scale: 0.3, scale1: 1.4, life: 0.6, add: true }); burst(p, 10, { tex: 'spark', color: 0xffd34d, scale: 0.12, add: true, speed: 2 }); }
    renderDock(); tdPanel();
  } else if (ev.k === 'tdspawn') { const v = S3.V['b' + ev.id]; if (v) v.pop = nowS(); }
}
// 下方面板：波次、前線、下一波敵人
function tdPanel() {
  if (!G || !G.td || typeof document === 'undefined') return; const D = G.td, L = TD_LEVELS[D.li];
  let el = $('tdPanel'); if (!el) { el = document.createElement('div'); el.id = 'tdPanel'; $('dock').prepend(el); }
  const w = L.waves[Math.min(D.wave, L.waves.length - 1)], keys = [...new Set(w.map(x => x[0]))];
  const left = G.phase === 'combat' && G.battles[0] ? (D.q.length + G.battles[0].B.units.filter(u => u.team === 1 && u.alive).length) : 0;
  const showGo = G.phase === 'prep' && D.state === 'prep';
  const html = `<div class="tdw"><b>${L.id} ${L.name}</b><span>第 ${Math.min(D.wave + 1, L.waves.length)}/${L.waves.length} 波${D.tide ? '・大潮' : ''}</span></div>
    <div class="tdf"><span>前線</span>${Array.from({ length: TD_CFG.MAX_FRONT }, (_, i) => `<i class="${i < D.front ? 'on' : ''}"></i>`).join('')}<small>${G.phase === 'combat' ? `剩 ${left} 隻・漏 ${D.leaks}` : '守住不漏怪就往前推'}</small></div>
    <div class="tdn"><span>${G.phase === 'combat' ? '這一波' : '下一波'}</span>${keys.map(k => `<img src="${PORT[k] || ''}" alt="" title="${(ANIMALS[k] || EXTRA[k] || {}).name || k}">`).join('')}<small>收編 ${D.captured}</small></div>
    ${showGo ? '<button class="btn primary tdgo" id="tdGo">開始這一波 ▶<small id="tdGoT"></small></button>' : ''}`;
  if (el._h !== html) { el._h = html; el.innerHTML = html; const go = $('tdGo'); if (go) go.onclick = () => { G.players[ME].ready = true; sfx('ready'); }; }
  const gt = $('tdGoT'); if (gt) { const sec = Math.max(0, G.timer) / 1000; gt.textContent = `${Math.ceil(sec)} 秒・提早開打 +${Math.min(TD_CFG.EARLY_GOLD_MAX, Math.floor(sec / TD_CFG.EARLY_GOLD_SEC))} 金`; }
}
// 前線外（還不能擺）的格子蓋一層紅色
function tdFrontMesh(front) {
  if (S3.tdFront) { S3.scene.remove(S3.tdFront); disposeObj(S3.tdFront); S3.tdFront = null; }
  if (front === null || front === undefined || !G || !G.td) return;
  const t = myTeam(), g = new THREE.Group(), geo = new THREE.CircleGeometry(0.47, 6), mat = new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.22, depthWrite: false });
  for (let lr = front; lr < CFG.ROWS_HALF; lr++) for (let lc = 0; lc < CFG.COLS; lc++) {
    const [x, z] = worldOfCell(tdCell(t, lc, lr), SIDE(t)); const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI / 6; m.position.set(x, 0.05 + groundH(x, z), z); g.add(m);
  }
  // 前線那條線
  const [x0, z0] = worldOfCell(tdCell(t, 0, Math.max(0, front - 1)), SIDE(t)), [x1] = worldOfCell(tdCell(t, CFG.COLS - 1, Math.max(0, front - 1)), SIDE(t)), [, z1] = worldOfCell(tdCell(t, 0, Math.min(CFG.ROWS_HALF - 1, front)), SIDE(t));
  const zl = front >= CFG.ROWS_HALF ? z0 + (z0 - worldOfCell(tdCell(t, 0, front - 2), SIDE(t))[1]) / 2 : (z0 + z1) / 2;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(x1 - x0) + 1.2, 0.08), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, depthWrite: false }));
  line.rotation.x = -Math.PI / 2; line.position.set((x0 + x1) / 2, 0.07, zl); g.add(line);
  S3.scene.add(g); S3.tdFront = g;
}
