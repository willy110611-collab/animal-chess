// ===== 帳號＋自家伺服器連線（Cloudflare）=====
// 有設定 SERVER 時：開房、排位配對、天梯都走自己的伺服器，整場遊戲由伺服器跑，玩家（包括房主）改不了結果。
// 連不上伺服器時，開房連線會退回舊的公用中繼模式（不計分）。
const SRV_CFG = {
  SERVER: 'https://zoochess.willy110611.workers.dev',   // 部署後填入，例如 https://zoochess.xxx.workers.dev
  PING_MS: 3000,              // 多久測一次延遲
  RECONNECT_TRIES: 8,         // 斷線自動重連幾次
  DEAD_MS: 9000,              // 多久沒收到伺服器訊息就當作斷線
};
function srvUrl() { let o = null; try { o = localStorage.getItem('zoo_server'); } catch (e) {} const u = o || SRV_CFG.SERVER; return /^https?:\/\//.test(u) ? u.replace(/\/$/, '') : ''; }
const SITE_URL = 'https://willy110611-collab.github.io/animal-chess/';
const srvOn = () => !!srvUrl() && !netBlocked();
const ACC = { token: '', me: null };
try { ACC.token = localStorage.getItem('zoo_tok') || ''; ACC.me = JSON.parse(localStorage.getItem('zoo_me') || 'null'); } catch (e) {}
function accSave() { try { localStorage.setItem('zoo_tok', ACC.token || ''); localStorage.setItem('zoo_me', JSON.stringify(ACC.me)); } catch (e) {} accBadge(); }
async function accApi(path, body) {
  try {
    const r = await fetch(srvUrl() + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, ACC.token ? { Authorization: 'Bearer ' + ACC.token } : {}), body: body ? JSON.stringify(body) : undefined });
    return await r.json();
  } catch (e) { return { err: '連不上，請確認網路' }; }
}
async function accRefresh() { if (!srvOn() || !ACC.token) return; const r = await accApi('/api/me'); if (r.ok) { ACC.me = r.me; accSave(); } else if (r.err === '請重新登入') { ACC.token = ''; ACC.me = null; accSave(); } }
function accBadge() {
  const b = document.getElementById('btnAcc'); if (!b) return;
  b.hidden = false; // 登入入口永遠保留
  b.innerHTML = ACC.me ? `${esc(ACC.me.name)} ${tierBadge(ACC.me.lp)}` : '登入';
}
// 需要登入時先跳登入框，登入後繼續原本要做的事
function needLogin(then) { if (ACC.token && ACC.me) { then(); return; } openAccount(then); }
function openAccount(then, startup) {
  const me = ACC.me, P = startup ? $('spCard') : $('panel');
  if (!srvOn()) { // 預覽頁（claude.ai、本機檔）不能連線：仍顯示登入入口，告訴玩家去正式網址
    P.innerHTML = `${startup ? '' : '<button class="x" id="mX" aria-label="關閉">✕</button>'}<h2>登入</h2>
      <p class="nethint">這個頁面無法連線，請到正式網址登入帳號：<br><a href="${SITE_URL}" target="_blank" rel="noopener"><b>${SITE_URL}</b></a></p>
      <button class="btn primary" id="acOpen" type="button">前往正式網址</button>
      ${startup ? '<button class="btn" id="acSkip" type="button">先不登入，只玩練習</button>' : ''}`;
    if (startup) P.hidden = false; else $('overlay').hidden = false;
    if (!startup) $('mX').onclick = () => { $('overlay').hidden = true; };
    $('acOpen').onclick = () => window.open(SITE_URL, '_blank');
    if ($('acSkip')) $('acSkip').onclick = () => splashHide();
    return;
  }
  P.innerHTML = `${startup ? '' : '<button class="x" id="mX" aria-label="關閉">✕</button>'}<h2>${startup ? '登入' : '帳號'}</h2>` + (me ? `
    <div class="lpme">${tierBadge(me.lp)}<b>${me.lp} LP</b><small>帳號 ${esc(me.user)}・${me.games} 場・第一名 ${me.wins} 次</small></div>
    <label class="rnum">暱稱<input id="acName" maxlength="8" value="${esc(me.name)}"></label>
    <div class="xbtns"><button class="btn moss" id="acRename">更新暱稱</button><button class="btn" id="acOut">登出</button></div>` : `
    <div class="acTabs nmode"><button class="btn on" data-ac="in">登入</button><button class="btn" data-ac="up">註冊</button></div>
    <form class="netbox" id="acForm" autocomplete="on">
      <label class="rnum">帳號<input id="acUser" maxlength="16" autocomplete="username" autocapitalize="none" placeholder="英文小寫、數字、底線"></label>
      <label class="rnum">密碼<input id="acPass" type="password" maxlength="64" autocomplete="current-password" placeholder="至少 6 個字"></label>
      <label class="rnum" id="acNameRow" hidden>暱稱<input id="acNick" maxlength="8" value="${esc(netName())}"></label>
      <button class="btn primary" id="acGo" type="submit">登入</button>
      ${startup ? '<button class="btn" id="acSkip" type="button">先不登入，只玩練習</button>' : ''}
    </form>`);
  if (startup) P.hidden = false; else $('overlay').hidden = false;
  if (!startup) $('mX').onclick = () => { $('overlay').hidden = true; };
  if ($('acSkip')) $('acSkip').onclick = () => splashHide();
  if (me) {
    $('acRename').onclick = async () => { const r = await accApi('/api/rename', { name: $('acName').value }); if (r.ok) { ACC.me = r.me; netSetName(r.me.name); accSave(); toast('已更新'); } else toast(r.err); };
    $('acOut').onclick = async () => { await accApi('/api/logout', {}); ACC.token = ''; ACC.me = null; accSave(); $('overlay').hidden = true; splashShowLogin(); };
    return;
  }
  let mode = 'in';
  P.querySelectorAll('[data-ac]').forEach(b => b.onclick = () => { mode = b.dataset.ac; P.querySelectorAll('[data-ac]').forEach(x => x.classList.toggle('on', x === b)); $('acNameRow').hidden = mode !== 'up'; $('acGo').textContent = mode === 'up' ? '註冊並登入' : '登入'; $('acPass').autocomplete = mode === 'up' ? 'new-password' : 'current-password'; });
  $('acForm').onsubmit = async e => {
    e.preventDefault(); $('acGo').disabled = true;
    const body = { user: $('acUser').value, pass: $('acPass').value, name: $('acNick').value };
    const r = await accApi(mode === 'up' ? '/api/register' : '/api/login', body);
    $('acGo').disabled = false;
    if (!r.ok) { toast(r.err || '失敗', 3000); return; }
    ACC.token = r.token; ACC.me = r.me; netSetName(r.me.name); accSave();
    toast(mode === 'up' ? '註冊完成，歡迎！' : `歡迎回來，${r.me.name}`);
    if (startup) { splashHide(); srvResume(); } else if (then) then(); else openAccount();
  };
}

