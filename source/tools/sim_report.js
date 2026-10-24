// 模擬對戰並輸出每隻動物的表現（給 tools/simsheet.py 寫進 Excel「模擬結果」分頁）
// 用法：node tools/sim_report.js [場數]
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = path.join(__dirname, '../src/');
const code = ['data', 'sheet', 'engine', 'game'].map(f => fs.readFileSync(src + f + '.js', 'utf8')).join('\n');
const ctx = { console, Math, Object, Array, Map, JSON }; vm.createContext(ctx);
vm.runInContext(code + '\n;this.Z={createGame,startGame,update,ANIMALS};', ctx); const Z = ctx.Z;
const N = +process.argv[2] || 40, S = {}; let rounds = [];
for (let g = 0; g < N; g++) {
  const ps = []; for (let i = 0; i < 8; i++) ps.push({ name: 'p' + i, ai: 1 });
  const G = Z.createGame({ seed: 9000 + g * 7, players: ps, solo: true }); Z.startGame(G);
  const snap = {}; let k = 0, inC = false;
  while (G.phase !== 'over' && k++ < 3e6) {
    Z.update(G, 50);
    if (G.phase === 'combat' && !inC) { inC = true; for (let t = 0; t < G.teams.length; t++) if (!G.teams[t].out) snap[t] = Object.values(G.board).filter(u => G.players[u.owner].team === t).map(u => u.key); }
    if (G.phase !== 'combat') inC = false;
  }
  rounds.push(G.round);
  for (let t = 0; t < G.teams.length; t++) { const T = G.teams[t]; for (const key of new Set(snap[t] || [])) { const s = S[key] = S[key] || { n: 0, place: 0, top: 0 }; s.n++; s.place += T.place; if (T.place <= 4) s.top++; } }
}
rounds.sort((a, b) => a - b);
const out = Object.keys(Z.ANIMALS).map(k => { const s = S[k] || { n: 0, place: 0, top: 0 }; return { key: k, name: Z.ANIMALS[k].name, cost: Z.ANIMALS[k].cost, n: s.n, avg: s.n ? +(s.place / s.n).toFixed(2) : null, top: s.n ? Math.round(s.top / s.n * 100) : null }; });
console.log(JSON.stringify({ games: N, median: rounds[N >> 1], units: out }));
