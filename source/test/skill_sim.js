// 技能模擬：同費隨機陣容對打，統計每隻動物的技能表現。用法：node test/skill_sim.js [場數] [engine 檔案路徑（比較用，可省略）]
// 欄位：每場施放次數、第一次施放秒數、空放率（放了沒打到／沒效果）、技能傷害佔總傷害、勝率
const fs = require('fs'), vm = require('vm'), path = require('path');
const N = +process.argv[2] || 400, engFile = process.argv[3] ? path.join(__dirname, '..', process.argv[3]) : path.join(__dirname, '../src/engine.js');
const code = ['data', 'sheet'].map(f => fs.readFileSync(path.join(__dirname, '../src/', f + '.js'), 'utf8')).join('\n') + '\n' + fs.readFileSync(engFile, 'utf8');
const ctx = { console, Math, Object, Array, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(code + '\n;this.Z={CFG,ANIMALS,createBattle,step};', ctx); const Z = ctx.Z;
const keys = Object.keys(Z.ANIMALS), S = {};
let seed = 12345; const rnd = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
const EFFECT = new Set(['dmg', 'cc', 'heal', 'buff', 'taunt', 'zone', 'spawn', 'grab', 'miss']);
for (let g = 0; g < N; g++) {
  const units = [], cost = 1 + rnd(5), star = g % 3 === 0 ? 2 : 1;
  for (const team of [0, 1]) {
    const used = new Set();
    for (let i = 0; i < 6; i++) {
      const pool = keys.filter(k => Math.abs(Z.ANIMALS[k].cost - cost) <= 1);
      const key = pool[rnd(pool.length)];
      let c, r; do { c = rnd(Z.CFG.COLS); r = rnd(4); } while (used.has(c + ',' + r)); used.add(c + ',' + r);
      units.push({ key, star, owner: team * 2 + (i & 1), team, c: team ? Z.CFG.COLS - 1 - c : c, r: team ? Z.CFG.ROWS - 1 - r : r, items: [] });
    }
  }
  const B = Z.createBattle({ seed: 777 + g, units, terrain: {} });
  const st = B.units.map(u => ({ key: u.key, casts: 0, first: -1, wasted: 0, sk: 0, all: 0 }));
  while (!B.over) {
    Z.step(B);
    const castNow = {};
    for (const e of B.ev) {
      if (e.k === 'skill' && st[e.id]) { st[e.id].casts++; if (st[e.id].first < 0) st[e.id].first = B.t; castNow[e.id] = 0; }
      if (e.k === 'dmg' && e.src >= 0 && st[e.src]) { st[e.src].all += e.a; if (e.sk) st[e.src].sk += e.a; }
    }
    for (const e of B.ev) {
      const who = e.k === 'dmg' ? e.src : e.k === 'cc' || e.k === 'heal' ? -1 : e.id;
      if (EFFECT.has(e.k) && castNow[who] !== undefined) castNow[who]++;
    }
    // cc、heal 事件沒有來源：同一 tick 只有一個人放技能時算給他
    const ids = Object.keys(castNow);
    if (ids.length === 1) for (const e of B.ev) if (e.k === 'cc' || e.k === 'heal') castNow[ids[0]]++;
    for (const id in castNow) if (!castNow[id] && !['koala', 'eagle', 'skunk', 'flamingo', 'bee'].includes(st[id].key)) st[id].wasted++;
    B.ev.length = 0;
  }
  B.units.forEach((u, i) => {
    if (!Z.ANIMALS[u.key] || u.summon) return;
    const s = S[u.key] = S[u.key] || { n: 0, casts: 0, first: 0, fn: 0, wasted: 0, sk: 0, all: 0, win: 0 };
    const x = st[i]; s.n++; s.casts += x.casts; s.wasted += x.wasted; s.sk += x.sk; s.all += x.all;
    if (x.first >= 0) { s.first += x.first; s.fn++; }
    if (B.winner === u.team) s.win++;
  });
}
console.log('動物　　　 費 場數 施放/場 首放秒 空放% 技能傷害% 勝率%');
let tw = 0, tc = 0, tsk = 0, tall = 0;
for (const k of keys) { const s = S[k]; if (!s) continue; tw += s.wasted; tc += s.casts; tsk += s.sk; tall += s.all;
  console.log(Z.ANIMALS[k].name.padEnd(6, '　'), Z.ANIMALS[k].cost, String(s.n).padStart(4), (s.casts / s.n).toFixed(2).padStart(6), (s.fn ? s.first / s.fn / 20 : 0).toFixed(1).padStart(6), (s.casts ? s.wasted * 100 / s.casts : 0).toFixed(0).padStart(5), (s.all ? s.sk * 100 / s.all : 0).toFixed(0).padStart(8), (s.win * 100 / s.n).toFixed(0).padStart(6)); }
console.log('全體空放率', (tw * 100 / tc).toFixed(1) + '%', '技能傷害佔比', (tsk * 100 / tall).toFixed(1) + '%');
