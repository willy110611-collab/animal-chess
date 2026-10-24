// 塔防模式模擬：用簡單的玩家策略（收編的就上場、有錢就升級）把每一關各跑 N 次，看通關率與星數。用法：node test/td_sim.js [次數]
const fs = require('fs'), vm = require('vm');
const code = ['data', 'sheet', 'engine', 'game', 'td'].map(f => fs.readFileSync(__dirname + '/../src/' + f + '.js', 'utf8')).join('\n');
const ctx = { console, Math, Object, Array, Map, Set, JSON, setTimeout: () => {}, PROFILE: {}, saveProfile() {}, toast() {}, sfx() {}, ME: 0, ARENAS: {} }; vm.createContext(ctx);
vm.runInContext(code + `
this.LV = TD_LEVELS; this.CF = TD_CFG;
this.sim = function (li, seed) {
  const L = TD_LEVELS[li];
  G = createGame({ seed, players: [{ name: 'p' }, { name: 'q', ai: 1 }], solo: true }); startGame(G);
  G.rules.augments = false; G.encounter = null; G.portal = null; G.portalVote = null; G.draft = null;
  const t = G.players[0].team, P = G.players[0];
  for (const k in G.board) delete G.board[k];
  for (const Q of G.players) { Q.bench = Q.bench.map(() => null); Q.augChoice = null; Q.ai = false; }
  P.gold = L.gold; P.level = TD_CFG.START_LEVEL; P.xp = 0;
  L.start.forEach((key, i) => { G.board[tdCell(t, 3 + i, 1)] = newUnit(G, key, 1, 0); });
  G.td = { li, wave: 0, front: TD_CFG.START_FRONT, leaks: 0, totalLeaks: 0, captured: 0, state: 'prep' };
  G.phase = 'prep'; G.timer = 0;
  const myTeam = () => t; this.myTeam = myTeam;
  let guard = 0;
  while (G.td.state !== 'over' && guard++ < 200) {
    // 準備：升級、把備戰席的上場（前線最前面、從中間往外）
    const ownK = () => new Set(Object.values(G.board).concat(P.bench.filter(Boolean)).map(u => u.key));
    for (let i = 0; i < P.shop.length; i++) if (P.shop[i] && ownK().has(P.shop[i])) act(G, 0, { t: 'buy', slot: i }); // 先買能湊升星的
    while (P.gold >= 4 && P.level < 8 && act(G, 0, { t: 'level' }) === 'ok') {}
    for (let i = 0; i < P.shop.length; i++) if (P.shop[i] && P.gold >= 3) act(G, 0, { t: 'buy', slot: i });
    const cells = []; for (let lr = G.td.front - 1; lr >= 0; lr--) for (const lc of [4, 3, 5, 2, 6, 1, 7, 0, 8]) cells.push(tdCell(t, lc, lr));
    for (let i = 0; i < P.bench.length; i++) { const u = P.bench[i]; if (!u) continue; const free = cells.find(c => !G.board[c]); if (free === undefined) break; act(G, 0, { t: 'move', uid: u.uid, to: { zone: 'board', cell: free } }); }
    tdStartWave(G);
    const B = G.battles[0].B;
    while (G.phase === 'combat') { tdUpdate(G, CFG.TICK_MS); for (const ev of B.ev) if (ev.k === 'tdcap') { const sl = P.bench.indexOf(null); if (sl >= 0) { P.bench[sl] = newUnit(G, ev.key, 1, 0); G.td.captured++; checkMerge(G, 0); } else P.gold++; } B.ev.length = 0; }
  }
  return { win: G.td.win, stars: G.td.stars || 0, front: G.td.front, wave: G.td.wave, leaks: G.td.totalLeaks, cap: G.td.captured };
};`, ctx);
// tdUpdate 用到 myTeam()
vm.runInContext('function myTeam(){ return G.players[0].team; }', ctx);
const N = +(process.argv[2] || 20);
for (let li = 0; li < ctx.LV.length; li++) {
  const rs = []; for (let i = 0; i < N; i++) rs.push(ctx.sim(li, 1000 + i * 31));
  const win = rs.filter(r => r.win).length, avg = k => (rs.reduce((s, r) => s + r[k], 0) / N).toFixed(1);
  const st = [0, 1, 2, 3].map(s => rs.filter(r => r.stars === s).length);
  console.log(`${ctx.LV[li].id}：通關 ${win}/${N}　星數(0/1/2/3)=${st.join('/')}　平均撐到第 ${avg('wave')} 波　漏 ${avg('leaks')}　收編 ${avg('cap')}`);
}
