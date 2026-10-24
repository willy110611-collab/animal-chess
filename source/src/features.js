// ===== 進階功能：統計、卡池、偵察、快捷鍵、陣容、代打投降、回放慢動作、技能預覽、
//      傳送門、遭遇、選秀、天氣、指令、金庫隊長、標記、小小英雄、教學、收藏造型、自訂規則 =====
let REPLAY = null, MENU_OPEN = false, METER = { on: window.innerWidth >= 1100 && window.innerHeight > 520, /* 只有電腦版預設打開傷害統計（手機、平板按「統計」打開） */ tab: 'dmg', last: 0 }, AVATARS = null, PRESS = null;
const $$ = sel => document.querySelector(sel);

// ---- 玩家檔案（本機）----
const PROFILE = (() => { try { return Object.assign({ games: 0, wins: 0, three: 0, prism: 0, unlocked: { base: 1 }, skinSel: {} }, JSON.parse(localStorage.getItem('zoo_profile') || '{}')); } catch (e) { return { games: 0, wins: 0, three: 0, prism: 0, unlocked: { base: 1 }, skinSel: {} }; } })();
function saveProfile() { try { localStorage.setItem('zoo_profile', JSON.stringify(PROFILE)); } catch (e) {} }
const SKIN_RULE = { seasonGold: '賽季結束時黃金以上', seasonDia: '賽季結束時鑽石以上', base: '一開始就有', gold: '贏 1 場', night: '玩 3 場', snow: '做出任一 3 星動物', sakura: '隊伍 50 血以上獲勝', jade: '一場選到 2 個彩色海克斯' };
function unlockSkin(id) { if (!PROFILE.unlocked[id]) { PROFILE.unlocked[id] = 1; saveProfile(); toast(`解鎖造型：${SKINS[id].name}！`, 2200); } }
function skinOf(key) { const s = PROFILE.skinSel[key]; return s && PROFILE.unlocked[s] ? s : null; }
const SKIN_CSS = { base: '', gold: 'sepia(.6) saturate(1.8) brightness(1.1)', night: 'brightness(.7) saturate(.7) hue-rotate(200deg)', snow: 'brightness(1.35) saturate(.25)', sakura: 'hue-rotate(-25deg) saturate(1.3) brightness(1.1)', jade: 'hue-rotate(90deg) saturate(.9)' , seasonGold: 'sepia(.8) saturate(2.4) brightness(1.15)', seasonDia: 'hue-rotate(160deg) saturate(1.6) brightness(1.2)' };

// ---- 自訂規則（本機記住）----
function loadRules() { try { const s = JSON.parse(localStorage.getItem('zoo_rules') || '{}'); if (!s.v5) { s.maxRound = 0; s.v5 = 1; } return Object.assign({}, DEFAULT_RULES, s); } catch (e) { return Object.assign({}, DEFAULT_RULES); } }
function saveRules(r) { try { localStorage.setItem('zoo_rules', JSON.stringify(r)); } catch (e) {} }

// ---- 小工具 ----
function unitTraits(u) { const t = ANIMALS[u.key].traits.slice(); for (const it of u.items || []) if (EMBLEMS[it] && !t.includes(EMBLEMS[it].trait)) t.push(EMBLEMS[it].trait); return t; }
function preyLine(key) {
  const eats = PREY[key] || [], fears = Object.keys(PREY).filter(k => PREY[k].includes(key));
  const nm = k => (ANIMALS[k] || EXTRA[k]).name;
  if (!eats.length && !fears.length) return '';
  return `<p style="font-size:12px">${eats.length ? `天敵於：${eats.filter(k => ANIMALS[k]).map(nm).join('、') || eats.map(nm).join('、')}（傷害 +${PREY_BONUS}%）` : ''}${eats.length && fears.length ? '　' : ''}${fears.length ? `怕：${fears.map(nm).join('、')}` : ''}</p>`;
}
function modal(html, cls) {
  let m = $('modal2'); if (!m) { m = document.createElement('div'); m.id = 'modal2'; m.className = 'modal2'; document.body.appendChild(m); }
  m.className = 'modal2 ' + (cls || ''); m.innerHTML = html; m.hidden = false; return m;
}
function closeModal() { const m = $('modal2'); if (m) { m.hidden = true; m.dataset.k = ''; } }

// ---- 啟動 ----
function featuresBoot() {
  // 戰場上的按鈕：選單、統計、指令列、天氣
  const stage = $('stage');
  stage.insertAdjacentHTML('beforeend', `<button class="menubtn" id="btnMenu" aria-label="選單"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>
    <button class="meterbtn" id="btnMeter">統計</button><div class="meter" id="meter" hidden></div>
    <button class="emobtn" id="btnEmote" aria-label="表情">${EMOTES[0][0]}</button><div class="emopick" id="emopick" hidden>${EMOTES.map((e, i) => `<button data-emo="${i}" title="${e[1]}">${e[0]}</button>`).join('')}</div><div id="emoBubbles"></div>
    <div class="cmdbar" id="cmdbar" hidden>${Object.keys(COMMANDS).map(k => `<button class="cmd" data-cmd="${k}" title="${COMMANDS[k].desc}">${COMMANDS[k].name}</button>`).join('')}</div>
    <div class="wchip" id="wchip"></div><div class="pingmenu" id="pingmenu" hidden></div><div id="pingLabels"></div>`);
  $('btnMenu').onclick = () => openMenu();
  $('btnEmote').onclick = () => { $('emopick').hidden = !$('emopick').hidden; };
  $('emopick').addEventListener('click', e => { const b = e.target.closest('[data-emo]'); if (!b) return; $('emopick').hidden = true; const r = doAct({ t: 'emote', id: +b.dataset.emo }, true); if (r === 'bad') toast('表情按太多次了，等下一階段'); });
  $('btnMeter').onclick = () => { METER.on = !METER.on; $('meter').hidden = !METER.on; renderMeter(true); };
  $('meter').addEventListener('click', e => { const t = e.target.closest('[data-mt]'); if (t) { METER.tab = t.dataset.mt; renderMeter(true); } });
  $('cmdbar').addEventListener('click', e => { const b = e.target.closest('[data-cmd]'); if (!b) return; const r = actMe({ t: 'cmd', type: b.dataset.cmd }); if (r !== 'ok') { toast(ERR[r] || '現在不能下指令'); sfx('error'); } });
  // 大廳按鈕
  $('btnLadder').onclick = () => openLadder();
  $('btnStats').onclick = () => openStats(); $('btnQuest').onclick = () => openQuests(); $('btnFriends').onclick = () => openFriends(); $('btnLive').onclick = () => openLive();
  $('btnPlay').onclick = () => openModes();
  $('btnSettings').onclick = () => openSettings();
  $('btnAcc').onclick = () => openAccount();
  setupInstall();
  // 開啟聲音（需要使用者點擊）
  document.addEventListener('pointerdown', () => { audInit(); try { bgmAuto(); const a = BGM.key && BGM.el[BGM.key]; if (a && a.paused) a.play().catch(() => {}); } catch (e) {} }, { once: false, passive: true }); // 在點擊當下播放（手機瀏覽器規定）
  // 快捷鍵
  window.addEventListener('keydown', onHotkey);
  // 長按標記
  stage.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; startPress(e, 'stage'); }, true);
  $('shop').addEventListener('pointerdown', e => { const c = e.target.closest('[data-slot]'); if (c) startPress(e, 'shop', +c.dataset.slot); }, true);
  window.addEventListener('pointermove', e => { if (PRESS && Math.hypot(e.clientX - PRESS.x, e.clientY - PRESS.y) > 8) { clearTimeout(PRESS.t); PRESS = null; } });
  window.addEventListener('pointerup', () => { if (PRESS) { clearTimeout(PRESS.t); PRESS = null; } });
  $('pingmenu').addEventListener('click', e => { const b = e.target.closest('[data-ping]'); if (b) doPing(b.dataset.ping); else if (e.target.closest('[data-x]')) $('pingmenu').hidden = true; });
  // 右鍵也能標記（電腦）
  stage.addEventListener('contextmenu', e => { e.preventDefault(); startPress(e, 'stage', null, true); });
  // 小小英雄
  AVATARS = [makeAvatar(ME, 3.95), makeAvatar(1, -3.95)];
  eggsBoot();
  // 數字顯示：加上天敵字樣用的樣式在 CSS
}

