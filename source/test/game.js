const Z=require('./load');
let rounds=[],wins=[0,0];
for(let g=0;g<40;g++){
  const G=Z.createGame({seed:1000+g,players:[{name:'a',ai:1},{name:'b',ai:1},{name:'c',ai:1},{name:'d',ai:1}]});
  Z.startGame(G);
  let guard=0;
  while(G.phase!=='over'&&guard++<1e6) Z.update(G,50);
  rounds.push(G.round); wins[G.winner]++;
  if(g<3) console.log('game',g,'rounds',G.round,'hp',G.teams.map(t=>t.hp),'levels',G.players.map(p=>p.level),'stars',Object.values(G.board).map(u=>u.key+u.star).join(','));
}
rounds.sort((a,b)=>a-b);
console.log('rounds median',rounds[20],'min',rounds[0],'max',rounds[39],'wins',wins);
