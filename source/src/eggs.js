// ===== 小彩蛋（純外觀，不影響數值）=====
// 找到過的彩蛋存在 localStorage 'zoo_eggs'；收藏頁會顯示 X/8，沒找到的只給提示
const EGGS = {
  poke:      { name: '戳戳樂',     hint: '有些動物被一直戳會有反應' },
  chick:     { name: '小雞舞會',   hint: '場邊的小雞好像很怕癢' },
  party:     { name: '派對模式',   hint: '電腦上的經典祕技；手機在大廳按住標題不放' },
  cheap:     { name: '平民逆襲',   hint: '用很便宜的陣容開戰' },
  pure:      { name: '純血部落',   hint: '讓同一個羈絆湊到最高階' },
  rainbow:   { name: '五彩動物園', hint: '1～5 費各帶一隻上場' },
  xmas:      { name: '聖誕快樂',   hint: '12 月 20～26 日玩玩看' },
  halloween: { name: '萬聖夜',     hint: '10 月 25～31 日玩玩看' },
};
const EGG_POKE_TAPS = 5, EGG_CHICK_TAPS = 6; // 連點幾下觸發（可調）
// 被戳時的台詞（每隻一句，沒寫的用預設）
const POKE_LINES = {
  hedgehog: '別摸！會刺手喔', squirrel: '我的松果不分你', wolf: '嗷嗚～別鬧', frog: '呱！（舌頭收不回來）', bat: '我白天要睡覺…',
  redpanda: '看我站起來有多高！', skunk: '再戳我就放臭氣了', croc: '我只是在微笑而已', bee: '嗡嗡嗡，我很忙', koala: 'Zzz…再五分鐘…',
  cheetah: '你追不到我的', octopus: '八隻手都在忙', owl: '咕咕，現在幾點？', elephant: '我記得你戳過我', lion: '本王准你摸頭',
  penguin: '肚子滑起來很快喔', rhino: '近視眼，你是誰？', chameleon: '你看不到我、你看不到我', fox: '叮咚叮咚，狐狸怎麼叫？', eagle: '我在高空就看到你了',
  eel: '小心觸電 ⚡', gorilla: '（捶胸）我很溫柔的', whale: '噗——（噴水）', peacock: '我是不是很美？', komodo: '我口水有毒，退後',
  deer: '鹿角是用來耍帥的', zebra: '我是白底黑紋還是黑底白紋？', hippo: '嘴巴張開～啊～', parrot: '戳我！戳我！戳我！', giraffe: '上面的空氣比較新鮮', flamingo: '單腳站比較不累', shark: '我只是想打招呼…', panda: '竹子分你一根',
};
let EGG_FOUND = (() => { try { return JSON.parse(localStorage.getItem('zoo_eggs') || '{}') || {}; } catch (e) { return {}; } })();
const EGG_STATE = { taps: { k: null, n: 0, t: 0 }, chick: { n: 0, t: 0 }, keys: [], holiday: null, decoKey: '', snowAcc: 0, shownThisGame: {} };

function eggFound(id) {
  if (!EGGS[id]) return;
  const first = !EGG_FOUND[id];
  EGG_FOUND[id] = 1; try { localStorage.setItem('zoo_eggs', JSON.stringify(EGG_FOUND)); } catch (e) {}
  if (first) { toast(`發現彩蛋：${EGGS[id].name}（${Object.keys(EGG_FOUND).length}/${Object.keys(EGGS).length}）`, 2600); sfx('star'); }
}
function eggPanel() {
  const ids = Object.keys(EGGS), n = ids.filter(i => EGG_FOUND[i]).length;
  return `<div class="eggs"><b>彩蛋 ${n}/${ids.length}</b><div>${ids.map(i => `<span class="${EGG_FOUND[i] ? 'ok' : ''}">${EGG_FOUND[i] ? '🥚 ' + EGGS[i].name : '？？？　' + EGGS[i].hint}</span>`).join('')}</div></div>`;
}