// ---- 每階段 ----
function featuresPhase(ph) {
  if (ph === 'prep') {
    sfx('round'); musicStart(G.arena);
    $('cmdbar').hidden = true;
    renderWeatherChip();
    if (G.round === 1 && !G.tutDone) { G.tutDone = true; try { if (!localStorage.getItem('zoo_tut')) G.tutPending = performance.now() + 1200; } catch (e) {} }
  } else if (ph === 'combat') {
    $('cmdbar').hidden = !G.rules.commands;
    for (const b of document.querySelectorAll('.cmd')) b.disabled = false;
    if (METER.on) $('meter').hidden = false;
    renderWeatherChip(); eggCombatStart();
  } else if (ph === 'result') {
    $('cmdbar').hidden = true;
    const r = G.lastResult, t = myTeam();
    if (r.pve && r.win[t] && isBoss(G.round)) questEvent('boss');
    if (r.win[t]) { sfx('win'); avatarMood('win'); } else if (!r.pve) { sfx('lose'); avatarMood('sad'); } else sfx('coin');
    renderMeter(true);
    if (r.ark) toast('最後的方舟：這次敗北不扣血', 2000);
  } else if (ph === 'over') {
    recordMatch();
    PROFILE.games++; const win = G.winner === myTeam(); if (win) PROFILE.wins++;
    const prism = G.players[ME].augs.filter(a => AUG[a].tier === 3).length;
    saveProfile();
    if (win) unlockSkin('gold');
    if (PROFILE.games >= 3) unlockSkin('night');
    if (win && G.teams[myTeam()].hp >= 50) unlockSkin('sakura');
    if (prism >= 2) unlockSkin('jade');
    sfx(win ? 'win' : 'lose');
    $('cmdbar').hidden = true;
  }
}

// ---- 每幀 ----
function featuresFrame(dt) {
  if (!G) return;
  const now = performance.now();
  recordMatch(); tutFrame();
  // 選擇視窗：傳送門、選秀、隊長抉擇
  const P = G.players[ME];
  if (G.portalVote && !P.vote) showPortal();
  else if (G.draft) showDraft();
  else if (G.encounter && G.encounter.pending && (G.encounter.pendingTeams || []).includes(P.team) && G.teams[P.team].captain === ME) showCaptain();
  else { const m = $('modal2'); if (m && !m.hidden && ['portal', 'draft', 'captain'].includes(m.dataset.k)) closeModal(); }
  // 統計
  if (METER.on && now - METER.last > 300 && (G.phase === 'combat' || G.phase === 'result' || REPLAY)) renderMeter();
  // 天氣粒子
  weatherFx(dt);
  // 指令按鈕
  if (G.phase === 'combat' && cv && !cv.replay) { const used = cv.B.cmdUsed && cv.B.cmdUsed[ME]; for (const b of document.querySelectorAll('.cmd')) b.disabled = !!used; }
  avatarFrame(dt); eggChickPose(); eggsFrame(dt); ladderFrame();
  pingLabels();
  if (G.tutPending && performance.now() > G.tutPending && !G.portalVote && $('overlay').hidden && (!$('modal2') || $('modal2').hidden)) { G.tutPending = 0; startTutorial(); }
  $('stage').classList.toggle('heat', G.weather === 'heat' && (G.phase === 'combat' || G.phase === 'prep'));
}

// ---- 事件音效 ----
function featuresEvent(B, ev) {
  switch (ev.k) {
    case 'atk': { const u = B.units[ev.id]; if (!u) break; const fx = ((ACT[u.key] || {}).atk || {}).fx || ''; if (!fxSound(fx, 60)) sfx(ev.rg ? 'pew' : /claw|bite/.test(fx) ? (fx.indexOf('bite') >= 0 ? 'bite' : 'claw') : 'thud', 60); break; }
    case 'skill': { const u = B.units[ev.id]; if (!u) break; const fx = ((ACT[u.key] || {}).skill || {}).fx || ''; // 放技能：動物自己的叫聲＋技能音效
      if (u.key === 'lion') sfx('roar', 80); else if (u.key === 'wolf') sfx('howl', 80); else if (u.key === 'elephant') sfx('boom', 80); else { voice(u.key); sfx('skill', 80); }
      setTimeout(() => fxSound(fx, 80), 120); break; }
    case 'dmg': if (ev.c) sfx('crit', 70); else if (ev.ty === 'magic' && ev.sk) sfx('magic', 90); else sfx('hitTick', 90); break;
    case 'die': sfx('death', 60); break;
    case 'combo': sfx('combo'); break;
    case 'zone': if (ev.kind === 'meteor') sfx('boom'); else if (ev.kind === 'water') sfx('splash'); break;
    case 'cmd': { const P = G.players[ev.owner]; sfx('cmd'); if (ev.owner === ME || (P && P.team === myTeam())) banner(`${P.name}：${COMMANDS[ev.type].name}！`, COMMANDS[ev.type].desc); for (const u of B.units) if (u.alive && u.owner === ev.owner) { const p = posOf(kOf(u), 0.3); if (p) burst(p, 5, { tex: 'spark', color: ev.type === 'charge' ? 0xff8a5a : ev.type === 'rally' ? 0x8ab8ff : 0x9be07a, scale: 0.13, speed: 0.6, up: 2, g: 0, add: true }); } break; }
    case 'aug': sfx('zap', 120); break;
    case 'night': sfx('howl'); break;
  }
  if (ev.k === 'dmg' && ev.prey) { const u = B.units[ev.id]; if (u) s3Num(kOf(u), '天敵！', 'prey', 0.05); }
}

