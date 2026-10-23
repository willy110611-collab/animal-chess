// 先讓瀏覽器把大廳畫出來，再做比較重的初始化（3D 場景、頭像），避免開啟時黑屏
let booted = false;
const goBoot = () => { if (booted) return; booted = true; performance.mark('boot-start'); LD.set(35, '準備場地'); try { boot(); } catch (e) { console.error(e); splashFinish(); } performance.mark('boot-end'); };
requestAnimationFrame(() => setTimeout(goBoot, 0));
setTimeout(goBoot, 400); // 背景分頁不會跑 requestAnimationFrame，用計時器保底