// ---- 1. 戳戳樂：連點同一隻動物 ----
function eggTapUnit(k) {
  const now = performance.now(), T = EGG_STATE.taps;
  if (T.k !== k || now - T.t > 700) { T.k = k; T.n = 0; }
  T.n++; T.t = now;
  const v = S3.V[k]; if (!v) return;
  if (T.n >= 2 && T.n < EGG_POKE_TAPS) { v.pop = nowS(); sfx('click'); }
  if (T.n >= EGG_POKE_TAPS) {
    T.n = 0;
    const key = v.unitKey, A = (ACT[key] || {}).skill;
    if (A && v.mode === 'prep') v.act = { kind: 'skill', t0: nowS(), dur: A.dur }; // 表演自己的技能動作（不會真的放技能）
    eggBubble(k, POKE_LINES[key] || '別戳了啦！');
    const p = posOf(k, 1.0); if (p) for (let i = 0; i < 5; i++) sprite('heart', p.clone(), { scale: 0.16, scale1: 0.05, life: 0.9, vel: V3((Math.random() - .5) * 1.2, 1.2 + Math.random(), 0), g: -1, color: 0xff7a9a, delay: i * 0.05 });
    eggFound('poke');
  }
}
function eggBubble(k, text) {
  const v = S3.V[k]; if (!v) return;
  const d = document.createElement('div'); d.className = 'eggbub'; d.textContent = text; S3.ov.appendChild(d);
  const t0 = performance.now();
  const tick = () => { const vv = S3.V[k]; if (!vv || performance.now() - t0 > 2200) { d.remove(); return; } const s = toScreen(v3top(vv)); d.style.transform = `translate(${Math.round(s[0])}px,${Math.round(s[1] - 26)}px) translate(-50%,-100%)`; requestAnimationFrame(tick); };
  tick();
}

// ---- 2. 小雞舞會：連點場邊的小小英雄 ----
function eggTapChick(cx, cy) {
  if (!AVATARS || !AVATARS[0]) return false;
  const a = AVATARS[0], cr = S3.renderer.domElement.getBoundingClientRect();
  const s = toScreen(a.R.root.position.clone().add(V3(0, 0.4, 0)));
  if (Math.hypot(cx - cr.left - s[0], cy - cr.top - s[1]) > 36) return false;
  const now = performance.now(), C = EGG_STATE.chick;
  if (now - C.t > 900) C.n = 0;
  C.n++; C.t = now;
  a.mood = 'win'; a.moodUntil = nowS() + 0.5; sfx('click');
  if (C.n >= EGG_CHICK_TAPS) {
    C.n = 0; a.mood = 'win'; a.moodUntil = nowS() + 4; a.dance = nowS();
    const p = a.R.root.position.clone().add(V3(0, 0.8, 0));
    for (let i = 0; i < 18; i++) sprite(i % 2 ? 'star' : 'spark', p.clone(), { scale: 0.18, scale1: 0.05, life: 1.2, vel: V3((Math.random() - .5) * 3, 1.5 + Math.random() * 2, (Math.random() - .5) * 2), g: -3, color: [0xffd34d, 0xff8a6a, 0x9be07a, 0x8fd3ff][i % 4], add: true, important: true });
    sfx('star'); eggFound('chick');
  }
  return true;
}
function eggChickPose() { // 在 avatarFrame 之後呼叫：跳舞時轉圈
  if (!AVATARS) return;
  const t = nowS();
  for (const a of AVATARS) if (a.dance && t - a.dance < 4) { const k = t - a.dance; a.R.yaw.rotation.y = k * 9; a.R.body.position.y += Math.abs(Math.sin(k * 10)) * 0.25; a.R.armL.rotation.z -= 1.2; a.R.armR.rotation.z += 1.2; }
}

