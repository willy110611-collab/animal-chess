// ===== 介面與流程：HUD、商店、拖放、事件特效 =====
const $ = id => document.getElementById(id);
let ME = 0; // 自己的座位（連線時由房主分配）
let G = null, sel = null, lastPhase = '', lastRound = 0, lastT = 0, cv = null, logIdx = 0, sched = [];
let prevLevel = 0, prevGold = null, prevTiers = {}, drag = null, itemDrag = null, PORT = {};
const ERR = { td_line: '前線外還不能放（守住一波不漏怪，前線就會往前推）', gift_gold_limit: '這個階段送金已達上限', gift_unit_limit: '這個階段已經送過動物了（每階段 1 隻）', gift_star: '這個階段還不能送這麼高星的動物', enemy_cell: '那格已經被敵人佔了', front_full: '每人最多放 1 隻到敵方前排', emblem_dup: '這隻已經有這個羈絆了', no_items: '這隻身上沒有裝備', cmd_used: '這場已經下過指令了', bank_empty: '金庫沒錢了', not_captain: '只有隊長可以做這件事', not_turn: '還沒輪到你', board_locked: '戰鬥中場上的棋子不能動，備戰席可以', no_gold: '金幣不夠', pool_empty: '卡池已經被買光了', bench_full: '備戰席滿了', pop_full: '人口滿了，先升級', teammate_cell: '那格是隊友的位置', bad_cell: '只能放在我方半場', full: '這隻的裝備欄滿了', their_bench_full: '隊友備戰席滿了', limit: '這回合送金已達上限 5', not_prep: '戰鬥中不能操作', no: '金幣不夠或已滿級', bad: '不行' };
const TNAME = k => TRAITS[k].name;
const myTeam = () => G.players[ME].team;
const mySide = () => SIDE(myTeam()); // 我在自己棋盤上是下半場（0）還是上半場（1）
const TEAM_NAMES = ['藍隊', '紅隊', '綠隊', '紫隊'];
const TEAM_PAL = [['#c8433a', '#8a4fc4'], ['#3f9a5a', '#c9a23a'], ['#b8437a', '#4a5ab8'], ['#7a6a5a', '#3aa8a8'], ['#d9772b', '#d9772b'], ['#6a9a2a', '#6a9a2a'], ['#a0522d', '#a0522d'], ['#2a8aa0', '#2a8aa0']]; // 敵隊顏色（依敵隊順序）
const teamLabel = t => G.solo ? (t === myTeam() ? '我' : (G.players.find(p => p.team === t) || {}).name || '對手') : t === myTeam() ? '我隊' : G.teams.length === 2 ? '敵隊' : TEAM_NAMES[t];
const at = (sec, fn) => sched.push({ t: nowS() + sec, fn });
function ownerColor(pid) {
  if (pid < 0) return null;
  const P = G.players[pid];
  if (P.team === myTeam()) return P.slot === 0 ? '#3d7fc4' : '#e08a2c';
  const others = G.teams.map((T, i) => i).filter(i => i !== myTeam()), pal = TEAM_PAL[Math.max(0, others.indexOf(P.team))];
  return pal[P.slot];
}
function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), ms || 1600); }
function banner(b1, b2, cls) { const b = $('banner'); b.className = ''; b.querySelector('.b1').textContent = b1; b.querySelector('.b2').textContent = b2 || ''; void b.offsetWidth; b.className = 'show ' + (cls || ''); }
// Q 版雙刀互敲＋火花（戰鬥中顯示在誰打誰中間）
function clashSvg(cls) {
  const sw = `<path d="M-4.5 -7 V-30 L0 -37 L4.5 -30 V-7 Z" fill="#eef3f8" stroke="#3a2a22" stroke-width="2.4" stroke-linejoin="round"/><path d="M0 -9 V-31" stroke="#b9c6d4" stroke-width="2" stroke-linecap="round"/><rect x="-10" y="-9" width="20" height="5.5" rx="2.75" fill="#f2c14e" stroke="#3a2a22" stroke-width="2.2"/><rect x="-3" y="-3.5" width="6" height="10" rx="2.5" fill="#9a5a30" stroke="#3a2a22" stroke-width="2"/><circle cy="9" r="3.6" fill="#f2c14e" stroke="#3a2a22" stroke-width="2"/>`;
  return `<svg class="clash ${cls || ''}" viewBox="0 0 64 48" aria-hidden="true"><g class="swL"><g transform="translate(18 38)">${sw}</g></g><g class="swR"><g transform="translate(46 38)">${sw}</g></g><g class="spark"><path d="M32 6 L35 15 L44 12 L37.5 19 L45 25 L35.5 23.5 L32 32 L28.5 23.5 L19 25 L26.5 19 L20 12 L29 15 Z" fill="#ffd34d" stroke="#e8792b" stroke-width="1.6" stroke-linejoin="round"/><circle cx="32" cy="19" r="3.4" fill="#fff8d8"/><circle cx="16" cy="9" r="1.8" fill="#ffb03a"/><circle cx="49" cy="8" r="1.6" fill="#ffd34d"/><circle cx="12" cy="20" r="1.3" fill="#ff8a3a"/><circle cx="52" cy="21" r="1.5" fill="#ffb03a"/></g></svg>`;
}
const goldSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="9" fill="#d99a2b"/><circle cx="12" cy="13" r="6.2" fill="#f2c14e"/><path d="M7.5 7.5q4.5-5 9 0z" fill="#7a4f28"/></svg>';

// ---- 3D 小頭像（商店卡、圖鑑、資訊卡）----
// 頭像：第一次開啟時用 3D 模型畫出來（分批，不卡住畫面），畫好後存在本機，之後開遊戲直接讀
const PORT_VER = 'p6-' + Object.keys(ANIMALS).length; // 模型外觀有改時把 p1 改成 p2，舊快取就會重畫
// 立繪取景：PAD＝卡牌全身留邊（越大角色越小），HEAD_PAD＝圓形頭像留邊
const PORT_CFG = { PAD: 1.12, HEAD_PAD: 1.3 };
// 隊伍頭像（血量圓圈）可選的角色：設定 → 頭像。第一個是預設；電腦／其他隊伍依序輪流用
const AV_CFG = { LIST: ['chick', 'fox', 'redpanda', 'penguin', 'koala', 'owl', 'lion', 'frog', 'bee', 'hedgehog', 'cheetah', 'elephant'] };
const myAvatar = () => (typeof PROFILE !== 'undefined' && AV_CFG.LIST.includes(PROFILE.avatar)) ? PROFILE.avatar : AV_CFG.LIST[0];
const teamAvatar = ti => { if (ti === myTeam()) return myAvatar(); const L = AV_CFG.LIST.filter(k => k !== myAvatar()); return L[ti % L.length]; };
const avSrc = k => PORT['h:' + k] || PORT[k] || '';
function makePortraits(first, done) {
  try { const c = JSON.parse(localStorage.getItem('zoo_port') || 'null'); if (c && c.v === PORT_VER) { Object.assign(PORT, c.p); document.querySelectorAll('img[data-pk]').forEach(im => { if (PORT[im.dataset.pk]) im.src = PORT[im.dataset.pk]; }); done && done(); return; } } catch (e) {}
  const all = Object.keys(ANIMALS).concat(['hare', 'boar', 'kingboar', 'minibee', 'chick']);
  const order = first.concat(all.filter(k => !first.includes(k)));
  const c = document.createElement('canvas'); c.width = c.height = 220;
  const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff1dc, 0x8a5a3c, 1.3)); const d = new THREE.DirectionalLight(0xffe2b8, 2.2); d.position.set(-3, 5, 6); sc.add(d);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const one = k => {
    const R = buildAnimal(k); R.phase = 0; poseRig(R, { t: 0.4 });
    R.yaw.rotation.y = -0.4; sc.add(R.root);
    // 用整隻模型的外框來取景（只算看得到的部分，會飛的動物也完整入鏡），四周留一點邊
    R.root.updateMatrixWorld(true);
    const vbox = o => { const b = new THREE.Box3(); o.traverseVisible(m => { if (m.isMesh) { m.geometry.computeBoundingBox && !m.geometry.boundingBox && m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); } }); return b; };
    const shoot = (box, pad, lift) => { const ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const half = Math.max(sz.y, sz.x * 0.95) / 2 * pad, dist = half / Math.tan(cam.fov * Math.PI / 360) + sz.z / 2;
      cam.position.set(ctr.x, ctr.y + dist * lift, ctr.z + dist); cam.lookAt(ctr.x, ctr.y, ctr.z); r.render(sc, cam); return c.toDataURL('image/png'); };
    const full = vbox(R.root);
    PORT[k] = shoot(full, PORT_CFG.PAD, 0.18);
    // 隊伍頭像（血量圓圈用）：只框頭
    if (AV_CFG.LIST.includes(k)) { let hb = R.head ? vbox(R.head) : null;
    if (!hb || hb.isEmpty()) { hb = full.clone(); hb.min.y = full.max.y - (full.max.y - full.min.y) * 0.45; }
    PORT['h:' + k] = shoot(hb, PORT_CFG.HEAD_PAD, 0.05); }
    sc.remove(R.root);
    document.querySelectorAll(`img[data-pk="${k}"]`).forEach(im => { im.src = PORT[k]; });
    LD.set(50 + 40 * i / order.length);
  };
  let i = 0;
  const step = () => {
    const t0 = performance.now();
    while (i < order.length && performance.now() - t0 < 30) one(order[i++]); // 每批最多 30ms，中間讓畫面更新
    if (i < order.length) { setTimeout(step, 0); return; }
    r.dispose(); r.forceContextLoss && r.forceContextLoss();
    try { localStorage.setItem('zoo_port', JSON.stringify({ v: PORT_VER, p: PORT })); } catch (e) {}
    done && done();
  };
  step();
}
const pimg = (k, cls) => `<img src="${PORT[k] || ''}" data-pk="${k}" alt="" class="${cls || ''}">`;

// ---- 單位資料 ----
function unitStats(u) {
  const A = ANIMALS[u.key] || EXTRA[u.key], m = CFG.STAR_MUL[u.star];
  const s = { hp: Math.floor(A.hp * m / 100), atk: Math.floor(A.atk * m / 100), as: 0, arm: A.arm, mr: A.mr, sm: A.sm };
  for (const it of u.items || []) { const st = (itemDef(it) || {}).stat || {}; for (const k in st) s[k] = (s[k] || 0) + st[k]; }
  if (u.star >= 3 && ANIMALS[u.key]) { s.hp = Math.floor(s.hp * 1.2); s.atk = Math.floor(s.atk * 1.2); }
  s.aps = (20 / A.ai * (100 + s.as) / 100).toFixed(2);
  return s;
}
// 技能說明的數值依星級顯示（像聯盟戰棋 150/225/438），star 給了就把那一星加粗；倍率跟 engine.js 的 SKILL_CFG 一樣，3 星傷害再 +30%（進化）
const SKILL_NUM_SKIP = { bee: 1 }; // 蜜蜂說明裡的 60 是小蜂固定傷害，不隨星級
function skillDesc(key, star) {
  const A = ANIMALS[key]; if (!A || SKILL_NUM_SKIP[key]) return A ? A.desc : '';
  const mul = SKILL_CFG.MUL[A.cost] || SKILL_MUL;
  const fmt = (v, dmg) => [1, 2, 3].map(s => { const x = Math.floor(v * mul[s] / 100 * (s >= 3 && dmg ? 1.3 : 1)); return s === star ? `<b>${x}</b>` : x; }).join('/');
  return A.desc.replace(/(\d+)( ?)(物理傷害|魔法傷害|真實傷害|護盾)/g, (m, v, sp, w) => fmt(+v, w !== '護盾') + sp + w)
    .replace(/(治療[^0-9，。]*?)(\d+)/g, (m, pre, v) => pre + fmt(+v, false));
}
function findUnit(uid) {
  for (const k in G.board) if (G.board[k].uid === uid) return { u: G.board[k], zone: 'board', cell: +k };
  for (const P of G.players) { const i = P.bench.findIndex(u => u && u.uid === uid); if (i >= 0) return { u: P.bench[i], zone: 'bench', i, pid: P.id }; }
  return null;
}
const cellOf = (vc, vr) => { const [c, r] = vview(vc, vr, mySide()); return teamCell(myTeam(), r * CFG.COLS + c); };
function worldOfCell(cell, side) { const [c, r] = cellRC(cell), [vc, vr] = vview(c, r, side); return cellWorld(vc, vr); }

