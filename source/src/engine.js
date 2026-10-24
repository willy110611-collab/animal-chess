// ===== 戰鬥引擎：決定性整數模擬（同種子同結果，四台手機各自跑） =====
function makeRng(seed) {
  let a = seed >>> 0;
  const f = function (n) { // 回傳 0..n-1 整數
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) % n);
  };
  f.get = () => a; f.set = v => { a = v | 0; }; // 換房主時接續亂數狀態
  return f;
}
const SKILL_MUL = [0, 100, 150, 225];
const idx = (c, r) => r * CFG.COLS + c;
const inB = (c, r) => c >= 0 && c < CFG.COLS && r >= 0 && r < CFG.ROWS;
// ===== 六角格（odd-r：奇數列往右半格）。棋盤 CFG.COLS×CFG.ROWS（目前 9×10），以棋盤中心點對稱 =====
const hexD = (c1, r1, c2, r2) => { const q1 = c1 - ((r1 - (r1 & 1)) >> 1), q2 = c2 - ((r2 - (r2 & 1)) >> 1), dq = q1 - q2, dr = r1 - r2; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
const hexX = (c, r) => c + ((r & 1) ? 0.5 : 0); // 橫向實際位置（算「欄」範圍用）
const NB_EVEN = [[0, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [-1, -1]], NB_ODD = [[1, 1], [0, 1], [1, 0], [-1, 0], [1, -1], [0, -1]];
function hexNb(c, r, team) { // 鄰格順序：往前優先；對面隊伍用鏡像順序，雙方尋路偏好完全對稱
  if (team === 1) { const mc = CFG.COLS - 1 - c, mr = CFG.ROWS - 1 - r; return ((mr & 1) ? NB_ODD : NB_EVEN).map(([dc, dr]) => [CFG.COLS - 1 - (mc + dc), CFG.ROWS - 1 - (mr + dr)]); }
  return ((r & 1) ? NB_ODD : NB_EVEN).map(([dc, dr]) => [c + dc, r + dr]);
}
const dist = (a, b) => hexD(a.c, a.r, b.c, b.r);
const statOf = key => ANIMALS[key] || EXTRA[key];
const hasTrait = (u, t) => u.traits.indexOf(t) >= 0;

// input: { seed, terrain: {cellIdx:type}, units:[{key,star,owner,team,c,r,items}] }  (c,r 為全場座標，team0 在 r0-3)
function createBattle(input) {
  const B = {
    t: 0, rng: makeRng(input.seed), units: [], grid: new Array(CFG.COLS * CFG.ROWS).fill(-1),
    terrain: Object.assign({}, input.terrain || {}), temp: [], zones: [], ev: [], night: false,
    over: false, winner: -1, combos: [], nextId: 0, pve: !!input.pve,
    aug: input.aug || {}, low: input.low || {}, kills: {}, deaths: {}, bigKill: {}, revives: [], necroUsed: {},
    flags: input.flags || {}, weather: input.weather || 'sunny', cmdUsed: {}, loot: [],
    height: Object.assign({}, input.height || {}), landings: [],
  };
  for (const s of input.units) {
    let c = s.c, r = s.r;
    if (B.grid[idx(c, r)] !== -1 || B.terrain[idx(c, r)] === 'rock') { const f = freeNear(B, c, r, null); if (!f) continue; c = f[0]; r = f[1]; } // 前線爭奪等情況撞格時往旁邊挪
    const nu = spawn(B, s.key, s.star, s.owner, s.team, c, r, s.items || [], false); nu.uid = s.uid;
    if (s.mul) { nu.maxhp = Math.floor(nu.maxhp * s.mul / 100); nu.atk = Math.floor(nu.atk * s.mul / 100); } // 魔王依回合變強
  }
  for (const n of input.neutrals || []) if (B.grid[idx(n.c, n.r)] === -1 && B.terrain[idx(n.c, n.r)] !== 'rock') { const x = spawn(B, n.key, 1, -2, 2, n.c, n.r, [], false); x.maxhp = x.hp = n.hp || x.maxhp; }
  applyTraits(B);
  for (const u of B.units) {
    const tt = B.terrain[idx(u.c, u.r)];
    if (tt === 'grass') { u.stealth = true; u.firstHit = true; }
    if (u.waterShieldPct) u.shield += Math.floor(u.maxhp * u.waterShieldPct * (tt === 'water' ? 2 : 1) / 100);
    if (u.key === 'koala') u.asleep = true;
    if (u.key === 'chameleon') { u.stealth = true; u.firstHit = true; }
  }
  // 天氣、物品開場效果、進化光環
  for (const u of B.units) {
    if (u.neutral) continue;
    if ((B.weather === 'fog' || B.weather === 'sand') && u.rng >= 2) u.rng = Math.max(1, u.rng - 1);
    if (B.weather === 'fog') u.stealth = true;
    if (B.weather === 'sand' && hasTrait(u, 'sky')) u.dodge = Math.max(0, u.dodge - 10);
    for (const a of B.units) if (a !== u && a.alive && a.team === u.team && !a.neutral && dist(a, u) <= 1) {
      if (u.conch) a.arm += 20;
      if (u.moondew) a.mr += 20;
      if (u.evo) a.asPct += 10;
    }
  }
  if (B.flags.eternalnight) B.night = true;
  augStart(B);
  findCombos(B);
  return B;
}

function spawn(B, key, star, owner, team, c, r, items, summon) {
  const s = statOf(key), m = CFG.STAR_MUL[star];
  const u = {
    id: B.nextId++, key, star, owner, team, c, r, summon, alive: true,
    traits: s.traits.slice(), maxhp: Math.floor(s.hp * m / 100), atk: Math.floor(s.atk * m / 100),
    ai: s.ai, rng: s.rng, arm: s.arm, mr: s.mr, manaMax: s.mana, mana: s.sm, mv: s.mv,
    asPct: 0, atkPct: 0, baseDr: 0, shield: 0, dodge: 0, crit: 0, nightCrit: 0, regenPct: 0, packPct: 0,
    buffs: [], dots: [], target: -1, nextAtk: 0, mvFrom: null, busy: 0, stun: 0, invuln: 0, blind: 0,
    tauntBy: -1, tauntUntil: 0, stealth: false, firstHit: false, castCount: 0, items: items.slice(),
    lifesteal: key === 'bat' ? 20 : 0, sameHits: 0, lastTgt: -1, asleep: false, slept: 0,
    ccImmune: 0, fang: false, honeypot: false, skillAmp: false, toxicUntil: 0, dmgDone: 0, waterShieldPct: 0,
  };
  for (const it of items) {
    const d = MATS[it] || ITEMS[it] || EMBLEMS[it]; if (!d) continue;
    if (EMBLEMS[it] && u.traits.indexOf(EMBLEMS[it].trait) < 0) u.traits.push(EMBLEMS[it].trait);
    const st = d.stat;
    if (st.atk) u.atk += st.atk; if (st.hp) u.maxhp += st.hp; if (st.as) u.asPct += st.as;
    if (st.arm) u.arm += st.arm; if (st.mr) u.mr += st.mr; if (st.sm) u.mana += st.sm;
    if (it === 'fang') u.fang = true;
    if (it === 'hardshell') u.baseDr += 12;
    if (it === 'bigstick') u.atkPct += 40;
    if (it === 'honeypot') u.honeypot = true;
    if (it === 'nest') u.shield += 200;
    if (it === 'pearl') u.ccImmune = 1;
    if (it === 'beeswax') u.skillAmp = true;
    if (it === 'warhammer') u.warhammer = true;
    if (it === 'thornshell') u.thorn = (u.thorn || 0) + 15;
    if (it === 'frostbranch') u.frost = true;
    if (it === 'bigacorn') u.itemRegen = (u.itemRegen || 0) + 15; // 千分比
    if (it === 'fogcloak') u.cloakUntil = 60;
    if (it === 'honeyacorn') u.honeyHeal = true;
    if (it === 'galefeather') u.gale = true;
    if (it === 'featherarmor') u.dodge += 15;
    if (it === 'dewfeather') u.dewHit = true;
    if (it === 'pollen') u.pollen = true;
    if (it === 'conch') u.conch = true;
    if (it === 'waxshell') u.waxShell = true;
    if (it === 'moondew') { u.moondew = true; u.ccImmune = 1; }
  }
  // 3 星進化
  if (star >= 3 && ANIMALS[key]) { u.evo = true; u.maxhp = Math.floor(u.maxhp * 12 / 10); u.atk = Math.floor(u.atk * 12 / 10); }
  if (s.neutral) u.neutral = true;
  u.hp = u.maxhp;
  B.units.push(u);
  B.grid[idx(c, r)] = u.id;
  return u;
}

function traitCounts(units, team) {
  // 依「不同動物種類」計算，兩位隊友合併
  const seen = {}, cnt = {}, owners = {};
  for (const u of units) {
    if (u.team !== team || u.summon || !ANIMALS[u.key]) continue;
    for (const t of (u.traits || ANIMALS[u.key].traits)) {
      (owners[t] = owners[t] || {})[u.owner] = 1;
      if (seen[u.key + t]) continue; seen[u.key + t] = 1;
      cnt[t] = (cnt[t] || 0) + 1;
    }
  }
  const res = {};
  for (const t in TRAITS) {
    const c = cnt[t] || 0; let tier = -1;
    TRAITS[t].tiers.forEach((n, i) => { if (c >= n) tier = i; });
    res[t] = { count: c, tier, duo: tier >= 0 && Object.keys(owners[t] || {}).length >= 2 };
  }
  return res;
}

function applyTraits(B) {
  for (const team of [0, 1]) {
    const tc = traitCounts(B.units, team);
    const v = t => { const x = tc[t]; if (x.tier < 0) return 0; const b = TRAITS[t].val[x.tier]; return x.duo ? Math.floor(b * (100 + SYNERGY_BONUS) / 100) : b; };
    for (const u of B.units) {
      if (u.team !== team) continue;
      if (hasTrait(u, 'forest')) u.regenPct = v('forest');
      if (v('savanna')) { if (hasTrait(u, 'savanna')) u.asPct += v('savanna'); u.mv = Math.max(3, u.mv - 1); }
      if (hasTrait(u, 'water')) u.waterShieldPct = v('water');
      if (hasTrait(u, 'sky')) u.dodge += v('sky');
      if (hasTrait(u, 'pack')) u.packPct = v('pack');
      if (v('armor')) { const add = hasTrait(u, 'armor') ? v('armor') : (tc.armor.tier >= 2 ? 20 : 10); u.arm += add; u.mr += add; }
      if (hasTrait(u, 'night')) u.nightCrit = v('night');
    }
    B['traits' + team] = tc;
  }
}

function findCombos(B) {
  for (const cb of COMBOS) for (const team of [0, 1]) {
    const as = B.units.filter(u => u.team === team && u.key === cb.a);
    const bs = B.units.filter(u => u.team === team && u.key === cb.b);
    let done = false;
    for (const a of as) { if (done) break; for (const b of bs) if ((a.owner !== b.owner || B.flags.solo) && a !== b && dist(a, b) <= (B.flags.bond ? 2 : 1)) { B.combos.push({ cb, a: a.id, b: b.id, team, fired: false }); done = true; break; } }
  }
}

// ---- 狀態工具 ----
const U = (B, id) => B.units[id];
function buffSum(B, u, stat) { let s = 0; for (const b of u.buffs) if (b.s === stat && b.u > B.t) s += b.v; return s; }
function terrainAt(B, c, r) {
  for (const z of B.temp) if (z.until > B.t && hexD(z.c, z.r, c, r) <= 1 && B.terrain[idx(c, r)] !== 'rock') return z.type;
  return B.terrain[idx(c, r)];
}
function inZone(B, u, kind, team) {
  for (const z of B.zones) if (z.kind === kind && z.team !== u.team && z.until > B.t && hexD(z.c, z.r, u.c, u.r) <= 1) return true;
  return false;
}
const isHigh = (B, c, r) => !!(B.height && B.height[idx(c, r)]);
const onTile = (B, u, type) => terrainAt(B, u.c, u.r) === type;
function hiddenFrom(B, e, u) { return (e.stealth || e.cloakUntil > B.t || onTile(B, e, 'shadow')) && dist(e, u) > 1; }
function effAtk(B, u) {
  let p = 100 + u.atkPct + buffSum(B, u, 'atk');
  if ((hasTrait(u, 'water') || u.wave) && terrainAt(B, u.c, u.r) === 'water') p += 20;
  if (inZone(B, u, 'gas')) p -= 30;
  if (u.plague) p -= 6 * u.plague;
  if (u.warhammer && u.hp * 100 < u.maxhp * 40) p += 35;
  if (B.weather === 'rain' && hasTrait(u, 'water')) p += 15;
  if (inDomain(B, u)) p -= 40;
  return Math.max(1, Math.floor(u.atk * p / 100));
}
function effInterval(B, u) {
  let p = 100 + u.asPct + buffSum(B, u, 'as');
  if (u.key === 'cheetah') p += Math.min(5, u.sameHits) * 8;
  if (u.galeStacks) p += u.galeStacks * 3;
  if (B.weather === 'heat') p += 15 + (hasTrait(u, 'savanna') ? 10 : 0);
  if (onTile(B, u, 'burn')) p += BURN_AS;
  return Math.max(5, Math.floor(u.ai * 100 / p));
}
function effRange(B, u) { return u.rng + (u.rng >= 2 && terrainAt(B, u.c, u.r) === 'tree' ? 1 : 0) + (u.rng >= 2 && isHigh(B, u.c, u.r) ? HIGH.RANGE : 0); }
function enemies(B, u) { return B.units.filter(e => e.alive && e.team !== u.team); }
function allies(B, u) { return B.units.filter(e => e.alive && e.team === u.team); }

function stun(B, u, ticks, kind) {
  if (!u.alive || u.invuln > B.t) return;
  if (u.ccImmune) { u.ccImmune = 0; B.ev.push({ k: 'txt', id: u.id, s: '免疫' }); return; }
  u.stun = Math.max(u.stun, B.t + ticks);
  B.ev.push({ k: 'cc', id: u.id, s: kind || '暈' });
}
function heal(B, u, amt) {
  if (!u.alive || amt <= 0) return;
  const before = u.hp; u.hp = Math.min(u.maxhp, u.hp + amt);
  u.healed = (u.healed || 0) + (u.hp - before);
  if (u.hp - before >= 25) B.ev.push({ k: 'heal', id: u.id, a: u.hp - before });
}
function addDot(B, src, tgt, per, ticks, kind) { tgt.dots.push({ src: src.id, per, until: B.t + ticks, kind }); }

function damage(B, src, tgt, raw, type, o) {
  o = o || {};
  if (!tgt.alive) return 0;
  if (tgt.invuln > B.t) { B.ev.push({ k: 'miss', id: tgt.id, s: '無敵' }); return 0; }
  if (o.atk) {
    if (src.blind > B.t) { B.ev.push({ k: 'miss', id: tgt.id, s: '落空' }); return 0; }
    if (tgt.dodge && B.rng(100) < tgt.dodge) { B.ev.push({ k: 'miss', id: tgt.id, s: '閃避' }); return 0; }
    if (isHigh(B, tgt.c, tgt.r) && !isHigh(B, src.c, src.r) && B.rng(100) < HIGH.MISS) { B.ev.push({ k: 'miss', id: tgt.id, s: '仰攻落空' }); return 0; }
  }
  let amt = raw, crit = !!o.crit;
  if (o.skill && src.skillAmp) amt = Math.floor(amt * 130 / 100);
  if (src.packPct && (o.atk || o.skill)) {
    let n = 0; for (const a of B.units) if (a.alive && a !== src && a.team === src.team && hasTrait(a, 'pack') && dist(a, src) <= 1) n++;
    amt = Math.floor(amt * (100 + n * src.packPct) / 100);
  }
  if (o.atk && src.forceCrit) { crit = true; src.forceCrit = false; }
  if (PREY[src.key] && PREY[src.key].indexOf(tgt.key) >= 0) { amt = Math.floor(amt * (100 + PREY_BONUS) / 100); o.prey = true; }
  if (o.skill && src.evo) amt = Math.floor(amt * 130 / 100);
  if (o.atk && src.key === 'komodo' && tgt.dots.some(d => d.kind === 'poison' && d.until > B.t)) amt = Math.floor(amt * 130 / 100);
  if (hasAug(B, src, 'underdog') && costOf(src) <= 3 && costOf(tgt) >= 4) amt = Math.floor(amt * 180 / 100);
  if (hasAug(B, src, 'gangup')) { let n = 0; for (const a of B.units) if (a.alive && a.team === src.team && a.target === tgt.id) n++; if (n >= 2) amt = Math.floor(amt * 125 / 100); }
  if (!crit && o.atk) { const cc = src.crit + (B.night ? src.nightCrit : 0); if (cc && B.rng(100) < cc) crit = true; }
  if (crit) amt = Math.floor(amt * 150 / 100);
  if (o.atk && src.firstHit) { amt = Math.floor(amt * 150 / 100); src.firstHit = false; }
  if (B.t > CFG.OVERTIME_TICK) amt = Math.floor(amt * (100 + 10 * Math.floor((B.t - CFG.OVERTIME_TICK) / 20)) / 100);
  if (type === 'phys') {
    let arm = tgt.arm; if (tgt.key === 'croc' && terrainAt(B, tgt.c, tgt.r) === 'water') arm *= 2;
    if (tgt.plague) arm = Math.floor(arm * Math.max(10, 100 - 6 * tgt.plague) / 100);
    if (inDomain(B, tgt)) arm = Math.floor(arm * 60 / 100);
    amt = Math.floor(amt * 100 / (100 + Math.max(0, arm)));
  } else if (type === 'magic') amt = Math.floor(amt * 100 / (100 + Math.max(0, tgt.mr)));
  let dr = Math.min(80, tgt.baseDr + buffSum(B, tgt, 'dr'));
  if (hasAug(B, tgt, 'united')) { let n = 0; for (const a of B.units) if (a.alive && a !== tgt && a.team === tgt.team && dist(a, tgt) <= 1) n++; dr = Math.min(80, dr + Math.min(20, 5 * n)); }
  amt = Math.floor(amt * (100 - dr) / 100);
  if (amt < 1) amt = 1;
  let left = amt;
  if (tgt.shield > 0) { const ab = Math.min(tgt.shield, left); tgt.shield -= ab; left -= ab; }
  tgt.hp -= left;
  src.dmgDone += amt;
  B.ev.push({ k: 'dmg', id: tgt.id, a: amt, c: crit, ty: type, src: src.id, sk: !!o.skill, at: !!o.atk, prey: !!o.prey }); tgt.dmgTaken = (tgt.dmgTaken || 0) + amt;
  if (!tgt.asleep) tgt.mana += Math.min(15, 2 + Math.floor(amt / 40));
  else { tgt.slept += amt; if (tgt.slept * 100 >= tgt.maxhp * 15) wake(B, tgt, false); }
  if (o.atk && src.lifesteal) heal(B, src, Math.floor(amt * src.lifesteal / 100));
  if (o.atk && tgt.key === 'hedgehog' && statOf(src.key).rng === 1 && src.alive && tgt.hp > 0) {
    damage(B, tgt, src, Math.floor(amt * 20 / 100), 'magic', { reflect: true });
  }
  if (o.atk && src.fang) addDot(B, src, tgt, Math.max(1, Math.floor(tgt.maxhp * 4 / 300)), 60, 'bleed');
  if (o.atk && src.frost) tgt.buffs.push({ s: 'as', v: -20, u: B.t + 40 });
  if (o.atk && src.gale) src.galeStacks = Math.min(10, (src.galeStacks || 0) + 1);
  if (o.atk && src.pollen) src.mana += 5;
  if (o.atk && B.weather === 'rain') src.mana += 2;
  if (o.atk && tgt.thorn && src.alive && tgt.hp > 0) damage(B, tgt, src, Math.floor(amt * tgt.thorn / 100), 'magic', { reflect: true });
  if (o.atk && src.dewHit && tgt.hp > 0 && tgt.alive) damage(B, src, tgt, 35, 'magic', {});
  if (o.atk && src.toxicUntil > B.t) addDot(B, src, tgt, 30, 60, 'poison');
  if (tgt.hp <= 0) kill(B, tgt, src);
  return amt;
}

function kill(B, u, killer) {
  // 替罪之身：由身邊的 1、2 費友軍代替陣亡
  if (hasAug(B, u, 'scapegoat') && !u.scaped && costOf(u) >= 3) {
    let sub = null, sd = 99;
    for (const a of B.units) if (a.alive && a !== u && a.owner === u.owner && !a.summon && costOf(a) <= 2) { const d = dist(a, u); if (d < sd) { sd = d; sub = a; } }
    if (sub) { u.scaped = true; u.hp = Math.floor(u.maxhp * 30 / 100); B.ev.push({ k: 'txt', id: u.id, s: '替罪之身' }); B.ev.push({ k: 'aug', id: u.id, a: 'scapegoat', to: sub.id }); kill(B, sub, killer); return; }
  }
  u.alive = false; u.hp = 0;
  if (u.neutral) { if (B.grid[idx(u.c, u.r)] === u.id) B.grid[idx(u.c, u.r)] = -1; B.ev.push({ k: 'die', id: u.id, key: u.key, team: 2, by: killer ? killer.id : -1 }); if (killer && killer.owner >= 0) B.loot.push({ owner: killer.owner, key: u.key }); return; }
  if (!u.summon && u.owner >= 0) B.deaths[u.owner] = (B.deaths[u.owner] || 0) + 1;
  if (hasAug(B, u, 'riposte') && killer && killer.alive && killer !== u && B.rng(100) < 50) { B.ev.push({ k: 'aug', id: u.id, a: 'riposte', to: killer.id }); damage(B, u, killer, Math.floor(killer.maxhp * 30 / 100), 'true', {}); }
  if (hasAug(B, u, 'necro') && (B.necroUsed[u.owner] || 0) < 2 && !u.summon && !u.revived) { B.necroUsed[u.owner] = (B.necroUsed[u.owner] || 0) + 1; u.revived = true; B.revives.push({ id: u.id, t: B.t + 20, c: u.c, r: u.r }); }
  if (killer && killer.alive && killer.team !== u.team && killer.owner >= 0) {
    const ko = killer.owner;
    B.kills[ko] = (B.kills[ko] || 0) + 1; if (costOf(u) >= 4) B.bigKill[ko] = true;
    if (hasAug(B, killer, 'retreat')) heal(B, killer, Math.floor(killer.maxhp * 15 / 100));
    if (hasAug(B, killer, 'chainhunt')) { killer.nextAtk = B.t; killer.mana += 20; }
    if (hasAug(B, killer, 'soulfeed')) { killer.atkPct += 15; const add = Math.floor(killer.maxhp * 10 / 100); killer.maxhp += add; killer.hp += add; B.ev.push({ k: 'aug', id: killer.id, a: 'soulfeed' }); }
    if (hasAug(B, killer, 'carnival')) for (const a of B.units) if (a.alive && a.owner === ko) { heal(B, a, Math.floor(a.maxhp * 5 / 100)); a.mana += 10; }
  }
  if (B.grid[idx(u.c, u.r)] === u.id) B.grid[idx(u.c, u.r)] = -1;
  B.ev.push({ k: 'die', id: u.id, key: u.key, team: u.team, by: killer ? killer.id : -1 });
  if (u.key === 'minibee' && killer && killer.alive) damage(B, u, killer, 60, 'true', {});
}

function wake(B, u, byMana) {
  if (!u.asleep) return;
  u.asleep = false; u.castCount++;
  u.buffs.push({ s: 'atk', v: 80, u: B.t + 100 });
  if (byMana) u.mana = 0;
  B.ev.push({ k: 'skill', id: u.id, s: '起床氣！' });
}

// ---- 移動 ----
function passable(B, c, r, self) {
  if (!inB(c, r)) return false;
  if (B.terrain[idx(c, r)] === 'rock') return false;
  const g = B.grid[idx(c, r)];
  return g === -1 || g === self;
}
function moveTo(B, u, c, r, ticks) {
  B.grid[idx(u.c, u.r)] = -1;
  u.mvFrom = { c: u.c, r: u.r, t0: B.t, t1: B.t + ticks };
  u.c = c; u.r = r; B.grid[idx(c, r)] = u.id;
}
function teleport(B, u, c, r) {
  B.grid[idx(u.c, u.r)] = -1;
  u.mvFrom = { c: u.c, r: u.r, t0: B.t, t1: B.t + 4, jump: true };
  u.c = c; u.r = r; B.grid[idx(c, r)] = u.id;
}
function stepToward(B, u, tgt, range) {
  // BFS 找最近能打到目標的格子，回傳第一步
  const start = idx(u.c, u.r), prev = new Map([[start, -1]]), q = [[u.c, u.r]];
  let goal = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const [c, r] = q[qi];
    if (hexD(c, r, tgt.c, tgt.r) <= range) { goal = idx(c, r); break; }
    for (const [nc, nr] of hexNb(c, r, u.team)) {
      const k = idx(nc, nr);
      if (!passable(B, nc, nr, u.id) || prev.has(k)) continue;
      prev.set(k, idx(c, r)); q.push([nc, nr]);
    }
  }
  if (goal === -1 || goal === start) return null;
  let k = goal; while (prev.get(k) !== start) k = prev.get(k);
  return [k % CFG.COLS, Math.floor(k / CFG.COLS)];
}
function freeNear(B, c, r, from) {
  // 找 (c,r) 周圍最近的空格；from 用於平手時偏好
  let best = null, bd = 99;
  for (let rad = 1; rad <= 3 && !best; rad++) for (let nr = r - rad; nr <= r + rad; nr++) for (let nc = c - rad - 1; nc <= c + rad + 1; nc++) {
    if (hexD(c, r, nc, nr) !== rad || !passable(B, nc, nr, -2)) continue;
    const d = from ? hexD(nc, nr, from.c, from.r) : 0;
    if (d < bd) { bd = d; best = [nc, nr]; }
  }
  return best;
}
function clusterCenter(B, u) {
  // 敵人最密集的「半徑 1（7 格）」中心
  let best = null, bn = -1;
  for (const e of enemies(B, u)) {
    let n = 0; for (const f of enemies(B, u)) if (hexD(f.c, f.r, e.c, e.r) <= 1) n++;
    if (n > bn) { bn = n; best = e; }
  }
  return best;
}
function pickTarget(B, u) {
  if (u.tauntUntil > B.t) { const tb = U(B, u.tauntBy); if (tb && tb.alive) return tb; }
  const cur = u.target >= 0 ? U(B, u.target) : null;
  const hidden = e => hiddenFrom(B, e, u);
  if (cur && cur.alive && !cur.neutral && !(hidden(cur) && enemies(B, u).some(e => !hidden(e) && !e.neutral))) return cur;
  let best = null, bd = 99;
  const all = enemies(B, u), es = all.filter(e => !e.neutral), vis = es.filter(e => !hidden(e)), pool = vis.length ? vis : es;
  // 中立物件：只有在射程內、而且附近沒有敵人時才順手打
  if (cur && cur.alive && cur.neutral && dist(u, cur) <= effRange(B, u) && !es.some(e => dist(u, e) <= effRange(B, u))) return cur;
  if (!es.some(e => dist(u, e) <= effRange(B, u))) for (const n of all) if (n.neutral && dist(u, n) <= effRange(B, u)) return n;
  for (const e of pool) { const d = dist(u, e); if (d < bd) { bd = d; best = e; } }
  return best;
}

// ---- 技能 ----
function cast(B, u) {
  const m = SKILL_MUL[u.star] || 100, sk = v => Math.floor(v * m / 100);
  const tgt = u.target >= 0 ? U(B, u.target) : null;
  const es = enemies(B, u);
  B.ev.push({ k: 'skill', id: u.id, s: (ANIMALS[u.key] || {}).skill || '', tg: u.target });
  u.stealth = false;
  switch (u.key) {
    case 'hedgehog':
      u.invuln = B.t + 30;
      for (const e of es) if (dist(e, u) <= 1) damage(B, u, e, sk(120), 'magic', { skill: 1 });
      break;
    case 'squirrel': {
      const t0 = tgt && tgt.alive ? tgt : pickTarget(B, u); if (!t0) break;
      B.ev.push({ k: 'proj', id: u.id, tg: t0.id, s: 'acorn' });
      damage(B, u, t0, sk(150), 'phys', { skill: 1 });
      const rest = es.filter(e => e.alive && e !== t0).sort((a, b) => dist(a, t0) - dist(b, t0) || a.id - b.id).slice(0, 2);
      for (const e of rest) { B.ev.push({ k: 'proj', id: t0.id, tg: e.id, s: 'acorn' }); damage(B, u, e, sk(105), 'phys', { skill: 1 }); }
      break; }
    case 'wolf':
      { const ids = []; for (const a of allies(B, u)) if (a === u || (hasTrait(a, 'pack') && dist(a, u) <= 2)) { a.buffs.push({ s: 'as', v: 30, u: B.t + 80 }); ids.push(a.id); } B.ev.push({ k: 'buff', id: u.id, ids, s: 'as' }); }
      break;
    case 'frog': {
      let far = null, fd = -1;
      for (const e of es) { const d = dist(e, u); if (d <= 4 && d > fd) { fd = d; far = e; } }
      if (!far) break;
      if (fd > 1 && far.invuln <= B.t) { const spot = freeNear(B, u.c, u.r, far); if (spot) teleport(B, far, spot[0], spot[1]); }
      B.ev.push({ k: 'proj', id: u.id, tg: far.id, s: 'tongue' });
      damage(B, u, far, sk(220), 'magic', { skill: 1 }); stun(B, far, 30);
      break; }
    case 'bat': {
      const t0 = tgt && tgt.alive ? tgt : pickTarget(B, u); if (!t0) break;
      const d = damage(B, u, t0, sk(180), 'phys', { skill: 1 }); heal(B, u, d);
      break; }
    case 'redpanda':
      { const ids = []; for (const e of es) if (dist(e, u) <= 2) { e.tauntBy = u.id; e.tauntUntil = B.t + 60; e.target = u.id; ids.push(e.id); } B.ev.push({ k: 'taunt', id: u.id, ids }); }
      u.buffs.push({ s: 'dr', v: 30, u: B.t + 60 });
      break;
    case 'skunk': {
      const cc = clusterCenter(B, u); if (!cc) break;
      B.zones.push({ kind: 'gas', team: u.team, c: cc.c, r: cc.r, until: B.t + 80, per: sk(40), src: u.id }); B.ev.push({ k: 'zone', kind: 'gas', c: cc.c, r: cc.r, id: u.id });
      break; }
    case 'croc':
      if (tgt && tgt.alive) { stun(B, tgt, 40); damage(B, u, tgt, sk(300), 'phys', { skill: 1 }); }
      break;
    case 'bee':
      for (let i = 0; i < 3; i++) {
        const spot = freeNear(B, u.c, u.r, tgt || u); if (!spot) break;
        const mb = spawn(B, 'minibee', u.star, u.owner, u.team, spot[0], spot[1], [], true);
        if (u.toxicUntil > B.t) mb.toxicUntil = u.toxicUntil;
        B.ev.push({ k: 'spawn', id: mb.id });
      }
      break;
    case 'koala':
      if (u.asleep) { wake(B, u, true); return; }
      u.buffs.push({ s: 'atk', v: 80, u: B.t + 100 });
      if (tgt && tgt.alive) damage(B, u, tgt, sk(250), 'phys', { skill: 1 });
      break;
    case 'cheetah': {
      let low = null; for (const e of es) if (!low || e.hp * 1000 / e.maxhp < low.hp * 1000 / low.maxhp) low = e;
      if (!low) break;
      if (dist(low, u) > 1) { const spot = freeNear(B, low.c, low.r, u); if (spot) teleport(B, u, spot[0], spot[1]); }
      u.target = low.id; u.sameHits = 0;
      damage(B, u, low, sk(300), 'phys', { skill: 1 });
      break; }
    case 'octopus': {
      const cc = clusterCenter(B, u); if (!cc) break;
      B.zones.push({ kind: 'ink', team: u.team, c: cc.c, r: cc.r, until: B.t + 30, per: 0 }); B.ev.push({ k: 'zone', kind: 'ink', c: cc.c, r: cc.r, id: u.id });
      for (const e of es) if (hexD(e.c, e.r, cc.c, cc.r) <= 1) {
        damage(B, u, e, sk(200), 'magic', { skill: 1 }); e.blind = Math.max(e.blind, B.t + 60); B.ev.push({ k: 'cc', id: e.id, s: '致盲' });
      }
      break; }
    case 'owl': {
      let low = null; for (const e of es) if (!low || e.hp < low.hp) low = e;
      if (!low) break;
      B.ev.push({ k: 'proj', id: u.id, tg: low.id, s: 'owl' });
      damage(B, u, low, sk(350), 'phys', { skill: 1, crit: 1 });
      break; }
    case 'kingboar': // 魔王：震地
      for (const e of es) if (dist(e, u) <= 2) { stun(B, e, 25); damage(B, u, e, sk(150), 'magic', { skill: 1 }); }
      B.ev.push({ k: 'shake', id: u.id });
      break;
    case 'elephant':
      for (const e of es) if (dist(e, u) <= 2) { stun(B, e, 30); damage(B, u, e, sk(220), 'magic', { skill: 1 }); }
      B.ev.push({ k: 'shake', id: u.id });
      break;
    case 'lion':
      { const ids = []; for (const a of allies(B, u)) { a.buffs.push({ s: 'atk', v: 25, u: B.t + 120 }); ids.push(a.id); } B.ev.push({ k: 'buff', id: u.id, ids, s: 'atk' }); }
      for (const e of es) if (dist(e, u) <= 2) stun(B, e, 30, '恐懼');
      break;
    // ---- v0.5 新動物 ----
    case 'penguin': {
      let far = null, fd = -1; for (const e of es) { const d = dist(e, u); if (d <= 3 && d > fd) { fd = d; far = e; } }
      if (!far) far = tgt && tgt.alive ? tgt : null; if (!far) break;
      if (dist(far, u) > 1) { const spot = freeNear(B, far.c, far.r, u); if (spot) { teleport(B, u, spot[0], spot[1]); u.mvFrom.t1 = B.t + 8; u.mvFrom.slide = true; u.mvFrom.jump = false; } }
      u.target = far.id; B.ev.push({ k: 'dash', id: u.id, tg: far.id, s: 'slide' });
      damage(B, u, far, sk(160), 'magic', { skill: 1 }); stun(B, far, 20);
      for (const e of es) if (e !== far && e.alive && dist(e, u) <= 1) damage(B, u, e, sk(80), 'magic', { skill: 1 });
      break; }
    case 'rhino': {
      let far = null, fd = -1; for (const e of es) { const d = dist(e, u); if (d <= 3 && d > fd) { fd = d; far = e; } }
      if (!far) far = tgt && tgt.alive ? tgt : null; if (!far) break;
      if (dist(far, u) > 1) { const spot = freeNear(B, far.c, far.r, u); if (spot) { teleport(B, u, spot[0], spot[1]); u.mvFrom.t1 = B.t + 8; u.mvFrom.slide = true; u.mvFrom.jump = false; } }
      u.target = far.id; B.ev.push({ k: 'dash', id: u.id, tg: far.id, s: 'charge' });
      damage(B, u, far, sk(220), 'phys', { skill: 1 }); stun(B, far, 25, '擊飛');
      u.shield += sk(180);
      break; }
    case 'chameleon': {
      let low = null; for (const e of es) if (dist(e, u) <= 3 && (!low || e.hp < low.hp)) low = e;
      if (!low) low = tgt && tgt.alive ? tgt : null; if (!low) break;
      B.ev.push({ k: 'proj', id: u.id, tg: low.id, s: 'tongue' });
      damage(B, u, low, sk(280), 'phys', { skill: 1 });
      u.stealth = true; u.forceCrit = true; u.target = low.id;
      break; }
    case 'fox': {
      let best = null; for (const e of es) if (!e.neutral && (!best || (e.rng >= 2) > (best.rng >= 2) || ((e.rng >= 2) === (best.rng >= 2) && e.atk > best.atk))) best = e;
      if (!best) break;
      if (dist(best, u) > 1) { const spot = freeNear(B, best.c, best.r, u); if (spot) { teleport(B, u, spot[0], spot[1]); u.mvFrom.t1 = B.t + 10; u.mvFrom.big = true; } }
      u.target = best.id;
      damage(B, u, best, sk(240), 'phys', { skill: 1 }); best.mana = Math.max(0, best.mana - 40);
      break; }
    case 'eagle': {
      const t0 = tgt && tgt.alive && !tgt.neutral ? tgt : pickTarget(B, u); if (!t0) break;
      stun(B, t0, 30, '被抓走');
      if (t0.alive && t0.invuln <= B.t) { t0.mvFrom = { c: t0.c, r: t0.r, t0: B.t, t1: B.t + 30, jump: true, grab: true }; }
      B.ev.push({ k: 'grab', id: u.id, tg: t0.id });
      B.landings.push({ id: t0.id, t: B.t + 30, by: u.id, dmg: sk(380), splash: sk(120) });
      break; }
    case 'eel': {
      let cur = tgt && tgt.alive ? tgt : pickTarget(B, u); if (!cur) break;
      const hit = [cur.id], chain = [u.id, cur.id]; let amt = sk(260);
      damage(B, u, cur, amt, 'magic', { skill: 1 }); stun(B, cur, 10, '麻痺');
      for (let i = 0; i < 4; i++) {
        let nx = null, nd = 99; for (const e of es) if (e.alive && !hit.includes(e.id)) { const d = dist(e, cur); if (d < nd || (d === nd && e.id < nx.id)) { nd = d; nx = e; } }
        if (!nx || nd > 3) break;
        amt = Math.floor(amt * 85 / 100); hit.push(nx.id); chain.push(nx.id);
        damage(B, u, nx, amt, 'magic', { skill: 1 }); stun(B, nx, 10, '麻痺'); cur = nx;
      }
      B.ev.push({ k: 'chain', id: u.id, ids: chain });
      break; }
    case 'gorilla': {
      const ids = []; for (const e of es) if (dist(e, u) <= 2) { e.tauntBy = u.id; e.tauntUntil = B.t + 50; e.target = u.id; ids.push(e.id); } B.ev.push({ k: 'taunt', id: u.id, ids });
      u.shield += Math.floor(u.maxhp * 18 / 100);
      for (const e of es) if (dist(e, u) <= 1) damage(B, u, e, sk(200), 'magic', { skill: 1 });
      break; }
    case 'whale': {
      const ux = hexX(u.c, u.r); // 以自己為中心、左右各 1 格寬的直線帶
      for (const e of es) if (Math.abs(hexX(e.c, e.r) - ux) <= 1) { damage(B, u, e, sk(260), 'magic', { skill: 1 }); stun(B, e, 20); }
      for (const a of allies(B, u)) if (Math.abs(hexX(a.c, a.r) - ux) <= 1) heal(B, a, Math.floor(a.maxhp * 15 / 100));
      B.ev.push({ k: 'wave', id: u.id, c: u.c, x: ux });
      break; }
    case 'peacock': {
      for (const e of es) if (dist(e, u) <= 3) stun(B, e, 30, '魅惑');
      const ids = []; for (const a of allies(B, u)) if (dist(a, u) <= 3) { a.buffs.push({ s: 'as', v: 30, u: B.t + 80 }); a.buffs.push({ s: 'dr', v: 20, u: B.t + 80 }); ids.push(a.id); }
      B.ev.push({ k: 'buff', id: u.id, ids, s: 'as' });
      break; }
    case 'komodo': {
      const t0 = tgt && tgt.alive ? tgt : pickTarget(B, u); if (!t0) break;
      damage(B, u, t0, sk(260), 'phys', { skill: 1 });
      if (t0.alive) addDot(B, u, t0, Math.max(1, Math.floor(t0.maxhp * 6 / 100 * m / 100)), 100, 'poison');
      heal(B, u, Math.floor(u.maxhp * 20 / 100));
      break; }
  }
  u.castCount++;
  if (u.honeyHeal) heal(B, u, Math.floor(u.maxhp * 12 / 100));
  if (u.waxShell) u.shield += 200;
  if (hasAug(B, u, 'trample') && TANKS.includes(u.key)) { for (const e of enemies(B, u)) if (dist(e, u) <= 1) stun(B, e, 20); B.ev.push({ k: 'aug', id: u.id, a: 'trample' }); }
}

function fireCombo(B, cbx) {
  const a = U(B, cbx.a), b = U(B, cbx.b);
  cbx.fired = true;
  B.ev.push({ k: 'combo', a: a.id, b: b.id, s: cbx.cb.name });
  const es = enemies(B, a);
  switch (cbx.cb.id) {
    case 'hunt': { // b = 獵豹
      let low = null; for (const e of es) if (!low || e.hp < low.hp) low = e;
      if (!low) break;
      const spot = freeNear(B, low.c, low.r, b); if (spot) teleport(B, b, spot[0], spot[1]);
      b.target = low.id;
      if (low.hp * 100 < low.maxhp * 15) damage(B, b, low, low.hp + low.shield + 9999, 'true', { skill: 1 });
      else damage(B, b, low, Math.floor(250 * SKILL_MUL[b.star] / 100), 'phys', { skill: 1 });
      break; }
    case 'swamp': {
      const cc = clusterCenter(B, a); if (cc) { B.temp.push({ type: 'water', c: cc.c, r: cc.r, until: B.t + 100 }); B.ev.push({ k: 'zone', kind: 'water', c: cc.c, r: cc.r, id: a.id }); }
      break; }
    case 'guard':
      heal(B, a, Math.floor(a.maxhp * 30 / 100)); heal(B, b, Math.floor(b.maxhp * 30 / 100));
      a.buffs.push({ s: 'dr', v: 40, u: B.t + 80 });
      break;
    case 'toxic':
      for (const x of allies(B, a)) if (x.key === 'bee' || x.key === 'minibee') x.toxicUntil = B.t + 100;
      break;
    case 'throw': { // b = 松鼠
      let back = null; for (const e of es) if (!back || (a.team === 0 ? e.r > back.r : e.r < back.r) || (e.r === back.r && e.id < back.id)) back = e;
      if (!back) break;
      const spot = freeNear(B, back.c, back.r, b); if (spot) teleport(B, b, spot[0], spot[1]);
      for (const e of es) if (dist(e, b) <= 1) { damage(B, a, e, Math.floor(250 * SKILL_MUL[a.star] / 100), 'magic', { skill: 1 }); stun(B, e, 10); }
      break; }
    case 'dusk':
      B.night = true;
      for (const x of allies(B, a)) if (hasTrait(x, 'night')) x.mana += 30;
      break;
  }
}

// ---- 主迴圈 ----
function step(B) {
  if (B.over) return;
  B.t++;
  const t = B.t;
  if (!B.night && t >= CFG.NIGHT_TICK) { B.night = true; B.ev.push({ k: 'night' }); }
  augTick(B);
  // 開場：蝙蝠飛向後排
  if (t === 1) for (const u of B.units) if (u.key === 'bat' && u.alive) {
    let back = null; for (const e of enemies(B, u)) if (!back || (u.team === 0 ? e.r > back.r : e.r < back.r) || (e.r === back.r && e.id < back.id)) back = e;
    if (back) { const spot = freeNear(B, back.c, back.r, u); if (spot) { teleport(B, u, spot[0], spot[1]); u.target = back.id; } }
  }
  const sec = t % 20 === 0;
  // 區域傷害
  if (sec) for (const z of B.zones) if (z.until >= t && z.per) {
    const src = U(B, z.src);
    for (const e of B.units) if (e.alive && e.team !== z.team && hexD(e.c, e.r, z.c, z.r) <= 1) damage(B, src, e, z.per, 'magic', {});
  }
  envTick(B);
  const order = (t & 1) ? B.units.slice().reverse() : B.units; // 每 tick 交替行動順序，避免先手優勢
  for (const u of order) {
    if (!u.alive || u.neutral) continue;
    if (sec) {
      for (const d of u.dots) if (d.until >= t && u.alive) damage(B, U(B, d.src), u, d.per, 'magic', {});
      u.dots = u.dots.filter(d => d.until > t);
      if (!u.alive) continue;
      const onTree = terrainAt(B, u.c, u.r) === 'tree';
      if (u.regenPct) heal(B, u, Math.floor(u.maxhp * u.regenPct * (onTree ? 2 : 1) / 100));
      if (u.itemRegen) heal(B, u, Math.floor(u.maxhp * u.itemRegen / 1000));
      if (u.asleep) { heal(B, u, Math.floor(u.maxhp * 5 * (onTree ? 2 : 1) / 100)); u.mana += 10; }
      if (t % 100 === 0) u.buffs = u.buffs.filter(b => b.u > t);
    }
    if (u.asleep) { if (u.mana >= u.manaMax) wake(B, u, true); continue; }
    if (u.stun > t) continue;
    if (u.mvFrom && u.mvFrom.t1 > t) continue;
    if (u.mvFrom) u.mvFrom = null;
    if (u.busy > t) continue;
    if (u.mana >= u.manaMax && u.manaMax < 999) {
      u.mana = u.honeypot ? 25 : 0;
      cast(B, u); u.busy = t + 8;
      continue;
    }
    const tg = pickTarget(B, u);
    if (!tg) continue;
    if (tg.id !== u.target) { u.target = tg.id; }
    if (dist(u, tg) <= effRange(B, u)) {
      if (t >= u.nextAtk) {
        if (u.key === 'cheetah') { if (u.lastTgt === tg.id) u.sameHits++; else u.sameHits = 0; u.lastTgt = tg.id; }
        B.ev.push({ k: 'atk', id: u.id, tg: tg.id, rg: u.rng > 1 });
        u.stealth = false;
        damage(B, u, tg, effAtk(B, u), 'phys', { atk: 1 });
        u.mana += 10;
        u.nextAtk = t + effInterval(B, u);
      }
    } else {
      const nx = stepToward(B, u, tg, effRange(B, u));
      if (nx) {
        let mt = u.mv;
        if (!hasTrait(u, 'water') && terrainAt(B, nx[0], nx[1]) === 'water') mt = Math.floor(mt * 13 / 10);
        if (isHigh(B, nx[0], nx[1]) && !isHigh(B, u.c, u.r)) mt = Math.floor(mt * (100 + HIGH.CLIMB_PCT) / 100);
        moveTo(B, u, nx[0], nx[1], mt);
      } else u.target = -1;
    }
  }
  for (const cbx of B.combos) if (!cbx.fired) {
    const a = U(B, cbx.a), b = U(B, cbx.b);
    if (a.alive && b.alive && a.castCount > 0 && b.castCount > 0) fireCombo(B, cbx);
  }
  B.zones = B.zones.filter(z => z.until >= t);
  B.temp = B.temp.filter(z => z.until > t);
  const alive0 = B.units.some(u => u.alive && u.team === 0), alive1 = B.units.some(u => u.alive && u.team === 1);
  if (!alive0 || !alive1) { B.over = true; B.winner = alive0 ? 0 : alive1 ? 1 : -1; }
  else if (t >= CFG.COMBAT_MAX_TICK) { B.over = true; B.winner = -1; }
}

// ===== 地形互動：彈射、灼燒（v0.5）=====
function envDamage(B, u, amt, kind) {
  if (!u.alive || u.invuln > B.t || amt <= 0) return;
  let left = amt; if (u.shield > 0) { const ab = Math.min(u.shield, left); u.shield -= ab; left -= ab; }
  u.hp -= left; u.dmgTaken = (u.dmgTaken || 0) + amt;
  B.ev.push({ k: 'dmg', id: u.id, a: amt, c: false, ty: 'true', src: -1, env: kind });
  if (u.hp <= 0) kill(B, u, null);
}
function envTick(B) {
  const t = B.t, sec = t % 20 === 0;
  for (const u of B.units) {
    if (!u.alive || u.neutral) continue;
    const tt = terrainAt(B, u.c, u.r), moving = u.mvFrom && u.mvFrom.t1 > t;
    // 彈射：站滿 2 秒，彈到對面同款地塊旁
    if (tt === 'bounce' && !moving && !(u.bounceCd > t)) {
      u.bounceT = (u.bounceT || 0) + 1;
      if (u.bounceT >= BOUNCE_TICKS) {
        u.bounceT = 0; u.bounceCd = t + 100;
        const pc = CFG.COLS - 1 - u.c, pr = CFG.ROWS - 1 - u.r;
        const spot = passable(B, pc, pr, -2) ? [pc, pr] : freeNear(B, pc, pr, u);
        if (spot) {
          const fc = u.c, fr = u.r;
          B.grid[idx(u.c, u.r)] = -1; u.c = spot[0]; u.r = spot[1]; B.grid[idx(u.c, u.r)] = u.id;
          u.mvFrom = { c: fc, r: fr, t0: t, t1: t + 18, jump: true, big: true };
          u.target = -1; u.busy = t + 18;
          B.landings.push({ id: u.id, t: t + 18 });
          B.ev.push({ k: 'launch', id: u.id, fc, fr, c: u.c, r: u.r });
        }
      }
    } else if (!moving) u.bounceT = 0;
    // 灼燒：每秒失去 4% 生命
    if (sec && tt === 'burn') envDamage(B, u, Math.max(1, Math.floor(u.maxhp * BURN_PCT / 100)), 'burn');
  }
  B.landings = B.landings.filter(L => {
    if (L.t > t) return true;
    const u = B.units[L.id]; if (!u || !u.alive) return false;
    if (L.by !== undefined) { // 老鷹摔下
      const src = B.units[L.by];
      B.ev.push({ k: 'land', id: u.id, drop: true });
      damage(B, src, u, L.dmg, 'phys', { skill: 1 });
      for (const e of B.units) if (e.alive && e !== u && e.team === u.team && dist(e, u) <= 1) damage(B, src, e, L.splash, 'phys', { skill: 1 });
      return false;
    }
    B.ev.push({ k: 'land', id: u.id });
    for (const e of enemies(B, u)) if (dist(e, u) <= 1 && !e.neutral) damage(B, u, e, BOUNCE_DMG, 'magic', {});
    return false;
  });
}

function runBattle(input) {
  const B = createBattle(input);
  while (!B.over) { step(B); B.ev.length = 0; }
  return B;
}
function survivorStars(B, team) {
  let s = 0; for (const u of B.units) if (u.alive && u.team === team && !u.summon) s += u.star; return s;
}

// ===== 海克斯增幅：戰鬥內效果 =====
const TANKS = ['hedgehog', 'redpanda', 'croc', 'koala', 'rhino', 'gorilla', 'elephant', 'whale'];
const costOf = u => (ANIMALS[u.key] || { cost: 0 }).cost;
function hasAug(B, u, id) { const a = u && u.owner >= 0 && B.aug[u.owner]; return !!(a && a.indexOf(id) >= 0); }
function ownersWith(B, id) { const r = []; for (const k in B.aug) if (B.aug[k].indexOf(id) >= 0) r.push(+k); return r; }
function teamOfOwner(B, o) { const u = B.units.find(x => x.owner === o); return u ? u.team : -1; }
function backRow(team, r, n) { return team === 0 ? r < n : r >= CFG.ROWS - n; }
function inDomain(B, u) {
  if (!B.domainTeams) { B.domainTeams = []; for (const o of ownersWith(B, 'domain')) { const t = teamOfOwner(B, o); if (t >= 0 && !B.domainTeams.includes(t)) B.domainTeams.push(t); } }
  for (const t of B.domainTeams) if (u.team !== t && backRow(t, u.r, 2)) return true;
  return false;
}
function augStart(B) {
  const byOwner = {};
  for (const u of B.units) if (u.owner >= 0) (byOwner[u.owner] = byOwner[u.owner] || []).push(u);
  for (const u of B.units) {
    if (u.owner < 0) continue;
    const tt = B.terrain[idx(u.c, u.r)], A = ANIMALS[u.key] || {};
    if (hasAug(B, u, 'ambush') && (tt === 'grass' || u.c === 0 || u.c === CFG.COLS - 1)) { u.stealth = true; u.firstHit = true; }
    if (hasAug(B, u, 'wavestep')) u.wave = true;
    if (hasAug(B, u, 'fortress') && backRow(u.team, u.r, 2)) { u.arm += 25; u.mr += 25; }
    if (hasAug(B, u, 'scout') && A.cost === 1) { u.mv = Math.max(2, Math.floor(u.mv / 2)); u.asPct += 15; }
    if (hasAug(B, u, 'catstep')) u.dodge += 10;
    if (hasAug(B, u, 'guarddog') && backRow(u.team, u.r, 1)) { u.maxhp += 400; u.hp += 400; u.arm += 20; }
    if (hasAug(B, u, 'firstmove')) u.buffs.push({ s: 'as', v: 40, u: 100 });
    if (hasAug(B, u, 'nourish') && (tt === 'grass' || tt === 'water' || tt === 'tree')) u.shield += 200;
    if (hasAug(B, u, 'howl') && hasTrait(u, 'pack')) u.asPct += 15;
    if (hasAug(B, u, 'vanguard') && (u.team === 0 ? u.r === CFG.ROWS_HALF - 1 : u.r === CFG.ROWS_HALF)) u.atkPct += 20;
    if (hasAug(B, u, 'pounce') && u.rng === 1) { u.pounce = true; u.forceCrit = true; }
    if (hasAug(B, u, 'amphibious')) { u.wave = true; if (!u.waterShieldPct) u.shield += Math.floor(u.maxhp * 15 / 100); }
    if (hasAug(B, u, 'shadow')) u.stealth = true;
    if (hasAug(B, u, 'rapids')) { u.mv = Math.max(2, Math.floor(u.mv * 6 / 10)); u.mana += 15; }
    if (hasAug(B, u, 'lastStand') && B.low[u.owner]) { u.atkPct += 25; u.asPct += 25; }
    if (hasAug(B, u, 'lunge') && u.rng === 1) u.rng = 2;
    if (hasAug(B, u, 'mutation')) { u.arm += 25; u.mr += 25; u.shield += Math.floor(u.maxhp * 10 / 100); }
    u.startHp = u.maxhp;
  }
  for (const o in byOwner) {
    const list = byOwner[o].filter(u => !u.summon);
    if (!list.length) continue;
    const top = list.slice().sort((a, b) => (costOf(b) - costOf(a)) || (b.star - a.star) || a.id - b.id)[0];
    if (hasAug(B, top, 'beastking')) { top.king = true; top.maxhp = Math.floor(top.maxhp * 18 / 10); top.hp = top.maxhp; top.startHp = top.maxhp; top.atk = Math.floor(top.atk * 18 / 10); top.mana += 30; }
    if (hasAug(B, top, 'mirror')) {
      const spot = freeNear(B, top.c, top.r, null);
      if (spot) { const m = spawn(B, top.key, top.star, top.owner, top.team, spot[0], spot[1], top.items, true); m.maxhp = Math.floor(m.maxhp / 2); m.hp = m.maxhp; m.mirror = true; for (const k of ['traits', 'asPct', 'arm', 'mr', 'dodge', 'packPct', 'regenPct', 'nightCrit']) if (k !== 'traits') m[k] = top[k]; B.ev.push({ k: 'spawn', id: m.id }); if (m.key === 'koala') m.asleep = true; }
    }
  }
}
function augTick(B) {
  const t = B.t;
  if (t === 1) {
    for (const u of B.units) if (u.alive && u.pounce) {
      let best = null, bd = 99; for (const e of enemies(B, u)) { const d = dist(e, u); if (d <= 3 && d < bd) { bd = d; best = e; } }
      if (best && bd > 1) { const spot = freeNear(B, best.c, best.r, u); if (spot) { teleport(B, u, spot[0], spot[1]); u.target = best.id; B.ev.push({ k: 'aug', id: u.id, a: 'pounce' }); } }
    }
    for (const o of ownersWith(B, 'roar')) {
      const list = B.units.filter(u => u.alive && u.owner === o && !u.summon); if (!list.length) continue;
      const top = list.sort((a, b) => (costOf(b) - costOf(a)) || (b.star - a.star))[0];
      for (const e of enemies(B, top)) if (dist(e, top) <= 2) stun(B, e, 30, '恐懼');
      B.ev.push({ k: 'aug', id: top.id, a: 'roar' });
    }
    for (const o of ownersWith(B, 'bind')) {
      const tm = teamOfOwner(B, o); if (tm < 0) continue;
      const foes = B.units.filter(u => u.alive && u.team !== tm).sort((a, b) => (tm === 0 ? a.r - b.r : b.r - a.r) || a.id - b.id).slice(0, 2);
      for (const e of foes) { stun(B, e, 50, '定身'); B.ev.push({ k: 'aug', id: e.id, a: 'bind' }); }
    }
  }
  if (t % 120 === 0) {
    for (const u of B.units) if (u.alive && hasAug(B, u, 'quake') && costOf(u) >= 4) { for (const e of enemies(B, u)) if (dist(e, u) <= 1) { stun(B, e, 10); damage(B, u, e, 120, 'magic', {}); } B.ev.push({ k: 'aug', id: u.id, a: 'quake' }); }
    for (const o of ownersWith(B, 'meteor')) {
      const src = B.units.find(u => u.alive && u.owner === o); if (!src) continue;
      const cc = clusterCenter(B, src); if (!cc) continue;
      B.ev.push({ k: 'zone', kind: 'meteor', c: cc.c, r: cc.r, id: src.id });
      for (const e of enemies(B, src)) if (hexD(e.c, e.r, cc.c, cc.r) <= 1) damage(B, src, e, 200, 'magic', {});
    }
  }
  if (t % 20 === 0 && ownersWith(B, 'domain').length) { const src0 = B.units.find(u => u.alive && hasAug(B, u, 'domain')); if (src0) for (const e of B.units) if (e.alive && inDomain(B, e)) damage(B, src0, e, 30, 'true', {}); }
  if (t % 80 === 0) for (const o of ownersWith(B, 'plague')) { const tm = teamOfOwner(B, o); if (tm < 0) continue; for (const e of B.units) if (e.alive && e.team !== tm) e.plague = (e.plague || 0) + 1; B.ev.push({ k: 'aug', id: -1, a: 'plague', team: tm }); }
  if (t === 60 || t === 240) for (const o of ownersWith(B, 'shift')) {
    const list = B.units.filter(u => u.alive && u.owner === o && !u.summon); if (list.length < 2) continue;
    list.sort((a, b) => a.hp * 1000 / a.maxhp - b.hp * 1000 / b.maxhp);
    const lo = list[0], hi = list[list.length - 1];
    const lc = lo.c, lr = lo.r, hc = hi.c, hr = hi.r;
    B.grid[idx(lc, lr)] = -1; B.grid[idx(hc, hr)] = -1;
    lo.mvFrom = { c: lc, r: lr, t0: t, t1: t + 6, jump: true }; hi.mvFrom = { c: hc, r: hr, t0: t, t1: t + 6, jump: true };
    lo.c = hc; lo.r = hr; hi.c = lc; hi.r = lr; B.grid[idx(lo.c, lo.r)] = lo.id; B.grid[idx(hi.c, hi.r)] = hi.id;
    heal(B, lo, Math.floor(lo.maxhp * 50 / 100)); heal(B, hi, Math.floor(hi.maxhp * 50 / 100));
    B.ev.push({ k: 'aug', id: lo.id, a: 'shift', to: hi.id });
  }
  if (t === 240) for (const u of B.units) if (u.alive && hasAug(B, u, 'rewind')) { u.hp = Math.max(u.hp, Math.min(u.maxhp, u.startHp)); u.shield += Math.floor(u.maxhp * 20 / 100); B.ev.push({ k: 'aug', id: u.id, a: 'rewind' }); }
  B.revives = B.revives.filter(rv => {
    if (rv.t > t) return true;
    const u = B.units[rv.id];
    const spot = passable(B, rv.c, rv.r, -2) ? [rv.c, rv.r] : freeNear(B, rv.c, rv.r, null);
    if (!spot) return false;
    u.alive = true; u.hp = u.maxhp; u.c = spot[0]; u.r = spot[1]; u.mvFrom = null; u.stun = 0; u.mana = Math.min(u.manaMax - 1, 50); u.dots = [];
    B.grid[idx(u.c, u.r)] = u.id; B.ev.push({ k: 'revive', id: u.id }); B.ev.push({ k: 'aug', id: u.id, a: 'necro' });
    return false;
  });
}

// ===== 戰鬥指令：每位玩家每場一次 =====
function battleCommand(B, owner, type) {
  if (B.over || B.cmdUsed[owner] || !COMMANDS[type]) return false;
  B.cmdUsed[owner] = type;
  for (const u of B.units) if (u.alive && u.owner === owner) {
    if (type === 'charge') { u.buffs.push({ s: 'as', v: 35, u: B.t + 80 }); u.buffs.push({ s: 'atk', v: 15, u: B.t + 80 }); }
    if (type === 'rally') u.buffs.push({ s: 'dr', v: 25, u: B.t + 80 });
    if (type === 'hold') { heal(B, u, Math.floor(u.maxhp * 10 / 100)); u.shield += Math.floor(u.maxhp * 15 / 100); }
  }
  B.ev.push({ k: 'cmd', owner, type });
  (B.cmdLog = B.cmdLog || []).push({ t: B.t, owner, type }); // 連線時讓其他玩家在同一個 tick 重現
  return true;
}