// ---- 3. 派對模式：上上下下左右左右 B A，或大廳長按標題 ----
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
function eggKey(e) {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  EGG_STATE.keys.push(k); if (EGG_STATE.keys.length > KONAMI.length) EGG_STATE.keys.shift();
  if (EGG_STATE.keys.join() === KONAMI.join()) { EGG_STATE.keys = []; toggleParty(); }
}
function toggleParty() {
  S3.party = !S3.party;
  for (const k in S3.V) eggHat(S3.V[k].R, true);
  if (AVATARS) for (const a of AVATARS) eggHat(a.R, true);
  toast(S3.party ? '派對模式開啟！🎉（再輸入一次關閉）' : '派對模式關閉', 2200);
  if (S3.party) { if (typeof confetti === 'function' && !$('game').hidden) confetti(); eggFound('party'); }
}

// ---- 帽子：派對帽／聖誕帽／巫師帽 ----
function eggHatKind() { return S3.party ? 'party' : EGG_STATE.holiday === 'xmas' ? 'santa' : EGG_STATE.holiday === 'halloween' ? 'witch' : null; }
function eggHat(R, force) {
  const kind = eggHatKind();
  if (R.hatKind === kind && !force) return;
  if (R.hat) { R.head.remove(R.hat); disposeObj(R.hat); R.hat = null; }
  R.hatKind = kind;
  if (!kind || R.crown || !R.head) return;
  const g = new THREE.Group(), y = (R.headTop || 1) - 0.47;
  if (kind === 'party') {
    const cols = ['#ff7a9a', '#5ac8ff', '#ffd34d', '#9be07a'], c = cols[Math.floor(Math.random() * cols.length)];
    g.add(mesh(GEO.cone, T(c), [0, 0.11, 0], [0.09, 0.22, 0.09]));
    g.add(mesh(GEO.torus, T('#ffffff'), [0, 0.06, 0], [0.065, 0.065, 0.06], [Math.PI / 2, 0, 0]));
    g.add(mesh(GEO.sph, T('#fff3a0'), [0, 0.23, 0], 0.035));
    g.rotation.z = 0.25;
  } else if (kind === 'santa') {
    g.add(mesh(GEO.cone, T('#d9483a'), [0, 0.12, 0], [0.12, 0.24, 0.12]));
    g.add(mesh(GEO.torus, T('#f7f2ea'), [0, 0.01, 0], [0.11, 0.11, 0.18], [Math.PI / 2, 0, 0]));
    g.add(mesh(GEO.sph, T('#f7f2ea'), [0.06, 0.22, 0], 0.04));
    g.rotation.z = -0.35;
  } else {
    g.add(mesh(GEO.cyl, T('#3a2a4a'), [0, 0, 0], [0.2, 0.012, 0.2]));
    g.add(mesh(GEO.cone, T('#3a2a4a'), [0, 0.13, 0], [0.1, 0.26, 0.1]));
    g.add(mesh(GEO.torus, T('#f2a03a'), [0, 0.03, 0], [0.095, 0.095, 0.1], [Math.PI / 2, 0, 0]));
    g.rotation.z = 0.2;
  }
  g.position.set(0, y, 0); g.scale.setScalar(1.45); R.head.add(g); R.hat = g; // 帽子大小（可調）
}

// ---- 4. 陣容彩蛋：開戰時檢查我的棋子 ----
function eggCombatStart() {
  if (!cv || !cv.B) return;
  if (EGG_STATE.game !== G.seed) { EGG_STATE.game = G.seed; EGG_STATE.shownThisGame = {}; }
  const B = cv.B, mine = B.units.filter(u => u.owner === ME && !u.summon && ANIMALS[u.key]);
  if (!mine.length) return;
  const costs = new Set(mine.map(u => ANIMALS[u.key].cost));
  const show = (id, b1, b2) => { if (EGG_STATE.shownThisGame[id]) return; EGG_STATE.shownThisGame[id] = 1; setTimeout(() => { banner(b1, b2, 'win'); if (typeof confetti === 'function') confetti(); }, 900); eggFound(id); };
  if (mine.length >= 5 && mine.every(u => ANIMALS[u.key].cost === 1)) show('cheap', '平民逆襲！', '全員 1 費也要贏');
  if ([1, 2, 3, 4, 5].every(c => costs.has(c))) show('rainbow', '五彩動物園！', '1～5 費全員到齊');
  const tc = B['traits' + cv.vt] || {};
  for (const t in TRAITS) if (tc[t] && tc[t].tier === TRAITS[t].tiers.length - 1) { show('pure', `純血部落：${TRAITS[t].name}！`, '羈絆湊到最高階'); break; }
}

