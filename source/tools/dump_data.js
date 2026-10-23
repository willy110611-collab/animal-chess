// 讀 src/data.js（＋sheet.js 若存在），輸出 JSON 給 data2xlsx.py
const fs=require('fs'),vm=require('vm'),path=require('path');
const src=path.join(__dirname,'../src/');
let code=fs.readFileSync(src+'data.js','utf8');
if(fs.existsSync(src+'sheet.js')&&!process.argv.includes('--raw'))code+='\n'+fs.readFileSync(src+'sheet.js','utf8');
const ctx={console,Math,Object,Array,JSON};vm.createContext(ctx);
vm.runInContext(code+'\n;this.OUT={CFG,ANIMALS,TRAITS,MATS,ITEMS,AUGMENTS,EVOLVE,SYNERGY_BONUS,PREY_BONUS};',ctx);
process.stdout.write(JSON.stringify(ctx.OUT));
