// ===== 天梯（牌位與積分 LP）=====
// 每場結束（或被淘汰）結算一次；存在這台裝置。連線對戰時會交換彼此的 LP，排行榜列出你和一起玩過的人。
// 想要「全世界同一張」即時排行榜需要雲端資料庫（例如 Firebase），目前沒有接。
const LADDER_CFG = {
  TIERS: ['黑鐵', '青銅', '白銀', '黃金', '白金', '翡翠', '鑽石', '大師', '宗師', '挑戰者'], // 每 100 LP 一階
  DIV_UNTIL: 7,                         // 前 7 階（黑鐵～鑽石）分 IV～I 四小段，每段 25 LP
  WIN2: 24, LOSE2: -18,                 // 2 隊：贏／輸基本分
  PLACE4: [0, 36, 16, -10, -24],        // 4 隊：第 1～4 名基本分
  ELO_SPAN: 250,                        // 對手平均高你 250 LP 時，贏的分數約 ×1.5、輸的扣分 ×0.5
  PRACTICE_PCT: 50,                     // 練習（對 AI）只算一半
  AI_LP: { easy: -60, normal: 0, hard: 80 }, // AI 視為比你高／低多少 LP
};
const TIER_COL = ['#7a6a5a', '#b87a4c', '#aab4c0', '#f2c14e', '#5ac8c8', '#3fbf7a', '#7ab8ff', '#c48af2', '#ff6a6a', '#ffd34d'];
function ladderLoad() {
  let L = null; try { L = JSON.parse(localStorage.getItem('zoo_ladder') || 'null'); } catch (e) {}
  L = Object.assign({ id: '', lp: 0, games: 0, wins: 0, top: 0, hist: [], seen: {} }, L || {});
  if (!L.clean) { // v0.8：天梯改成只算真人對戰，把以前練習賺／扣的分數退回
    for (const h of L.hist.filter(h => h.mode === '練習')) { L.lp = Math.max(0, L.lp - h.d); L.games = Math.max(0, L.games - 1); if (h.place === 1) L.wins = Math.max(0, L.wins - 1); if (h.place <= Math.max(1, h.n / 2)) L.top = Math.max(0, L.top - 1); }
    L.hist = L.hist.filter(h => h.mode !== '練習'); L.clean = 1; if (L.id) try { localStorage.setItem('zoo_ladder', JSON.stringify(L)); } catch (e) {}
  }
  if (!L.id) { L.id = 'p' + Math.random().toString(36).slice(2, 10); try { localStorage.setItem('zoo_ladder', JSON.stringify(L)); } catch (e) {} } // 身分要固定，排行榜才不會重複
  return L;
}
let LADDER = ladderLoad();
function ladderSave() { try { localStorage.setItem('zoo_ladder', JSON.stringify(LADDER)); } catch (e) {} }
function ladderMe() { return LADDER; }
function ladderTier(lp) { return Math.min(LADDER_CFG.TIERS.length - 1, Math.floor(Math.max(0, lp) / 100)); }
function ladderTierName(lp) {
  const t = ladderTier(lp);
  if (t < LADDER_CFG.DIV_UNTIL) { const div = 4 - Math.floor((Math.max(0, lp) % 100) / 25); return `${LADDER_CFG.TIERS[t]} ${['', 'I', 'II', 'III', 'IV'][div]}`; }
  return `${LADDER_CFG.TIERS[t]} ${Math.max(0, lp) - 700}`;
}
const tierBadge = lp => `<span class="tierb" style="--tc:${TIER_COL[ladderTier(lp)]}">${ladderTierName(lp)}</span>`;
// 計分：base 依勝負／名次；再依「對手平均 LP − 我隊平均 LP」調整
function ladderDelta(base, myAvg, oppAvg, practice) {
  const diff = Math.max(-500, Math.min(500, oppAvg - myAvg)) / LADDER_CFG.ELO_SPAN;
  let d = base > 0 ? base * (1 + 0.5 * diff) : base * (1 - 0.5 * diff);
  if (practice) d = d * LADDER_CFG.PRACTICE_PCT / 100;
  return Math.round(Math.max(base > 0 ? 3 : -60, Math.min(base > 0 ? 60 : -3, d)));
}
function teamLp(G, team, meLp) {
  const ps = G.players.filter(p => p.team === team);
  const lps = ps.map(p => (G.ladder && G.ladder[p.id]) ? G.ladder[p.id].lp : p.ai ? meLp + (LADDER_CFG.AI_LP[G.rules.aiLevel] || 0) : meLp);
  return lps.reduce((a, b) => a + b, 0) / Math.max(1, lps.length);
}
let LADDER_RES = null, LADDER_SHOWN = null;
function ladderSettle() {
  if (!G) return null;
  const t = myTeam(), T = G.teams[t];
  if (!(G.phase === 'over' || T.out) || !T.place) return null;
  if (G.server) { // 伺服器局：分數由伺服器算好再送來
    if (!G.ranked) return (LADDER_RES = { seed: G.seed, unranked: true, after: ACC.me ? ACC.me.lp : LADDER.lp });
    return LADDER_RES && LADDER_RES.seed === G.seed ? LADDER_RES : { seed: G.seed, pending: true };
  }
  if (LADDER.lastSeed === G.seed) return null; // 同一場只結算一次（連線時 G 會一直被房主的畫面取代，所以用種子判斷）
  LADDER.lastSeed = G.seed;
  // 天梯只算「連線、且至少有一隊對手裡有真人」的對局；練習或全是 AI 對手不計分
  const humanAt = G.humanAt || G.players.map(p => !p.ai);
  const ranked = !!G.online && G.players.some((p, i) => p.team !== t && humanAt[i]);
  if (!ranked) { ladderSave(); LADDER_RES = { seed: G.seed, unranked: true, after: LADDER.lp }; return LADDER_RES; }
  const practice = false, n = G.teams.length, meLp = LADDER.lp;
  const base = n === 2 ? (T.place === 1 ? LADDER_CFG.WIN2 : LADDER_CFG.LOSE2) : LADDER_CFG.PLACE4[Math.min(4, T.place)];
  const others = G.teams.map((x, i) => i).filter(i => i !== t);
  const oppAvg = others.reduce((a, i) => a + teamLp(G, i, meLp), 0) / others.length;
  const d = ladderDelta(base, teamLp(G, t, meLp), oppAvg, practice);
  const before = LADDER.lp;
  LADDER.lp = Math.max(0, LADDER.lp + d); LADDER.games++; if (T.place === 1) LADDER.wins++; if (T.place <= Math.max(1, n / 2)) LADDER.top++;
  LADDER.hist.unshift({ t: Date.now(), d: LADDER.lp - before, lp: LADDER.lp, place: T.place, n, mode: practice ? '練習' : '連線' }); LADDER.hist = LADDER.hist.slice(0, 20);
  // 連線：順便更新一起玩的人（用同一套公式估算，下次見面會再以對方自己的數字為準）
  if (G.ladder) G.players.forEach(p => { const info = G.ladder[p.id]; if (!info || !info.pid || info.pid === LADDER.id) return; const tt = G.teams[p.team]; const b2 = n === 2 ? (tt.place === 1 ? LADDER_CFG.WIN2 : LADDER_CFG.LOSE2) : LADDER_CFG.PLACE4[Math.min(4, tt.place || 4)];
    const oth = G.teams.map((x, i) => i).filter(i => i !== p.team), oa = oth.reduce((a, i) => a + teamLp(G, i, meLp), 0) / oth.length;
    LADDER.seen[info.pid] = { name: info.name, lp: Math.max(0, info.lp + ladderDelta(b2, teamLp(G, p.team, meLp), oa, false)), t: Date.now() }; });
  ladderSave(); if (!netBlocked()) glPublishRecord(); // 發出簽名的對局紀錄（排行榜由紀錄重算）
  const up = ladderTier(LADDER.lp) > ladderTier(before), down = ladderTier(LADDER.lp) < ladderTier(before);
  LADDER_RES = G.ladderRes = { seed: G.seed, before, after: LADDER.lp, d: LADDER.lp - before, up, down };
  if (up) setTimeout(() => { banner('晉級！', ladderTierName(LADDER.lp), 'win'); if (typeof confetti === 'function') confetti(); }, 600);
  return LADDER_RES;
}
function ladderOverHtml() {
  const r = ladderSettle() || (LADDER_RES && G && LADDER_RES.seed === G.seed ? LADDER_RES : null); if (!r) return '';
  if (r.pending) return '<div class="lpres" id="lpLive"><small>天梯結算中…</small></div>';
  if (r.unranked) return `<div class="lpres"><div>${tierBadge(r.after)}</div><small>${G.online ? '對手都是 AI，這場不計分' : '練習模式不計天梯分數'}（排位配對或跟真人連線才算）</small></div>`;
  return ladderResHtml(r);
}
function ladderResHtml(r) {
  return `<div class="lpres"><div>${tierBadge(r.after)}</div><b class="${r.d >= 0 ? 'up' : 'dn'}">${r.d >= 0 ? '+' : ''}${r.d} LP</b><small>${r.before} → ${r.after}</small></div>`;
}
// 被淘汰但比賽還沒結束：跳出名次與 LP，可以繼續觀戰
function ladderFrame() {
  if (G && G.online && G.phase === 'over' && LADDER_RES && LADDER_RES.seed === G.seed && !LADDER_RES.unranked && LADDER_RES.full !== G.seed) { LADDER_RES.full = G.seed; if (!netBlocked()) glPublishRecord(); } // 被淘汰時發的紀錄只有部分名次，結束時補發完整的
  if (!G || LADDER_SHOWN === G.seed || $('game').hidden) return;
  const T = G.teams[myTeam()];
  if (G.phase !== 'over' && T.out) {
    LADDER_SHOWN = G.seed;
    $('panel').innerHTML = `<div class="over"><h2>第 ${T.place} 名</h2><p>我隊被淘汰了，其他隊還在打。</p>${ladderOverHtml()}<div><button class="btn" id="btnWatch">繼續觀戰</button> <button class="btn primary" id="btnOutLobby">回大廳</button></div></div>`;
    $('overlay').hidden = false;
    $('btnWatch').onclick = () => { $('overlay').hidden = true; };
    $('btnOutLobby').onclick = () => { if (NET.role) netLeave(); else { G = null; for (const k in S3.V) s3Remove(k); $('overlay').hidden = true; $('game').hidden = true; $('lobby').hidden = false; } };
  }
}
// ===== 全球天梯（測試服：不用帳號、不用自己的伺服器）=====
// 防作弊做法：排行榜上的分數不是各人自己報的，而是由「對局紀錄」重新算出來。
// 每場結束，每位真人各自發一份對局紀錄（用這台裝置專屬的金鑰簽名），存在公用伺服器的保留訊息。
// 一隊的名次要有「至少兩個不同隊伍的真人」簽名紀錄一致才算數；改本機存檔、偽造別人的紀錄都沒用。
// 仍擋不住：同一人開多個分身互相作證（要等之後有帳號與自己的伺服器才能擋）。
const GLOBAL_LADDER = {
  TOPIC: 'zoochess/v1/ladder/',  // 舊版自報分數的位置（v0.8 起清掉）
  RES: 'zoochess/v1/res/',       // 對局紀錄：res/<種子>/<玩家id>
  WAIT_MS: 3000, SHOW: 100, KEEP_DAYS: 120,
  MIN_TEAMS: 2,                  // 名次要幾個不同隊伍的紀錄一致才算
  DAY_CAP: 40,                   // 每人每天最多計入幾場（擋洗分）
};
const GL = { mq: null, recs: {}, rows: [], open: false };
// ---- 本機金鑰（ECDSA P-256，存在這台裝置）----
const _b64 = u => btoa(String.fromCharCode(...new Uint8Array(u))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const _unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
let KEY = null;
async function glKey() {
  if (KEY) return KEY;
  const C = crypto.subtle; let j = null; try { j = JSON.parse(localStorage.getItem('zoo_key') || 'null'); } catch (e) {}
  if (j && j.d) {
    KEY = { priv: await C.importKey('jwk', j, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']), pub: j.x + '.' + j.y };
  } else {
    const kp = await C.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jw = await C.exportKey('jwk', kp.privateKey); try { localStorage.setItem('zoo_key', JSON.stringify(jw)); } catch (e) {}
    KEY = { priv: kp.privateKey, pub: jw.x + '.' + jw.y };
  }
  return KEY;
}
// ---- 身分轉移碼：ZC1.<私鑰d>.<公鑰x>.<公鑰y> ----
async function xferExport() {
  if (!window.crypto || !crypto.subtle) return '';
  await glKey(); let j = null; try { j = JSON.parse(localStorage.getItem('zoo_key') || 'null'); } catch (e) {}
  return j && j.d ? `ZC1.${j.d}.${j.x}.${j.y}` : '';
}
async function xferImport(code) {
  const m = String(code || '').replace(/\s+/g, '').match(/^ZC1\.([A-Za-z0-9_-]{40,46})\.([A-Za-z0-9_-]{40,46})\.([A-Za-z0-9_-]{40,46})$/);
  if (!m) return '轉移碼格式不對，請整段貼上';
  const jwk = { kty: 'EC', crv: 'P-256', d: m[1], x: m[2], y: m[3], ext: true, key_ops: ['sign'] };
  try { // 用這把私鑰簽一次、公鑰驗一次，確認兩半是一對
    const C = crypto.subtle, priv = await C.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const pub = await C.importKey('jwk', { kty: 'EC', crv: 'P-256', x: m[2], y: m[3], ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const msg = _te.encode('zoo'), sig = await C.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, msg);
    if (!(await C.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, msg))) return '轉移碼不正確';
    localStorage.setItem('zoo_key', JSON.stringify(jwk));
  } catch (e) { return '轉移碼不正確'; }
  KEY = null;
  const id = glPidOf(m[2] + '.' + m[3]);
  if (id !== LADDER.id) Object.assign(LADDER, { id, lp: 0, games: 0, wins: 0, top: 0, hist: [], seen: {}, verified: 0 });
  ladderSave();
  return 'ok';
}
const glPidOf = pub => 'k' + pub.slice(0, 16); // 玩家 id 由公鑰推出：別人沒有你的私鑰，就沒辦法用你的 id 發紀錄
async function glInitId() {
  if (!window.crypto || !crypto.subtle) return;
  try { const k = await glKey(), id = glPidOf(k.pub); if (LADDER.id !== id) { LADDER.id = id; ladderSave(); } } catch (e) {}
}
glInitId();
const glBody = r => JSON.stringify([r.seed, r.t, r.n, r.by, r.pub, r.pl, r.pc]);
async function glVerify(r) {
  try {
    const [x, y] = r.pub.split('.');
    const k = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x, y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, _unb64(r.sig), _te.encode(glBody(r)));
  } catch (e) { return false; }
}
// 這場的紀錄：真人名單（含隊伍）＋目前已知的各隊名次
function glRecord() {
  if (!G || !G.online || !G.ladder) return null;
  const pl = [];
  G.players.forEach((p, i) => { const L = G.ladder[i]; if (L && L.pid && G.humanAt && G.humanAt[i]) pl.push([L.pid, String(L.name || '').slice(0, 8), p.team]); });
  const pc = G.teams.map(T => T.place || 0);
  return { seed: G.seed >>> 0, t: Date.now(), n: G.teams.length, by: LADDER.id, pl, pc };
}
async function glPublishRecord() {
  if (netBlocked() || !crypto.subtle) return;
  const r = glRecord(); if (!r || !r.pl.some(x => x[0] === LADDER.id)) return;
  const k = await glKey(); r.pub = k.pub;
  r.sig = _b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.priv, _te.encode(glBody(r))));
  const msg = JSON.stringify(r), list = netBrokers();
  for (let i = 0; i < list.length; i++) { try { const mq = new MiniMqtt(list[i]); await mq.connect(netId()); mq.pub(GLOBAL_LADDER.RES + r.seed + '/' + LADDER.id, msg, true); setTimeout(() => mq.close(), 800); } catch (e) {} }
}
async function ladderPublish() { // v0.8：舊的自報分數一律清掉（空保留訊息＝移除）
  if (LADDER.oldCleared) return;
  const list = netBrokers();
  for (let i = 0; i < list.length; i++) { try { const mq = new MiniMqtt(list[i]); await mq.connect(netId()); mq.pub(GLOBAL_LADDER.TOPIC + LADDER.id, '', true); setTimeout(() => mq.close(), 800); } catch (e) {} }
  LADDER.oldCleared = 1; ladderSave();
}
function glShape(r) {
  return r && typeof r.seed === 'number' && typeof r.by === 'string' && r.by.length < 30 && typeof r.pub === 'string' && r.pub.length < 120 && typeof r.sig === 'string'
    && Array.isArray(r.pl) && r.pl.length <= 8 && Array.isArray(r.pc) && r.pc.length === r.n && r.n >= 2 && r.n <= 4
    && r.pl.every(x => Array.isArray(x) && typeof x[0] === 'string' && x[0].length < 30 && typeof x[1] === 'string' && x[2] >= 0 && x[2] < r.n)
    && Date.now() - r.t < GLOBAL_LADDER.KEEP_DAYS * 864e5 && r.t < Date.now() + 6e5;
}
// 從所有對局紀錄重算每個人的 LP
async function glLedger(recs) {
  const ok = [];
  for (const r of Object.values(recs)) {
    if (r.by !== glPidOf(r.pub)) continue;          // id 必須是這把公鑰推出來的
    if (!r.pl.some(x => x[0] === r.by)) continue;   // 發紀錄的人必須在名單上
    if (!(await glVerify(r))) continue;             // 簽名要對
    ok.push(r);
  }
  const bySeed = {}; for (const r of ok) (bySeed[r.seed] = bySeed[r.seed] || []).push(r);
  const games = [];
  for (const seed in bySeed) {
    const rs = bySeed[seed], base = rs[0], roster = JSON.stringify(base.pl);
    if (rs.some(r => JSON.stringify(r.pl) !== roster || r.n !== base.n)) continue; // 名單對不上＝有人亂寫
    const teamOf = {}; for (const x of base.pl) teamOf[x[0]] = x[2];
    const place = [];
    for (let t = 0; t < base.n; t++) {
      const claims = rs.filter(r => r.pc[t]), vals = new Set(claims.map(r => r.pc[t]));
      const teams = new Set(claims.map(r => teamOf[r.by]));
      place[t] = (vals.size === 1 && teams.size >= GLOBAL_LADDER.MIN_TEAMS) ? claims[0].pc[t] : 0;
    }
    if (!place.some(Boolean)) continue;
    games.push({ t: Math.min(...rs.map(r => r.t)), n: base.n, pl: base.pl, place });
  }
  games.sort((a, b) => a.t - b.t);
  const P = {}, day = {};
  const me = id => (P[id] = P[id] || { pid: id, name: '', lp: 0, games: 0, wins: 0, t: 0 });
  for (const g of games) {
    const lpOf = t => { const v = g.pl.filter(x => x[2] === t).map(x => me(x[0]).lp); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const humanAvg = g.pl.map(x => me(x[0]).lp).reduce((a, b) => a + b, 0) / g.pl.length;
    const tlp = Array.from({ length: g.n }, (_, t) => { const v = lpOf(t); return v === null ? humanAvg : v; });
    const upd = [];
    for (const [pid, name, t] of g.pl) {
      const pl = g.place[t]; const p = me(pid); p.name = name || p.name; p.t = Math.max(p.t, g.t);
      if (!pl) continue;
      const dk = pid + Math.floor(g.t / 864e5); day[dk] = (day[dk] || 0) + 1; if (day[dk] > GLOBAL_LADDER.DAY_CAP) continue;
      const base = g.n === 2 ? (pl === 1 ? LADDER_CFG.WIN2 : LADDER_CFG.LOSE2) : LADDER_CFG.PLACE4[Math.min(4, pl)];
      const others = tlp.filter((_, i) => i !== t), opp = others.reduce((a, b) => a + b, 0) / others.length;
      upd.push([p, ladderDelta(base, tlp[t], opp, false), pl]);
    }
    for (const [p, d, pl] of upd) { p.lp = Math.max(0, p.lp + d); p.games++; if (pl === 1) p.wins++; }
  }
  return Object.values(P).filter(p => p.games > 0);
}
async function glOpen() {
  if (GL.mq) return;
  const r = await netConnect(0); if (!r) { GL.err = '連不上排行榜伺服器'; glRender(); return; }
  GL.mq = r.mq; GL.recs = {};
  r.mq.onmsg = (topic, text) => { let m; try { m = JSON.parse(text); } catch (e) { return; } if (!glShape(m)) return; m.pl.forEach(x => { x[1] = x[1].slice(0, 8); }); GL.recs[m.seed + '/' + m.by] = m; if (GL.loaded) { clearTimeout(GL.rt); GL.rt = setTimeout(glRecalc, 400); } };
  r.mq.onclose = () => { GL.mq = null; };
  r.mq.sub(GLOBAL_LADDER.RES + '#');
  setTimeout(() => { GL.loaded = true; glRecalc(); }, GLOBAL_LADDER.WAIT_MS);
}
async function glRecalc() {
  GL.rows = await glLedger(GL.recs);
  const mine = GL.rows.find(r => r.pid === LADDER.id);
  if (mine && (mine.lp !== LADDER.lp)) { LADDER.lp = mine.lp; LADDER.verified = mine.games; ladderSave(); const m = document.getElementById('lpMeLp'); if (m) m.textContent = mine.lp + ' LP'; } // 以紀錄算出的分數為準
  glRender();
}
function glClose() { GL.open = false; if (GL.mq) { GL.mq.close(); GL.mq = null; } }
function glRender() {
  const box = document.getElementById('glList'); if (!box || !GL.open) return;
  if (GL.err && !GL.rows.length) { box.innerHTML = `<small>${GL.err}，先顯示本機紀錄。</small>`; return; }
  const all = GL.rows.slice().sort((a, b) => b.lp - a.lp || b.games - a.games), myRank = all.findIndex(r => r.pid === LADDER.id) + 1;
  document.getElementById('glRank').textContent = !GL.loaded ? '讀取中…' : myRank ? `你是第 ${myRank} 名／共 ${all.length} 人` : `共 ${all.length} 人（你還沒有經過確認的對局）`;
  box.innerHTML = all.slice(0, GLOBAL_LADDER.SHOW).map((r, i) => `<div class="lprow ${r.pid === LADDER.id ? 'me' : ''}"><span>${i + 1}</span><b>${esc(r.name)}${r.pid === LADDER.id ? '（你）' : ''}</b>${tierBadge(r.lp)}<em>${r.lp}</em></div>`).join('')
    + (myRank > GLOBAL_LADDER.SHOW ? `<div class="lprow me"><span>${myRank}</span><b>${esc(netName())}（你）</b>${tierBadge(LADDER.lp)}<em>${LADDER.lp}</em></div>` : '')
    || '<small>還沒有任何經過確認的對局。</small>';
}
setTimeout(() => { if (!netBlocked() && !srvOn()) ladderPublish(); }, 4000);

function openLadder() {
  if (srvOn()) { openLadderSrv(); return; }
  const rows = [{ name: '你（' + esc(netName()) + '）', lp: LADDER.lp, me: true }].concat(Object.values(LADDER.seen).map(s => ({ name: esc(s.name), lp: s.lp }))).sort((a, b) => b.lp - a.lp);
  const wr = LADDER.games ? Math.round(LADDER.wins * 100 / LADDER.games) : 0, online = !netBlocked();
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>天梯</h2>
    <div class="lpme">${tierBadge(LADDER.lp)}<b id="lpMeLp">${LADDER.lp} LP</b><small>${LADDER.games} 場・第一名 ${LADDER.wins} 次（${wr}%）・前半名次 ${LADDER.top} 次</small></div>
    <div class="lpbar"><i style="width:${LADDER.lp >= 700 ? 100 : (LADDER.lp % 100)}%"></i></div>
    <label class="rnum">排行榜上的名字<input id="glName" maxlength="8" value="${esc(netName())}"></label>
    ${online ? `<h3>全球排行榜 <small id="glRank">讀取中…</small></h3><div class="lplist" id="glList"><small>連線中…</small></div>` : ''}
    <h3>一起玩過的人</h3><div class="lplist">${rows.map((r, i) => `<div class="lprow ${r.me ? 'me' : ''}"><span>${i + 1}</span><b>${r.name}</b>${tierBadge(r.lp)}<em>${r.lp}</em></div>`).join('')}</div>
    ${window.crypto && crypto.subtle ? `<h3>身分轉移</h3><div class="xfer"><p class="nethint">換手機、換瀏覽器或清掉瀏覽器資料前，先抄下轉移碼；到新裝置輸入就能找回同一個天梯身分與分數。轉移碼等於你的天梯密碼，不要給別人。</p>
      <div class="xbtns"><button class="btn" id="xfShow">顯示我的轉移碼</button><button class="btn" id="xfIn">輸入轉移碼</button></div><div id="xfBox"></div></div>` : ''}
    <h3>最近戰績</h3><div class="lphist">${LADDER.hist.map(h => `<span class="${h.d >= 0 ? 'up' : 'dn'}" title="${new Date(h.t).toLocaleString()}">${h.n > 2 ? '#' + h.place : h.place === 1 ? '勝' : '敗'}<i>${h.d >= 0 ? '+' : ''}${h.d}</i><small>${h.mode}</small></span>`).join('') || '<small>還沒有戰績</small>'}</div>
    <p class="nethint">牌位：${LADDER_CFG.TIERS.join(' → ')}，每 100 LP 一階。2 隊對戰贏 +${LADDER_CFG.WIN2}／輸 ${LADDER_CFG.LOSE2}；4 隊混戰依名次 ${LADDER_CFG.PLACE4.slice(1).map(x => (x > 0 ? '+' : '') + x).join('／')}；對手越強贏越多、輸越少。和真人隊伍對戰才計分。</p>`;
  $('overlay').hidden = false;
  $('mX').onclick = () => { $('overlay').hidden = true; glClose(); };
  $('glName').onchange = e => { netSetName(e.target.value.trim().slice(0, 8) || '玩家'); glRender(); };
  if (online) { GL.open = true; GL.err = ''; GL.loaded = false; glOpen(); }
  if ($('xfShow')) {
    $('xfShow').onclick = async () => { const c = await xferExport(); $('xfBox').innerHTML = c ? `<textarea id="xfCode" readonly rows="3">${c}</textarea><button class="btn moss" id="xfCopy">複製</button>` : '<small>這個瀏覽器不支援</small>'; if (c) { $('xfCode').onclick = e => e.target.select(); $('xfCopy').onclick = () => { try { navigator.clipboard.writeText(c); toast('已複製轉移碼'); } catch (e) { $('xfCode').select(); } }; } };
    $('xfIn').onclick = () => { $('xfBox').innerHTML = `<textarea id="xfCode" rows="3" placeholder="貼上轉移碼（ZC1. 開頭）"></textarea><button class="btn primary" id="xfGo">換成這個身分</button><p class="nethint">換過去之後，這台裝置原本的身分會被取代；原本的身分若有分數，請先抄下它的轉移碼。</p>`;
      $('xfGo').onclick = async () => { const r = await xferImport($('xfCode').value); if (r !== 'ok') { toast(r, 3000); return; } toast('已換成轉移碼的身分，分數從對局紀錄重新讀取', 3200); glClose(); openLadder(); }; };
  }
}
window.__gl = { glLedger, glVerify, glBody, glKey, _b64, glPidOf }; // 測試用