// ---- 5. 節日：聖誕下雪、萬聖節南瓜燈 ----
function eggHoliday() {
  let q = null; try { q = new URLSearchParams(location.search).get('egg'); } catch (e) {}
  const d = new Date(), m = d.getMonth() + 1, day = d.getDate();
  if (q === 'xmas' || (m === 12 && day >= 20 && day <= 26)) return 'xmas';
  if (q === 'halloween' || (m === 10 && day >= 25)) return 'halloween';
  return null;
}
function eggArenaDeco() {
  const key = S3.arenaKey + '|' + EGG_STATE.holiday;
  if (!S3.arenaKey || EGG_STATE.decoKey === key) return;
  EGG_STATE.decoKey = key;
  if (S3.eggDeco) { S3.scene.remove(S3.eggDeco); disposeObj(S3.eggDeco); S3.eggDeco = null; }
  if (EGG_STATE.holiday !== 'halloween') return;
  const g = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + 0.3, x = Math.cos(a) * 4.9, z = -0.5 + Math.sin(a) * 4.8, p = new THREE.Group();
    p.add(mesh(GEO.sph, T('#e8822a'), [0, 0.18, 0], [0.26, 0.2, 0.26]));
    p.add(mesh(GEO.cyl, T('#5a7a3a'), [0, 0.4, 0], [0.03, 0.08, 0.03]));
    for (const s of [-1, 1]) p.add(mesh(GEO.cone, MB(0xffe27a), [s * 0.08, 0.22, 0.24], [0.04, 0.05, 0.01], [Math.PI / 2, 0, 0]));
    p.add(mesh(GEO.box, MB(0xffe27a), [0, 0.12, 0.25], [0.13, 0.025, 0.01]));
    p.position.set(x, -0.3, z); p.rotation.y = Math.atan2(-x, -(z + 0.5)); g.add(p);
  }
  S3.scene.add(g); S3.eggDeco = g;
}

// ---- 掛到遊戲裡 ----
function eggsBoot() {
  EGG_STATE.holiday = eggHoliday();
  window.addEventListener('keydown', eggKey);
  // 手機：大廳按住標題 2 秒
  const h1 = document.querySelector('#lobby h1');
  if (h1) { let tm = null; h1.addEventListener('pointerdown', () => { tm = setTimeout(toggleParty, 2000); }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) h1.addEventListener(ev, () => clearTimeout(tm)); h1.style.userSelect = 'none'; h1.style.webkitUserSelect = 'none'; }
  if (EGG_STATE.holiday) setTimeout(() => { eggFound(EGG_STATE.holiday); }, 1500);
}
function eggsFrame(dt) {
  const kind = eggHatKind();
  if (kind) for (const k in S3.V) { const R = S3.V[k].R; if (R.hatKind !== kind && !R.crown) eggHat(R); }
  if (AVATARS) for (const a of AVATARS) if (a.R.hatKind !== kind) eggHat(a.R);
  eggArenaDeco();
  if (EGG_STATE.holiday === 'xmas' && G && !$('game').hidden) { // 下雪
    EGG_STATE.snowAcc += dt * 14 * (S3.quality || 1);
    while (EGG_STATE.snowAcc > 1) { EGG_STATE.snowAcc--; sprite('puff', V3((Math.random() - .5) * 10, 4 + Math.random() * 2, -0.5 + (Math.random() - .5) * 9), { scale: 0.09, scale1: 0.07, life: 3.5, vel: V3((Math.random() - .5) * 0.3, -1.4, 0), g: 0, color: 0xffffff, opacity: 0.9 }); }
  }
}
