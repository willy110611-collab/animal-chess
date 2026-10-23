const Z=require('./load');const N=+process.argv[2]||40;let places={},len=[];
for(let g=0;g<N;g++){const ps=[];for(let i=0;i<8;i++)ps.push({name:'p'+i,ai:1});const G=Z.createGame({seed:900+g*31,players:ps});Z.startGame(G);let n=0;while(G.phase!=='over'&&n++<3e6)Z.update(G,50);
 len.push(G.round);G.teams.forEach((T,i)=>{(places[i]=places[i]||[0,0,0,0,0])[T.place]++;});}
len.sort((a,b)=>a-b);console.log('8人 median rounds',len[N>>1],'min',len[0],'max',len[N-1]);console.log('名次分布(隊:[_,1,2,3,4])',places);