// ---------- 伺服器房間（玩家都是「客人」，伺服器當房主）----------
function srvWs(path) { return srvUrl().replace(/^http/, 'ws') + path; }
function srvConnect(path, onFail) {
  let ws; try { ws = new WebSocket(srvWs(path)); } catch (e) { onFail && onFail(); return; }
  NET.srv = true; NET.ws = ws; NET.role = 'client'; NET.myId = ACC.me.uid;
  NET.outbox = NET.outbox || [];
  NET.host = { send(x) { if (NET.ws && NET.ws.readyState === 1) NET.ws.send(JSON.stringify(x)); else if (x.k === 'act' && NET.outbox.length < 20) NET.outbox.push(x); } }; // 重連中的操作先排隊，連上再送
  let opened = false;
  ws.onopen = () => { opened = true; NET.tries = 0; NET.lastHeard = performance.now(); NET.host.send({ k: 'hello', token: ACC.token }); const q = NET.outbox.splice(0); for (const x of q) NET.host.send(x); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } NET.lastHeard = performance.now(); srvMsg(m); };
  ws.onclose = () => {
    if (NET.ws !== ws || ws.dead) return; ws.dead = true;
    if (!opened && !NET.code) { onFail && onFail(); return; }
    if (NET.srv && NET.code && (NET.tries || 0) < SRV_CFG.RECONNECT_TRIES) { NET.tries = (NET.tries || 0) + 1; toast('連線中斷，重新連線中…', 2000); setTimeout(() => { if (NET.srv && NET.ws === ws) srvConnect('/ws/room/' + NET.code); }, 600 * NET.tries); }
    else if (NET.srv) { toast('連線中斷了', 3200); netLeave(); }
  };
  clearInterval(NET.pingT);
  NET.pingT = setInterval(() => { // 心跳：太久沒收到伺服器任何訊息就當作斷線，主動重連（手機切網路時 close 事件常常不會來）
    if (!NET.srv || !NET.ws) return;
    if (NET.ws.readyState === 1) NET.host.send({ k: 'ping', t: performance.now() });
    if (performance.now() - NET.lastHeard > SRV_CFG.DEAD_MS && NET.ws.onclose) { const w = NET.ws; try { w.close(); } catch (e) {} w.onclose(); }
  }, SRV_CFG.PING_MS);
}
function srvMsg(m) {
  if (m.k === 'pong') { NET.rtt = Math.round(performance.now() - m.t); netRttShow(); return; }
  if (m.k === 'room') { NET.code = m.code; NET.ownerSeat = m.owner; NET.ranked = m.ranked; NET.solo = !!m.solo; }
  if (m.k === 'lp') { srvLp(m); return; }
  netClientMsg(m);
}
function srvLp(m) {
  LADDER_RES = { seed: m.seed, before: m.before, after: m.after, d: m.d, up: ladderTier(m.after) > ladderTier(m.before) };
  if (ACC.me) { if (m.solo) { ACC.me.lp1 = m.after; ACC.me.games1 = (ACC.me.games1 || 0) + 1; if (m.place === 1) ACC.me.wins1 = (ACC.me.wins1 || 0) + 1; } else { ACC.me.lp = m.after; ACC.me.games++; if (m.place === 1) ACC.me.wins++; } accSave(); }
  LADDER.lp = m.after; LADDER.hist.unshift({ t: Date.now(), d: m.d, lp: m.after, place: m.place, n: G ? G.teams.length : 2, mode: '連線' }); LADDER.hist = LADDER.hist.slice(0, 20); ladderSave();
  const el = document.getElementById('lpLive'); if (el) el.outerHTML = ladderResHtml(LADDER_RES);
  if (LADDER_RES.up) setTimeout(() => { banner('晉級！', ladderTierName(m.after), 'win'); if (typeof confetti === 'function') confetti(); }, 600);
}
// 登入後：有沒打完的對局就接回去
async function srvResume() { if (!srvOn() || !ACC.token || NET.role) return; const r = await accApi('/api/active'); if (r && r.ok && r.code && !NET.role) { toast('回到進行中的對局…', 2500); srvJoin(r.code); } }
function srvHost() { if (NET.role) return; needLogin(() => { toast('建立房間中…'); NET.code = ''; srvConnect('/ws/new?mode=4', () => { toast('連不上，請確認網路後再試', 3200); netReset(); }); }); }
function srvJoin(code) { if (NET.role) return; needLogin(() => { toast('連線中…'); NET.code = code; srvConnect('/ws/room/' + code, () => { toast('連不上，請確認網路後再試', 3000); netReset(); }); }); }
// 網速：右上角小小的訊號格＋延遲（綠＝順、黃＝普通、紅＝卡）；最近幾次的抖動大也算卡
const NETQ = { GOOD_MS: 120, OK_MS: 250, JITTER_MS: 80 };
function netRttShow() {
  let el = document.getElementById('netRtt');
  if (!el) { const st = document.getElementById('stage'); if (!st) return; el = document.createElement('div'); el.id = 'netRtt'; el.innerHTML = '<i></i><i></i><i></i><b></b>'; st.appendChild(el); }
  const r = NET.rtt; NET.rtts = (NET.rtts || []).concat(r).slice(-5);
  const jit = Math.max(...NET.rtts) - Math.min(...NET.rtts);
  const q = r < NETQ.GOOD_MS && jit < NETQ.JITTER_MS ? 3 : r < NETQ.OK_MS ? 2 : 1;
  el.className = 'q' + q; el.querySelector('b').textContent = r + 'ms'; el.hidden = !G;
  el.title = q === 3 ? '連線順暢' : q === 2 ? '連線普通' : '連線不穩';
}
// ---------- 伺服器排位配對 ----------
function srvMatchStart() {
  needLogin(() => {
    let ws; try { ws = new WebSocket(srvWs('/ws/mm')); } catch (e) { mmStatus('連不上，請確認網路後再試'); return; }
    MM.ws = ws; MM.t0 = Date.now(); MM.mq = { srv: true }; mmStatus('連線中…');
    ws.onopen = () => ws.send(JSON.stringify({ k: 'q', token: ACC.token, mode: MM.mode, tz: mmTz() }));
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.k === 'err') { mmStatus(m.why); }
      else if (m.k === 'stat') mmStatus(`配對中… 已等 ${Math.round(m.wait / 1000)} 秒<br>目前排隊：${m.n} 人（同地區 ${m.near} 人）${m.n <= 1 ? '<br>還沒有其他人在排，可以找朋友一起按，或先去練習' : ''}`);
      else if (m.k === 'match') { MM.done = true; MM.ws = null; MM.mq = null; try { ws.close(); } catch (x) {} mmStatus(`配到 ${m.n} 人！進房中…`); NET.code = m.room; srvConnect('/ws/room/' + m.room, () => toast('進房失敗')); }
    };
    ws.onclose = () => { if (MM.ws === ws) { MM.ws = null; MM.mq = null; mmStatus('配對連線中斷了，請再按一次'); } };
  });
}
function srvMatchStop() { if (MM.ws) { try { MM.ws.send(JSON.stringify({ k: 'cancel' })); MM.ws.close(); } catch (e) {} MM.ws = null; } MM.mq = null; mmStatus('已取消'); }
// ---------- 伺服器天梯 ----------
let LADDER_TAB = 'duo';
async function srvLadder() {
  const box = document.getElementById('glList'); if (!box) return;
  const tab = LADDER_TAB;
  const r = await accApi('/api/ladder?mode=' + tab); if (!GL.open || tab !== LADDER_TAB) return;
  if (!r.ok) { box.innerHTML = `<small>${esc(r.err || '讀取失敗')}</small>`; return; }
  if (r.me) { ACC.me = r.me; accSave(); ladderMeBox(); }
  document.getElementById('glRank').textContent = r.rank ? `你是第 ${r.rank} 名／共 ${r.total} 人` : `共 ${r.total} 人${ACC.me ? '（你還沒有這個模式的排位紀錄）' : ''}`;
  box.innerHTML = r.top.map((x, i) => `<div class="lprow ${ACC.me && x.uid === ACC.me.uid ? 'me' : ''}"><span>${i + 1}</span><b>${esc(x.name)}${ACC.me && x.uid === ACC.me.uid ? '（你）' : ''}</b>${tierBadge(x.lp)}<em>${x.lp}</em></div>`).join('') || '<small>還沒有人打過這個模式的排位。</small>';
}
function ladderMeBox() {
  const el = document.getElementById('lpMeBox'); if (!el) return;
  const me = ACC.me; if (!me) { el.innerHTML = '<p class="nethint">登入帳號後才會有天梯分數。</p><button class="btn primary" id="lpLogin">登入／註冊</button>'; $('lpLogin').onclick = () => { $('overlay').hidden = true; splashShowLogin(); }; return; }
  const solo = LADDER_TAB === 'solo', lp = solo ? me.lp1 || 0 : me.lp, g = solo ? me.games1 || 0 : me.games, w = solo ? me.wins1 || 0 : me.wins, wr = g ? Math.round(w * 100 / g) : 0;
  el.innerHTML = `<div class="lpme">${tierBadge(lp)}<b>${lp} LP</b><small>${esc(me.name)}・${g} 場・第一名 ${w} 次（${wr}%）</small></div><div class="lpbar"><i style="width:${lp >= 700 ? 100 : (lp % 100)}%"></i></div>`;
}
// 開場畫面：載入完成後，沒登入就在開場畫面上顯示登入框（後面不顯示遊戲）；已登入或預覽頁就直接進大廳
let SPLASH_T0 = performance.now(), splashDoneOnce = false;
async function splashFinish() {
  if (splashDoneOnce) return; splashDoneOnce = true;
  accBadge();
  LD.set(92, srvOn() ? '連線中' : '完成');
  if (srvOn() && ACC.token) await Promise.race([accRefresh(), new Promise(r => setTimeout(r, 4000))]);
  if (srvOn()) accApi('/api/meta').then(r => { if (r && r.ok) try { localStorage.setItem('zoo_meta', JSON.stringify(r.list || [])); } catch (e) {} }); // 練習模式的電腦也會模仿玩家陣容
  LD.set(100, '完成');
  const wait = Math.max(0, 900 - (performance.now() - SPLASH_T0)); // 至少讓進度條跑完一小段，不會閃一下就消失
  let back = ''; // 重開 App：還有沒打完的對局就直接接回去（已經被淘汰就不會有）
  if (srvOn() && ACC.token) { const r = await Promise.race([accApi('/api/active'), new Promise(x => setTimeout(() => x(null), 3000))]); if (r && r.ok && r.code) back = r.code; }
  setTimeout(() => {
    if (!ACC.token) { $('spLoad').classList.add('done'); openAccount(null, true); }
    else { splashHide(); if (back) { toast('回到進行中的對局…', 2500); srvJoin(back); } }
  }, wait + 350);
}
function splashHide() { const s = $('splash'); if (!s) return; s.classList.add('out'); const sc = $('spCard'); if (sc) { sc.innerHTML = ''; sc.hidden = true; } /* 清掉登入框，避免跟設定裡的帳號框 id 重複 */ setTimeout(() => { if (s.classList.contains('out')) s.style.display = 'none'; }, 700); accBadge(); }
// 登出或從設定按登入：回到開場的登入畫面（後面不顯示遊戲）
function splashShowLogin() {
  const s = $('splash'); if (!s) { openAccount(); return; }
  if (G && NET.role) netLeave();
  s.style.display = ''; s.classList.remove('out'); $('spLoad').classList.add('done');
  openAccount(null, true);
}
function openLadderSrv() {
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>天梯</h2>
    <div class="ltabs"><button class="btn ${LADDER_TAB === 'duo' ? 'on' : ''}" data-lt="duo">雙人</button><button class="btn ${LADDER_TAB === 'solo' ? 'on' : ''}" data-lt="solo">單人</button></div>
    <div id="lpMeBox"></div>
    <h3>全球排行榜 <small id="glRank">讀取中…</small></h3><div class="lplist" id="glList"><small>連線中…</small></div>
    <p class="nethint">牌位：${LADDER_CFG.TIERS.join(' → ')}，每 100 LP 一階。雙人：2 隊對戰贏 +${LADDER_CFG.WIN2}／輸 ${LADDER_CFG.LOSE2}，4 隊依名次 ${LADDER_CFG.PLACE4.slice(1).map(x => (x > 0 ? '+' : '') + x).join('／')}。單人：第 1 名 +36、最後一名 −36，中間依名次平均。對手越強贏越多、輸越少；和真人對戰才計分。</p>`;
  $('overlay').hidden = false;
  $('mX').onclick = () => { $('overlay').hidden = true; GL.open = false; };
  $('panel').querySelectorAll('[data-lt]').forEach(b => b.onclick = () => { LADDER_TAB = b.dataset.lt; openLadderSrv(); });
  ladderMeBox();
  GL.open = true; srvLadder();
}
window.__act = a => actMe(a); // 測試用
window.__ff = (round, phase) => { if (!G || NET.role) return; let n = 0; while (G.phase !== 'over' && !(G.round >= round && G.phase === phase) && n++ < 2e5) { for (const P of G.players) if (P.augChoice && !P.ai) act(G, P.id, { t: 'aug', id: P.augChoice[0] }); update(G, 50); } return G.round + G.phase; }; // 測試用：快轉到指定回合
window.__netClose = () => NET.ws && NET.ws.close(); // 測試用
window.__netDbg = () => ({ code: NET.code, ws: NET.ws && NET.ws.readyState, tries: NET.tries, role: NET.role, srv: NET.srv });