// ---- 日誌 ----
// ---- 快捷表情 ----
const EMOTES = [['👍', '讚'], ['😂', '哈哈'], ['😱', '嚇死'], ['💪', '加油'], ['🙏', '拜託'], ['🤝', 'GG'], ['😤', '不服'], ['❤️', '愛你']];
function showEmote(L) {
  const box = $('emoBubbles'); if (!box || !EMOTES[L.id]) return;
  const P = G.players[L.pid]; if (!P) return;
  const d = document.createElement('div'); d.className = 'emob' + (L.pid === ME ? ' me' : P.team === myTeam() ? ' mate' : '');
  d.innerHTML = `<i>${EMOTES[L.id][0]}</i><span>${esc(L.pid === ME ? '你' : P.name)}</span>`; box.appendChild(d); sfx('emote', 150);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => d.remove(), 3200);
  if (L.pid === ME && AVATARS) { const a = AVATARS[0]; a.mood = 'win'; a.moodUntil = nowS() + 1.2; } // 小小英雄跟著做動作
}
// ---- 血量走勢圖 ----
function openHpChart() {
  const H = (G.hpHist || []).slice(); H.unshift(G.teams.map(() => CFG.TEAM_HP));
  const W = 320, Ht = 170, pad = 24, n = Math.max(2, H.length), max = CFG.TEAM_HP;
  const X = i => pad + (W - pad - 8) * i / (n - 1), Y = v => 8 + (Ht - 8 - pad) * (1 - Math.max(0, v) / max);
  const lines = G.teams.map((T, t) => `<polyline fill="none" stroke="${teamColor(t)}" stroke-width="${t === myTeam() ? 3 : 2}" stroke-linejoin="round" points="${H.map((r, i) => X(i).toFixed(1) + ',' + Y(r[t]).toFixed(1)).join(' ')}"/>`).join('');
  const grid = [0, 25, 50, 75, 100].map(v => `<line x1="${pad}" x2="${W - 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="#d9cbb8" stroke-width="1"/><text x="2" y="${Y(v) + 4}" font-size="10" fill="#8a7a6a">${v}</text>`).join('');
  const legend = G.teams.map((T, t) => `<span><i style="background:${teamColor(t)}"></i>${esc(teamLabel(t))} ${Math.max(0, T.hp)}</span>`).join('');
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>血量走勢</h2><svg viewBox="0 0 ${W} ${Ht}" class="hpchart">${grid}${lines}<text x="${W / 2}" y="${Ht - 4}" font-size="10" fill="#8a7a6a" text-anchor="middle">回合</text></svg><div class="hplegend">${legend}</div>`;
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; };
}
// ---- 小小英雄：場邊走動、我隊受傷時有反應 ----
function avatarHurt() { if (!AVATARS) return; const a = AVATARS[0]; a.hurtT = nowS(); a.mood = 'sad'; a.moodUntil = nowS() + 2; }
function featuresLog(L) {
  const mine = L.pid === ME;
  switch (L.k) {
    case 'emote': showEmote(L); break;
    case 'buy': if (mine) sfx('buy'); break;
    case 'sell': if (mine) sfx('sell'); break;
    case 'reroll': if (mine) { sfx('reroll'); questEvent('roll'); } break;
    case 'merge': if (mine) { sfx(L.star >= 3 ? 'star3' : 'star'); if (L.star >= 3) { PROFILE.three++; saveProfile(); unlockSkin('snow'); questEvent('three'); setTimeout(() => banner(`進化！${EVOLVE[L.key] || ''}`, '生命攻擊 +20%、技能 +30%', 'win'), 600); } } break;
    case 'aug': if (mine) sfx('aug'); break;
    case 'craft': case 'equip': if (mine) sfx('coin'); break;
    case 'portal': { const p = PORTALS.find(x => x.id === L.id); banner(`傳送門：${p.name}`, p.desc); sfx('aug'); break; }
    case 'encounter': { const e = ENCOUNTERS.find(x => x.id === L.id); setTimeout(() => { banner(`遭遇：${e.name}`, e.id === 'migration' ? `本回合商店只出「${TRAITS[L.trait].name}」動物` : e.desc); sfx('draft'); }, 1500); break; }
    case 'captainChoice': if (L.team === myTeam()) toast(`隊長選擇了：${L.choice === 'gold' ? '每人 +4 金' : '每人 1 件成品裝備'}`, 2000); break;
    case 'draft': sfx('draft'); break;
    case 'drafted': if (mine) { sfx('buy'); toast(`選到 ${ANIMALS[L.key].name}＋${itemDef(L.item).name}`); } break;
    case 'loot': if (mine) { sfx('chest', 400); const d = L.d; lootToast.push(d.type === 'gold' ? `${d.n} 金` : d.type === 'unit' ? ANIMALS[d.k].name : itemDef(d.k).name); clearTimeout(lootToast.h); lootToast.h = setTimeout(() => { if (lootToast.length) toast('戰利品：' + lootToast.join('、'), 2400); lootToast.length = 0; }, 400); sfx('coin'); } break;
    case 'consume': if (mine) { sfx('star'); toast(`使用了${CONSUMABLES[L.item].name}`); } break;
    case 'bank': if (mine) sfx('coin'); break;
    case 'captain': toast(`隊長換成 ${G.players[L.to].name}`); break;
    case 'ping': showPing(L); break;
    case 'swap': if (L.pid === ME && L.mate) toast('移動了電腦隊友的棋子（它會記住這個位置）'); break;
    case 'aichat': if (L.to === ME) toast(`${G.players[L.pid].name}：${L.text}`, 2600); break;
    case 'pingfail': if (L.pid === ME) toast(`${G.players[L.to].name}：我的商店沒有${ANIMALS[L.key].name}`); break;
    case 'gain': if (mine) sfx('star'); break;
  }
}
const lootToast = [];

// ---- 操作區額外內容：金庫與隊長 ----
function featuresDock() {
  const T = G.teams[myTeam()], cap = G.players[T.captain];
  const m = $('mate');
  if (!$('bank')) m.insertAdjacentHTML('afterend', '<div class="bank" id="bank"></div>');
  $('bank').hidden = !!G.solo; if (G.solo) return; // 單人模式沒有隊伍金庫與隊長
  $('bank').innerHTML = `<span class="cap">隊長：${T.captain === ME ? '你' : cap.name}</span><span class="bk">隊伍金庫 <b>${T.bank}</b>${T.bankInt ? `<small>（利息 +${T.bankInt}）</small>` : ''}</span><button class="btn" data-bank="dep">存 1</button><button class="btn" data-bank="wd">取 1</button>`;
  $('bank').onclick = e => { const b = e.target.closest('[data-bank]'); if (!b) return; doAct({ t: b.dataset.bank === 'dep' ? 'deposit' : 'withdraw', n: 1 }); };
  // 海克斯三選一加上重抽鈕
  const P = G.players[ME];
  if (P.augChoice) document.querySelectorAll('.augcard').forEach((c, i) => { if (!c.querySelector('.reroll')) c.insertAdjacentHTML('beforeend', `<span class="reroll ${P.augRolled[i] ? 'used' : ''}" data-aroll="${i}">${P.augRolled[i] ? '已重抽' : '重抽'}</span>`); });
}
document.addEventListener('click', e => {
  const r = e.target.closest('[data-aroll]'); if (!r || r.classList.contains('used')) return;
  e.stopPropagation();
  if (actMe({ t: 'augroll', i: +r.dataset.aroll }) === 'ok') { sfx('reroll'); $('augModal').dataset.k = ''; renderAugs(); featuresDock(); }
}, true);

// ---- 傷害統計 ----
function renderMeter(force) {
  METER.last = performance.now();
  const el = $('meter'); if (!el || el.hidden) return;
  const B = REPLAY ? REPLAY.B : cv ? cv.B : (G.battles[0] && (G.battles.find(b => b.teams.includes(myTeam())) || {}).B);
  if (!B) { el.innerHTML = '<div class="mt-h">戰鬥開始後顯示</div>'; return; }
  const vt = cv ? cv.vt : (B.pve ? 0 : myTeam());
  const key = { dmg: 'dmgDone', tank: 'dmgTaken', heal: 'healed' }[METER.tab];
  const list = B.units.filter(u => u.team === vt && !u.neutral && (u.owner >= 0)).map(u => ({ u, v: u[key] || 0 })).sort((a, b) => b.v - a.v).slice(0, 10);
  const max = Math.max(1, ...list.map(x => x.v));
  el.innerHTML = `<div class="mt-tabs">${[['dmg', '輸出'], ['tank', '承傷'], ['heal', '治療']].map(([k, n]) => `<button data-mt="${k}" class="${METER.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>` +
    list.map(x => `<div class="mt-row"><img src="${PORT[x.u.key] || ''}" alt=""><div class="mt-bar"><i style="width:${(x.v / max * 100).toFixed(1)}%;background:${ownerColor(x.u.owner) || '#999'}"></i><span>${(ANIMALS[x.u.key] || EXTRA[x.u.key]).name}${'★'.repeat(x.u.star)}</span></div><b>${x.v}</b></div>`).join('');
}

// ---- 選單 ----
function openMenu(sub) {
  const P = G.players[ME], T = G.teams[P.team];
  const slots = [1, 2, 3].map(i => { let has = false; try { has = !!localStorage.getItem('zoo_form' + i); } catch (e) {} return `<div class="mrow"><span>陣容 ${i}</span><button class="btn" data-m="save${i}">存檔</button><button class="btn" data-m="load${i}" ${has ? '' : 'disabled'}>一鍵擺陣</button></div>`; }).join('');
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>選單</h2>
    <div class="menu">
      <div class="mrow"><span>戰鬥速度</span>${[0.5, 1, 2].map(s => `<button class="btn ${G.speed === s ? 'primary' : ''}" data-m="spd${s}">${s}×</button>`).join('')}</div>
      <div class="mrow"><span>上一場戰鬥</span><button class="btn" data-m="replay" ${G.battles.length && G.phase === 'prep' ? '' : 'disabled'}>回放</button></div>
      <div class="mrow"><span>資訊</span><button class="btn" data-m="hp">血量走勢</button><button class="btn" data-m="pool">卡池與機率</button><button class="btn" data-m="scout">偵察敵隊</button><button class="btn" data-m="dex">圖鑑</button></div>
      ${slots}
      ${G.solo ? '' : `<div class="mrow"><span>隊伍</span><button class="btn" data-m="captain" ${T.captain === ME ? '' : 'disabled'}>把隊長交給隊友</button></div>`}
      <div class="mrow"><span>AI 代打</span><button class="btn ${P.ai ? 'primary' : ''}" data-m="ai">${P.ai ? '代打中（點一下取回）' : '讓 AI 幫我打'}</button></div>
      <div class="mrow"><span>音效</span><input type="range" min="0" max="1" step="0.05" value="${AUD.set.sfx}" id="volS" aria-label="音效音量"><span>配樂</span><input type="range" min="0" max="1" step="0.05" value="${AUD.set.mus}" id="volM" aria-label="配樂音量"><button class="btn" data-m="mute">${AUD.set.mute ? '取消靜音' : '靜音'}</button></div>
      ${bgmSelectHtml()}
      <div class="mrow"><span>其他</span><button class="btn" data-m="tut">新手教學</button><button class="btn" data-m="surrender" id="btnSur">投降</button></div>
    </div>`;
  $('overlay').hidden = false;
  $('mX').onclick = () => { $('overlay').hidden = true; };
  $('volS').oninput = e => { AUD.set.sfx = +e.target.value; audApply(); audSave(); };
  $('volM').oninput = e => { AUD.set.mus = +e.target.value; audApply(); audSave(); };
  bgmSelectBind();
  $('panel').querySelector('.menu').onclick = e => {
    const b = e.target.closest('[data-m]'); if (!b) return; const m = b.dataset.m; sfx('click');
    if (m.startsWith('spd') && NET.role === 'client') { toast('連線中只有房主能調整戰鬥速度'); }
    else if (m.startsWith('spd')) { G.speed = +m.slice(3); toast(`戰鬥速度 ${G.speed}×`); openMenu(); }
    else if (m === 'replay') { $('overlay').hidden = true; startReplay(); }
    else if (m === 'pool') openPool();
    else if (m === 'hp') openHpChart();
    else if (m === 'scout') openScout();
    else if (m === 'dex') showDex();
    else if (m.startsWith('save')) { saveFormation(+m.slice(4)); openMenu(); }
    else if (m.startsWith('load')) { $('overlay').hidden = true; loadFormation(+m.slice(4)); }
    else if (m === 'captain') { doAct({ t: 'captain' }); openMenu(); }
    else if (m === 'ai') { const was = P.ai; actMe({ t: 'aitoggle' }); if (NET.role !== 'client') { processLog(); refresh(); } toast(!was ? 'AI 代打中，隨時可以取回' : '你取回了控制權'); openMenu(); }
    else if (m === 'mute') { AUD.set.mute = !AUD.set.mute; audApply(); audSave(); openMenu(); }
    else if (m === 'tut') { $('overlay').hidden = true; startTutorial(); }
    else if (m === 'surrender') { if (b.dataset.sure) { $('overlay').hidden = true; actMe({ t: 'surrender' }); setTimeout(() => leaveToLobby(true), NET.role ? 500 : 50); /* 投降後直接回到選模式的大廳 */ } else { b.dataset.sure = 1; b.textContent = '再按一次確定投降'; b.classList.add('primary'); } }
  };
}

// ---- 卡池與機率 ----
function openPool() {
  const P = G.players[ME];
  const odds = Object.keys(CFG.SHOP_ODDS).map(l => `<tr class="${+l === P.level ? 'on' : ''}"><td>Lv.${l}</td>${CFG.SHOP_ODDS[l].map(v => `<td>${v}%</td>`).join('')}</tr>`).join('');
  const pools = [1, 2, 3, 4, 5].map(c => `<div class="pgrp"><b style="color:${COST_COL[c]}">${c} 費（每隻 ${CFG.POOL[c]} 張）</b><div class="plist">${Object.keys(ANIMALS).filter(k => ANIMALS[k].cost === c).map(k => `<div class="pitem ${G.pool[k] <= 0 ? 'out' : ''}">${pimg(k)}<span>${ANIMALS[k].name}</span><b>${G.pool[k]}</b></div>`).join('')}</div></div>`).join('');
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>卡池與機率</h2><div class="dex"><div class="plain" style="display:block;overflow-x:auto"><table class="odds"><tr><th>等級</th><th>1 費</th><th>2 費</th><th>3 費</th><th>4 費</th><th>5 費</th></tr>${odds}</table></div>${pools}</div>`;
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; };
}

// ---- 偵察敵隊 ----
function openScout() {
  if (!G) return;
  const ets = G.teams.map((T, i) => i).filter(i => i !== myTeam() && !G.teams[i].out);
  const fire = s => s >= 2 ? `<span class="fire">連勝 ${s}</span>` : s <= -2 ? `<span class="fire ice">連敗 ${-s}</span>` : '';
  const ps = et => G.players.filter(p => p.team === et).map(p => `<div class="scout"><h3>${p.name}　Lv.${p.level}　${p.gold} 金</h3>
    <div class="sline">場上 ${boardCount(G, p.id)} 隻・裝備欄 ${p.items.length} 件${p.augs.length ? '・增幅：' + p.augs.map(a => augIcon(a)).join('') : ''}</div>
    <div class="sbench">${p.bench.filter(Boolean).map(u => `<span>${pimg(u.key)}<i>${'★'.repeat(u.star)}</i></span>`).join('') || '<small>備戰席空的</small>'}</div></div>`).join('');
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>偵察敵隊</h2>` + ets.map(et => { const T = G.teams[et]; return `<h3>${teamLabel(et)}</h3><p>團隊血量 ${Math.max(0, T.hp)}　${fire(T.streak)}　金庫 ${T.bank}</p>${ps(et)}`; }).join('');
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; };
}

// ---- 快捷鍵 ----
function onHotkey(e) {
  if (!G || $('game').hidden || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { $('overlay').hidden = true; sel = null; renderSheet(); closeModal(); $('pingmenu').hidden = true; return; }
  if (!$('overlay').hidden) return;
  if (k === 'd') { doAct({ t: 'reroll' }); e.preventDefault(); }
  else if (k === 'f') { doAct({ t: 'level' }); e.preventDefault(); }
  else if (k === 'e') { const key = S3.hoverK || (sel && sel.type === 'unit' ? 'u' + sel.uid : null); if (key && key[0] === 'u') { const f = findUnit(+key.slice(1)); if (f && f.u.owner === ME) { doAct({ t: 'sell', uid: f.u.uid }); sel = null; renderSheet(); } } }
  else if (k === ' ') { if (G.phase === 'prep') { actMe({ t: 'ready' }); renderDock(); } e.preventDefault(); }
  else if (/^[1-5]$/.test(k)) { const c = document.querySelector(`[data-slot="${+k - 1}"]`); if (c) c.click(); }
  else if (k === 'q') { const t = ['charge', 'rally', 'hold']; actMe({ t: 'cmd', type: t[0] }); }
}

// ---- 陣容存檔 ----
function saveFormation(i) {
  const t = myTeam(), list = [];
  for (const k in G.board) { const u = G.board[k]; if (u.owner !== ME) continue; const [c, r] = cellRC(+k), [lc, lr] = toLocal(SIDE(t), c, r); list.push({ key: u.key, star: u.star, lc, lr, w: CFG.COLS, h: CFG.ROWS_HALF }); }
  try { localStorage.setItem('zoo_form' + i, JSON.stringify(list)); } catch (e) {}
  toast(`陣容 ${i} 已存檔（${list.length} 隻）`);
}
function loadFormation(i) {
  if (G.phase !== 'prep') { toast('準備階段才能擺陣'); return; }
  let list = []; try { list = JSON.parse(localStorage.getItem('zoo_form' + i) || '[]'); } catch (e) {}
  const t = myTeam(), used = {}; let n = 0;
  for (const it of list) {
    const cand = ownUnits(G, ME).filter(o => o.u.key === it.key && !used[o.u.uid]).sort((a, b) => Math.abs(a.u.star - it.star) - Math.abs(b.u.star - it.star))[0];
    if (!cand) continue;
    used[cand.u.uid] = 1;
    const lc = it.lc + (CFG.COLS - (it.w || 7)) / 2, lr = it.lr + (CFG.ROWS_HALF - (it.h || 4)); // 舊存檔（7×8）換算到現在的棋盤：左右置中、前排對齊
    if (lc < 0 || lc >= CFG.COLS || lr < 0 || lr >= CFG.ROWS_HALF) continue;
    const [gc, gr] = toGlobal(SIDE(t), lc, lr);
    if (actMe({ t: 'move', uid: cand.u.uid, to: { zone: 'board', cell: teamCell(t, gr * CFG.COLS + gc) } }) === 'ok') n++;
  }
  processLog(); renderPrep(); sfx('place');
  toast(n ? `依陣容 ${i} 擺好 ${n} 隻` : '沒有符合陣容的棋子');
}

// ---- 圖鑑：技能展示（在大廳開一個小戰場，讓這隻動物連放幾次技能）----
// 可調：DEMO_CFG.STAR 星級、SEC 展示秒數、MANA 放技能需要的怒氣（越小放越多次）、FOES 假人數量與血量
const DEMO_CFG = { STAR: 2, SEC: 9, MANA: 25, FOES: 3, FOE_HP: 9000 };
function skillDemo(key) {
  if (G && !$('game').hidden && !(REPLAY && REPLAY.demo)) { toast('比賽中不能播放，回大廳再看', 1800); return; }
  if (REPLAY) endReplay();
  ME = 0; netReset(); newGame(2, true);
  G.rules.augments = false; G.rules.encounters = false; G.rules.carousel = false; G.encounter = null; G.portal = null; G.portalVote = null; G.demo = true; G.timer = 999000;
  $('overlay').hidden = true;
  const units = [{ key, star: DEMO_CFG.STAR, owner: 0, team: 0, c: toGlobal(0, 4, 2)[0], r: toGlobal(0, 4, 2)[1], items: [] }];
  for (let i = 0; i < DEMO_CFG.FOES; i++) { const [c, r] = toGlobal(1, 3 + i, i === 1 ? 3 : 4); units.push({ key: 'boar', star: 1, owner: -1, team: 1, c, r, items: [] }); }
  const B = createBattle({ seed: 7, terrain: {}, height: {}, units, pve: true, weather: 'sunny' });
  for (const u of B.units) { if (u.team === 1) { u.maxhp = u.hp = DEMO_CFG.FOE_HP; u.atk = 1; } else { u.manaMax = DEMO_CFG.MANA; u.mana = DEMO_CFG.MANA; } }
  for (const k in S3.V) if (k[0] === 'b') s3Remove(k);
  REPLAY = { B, acc: 0, end: 0, demo: key, t: 0 }; S3.demoK = 'b' + B.units.find(u => u.team === 0).id;
  cv = { bt: { B, teams: [0, 1] }, B, vt: 0, zonePos: {}, lastCell: {}, replay: true };
  G.paused = true; G.speed = 1; sel = null; $('game').classList.add('demo'); lastPhase = G.phase; lastRound = G.round; // 不要觸發換階段的處理（會清掉展示戰場）
  s3SetArena(G.arena); $('stage').dataset.arena = G.arena; s3SetTerrain(B.terrain, 0, B.temp, B.height); refresh();
  $('stage').insertAdjacentHTML('beforeend', `<div class="replaybar" id="replaybar">${ANIMALS[key].name}・${ANIMALS[key].skill}<button class="btn" id="rpSlow">慢動作</button><button class="btn" id="rpNorm">1×</button><button class="btn primary" id="rpEnd">回圖鑑</button></div>`);
  $('rpSlow').onclick = () => { G.speed = 0.4; }; $('rpNorm').onclick = () => { G.speed = 1; }; $('rpEnd').onclick = () => endReplay();
}
// 全部按鈕按下都有「啵」；面板打開／關閉各有音效
document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('button, .btn, [data-slot]')) { audInit(); sfx('click', 70); } }, true);
{ const ov = document.getElementById('overlay'); if (ov && window.MutationObserver) { let was = ov.hidden; new MutationObserver(() => { if (ov.hidden !== was) { was = ov.hidden; sfx(was ? 'panelClose' : 'panelOpen', 120); } }).observe(ov, { attributes: true, attributeFilter: ['hidden'] }); } }
// 背景音樂自動選曲：大廳＝lobby；塔防＝td；魔王回合戰鬥＝boss；我方環境羈絆湊到最高階＝生態圈專屬曲；戰鬥＝battle；準備＝場地曲
const ECO_TRAITS = ['forest', 'savanna', 'water', 'sky'];
function ecoActive() { // 回傳湊到最高階的環境羈絆（只看自己這邊）
  if (!G) return null; let tc = null;
  if (cv && cv.B && MYB && MYB.mine) tc = cv.B['traits' + cv.vt];
  if (!tc) try { tc = traitCounts(battleUnitsForTeam(G, myTeam(), 0), 0); } catch (e) {}
  if (!tc) return null;
  for (const t of ECO_TRAITS) { const x = tc[t], T = TRAITS[t]; if (x && T && x.tier >= T.tiers.length - 1) return t; }
  return null;
}
function bgmSelectHtml(vol) { return `${vol ? `<div class="mrow bgmrow"><span>音效</span><input type="range" min="0" max="1" step="0.05" value="${AUD.set.sfx}" id="volS2" aria-label="音效音量"><span>配樂</span><input type="range" min="0" max="1" step="0.05" value="${AUD.set.mus}" id="volM2" aria-label="配樂音量"></div>` : ''}<div class="mrow bgmrow"><span>背景音樂</span><select id="bgmSel" aria-label="背景音樂">${BGM_PICK.map(([k, n]) => `<option value="${k}" ${(AUD.set.bgm || 'auto') === k ? 'selected' : ''}>${n}</option>`).join('')}</select><label class="ecochk"><input type="checkbox" id="bgmEco" ${AUD.set.eco ? 'checked' : ''}>生態圈換專屬曲</label></div>`; }
function bgmSelectBind() { const s = $('bgmSel'), c = $('bgmEco'), vs = $('volS2'), vm = $('volM2'); if (vs) vs.oninput = e => { AUD.set.sfx = +e.target.value; audApply(); audSave(); }; if (vm) vm.oninput = e => { AUD.set.mus = +e.target.value; audApply(); audSave(); }; if (s) s.onchange = () => { AUD.set.bgm = s.value; audSave(); BGM.matchKey = ''; audInit(); bgmAuto(); }; if (c) c.onchange = () => { AUD.set.eco = c.checked; audSave(); }; }
// 選曲規則（v0.13.1）：同一場比賽從頭到尾同一首，不因準備／戰鬥切換；可在設定裡指定固定曲目或關閉
const BGM_PICK = [['auto', '依場地（整場不換）'], ['lobby', '輕快拍手'], ['jungle', '叢林'], ['desert', '熱帶鼓'], ['city', '8-bit 巴薩'], ['battle', '晶片冒險'], ['td', '開心冒險'], ['eco_water', '海底'], ['eco_sky', '天空'], ['off', '關閉']];
function bgmAuto() {
  if (!AUD.ctx) return;
  const pick = AUD.set.bgm || 'auto';
  if (pick === 'off') { bgmPlay(''); musicStop(); return; }
  const inGame = G && !$('game').hidden && !(REPLAY && REPLAY.demo);
  if (!inGame) { bgmPlay(pick === 'auto' ? 'lobby' : pick); return; }
  const mk = (G.seed || 0) + ':' + pick; // 連線時 G 會被伺服器快照換掉，所以記在外面
  if (BGM.matchKey !== mk) { BGM.matchKey = mk; BGM.matchTrack = pick !== 'auto' ? pick : G.td ? 'td' : (G.arena || 'jungle'); } // 開局決定，整場不換
  let key = BGM.matchTrack;
  if (AUD.set.eco && pick === 'auto') { const eco = ecoActive(); if (eco) key = 'eco_' + eco; }
  bgmPlay(key, G.arena);
}
setInterval(() => { try { bgmAuto(); } catch (e) {} }, 500);
// ---- 回放 ----
function startReplay() {
  const bt = G.battles.find(b => b.teams.includes(myTeam())); if (!bt || !bt.input) return;
  const B = createBattle(JSON.parse(JSON.stringify(bt.input)));
  for (const k in S3.V) if (k[0] === 'b') s3Remove(k);
  REPLAY = { B, acc: 0, end: 0 };
  cv = { bt: { B, teams: bt.teams }, B, vt: bt.teams[0] === myTeam() ? 0 : 1, zonePos: {}, lastCell: {}, replay: true };
  G.paused = true; sel = null; renderSheet();
  s3SetTerrain(B.terrain, cv.vt, B.temp, B.height);
  $('stage').insertAdjacentHTML('beforeend', '<div class="replaybar" id="replaybar">回放中<button class="btn" id="rpSlow">0.5×</button><button class="btn" id="rpNorm">1×</button><button class="btn primary" id="rpEnd">結束回放</button></div>');
  $('rpSlow').onclick = () => { G.speed = 0.5; }; $('rpNorm').onclick = () => { G.speed = 1; }; $('rpEnd').onclick = () => endReplay();
  banner('戰鬥回放', '可調整速度'); $('meter').hidden = !METER.on;
}
function replayFrame(dt) {
  const R = REPLAY;
  if (R.demo) { R.t += dt * (G.speed || 1); if (R.t > DEMO_CFG.SEC) { endReplay(); return; } for (const u of R.B.units) if (u.team === 1) u.hp = Math.max(u.hp, u.maxhp * 0.3); } // 假人不會死
  if (!R.B.over) { R.acc += dt * 1000 * (G.speed || 1); while (R.acc >= CFG.TICK_MS && !R.B.over) { R.acc -= CFG.TICK_MS; step(R.B); } }
  else { R.end += dt; if (R.end > 2.5) { endReplay(); return; } }
  combatSync(); handleBattleEvents(cv.bt);
}
function endReplay() {
  if (!REPLAY) return;
  const demo = REPLAY.demo; S3.demoK = null;
  REPLAY = null; G.paused = false; const b = $('replaybar'); if (b) b.remove();
  for (const k in S3.V) if (k[0] === 'b') s3Remove(k);
  cv = null; S3.nightTarget = 0;
  $('game').classList.remove('demo');
  if (demo) { leaveToLobby(); showDex('animals'); return; }
  renderPrep();
}

// ---- 技能預覽 ----
function previewSkill(uid) {
  const f = findUnit(uid); if (!f) return;
  const k = 'u' + uid, v = S3.V[k]; if (!v) return;
  const kind = 'skill', A = (ACT[f.u.key] || {})[kind]; if (!A) return;
  let tk; let bd = 1e9; for (const kk in S3.V) { const o = S3.V[kk]; if (kk === k || !o.info || !o.info.enemy) continue; const d = o.pos.distanceTo(v.pos); if (d < bd) { bd = d; tk = kk; } }
  v.act = { kind, t0: nowS(), dur: A.dur }; sfx('skill');
  s3Num(k, ANIMALS[f.u.key].skill, 'skill', 0, 15);
  at(A.dur * A.hit, () => playFx(A.fx, k, tk, { zone: tk ? S3.V[tk].pos.clone().setY(0.2) : v.pos.clone().add(V3(0, 0.2, -1.5)) }));
}

// ---- 傳送門投票 ----
function showPortal() {
  const m = $('modal2'); if (m && !m.hidden && m.dataset.k === 'portal') return;
  const opts = G.portalVote.options.map(id => PORTALS.find(p => p.id === id));
  const mm = modal(`<div class="mbox"><h2>選擇傳送門</h2><p class="sub">大家投票決定這局的特殊規則，倒數結束還沒投就自動決定：剩 <b class="cdT">${Math.ceil(Math.max(0, G.timer) / 1000)}</b> 秒</p><div class="mcards">${opts.map(p => `<button class="mcard portal" data-vote="${p.id}"><b>${p.name}</b><span>${p.desc}</span></button>`).join('')}</div></div>`);
  mm.dataset.k = 'portal';
  mm.onclick = e => { const b = e.target.closest('[data-vote]'); if (!b) return; actMe({ t: 'vote', id: b.dataset.vote }); sfx('click'); closeModal(); };
}
// ---- 選秀 ----
function showDraft() {
  const D = G.draft, turn = D.order[D.idx], key = 'draft' + D.idx;
  const m = $('modal2'); if (m && !m.hidden && m.dataset.k === 'draft' && m.dataset.idx === String(D.idx)) return;
  const mine = turn === ME;
  const mm = modal(`<div class="mbox"><h2>選秀轉盤</h2><p class="sub">${mine ? '輪到你了！挑一隻帶著裝備的動物。' : `等待 ${G.players[turn].name} 選擇…`}</p>
    <div class="dorder">${D.order.map((pid, i) => `<span class="${i === D.idx ? 'now' : i < D.idx ? 'done' : ''}" style="--c:${ownerColor(pid)}">${G.players[pid].name}</span>`).join('')}</div>
    <div class="dgrid">${D.options.map((o, i) => `<button class="dcard ${o.taken !== false ? 'taken' : ''}" data-dpick="${i}" ${mine && o.taken === false ? '' : 'disabled'}>${pimg(o.key)}<b>${ANIMALS[o.key].name}<small style="color:${COST_COL[ANIMALS[o.key].cost]}">${ANIMALS[o.key].cost}費</small></b><span class="dit">${iconItem(o.item)}${itemDef(o.item).name}</span>${o.taken !== false ? `<em>${G.players[o.taken].name}</em>` : ''}</button>`).join('')}</div></div>`, 'draft');
  mm.dataset.k = 'draft'; mm.dataset.idx = String(D.idx);
  mm.onclick = e => { const b = e.target.closest('[data-dpick]'); if (!b || b.disabled) return; if (actMe({ t: 'draft', i: +b.dataset.dpick }) === 'ok') { processLog(); renderPrep(); } };
}
// ---- 隊長抉擇 ----
function showCaptain() {
  const m = $('modal2'); if (m && !m.hidden && m.dataset.k === 'captain') return;
  const mm = modal(`<div class="mbox"><h2>隊長的抉擇</h2><p class="sub">你是隊長，替全隊決定：（剩 <b class="cdT">${Math.ceil(Math.max(0, G.timer) / 1000)}</b> 秒，沒選就自動選第一個）</p><div class="mcards"><button class="mcard" data-cap="gold"><b>每人 +4 金</b><span>馬上可以花</span></button><button class="mcard" data-cap="item"><b>每人 1 件成品裝備</b><span>隨機成品</span></button></div></div>`);
  mm.dataset.k = 'captain';
  mm.onclick = e => { const b = e.target.closest('[data-cap]'); if (!b) return; actMe({ t: 'encounter', choice: b.dataset.cap }); processLog(); renderPrep(); closeModal(); };
}

// ---- 天氣 ----
function renderWeatherChip() { const w = WEATHER[G.weather] || WEATHER.sunny; $('wchip').innerHTML = `<b>${w.name}</b>${G.weather !== 'sunny' ? `<small>${w.desc}</small>` : ''}`; $('wchip').hidden = !G.rules.weather; }
let wAcc = 0;
function weatherFx(dt) {
  if (!G || !G.rules.weather || $('game').hidden) return;
  wAcc += dt; const w = G.weather;
  if (w === 'rain' && wAcc > 0.03) { wAcc = 0; for (let i = 0; i < 3; i++) sprite('shard', V3((Math.random() - 0.5) * 12, 6, (Math.random() - 0.5) * 11), { color: 0xbfe2ff, scale: 0.18, scale1: 0.18, sx: 0.25, life: 0.7, vel: V3(-1, -9, 0), g: 0, opacity: 0.55 }); }
  else if (w === 'fog' && wAcc > 0.35) { wAcc = 0; sprite('puff', V3(-8, 0.5 + Math.random(), (Math.random() - 0.5) * 9), { color: 0xffffff, scale: 2.5, scale1: 3.5, life: 7, vel: V3(2.2, 0, 0), g: 0, opacity: 0.25, fadeIn: 0.2 }); }
  else if (w === 'sand' && wAcc > 0.06) { wAcc = 0; sprite('puff', V3(-7, 0.3 + Math.random() * 1.5, (Math.random() - 0.5) * 9), { color: 0xe8c48a, scale: 0.6, scale1: 1.2, life: 2, vel: V3(7, 0.2, 0), g: 0, opacity: 0.45 }); }
  else if (w === 'heat' && wAcc > 0.4) { wAcc = 0; sprite('puff', V3((Math.random() - 0.5) * 7, 0.1, (Math.random() - 0.5) * 7), { color: 0xffd0a0, scale: 0.6, scale1: 1.4, life: 2, vel: V3(0, 0.8, 0), g: 0, opacity: 0.2 }); }
}

// ---- 標記（長按或右鍵）----
function startPress(e, where, slot, instant) {
  if (!G || G.phase === 'over' || G.solo) return; // 單人模式沒有隊友，不需要標記
  const x = e.clientX, y = e.clientY;
  const fire = () => {
    PRESS = null;
    let tgt = null;
    if (where === 'shop') { const k = G.players[ME].shop[slot]; if (!k) return; tgt = { kind: 'shop', key: k }; }
    else { const p = s3PickAt(x, y); if (!p) return; if (p.type === 'unit' && p.k[0] === 'u') { const f = findUnit(+p.k.slice(1)); tgt = { kind: 'unit', key: f && f.u.key, cell: f && f.zone === 'board' ? f.cell : undefined }; } else if (p.type === 'tile') tgt = { kind: 'tile', cell: cellOf(p.vc, p.vr) }; else return; }
    if (typeof drag !== 'undefined' && drag) { const v = drag.k && S3.V[drag.k]; if (v) { v.dragging = false; v.lift = 0; } drag = null; $('sellzone').hidden = true; }
    PRESS_T = tgt;
    const opts = tgt.kind === 'shop' || tgt.kind === 'unit' ? [['want', '我要這隻'], ['buy', '幫我買'], ['danger', '小心']] : [['place', '放這裡'], ['danger', '危險'], ['rally', '集合']];
    const pm = $('pingmenu'), r = $('stage').getBoundingClientRect();
    pm.innerHTML = opts.map(([k, n]) => `<button data-ping="${k}">${n}</button>`).join('') + '<button data-x="1">取消</button>';
    pm.style.left = Math.min(r.width - 150, Math.max(4, x - r.left - 70)) + 'px'; pm.style.top = Math.min(r.height - 60, Math.max(60, y - r.top - 50)) + 'px';
    pm.hidden = false; sfx('click');
  };
  if (instant) { fire(); return; }
  PRESS = { x, y, t: setTimeout(fire, 520) };
}
let PRESS_T = null;
function doPing(kind) {
  $('pingmenu').hidden = true; const t = PRESS_T; if (!t) return;
  actMe({ t: 'ping', kind, cell: t.cell, key: t.key });
  processLog(); refresh();
}
const PING_NAME = { place: '放這裡', danger: '危險', rally: '集合', want: '我要這隻', buy: '幫我買' };
const PINGS = [];
function showPing(L) {
  sfx('ping');
  const P = G.players[L.pid], col = new THREE.Color(ownerColor(L.pid) || '#ffffff');
  let pos = null;
  if (L.cell !== undefined) { const [x, z] = worldOfCell(L.cell, mySide()); pos = V3(x, 0.05, z); groundRing(pos, col.getHex(), 0.9, 1.2); sprite(L.kind === 'danger' ? 'exclaim' : 'ring', pos.clone().add(V3(0, 0.9, 0)), { scale: 0.4, scale1: 0.5, life: 4, color: L.kind === 'danger' ? 0xffffff : col.getHex() }); }
  const txt = `${P.name}：${PING_NAME[L.kind]}${L.key ? '（' + ANIMALS[L.key].name + '）' : ''}`;
  PINGS.push({ pos, txt, until: performance.now() + 4000, col: ownerColor(L.pid) });
  if (!pos) toast(txt);
  if (L.pid !== ME && L.kind === 'want') toast(txt);
}
function pingLabels() {
  const el = $('pingLabels'); if (!el) return;
  const now = performance.now();
  for (let i = PINGS.length - 1; i >= 0; i--) if (PINGS[i].until < now) PINGS.splice(i, 1);
  el.innerHTML = PINGS.filter(p => p.pos).map(p => { const s = toScreen(p.pos.clone().add(V3(0, 1.3, 0))); return `<div class="plabel" style="left:${s[0]}px;top:${s[1]}px;--c:${p.col}">${p.txt}</div>`; }).join('');
}

// ---- 小小英雄 ----
function makeAvatar(pid, x) {
  const R = buildAnimal('chick'); R.phase = Math.random() * 3; R.root.scale.setScalar(1.15);
  R.root.position.set(x, 0, 4.45); S3.unitRoot.add(R.root);
  if (pid !== ME) { const m = R.mats[0]; m.color.set('#ffd8b0'); }
  return { R, pid, x, home: V3(x, 0, 4.45), target: null, mood: null, moodUntil: 0 };
}
function avatarMood(m) { if (!AVATARS) return; for (const a of AVATARS) { a.mood = m; a.moodUntil = nowS() + 2.5; } }
function avatarFrame(dt) {
  if (!AVATARS) return;
  const t = nowS();
  for (const a of AVATARS) {
    const R = a.R; R.root.visible = !$('game').hidden;
    const mood = a.moodUntil > t ? a.mood : null;
    let moving = false;
    if (a.target) { const d = a.target.clone().sub(R.root.position); d.y = 0; const L = d.length(); if (L > 0.05) { d.normalize(); R.root.position.addScaledVector(d, Math.min(L, dt * 2.5)); moving = true; R.yaw.rotation.y = Math.atan2(d.x, d.z); } else { a.target = null; } }
    else if (!a.wanderAt || t > a.wanderAt) { a.wanderAt = t + 4 + Math.random() * 6; a.target = V3(Math.max(-4.6, Math.min(4.6, a.home.x + (Math.random() - .5) * 3)), 0, a.home.z + (Math.random() - .5) * 0.4); } // 場邊閒晃
    poseRig(R, { t, moving, moveP: moving ? (t * 3) % 1 : null, victory: mood === 'win' });
    if (!moving) R.yaw.rotation.y = mood === 'sad' ? 0 : Math.sin(t * 0.5) * 0.4;
    if (mood === 'sad') { R.head.rotation.x += 0.5; R.body.scale.y *= 0.95; }
    if (a.hurtT && t - a.hurtT < 0.5) { const k = (t - a.hurtT) / 0.5; R.root.position.y = Math.sin(k * Math.PI) * 0.35; R.root.rotation.z = Math.sin(k * Math.PI * 6) * 0.25 * (1 - k); } else { R.root.position.y = 0; R.root.rotation.z = 0; } // 被扣血：彈一下、搖頭
  }
}

// ---- 新手教學 ----
const TUT = [
  ['#shop', '這是商店。點卡片買動物，花 2 金可以刷新，鎖頭可以保留下一回合。長按卡片可以對隊友標記「我要這隻」。'],
  ['#stage', '把備戰席的動物拖到棋盤上（我方是靠近你的四排）。拖到商店區就是出售。三隻一樣的會自動升星，3 星會進化！'],
  ['#traits', '左側是羈絆。你和隊友的棋子一起算，兩人都有出同一個羈絆時還有「默契」加成。'],
  ['#lvl', '人口等於等級。購買經驗可以升級、放更多動物、抽到更貴的卡。'],
  ['#items', '野生回合會掉材料和道具，拖到動物身上就能裝備，兩個材料會自動合成。'],
  ['#mate', '隊友資訊、送金、準備按鈕都在這裡；下面是隊伍金庫，兩人都能存取。'],
  ['#btnMenu', '選單裡有戰鬥速度、回放、卡池、偵察、陣容存檔、AI 代打、音效設定。戰鬥中下方還有一次性的隊伍指令。'],
];
function startTutorial(i) {
  i = i || 0;
  let o = $('tut'); if (!o) { o = document.createElement('div'); o.id = 'tut'; o.className = 'tut'; document.body.appendChild(o); }
  if (i >= TUT.length) { o.hidden = true; try { localStorage.setItem('zoo_tut', '1'); } catch (e) {} return; }
  const [sel2, txt] = TUT[i], el = $$(sel2), r = el ? el.getBoundingClientRect() : { left: 20, top: 100, width: 200, height: 60 };
  o.hidden = false;
  const below = r.top < window.innerHeight / 2;
  o.innerHTML = `<div class="tut-hole" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>
    <div class="tut-box" style="${below ? `top:${Math.min(window.innerHeight - 170, r.top + r.height + 14)}px` : `top:${Math.max(10, r.top - 160)}px`}"><p>${txt}</p><div><span>${i + 1} / ${TUT.length}</span><button class="btn" id="tutSkip">跳過</button><button class="btn primary" id="tutNext">${i === TUT.length - 1 ? '開始玩' : '下一步'}</button></div></div>`;
  $('tutNext').onclick = () => startTutorial(i + 1);
  $('tutSkip').onclick = () => startTutorial(TUT.length);
}

// ---- 自訂規則 ----
function openRules() {
  const r = loadRules();
  const tog = (k, n, d) => `<label class="rrow"><input type="checkbox" id="r_${k}" ${r[k] ? 'checked' : ''}><span><b>${n}</b><small>${d}</small></span></label>`;
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>自訂規則</h2>
    <div class="rules">
      <label class="rnum">對戰人數<select id="r_teams"><option value="2" ${r.teams !== 4 ? 'selected' : ''}>4 人（2 隊）</option><option value="4" ${r.teams === 4 ? 'selected' : ''}>8 人（4 隊）</option></select></label>
      <label class="rnum">團隊血量<input type="number" id="r_teamHp" min="30" max="300" step="10" value="${r.teamHp}"></label>
      <label class="rnum">準備秒數<input type="number" id="r_prepSec" min="10" max="90" step="5" value="${r.prepSec}"></label>
      <label class="rnum">最多回合（0＝打到一隊倒下）<input type="number" id="r_maxRound" min="0" max="99" step="1" value="${r.maxRound}"></label>
      <label class="rnum">AI 強度<select id="r_aiLevel"><option value="easy" ${r.aiLevel === 'easy' ? 'selected' : ''}>簡單</option><option value="normal" ${r.aiLevel === 'normal' ? 'selected' : ''}>普通</option><option value="hard" ${r.aiLevel === 'hard' ? 'selected' : ''}>困難</option></select></label>
      ${tog('augments', '海克斯增幅', `第 ${CFG.AUG_ROUNDS.join('、')} 回合三選一`)}
      ${tog('portals', '開局傳送門', '投票決定全場規則')}
      ${tog('encounters', '遭遇事件', `第 ${CFG.ENCOUNTER_ROUNDS.join('、')} 回合隨機事件`)}
      ${tog('carousel', '選秀轉盤', `第 ${CFG.CAROUSEL_ROUNDS.join('、')} 回合`)}
      ${tog('weather', '天氣', '每回合依場地抽天氣')}
      ${tog('neutrals', '中立物件', '寶箱與木箱，打破拿獎勵')}
      ${tog('commands', '戰鬥指令', '每場一次：衝鋒、集結、堅守')}
      ${tog('frontline', '前線爭奪（實驗）', '每人可放 1 隻到敵方最前排，先佔先贏')}
      <div class="rban"><b>禁用動物</b><div>${Object.keys(ANIMALS).map(k => `<label class="${r.bans.includes(k) ? 'on' : ''}"><input type="checkbox" data-ban="${k}" ${r.bans.includes(k) ? 'checked' : ''}>${pimg(k)}${ANIMALS[k].name}</label>`).join('')}</div></div>
    </div>
    <div class="acts2"><button class="btn" id="rReset">恢復預設</button><button class="btn primary" id="rSave">儲存</button></div>`;
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; };
  $('panel').querySelectorAll('[data-ban]').forEach(c => c.onchange = () => c.parentElement.classList.toggle('on', c.checked));
  $('rReset').onclick = () => { saveRules(Object.assign({}, DEFAULT_RULES)); openRules(); };
  $('rSave').onclick = () => {
    const n = { teamHp: +$('r_teamHp').value || 100, prepSec: +$('r_prepSec').value || 30, maxRound: Math.max(0, +$('r_maxRound').value || 0), v5: 1, teams: +$('r_teams').value === 4 ? 4 : 2, aiLevel: $('r_aiLevel').value };
    for (const k of ['augments', 'portals', 'encounters', 'carousel', 'weather', 'neutrals', 'commands', 'frontline']) n[k] = $('r_' + k).checked;
    n.bans = [...$('panel').querySelectorAll('[data-ban]')].filter(c => c.checked).map(c => c.dataset.ban);
    if (Object.keys(ANIMALS).length - n.bans.length < 8) { toast('至少要留 8 種動物'); return; }
    saveRules(n); toast('規則已儲存，下一局開始生效'); $('overlay').hidden = true;
  };
}

