// ===== 開房連線（房主制）=====
// 房主的瀏覽器跑整場遊戲（唯一真相）；其他人只送操作、收畫面。
// 戰鬥用同一份種子在各自手機上重跑（決定性模擬），只同步 tick 與戰鬥指令，流量很小。
// 連線走公用 MQTT 中繼（WebSocket），手機行動網路也能通；需要用 GitHub Pages 網址開，Claude 預覽頁不能連線。
// 訊息會經過公用伺服器、別人知道房號也能看到遊戲資料（不含個資），只適合朋友間玩。
const NET_CFG = {
  BROKERS: ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'], // 依序嘗試
  PREFIX: 'zoochess/v1/',      // 頻道前綴（改了就跟舊版房間互不相通）
  HELLO_WAIT_MS: 6000,         // 加入時每個伺服器等房主回覆多久
  DROP_MS: 15000,              // 多久沒收到訊息算斷線
  SNAP_MS: 250,                // 房主多久檢查一次要不要送畫面
  TICK_MS: 200,                // 戰鬥中多久送一次 tick
  EXTRAP_TICKS: 30,            // 沒收到房主 tick 時，最多自己往前推幾個 tick（原本 10，網路一抖就停格）
  BUFFER_TICKS: 12,            // 客人的戰鬥落後房主幾個 tick 播放（吸收網路延遲，12 = 0.6 秒）
  CATCHUP_PCT: 25,             // 客人戰鬥落後太多時，最多加快幾 % 追上（平滑追趕，不瞬移）
  SNAP_JUMP_TICKS: 40,         // 落後超過幾個 tick 才直接跳過去（例如切回 App）
  PREDICT: ['buy', 'sell', 'move', 'level', 'equip', 'lock'], // 這些操作先在自己手機上做出來，不等伺服器回覆
  SNAP_KEEPALIVE_MS: 2000,     // 畫面沒變時，最久多久還是送一次（校正倒數計時）
  TAKEOVER_GAP_MS: 6000,       // 房主斷線時，候補順位每往後一位多等幾毫秒才接手
  MM_PING_MS: 2000,            // 排位配對：多久廣播一次「我在排」
  MM_STALE_MS: 7000,           // 多久沒消息就當作對方取消排隊
  MM_SAME_TZ: 2,               // 時區差幾小時內算「同地區」
  MM_WIDEN_MS: 20000,          // 等多久後放寬：跨地區也配、人不滿用 AI 補
  MM_JOIN_WAIT_MS: 12000,      // 配到後房主最多等成員進房多久就開打
};
// ---- 迷你 MQTT 3.1.1 客戶端（只用 QoS 0 的發布／訂閱）----
const _te = new TextEncoder(), _td = new TextDecoder();
const mqStr = s => { const b = _te.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
function mqPkt(h, vh, pl) { const body = vh.concat(Array.from(pl || [])); const len = []; let n = body.length; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0); return new Uint8Array([h, ...len, ...body]); }
class MiniMqtt {
  constructor(url) { this.url = url; this.buf = new Uint8Array(0); this.pid = 1; this.onmsg = null; this.onclose = null; }
  connect(cid) {
    return new Promise((res, rej) => {
      let ws; try { ws = this.ws = new WebSocket(this.url, ['mqtt']); } catch (e) { rej(e); return; }
      ws.binaryType = 'arraybuffer';
      const to = setTimeout(() => { rej(new Error('timeout')); try { ws.close(); } catch (e) {} }, 7000);
      ws.onopen = () => ws.send(mqPkt(0x10, mqStr('MQTT').concat([4, 0x02, 0, 60]), mqStr(cid)));
      ws.onmessage = e => this.feed(new Uint8Array(e.data), () => { clearTimeout(to); this.alive = setInterval(() => { if (ws.readyState === 1) ws.send(new Uint8Array([0xC0, 0])); }, 25000); res(); });
      ws.onerror = () => { clearTimeout(to); rej(new Error('ws')); };
      ws.onclose = () => { clearInterval(this.alive); if (this.onclose) this.onclose(); };
    });
  }
  sub(topic) { const id = this.pid++; this.ws.send(mqPkt(0x82, [id >> 8, id & 255], mqStr(topic).concat([0]))); }
  pub(topic, text, retain) { if (this.ws && this.ws.readyState === 1) this.ws.send(mqPkt(retain ? 0x31 : 0x30, mqStr(topic), _te.encode(text))); } // retain：伺服器會保留最後一則，新訂閱的人馬上收到
  close() { this.onclose = null; try { this.ws.send(new Uint8Array([0xE0, 0])); this.ws.close(); } catch (e) {} }
  feed(chunk, onConnack) {
    const b = new Uint8Array(this.buf.length + chunk.length); b.set(this.buf); b.set(chunk, this.buf.length); this.buf = b;
    for (;;) {
      const B = this.buf; if (B.length < 2) return;
      let len = 0, mul = 1, i = 1, d;
      do { if (i >= B.length) return; d = B[i++]; len += (d & 127) * mul; mul *= 128; } while (d & 128);
      if (B.length < i + len) return;
      const type = B[0] >> 4, body = B.subarray(i, i + len);
      if (type === 2) { if (body[1] === 0) onConnack(); }
      else if (type === 3) { const tl = (body[0] << 8) | body[1], qos = (B[0] >> 1) & 3, topic = _td.decode(body.subarray(2, 2 + tl)), off = 2 + tl + (qos ? 2 : 0); if (this.onmsg) this.onmsg(topic, _td.decode(body.subarray(off))); }
      this.buf = B.slice(i + len);
    }
  }
}
function netBrokers() { let o = null; try { o = localStorage.getItem('zoo_broker'); } catch (e) {} return o ? [o] : NET_CFG.BROKERS; }
const netId = () => 'zc' + Math.random().toString(36).slice(2, 12);
const NET = { epoch: 0, hostSeat: 0, mm: null, role: null, mq: null, myId: '', lastHeard: 0, timers: [], conns: [], host: null, code: '', seats: null, mySeat: 0, lastSnap: '', snapAcc: 0, tickAcc: 0, logSent: 0, battleKey: '', battles: [], hostT: [], hostAt: 0, cmds: [], speed: 1, pending: {}, pred: [], playT: [], reqId: 1, name: '' };
const AI_NAMES = ['阿熊', '野狼幫甲', '野狼幫乙', '河馬團甲', '河馬團乙', '鴨鴨隊甲', '鴨鴨隊乙'];
function netName() { try { return localStorage.getItem('zoo_name') || '玩家'; } catch (e) { return '玩家'; } }
function netSetName(n) { try { localStorage.setItem('zoo_name', n); } catch (e) {} }
function netReset() { for (const t of NET.timers || []) clearInterval(t); NET.timers = []; clearInterval(NET.pingT); NET.pingT = 0; if (NET.ws) { const w = NET.ws; NET.ws = null; try { w.close(); } catch (e) {} } NET.srv = false; NET.ownerSeat = -1; NET.ranked = false; NET.code = ''; NET.tries = 0; NET.epoch = 0; NET.hostSeat = 0; NET.mmSeats = null; NET.started = false; NET.role = null; NET.conns = []; NET.host = null; NET.battles = []; NET.cmds = []; NET.lastSnap = ''; NET.logSent = 0; NET.battleKey = ''; NET.pred = []; NET.playT = []; }
function netLeave() {
  try { if (NET.role === 'client' && NET.host) NET.host.send({ k: 'bye' }); } catch (e) {}
  const r = document.getElementById('netRtt'); if (r) r.remove();
  try { if (NET.mq) NET.mq.close(); } catch (e) {}
  NET.mq = null; netReset();
  for (const k in S3.V) s3Remove(k);
  G = null; $('game').hidden = true; $('lobby').hidden = false; $('overlay').hidden = true;
}
// 依序連上可用的中繼伺服器
async function netConnect(startIdx) {
  const list = netBrokers();
  for (let i = startIdx || 0; i < list.length; i++) {
    const mq = new MiniMqtt(list[i]);
    try { await mq.connect(netId()); return { mq, idx: i }; } catch (e) {}
  }
  return null;
}
const T_ = (code, s) => NET_CFG.PREFIX + code + '/' + s;
const netBlocked = () => /claude\.ai|claudeusercontent|anthropic/.test(location.hostname) || location.protocol === 'file:';
function randCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }

