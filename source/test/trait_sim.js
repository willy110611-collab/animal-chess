// 羈絆模擬：8 人單人電腦對打，統計每個羈絆各階出現率與平均名次，以及每隻動物平均名次。用法：node test/trait_sim.js [場數]
const fs = require('fs'), vm = require('vm'), path = require('path');
const code = ['data', 'sheet', 'engine', 'game'].map(f => fs.readFileSync(path.join(__dirname, '../src/', f + '.js'), 'utf8')).join('\n');
const ctx = { console, Math, Object, Array, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(code + '\n;this.Z={createGame,startGame,update,ANIMALS,TRAITS,traitCounts,battleUnitsForTeam};', ctx); const Z = ctx.Z;
const N = +process.argv[2] || 30, TS = {}, AS = {};
for (let g = 0; g < N; g++) {
  const ps = []; for (let i = 0; i < 8; i++) ps.push({ name: 'p' + i, ai: 1 });
  const G = Z.createGame({ seed: 7100 + g * 13, players: ps, solo: true }); Z.startGame(G);
  const best = {}, comp = {}; let k = 0, inC = false;
  while (G.phase !== 'over' && k++ < 3e6) {
    Z.update(G, 50);
    if (G.phase === 'combat' && !inC) { inC = true;
      for (let t = 0; t < G.teams.length; t++) if (!G.teams[t].out) { const tc = Z.traitCounts(Z.battleUnitsForTeam(G, t, 0), 0); best[t] = best[t] || {}; for (const tr in tc) best[t][tr] = Math.max(best[t][tr] ?? -1, tc[tr].tier); comp[t] = Object.values(G.board).filter(u => G.players[u.owner].team === t).map(u => u.key); } }
    if (G.phase !== 'combat') inC = false;
  }
  for (let t = 0; t < G.teams.length; t++) { const pl = G.teams[t].place;
    for (const tr in best[t] || {}) for (let i = 0; i <= best[t][tr]; i++) { const s = (TS[tr] = TS[tr] || {})[i] = TS[tr][i] || { n: 0, p: 0 }; s.n++; s.p += pl; }
    for (const key of new Set(comp[t] || [])) { const s = AS[key] = AS[key] || { n: 0, p: 0 }; s.n++; s.p += pl; } }
}
const teams = N * 8;
for (const tr in Z.TRAITS) { const T = Z.TRAITS[tr]; console.log(T.name.padEnd(5, '　'), T.tiers.map((n, i) => { const s = (TS[tr] || {})[i]; return s ? `${n}：${(s.n / teams * 100).toFixed(0)}% 名次${(s.p / s.n).toFixed(1)}` : `${n}：0%`; }).join('　')); }
console.log('--- 動物平均名次（出現次數）');
console.log(Object.keys(Z.ANIMALS).map(k => { const s = AS[k]; return `${Z.ANIMALS[k].name}${Z.ANIMALS[k].cost} ${s ? (s.p / s.n).toFixed(2) + '(' + s.n + ')' : '-'}`; }).join('  '));