// ---- 收藏與造型 ----
function openCollection(focus) {
  const keys = Object.keys(ANIMALS);
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>收藏與造型</h2>
    <p>已玩 ${PROFILE.games} 場・勝 ${PROFILE.wins} 場・做出 3 星 ${PROFILE.three} 次・造型碎片 <b>${PROFILE.shards || 0}</b></p>
    ${eggPanel()}
    <div class="skinrules">${Object.keys(SKINS).map(id => `<span class="${PROFILE.unlocked[id] ? 'ok' : ''}"><b>${SKINS[id].name}</b>${PROFILE.unlocked[id] ? '已解鎖' : SKIN_RULE[id] + `<button class="btn shardbtn" data-shard="${id}">碎片 ${QUEST_CFG.SKIN_COST} 解鎖</button>`}</span>`).join('')}</div>
    <div class="coll">${keys.map(k => { const cur = skinOf(k) || 'base'; return `<div class="citem"><img src="${PORT[k]}" alt="" style="filter:${SKIN_CSS[cur]}"><b>${ANIMALS[k].name}</b><div class="cskins">${Object.keys(SKINS).map(id => `<button data-skin="${k}:${id}" class="${cur === id ? 'on' : ''}" ${PROFILE.unlocked[id] ? '' : 'disabled'} title="${SKINS[id].name}" style="background:${SKINS[id].tint}"></button>`).join('')}</div></div>`; }).join('')}</div>`;
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; };
  $('panel').querySelectorAll('[data-shard]').forEach(b => b.onclick = () => shardUnlock(b.dataset.shard));
  $('panel').querySelector('.coll').onclick = e => { const b = e.target.closest('[data-skin]'); if (!b || b.disabled) return; const [k, id] = b.dataset.skin.split(':'); PROFILE.skinSel[k] = id === 'base' ? undefined : id; saveProfile(); sfx('click'); openCollection(); };
}

// ---- 加到主畫面（PWA）----
let INSTALL_EVT = null;
let INSTALL_SHOW = false, INSTALL_FN = null;
// ---- 大廳：模式選單與設定 ----
function openModes() {
  const online = !netBlocked();
  let tutDone = false; try { tutDone = !!localStorage.getItem('zoo_tutmatch'); } catch (e) {}
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>選擇模式</h2><div class="modes">
    <button class="btn ${tutDone ? '' : 'primary'} tutbtn" data-mode="tutorial"><b>新手教學局</b><small>${tutDone ? '再練一次：升星、羈絆、裝備（3 回合）' : '第一次玩推薦！3 回合學會升星、羈絆、裝備'}</small></button>
    <div><h3>練習 <small>跟電腦打，不計分</small></h3>
    <div class="ltabs ailv"><span>電腦強度</span>${[['easy', '簡單'], ['normal', '普通'], ['hard', '困難']].map(([k, n]) => `<button class="btn ${(loadRules().aiLevel || 'normal') === k ? 'on' : ''}" data-ailv="${k}">${n}</button>`).join('')}</div>
    <div class="mgrid">
      <button class="btn primary" data-mode="p-solo"><b>單人混戰</b><small>8 人各自一隊</small></button>
      <button class="btn primary" data-mode="p-duel"><b>單人 1 對 1</b><small>你對一個電腦</small></button>
      <button class="btn primary" data-mode="p-duo"><b>雙人對戰</b><small>2 隊 4 人，你＋電腦隊友</small></button>
      <button class="btn primary" data-mode="p-duo8"><b>雙人混戰</b><small>4 隊 8 人</small></button>
    </div></div>
    <div><h3>新模式</h3><div class="mgrid"><button class="btn moss tdbtn" data-mode="td"><b>潮線守衛</b><small>塔防・章節通關（單人）</small></button></div></div>
    ${online ? `<div><h3>排位配對 <small>跟全世界的玩家，計天梯分數</small></h3><div class="mgrid">
      <button class="btn" data-mode="r-solo"><b>單人排位</b><small>最多 8 人各自一隊</small></button>
      <button class="btn" data-mode="r-duel"><b>1 對 1 排位</b><small>單挑真人</small></button>
      <button class="btn" data-mode="r-4"><b>雙人排位</b><small>2 隊 4 人</small></button>
      <button class="btn" data-mode="r-8"><b>雙人混戰排位</b><small>4 隊 8 人</small></button>
    </div></div>
    <div><h3>跟朋友玩 <small>開房間或輸入房號</small></h3><div class="mgrid">
      <button class="btn moss" data-mode="room"><b>開房／加入房間</b><small>單人或雙人都可以</small></button>
    </div></div>` : ''}
  </div>`;
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; };
  $('panel').querySelectorAll('[data-ailv]').forEach(b => b.onclick = () => { const r = loadRules(); r.aiLevel = b.dataset.ailv; saveRules(r); $('panel').querySelectorAll('[data-ailv]').forEach(x => x.classList.toggle('on', x === b)); });
  $('panel').querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    const m = b.dataset.mode; $('overlay').hidden = true;
    if (m === 'td') { openTd(); return; }
    if (m === 'tutorial') startTutorialMatch();
    else if (m === 'p-solo') { ME = 0; netReset(); newGame(8, true); }
    else if (m === 'p-duel') { ME = 0; netReset(); newGame(2, true); }
    else if (m === 'p-duo') { ME = 0; netReset(); newGame(2); }
    else if (m === 'p-duo8') { ME = 0; netReset(); newGame(4); }
    else if (m.startsWith('r-')) openMatch(m === 'r-solo' ? 'solo' : m === 'r-duel' ? 'duel' : m === 'r-8' ? 8 : 4);
    else if (m === 'room') openOnline();
  });
}
// 選隊伍頭像（存在 PROFILE.avatar，沒有就是第一個）
function openAvatar() {
  const cur = myAvatar();
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>頭像</h2><p class="avhint">比賽時左上角的隊伍血量會用這個頭像</p><div class="avgrid">${AV_CFG.LIST.map(k => `<button class="avpick ${k === cur ? 'on' : ''}" data-av="${k}"><span class="tav"><img src="${avSrc(k)}" alt=""></span><small>${(ANIMALS[k] || { name: '小雞' }).name}</small></button>`).join('')}</div>`;
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; };
  $('panel').querySelectorAll('[data-av]').forEach(b => b.onclick = () => { PROFILE.avatar = b.dataset.av; saveProfile(); sfx('click'); openAvatar(); if (typeof hud === 'function' && G) { hud.k = ''; $('teamA')._ti = -1; } });
}
function openSettings() {
  const on = typeof srvOn === 'function' && srvOn(), me = typeof ACC !== 'undefined' ? ACC.me : null;
  $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>設定</h2><div class="setlist">
    ${on ? (me ? `<div class="lpme">${tierBadge(me.lp)}<b>${esc(me.name)}</b><small>帳號 ${esc(me.user)}</small></div>
      <button class="btn" data-set="acc">帳號與暱稱</button><button class="btn" data-set="logout">登出（換其他帳號）</button>`
      : `<button class="btn primary" data-set="login">登入／註冊</button>`) : `<button class="btn primary" data-set="login">登入／註冊</button>`}
    <button class="btn" data-set="rules">自訂規則（練習用）</button>
    ${bgmSelectHtml(true)}
    <button class="btn" data-set="avatar">頭像</button>
    <button class="btn" data-set="collect">收藏與造型</button>
    <button class="btn" data-set="dex">圖鑑與規則</button>
    ${INSTALL_SHOW ? '<button class="btn" data-set="install">加到主畫面（像 App 一樣開）</button>' : ''}
  </div>`;
  $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; }; bgmSelectBind();
  $('panel').querySelectorAll('[data-set]').forEach(b => b.onclick = async () => {
    const k = b.dataset.set;
    if (k === 'acc') openAccount(); else if (k === 'avatar') openAvatar(); else if (k === 'rules') openRules(); else if (k === 'collect') openCollection(); else if (k === 'dex') { $('overlay').hidden = true; showDex(); }
    else if (k === 'install') INSTALL_FN && INSTALL_FN();
    else if (k === 'login') { $('overlay').hidden = true; splashShowLogin(); }
    else if (k === 'logout') { await accApi('/api/logout', {}); ACC.token = ''; ACC.me = null; accSave(); $('overlay').hidden = true; splashShowLogin(); }
  });
}
function setupInstall() {
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  const hosted = (location.protocol === 'https:' && !/claude\.ai|claudeusercontent|anthropic/.test(location.hostname)) || location.hostname === 'localhost';
  if (hosted && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (standalone) return;
  INSTALL_SHOW = true;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); INSTALL_EVT = e; });
  INSTALL_FN = async () => {
    if (INSTALL_EVT) { INSTALL_EVT.prompt(); try { const r = await INSTALL_EVT.userChoice; if (r.outcome === 'accepted') { toast('已加到主畫面！'); INSTALL_SHOW = false; } } catch (e) {} INSTALL_EVT = null; return; }
    const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua), line = /Line\//i.test(ua), inApp = line || /FBAN|FBAV|Instagram/i.test(ua);
    const steps = !hosted ? '<p>這個頁面要用公開網址開才能加到主畫面：<br><b>https://willy110611-collab.github.io/animal-chess/</b></p>'
      : inApp ? '<p>你現在在 LINE（或其他 App）內建的瀏覽器裡，沒辦法加到主畫面。</p><p>請按右上角「⋯」→「用預設瀏覽器開啟」，再按一次這個按鈕。</p>'
      : ios ? '<ol><li>用 <b>Safari</b> 開這個網址</li><li>按下方中間的「分享」鈕（方框加向上箭頭）</li><li>往下滑，選「<b>加入主畫面</b>」</li><li>按右上角「新增」</li></ol>'
      : '<ol><li>用 <b>Chrome</b> 開這個網址</li><li>按右上角「⋮」</li><li>選「<b>加到主畫面</b>」或「<b>安裝應用程式</b>」</li><li>按「安裝」</li></ol>';
    $('panel').innerHTML = `<button class="x" id="mX" aria-label="關閉">✕</button><h2>加到主畫面</h2><div class="dex"><div class="plain" style="display:block">${steps}<p>加好之後，主畫面會出現獅子圖示，點開就是全螢幕、沒有網址列，玩過一次之後沒網路也能開。</p></div></div>`;
    $('overlay').hidden = false; $('mX').onclick = () => { $('overlay').hidden = true; };
  };
}
