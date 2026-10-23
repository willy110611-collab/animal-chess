const fs=require('fs'),vm=require('vm');
const code=['data','sheet','engine','game'].map(f=>fs.readFileSync(__dirname+'/../src/'+f+'.js','utf8')).join('\n');
const ctx={console,Math,Object,Array,Map,JSON};vm.createContext(ctx);
vm.runInContext(code+'\n;this.API={CFG,aliveTeams,ANIMALS,TRAITS,COMBOS,createBattle,runBattle,step,createGame,startGame,update,act,survivorStars,isPve,stageOf,ITEMS,MATS};',ctx);
module.exports=ctx.API;
