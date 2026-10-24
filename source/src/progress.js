// ===== 個人戰績、每日任務、造型碎片、新手教學局（全部存在這台裝置）=====

// ---------- 戰績 ----------
// 每場（自己被淘汰或整場結束時）記一筆：模式、名次、隊伍數、回合、最後陣容
const STATS_CFG = { KEEP: 200 }; // 最多保留幾場
function statsLoad() { try { return JSON.parse(localStorage.getItem('zoo_stats') || '[]'); } catch (e) { return []; } }
function statsSave(a) { try { localStorage.setItem('zoo_stats', JSON.stringify(a.slice(-STATS_CFG.KEEP))); } catch (e) {} }
let REC_SEED = null, REC_COMP = []; // REC_COMP：最近一場戰鬥我上場的動物
function recordMatch() {
  if (!G || G.tutorial || REC_SEED === G.seed) return;
  const T = G.teams[myTeam()]; if (!T || !T.place || !(T.out || G.phase === 'over')) return;
  if (G.phase !== 'over' && G.phase === 'combat' && T.dieRound === G.round) return; // 同回合名次可能還會往前調
  REC_SEED = G.seed;
  const P = G.players[ME], n = G.teams.length;
  const mode = G.solo ? (n === 2 ? 'duel' : 'solo') : (n > 2 ? 'duo8' : 'duo');
  let comp = (P.lastComp || []).map(u => Array.isArray(u) ? u[0] : u.key).filter(Boolean); if (!comp.length) comp = REC_COMP.slice();
  const dmg = MVP.seed === G.seed ? Object.values(MVP.dmg).reduce((s, v) => s + v, 0) : 0;
  const a = statsLoad(); a.push({ t: Date.now(), mode, online: !!G.online, place: T.place, n, round: G.round, comp, dmg: Math.round(dmg) }); statsSave(a);
  questEvent('game', { place: T.place, n, dmg });
}
const MODE_NAME = { solo: '單人混戰', duel: '1 對 1', duo: '雙人對戰', duo8: '雙人混戰' };
function openStats() {
  const a = statsLoad();
  if (!a.length) { $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>個人戰績</h2><p>還沒有紀錄，打完一場就會出現。</p>`; $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; }; return; }
  const top = g => g.place <= Math.max(1, Math.floor(g.n / 2)); // 前半名次
  const avg = (g) => (g.place - 1) / Math.max(1, g.n - 1); // 0＝第一、1＝最後
  const byMode = {}; for (const g of a) (byMode[g.mode] = byMode[g.mode] || []).push(g);
  const modeRows = Object.keys(byMode).map(m => { const L = byMode[m]; return `<tr><td>${MODE_NAME[m] || m}</td><td>${L.length}</td><td>${L.filter(g => g.place === 1).length}</td><td>${Math.round(L.filter(top).length / L.length * 100)}%</td><td>${(L.reduce((s, g) => s + g.place, 0) / L.length).toFixed(1)}</td></tr>`; }).join('');
  // 動物：出場次數、用了之後的平均表現
  const U = {}; for (const g of a) for (const k of new Set(g.comp)) { U[k] = U[k] || { n: 0, s: 0, top: 0 }; U[k].n++; U[k].s += avg(g); if (top(g)) U[k].top++; }
  const used = Object.entries(U).filter(([k]) => ANIMALS[k]).sort((x, y) => y[1].n - x[1].n).slice(0, 6);
  const best = Object.entries(U).filter(([k, v]) => ANIMALS[k] && v.n >= 3).sort((x, y) => (x[1].s / x[1].n) - (y[1].s / y[1].n)).slice(0, 3);
  // 常用陣容：以最後陣容的主要羈絆（前兩名）分類
  const C = {}; for (const g of a) { const tc = {}; for (const k of new Set(g.comp)) for (const t of (ANIMALS[k] || { traits: [] }).traits) tc[t] = (tc[t] || 0) + 1; const main = Object.entries(tc).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([t]) => TRAITS[t].name).join('＋') || '—'; C[main] = C[main] || { n: 0, top: 0 }; C[main].n++; if (top(g)) C[main].top++; }
  const comps = Object.entries(C).sort((x, y) => y[1].n - x[1].n).slice(0, 4);
  const recent = a.slice(-8).reverse().map(g => `<tr><td>${new Date(g.t).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</td><td>${MODE_NAME[g.mode] || g.mode}${g.online ? '・連線' : ''}</td><td><b>第 ${g.place} 名</b>／${g.n}</td><td>${g.comp.slice(0, 5).map(k => ANIMALS[k] ? pimg(k, 'mini') : '').join('')}</td></tr>`).join('');
  const ani = (k, v, txt) => `<div class="sani">${pimg(k)}<b>${ANIMALS[k].name}</b><small>${txt}</small></div>`;
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>個人戰績</h2>
    <div class="stsum"><span><b>${a.length}</b>場</span><span><b>${a.filter(g => g.place === 1).length}</b>第一</span><span><b>${Math.round(a.filter(top).length / a.length * 100)}%</b>前半</span><span><b>${(a.reduce((s, g) => s + g.place, 0) / a.length).toFixed(1)}</b>平均名次</span></div>
    <table class="sttab"><tr><th>模式</th><th>場</th><th>第一</th><th>前半</th><th>平均</th></tr>${modeRows}</table>
    <h3>最常用的動物</h3><div class="sanis">${used.map(([k, v]) => ani(k, v, `${v.n} 場`)).join('')}</div>
    ${best.length ? `<h3>勝率最高的動物 <small>（至少 3 場）</small></h3><div class="sanis">${best.map(([k, v]) => ani(k, v, `前半 ${Math.round(v.top / v.n * 100)}%`)).join('')}</div>` : ''}
    <h3>常用陣容</h3><table class="sttab">${comps.map(([m, v]) => `<tr><td>${m}</td><td>${v.n} 場</td><td>前半 ${Math.round(v.top / v.n * 100)}%</td></tr>`).join('')}</table>
    <h3>最近幾場</h3><table class="sttab">${recent}</table>`;
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; };
}

// ---------- 每日任務與造型碎片 ----------
// 每天從任務池抽 3 個，完成自動領碎片；碎片可以在「收藏與造型」解鎖造型
const QUEST_CFG = { PER_DAY: 3, SKIN_COST: 10 };
const QUESTS = [
  { id: 'play2', name: '玩 2 場', need: 2, shard: 2, ev: 'game' },
  { id: 'top', name: '拿到前半名次 1 次', need: 1, shard: 3, ev: 'game', ok: d => d.place <= Math.max(1, Math.floor(d.n / 2)) },
  { id: 'win', name: '拿到第一名 1 次', need: 1, shard: 4, ev: 'game', ok: d => d.place === 1 },
  { id: 'three', name: '做出 1 隻 3 星動物', need: 1, shard: 4, ev: 'three' },
  { id: 'tier2', name: '開戰時啟動 1 個第 2 階羈絆', need: 1, shard: 2, ev: 'tier', ok: d => d.max >= 1 },
  { id: 'tier3', name: '開戰時啟動 1 個第 3 階羈絆', need: 1, shard: 4, ev: 'tier', ok: d => d.max >= 2 },
  { id: 'dmg', name: '一場累計輸出 8000', need: 1, shard: 3, ev: 'game', ok: d => d.dmg >= 8000 },
  { id: 'roll', name: '刷新商店 15 次', need: 15, shard: 2, ev: 'roll' },
  { id: 'boss', name: '打贏 1 次魔王', need: 1, shard: 3, ev: 'boss' },
];
function questDay() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function questState() {
  let s; try { s = JSON.parse(localStorage.getItem('zoo_quest') || 'null'); } catch (e) { s = null; }
  const day = questDay();
  if (!s || s.day !== day) {
    let h = 0; for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0; // 用日期當種子，同一天固定
    const pool = QUESTS.slice(), pick = [];
    while (pick.length < QUEST_CFG.PER_DAY && pool.length) { h = (h * 1103515245 + 12345) >>> 0; pick.push(pool.splice(h % pool.length, 1)[0].id); }
    s = { day, ids: pick, prog: {}, done: {} };
  }
  return s;
}
function questSave(s) { try { localStorage.setItem('zoo_quest', JSON.stringify(s)); } catch (e) {} }
function questEvent(ev, d) {
  if (G && G.tutorial) return;
  const s = questState(); let changed = false;
  for (const id of s.ids) {
    const Q = QUESTS.find(q => q.id === id); if (!Q || Q.ev !== ev || s.done[id]) continue;
    if (Q.ok && !Q.ok(d || {})) continue;
    s.prog[id] = (s.prog[id] || 0) + 1; changed = true;
    if (s.prog[id] >= Q.need) { s.done[id] = 1; PROFILE.shards = (PROFILE.shards || 0) + Q.shard; saveProfile(); toast(`每日任務完成：${Q.name}（碎片 +${Q.shard}）`, 2600); sfx('chime'); }
  }
  if (changed) questSave(s);
}
function openQuests() {
  const s = questState(); questSave(s);
  const rows = s.ids.map(id => { const Q = QUESTS.find(q => q.id === id); if (!Q) return ''; const p = Math.min(Q.need, s.prog[id] || 0); return `<div class="quest ${s.done[id] ? 'ok' : ''}"><div><b>${Q.name}</b><small>獎勵 造型碎片 ×${Q.shard}</small></div><div class="qbar"><i style="width:${p / Q.need * 100}%"></i></div><span>${s.done[id] ? '完成' : p + ' / ' + Q.need}</span></div>`; }).join('');
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>每日任務</h2><p class="nethint">每天換一批，完成自動領獎。碎片 ${QUEST_CFG.SKIN_COST} 個可以在「收藏與造型」解鎖一個造型。</p>${rows}<p>目前碎片：<b>${PROFILE.shards || 0}</b></p><button class="btn" id="qColl">收藏與造型</button>`;
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; };
  $('qColl').onclick = () => openCollection();
}
function shardUnlock(id) {
  if (PROFILE.unlocked[id]) return;
  if ((PROFILE.shards || 0) < QUEST_CFG.SKIN_COST) { toast(`碎片不夠（需要 ${QUEST_CFG.SKIN_COST} 個）`); return; }
  PROFILE.shards -= QUEST_CFG.SKIN_COST; saveProfile(); unlockSkin(id); openCollection();
}

// ---------- 新手教學局（第一次玩：3 回合，固定商店，教升星、上場、羈絆、裝備）----------
const TUTMATCH = {
  shops: { 1: ['wolf', 'wolf', 'frog', 'squirrel', 'bat'], 2: ['squirrel', 'frog', 'hedgehog', 'koala', 'bee'], 3: ['frog', 'squirrel', 'redpanda', 'skunk', 'croc'] },
  steps: [
    { r: 1, txt: '歡迎！先在下方商店點兩次「野狼」把牠們買下來。三隻一樣的動物會自動合成 2 星！', done: () => ownUnits(G, ME).some(o => o.u.key === 'wolf' && o.u.star >= 2) },
    { r: 1, txt: '升星了！把 2 星野狼從備戰席拖到棋盤上（靠近你的那幾排）。', done: () => ownUnits(G, ME).some(o => o.u.key === 'wolf' && o.zone === 'board') },
    { r: 1, txt: '很好。按右下「準備好了」開打，戰鬥是自動的，看牠表現！', done: () => G.phase !== 'prep' },
    { r: 2, txt: '左側是「羈絆」。野狼、青蛙、松鼠都是「群居」，湊到 2 種群居動物就會啟動。買一隻青蛙或松鼠放上場試試。', done: () => { const ks = new Set(Object.values(G.board).filter(u => u.owner === ME).map(u => u.key)); return ['wolf', 'frog', 'squirrel', 'bee'].filter(k => ks.has(k) && ANIMALS[k].traits.includes('pack')).length >= 2; } },
    { r: 2, txt: '羈絆亮起來了！按「準備好了」開打。', done: () => G.phase !== 'prep' },
    { r: 3, txt: '打野怪掉了兩個材料（在商店上方）。把材料拖到野狼身上，兩個材料會合成一件裝備！', done: () => ownUnits(G, ME).some(o => o.u.items.some(i => ITEMS[i])) },
    { r: 3, txt: '合成成功！血條下面的小圖示就是裝備。按「準備好了」打完最後一場。', done: () => G.phase !== 'prep' },
  ],
};
function startTutorialMatch() {
  try { localStorage.setItem('zoo_tut', '1'); } catch (e) {} // 介面導覽不再自動跳出
  ME = 0; netReset(); newGame(2, true);
  G.tutorial = true; G.tutStep = 0; G.rules.prepSec = 999; G.timer = 999000; G.portalVote = null; G.portal = null; G.rules.encounters = false; G.rules.augments = false; G.rules.carousel = false; G.encounter = null;
  const P = G.players[ME]; P.gold = 4; for (let i = 0; i < P.bench.length; i++) P.bench[i] = null;
  const u = newUnit(G, 'wolf', 1, ME); G.pool.wolf--; P.bench[0] = u;
  P.shop = TUTMATCH.shops[1].slice();
  const A = G.players[1]; A.ai = true;
  refresh(); tutCoach();
}
// 每幀檢查教學進度
function tutFrame() {
  if (!G || !G.tutorial) return;
  if (G.phase === 'prep' && G.timer < 900000) { G.timer = 999000; } // 教學時不倒數
  const S = TUTMATCH.steps[G.tutStep];
  if (!S) { if (G.round > 3 || G.phase === 'over') tutFinish(); return; }
  if (G.round < S.r) return;
  if (S.done()) { G.tutStep++; sfx('chime'); tutCoach(); }
}
function tutCoach() {
  let el = $('coach'); if (!el) { el = document.createElement('div'); el.id = 'coach'; $('stage').appendChild(el); }
  const S = TUTMATCH.steps[G.tutStep];
  el.hidden = !S || G.round < S.r; if (el.hidden) return; // 下一回合的說明等到那回合才出現
  el.innerHTML = `<b>教學 ${G.tutStep + 1}/${TUTMATCH.steps.length}</b><p>${S.txt}</p><button class="btn" id="coachSkip">跳過教學</button>`;
  $('coachSkip').onclick = () => tutFinish(true);
}
function tutPrepHook() { // startPrep 之後：換成教學用的商店與材料
  if (!G || !G.tutorial) return;
  const P = G.players[ME], sh = TUTMATCH.shops[G.round]; if (sh) P.shop = sh.slice();
  if (G.round === 3 && !G.tutMats) { G.tutMats = true; P.items.push('twig', 'feather'); }
  if (G.round === 2) P.gold = Math.max(P.gold, 5);
  G.timer = 999000; tutCoach();
}
function tutFinish(skipped) {
  if (!G || !G.tutorial) return;
  try { localStorage.setItem('zoo_tutmatch', '1'); } catch (e) {}
  const el = $('coach'); if (el) el.hidden = true;
  G.tutorial = false;
  $('panel').innerHTML = `<div class="over"><h2>${skipped ? '已跳過教學' : '教學完成！'}</h2><p>你學會了升星、上場、羈絆和裝備。接下來去打一場真的吧！</p>${pimg('wolf')}<div><button class="btn primary" id="tutGo">選擇模式</button></div></div>`;
  $('overlay').hidden = false; $('tutGo').onclick = () => leaveToLobby(true);
}