// ---- 對手備戰席（棋盤最上方一排，小一號）----
function oppTeamNow() {
  const vt = myTeam();
  if (G.phase !== 'prep' && G.battles && G.battles.length) { const b = G.battles.find(x => x.teams.includes(vt)); if (b) { const o = b.teams[0] === vt ? b.teams[1] : b.teams[0]; if (o >= 0 && !b.ghost) return o; } }
  if (G.teams.length === 2) return vt ^ 1;
  return G.lastOpp && G.lastOpp[vt] >= 0 ? G.lastOpp[vt] : -1;
}
function oppBenchList(list) {
  const ot = oppTeamNow(); if (ot < 0 || isPve(G.round)) return;
  const ps = G.players.filter(p => p.team === ot), n = ps.length * CFG.BENCH;
  ps.forEach((P, pi) => P.bench.forEach((u, i) => { if (!u) return; const [x, z] = oppBenchWorld(pi * CFG.BENCH + i, n); list.push({ k: 'ob' + u.uid, key: u.key, star: u.star, color: ownerColor(P.id), enemy: true, mini: true, x, z, hp: 1, maxhp: 1 }); }));
}
// ---- 看別人的棋盤（準備階段，像聯盟戰棋點頭像去別人家看）----
let SCOUT = -1;
const scoutTeam = () => (SCOUT >= 0 && G && G.phase === 'prep' && SCOUT !== myTeam() && G.teams[SCOUT] && !G.teams[SCOUT].out) ? SCOUT : -1;
const teamColor = t => { if (t === myTeam()) return '#3d7fc4'; const others = G.teams.map((T, i) => i).filter(i => i !== myTeam()); return (TEAM_PAL[Math.max(0, others.indexOf(t))] || TEAM_PAL[0])[0]; };
function scoutList(vt) {
  const list = [];
  for (const k in G.board) {
    const u = G.board[k], P = G.players[u.owner]; if (P.team !== vt) continue;
    const [x, z] = worldOfCell(+k, SIDE(vt)), st = unitStats(u);
    list.push({ k: 'u' + u.uid, key: u.key, items: u.items, star: u.star, color: ownerColor(u.owner), enemy: vt !== myTeam(), x, z, hp: st.hp, maxhp: st.hp, mana: st.sm, manaMax: (ANIMALS[u.key] || {}).mana });
  }
  G.players.filter(P => P.team === vt).forEach((P, pi) => P.bench.forEach((u, i) => { if (!u) return; const [x, z] = pi === 0 ? benchWorld(i) : oppBenchWorld(i, CFG.BENCH); list.push({ k: 'u' + u.uid, key: u.key, star: u.star, color: ownerColor(P.id), enemy: vt !== myTeam(), mini: pi > 0, x, z, hp: 1, maxhp: 1 }); }));
  return list;
}
function setScout(t) {
  SCOUT = t === myTeam() ? -1 : t; sel = null;
  for (const k in S3.V) s3Remove(k, true);
  renderPrep(); hud.k = '';
}
function scoutStep(d) { // ‹ › 切換下一個還活著的對手
  const alive = G.teams.map((T, i) => i).filter(i => !G.teams[i].out);
  const cur = scoutTeam() >= 0 ? scoutTeam() : myTeam(); let j = alive.indexOf(cur);
  j = (j + d + alive.length) % alive.length; setScout(alive[j]);
}
function renderScoutBar() {
  let el = $('scoutBar');
  if (!el) { el = document.createElement('div'); el.id = 'scoutBar'; $('stage').appendChild(el); el.addEventListener('click', e => { const b = e.target.closest('[data-sc]'); if (!b) return; const v = b.dataset.sc; if (G && G.phase !== 'prep') { if (v === 'home') watchBattle(-1); else watchStep(+v); return; } if (v === 'home') setScout(myTeam()); else scoutStep(+v); }); }
  const sc = scoutTeam(); el.hidden = sc < 0; if (sc < 0) return;
  el.innerHTML = `<button class="scb" data-sc="-1" aria-label="上一個">‹</button><span><i style="--c:${teamColor(sc)}"></i>正在看 <b>${esc(teamLabel(sc))}</b> 的棋盤</span><button class="scb" data-sc="1" aria-label="下一個">›</button><button class="btn sch" data-sc="home">回到我的棋盤</button>`;
}
// ---- 準備階段同步 ----
function prepList() {
  if (scoutTeam() >= 0) return scoutList(scoutTeam());
  const vt = myTeam(), list = [], pve = isPve(G.round) && !G.td;
  for (const k in G.board) {
    const u = G.board[k], P = G.players[u.owner];
    if (pve && P.team !== vt) continue;
    if (GRP(P.team) !== GRP(vt) || (G.teams.length > 2 && P.team !== vt)) continue; // 4 隊模式：準備時只看自己隊
    const [x, z] = worldOfCell(+k, SIDE(vt)), st = unitStats(u);
    list.push({ k: 'u' + u.uid, key: u.key, items: u.items, star: u.star, color: ownerColor(u.owner), enemy: P.team !== vt, x, z, hp: st.hp, maxhp: st.hp, mana: st.sm, manaMax: (ANIMALS[u.key] || {}).mana, skin: u.owner === ME ? skinOf(u.key) : null });
  }
  G.players[ME].bench.forEach((u, i) => { if (!u) return; const [x, z] = benchWorld(i), st = unitStats(u); list.push({ k: 'u' + u.uid, key: u.key, items: u.items, star: u.star, color: ownerColor(ME), x, z, hp: st.hp, maxhp: st.hp, mana: st.sm, manaMax: ANIMALS[u.key].mana, skin: skinOf(u.key) }); });
  oppBenchList(list);
  if (pve) pveOf(G.round).forEach(([key, c, r], i) => { const [gc, gr] = toGlobal(1 - vt === 1 ? 1 : 0, c, r); const [vc, vr] = [CFG.COLS - 1 - c, CFG.ROWS - 1 - r]; const [x, z] = cellWorld(vc, vr); const st = unitStats({ key, star: key === 'kingboar' ? BOSS_CFG.STAR : PVE_STAR[G.round] || 3, items: [] }); list.push({ k: 'pw' + i, key, star: PVE_STAR[G.round] || 3, enemy: true, x, z, hp: st.hp, maxhp: st.hp }); });
  return list;
}
function renderPrep() {
  s3SetArena(G.arena); $('stage').dataset.arena = G.arena;
  const sc = scoutTeam();
  s3SetTerrain(G.terrain, sc >= 0 ? SIDE(sc) : mySide(), null, G.height || {});
  s3Sync(prepList(), 'prep');
  renderDock(); renderTraits(); renderSheet(); if (sc >= 0) s3Highlight([]); else highlightSel();
  renderScoutBar(); $('stage').classList.toggle('scouting', sc >= 0);
}
function highlightSel() {
  const hl = [];
  if (sel && sel.type === 'unit' && G.phase === 'prep') {
    const f = findUnit(sel.uid);
    if (f && f.u.owner === ME) for (let vr = 0; vr < (G.rules.frontline ? CFG.ROWS_HALF + 1 : CFG.ROWS_HALF); vr++) for (let vc = 0; vc < CFG.COLS; vc++) { const ok = cellValid(f, cellOf(vc, vr)); if (ok === true) hl.push({ type: 'tile', vc, vr, col: 0x3a6a20 }); }
    if (f && f.zone === 'board') { const [fc, fr] = cellRC(f.cell), [vc, vr] = vview(fc, fr, mySide()); hl.push({ type: 'tile', vc, vr, col: 0x6a5a10 }); }
  }
  s3Highlight(hl);
}
function cellValid(f, cell) {
  const P = G.players[ME];
  if (!canPlace(G, P, cell) || G.terrain[cellBase(cell)] === 'rock') return 'bad_cell';
  if (G.board[cell] && G.players[G.board[cell].owner].team !== P.team) return 'enemy_cell';
  const occ = G.board[cell];
  if (occ && occ.owner !== ME) { const Mo = G.players[occ.owner]; return Mo.team === P.team && Mo.ai && (f.zone === 'board' || G.phase === 'prep') ? true : 'teammate_cell'; } // 只能跟電腦隊友換位置
  if (f.zone === 'bench' && !occ && boardCount(G, ME) >= popCap(P)) return 'pop_full';
  return true;
}

