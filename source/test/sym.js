const Z=require('./load');const keys=Object.keys(Z.ANIMALS);
let w=[0,0,0];
for(let s=0;s<400;s++){
  const r=Z.createBattle({seed:1,units:[]}).rng; // dummy
  let x=s*7919+13; const R=n=>{x=(x*1103515245+12345)&0x7fffffff;return x%n;};
  const comp=[];const used={};
  while(comp.length<6){const c=R(7),rr=R(4);if(used[c+','+rr])continue;used[c+','+rr]=1;comp.push({key:keys[R(keys.length)],star:1,c,r:rr});}
  const units=[];
  for(const u of comp){units.push({key:u.key,star:1,owner:0,team:0,c:u.c,r:u.r,items:[]});units.push({key:u.key,star:1,owner:2,team:1,c:6-u.c,r:7-u.r,items:[]});}
  const B=Z.runBattle({seed:s,terrain:{},units});
  w[B.winner<0?2:B.winner]++;
}
console.log('mirror team0,team1,draw',w);