// ---------- 大廳 ----------
function openOnline() {
  if (netBlocked()) { $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>開房連線</h2><p>連線對戰要用公開網址開啟：<br><b>https://willy110611-collab.github.io/animal-chess/</b></p><p>（這個預覽頁面不允許連線）</p>`; $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; }; return; }
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>開房連線</h2>
    <div class="netbox">
      <label class="rnum">你的名字<input id="netName" maxlength="8" value="${esc(netName())}"></label>
      <button class="btn primary" id="netHost">我當房主，建立房間</button>
      <div class="netjoin"><input id="netCode" maxlength="4" placeholder="房號" autocapitalize="characters"><button class="btn moss" id="netJoin">加入</button></div>
      <p class="nethint">房主的手機要一直開著遊戲；空位由 AI 補上。同一個 Wi-Fi 最穩，行動網路偶爾會連不上。</p>
    </div>`;
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; if (NET.role && !G) netLeave(); };
  if (srvOn()) { $('netName').closest('label').hidden = true; $('panel').querySelector('.nethint').textContent = '空位由電腦補上。'; }
  $('netHost').onclick = () => { netSetName($('netName').value.trim() || '玩家'); if (srvOn()) srvHost(); else netHostStart(); };
  $('netJoin').onclick = () => { const c = $('netCode').value.trim().toUpperCase(); if (c.length !== 4) { toast('房號是 4 個字'); return; } netSetName($('netName').value.trim() || '玩家'); if (srvOn()) srvJoin(c); else netJoin(c); };
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderRoom() {
  if (!NET.seats || !$('overlay') || G) return;
  const host = NET.srv ? (NET.ownerSeat === NET.mySeat && !NET.ranked) : NET.role === 'host';
  const solo = !!NET.solo, nT = NET.seats.length >> 1, TN = ['藍隊', '紅隊', '綠隊', '紫隊'], nS = NET.seats.length;
  const seat = (i) => { const s = NET.seats[i]; const me = i === NET.mySeat; return `<button class="nseat ${s ? 'on' : ''} ${me ? 'me' : ''}" data-seat="${i}">${s ? esc(s.name) + (s.host || (NET.srv && NET.ownerSeat === i) ? '（房主）' : '') + (me ? '・你' : '') + (s.lp !== undefined ? `<small>${ladderTierName(s.lp)}</small>` : '') : '空位（AI）'}</button>`; };
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="離開">✕</button><h2>房間 <span class="ncode">${NET.code}</span></h2>
    <p class="nethint">把房號告訴朋友：開始遊戲 → 開房／加入房間 → 輸入房號。點空位可以換位置，空位由電腦補上。</p>
    ${host ? `<div class="nmode">${NET.srv ? `<button class="btn ${solo ? 'on' : ''}" data-mode="solo">單人</button>` : ''}<button class="btn ${!solo && nT === 2 ? 'on' : ''}" data-mode="4">雙人 4 人</button><button class="btn ${!solo && nT === 4 ? 'on' : ''}" data-mode="8">雙人 8 人</button></div>
      ${solo ? `<div class="ncount"><span>人數</span><button class="btn" data-solo="-1">−</button><b>${nS}</b><button class="btn" data-solo="1">＋</button></div>` : ''}` : `<p class="nethint">模式：${solo ? `單人 ${nS} 人` : nT === 2 ? '雙人 4 人（2 隊）' : '雙人 8 人（4 隊）'}</p>`}
    ${solo ? `<div class="nseats1">${NET.seats.map((x, i) => seat(i)).join('')}</div>` : `<div class="nteams">${Array.from({ length: nT }, (_, t) => `<div><b>${TN[t]}</b>${seat(t * 2)}${seat(t * 2 + 1)}</div>`).join('')}</div>`}
    ${host ? '<button class="btn primary" id="netStart">開始遊戲</button>' : `<p class="nethint">${NET.ranked ? '排位房：人到齊就自動開始…' : '等房主開始…'}</p>`}`;
  $('overlay').hidden = false;
  $('mX').onclick = () => netLeave();
  $('panel').querySelectorAll('[data-seat]').forEach(b => b.onclick = () => { const i = +b.dataset.seat; if (NET.seats[i]) return; if (host && !NET.srv) { netMoveSeat(NET.mySeat, i); } else NET.host.send({ k: 'seat', seat: i }); });
  if (host && NET.srv) { $('netStart').onclick = () => NET.host.send({ k: 'start' }); $('panel').querySelectorAll('[data-mode]').forEach(b => b.onclick = () => NET.host.send(b.dataset.mode === 'solo' ? { k: 'mode', solo: true, n: 8 } : { k: 'mode', n: +b.dataset.mode })); $('panel').querySelectorAll('[data-solo]').forEach(b => b.onclick = () => NET.host.send({ k: 'mode', solo: true, n: nS + +b.dataset.solo })); }
  else if (host) { $('netStart').onclick = () => netStartGame(); $('panel').querySelectorAll('[data-mode]').forEach(b => b.onclick = () => netSetMode(+b.dataset.mode)); }
}

// ---------- 房主 ----------
async function netHostStart(opt) {
  if (NET.role) return;
  opt = opt || {};
  toast('建立房間中…');
  const r = opt.mq ? { mq: opt.mq } : await netConnect(0);
  if (!r) { toast('連不上連線伺服器，請確認網路', 3200); return; }
  const code = opt.code || randCode(), n = opt.mode || 4;
  NET.role = 'host'; NET.mq = r.mq; NET.code = code; NET.conns = []; NET.myId = NET.myId || netId(); NET.epoch = 0;
  NET.mySeat = opt.seats ? (opt.seats[NET.myId] || 0) : 0; NET.hostSeat = NET.mySeat; NET.mmSeats = opt.seats || null;
  NET.seats = Array.from({ length: n }, () => null);
  NET.seats[NET.mySeat] = { name: netName(), host: true, lp: ladderMe().lp, pid: ladderMe().id, id: NET.myId };
  netHostWire(r.mq);
  r.mq.sub(T_(code, 'h'));
  netHostTimers();
  renderRoom();
  if (opt.seats) { // 排位配對：人到齊（或等太久）就自動開打
    const need = Object.keys(opt.seats).length, t0 = performance.now();
    const iv = setInterval(() => { if (NET.role !== 'host' || G) { clearInterval(iv); return; } if (NET.seats.filter(Boolean).length >= need || performance.now() - t0 > NET_CFG.MM_JOIN_WAIT_MS) { clearInterval(iv); netStartGame(); } }, 500);
    NET.timers.push(iv);
  }
}
function netHostWire(mq) {
  mq.onmsg = (topic, text) => { let m; try { m = JSON.parse(text); } catch (e) { return; } if (!m || !m.from) return; netHostIncoming(m); };
  mq.onclose = () => { if (NET.role === 'host') { toast('跟連線伺服器斷線，重新連線中…', 2500); netHostReconnect(); } };
}
function netHostTimers() {
  // 房主切到背景時畫面停止更新，用計時器繼續推進遊戲，其他人才不會卡住
  NET.timers.push(setInterval(() => { if (NET.role !== 'host' || !G) return; const now = performance.now(); if (now - (NET.lastFrame || 0) < 400) return; const dt = Math.min(1000, now - (NET.bgAt || now)); NET.bgAt = now; if (dt > 0 && G.phase !== 'over') update(G, dt); netHostTick(dt / 1000, true); }, 250));
  NET.timers.push(setInterval(() => { if (NET.role !== 'host') return; netBroadcast({ k: 'hb' }); netAnnounce(); const now = performance.now(); for (const c of NET.conns.slice()) if (now - c.last > NET_CFG.DROP_MS) netHostDrop(c); }, 4000));
}
// 換過房主後，持續在 /h 宣告自己是房主（舊房主若還活著會看到並退位）
function netAnnounce() { if (NET.epoch > 0 && NET.mq) NET.mq.pub(T_(NET.code, 'h'), JSON.stringify({ from: NET.myId, k: 'host', epoch: NET.epoch, seat: NET.mySeat })); }
const netBeats = (e, s) => e > NET.epoch || (e === NET.epoch && s < NET.hostSeat);
async function netHostReconnect() {
  for (let n = 0; n < 5 && NET.role === 'host'; n++) {
    const r = await netConnect(0); if (!r) { await new Promise(x => setTimeout(x, 2000)); continue; }
    netHostWire(r.mq); NET.mq = r.mq; r.mq.sub(T_(NET.code, 'h'));
    NET.lastSnap = ''; NET.battleKey = ''; toast('已重新連線'); return;
  }
}
function netConn(id, seat) { return { id, seat, open: true, last: performance.now(), send(x) { if (NET.mq) NET.mq.pub(T_(NET.code, 'c/' + this.id), JSON.stringify(x)); }, close() { this.open = false; } }; }
function netHostIncoming(m) {
  if (m.from === NET.myId) return;
  if (m.k === 'host') { if (netBeats(+m.epoch || 0, +m.seat)) netDemote(m); return; }
  let c = NET.conns.find(x => x.id === m.from);
  if (!c) {
    if (m.k !== 'hello') return;
    const known = NET.seats ? NET.seats.findIndex(s => s && s.id === m.from) : -1;
    if (G && known >= 0) { // 斷線的人（或退位的舊房主）回來了：還他原本的位置
      c = netConn(m.from, known); NET.conns.push(c);
      const P = G.players[known]; if (P && P.out !== true) { P.ai = false; toast(`${P.name} 回來了`); }
      c.send({ k: 'seat', seat: known }); c.send({ k: 'start', seat: known, epoch: NET.epoch, hostSeat: NET.mySeat, seats: NET.seats });
      netResync(); return;
    }
    c = netConn(m.from);
  } else if (m.k === 'hello') { // 同一個人重新連上：補送座位、開局與完整畫面
    c.last = performance.now(); c.send({ k: 'seat', seat: c.seat });
    if (G) { c.send({ k: 'start', seat: c.seat, epoch: NET.epoch, hostSeat: NET.mySeat, seats: NET.seats }); netResync(); } else netSendRoom();
    return;
  }
  c.last = performance.now();
  if (m.k === 'bye') { netHostDrop(c); return; }
  if (m.k === 'ping') return;
  netHostMsg(c, m);
}
function netSetMode(n) {
  if (G || n === NET.seats.length) return;
  if (n < NET.seats.length) { if (NET.seats.slice(n).some(Boolean)) { // 把後面的人往前塞
      for (let i = n; i < NET.seats.length; i++) if (NET.seats[i]) { const f = NET.seats.slice(0, n).findIndex(x => !x); if (f < 0) { toast('人太多了，不能改成 4 人'); return; } netMoveSeat(i, f); } }
    NET.seats = NET.seats.slice(0, n);
  } else while (NET.seats.length < n) NET.seats.push(null);
  netSendRoom();
}
function netBroadcast(m) { if (NET.mq && NET.conns.length) { m.e = NET.epoch; m.hs = NET.mySeat; NET.mq.pub(T_(NET.code, 'all'), JSON.stringify(m)); } }
function netSendRoom() { netBroadcast({ k: 'room', seats: NET.seats, code: NET.code }); renderRoom(); }
function netMoveSeat(from, to) {
  if (to < 0 || to >= NET.seats.length || NET.seats[to] || G) return;
  NET.seats[to] = NET.seats[from]; NET.seats[from] = null;
  const c = NET.conns.find(x => x.seat === from); if (c) { c.seat = to; c.send({ k: 'seat', seat: to }); }
  if (from === NET.mySeat) NET.mySeat = to;
  netSendRoom();
}
function netHostMsg(c, m) {
  if (!m || typeof m !== 'object') return;
  if (m.k === 'hello') {
    if (G) { c.send({ k: 'full', why: '遊戲已經開始了' }); return; }
    let free = NET.seats.findIndex(x => !x);
    if (NET.mmSeats && NET.mmSeats[c.id] !== undefined && !NET.seats[NET.mmSeats[c.id]]) free = NET.mmSeats[c.id];
    if (free < 0) { c.send({ k: 'full', why: '房間滿了' }); return; }
    c.seat = free; NET.conns.push(c);
    NET.seats[free] = { name: String(m.name || '玩家').slice(0, 8), lp: +m.lp || 0, pid: String(m.pid || '').slice(0, 24), id: c.id };
    c.send({ k: 'seat', seat: free }); netSendRoom(); toast(`${NET.seats[free].name} 加入了`);
  } else if (m.k === 'seat') { netMoveSeat(c.seat, +m.seat); }
  else if (m.k === 'act' && G && c.seat !== undefined) {
    const P = G.players[c.seat]; if (!P) return;
    const r = act(G, c.seat, m.a || {});
    c.send({ k: 'res', id: m.id, r });
    NET.snapAcc = NET_CFG.SNAP_MS; // 立刻回傳新畫面
  }
}
function netHostDrop(c) {
  const i = NET.conns.indexOf(c); if (i < 0) return; NET.conns.splice(i, 1);
  if (c.seat === undefined) return;
  if (!G) { NET.seats[c.seat] = null; netSendRoom(); return; }
  const P = G.players[c.seat]; if (P) { P.ai = true; P.ready = true; toast(`${P.name} 斷線了，由 AI 接手`, 2600); }
}
function netStartGame() {
  const players = NET.seats.map((s, i) => s ? { name: s.name, ai: false } : { name: AI_NAMES[i - 1] || 'AI', ai: true });
  ME = NET.mySeat;
  for (const k in S3.V) s3Remove(k);
  G = createGame({ seed: (Date.now() & 0x7fffffff), rules: loadRules(), players });
  G.online = true; G.humanAt = players.map(p => !p.ai); G.ladder = NET.seats.map(s => s ? { lp: s.lp || 0, pid: s.pid, name: s.name } : null);
  startGame(G); lastPhase = ''; lastRound = 0; cv = null; sel = null; logIdx = G.log.length; prevLevel = 0; prevGold = null; prevTiers = {};
  $('overlay').hidden = true; $('lobby').hidden = true; $('game').hidden = false; s3Resize(); $('stage').dataset.arena = G.arena;
  for (const c of NET.conns) c.send({ k: 'start', seat: c.seat, epoch: NET.epoch, hostSeat: NET.mySeat, seats: NET.seats });
  NET.lastSnap = ''; NET.logSent = 0; NET.battleKey = ''; NET.snapAcc = 1e9;
}
// 要求下一次送完整畫面（含全部紀錄）
function netResync() { NET.lastSnap = ''; NET.logSent = 0; NET.snapAcc = 1e9; if (G && G.phase === 'combat') netSendBattles(); }
function netSendBattles() {
  if (!G.battles.length || !G.battles[0].input) return;
  NET.battleKey = G.round + G.phase + G.battles.length;
  netBroadcast({ k: 'battles', round: G.round, list: G.battles.map(b => ({ teams: b.teams, ghost: !!b.ghost, input: b.input })), t: G.battles.map(b => b.B.t), cmds: G.battles.map(b => b.B.cmdLog || []) });
}
function netSnapshot() {
  // 不送：亂數函式、戰鬥模擬物件（客人自己跑）、整串紀錄（只送新的部分）
  const log = G.log.slice(NET.logSent);
  G._ra = G.rng && G.rng.get ? G.rng.get() : 0; // 亂數狀態一起送，房主斷線時接手的人才能接著算
  const s = JSON.stringify(G, (k, v) => (k === 'rng' || k === 'B' || k === 'log' || k === 'battles' || k === 'input') ? undefined : v);
  return { s, log, logFrom: NET.logSent };
}
function netHostTick(dt, fromTimer) {
  if (!G || NET.role !== 'host') return;
  if (!fromTimer) NET.lastFrame = performance.now();
  // 新戰鬥：把戰鬥輸入（含種子）送給大家
  const bk = G.round + G.phase + G.battles.length;
  if (G.phase === 'combat' && NET.battleKey !== bk && G.battles.length && G.battles[0].input) netSendBattles();
  NET.snapAcc += dt * 1000;
  if (NET.snapAcc >= NET_CFG.SNAP_MS) {
    NET.snapAcc = 0;
    const sn = netSnapshot();
    const cmp = sn.s.replace(/"(timer|acc)":-?[0-9.e+-]+/g, ''), now = performance.now(); // 倒數與戰鬥進度不算變化，另外保底定時送
    if (cmp !== NET.lastSnap || sn.log.length || now - (NET.snapAt || 0) >= NET_CFG.SNAP_KEEPALIVE_MS) { NET.lastSnap = cmp; NET.snapAt = now; netBroadcast({ k: 'snap', s: sn.s, log: sn.log, logFrom: sn.logFrom }); NET.logSent = G.log.length; }
  }
  NET.tickAcc += dt * 1000;
  if (G.phase === 'combat' && NET.tickAcc >= NET_CFG.TICK_MS) { NET.tickAcc = 0; netBroadcast({ k: 'tick', round: G.round, t: G.battles.map(b => b.B.t), cmds: G.battles.map(b => b.B.cmdLog || []), speed: G.speed || 1 }); }
}

// ---------- 客人 ----------
async function netJoin(code, fixedId) {
  if (NET.role || NET.joining) return;
  NET.joining = true; toast('連線中…');
  const list = netBrokers();
  for (let bi = 0; bi < list.length; bi++) {
    const r = await netConnect(bi); if (!r) break;
    bi = r.idx;
    const ok = await new Promise(res => {
      const myId = fixedId || netId(); let done = false;
      r.mq.onmsg = (topic, text) => { let m; try { m = JSON.parse(text); } catch (e) { return; } NET.lastHeard = performance.now(); if (!done && (m.k === 'seat' || m.k === 'full')) { done = true; clearTimeout(to); res(true); } netClientMsg(m); };
      r.mq.sub(T_(code, 'all')); r.mq.sub(T_(code, 'c/' + myId));
      NET.myId = myId; NET.code = code; NET.mq = r.mq;
      NET.host = { send(x) { if (NET.mq) NET.mq.pub(T_(NET.code, 'h'), JSON.stringify(Object.assign({ from: NET.myId }, x))); } };
      const hello = () => NET.host.send({ k: 'hello', name: netName(), lp: ladderMe().lp, pid: ladderMe().id });
      setTimeout(hello, 300); const again = setInterval(() => { if (done) clearInterval(again); else hello(); }, 1500);
      const to = setTimeout(() => { if (!done) { done = true; try { r.mq.close(); } catch (e) {} NET.mq = null; res(false); } }, NET_CFG.HELLO_WAIT_MS);
    });
    if (ok) {
      NET.joining = false;
      if (!NET.role) NET.role = 'client';
      NET.mq.onclose = () => { if (NET.role === 'client') { toast('跟連線伺服器斷線，重新連線中…', 2500); netClientReconnect(); } };
      netClientTimer();
      return;
    }
  }
  NET.joining = false; NET.host = null;
  toast('找不到這個房號，或房主已經離開', 3200);
}
function netClientTimer() {
  NET.timers.push(setInterval(() => {
    if (NET.role !== 'client') return;
    NET.host.send({ k: 'ping' });
    const quiet = performance.now() - NET.lastHeard;
    if (G && NET.started && G.phase !== 'over') { // 遊戲中房主不見了：由下一位真人接手當房主
      const cand = (NET.seats || []).map((x, i) => (x && x.id && i !== NET.hostSeat) ? i : -1).filter(i => i >= 0);
      const rank = cand.indexOf(NET.mySeat);
      if (rank >= 0 && quiet > NET_CFG.DROP_MS + rank * NET_CFG.TAKEOVER_GAP_MS) netTakeover();
      else if (rank < 0 && quiet > NET_CFG.DROP_MS * 3) { toast('跟房主的連線中斷了', 3200); netLeave(); }
      else if (quiet > NET_CFG.DROP_MS && !NET.warned) { NET.warned = true; toast('房主沒有回應，準備換人當房主…', 3000); }
    } else if (quiet > NET_CFG.DROP_MS) { toast('跟房主的連線中斷了', 3200); netLeave(); }
  }, 2000));
}
// 客人接手當房主：用最後收到的畫面與自己跑的戰鬥繼續
function netTakeover() {
  if (NET.role !== 'client' || !G) return;
  for (const t of NET.timers) clearInterval(t); NET.timers = [];
  const old = NET.hostSeat;
  NET.role = 'host'; NET.epoch++; NET.hostSeat = NET.mySeat; NET.warned = false;
  const ra = G._ra; G.rng = makeRng(0); if (ra !== undefined) G.rng.set(ra);
  G.battles = (NET.battleRound === G.round) ? NET.battles : [];
  for (const bt of G.battles) if (bt.B) { netApplyCmds(bt, G.battles.indexOf(bt)); bt.B.cmdLog = (NET.cmds[G.battles.indexOf(bt)] || []).slice(0, bt.done || 0); }
  const P = G.players[old]; if (P && !P.out) { P.ai = true; P.ready = true; }
  NET.seats = NET.seats.map((x, i) => x ? Object.assign({}, x, { host: i === NET.mySeat }) : x);
  NET.conns = NET.seats.map((x, i) => (x && x.id && i !== NET.mySeat && i !== old) ? netConn(x.id, i) : null).filter(Boolean);
  netHostWire(NET.mq); NET.mq.sub(T_(NET.code, 'h'));
  netHostTimers();
  NET.battleKey = G.round + G.phase + G.battles.length; // 大家已經有這幾場戰鬥，不重送
  NET.lastSnap = ''; NET.logSent = 0; NET.snapAcc = 1e9; NET.lastFrame = performance.now();
  netAnnounce(); netBroadcast({ k: 'host', epoch: NET.epoch, seat: NET.mySeat });
  toast(`房主斷線了，由你接手當房主（${P ? P.name : ''} 改由 AI 代打）`, 3600);
}
// 舊房主回來發現已經換人：退成客人
function netDemote(m) {
  for (const t of NET.timers) clearInterval(t); NET.timers = [];
  NET.role = 'client'; NET.epoch = +m.epoch || 0; NET.hostSeat = +m.seat; NET.conns = []; NET.started = true; NET.lastHeard = performance.now();
  if (G) { NET.battles = G.battles; NET.battleRound = G.round; NET.hostT = G.battles.map(b => b.B ? b.B.t : 0); NET.cmds = G.battles.map(b => (b.B && b.B.cmdLog) || []); NET.hostAt = performance.now(); for (const b of G.battles) b.done = (b.B && b.B.cmdLog || []).length; }
  NET.mq.onmsg = (topic, text) => { let x; try { x = JSON.parse(text); } catch (e) { return; } NET.lastHeard = performance.now(); netClientMsg(x); };
  NET.mq.onclose = () => { if (NET.role === 'client') netClientReconnect(); };
  NET.mq.sub(T_(NET.code, 'all')); NET.mq.sub(T_(NET.code, 'c/' + NET.myId));
  NET.host = { send(x) { if (NET.mq) NET.mq.pub(T_(NET.code, 'h'), JSON.stringify(Object.assign({ from: NET.myId }, x))); } };
  netClientTimer();
  NET.host.send({ k: 'hello', name: netName(), lp: ladderMe().lp, pid: ladderMe().id });
  toast('連線恢復，已改由其他玩家當房主', 3200);
}
async function netClientReconnect() {
  for (let n = 0; n < 5 && NET.role === 'client'; n++) {
    const r = await netConnect(0); if (!r) { await new Promise(x => setTimeout(x, 2000)); continue; }
    r.mq.onmsg = NET.mq.onmsg; r.mq.onclose = NET.mq.onclose; NET.mq = r.mq;
    r.mq.sub(T_(NET.code, 'all')); r.mq.sub(T_(NET.code, 'c/' + NET.myId));
    NET.host.send({ k: 'hello', name: netName(), lp: ladderMe().lp, pid: ladderMe().id }); toast('已重新連線'); return;
  }
}
function netSendAct(a) {
  if (!NET.host) return 'bad';
  const id = NET.reqId++; NET.pending[id] = a.t; NET.host.send({ k: 'act', a, id });
  // 先在自己手機上做出來（伺服器回來的畫面會校正）；還沒被伺服器處理的操作，收到舊畫面時會再套一次
  if (G && NET_CFG.PREDICT.includes(a.t)) {
    const r = netPredict(a);
    if (r === 'ok') { NET.pred.push({ id, t: performance.now(), a: JSON.parse(JSON.stringify(a)) }); return 'ok'; }
  }
  return 'net';
}
function netPredict(a) {
  const n = G.log.length; let r;
  try { r = act(G, ME, JSON.parse(JSON.stringify(a))); } catch (e) { r = 'bad'; }
  G.log.length = n; // 特效與音效等伺服器的正式紀錄
  return r;
}
function netClientMsg(m) {
  if (!m) return;
  if (m.e !== undefined) { // 換房主後，忽略舊房主的過期訊息
    if (m.e < NET.epoch) return;
    if (m.e === NET.epoch && NET.epoch > 0 && m.hs > NET.hostSeat) return;
    NET.epoch = m.e; NET.hostSeat = m.hs; NET.warned = false;
  }
  if (m.k === 'host') return;
  if (m.k === 'seat') { NET.role = 'client'; NET.mySeat = m.seat; renderRoom(); }
  else if (m.k === 'hb') {}
  else if (m.k === 'room') { NET.seats = m.seats; NET.code = m.code; renderRoom(); }
  else if (m.k === 'full') { toast(m.why, 3000); setTimeout(netLeave, 50); }
  else if (m.k === 'start') { const re = NET.started && G; ME = NET.mySeat = m.seat; NET.started = true; if (m.seats) NET.seats = m.seats; if (m.epoch !== undefined) { NET.epoch = m.epoch; NET.hostSeat = m.hostSeat; } if (!re) for (const k in S3.V) s3Remove(k); }
  else if (m.k === 'res') { const t = NET.pending[m.id]; delete NET.pending[m.id]; NET.pred = NET.pred.filter(x => x.id !== m.id); if (m.r !== 'ok' && !['ready', 'ping', 'move'].includes(t)) toast(ERR[m.r] || '不行'); if (m.r !== 'ok' && t === 'move') renderPrep(); }
  else if (m.k === 'snap') netApplySnap(m);
  else if (m.k === 'battles') {
    if (NET.battleRound === m.round && NET.battles.length === m.list.length && NET.battles.every(b => b.B)) { if (m.t) { NET.hostT = m.t; NET.cmds = m.cmds; NET.hostAt = performance.now(); } return; } // 已經在跑同一批（重連補送）
    NET.battles = m.list.map(b => ({ teams: b.teams, ghost: !!b.ghost, input: b.input, B: createBattle(JSON.parse(JSON.stringify(b.input))) }));
    NET.battleRound = m.round; NET.playT = []; NET.hostT = m.t || NET.battles.map(() => 0); NET.cmds = m.cmds || NET.battles.map(() => []); NET.hostAt = performance.now();
    if (G) G.battles = NET.battles;
  }
  else if (m.k === 'tick') { if (m.round !== NET.battleRound) return; NET.hostT = m.t; NET.hostAt = performance.now(); NET.cmds = m.cmds; NET.speed = m.speed || 1; }
}
function netApplySnap(m) {
  const t0 = performance.now(); NET.st = NET.st || { n: 0, bytes: 0, parse: 0, apply: 0, max: 0 };
  const ng = JSON.parse(m.s); const t1 = performance.now();
  const oldLog = G ? G.log : [];
  ng.log = oldLog.length >= m.logFrom ? oldLog.slice(0, m.logFrom).concat(m.log) : oldLog.concat(m.log);
  ng.rng = () => 0; // 客人不擲骰；_ra 留著，接手當房主時用
  ng.battles = (NET.battleRound === ng.round) ? NET.battles : [];
  const first = !G;
  if (G && G.phase === 'combat' && ng.phase === 'combat') ng.acc = G.acc; // 戰鬥播放進度由自己的時鐘決定
  G = ng;
  const pnow = performance.now(); NET.pred = NET.pred.filter(x => pnow - x.t < 4000); // 太久沒回覆（多半是斷線掉了）就不再套
  for (const x of NET.pred) netPredict(x.a); // 伺服器還沒處理到的操作，套回新畫面上
  if (first) {
    lastPhase = ''; lastRound = 0; cv = null; sel = null; logIdx = 0; prevLevel = 0; prevGold = null; prevTiers = {};
    $('overlay').hidden = true; $('lobby').hidden = true; $('game').hidden = false; s3Resize(); $('stage').dataset.arena = G.arena;
    logIdx = G.log.length;
  }
  if (!drag && !itemDrag) {
    processLog();
    if (G.phase === lastPhase && G.round === lastRound) refresh();
  }
  const t2 = performance.now(); const st = NET.st; st.n++; st.bytes += m.s.length; st.parse += t1 - t0; st.apply += t2 - t1; st.max = Math.max(st.max, t2 - t0);
}
function netClientUpdate(dt) {
  if (!G) return;
  if (G.timer > 0) G.timer -= dt * 1000;
  if (G.phase === 'prep' || G.phase === 'lobby') return; // 戰鬥資料可能比「進入戰鬥」的畫面先到：這時還沒開打，不能快轉
  // 結算時：自己畫面落後的最後一小段照常播完（勝負畫面才不會被切掉）；快結束還沒播完才快轉
  if (G.phase !== 'combat' && !(G.phase === 'result' && NET.battleRound === G.round && G.timer > 1200)) { // 把還沒播完的部分快轉跑完
    for (const bt of NET.battles) if (bt.B && !bt.B.over && NET.battleRound === G.round) { let n = 0; while (!bt.B.over && n++ < 2000) { netApplyCmds(bt, NET.battles.indexOf(bt)); step(bt.B); } bt.B.ev.length = 0; }
    return;
  }
  // 平滑播放：自己的時鐘照正常速度走，落後就稍微加快、超前就稍微放慢，不再一頓一頓地追
  const since = (performance.now() - NET.hostAt) / CFG.TICK_MS * (NET.speed || 1);
  const adv = dt * 1000 / CFG.TICK_MS * (NET.speed || 1);
  let fracSet = false;
  NET.battles.forEach((bt, i) => {
    const B = bt.B; if (!B) return;
    const target = (NET.hostT[i] || 0) + Math.min(since, NET_CFG.EXTRAP_TICKS) - NET_CFG.BUFFER_TICKS;
    let pt = NET.playT[i]; if (pt === undefined || pt < B.t) pt = B.t;
    const lag = target - pt, k = NET_CFG.CATCHUP_PCT / 100;
    if (lag > NET_CFG.SNAP_JUMP_TICKS) pt = target;
    else pt += adv * Math.max(1 - k, Math.min(1 + k, 1 + lag / 10));
    pt = Math.min(pt, Math.max(B.t, target + 2)); // 不要跑到伺服器前面太多
    NET.playT[i] = pt;
    if (B.over) return;
    let n = 0;
    while (B.t + 1 <= pt && !B.over && n++ < 400) { netApplyCmds(bt, i); step(B); }
    if (!fracSet && cv && cv.B === B) { fracSet = true; G.acc = Math.max(0, Math.min(1, pt - B.t)) * CFG.TICK_MS; }
  });
}
function netApplyCmds(bt, i) {
  const list = (NET.cmds && NET.cmds[i]) || [], B = bt.B; bt.done = bt.done || 0;
  while (bt.done < list.length && list[bt.done].t <= B.t) { const c = list[bt.done++]; B.cmdUsed[c.owner] = false; battleCommand(B, c.owner, c.type); }
}

// ---------- 排位配對（全球，優先同地區）----------
// 大家在 mm/<人數> 頻道每 2 秒喊一次「我在排」；排最久的人當隊長，湊到人就宣布配對並當房主，其他人自動進房。
const MM = { mq: null, me: null, list: {}, timer: 0, mode: 4, t0: 0, done: false };
const mmTz = () => Math.round(-new Date().getTimezoneOffset() / 60);
const MM_ORDER = { 4: [0, 2, 1, 3], 8: [0, 2, 4, 6, 1, 3, 5, 7] }; // 真人盡量分到不同隊
function openMatch(pre) {
  if (netBlocked()) { openOnline(); return; }
  if (pre !== undefined && !MM.mq) MM.mode = pre;
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>排位配對</h2>
    <div class="netbox">
      <label class="rnum">你的名字<input id="netName" maxlength="8" value="${esc(netName())}"></label>
      <div class="nmode"><button class="btn ${MM.mode === 'solo' ? 'on' : ''}" data-mm="solo">單人（8 人）</button><button class="btn ${MM.mode === 'duel' ? 'on' : ''}" data-mm="duel">1 對 1</button><button class="btn ${MM.mode === 4 ? 'on' : ''}" data-mm="4">雙人 4 人</button><button class="btn ${MM.mode === 8 ? 'on' : ''}" data-mm="8">雙人 8 人</button></div>
      <button class="btn primary" id="mmGo">開始配對</button>
      <div id="mmStat" class="nethint">會優先配到附近的玩家，人數不夠時由電腦補上。</div>
    </div>`;
  $('overlay').hidden = false;
  $('mX').onclick = () => { if (MM.ws) srvMatchStop(); else mmStop(); $('overlay').hidden = true; };
  $('panel').querySelectorAll('[data-mm]').forEach(b => b.onclick = () => { if (MM.mq) return; MM.mode = ['solo', 'duel'].includes(b.dataset.mm) ? b.dataset.mm : +b.dataset.mm; openMatch(); });
  if (srvOn()) $('netName').closest('label').hidden = true;
  $('mmGo').onclick = () => { netSetName($('netName').value.trim() || '玩家'); if (srvOn()) { if (MM.mq) srvMatchStop(); else srvMatchStart(); return; } if (MM.mq) mmStop(); else mmStart(); };
}
function mmStatus(txt) { const e = document.getElementById('mmStat'); if (e) e.innerHTML = txt; const b = document.getElementById('mmGo'); if (b) b.textContent = MM.mq ? '取消配對' : '開始配對'; }
async function mmStart() {
  if (MM.mq || NET.role) return;
  mmStatus('連線中…');
  const r = await netConnect(0); if (!r) { mmStatus('連不上配對伺服器，請確認網路'); return; }
  MM.mq = r.mq; MM.list = {}; MM.done = false; MM.t0 = Date.now();
  MM.me = { k: 'q', id: netId(), name: netName(), lp: ladderMe().lp, pid: ladderMe().id, tz: mmTz(), t: MM.t0 };
  const topic = NET_CFG.PREFIX + 'mm/' + MM.mode;
  r.mq.onmsg = (tp, text) => { let m; try { m = JSON.parse(text); } catch (e) { return; } mmMsg(m); };
  r.mq.onclose = () => { if (MM.mq === r.mq) { MM.mq = null; if (!MM.done) mmStatus('配對連線中斷了，請再按一次'); } };
  r.mq.sub(topic);
  const tick = () => {
    if (!MM.mq || MM.done) return;
    MM.me.lp = ladderMe().lp; MM.mq.pub(topic, JSON.stringify(MM.me));
    const now = Date.now();
    for (const id in MM.list) if (now - MM.list[id].seen > NET_CFG.MM_STALE_MS) delete MM.list[id];
    mmTryLead();
    const n = Object.keys(MM.list).length, near = Object.values(MM.list).filter(x => Math.abs(x.tz - MM.me.tz) <= NET_CFG.MM_SAME_TZ).length;
    mmStatus(`配對中… 已等 ${Math.round((now - MM.t0) / 1000)} 秒<br>目前排隊：${n + 1} 人（同地區 ${near + 1} 人）${n === 0 ? '<br>還沒有其他人在排，可以找朋友一起按，或先去練習' : ''}`);
  };
  MM.timer = setInterval(tick, NET_CFG.MM_PING_MS); tick();
}
function mmStop() {
  clearInterval(MM.timer); MM.timer = 0;
  if (MM.mq) { const mq = MM.mq; MM.mq = null; if (!MM.done && MM.me) try { mq.pub(NET_CFG.PREFIX + 'mm/' + MM.mode, JSON.stringify({ k: 'bye', id: MM.me.id })); } catch (e) {} setTimeout(() => { try { mq.close(); } catch (e) {} }, 300); }
  mmStatus('已取消');
}
function mmMsg(m) {
  if (!m || !m.id || MM.done) return;
  if (m.k === 'q' && m.id !== MM.me.id && typeof m.t === 'number') MM.list[m.id] = { id: m.id, name: String(m.name || '玩家').slice(0, 8), lp: +m.lp || 0, pid: String(m.pid || ''), tz: +m.tz || 0, t: m.t, seen: Date.now() };
  else if (m.k === 'bye') delete MM.list[m.id];
  else if (m.k === 'match' && Array.isArray(m.members)) {
    if (m.members.includes(MM.me.id) && m.id !== MM.me.id) { // 我被配到了：進房
      MM.done = true; clearInterval(MM.timer);
      mmStatus('配到了！進房中…');
      const mq = MM.mq; MM.mq = null; try { mq.close(); } catch (e) {}
      const myId = MM.me.id; setTimeout(() => netJoin(String(m.room), myId), 1200);
    } else for (const id of m.members) delete MM.list[id]; // 別人已經配走了
  }
}
// 隊長＝排最久的人（大家看到的名單差不多，所以通常只有一個人會當隊長）
function mmTryLead() {
  const now = Date.now(), need = MM.mode, me = MM.me;
  const all = Object.values(MM.list).concat([me]).sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
  if (all[0].id !== me.id) return;
  const waited = now - me.t, wide = waited >= NET_CFG.MM_WIDEN_MS;
  const others = Object.values(MM.list).map(x => ({ x, near: Math.abs(x.tz - me.tz) <= NET_CFG.MM_SAME_TZ })).sort((a, b) => (b.near - a.near) || (a.x.t - b.x.t));
  const nearOnes = others.filter(o => o.near).map(o => o.x);
  let pick = null;
  if (nearOnes.length >= need - 1) pick = nearOnes.slice(0, need - 1);           // 同地區湊滿
  else if (wide && others.length >= need - 1) pick = others.slice(0, need - 1).map(o => o.x); // 放寬到全球湊滿
  else if (wide && others.length >= 1) pick = others.slice(0, need - 1).map(o => o.x);        // 等夠久：有人就開，剩下 AI
  if (!pick) return;
  const members = [me.id].concat(pick.map(x => x.id)), seats = {}, order = MM_ORDER[need];
  members.forEach((id, i) => { seats[id] = order[i]; });
  const room = randCode() + randCode().slice(0, 2);
  MM.done = true; clearInterval(MM.timer);
  MM.mq.pub(NET_CFG.PREFIX + 'mm/' + need, JSON.stringify({ k: 'match', id: me.id, room, members }));
  mmStatus(`配到 ${members.length} 人！建立房間中…`);
  const mq = MM.mq; MM.mq = null;
  NET.myId = me.id;
  mq.onmsg = null; mq.onclose = null;
  // 改用同一條連線當房主（重新訂閱房間頻道）
  netHostStart({ code: room, mode: need, seats, mq });
}
window.NET_CODE = () => NET.code; window.NETROLE = () => NET.role || ''; window.ME_ = () => ME; // 測試用
window.NETDBG = () => ({ st: NET.st, hostT: NET.hostT, br: NET.battleRound, nb: NET.battles.length });