// ---- 動作與日誌特效 ----
function actMe(a) { return (typeof NET !== 'undefined' && NET.role === 'client') ? netSendAct(a) : act(G, ME, a); }
// 備戰時偶爾讓自己隊上的一隻動物叫一兩聲（不要太頻繁；IDLE_VOICE 可調）
const IDLE_VOICE = { MIN_S: 9, MAX_S: 18, TWICE: 0.3 }; // 間隔秒數範圍、叫兩聲的機率
let idleNext = 0;
function idleVoice() {
  const t = nowS(); if (!idleNext) idleNext = t + IDLE_VOICE.MIN_S; if (t < idleNext) return;
  idleNext = t + IDLE_VOICE.MIN_S + Math.random() * (IDLE_VOICE.MAX_S - IDLE_VOICE.MIN_S);
  if (drag || G.timer < 3000) return;
  const ks = Object.keys(S3.V).filter(k => { const v = S3.V[k]; return v.mode === 'prep' && !v.dragging && v.info && !v.info.enemy && !v.info.mini && ANIMALS[v.unitKey]; });
  if (!ks.length) return;
  const v = S3.V[ks[Math.floor(Math.random() * ks.length)]], n = Math.random() < IDLE_VOICE.TWICE ? 2 : 1;
  for (let i = 0; i < n; i++) at(i * 0.7, () => { if (!S3.V[v.k]) return; voice(v.unitKey); v.land = nowS(); sprite('note', v3top(v).add(V3(0.15, 0.1, 0)), { scale: 0.22, scale1: 0.3, life: 0.9, vel: V3(0.25, 0.7, 0), color: 0xfff2c8 }); });
}
// 回大廳（pick：直接打開選模式）
function leaveToLobby(pick) {
  sel = null; const shx = $('sheet'); if (shx) shx.hidden = true; // v0.13.11：遊戲裡打開的資訊卡不要留到大廳
  $('game').classList.remove('td'); if (typeof tdFrontMesh === 'function') tdFrontMesh(null);
  if (NET.role) netLeave();
  else { G = null; for (const k in S3.V) s3Remove(k); $('game').hidden = true; $('lobby').hidden = false; }
  $('overlay').hidden = true; const am = $('augModal'); if (am) am.hidden = true; const m2 = $('modal2'); if (m2) m2.hidden = true;
  if (pick) setTimeout(() => { const b = $('btnPlay'); if (b) b.click(); }, 60);
}
// 下一場可能的對手：每隊的陣容縮圖（場上的動物，貴的、星高的排前面）
function openNextOpp() {
  const t = myTeam(), cand = (G.nextCand && G.nextCand[t]) || [];
  const comp = team => Object.values(G.board).filter(u => G.players[u.owner].team === team).sort((a, b) => (ANIMALS[b.key].cost * 10 + b.star) - (ANIMALS[a.key].cost * 10 + a.star));
  const rows = cand.map(c => { const T = G.teams[c], us = comp(c); return `<div class="nopp"><div class="nh"><i class="dot" style="--c:${teamColor(c)}"></i><b>${esc(teamLabel(c))}</b><small>血 ${Math.max(0, T.hp)}${(T.streak || 0) >= 2 ? `・${T.streak} 連勝` : (T.streak || 0) <= -2 ? `・${-T.streak} 連敗` : ''}</small><button class="btn" data-look="${c}">看棋盤</button></div><div class="nu">${us.map(u => `<span class="s${u.star}" style="--cc:${COST_COL[ANIMALS[u.key].cost]}">${pimg(u.key)}<i>${'★'.repeat(u.star)}</i></span>`).join('') || '<small>場上還沒有棋子</small>'}</div></div>`; }).join('');
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>下一場可能的對手</h2><p class="nethint">真正的對手是其中一隊，開打才知道。</p>${rows}`;
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; };
  $('panel').querySelectorAll('[data-look]').forEach(b => b.onclick = () => { $('overlay').hidden = true; setScout(+b.dataset.look); });
}
// 推薦裝備（依定位）
const REC_ITEMS = { '坦': ['hardshell', 'thornshell', 'bigacorn'], '遠程': ['galefeather', 'bigstick', 'fang'], '戰士': ['warhammer', 'bigstick', 'honeyacorn'], '法師': ['beeswax', 'morningdew', 'honeypot'], '刺客': ['fang', 'bigstick', 'fogcloak'], '控制': ['morningdew', 'pearl', 'waxshell'], '召喚': ['honeypot', 'morningdew', 'beeswax'], '坦／爆發': ['hardshell', 'warhammer', 'honeyacorn'], '控制法師': ['beeswax', 'morningdew', 'pearl'], '領袖': ['conch', 'moondew', 'bigacorn'], '坦／法師': ['waxshell', 'beeswax', 'hardshell'], '輔助': ['honeypot', 'conch', 'moondew'] };
function recItemsLine(key) { const L = (REC_ITEMS[(ANIMALS[key] || {}).role] || []).filter(k => ITEMS[k]); if (!L.length) return ''; return `<p class="rec">推薦裝備：${L.map(k => `<span title="${ITEMS[k].desc}（${ITEMS[k].from.map(m => MATS[m].name).join('＋')}）">${iconItem(k)}${ITEMS[k].name}</span>`).join('')}</p>`; }
// 賽後 MVP：累計這場每隻我方動物的輸出
const MVP = { seed: null, dmg: {} };
function mvpAdd(B, vt) { if (!G) return; if (MVP.seed !== G.seed) { MVP.seed = G.seed; MVP.dmg = {}; } for (const u of B.units) if (u.team === vt && u.owner >= 0 && G.players[u.owner] && G.players[u.owner].team === myTeam()) MVP.dmg[u.key] = (MVP.dmg[u.key] || 0) + (u.dmgDone || 0); }
const MVP_LINES = ['整場最會打的就是牠！', '一隻撐起整個陣容。', '對手看到牠就頭痛。', '今天的動物園之星。', '輸出擔當，非牠莫屬。'];
function mvpHtml() { if (MVP.seed !== G.seed) return ''; const top = Object.entries(MVP.dmg).sort((a, b) => b[1] - a[1])[0]; if (!top || !top[1]) return ''; const A = ANIMALS[top[0]]; return `<div class="mvp">${pimg(top[0])}<div><small>本場 MVP</small><b>${A ? A.name : top[0]}</b><span>總輸出 ${Math.round(top[1])}・${MVP_LINES[top[0].length % MVP_LINES.length]}</span></div></div>`; }
// 戰鬥中也能放裝備：備戰席馬上生效；場上正在打的棋子下一場戰鬥生效
function equipTo(idx, uid, f) { const r = doAct({ t: 'equip', idx, uid }); if ((r === 'ok' || r === 'net') && G.phase !== 'prep' && f.zone === 'board') toast('裝好了，下一場戰鬥生效', 1600); return r; }
function doAct(a, quiet) {
  const r = actMe(a);
  if (r === 'net') return r;
  if (r !== 'ok' && !quiet) toast(ERR[r] || '不行');
  processLog();
  refresh();
  return r;
}
function processLog() {
  while (logIdx < G.log.length) {
    const L = G.log[logIdx++];
    featuresLog(L);
    if (L.pid !== ME && L.k !== 'gift') continue;
    if (L.k === 'merge') fxMerge(L);
    else if (L.k === 'sell') { const v = S3.V['u' + L.uid]; if (v) { burst(v.pos.clone().add(V3(0, 0.4, 0)), 10, { tex: 'coin', scale: 0.18, speed: 1.6, up: 3, g: -7, life: 0.8 }); burst(v.pos.clone().add(V3(0, 0.4, 0)), 6, { color: 0xffffff, scale: 0.3, speed: 1, up: 0.5, g: 0 }); } }
    else if (L.k === 'reroll') { const b = $('btnRoll'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin'); flipShop = true; }
    else if (L.k === 'craft') { const v = S3.V['u' + L.uid]; if (v) { burst(v.pos.clone().add(V3(0, 0.6, 0)), 14, { tex: 'star', scale: 0.16, speed: 1.8, up: 2, g: -3, life: 0.9 }); groundRing(v.pos, 0xffd34d, 1.2, 0.6); } toast('合成：' + ITEMS[L.item].name + '！'); }
    else if (L.k === 'equip') { const v = S3.V['u' + L.uid]; if (v) burst(v.pos.clone().add(V3(0, 0.6, 0)), 8, { tex: 'spark', color: 0xffe9a0, scale: 0.12, add: true, speed: 1.4, up: 1.5, g: -2 }); }
    else if (L.k === 'buy') { buyFly = L; }
    else if (L.k === 'gift' && L.to === ME) toast(`隊友送你 ${L.s}`);
    else if (L.k === 'swap') toast('跟隊友的棋子交換位置');
    else if (L.k === 'gain') { buyFly = null; at(0.1, () => { const v = S3.V['u' + L.uid]; if (v) { v.pop = nowS(); fxMerge({ uid: L.uid, eaten: [], star: 2 }); } }); }
  }
}
let flipShop = false, buyFly = null;
function fxMerge(L) {
  const sv = S3.V['u' + L.uid];
  const target = sv ? sv.pos.clone() : null;
  at(0.05, () => {
    const v = S3.V['u' + L.uid]; if (!v) return;
    const to = v.pos.clone().add(V3(0, 0.5, 0));
    for (const e of L.eaten) { const ev = S3.V['u' + e]; const from = ev ? ev.pos.clone().add(V3(0, 0.5, 0)) : to.clone().add(V3(0, 0, 1)); for (let i = 0; i < 6; i++) projectile(from, to, 'spark', 0.45, { color: 0xffd34d, scale: 0.16, arc: 0.6 + Math.random() * 0.6, delay: i * 0.04 }); }
    at(0.45, () => {
      const vv = S3.V['u' + L.uid]; if (!vv) return;
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 3.2, 24, 1, true), new THREE.MeshBasicMaterial({ map: tex('beam'), color: L.star === 3 ? 0xffd34d : 0xdfe8ff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      pil.position.copy(vv.pos).add(V3(0, 1.6, 0));
      meshFx(pil, { life: 1.0, custom: (f, p) => { f.o.scale.set(1 + p * 0.3, 1, 1 + p * 0.3); f.o.material.opacity = Math.sin(p * Math.PI); } });
      burst(vv.pos.clone().add(V3(0, 0.6, 0)), 16, { tex: 'star', scale: 0.2, speed: 2.2, up: 3, g: -5, life: 1.0 });
      groundRing(vv.pos, L.star === 3 ? 0xffd34d : 0xffffff, 2.0, 0.7);
      vv.pop = nowS(); S3.shake = Math.max(S3.shake, 0.06);
      s3Num('u' + L.uid, '★'.repeat(L.star) + ' 升星！', 'skill', 0, 20);
    });
  });
}

// ---- 操作區 ----
function renderDock() {
  const P = G.players[ME], T = teammate(G, ME), prep = G.phase === 'prep';
  // 等級與經驗環
  const need = CFG.XP_NEED[P.level], frac = need ? P.xp / need : 1;
  $('xpFill').style.width = (frac * 100).toFixed(1) + '%';
  $('xpTxt').textContent = need ? `XP ${P.xp} / ${need}` : 'XP 已滿級';
  if (prevLevel && P.level > prevLevel) { const l = $('lvl'); l.classList.remove('up'); void l.offsetWidth; l.classList.add('up'); toast(`升到 Lv.${P.level}！人口 +1`); sfx('level'); groundRing(V3(0, 0, 1.5), 0x6fc0ff, 4.5, 0.9); }
  prevLevel = P.level;
  $('pop').innerHTML = `<b>Lv.${P.level}</b>（${boardCount(G, ME)}/${popCap(P)}）`;
  // 金幣
  const g = $('gold');
  const intr = Math.min(CFG.MAX_INTEREST, Math.floor(P.gold / 10)); // 利息格（照聯盟戰棋：每 10 金一格，最多 5 格）
  g.innerHTML = goldSvg + `<span>${P.gold}</span><i class="intr" title="利息 +${intr}（每 10 金 +1，最多 +${CFG.MAX_INTEREST}）">${Array.from({ length: CFG.MAX_INTEREST }, (_, i) => `<b class="${i < intr ? 'on' : ''}"></b>`).join('')}</i>`;
  if (prevGold !== null && P.gold !== prevGold) { const d = document.createElement('span'); d.className = 'df ' + (P.gold > prevGold ? 'p' : 'm'); d.textContent = (P.gold > prevGold ? '+' : '') + (P.gold - prevGold); g.appendChild(d); g.classList.remove('bump'); void g.offsetWidth; g.classList.add('bump'); }
  prevGold = P.gold;
  const live = G.phase !== 'over';
  $('btnLevel').disabled = !live || P.level >= CFG.MAX_LEVEL || P.gold < CFG.XP_COST;
  const rc = G.td ? TD_CFG.REROLL : rerollCost(P); $('rollCost').textContent = rc === 0 ? '免費' : '$' + rc;
  $('btnRoll').disabled = !live || P.gold < rc;
  renderAugs();
  $('btnLock').classList.toggle('on', P.locked);
  $('lockArc').setAttribute('d', P.locked ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 8 0');
  // 裝備
  const it = $('items'), had = it.dataset.n ? +it.dataset.n : 0;
  it.innerHTML = (P.items.length ? '' : '<span class="lbl">裝備材料會放在這裡（打野生回合掉落）</span>') + P.items.map((k, i) => `<button class="item ${ITEMS[k] ? 'done' : EMBLEMS[k] ? 'emb' : CONSUMABLES[k] ? 'cons' : ''} ${sel && sel.type === 'item' && sel.idx === i ? 'sel' : ''} ${i >= had ? 'new' : ''}" data-item="${i}" aria-label="${itemDef(k).name}">${iconItem(k)}</button>`).join('');
  it.dataset.n = P.items.length;
  // 商店
  const own = {}; for (const o of ownUnits(G, ME)) if (o.u.star === 1) own[o.u.key] = (own[o.u.key] || 0) + 1;
  const odds = CFG.SHOP_ODDS[P.level] || []; // 商店機率列（照聯盟戰棋顯示在商店上方）
  const oe = $('shopOdds') || (() => { const e = document.createElement('div'); e.id = 'shopOdds'; $('shop').parentNode.insertBefore(e, $('shop')); return e; })();
  const ot = odds.map((o, i) => `<span style="--cc:${COST_COL[i + 1]}"><i></i>${o}%</span>`).join('');
  if (oe.dataset.k !== ot) { oe.dataset.k = ot; oe.innerHTML = ot; }
  const shopH = P.shop.map((k, i) => {
    if (!k || (G.pool && G.pool[k] !== undefined && G.pool[k] <= 0)) return `<div class="card empty"></div>`; // 卡池被買光：不顯示，免得以為還能買
    const A = ANIMALS[k];
    const n = own[k] || 0, up = n >= 2 ? `<span class="own up" title="再買一隻就升星">★↑</span>` : n ? `<span class="own" title="已經有 ${n} 隻">${n}</span>` : '';
    return `<button class="card c${A.cost} ${(own[k] || 0) >= 2 ? 'pair' : ''} ${P.gold < A.cost ? 'poor' : ''} ${flipShop ? 'flip shine' : ''}" style="animation-delay:${i * 55}ms" data-slot="${i}" aria-label="購買${A.name}">
      <div class="in">${pimg(k)}${up}<div class="tt">${A.traits.map(t => `<span title="${TNAME(t)}">${iconTrait(t)}<b>${TNAME(t)}</b></span>`).join('')}</div></div>
      <div class="nm"><span>${A.name}</span><span class="cost">${goldSvg}${A.cost}</span></div></button>`;
  }).join('');
  if (renderDock.shop !== shopH || flipShop) { renderDock.shop = shopH; $('shop').innerHTML = shopH; } // 沒變就不重畫
  flipShop = false;
  featuresDock();
  // 隊友與準備
  if (!T) { $('mate').innerHTML = `<div class="who"><i></i>單人模式</div><button class="btn primary ${P.ready ? 'on' : ''}" id="btnReady" ${prep ? '' : 'disabled'}>${P.ready ? '取消準備' : '準備好了'}</button>`; } else
  $('mate').innerHTML = `<div class="who"><i></i>隊友 ${T.name}・Lv${T.level}・${T.gold} 金・場上 ${boardCount(G, T.id)}/${T.level}</div><button class="btn" id="btnGiftGold" ${prep && giftGoldLeft(G, P) > 0 ? '' : 'disabled'} title="這個階段還能送 ${giftGoldLeft(G, P)} 金">送 1 金<small>剩 ${giftGoldLeft(G, P)}</small></button><button class="btn primary ${P.ready ? 'on' : ''}" id="btnReady" ${prep ? '' : 'disabled'}>${P.ready ? '取消準備' : '準備好了'}</button>`;
}
// 羈絆成員頭像：場上有（亮）、只在備戰席（半亮＋「備」）、還沒買（灰）——照聯盟戰棋
function traitOwnState() {
  const vt = myTeam(), on = {}, bench = {};
  for (const k in G.board) { const u = G.board[k]; if (G.players[u.owner].team === vt) on[u.key] = Math.max(on[u.key] || 0, u.star); }
  for (const P of G.players) if (P.team === vt) for (const u of P.bench) if (u) bench[u.key] = Math.max(bench[u.key] || 0, u.star);
  return { on, bench };
}
function traitMembersHtml(t, cls, st) {
  st = st || traitOwnState();
  return Object.keys(ANIMALS).filter(k => ANIMALS[k].traits.includes(t)).sort((a, b) => ANIMALS[a].cost - ANIMALS[b].cost).map(k => {
    const s = st.on[k] ? 'on' : st.bench[k] ? 'bench' : 'off';
    return `<span class="tm ${s} ${cls || ''}" style="--cc:${COST_COL[ANIMALS[k].cost]}" title="${ANIMALS[k].name}${s === 'on' ? '（場上）' : s === 'bench' ? '（備戰席）' : '（還沒有）'}">${pimg(k)}${cls === 'big' ? `<i>${ANIMALS[k].name}</i>` : ''}${s === 'bench' ? '<em>備</em>' : ''}</span>`;
  }).join('');
}
function renderTraits() {
  const vt = myTeam();
  const src = G.phase === 'prep' || !cv ? Object.values(G.board).filter(u => G.players[u.owner].team === vt).map(u => ({ key: u.key, owner: u.owner, team: 0, summon: false, traits: unitTraits(u) })) : null;
  const tc = src ? traitCounts(src, 0) : (cv.B['traits' + cv.vt] || traitCounts([], 0));
  const order = Object.keys(TRAITS).filter(t => tc[t].count > 0).sort((a, b) => (tc[b].tier - tc[a].tier) || (tc[b].count - tc[a].count));
  let h = ''; const ost = traitOwnState();
  for (const t of order) {
    const x = tc[t], T = TRAITS[t], next = T.tiers.find(n => n > x.count);
    const tierCls = x.tier < 0 ? '' : (x.tier === T.tiers.length - 1 && (T.tiers.length >= 4 || t === 'king')) ? 't3' : 't' + Math.min(2, x.tier + (T.tiers.length === 2 && x.tier === 1 ? 1 : 0)); // t3＝彩色（生態圈／傳說）
    const flash = (prevTiers[t] === undefined ? -1 : prevTiers[t]) < x.tier && x.tier >= 0;
    h += `<button class="tr ${tierCls} ${flash ? 'flash' : ''}" data-trait="${t}"><span class="hex">${iconTrait(t)}</span><span><span class="nm">${T.name}${x.duo ? '<span class="duo">默契</span>' : ''}</span><span class="ct"><em>${x.count}</em><span class="full"> / ${T.tiers.map(n => n <= x.count ? `<em>${n}</em>` : n).join(' › ')}</span><span class="short">/${next || T.tiers[T.tiers.length - 1]}</span></span><span class="tms">${traitMembersHtml(t, '', ost)}</span></span></button>`;
    if (flash && G.phase === 'prep' && prevTiers[t] !== undefined) sfx('trait_' + t, 300);
    prevTiers[t] = x.tier;
  }
  for (const t in prevTiers) if (!order.includes(t)) prevTiers[t] = -1;
  if (G.phase === 'prep') for (const c of prepCombos(vt)) h += `<button class="tr combo ${c.ok ? '' : 'off'}" data-combo="${c.def.id}"><span class="hex" style="background:#f2c14e;color:#7a2e1e">${iconTrait('pack')}</span><span><span class="nm">${c.def.name}</span><span class="ct">${c.ok ? '合體技就緒' : '需相鄰'}</span></span></button>`;
  if (renderTraits.last !== h) { renderTraits.last = h; $('traits').innerHTML = h; } // 內容沒變就不重畫（頭像圖很大，重畫很耗時）
}
function prepCombos(team) {
  const res = [];
  const units = Object.keys(G.board).map(k => ({ k: +k, u: G.board[k] })).filter(x => G.players[x.u.owner].team === team);
  for (const def of COMBOS) {
    let hit = null, near = false;
    for (const a of units) if (a.u.key === def.a) for (const b of units) if (b.u.key === def.b && a.u.owner !== b.u.owner) {
      near = true;
      const [ac, ar] = cellRC(a.k), [bc, br] = cellRC(b.k), d = hexD(ac, ar, bc, br);
      if (d <= 1 && !hit) hit = { def, ok: true, ua: a.u.uid, ub: b.u.uid };
    }
    if (hit) res.push(hit); else if (near) res.push({ def, ok: false });
  }
  return res;
}
// 回合收入：放在畫面下方中間（跟「統計」同一高度），連勝／連敗分開顯示
function showIncome(inc) {
  let el = document.getElementById('incomePill');
  if (!el) { el = document.createElement('div'); el.id = 'incomePill'; $('stage').appendChild(el); }
  const T = G.teams[myTeam()], s = T.streak || 0;
  const st = inc.streak ? `<span class="${s > 0 ? 'win' : 'lose'}">${s > 0 ? '連勝' : '連敗'} ${Math.abs(s)}　+${inc.streak}</span>` : '';
  el.innerHTML = `<b>+${inc.base + inc.interest + inc.streak} 金</b><span>基本 ${inc.base}</span><span>利息 ${inc.interest}</span>${st}`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3600);
}
function hud() {
  const t = myTeam();
  // 隊伍血量：圓形頭像＋外圈血量環（像幻想三國志），數字在頭像下方；只更新數值，環會平滑減少
  const team = (ti, el) => {
    const T = G.teams[ti], tdm = G.td && ti === myTeam(), hp = tdm ? Math.max(0, G.td.front) : Math.max(0, T.hp);
    const ps = G.players.filter(p => p.team === ti).map(p => `<span style="--c:${ownerColor(p.id)}">${esc(p.name)} Lv${p.level}</span>`).join('');
    if (el._ti !== ti || !el.querySelector('.tav')) { el._ti = ti; el.classList.add('av');
      el.innerHTML = `<span class="tav"><img alt=""><b class="tn"></b></span><span class="tinfo"><span class="tl"></span><span class="who"></span></span>`; }
    const av = el.querySelector('.tav'); av.style.setProperty('--p', Math.round(hp / (tdm ? TD_CFG.MAX_FRONT : CFG.TEAM_HP) * 100) + '%'); av.style.setProperty('--tc', teamColor(ti));
    const im = av.querySelector('img'), src = avSrc(teamAvatar(ti)); if (im.getAttribute('src') !== src) im.src = src;
    av.querySelector('.tn').textContent = tdm ? hp + ' 排' : hp; el.querySelector('.tl').textContent = tdm ? '前線' : teamLabel(ti); el.querySelector('.who').innerHTML = ps;
    const sk = T.streak || 0; el.classList.toggle('onfire', sk >= 2); el.classList.toggle('cold', sk <= -2); el.dataset.streak = sk >= 2 ? sk + ' 連勝' : sk <= -2 ? (-sk) + ' 連敗' : '';
  };
  // 多隊模式：右上角排名表（單行、名字太長用…），點一列去看那隊的棋盤；戰鬥中改成「誰打誰」配對＋雙刀圖示
  const opp = hudOpp(), sc = scoutTeam() >= 0 ? scoutTeam() : (G.phase !== 'prep' ? WATCH : -1), fight = G.phase !== 'prep' && !isPve(G.round) && G.battles && G.battles.length;
  const nm = i => `<span class="nm">${esc(teamLabel(i))}</span>`;
  const flameSvg = '<svg viewBox="0 0 12 14" width="8" height="10"><path d="M6 0C6.6 2.6 10 4.2 10 8.2A4 4 0 0 1 2 8.2C2 6.4 3 5.4 3.6 4.6 3.8 6 4.6 6.8 5.4 7 5 4.6 5.4 2.2 6 0Z" fill="#ffd34d"/></svg>';
  // 右上角排名（照聯盟戰棋右側玩家列）：依血量排序，每列有血條、連勝／連敗、這回合的對手（雙刀）；點一列去看那隊（準備＝棋盤、戰鬥＝戰場）
  const standings = el => {
    const rows = G.teams.map((T, i) => ({ T, i })).sort((a, b) => (a.T.out - b.T.out) || (b.T.hp - a.T.hp) || ((a.T.place || 0) - (b.T.place || 0))), alive = rows.filter(r => !r.T.out).length;
    const maxHp = CFG.TEAM_HP, fighting = i => fight && G.battles.some(b => b.teams.includes(t) && b.teams.includes(i) && i !== t);
    const cand = G.phase === 'prep' && G.nextCand ? (G.nextCand[t] || []) : [];
    const wide = el.classList.contains('wide');
    const head = wide ? `<div class="sthead"><span>排名</span><small>剩 ${alive}/${G.teams.length}</small>${cand.length ? '<button class="stx" data-nopp="1">可能對手</button>' : ''}<button class="stx" aria-label="縮小排名">縮小</button></div>` : `<div class="sthead"><small>${alive}/${G.teams.length}</small>${cand.length ? '<button class="stx" data-nopp="1">對手</button>' : ''}</div>`; // 右邊一列不放「放大」
    if (!el.classList.contains('wide')) { // 精簡：每隊一顆圓形頭像，外圈是血量，下方數字；角標＝連勝／連敗、對手、可能對手
      el.innerHTML = head + '<div class="scells col">' + rows.map(({ T, i }) => { const sk = T.streak || 0, hp = Math.max(0, T.hp), isOpp = fighting(i) || (!fight && i === opp && !cand.length);
        const bd = T.out ? '' : isOpp ? `<i class="sbd vs">${clashSvg('sm')}</i>` : cand.includes(i) ? '<i class="sbd q">?</i>' : sk >= 2 ? `<i class="sbd win">${flameSvg}${sk}</i>` : sk <= -2 ? `<i class="sbd lose">${-sk}</i>` : '';
        return `<button class="scell ${cand.includes(i) ? 'cand' : ''} ${i === t ? 'me' : ''} ${isOpp ? 'opp' : ''} ${i === sc ? 'look' : ''} ${T.out ? 'out' : ''}" data-st="${i}" title="${esc(teamLabel(i))}"><span class="tav sm" style="--p:${Math.round(hp / maxHp * 100)}%;--tc:${teamColor(i)}"><img src="${avSrc(teamAvatar(i))}" alt="">${bd}</span><b>${T.out ? '#' + T.place : hp}</b></button>`; }).join('') + '</div>';
      return;
    }
    el.innerHTML = head + rows.map(({ T, i }, n) => { const sk = T.streak || 0, hp = Math.max(0, T.hp);
      const stk = T.out ? '' : sk >= 2 ? `<span class="sstk win">${flameSvg}${sk}</span>` : sk <= -2 ? `<span class="sstk lose">${-sk}</span>` : '';
      return `<button class="srow ${cand.includes(i) ? 'cand' : ''} ${i === t ? 'me' : ''} ${fighting(i) || (!fight && i === opp) ? 'opp' : ''} ${i === sc ? 'look' : ''} ${T.out ? 'out' : ''}" data-st="${i}" title="${esc(teamLabel(i))}${i === t ? '' : (G.phase === 'prep' ? '（點一下看他們的棋盤）' : '（點一下看他們的戰場）')}">
        <em>${T.out ? '#' + T.place : n + 1}</em><i class="dot" style="--c:${teamColor(i)}"></i><span class="sm">${nm(i)}<span class="shp"><i style="width:${Math.round(hp / maxHp * 100)}%"></i></span></span>${stk}${fighting(i) || (!fight && i === opp && !cand.length) ? `<span class="svs">${clashSvg('sm')}</span>` : cand.includes(i) ? '<span class="scand" title="下一場可能的對手">?</span>' : ''}<b>${hp}</b></button>`; }).join('');
  };
  const hk = JSON.stringify(G.phase === 'prep' && G.nextCand ? G.nextCand[t] : 0) + G.teams.map(T => T.hp + (T.out ? 'x' : '') + 's' + (T.streak || 0)).join('|') + '|' + opp + '|' + G.players.map(p => p.level).join() + '|' + (fight ? 'f' + G.round : 'p') + '|' + sc + (PORT.chick ? 'a' : '') + myAvatar() + (G.td ? 'td' + G.td.front : '');
  $('stage').classList.toggle('multi', G.teams.length > 2);
  if (hud.k !== hk) { hud.k = hk; team(t, $('teamA')); if (G.teams.length === 2) { $('teamB').classList.remove('stand'); team(1 - t, $('teamB')); } else { $('teamB').classList.add('stand'); $('teamB').classList.remove('av'); $('teamB')._ti = -1; standings($('teamB')); } }
  $('clock').classList.toggle('fight', G.phase === 'combat');
  if (!$('clashBox').firstChild) $('clashBox').innerHTML = clashSvg();
  if (G.teams.length > 2) { const h = $('teamB').offsetHeight + 8; if (hud.sth !== h) { hud.sth = h; $('stage').style.setProperty('--sth', h + 'px'); } }
  // 階段點
  const R = G.round, st = stageOf(R), first = st === 1 ? 1 : 4 + (st - 2) * 5, n = st === 1 ? 3 : 5;
  let dots = `<span>${st}-${R - first + 1}</span>`;
  for (let i = 0; i < n; i++) { const r = first + i; dots += `<i class="${isPve(r) ? 'pve' : ''} ${r < R ? 'done' : r === R ? 'now' : ''}"></i>`; }
  if ($('stg').innerHTML !== dots) $('stg').innerHTML = dots;
  let sec = 0, ph = '';
  if (G.phase === 'prep') { sec = Math.ceil(Math.max(0, G.timer) / 1000); ph = (isPve(R) ? '野生回合' : '準備') + '・' + ARENAS[G.arena].name; }
  else if (G.phase === 'combat' && cv) { sec = Math.ceil((CFG.COMBAT_MAX_TICK - cv.B.t) / 20); ph = cv.B.t > CFG.OVERTIME_TICK ? '加時！' : '戰鬥'; }
  else if (G.phase === 'result') { sec = Math.ceil(Math.max(0, G.timer) / 1000); ph = '結算'; }
  if (G.tutorial && G.phase === 'prep') { sec = '教學'; ph = '慢慢來，不倒數'; }
  if (G.td) { if (G.phase === 'prep') ph = '退潮・準備'; else if (cv) { sec = Math.max(0, Math.ceil(TD_CFG.WAVE_MAX_SEC - cv.B.t * CFG.TICK_MS / 1000)); ph = G.td.tide ? '大潮來襲' : '漲潮'; } }
  $('timer').textContent = sec; $('phaseTxt').textContent = ph;
  if (G.phase === 'prep') { const v = Math.ceil(Math.max(0, G.timer) / 1000); document.querySelectorAll('.cdT').forEach(x => { if (x.textContent != v) x.textContent = v; }); } // 選擇視窗裡的倒數
  $('clock').classList.toggle('hurry', G.phase === 'prep' && sec <= 5);
  if (G.phase === 'prep' && sec <= 5 && sec >= 1 && hud.tick !== G.round * 100 + sec) { hud.tick = G.round * 100 + sec; sfx(sec === 1 ? 'tickLast' : 'tick', 200); } // 最後 5 秒滴答
  const tm = G.teams[myTeam()], mood = tm.hp <= 25 ? 'tense' : (tm.streak || 0) >= 3 ? 'hype' : 'calm'; if (hud.mood !== mood) { hud.mood = mood; musicMood(mood); }
  $('stage').classList.toggle('ot', G.phase === 'combat' && cv && cv.B.t > CFG.OVERTIME_TICK);
}

// ---- 資訊卡 ----
function renderSheet() {
  const sh = $('sheet'), inn = $('sheetIn');
  S3.selK = sel && sel.type === 'unit' ? 'u' + sel.uid : null;
  if (!sel || drag) { sh.hidden = true; return; }
  let h = '';
  if (sel.type === 'unit') {
    const f = findUnit(sel.uid); if (!f) { sel = null; sh.hidden = true; return; }
    const u = f.u, A = ANIMALS[u.key], s = unitStats(u), mine = u.owner === ME, P = G.players[u.owner], prep = G.phase === 'prep';
    const combos = COMBOS.filter(c => c.a === u.key || c.b === u.key);
    h = `${pimg(u.key)}<div><h3>${A.name} <span style="color:var(--gold)">${'★'.repeat(u.star)}</span></h3>
      <div class="meta"><span class="tg" style="color:${COST_COL[A.cost]}">${A.cost} 費</span><span class="tg">${A.role}</span>${A.traits.map(t => `<span class="tg">${iconTrait(t)}${TNAME(t)}</span>`).join('')}<span>${mine ? '你的' : P.team === myTeam() ? '隊友 ' + P.name + ' 的' : '敵方'}</span></div></div>
      ${sel.more ? `<div class="stats"><span>生命<b>${s.hp}</b></span><span>攻擊<b>${s.atk}</b></span><span>攻速<b>${s.aps}</b></span><span>射程<b>${A.rng}</b></span><span>護甲<b>${s.arm}</b></span><span>魔抗<b>${s.mr}</b></span><span>能量<b>${s.sm}/${A.mana}</b></span><span>裝備<b>${u.items.length}/3</b></span></div>` : ''}
      ${u.star >= 3 ? `<p style="color:#a86a10"><b>進化：${EVOLVE[u.key]}</b>　生命攻擊 +20%、技能傷害 +30%、相鄰友軍攻速 +10%</p>` : ''}
      <p><b>${A.skill}</b>　${skillDesc(u.key, u.star)}</p>
      ${preyLine(u.key)}
      ${recItemsLine(u.key)}
      ${u.items.length ? `<p class="its">${u.items.map(i => iconItem(i)).join('')}<span style="font-size:12px">${u.items.map(i => itemDef(i).name).join('、')}</span></p>` : ''}
      ${sel.more && combos.length ? `<p>合體技：${combos.map(c => `${ANIMALS[c.a].name}＋${ANIMALS[c.b].name}「${c.name}」${c.desc}`).join('；')}</p>` : ''}
      <div class="acts">${mine && (prep || f.zone === 'bench') ? `<button class="btn" data-a="sell">出售 +${sellValue(u)}</button>${G.solo ? '' : `<button class="btn" data-a="giftu" ${giftUnitLeft(G, G.players[ME]) > 0 && u.star <= giftMaxStar(G) ? '' : 'disabled'} title="每個階段可送 ${CFG.GIFT_UNIT_STAGE} 隻、最高 ${giftMaxStar(G)} 星">送隊友${giftUnitLeft(G, G.players[ME]) > 0 ? '' : '（本階段已送）'}</button>`}${f.zone === 'board' && prep ? '<button class="btn" data-a="tobench">收回</button>' : ''}` : ''}<button class="btn" data-a="preview">技能預覽</button><button class="btn" data-a="more">${sel.more ? '收起' : '詳情'}</button><button class="btn" data-a="close" aria-label="關閉">✕</button></div>`;
  } else if (sel.type === 'item') {
    const it = G.players[ME].items[sel.idx]; if (!it) { sel = null; sh.hidden = true; return; }
    const d = itemDef(it);
    const st = Object.entries(d.stat || {}).map(([k, v]) => ({ atk: '攻擊', hp: '生命', as: '攻速%', arm: '護甲', mr: '魔抗', sm: '起始能量' }[k] + ' +' + v)).join('、');
    const recipes = MATS[it] ? Object.values(ITEMS).filter(x => x.from.includes(it)).map(x => `${x.from.map(m => MATS[m].name).join('＋')} → ${x.name}`).join('　') : '';
    h = `<div style="display:grid;place-items:center">${iconItem(it).replace('<svg', '<svg width="48" height="48"')}</div><div><h3>${d.name}</h3><div class="meta">${st}</div></div>
      <p>${MATS[it] ? '拖到棋子身上就能裝上，兩個材料會自動合成。<br>' + recipes : d.desc}</p>
      <div class="acts">${G.solo ? '' : '<button class="btn" data-a="gifti">送給隊友</button>'}<button class="btn" data-a="close">✕</button></div>`;
  } else if (sel.type === 'trait') {
    const T = TRAITS[sel.k];
    const members = traitMembersHtml(sel.k, 'big');
    h = `<div style="display:grid;place-items:center;color:var(--ink);--ib:var(--paper)">${iconTrait(sel.k).replace('<svg', '<svg width="44" height="44"')}</div><div><h3>${T.name}</h3><div class="tmem">${members}</div></div>
      <p>${T.tiers.map((n, i) => `(${n}) ${T.desc[i]}`).join('<br>')}${G && G.rules && G.rules.solo ? '' : `<br>兩位隊友都有出這個羈絆時，效果 +${SYNERGY_BONUS}%（默契）。`}</p><div class="acts"><button class="btn" data-a="close">✕</button></div>`;
  } else if (sel.type === 'aug') {
    const A = AUG[sel.id];
    h = `<div style="display:grid;place-items:center">${augIcon(sel.id, 'big')}</div><div><h3>${A.name}</h3><div class="meta">${AUG_TIER_NAME[A.tier]}海克斯</div></div><p>${A.desc}</p><div class="acts"><button class="btn" data-a="close">✕</button></div>`;
  } else if (sel.type === 'combo') {
    const c = COMBOS.find(c => c.id === sel.id);
    h = `${pimg(c.a)}<div><h3>${c.name}</h3><div class="meta">${ANIMALS[c.a].name}＋${ANIMALS[c.b].name}，需分屬兩位隊友且開場相鄰</div></div><p>${c.desc}<br>兩隻都放過一次技能後自動發動。</p><div class="acts"><button class="btn" data-a="close">✕</button></div>`;
  }
  inn.innerHTML = h; sh.hidden = false;
}
function onSheet(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a;
  if (a === 'close') sel = null;
  else if (a === 'more') { sel.more = !sel.more; renderSheet(); return; }
  else if (a === 'preview') { previewSkill(sel.uid); return; }
  else if (a === 'sell') { doAct({ t: 'sell', uid: sel.uid }); sel = null; }
  else if (a === 'giftu') { if (doAct({ t: 'gift', uid: sel.uid }) === 'ok') { toast('已送給隊友'); sel = null; } }
  else if (a === 'gifti') { if (doAct({ t: 'gift', item: sel.idx }) === 'ok') { toast('已送給隊友'); sel = null; } }
  else if (a === 'tobench') { const i = G.players[ME].bench.indexOf(null); if (i < 0) toast('備戰席滿了'); else { doAct({ t: 'move', uid: sel.uid, to: { zone: 'bench', i } }); sel = null; } }
  refresh();
}
const refresh = () => G.phase === 'prep' ? renderPrep() : (renderDock(), renderTraits(), renderSheet());

// ---- 棋盤點選與拖放 ----
function pickToTarget(p) { if (!p) return null; if (p.type === 'tile') return { zone: 'board', cell: cellOf(p.vc, p.vr), p }; if (p.type === 'bench') return { zone: 'bench', i: p.i, p }; return null; }
// 真人可以搬動電腦隊友場上的棋子（準備階段、我方半場）；真人隊友的棋子不能動
function mateAiUnit(f) { if (!f || f.zone !== 'board' || G.phase !== 'prep' || G.players[ME].ai) return false; const M = teammate(G, ME); return !!(M && M.ai && f.u.owner === M.id); }
function onDown(e) {
  if (!G || itemDrag) return;
  const p = s3PickAt(e.clientX, e.clientY);
  drag = null;
  if (p && p.type === 'unit' && p.k[0] === 'u' && G.phase !== 'over' && scoutTeam() < 0) {
    const uid = +p.k.slice(1), f = findUnit(uid);
    if (f && ((f.u.owner === ME && (G.phase === 'prep' || f.zone === 'bench')) || mateAiUnit(f))) { drag = { uid, k: p.k, f, x: e.clientX, y: e.clientY, on: false, mate: f.u.owner !== ME }; e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); return; }
  }
  drag = { tap: p, x: e.clientX, y: e.clientY, on: false, none: true };
}
function onMove(e) {
  if (!drag && G && !$('game').hidden && e.target && e.target.id === 'cv') { const p = s3PickAt(e.clientX, e.clientY); S3.hoverK = p && p.type === 'unit' ? p.k : null; }
  if (!drag || drag.none) return;
  if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 7) {
    drag.on = true; sel = null; renderSheet(); sfx('pick');
    const v = S3.V[drag.k]; if (v) { v.dragging = true; v.lift = 0.45; }
    const sz = $('sellzone'); sz.hidden = !!drag.mate; sz.innerHTML = `出售 <b>+${sellValue(drag.f.u)} 金</b>${drag.f.u.items && drag.f.u.items.length ? `<span class="szit">退回 ${drag.f.u.items.map(x => iconItem(x)).join('')}</span>` : ''}`;
  }
  if (!drag.on) return;
  const v = S3.V[drag.k]; if (!v) return;
  const g = s3GroundAt(e.clientX, e.clientY);
  v.pos.set(g.x, 0, g.z);
  const slot = s3NearestSlot(g), hl = [];
  const overShop = isOverShop(e.clientX, e.clientY);
  $('sellzone').classList.toggle('hot', overShop);
  if (slot && !overShop) {
    const t = pickToTarget(slot);
    const ok = t.zone === 'bench' ? !drag.mate : drag.mate ? (inHalf(myTeam(), t.cell) && G.terrain[cellBase(t.cell)] !== 'rock' && !(G.board[t.cell] && G.players[G.board[t.cell].owner].team !== myTeam())) : cellValid(drag.f, t.cell) === true || (G.board[t.cell] && G.board[t.cell].owner === ME);
    hl.push(Object.assign({}, slot, { col: ok ? 0x4a9a2a : 0xb02a18 }));
  }
  s3Highlight(hl);
}
function isOverShop(x, y) { const r = document.querySelector('.shopwrap').getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top - 10 && y <= r.bottom; }
function onUp(e) {
  if (!drag) return;
  const d = drag; drag = null;
  $('sellzone').hidden = true;
  if (d.on) {
    const v = S3.V[d.k]; if (v) { v.dragging = false; v.lift = 0; }
    if (isOverShop(e.clientX, e.clientY)) { if (!d.mate) doAct({ t: 'sell', uid: d.uid }); else renderPrep(); return; }
    const slot = s3NearestSlot(s3GroundAt(e.clientX, e.clientY)), t = pickToTarget(slot);
    if (t) {
      const r = doAct({ t: 'move', uid: d.uid, to: t.zone === 'bench' ? { zone: 'bench', i: t.i } : { zone: 'board', cell: t.cell } });
      if (r === 'ok') { const vv = S3.V[d.k]; if (vv) { vv.tween = null; vv.pos.copy(vv.tgt); vv.land = nowS(); groundRing(vv.tgt, 0xf2e6cf, 0.8, 0.35); burst(vv.tgt.clone().add(V3(0, 0.05, 0)), 6, { color: 0xf2e6cf, scale: 0.15, speed: 1.2, up: 0.4, g: 0 }); if (t.zone === 'board' && G.terrain[cellBase(t.cell)] === 'water') ripple(vv.tgt.clone()); } }
      else if (v) { v.pos.copy(v.tgt); }
    } else { renderPrep(); }
    return;
  }
  // 點一下
  const p = d.tap || s3PickAt(e.clientX, e.clientY);
  if (!p && eggTapChick(e.clientX, e.clientY)) return;
  onTap(p);
}
function onTap(p) {
  if (scoutTeam() >= 0) { sel = p && p.type === 'unit' && p.k[0] === 'u' ? { type: 'unit', uid: +p.k.slice(1) } : null; renderSheet(); return; } // 看別人棋盤時只能點來看資料
  if (!p) { sel = null; refresh(); return; }
  if (p.type === 'unit') {
    eggTapUnit(p.k);
    const uid = p.k[0] === 'u' ? +p.k.slice(1) : null; if (!uid) return;
    const f = findUnit(uid);
    if (sel && sel.type === 'item' && f && f.u.owner === ME) { equipTo(sel.idx, uid, f); sel = null; refresh(); return; }
    sel = { type: 'unit', uid }; refresh(); return;
  }
  if (sel && sel.type === 'unit' && G.phase === 'prep') {
    const f = findUnit(sel.uid), t = pickToTarget(p);
    if (f && f.u.owner === ME && t) { const r = doAct({ t: 'move', uid: sel.uid, to: t.zone === 'bench' ? { zone: 'bench', i: t.i } : { zone: 'board', cell: t.cell } }); if (r === 'ok') sel = null; refresh(); return; }
  }
  sel = null; refresh();
}
// 裝備拖曳
function onItemDown(e) {
  const b = e.target.closest('[data-item]'); if (!b) return;
  itemDrag = { idx: +b.dataset.item, x: e.clientX, y: e.clientY, on: false, el: null };
  b.setPointerCapture && b.setPointerCapture(e.pointerId);
}
function onItemMove(e) {
  if (!itemDrag) return;
  if (!itemDrag.on && Math.hypot(e.clientX - itemDrag.x, e.clientY - itemDrag.y) > 7) {
    itemDrag.on = true; const k = G.players[ME].items[itemDrag.idx];
    const el = document.createElement('div'); el.className = 'fly'; el.innerHTML = iconItem(k); el.style.transition = 'none'; document.body.appendChild(el); itemDrag.el = el;
  }
  if (itemDrag.on) {
    itemDrag.el.style.transform = `translate(${e.clientX}px,${e.clientY - 30}px)`;
    const p = s3PickAt(e.clientX, e.clientY - 30); const hl = [];
    if (p && p.type === 'unit' && p.k[0] === 'u') { const v = S3.V[p.k]; if (v) { const s = s3NearestSlot(v.pos); if (s) hl.push(Object.assign({}, s, { col: 0x5a4a10 })); } }
    s3Highlight(hl);
    // 合成提示：拖到棋子上先顯示會變成什麼
    const f = p && p.type === 'unit' && p.k[0] === 'u' ? findUnit(+p.k.slice(1)) : null, k = G.players[ME].items[itemDrag.idx];
    let tip = '';
    if (f && f.u.owner === ME) {
      const u = f.u, mi = MATS[k] ? u.items.findIndex(x => MATS[x] && RECIPE[[x, k].sort().join('+')]) : -1;
      if (CONSUMABLES[k]) tip = `使用：${CONSUMABLES[k].name}`;
      else if (mi >= 0) { const r = RECIPE[[u.items[mi], k].sort().join('+')]; tip = `合成 → <b>${ITEMS[r].name}</b><small>${ITEMS[r].desc}</small>`; }
      else if (u.items.length >= CFG.MAX_ITEMS) tip = '裝備已滿';
      else tip = `裝上 <b>${(MATS[k] || ITEMS[k] || EMBLEMS[k] || {}).name || ''}</b>${G.phase !== 'prep' && f.zone === 'board' ? '<small>下一場戰鬥生效</small>' : ''}`;
    }
    let te = $('itemTip'); if (!te) { te = document.createElement('div'); te.id = 'itemTip'; document.body.appendChild(te); }
    te.hidden = !tip; if (tip) { if (te.dataset.t !== tip) { te.dataset.t = tip; te.innerHTML = tip; } te.style.transform = `translate(${e.clientX}px,${e.clientY - 78}px) translate(-50%,-100%)`; }
  }
}
function onItemUp(e) {
  if (!itemDrag) return;
  const d = itemDrag; itemDrag = null;
  if (d.el) d.el.remove();
  s3Highlight([]); const te = $('itemTip'); if (te) te.hidden = true;
  if (!d.on) { sel = sel && sel.type === 'item' && sel.idx === d.idx ? null : { type: 'item', idx: d.idx }; refresh(); return; }
  const p = s3PickAt(e.clientX, e.clientY - 30);
  if (p && p.type === 'unit' && p.k[0] === 'u') { const uid = +p.k.slice(1), f = findUnit(uid); if (f && f.u.owner === ME) equipTo(d.idx, uid, f); else toast('只能裝在自己的棋子上'); }
}
function buyFx(rect, src) {
  if (!buyFly) return;
  const L = buyFly; buyFly = null;
  const v = S3.V['u' + L.uid];
  const fly = document.createElement('div'); fly.className = 'fly'; fly.innerHTML = `<img src="${src}" alt="">`;
  fly.style.transform = `translate(${rect.left + rect.width / 2}px,${rect.top + rect.height / 2}px)`; document.body.appendChild(fly);
  let tx = rect.left, ty = rect.top - 200;
  const f0 = findUnit(L.uid);
  const wp = v ? v.tgt.clone() : (f0 && f0.zone === 'bench' ? V3(benchWorld(f0.i)[0], 0, benchWorld(f0.i)[1]) : null);
  if (wp) { const sc = toScreen(wp.add(V3(0, 0.4, 0))), cr = S3.renderer.domElement.getBoundingClientRect(); tx = cr.left + sc[0]; ty = cr.top + sc[1]; }
  if (v) v.pop = nowS() + 0.45; else at(0.02, () => { const vv = S3.V['u' + L.uid]; if (vv) vv.pop = nowS() + 0.43; });
  requestAnimationFrame(() => requestAnimationFrame(() => { fly.style.transform = `translate(${tx}px,${ty}px) scale(.6)`; fly.style.opacity = '.3'; }));
  setTimeout(() => { fly.remove(); const vv = S3.V['u' + L.uid]; if (vv) { burst(vv.tgt.clone().add(V3(0, 0.3, 0)), 8, { tex: 'spark', color: 0xffe9a0, scale: 0.13, add: true, speed: 1.5, up: 1.5, g: -2 }); groundRing(vv.tgt, 0xfff3c8, 0.8, 0.4); } }, 460);
}

// ---- 戰鬥 ----
function hudOpp() { if (!G.battles || !G.battles.length || G.phase === 'prep') return G.teams.length === 2 ? 1 - myTeam() : -1; const b = myBattle(); return b ? (b.teams[0] === myTeam() ? b.teams[1] : b.teams[0]) : -1; }
function myBattle() { const t = myTeam(); return G.battles.find(b => b.teams[0] === t || b.teams[1] === t) || G.battles[0]; } // 被淘汰後觀戰第一場
let MYB = null, WATCH = -1; // MYB：自己這場的狀態；WATCH：戰鬥中正在看哪一隊的戰場（-1＝自己的）
function combatViewOf(bt, team) { const vt = bt.teams[0] === team ? 0 : bt.teams[1] === team ? 1 : 0; return { bt, B: bt.B, vt, zonePos: {}, lastCell: {} }; }
function startCombatView() {
  sel = null; renderSheet(); WATCH = -1;
  const bt = myBattle(); cv = combatViewOf(bt, myTeam());
  MYB = { bt, B: bt.B, vt: cv.vt, mine: bt.teams.includes(myTeam()) };
  if (MYB.mine) { LAST_COMP = cv.B.units.filter(u => u.owner === ME && !u.summon).map(u => ({ key: u.key, star: u.star })); REC_COMP = cv.B.units.filter(u => u.owner === ME && !u.summon).map(u => u.key); const tc = cv.B['traits' + cv.vt] || {}; questEvent('tier', { max: Math.max(-1, ...Object.values(tc).map(x => x.tier)) }); }
  s3SetTerrain(cv.B.terrain, cv.vt, cv.B.temp, cv.B.height);
  combatSync();
  unitEntrance(cv.B);
  renderDock(); renderTraits(); renderWatchBar();
}
function unitEntrance(B) {
  const now = nowS(), list = B.units.filter(u => u.alive !== false).map(u => ({ u, v: S3.V[kOf(u)] })).filter(x => x.v);
  list.sort((a, b) => (a.u.team - b.u.team) || (a.u.r - b.u.r) || (a.u.c - b.u.c)); // 先我方、再敵方，從前排到後排
  const stag = Math.min(ENTRANCE.STAGGER, ENTRANCE.SPAN / Math.max(1, list.length));
  list.forEach((x, i) => { const tr = ((ANIMALS[x.u.key] || {}).traits || [])[0]; const kind = x.u.neutral || !ENTRANCE.DUR[tr] ? 'pop' : tr; x.v.pop = 0; x.v.enter = { t0: now + i * stag, dur: ENTRANCE.DUR[kind], kind }; });
}
// 戰鬥中點右上角的隊伍：直接跳到他們的戰場觀戰（點自己的隊或「回到我的戰場」回來）
function battleOfTeam(t) { return G.battles.find(b => b.teams[0] === t) || G.battles.find(b => b.teams[1] === t && !b.ghost) || G.battles.find(b => b.teams.includes(t)); }
function watchBattle(t) {
  if (!G || (G.phase !== 'combat' && G.phase !== 'result') || !cv) return;
  const home = t < 0 || t === myTeam() || !G.teams[t];
  const bt = home ? (MYB && MYB.bt) || myBattle() : battleOfTeam(t); if (!bt || !bt.B) return;
  WATCH = home ? -1 : t;
  for (const k in S3.V) if (k[0] === 'b') s3Remove(k, true);
  cv = combatViewOf(bt, home ? myTeam() : t);
  s3SetTerrain(cv.B.terrain, cv.vt, cv.B.temp, cv.B.height);
  combatSync(); hud.k = ''; renderWatchBar();
}
function watchStep(d) {
  const ts = G.teams.map((T, i) => i).filter(i => !G.teams[i].out && battleOfTeam(i));
  let j = ts.indexOf(WATCH >= 0 ? WATCH : myTeam()); j = (j + d + ts.length) % ts.length; watchBattle(ts[j]);
}
function renderWatchBar() {
  let el = $('scoutBar');
  if (!el) { renderScoutBar(); el = $('scoutBar'); if (!el) return; }
  const on = WATCH >= 0 && G && (G.phase === 'combat' || G.phase === 'result');
  if (G && G.phase !== 'prep') el.hidden = !on;
  if (!on) return;
  const bt = cv.bt, o = bt.teams[1 - cv.vt];
  el.innerHTML = `<button class="scb" data-sc="-1" aria-label="上一個">‹</button><span><i style="--c:${teamColor(WATCH)}"></i>正在看 <b>${esc(teamLabel(WATCH))}</b>${o >= 0 ? ` 對 ${esc(teamLabel(o))}` : ' 打野怪'}</span><button class="scb" data-sc="1" aria-label="下一個">›</button><button class="btn sch" data-sc="home">回到我的戰場</button>`;
}
const kOf = u => u.uid ? 'u' + u.uid : 'b' + u.id;
function bWorld(c, r) { const [vc, vr] = vview(c, r, cv.vt); return cellWorld(vc, vr); }
function combatSync() {
  const B = cv.B, frac = REPLAY ? Math.min(1, REPLAY.acc / CFG.TICK_MS) : B.over ? 1 /* 打完就停在最後位置，避免別的戰場還在打時棋子前後抖 */ : (G.phase === 'combat' || (NET.role === 'client' && G.phase === 'result' && !B.over)) ? Math.min(1, G.acc / CFG.TICK_MS) : 1, list = [];
  for (const u of B.units) {
    let c = u.c, r = u.r, lift = 0, moving = false, moveP = null, jumpP = null, mp = null;
    // 六角格的奇數列會往右偏半格，所以移動要在「世界座標」內插，不能內插格子編號（否則跨列時會左右瞬移）
    if (u.mvFrom && (REPLAY || G.phase === 'combat')) { const m = u.mvFrom, p = Math.max(0, Math.min(1, (B.t + frac - m.t0) / (m.t1 - m.t0))); mp = { m, p }; if (m.grab) { mp = null; lift = Math.sin(Math.min(1, p * 1.6) * Math.PI / 2) * 1.9 * (p < 0.85 ? 1 : (1 - p) / 0.15); }
      else if (m.jump) { lift = Math.sin(p * Math.PI) * (m.big ? 2.4 : 0.9); if (p < 1 && !m.big) jumpP = p; } else if (p < 1 && !m.slide) moveP = p; }
    // 入水漣漪
    const ck = u.c + ',' + u.r; if (u.alive && cv.lastCell[u.id] !== undefined && cv.lastCell[u.id] !== ck && terrainAt(B, u.c, u.r) === 'water') { const [wx, wz] = bWorld(u.c, u.r); at(0.15, () => ripple(V3(wx, 0.05, wz))); } cv.lastCell[u.id] = ck;
    let [x, z] = bWorld(c, r);
    if (mp) { const [fx, fz] = bWorld(mp.m.c, mp.m.r); x = fx + (x - fx) * mp.p; z = fz + (z - fz) * mp.p; }
    const tg = u.target >= 0 ? B.units[u.target] : null;
    let face = null; if (tg && tg.alive) { const [tx, tz] = bWorld(tg.c, tg.r); face = [tx, tz]; }
    if (u.team !== cv.vt && !face) face = [x, z + 5];
    const buffs = u.buffs.filter(b => b.u > B.t);
    list.push({ k: kOf(u), key: u.key, items: u.items, star: u.star, color: u.neutral ? '#f2c14e' : ownerColor(u.owner), enemy: u.team !== cv.vt && !u.neutral, neutral: u.neutral, x, z, y: lift, face: u.neutral ? null : face, moving, moveP, jumpP, king: u.king, mirror: u.mirror, skin: u.owner === ME ? skinOf(u.key) : null, hp: u.hp, maxhp: u.maxhp, shield: u.shield, mana: u.mana, manaMax: u.manaMax, mlock: u.manaLock > B.t,
      sleep: u.asleep, stun: u.alive && u.stun > B.t, stealth: u.stealth || (u.alive && terrainAt(B, u.c, u.r) === 'shadow'), taunted: u.alive && u.tauntUntil > B.t, blind: u.alive && u.blind > B.t, buffAtk: buffs.some(b => b.s === 'atk'), buffAs: buffs.some(b => b.s === 'as'), alive: u.alive,
      victory: G.phase === 'result' && u.alive && B.winner === u.team });
  }
  G.players[ME].bench.forEach((u, i) => { if (!u) return; const [x, z] = benchWorld(i), st = unitStats(u); list.push({ k: 'u' + u.uid, key: u.key, items: u.items, star: u.star, color: ownerColor(ME), x, z, hp: st.hp, maxhp: st.hp, skin: skinOf(u.key) }); });
  oppBenchList(list);
  s3Sync(list, 'combat');
  if (B.temp.length !== cv.tempN) { cv.tempN = B.temp.length; s3SetTerrain(B.terrain, cv.vt, B.temp, B.height); }
  S3.nightTarget = B.night ? 1 : 0;
  // 站在灼燒地塊上的單位身上冒火
  if (Math.random() < 0.25) for (const u of B.units) if (u.alive && terrainAt(B, u.c, u.r) === 'burn') { const p = posOf(kOf(u), 0.2); if (p) sprite('flame', p.add(V3((Math.random() - .5) * 0.3, 0, 0.15)), { scale: 0.22, scale1: 0.05, life: 0.5, vel: V3(0, 0.9, 0), add: true }); }
  // 紅鶴的水花漩渦
  if (Math.random() < 0.4) for (const zn of B.zones) if (zn.kind === 'swirl' && zn.until > B.t) { const [x, z] = bWorld(zn.c, zn.r), a = Math.random() * 6.28; sprite('drop', V3(x + Math.cos(a) * 1.1, 0.2, z + Math.sin(a) * 1.1), { scale: 0.1, scale1: 0.04, life: 0.6, vel: V3(-Math.sin(a) * 2, 1.2, Math.cos(a) * 2), g: -4 }); }
  // 生態圈：整個戰場換裝（環境粒子）＋該羈絆的角色身上發光
  if (B.eco) ecoAmbient(B);
  // 臭氣持續冒煙
  if (Math.random() < 0.35) for (const zn of B.zones) if (zn.kind === 'gas' && zn.until > B.t) { const [x, z] = bWorld(zn.c, zn.r); sprite('cloud', V3(x + (Math.random() - .5) * 2.4, 0.15, z + (Math.random() - .5) * 2.4), { color: 0x9bc24a, scale: 0.4, scale1: 0.9, life: 1.1, opacity: 0.6, vel: V3(0, 0.25, 0) }); }
}
// 生態圈畫面（可調：ECO_LOOK 每種的顏色、粒子、出現頻率）
const ECO_LOOK = {
  forest: { name: '萬木回春', col: 0x8fd35a, css: 'rgba(143,211,90,.35)', tex: 'leaf', rate: 0.6, fall: true },
  savanna: { name: '獸群狂奔', col: 0xffc15a, css: 'rgba(255,193,90,.35)', tex: 'puff', rate: 0.5, dust: true },
  water: { name: '深海巨浪', col: 0x7fc8ff, css: 'rgba(127,200,255,.35)', tex: 'drop', rate: 0.6, rise: true },
  sky: { name: '萬里晴空', col: 0xf2f6ff, css: 'rgba(242,246,255,.45)', tex: 'feather', rate: 0.45, fall: true },
};
function ecoAmbient(B) {
  for (const team of [0, 1]) for (const t in (B.eco[team] || {})) {
    const L = ECO_LOOK[t]; if (!L || Math.random() > L.rate) continue;
    const x = (Math.random() - 0.5) * 9, z = (Math.random() - 0.5) * 9;
    if (L.fall) sprite(L.tex, V3(x, 3.2, z), { color: L.col, scale: 0.16, scale1: 0.12, life: 2.2, vel: V3(0.3, -1.3, 0), g: 0, spin: 3, opacity: 0.9 });
    else if (L.rise) sprite('drop', V3(x, 0.1, z), { scale: 0.08, scale1: 0.14, life: 1.6, vel: V3(0, 1.1, 0), g: 0, opacity: 0.7 });
    else if (L.dust) sprite('puff', V3(x, 0.15, z), { color: L.col, scale: 0.4, scale1: 0.9, life: 1.2, vel: V3(1.4, 0.2, 0), g: 0, opacity: 0.35 });
    // 角色光環
    const us = B.units.filter(u => u.alive && u.team === team && hasTrait(u, t)); const u = us[Math.floor(Math.random() * us.length)];
    if (u) { const p = posOf(kOf(u), 0.1); if (p) sprite('ring', p, { color: L.col, scale: 0.3, scale1: 0.9, life: 0.6, add: true, opacity: 0.8 }); }
  }
}
function actDur(B, u, kind) { const A = (ACT[u.key] || {})[kind]; if (!A) return 0.4; if (kind !== 'atk') return A.dur; return Math.min(A.dur, effInterval(B, u) * 0.05 * 0.95); }
function hitDelay(k, kind) { const v = S3.V[k]; if (!v || !v.act || v.act.kind !== kind) return 0; const A = (ACT[v.unitKey] || {})[kind]; return Math.max(0, v.act.t0 + v.act.dur * (A ? A.hit : 0.5) - nowS()); }
const RANGED_PROJ = { squirrel: 'acorn', skunk: 'stink', octopus: 'ink' };
function handleEvents() {
  for (const bt of G.battles) {
    if (!cv || bt !== cv.bt) { bt.B.ev.length = 0; continue; }
    handleBattleEvents(bt);
  }
}
function handleBattleEvents(bt) {
  {
    const B = bt.B;
    for (const ev of B.ev) {
      if (ev.k.startsWith('td')) { tdEvent(B, ev); continue; }
      featuresEvent(B, ev);
      const u = ev.id !== undefined && ev.id >= 0 ? B.units[ev.id] : null, k = u ? kOf(u) : null, v = k ? S3.V[k] : null;
      switch (ev.k) {
        case 'atk': {
          if (!v) break; const tu = B.units[ev.tg], tk = kOf(tu);
          const dur = actDur(B, u, 'atk'); v.act = { kind: 'atk', t0: nowS(), dur }; v.faceK = tk; v.faceUntil = nowS() + dur + 0.15;
          const A = (ACT[u.key] || {}).atk || { hit: 0.5, fx: 'bump' }, hd = dur * A.hit;
          if (RANGED_PROJ[u.key]) at(hd, () => { const a = posOf(k, 0.7), b = posOf(tk); if (a && b) projectile(a, b, RANGED_PROJ[u.key], 0.22, { toV: tk, arc: 0.4, spin: 14, scale: 0.35, onEnd: () => { const bb = posOf(tk); if (bb) { if (u.key === 'octopus') slash('splat', bb, { scale: 0.4, color: 0x2d2438 }); else if (u.key === 'skunk') burst(bb, 5, { tex: 'cloud', color: 0x9bc24a, scale: 0.25, speed: 0.6, up: 0.4, g: 0 }); else slash('burst', bb, { scale: 0.3 }); } } }); });
          else at(hd, () => { playFx(A.fx, k, tk); atkNudge(S3.V[k], S3.V[tk], (ANIMALS[u.key] || {}).cost >= 4 || ['rhino', 'gorilla', 'elephant', 'kingboar', 'boar'].includes(u.key)); });
          break; }
        case 'skill': {
          if (!v) break;
          const kind = u.key === 'koala' && ev.s === '起床氣！' ? 'wake' : 'skill';
          const A = (ACT[u.key] || {})[kind]; if (!A) break;
          v.act = { kind, t0: nowS(), dur: A.dur };
          const tu = ev.tg >= 0 ? B.units[ev.tg] : null; let tk = tu ? kOf(tu) : undefined;
          if (u.target >= 0 && B.units[u.target] && B.units[u.target].alive) tk = kOf(B.units[u.target]); // 技能實際打的對象（獵豹、老鷹等會換目標）
          if (tk) { v.faceK = tk; v.faceUntil = nowS() + A.dur; }
          if (kind === 'skill') airStart(v, u.key, tk, A.dur, A.hit);
          s3Num(k, ev.s, 'skill', 0, 15);
          sprite('ring', posOf(k, 0.5), { scale: 0.2, scale1: 1.2, life: 0.4, color: 0xfff3c8, add: true });
          { const zp = cv.zonePos; at(A.dur * A.hit, () => playFx(A.fx, k, tk, { zone: zp[ev.id] })); }
          if (A.beats) for (const b of A.beats) at(A.dur * b, () => playFx(A.beatFx, k, tk)); // 多段動作的每一下
          break; }
        case 'zone': { const [x, z] = bWorld(ev.c, ev.r); cv.zonePos[ev.id] = V3(x, 0.2, z);
          if (ev.kind === 'meteor') { meteorFx(V3(x, 0, z)); break; } if (ev.kind === 'water') { burst(V3(x, 0.2, z), 14, { tex: 'drop', scale: 0.14, speed: 2.4, up: 3, g: -7, life: 0.8 }); groundRing(V3(x, 0, z), 0x6fa3c8, 1.8, 0.7); } break; }
        case 'proj': {
          const tu = B.units[ev.tg], tk = kOf(tu), fromK = k;
          if (ev.s === 'acorn') { const i = cv.projN = (cv.projN || 0) + 1; at(hitDelay(fromK, 'skill') + (i % 3) * 0.12, () => { const a = posOf(fromK, 0.7), b = posOf(tk); if (a && b) projectile(a, b, 'acorn', 0.25, { toV: tk, arc: 0.6, spin: 14, onEnd: () => { const bb = posOf(tk); if (bb) { slash('burst', bb, { scale: 0.3 }); burst(bb, 4, { tex: 'shard', color: 0x8a5a2b, scale: 0.08, speed: 1.6 }); } } }); }); }
          else if (ev.s === 'owl') { /* 撲擊由動作處理 */ }
          break; }
        case 'dmg': {
          const su = B.units[ev.src], sk = su ? kOf(su) : null;
          let d = 0;
          if (sk && ev.at) d = hitDelay(sk, 'atk') + (RANGED_PROJ[su.key] ? 0.22 : 0);
          else if (sk && ev.sk) d = hitDelay(sk, 'skill');
          const cls = ev.c ? 'crit' : ev.ty === 'magic' ? 'magic' : ev.ty === 'true' ? 'true' : '';
          s3Num(k, ev.a + (ev.c ? '!' : ''), cls, d, ev.a >= 200 && !ev.c ? 19 : 0);
          if (!ev.env) at(d, () => { const vv = S3.V[k]; if (vv) vv.hitT = nowS(); if (ev.c) hitstop(45); else if (ev.sk && ev.a >= 200) hitstop(55); });
          break; }
        case 'heal': s3Num(k, '+' + ev.a, 'heal', 0); break;
        case 'miss': s3Num(k, ev.s, 'miss', hitDelay(k, 'atk')); break;
        case 'cc': s3Num(k, ev.s, 'cc', 0.15); break;
        case 'txt': s3Num(k, ev.s, 'cc', 0); break;
        case 'taunt': for (const id of ev.ids) { const tk = kOf(B.units[id]); at(0.4, () => { const p = posOf(tk, 1.2); if (p) sprite('exclaim', p, { scale: 0.15, scale1: 0.45, life: 0.6 }); }); } break;
        case 'buff': for (const id of ev.ids) { const tk = kOf(B.units[id]); at(0.5, () => { const p = posOf(tk, 0.3); if (p) burst(p, 6, { tex: 'spark', color: ev.s === 'atk' ? 0xffc94a : 0x7cc8ff, scale: 0.12, speed: 0.6, up: 2.2, g: 0, add: true, life: 0.8 }); }); } break;
        case 'die': {
          const p = v ? v.pos.clone().add(V3(0, 0.4, 0)) : null;
          at(0.05, () => { hitstop(60); if ((ANIMALS[ev.key] || {}).cost >= 4) { stageShake(6); S3.shake = Math.max(S3.shake, 0.12); } else stageShake(3); });
          at(hitDelay(k, 'x') + 0.2, () => { if (p) burst(p, 8, { color: 0xffffff, scale: 0.35, speed: 1.2, up: 0.6, g: 0, life: 0.6 }); });
          if (p && (ev.key === 'hare' || ev.key === 'boar')) at(0.5, () => lootOrb(p));
          break; }
        case 'spawn': if (v) { v.pop = nowS(); burst(v.pos.clone().add(V3(0, 0.4, 0)), 6, { tex: 'spark', color: 0xffd34d, scale: 0.1, add: true }); } break;
        case 'combo': comboFx(B, ev); break;
        case 'revive': if (v) { v.deadT = null; v.R.root.visible = true; v.pop = nowS(); augFx('necro', k); } break;
        case 'aug': augEventFx(B, ev); break;
        case 'night': banner('入夜', '夜行動物暴擊提升'); break;
        case 'eco': { const L = ECO_LOOK[ev.t]; if (!L) break; const mine = MYB && MYB.mine && ev.team === cv.vt; at(0.6, () => { banner(`生態圈：${L.name}`, (mine ? '我方' : '敵方') + TRAITS[ev.t].name + '羈絆湊滿了！'); screenFlash(L.css); sfx('trait_' + ev.t); }); break; }
        case 'ecowave': { for (let rr = 0; rr < CFG.ROWS; rr += 2) { const [x, z] = bWorld(4, rr); at(rr * 0.04, () => { burst(V3(x, 0.2, z), 10, { tex: 'drop', scale: 0.14, speed: 3, up: 2.6, g: -7, life: 0.8 }); groundRing(V3(x, 0, z), 0x7fc8ff, 5, 0.6); }); } sfx('splashBig', 200); screenFlash('rgba(127,200,255,.25)'); break; }
        case 'dash': { if (!v) break; const tk = kOf(B.units[ev.tg]); v.faceK = tk; v.faceUntil = nowS() + 0.8; const from = v.pos.clone(); for (let i = 0; i < 6; i++) at(i * 0.05, () => { const vv = S3.V[k]; if (vv) sprite(ev.s === 'slide' ? 'drop' : 'puff', vv.pos.clone().add(V3(0, 0.12 + groundH(vv.pos.x, vv.pos.z), 0)), { color: ev.s === 'slide' ? 0xbfe6ff : 0xe8d8b8, scale: 0.28, scale1: 0.05, life: 0.5, opacity: 0.8 }); }); groundRing(from, 0xe8d8b8, 0.8, 0.35); break; }
        case 'grab': { const tk = kOf(B.units[ev.tg]); if (v) { v.faceK = tk; v.faceUntil = nowS() + 1.5; } at(0.45, () => { const p = posOf(tk, 0.6); if (p) burst(p, 6, { tex: 'feather', scale: 0.15, speed: 1.2, up: 1.5, g: -1, life: 0.9, spin: 4 }); }); break; }
        case 'chain': { const ids = ev.ids.map(id => kOf(B.units[id])); const d0 = hitDelay(k, 'skill'); for (let i = 0; i + 1 < ids.length; i++) at(d0 + i * 0.09, () => { const a = posOf(ids[i], i ? 0.5 : 1.0), b = posOf(ids[i + 1], 0.5); if (a && b) { lightning(a, b, 0xfff27a, 0.3); burst(b, 5, { tex: 'spark', color: 0xfff27a, scale: 0.12, add: true, speed: 2 }); } }); at(d0, () => { S3.shake = Math.max(S3.shake, 0.08); }); break; }
        case 'wave': { const d0 = hitDelay(k, 'skill'), wu = B.units[ev.id], ux = ev.x !== undefined ? ev.x : hexX(wu.c, wu.r); for (let rr = 0; rr < CFG.ROWS; rr++) for (let c = 0; c < CFG.COLS; c++) { if (Math.abs(hexX(c, rr) - ux) > 1) continue; const n = Math.abs(rr - wu.r); const [x, z] = bWorld(c, rr), dl = d0 + n * 0.07; at(dl, () => { burst(V3(x, 0.2 + groundH(x, z), z), 4, { tex: 'drop', scale: 0.13, speed: 1.2, up: 3, g: -7, life: 0.6 }); sprite('puff', V3(x, 0.3 + groundH(x, z), z), { color: 0x8fd3ff, scale: 0.6, scale1: 0.9, life: 0.5, opacity: 0.7 }); }); } at(d0, () => { S3.shake = Math.max(S3.shake, 0.18); stageShake(5); }); break; }
        case 'launch': { const [x, z] = bWorld(ev.fc, ev.fr), p = V3(x, groundH(x, z) + 0.15, z); sfx && sfx('skill'); groundRing(p, 0xfff3c8, 1.2, 0.5); if (S3.arenaKey === 'desert') burst(p, 14, { color: 0xf4dcae, scale: 0.4, speed: 1.6, up: 2.5, g: 0, life: 0.9 }); else if (S3.arenaKey === 'city') burst(p, 12, { color: 0xf2f2f2, scale: 0.45, speed: 1, up: 3, g: 0, life: 1.0, delay: 0 }); else { burst(p, 10, { tex: 'spark', color: 0xffd34d, scale: 0.12, add: true, speed: 2, up: 2 }); burst(p, 6, { tex: 'leaf', scale: 0.14, speed: 1.4, up: 2, g: -3, spin: 3 }); } s3Num(k, '彈射！', 'skill', 0, 15); break; }
        case 'land': { if (!v) break; const p = v.pos.clone(); groundRing(p, ev.drop ? 0xffc070 : 0xfff3c8, ev.drop ? 1.8 : 1.4, 0.5); burst(p.clone().add(V3(0, 0.1 + groundH(p.x, p.z), 0)), 12, { color: 0xe8d8b8, scale: 0.3, speed: 2.2, up: 0.8, g: -1.5, life: 0.7 }); slash('burst', posOf(k, 0.3), { scale: ev.drop ? 0.9 : 0.6 }); hitstop(50); S3.shake = Math.max(S3.shake, ev.drop ? 0.2 : 0.12); v.land = nowS(); break; }
      }
    }
    B.ev.length = 0;
  }
}
function lootOrb(p) {
  const orb = new THREE.Mesh(GEO.sph, MB(0x8fd3ff)); orb.scale.setScalar(0.13);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('puff'), color: 0x8fd3ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(0.6); orb.add(glow); glow.scale.setScalar(4);
  const from = p.clone(), to = AVATARS ? AVATARS[0].R.root.position.clone().add(V3(0, 0.5, 0)) : V3(benchWorld(0)[0] - 0.8, 0.3, benchWorld(0)[1]);
  meshFx(orb, { life: 1.6, custom: (f, q) => { if (q < 0.45) { const k = q / 0.45; f.o.position.set(from.x, from.y + Math.abs(Math.sin(k * Math.PI * 2)) * 0.6 * (1 - k), from.z); } else { const k = ease.inOut((q - 0.45) / 0.55); f.o.position.lerpVectors(from, to, k); f.o.position.y += Math.sin(k * Math.PI) * 1.2; } } });
}
function comboFx(B, ev) {
  const a = B.units[ev.a], b = B.units[ev.b];
  const c = $('cutin'); c.innerHTML = `<div class="band"></div>${pimg(a.key, 'l')}${pimg(b.key, 'r')}<div class="tx">合體技・${ev.s}</div>`; c.className = ''; void c.offsetWidth; c.className = 'show';
  clearTimeout(comboFx.h); comboFx.h = setTimeout(() => { c.className = ''; }, 1450);
  const pa = posOf(kOf(a), 0.6), pb = posOf(kOf(b), 0.6);
  if (pa && pb) for (let i = 0; i < 10; i++) sprite('spark', pa.clone().lerp(pb, i / 9), { scale: 0.25, scale1: 0.05, life: 0.7, color: 0xffd34d, add: true, delay: i * 0.03 });
  S3.shake = Math.max(S3.shake, 0.15);
  if (ev.s === '夜幕降臨') S3.nightTarget = 1;
}
// ---- 回合勝負（照聯盟戰棋）：自己的戰場一打完就顯示勝負並扣血，別的戰場打完才統一結算、進準備 ----
function roundResultBanner(r) {
  r = r || G.lastResult; const t = myTeam(); if (!r) return;
  if (r.pve) { banner(r.win[t] ? '擊退野生動物！' : '野生回合結束', '獲得裝備材料', 'win'); }
  else { const o = r.opp ? r.opp[t] : 1 - t, od = o >= 0 ? (r.dmg[o] || 0) : 0;
    if (r.win[t]) { banner('勝利！', `${o >= 0 ? teamLabel(o) : '敵隊'} −${od}`, 'win'); confetti(); }
    else { banner(o >= 0 && r.win[o] ? '敗北' : '平手', `我隊 −${r.dmg[t]}`, 'lose'); damageOrbs(); } }
}
function roundDmgNote(r) {
  const t = myTeam(); if (!r || r.pve) return;
  const o = r.opp ? r.opp[t] : 1 - t, od = o >= 0 ? (r.dmg[o] || 0) : 0;
  if (r.win[t]) { if (od) toast(`${o >= 0 ? teamLabel(o) : '敵隊'} −${od}`, 1800); }
  else { toast(`我隊 −${r.dmg[t]}`, 1800); damageOrbs(); }
}
// 伺服器（或本機）已經結算好自己這場了嗎？
function mySettled() { const r = G.roundRes, i = G.battles.indexOf(MYB.bt); return r && r.round === G.round && i >= 0 && (r.done || []).includes(i) ? r : null; }
function myBattleDoneCheck() {
  if (!MYB || !MYB.mine || REPLAY) return;
  if (MYB.needDmg) { const r = mySettled() || (G.phase === 'result' ? G.lastResult : null); if (r) { MYB.needDmg = false; roundDmgNote(r); } }
  if (MYB.doneShown || !MYB.B.over) return;
  MYB.doneShown = true; mvpAdd(MYB.B, MYB.vt);
  const r = mySettled() || (G.phase === 'result' ? G.lastResult : null);
  if (r) { roundResultBanner(r); return; }
  // 結算資料還沒到（連線時偶爾）：先顯示勝負，扣血等資料到了再補
  const w = MYB.B.winner, pve = MYB.bt.teams[1] < 0;
  if (pve) banner(w === MYB.vt ? '擊退野生動物！' : '野生回合結束', '獲得裝備材料', 'win');
  else { if (w === MYB.vt) { banner('勝利！', '', 'win'); confetti(); } else banner(w === 1 - MYB.vt ? '敗北' : '平手', '', 'lose'); MYB.needDmg = true; }
}
const WAIT_CFG = { SHOW: true }; // 自己打完、別的戰場還在打時，是否顯示「等待其他戰場」
function waitChip(n) {
  let el = document.getElementById('waitChip');
  if (!n || !WAIT_CFG.SHOW) { if (el) el.hidden = true; return; }
  if (!el) { const st = $('stage'); if (!st) return; el = document.createElement('div'); el.id = 'waitChip'; st.appendChild(el); }
  const txt = `等待其他戰場…（剩 ${n} 場）`; if (el.textContent !== txt) el.textContent = txt; el.hidden = false;
}
function damageOrbs(team) {
  if (typeof avatarHurt === 'function') avatarHurt();
  // 敵方存活者化成光球飛向我隊血條（正在看別人的戰場時不飛）
  const B = cv && cv.B; if (!B || (MYB && cv.bt !== MYB.bt)) return;
  const el = $('teamA').getBoundingClientRect(), cr = S3.renderer.domElement.getBoundingClientRect();
  let n = 0;
  for (const u of B.units) if (u.alive && u.team !== cv.vt && !u.summon) {
    const v = S3.V[kOf(u)]; if (!v) continue;
    const s = toScreen(v3top(v)); const o = document.createElement('div'); o.className = 'orb';
    o.style.transform = `translate(${cr.left + s[0]}px,${cr.top + s[1]}px)`; document.body.appendChild(o);
    const dl = 120 * n++;
    setTimeout(() => { o.style.transform = `translate(${el.left + el.width * 0.7}px,${el.top + 20}px) scale(1.3)`; }, 30 + dl);
    setTimeout(() => { o.remove(); const t = $('teamA'); t.classList.remove('hit'); void t.offsetWidth; t.classList.add('hit'); }, 650 + dl);
  }
}
function confetti() { for (let i = 0; i < 26; i++) sprite(i % 3 ? 'spark' : 'star', V3((Math.random() - .5) * 7, 4.5 + Math.random() * 2, (Math.random() - .5) * 6), { scale: 0.2, scale1: 0.15, life: 1.8, vel: V3((Math.random() - .5), -2.5 - Math.random() * 2, 0), g: 0, color: [0xffd34d, 0xff8a6a, 0x9be07a, 0x8fd3ff][i % 4], spin: 4, delay: Math.random() * 0.5 }); }

// ---- 海克斯特效 ----
function ripple(p) { groundRing(p, 0x9fd3ef, 0.9, 0.6); groundRing(p, 0xd6eef7, 0.55, 0.5, 0.12); burst(p.clone().add(V3(0, 0.1, 0)), 6, { tex: 'drop', scale: 0.08, speed: 1, up: 1.8, g: -6, life: 0.5 }); }
function meteorFx(p) {
  const rock = mesh(GEO.sph, T('#7a4a30'), null, 0.35); const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('puff'), color: 0xff8a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); fire.scale.setScalar(4); rock.add(fire);
  const from = p.clone().add(V3(-2.5, 7, -2));
  meshFx(rock, { life: 0.55, custom: (f, q) => { f.o.position.lerpVectors(from, p, q * q); f.o.rotation.x += 0.3; }, onEnd: () => { groundRing(p, 0xff8a3a, 2.4, 0.7); groundRing(p, 0xffd34d, 1.6, 0.5, 0.08); burst(p.clone().add(V3(0, 0.2, 0)), 18, { color: 0xffa060, scale: 0.4, speed: 3, up: 2, g: -4, life: 0.8, add: true }); hitstop(70); stageShake(7); S3.shake = Math.max(S3.shake, 0.2); } });
}
function augFx(id, k) { const a = AUG[id]; if (a) s3Num(k, a.name, 'aug', 0, 13); }
function augEventFx(B, ev) {
  const u = ev.id >= 0 ? B.units[ev.id] : null, k = u ? kOf(u) : null, v = k ? S3.V[k] : null, a = ev.a;
  if (a === 'plague') { for (const e of B.units) if (e.alive && e.team !== ev.team) { const p = posOf(kOf(e), 0.6); if (p) burst(p, 3, { color: 0x9bc24a, scale: 0.15, speed: 0.4, up: 0.8, g: 0, life: 0.7 }); } return; }
  if (!v) return;
  augFx(a, k);
  const p = v.pos.clone();
  if (a === 'roar') { for (let i = 0; i < 3; i++) sprite('ring', posOf(k, 0.6), { scale: 0.3, scale1: 2.0, life: 0.6, delay: i * 0.1, color: 0xffc94a, add: true }); stageShake(4); }
  else if (a === 'quake' || a === 'trample') { groundRing(p, 0xe8d8b8, 1.6, 0.5); burst(p.clone().add(V3(0, 0.1, 0)), 8, { color: 0xe8d8b8, scale: 0.25, speed: 1.6, up: 0.4, g: 0 }); stageShake(4); }
  else if (a === 'bind') { groundRing(p, 0x8a6ad8, 0.9, 0.8); for (let i = 0; i < 6; i++) sprite('spark', p.clone().add(V3(Math.cos(i) * 0.4, 0.2 + i * 0.12, Math.sin(i) * 0.4)), { scale: 0.15, life: 2.2, color: 0xb9a4ff, add: true }); }
  else if (a === 'pounce') { const c = posOf(k, 0.6); if (c) slash('claw3', c, { scale: 0.7 }); }
  else if (a === 'shift' && ev.to !== undefined) { const b = posOf(kOf(B.units[ev.to])); for (let i = 0; i < 8; i++) sprite('spark', posOf(k).lerp(b, i / 7), { scale: 0.2, scale1: 0.05, life: 0.6, color: 0x8af0c8, add: true, delay: i * 0.03 }); }
  else if (a === 'rewind') { groundRing(p, 0x8ab8ff, 1.2, 0.7); sprite('ring', posOf(k, 0.6), { scale: 1.2, scale1: 0.2, life: 0.6, color: 0x8ab8ff, add: true }); }
  else if (a === 'necro') { const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3, 20, 1, true), new THREE.MeshBasicMaterial({ map: tex('beam'), color: 0xb98aff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); pil.position.copy(p).add(V3(0, 1.5, 0)); meshFx(pil, { life: 0.9, custom: (f, q) => { f.o.material.opacity = Math.sin(q * Math.PI); } }); }
  else if (a === 'scapegoat' && ev.to !== undefined) { const b = posOf(kOf(B.units[ev.to])); if (b) for (let i = 0; i < 6; i++) projectile(b, posOf(k), 'spark', 0.4, { color: 0xffd34d, scale: 0.15, delay: i * 0.04 }); }
  else if (a === 'riposte' && ev.to !== undefined) { const b = posOf(kOf(B.units[ev.to])); if (b) slash('claw1', b, { scale: 0.7, color: 0xff6a5a }); }
  else if (a === 'soulfeed') burst(posOf(k, 0.6), 6, { tex: 'spark', color: 0xb98aff, scale: 0.12, add: true, speed: 0.8, up: 1.5, g: 0 });
}

// ---- 海克斯：三選一與已選清單 ----
function renderAugs() {
  const P = G.players[ME], T = teammate(G, ME);
  const mine = P.augs.map(id => `<button class="augchip" data-aug="${id}">${augIcon(id)}<span>${AUG[id].name}</span></button>`).join('');
  const mate = (T ? T.augs : []).map(id => `<button class="augchip mate" data-aug="${id}">${augIcon(id)}<span>${AUG[id].name}</span></button>`).join('');
  $('augs').innerHTML = (mine || mate) ? `<span class="lbl">增幅</span>${mine}${mate}` : '';
  $('augs').hidden = !(mine || mate);
  const m = $('augModal');
  if (P.augChoice && G.phase === 'prep') {
    if (m.dataset.k !== P.augChoice.join()) {
      m.dataset.k = P.augChoice.join(); m.classList.remove('min');
      const tier = AUG[P.augChoice[0]].tier;
      m.innerHTML = `<div class="augbox"><h2>${AUG_TIER_NAME[tier]}海克斯增幅</h2><p class="sub">三選一。倒數結束會自動選第一個：剩 <b class="cdT">${Math.ceil(Math.max(0, G.timer) / 1000)}</b> 秒</p><div class="augcards">${P.augChoice.map((id, i) => `<button class="augcard t${AUG[id].tier}" data-pick="${id}" style="animation-delay:${i * 90}ms"><span class="frame"></span>${augIcon(id, 'big')}<b>${AUG[id].name}</b><span class="d">${AUG[id].desc}</span></button>`).join('')}</div><button class="btn" id="augHide">先看棋盤</button></div><button class="augpill" id="augShow">選擇海克斯增幅</button>`;
    }
    m.hidden = false;
  } else { m.hidden = true; m.dataset.k = ''; }
}
function pickAug(id) {
  const r = actMe({ t: 'aug', id });
  if (r !== 'ok') return;
  toast(`獲得增幅：${AUG[id].name}`);
  confetti(); stageShake(3);
  processLog(); renderPrep();
}

// ---- 階段切換 ----
function onPhase() {
  const ph = G.phase;
  if (G.td && tdOnPhase(ph)) return;
  if (ph !== 'prep' && SCOUT >= 0) { SCOUT = -1; renderScoutBar(); $('stage').classList.remove('scouting'); }
  if (ph === 'prep') {
    tutPrepHook();
    waitChip(0); cv = null; WATCH = -1; MYB = null; sel = null; S3.nightTarget = 0; SCOUT = -1;
    for (const k in S3.V) if (k[0] === 'b') s3Remove(k);
    processLog(); renderPrep();
    const st = stageOf(G.round), first = st === 1 ? 1 : 4 + (st - 2) * 5;
    banner(`${st}-${G.round - first + 1}　${isPve(G.round) ? '野生回合' : '對戰回合'}`, `${ARENAS[G.arena].name}・準備 ${CFG.PREP_SEC} 秒`);
    const inc = G.players[ME].lastIncome;
    if (inc && G.round > 1) at(0.8, () => showIncome(inc));
  } else if (ph === 'combat') { startCombatView(); sfx('horn'); banner(isBoss(G.round) ? '魔王來襲！' : isPve(G.round) ? '野生動物出沒！' : '戰鬥開始！', isBoss(G.round) ? '野豬王出現了' : ''); }
  else if (ph === 'result') {
    waitChip(0);
    if (!(MYB && MYB.mine && !REPLAY)) roundResultBanner(); // 觀戰或回放：照舊在結算時顯示；自己的戰場由 myBattleDoneCheck 在播完時顯示
    renderDock(); renderTraits();
  } else if (ph === 'over') showOver();
  featuresPhase(ph);
}
function loop(now) {
  requestAnimationFrame(loop); // 先排下一幀：就算這一幀某個特效出錯，遊戲也不會整個停住
  const t0 = performance.now(); try { loopBody(now); } catch (e) { console.error(e); } const d = performance.now() - t0; S3.perf = S3.perf || { n: 0, sum: 0, big: 0 }; S3.perf.n++; S3.perf.sum += d; if (d > 50) S3.perf.big++;
}
// 除錯用：網址加 ?zoodebug 才有，讓沒開視窗時也能手動跑幾幀再截圖（玩家看不到）
if (/zoodebug/.test(location.search)) {
  let fake = 0;
  window.__zdbg = {
    step(n, ms) { fake = Math.max(fake, performance.now()); for (let i = 0; i < (n || 1); i++) { fake += ms || 33; try { loopBody(fake); } catch (e) { console.error(e); } } },
    shot() { this.step(1); return new Promise(r => S3.renderer.domElement.toBlob(r, 'image/png')); },
    G: () => G, S3,
  };
}
function loopBody(now) {
  const frozen = now < (S3.freezeUntil || 0);
  const dt = frozen ? 0 : Math.min(0.1, (now - (lastT || now)) / 1000); lastT = now;
  if (NET.role === 'client') netClientUpdate(dt);
  else if (G && G.phase !== 'over' && !$('game').hidden && !REPLAY) update(G, dt * 1000);
  if (NET.role === 'host') netHostTick(dt);
  if (G && !$('game').hidden) {
    if (G.phase !== lastPhase || G.round !== lastRound) { const was = lastPhase; lastPhase = G.phase; lastRound = G.round; onPhase(was); }
    if (REPLAY) replayFrame(dt);
    else if (cv && (G.phase === 'combat' || G.phase === 'result')) { combatSync(); handleEvents(); myBattleDoneCheck(); if (G.phase === 'combat') waitChip(MYB && MYB.doneShown && cv.bt === MYB.bt ? G.battles.filter(b => b.B && !b.B.over).length : 0); }
    featuresFrame(dt);
    const t = nowS(); const due = []; sched = sched.filter(s => { if (t >= s.t) { due.push(s); return false; } return true; }); for (const s of due) { try { s.fn(); } catch (e) { console.error(e); } }
    hud();
    if (G.phase === 'prep') idleVoice();
    if (scoutTeam() >= 0 && (S3.scoutT = (S3.scoutT || 0) + dt) > 0.6) { S3.scoutT = 0; renderPrep(); }
    s3Frame(dt * ((REPLAY ? G.speed : (G.phase === 'combat' ? G.speed : 1)) || 1));
  }
}
// 結束畫面：我最後的陣容（貴的、星高的排前面）
let LAST_COMP = [];
function overCompHtml() {
  const board = Object.values(G.board).filter(u => u.owner === ME), us = (board.length ? board : LAST_COMP).slice().sort((a, b) => (b.star - a.star) || ((ANIMALS[b.key] || {}).cost - (ANIMALS[a.key] || {}).cost));
  if (!us.length) return '';
  return `<div class="overcomp"><small>最後陣容</small><div>${us.slice(0, 10).map(u => `<span>${pimg(u.key)}<i>${'★'.repeat(u.star)}</i></span>`).join('')}</div></div>`;
}
function showOver() {
  const am = $('augModal'); if (am) { am.hidden = true; am.innerHTML = ''; am.dataset.k = ''; } // 結束畫面不要被海克斯選單蓋住
  const win = G.winner === myTeam(), place = G.teams[myTeam()].place || (win ? 1 : 2), n = G.teams.length;
  $('panel').innerHTML = `<div class="over"><h2>${win ? (G.solo ? '你獲勝！' : '我隊獲勝！') : n > 2 ? `第 ${place} 名` : '這局輸了'}</h2><p>打到第 ${G.round} 回合，我隊剩 ${Math.max(0, G.teams[myTeam()].hp)} 血。${n > 2 ? `（${n} 隊中第 ${place} 名）` : ''}</p>${ladderOverHtml()}${mvpHtml() || pimg(win ? 'lion' : 'koala')}${overCompHtml()}<div class="overbtns"><button class="btn primary" id="btnAgain">${NET.role ? '回大廳' : '再來一局'}</button>${NET.role ? '' : '<button class="btn" id="btnOverLobby">回大廳</button>'}</div></div>`;
  $('overlay').hidden = false;
  // 再來一局：照這局的模式（單人混戰／1 對 1／雙人）重開
  $('btnAgain').onclick = () => { $('overlay').hidden = true; if (NET.role) { netLeave(); return; } const solo = !!(G && G.solo), nT = G ? G.teams.length : 2; newGame(solo ? nT : (nT > 2 ? 4 : 2), solo); };
  if ($('btnOverLobby')) $('btnOverLobby').onclick = () => leaveToLobby();
}
function newGame(teams, solo) {
  for (const k in S3.V) s3Remove(k);
  const rules = loadRules(); if (teams) rules.teams = teams; rules.solo = !!solo;
  const names = solo ? ['阿熊', '小狼', '河馬', '鴨鴨', '老貓', '刺刺', '咕咕'] : ['阿熊', '野狼幫甲', '野狼幫乙', '河馬團甲', '河馬團乙', '鴨鴨隊甲', '鴨鴨隊乙'];
  const n = solo ? (teams || 8) : (rules.teams === 4 ? 8 : 4);
  const players = [{ name: '你' }]; for (let i = 1; i < n; i++) players.push({ name: names[i - 1], ai: true });
  let meta = []; try { meta = JSON.parse(localStorage.getItem('zoo_meta') || '[]'); } catch (e) {}
  G = createGame({ seed: (Date.now() & 0x7fffffff), rules, players, solo: !!solo, meta });
  startGame(G); lastPhase = ''; lastRound = 0; cv = null; sel = null; logIdx = G.log.length; prevLevel = 0; prevGold = null; prevTiers = {};
  $('lobby').hidden = true; $('game').hidden = false;
  s3Resize();
  $('stage').dataset.arena = G.arena;
}

// ---- 圖鑑 ----
function showDex(tab) {
  tab = tab || 'animals';
  const tabs = [['animals', '動物'], ['traits', '羈絆'], ['combos', '合體技'], ['items', '裝備'], ['augs', '海克斯'], ['arena', '場地'], ['rules', '規則']];
  let body = '';
  if (tab === 'animals') body = `<div class="dexf">${['all', 1, 2, 3, 4, 5].map(c => `<button data-df="c${c}" class="${c === 'all' ? 'on' : ''}">${c === 'all' ? '全部' : c + ' 費'}</button>`).join('')}${Object.keys(TRAITS).map(t => `<button data-df="t${t}">${TRAITS[t].name}</button>`).join('')}</div>` + Object.keys(ANIMALS).map(k => { const A = ANIMALS[k]; return `<div class="row" data-dc="c${A.cost}" data-dt="${A.traits.map(t => 't' + t).join(' ')}">${pimg(k)}<div><b>${A.name}</b>　<span style="color:${COST_COL[A.cost]};font-weight:900">${A.cost} 費</span>・${A.role}・${A.traits.map(TNAME).join('・')}<br>生命 ${A.hp}・攻擊 ${A.atk}・射程 ${A.rng}<br><b>${A.skill}</b>：${skillDesc(k)}<br><button class="btn sm demo" data-demo="${k}">▶ 技能展示</button></div></div>`; }).join('');
  if (tab === 'traits') body = Object.keys(TRAITS).map(t => { const T = TRAITS[t]; return `<div class="plain">${iconTrait(t)}<div><b>${T.name}</b>（${Object.keys(ANIMALS).filter(k => ANIMALS[k].traits.includes(t)).map(k => ANIMALS[k].name).join('、')}）<br>${T.tiers.map((n, i) => `(${n}) ${T.desc[i]}`).join('<br>')}</div></div>`; }).join('') + `<div class="plain"><div>羈絆以「不同種類」計算，兩位隊友的棋子合併計。兩人都有出同一羈絆時效果 +${SYNERGY_BONUS}%（默契）。</div></div>`;
  if (tab === 'combos') body = COMBOS.map(c => `<div class="row">${pimg(c.a)}<div><b>${c.name}</b>　${ANIMALS[c.a].name}＋${ANIMALS[c.b].name}<br>${c.desc}</div></div>`).join('') + '<div class="plain"><div>兩隻需分屬兩位隊友、開場相鄰。兩隻都放過一次技能後自動發動一次。</div></div>';
  if (tab === 'items') body = Object.keys(MATS).map(k => `<div class="plain">${iconItem(k)}<div><b>${MATS[k].name}</b>　${Object.entries(MATS[k].stat).map(([s, v]) => ({ atk: '攻擊', hp: '生命', as: '攻速%', arm: '護甲', mr: '魔抗', sm: '起始能量' }[s] + ' +' + v)).join('')}</div></div>`).join('') + Object.keys(ITEMS).map(k => `<div class="plain">${iconItem(k)}<div><b>${ITEMS[k].name}</b>　${ITEMS[k].from.map(m => MATS[m].name).join('＋')}<br>${ITEMS[k].desc}</div></div>`).join('');
  if (tab === 'augs') body = [1, 2, 3].map(tr => `<div class="plain"><div><b>${AUG_TIER_NAME[tr]}</b>（第 ${CFG.AUG_ROUNDS.join('、')} 回合三選一，銀／金／彩 依回合機率出現）</div></div>` + AUGMENTS.filter(x => x.tier === tr).map(x => `<div class="plain">${augIcon(x.id)}<div><b>${x.name}</b>　${x.desc}</div></div>`).join('')).join('');
  if (tab === 'arena') body = Object.keys(ARENAS).map(a => `<div class="plain"><div><b>${ARENAS[a].name}</b>　地形：${Object.keys(ARENAS[a].weights).sort((x, y) => ARENAS[a].weights[y] - ARENAS[a].weights[x]).map(t => TERRAIN_SKIN[a][t]).join('、')}（越前面越常見）</div></div>`).join('') + Object.keys(TERRAIN).map(t => `<div class="plain"><div><b>${TERRAIN[t].name}類</b>　${TERRAIN[t].desc}</div></div>`).join('') + `<div class="plain"><div><b>高台</b>（${Object.keys(ARENAS).map(a => TERRAIN_SKIN[a].high).join('、')}）　遠程射程 +${HIGH.RANGE}；從低處打上高台的普攻有 ${HIGH.MISS}% 落空；爬坡移動變慢</div></div>` + '<div class="plain"><div>每個階段換一個場地，地形與高台雙方對稱。</div></div>';
  if (tab === 'rules') body = `<div class="plain"><div>兩隊各兩人，同隊共用我方半場（${CFG.COLS}×${CFG.ROWS_HALF} 格）與 ${CFG.TEAM_HP} 點團隊血量。<br>準備 ${CFG.PREP_SEC} 秒 → 戰鬥最長 35 秒（30 秒後加時）。<br>輸掉回合扣血：${CFG.DMG_BASE} ＋ 敵方存活星數 × ${CFG.DMG_STAR_PCT}% ＋（階段−1）× ${CFG.DMG_STAGE}。<br>商店每回合 ${CFG.SHOP_SIZE} 張，刷新 ${CFG.REROLL_COST} 金，可鎖定。等級 1～${CFG.MAX_LEVEL}，人口＝等級，等級越高越容易出 4、5 費。<br>經驗：每回合自動 +${CFG.XP_ROUND}；購買經驗 $${CFG.XP_COST}（+${CFG.XP_BUY} XP）。升級所需：${Object.entries(CFG.XP_NEED).map(([l, n]) => `Lv.${l}→${+l + 1}：${n}`).join('、')}。<br>第 ${CFG.AUG_ROUNDS.join('、')} 回合可選海克斯增幅。<br>收入依階段 ${CFG.INCOME_BY_STAGE.slice(1, 4).join('／')}… 金＋利息（每 10 金 +1，最多 +5）＋連勝敗；贏了再 +1。<br>三隻同星自動升星。卡池全場共用（每隻動物：${Object.entries(CFG.POOL).map(([c, n]) => `${c} 費 ${n} 張`).join('、')}），被買光的就不會出現在商店。<br>環境羈絆（森林、草原、水域、天空）湊到最高階＝「生態圈」：超強效果、戰場換裝、羈絆圖示變彩色。<br>海克斯、傳送門、奇遇的選擇都跟著準備倒數，時間到自動選第一個。</div></div><div class="plain"><div>操作：拖曳棋子到格子或備戰席；拖到商店出售。拖裝備到棋子身上。點一下看資訊。</div></div>`;
  $('panel').innerHTML = `<button class="x" id="dexX" aria-label="關閉">✕</button><h2>圖鑑</h2><div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div><div class="dex">${body}</div>`;
  $('overlay').hidden = false;
  $('dexX').onclick = () => { $('overlay').hidden = true; };
  $('panel').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => showDex(b.dataset.tab));
  $('panel').querySelectorAll('[data-demo]').forEach(b => b.onclick = () => skillDemo(b.dataset.demo));
  // 圖鑑篩選：依費用或羈絆
  $('panel').querySelectorAll('[data-df]').forEach(b => b.onclick = () => { const f = b.dataset.df; $('panel').querySelectorAll('[data-df]').forEach(x => x.classList.toggle('on', x === b)); $('panel').querySelectorAll('.dex .row[data-dc]').forEach(r => { r.hidden = !(f === 'call' || r.dataset.dc === f || (r.dataset.dt || '').split(' ').includes(f)); }); });
}

// ---- 啟動 ----
function boot() {
  const parade = ['hedgehog', 'redpanda', 'lion', 'koala', 'owl'];
  $('parade').innerHTML = parade.map((k, i) => pimg(k, i === 2 ? 'big' : '')).join('');
  makePortraits(parade, () => splashFinish());
  $('loadNote').textContent = ''; $('loadNote').dataset.v = '0.13.32'; // 版本號只留在原始碼，不顯示給玩家
  s3Init($('stage'), $('cv'), $('ov')); LD.set(50, '召集動物');
  const stage = $('stage');
  stage.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; onDown(e); });
  $('teamB').addEventListener('click', e => { if (!G) return; if (e.target.closest('[data-nopp]')) { openNextOpp(); return; } if (e.target.closest('.stx')) { $('teamB').classList.toggle('wide'); hud.k = ''; return; } const r = e.target.closest('[data-st]'); const t = r ? +r.dataset.st : G.teams.length === 2 ? 1 - myTeam() : -1; if (G.phase === 'combat' || G.phase === 'result') { if (t >= 0 && !G.teams[t].out && G.battles.length > 1) watchBattle(t === WATCH ? -1 : t); else openScout(); return; } if (G.phase !== 'prep') { openScout(); return; } if (t < 0 || G.teams[t].out) return; setScout(scoutTeam() === t ? myTeam() : t); });
  window.addEventListener('pointermove', e => { onMove(e); onItemMove(e); });
  window.addEventListener('pointerup', e => { onUp(e); onItemUp(e); });
  $('btnHelp').onclick = () => showDex();
  $('sheet').addEventListener('click', onSheet);
  $('shop').addEventListener('click', e => { const c = e.target.closest('[data-slot]'); if (!c) return; const rect = c.getBoundingClientRect(), src = c.querySelector('img').src; const r = doAct({ t: 'buy', slot: +c.dataset.slot }, true); if (r === 'ok') buyFx(rect, src); else { toast(ERR[r] || '不行'); const el = document.querySelector(`[data-slot="${c.dataset.slot}"]`); if (el) { el.classList.add('nope'); } } });
  $('items').addEventListener('pointerdown', onItemDown);
  $('traits').addEventListener('click', e => { const c = e.target.closest('[data-trait],[data-combo]'); if (!c) return; sel = c.dataset.trait ? { type: 'trait', k: c.dataset.trait } : { type: 'combo', id: c.dataset.combo }; renderSheet(); });
  $('mate').addEventListener('click', e => { if (e.target.id === 'btnGiftGold') { if (doAct({ t: 'gift', gold: 1 }) === 'ok') toast('送了 1 金給隊友'); } if (e.target.id === 'btnReady') { actMe({ t: 'ready' }); renderDock(); if (G.players[ME].ready) sfx('ready'); } });
  $('btnLevel').onclick = () => doAct({ t: 'level' });
  $('augs').addEventListener('click', e => { const c = e.target.closest('[data-aug]'); if (c) { sel = { type: 'aug', id: c.dataset.aug }; renderSheet(); } });
  $('augModal').addEventListener('click', e => { const c = e.target.closest('[data-pick]'); if (c) { c.classList.add('chosen'); setTimeout(() => pickAug(c.dataset.pick), 220); return; } if (e.target.id === 'augHide') $('augModal').classList.add('min'); if (e.target.id === 'augShow') $('augModal').classList.remove('min'); });
  $('btnRoll').onclick = () => doAct({ t: 'reroll' });
  $('btnLock').onclick = () => { doAct({ t: 'lock' }); toast(G.players[ME].locked ? '已鎖定：下回合保留這組商店' : '已解除鎖定'); };
  featuresBoot();
  requestAnimationFrame(loop);
}
window.__zoo = { get G() { return G; }, S3 }; window.__upd = update; window.__s3hl = s3Highlight; window.__s3arena = s3SetArena; window.__s3ter = s3SetTerrain; window.__s3sync = s3Sync;
