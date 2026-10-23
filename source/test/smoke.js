// 快速自動測試：電腦對打各模式跑完不出錯（約 1 分鐘）。用法：node test/smoke.js
const Z = require('./load');
const run = (name, n, opt) => {
  const len = [];
  for (let g = 0; g < n; g++) {
    const ps = []; for (let i = 0; i < opt.players; i++) ps.push({ name: 'p' + i, ai: 1 });
    const G = Z.createGame({ seed: 500 + g * 17, players: ps, solo: opt.solo });
    Z.startGame(G); let k = 0;
    while (G.phase !== 'over' && k++ < 3e6) Z.update(G, 50);
    if (G.phase !== 'over') throw new Error(name + ' 第 ' + g + ' 場沒有結束');
    len.push(G.round);
  }
  len.sort((a, b) => a - b);
  console.log(`${name}：${n} 場 OK，回合中位數 ${len[n >> 1]}（${len[0]}～${len[n - 1]}）`);
};
run('2v2', 6, { players: 4 });
run('1對1', 4, { players: 2, solo: true });
run('單人 8 人', 3, { players: 8, solo: true });
console.log('全部通過');
