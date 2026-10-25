// ===== 單位、頭頂血條、特效、點選拖放 =====
const easeSpring = k => { const c1 = 1.56, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }; // 近似 cubic-bezier(.34,1.56,.64,1)
const vview = (c, r, vt) => vt === 0 ? [c, r] : [CFG.COLS - 1 - c, CFG.ROWS - 1 - r];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
let CLK = 0;
const nowS = () => CLK; // 動畫時鐘：頓挫（hitstop）時會停住
function hitstop(ms) { S3.freezeUntil = Math.max(S3.freezeUntil || 0, performance.now() + ms); }
function stageShake(px) { const el = S3.wrap; el.style.setProperty('--shk', (px || 5) + 'px'); el.classList.remove('shk'); void el.offsetWidth; el.classList.add('shk'); }

// ---- 單位 ----
function s3Unit(k, info) {
  let v = S3.V[k];
  if (v && v.unitKey !== info.key) { s3Remove(k, true); v = null; }
  if (!v) {
    const R = buildAnimal(info.key); R.phase = Math.random() * 3; S3.nBuild = (S3.nBuild || 0) + 1;
    for (const m of R.mats) if (m.emissive) m.emissive = new THREE.Color(0, 0, 0);
    S3.unitRoot.add(R.root);
    const hb = document.createElement('div'); hb.className = 'hb';
    hb.innerHTML = '<div class="hb-st"></div><div class="hb-bar"><i class="hb-lag"></i><i class="hb-hp"></i><i class="hb-sh"></i><b class="hb-tk"></b></div><div class="hb-mp"><i></i></div><div class="hb-it"></div>';
    S3.ov.appendChild(hb);
    const blob = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: 0x2a140a, transparent: true, opacity: 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); blob.renderOrder = 3;
    blob.rotation.x = -Math.PI / 2; S3.unitRoot.add(blob);
    if (!GEO.unitRing) GEO.unitRing = new THREE.RingGeometry(0.34, 0.42, 32);
    const ring = new THREE.Mesh(GEO.unitRing, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })); ring.renderOrder = 4;
    ring.rotation.x = -Math.PI / 2; S3.unitRoot.add(ring);
    v = S3.V[k] = { k, R, hb, blob, ring, unitKey: info.key, pos: V3(info.x, 0, info.z), tgt: V3(info.x, 0, info.z), yaw: 0, tyaw: 0, act: null, hitT: -9, deadT: null,
      hpShow: 1, lag: 1, star: 0, stunG: null, icon: null, seen: 0, born: nowS(), moving: false, lift: 0 };
    hb.querySelector('.hb-mp');
    v.el = { st: hb.querySelector('.hb-st'), hp: hb.querySelector('.hb-hp'), lag: hb.querySelector('.hb-lag'), sh: hb.querySelector('.hb-sh'), tk: hb.querySelector('.hb-tk'), mp: hb.querySelector('.hb-mp i'), mpb: hb.querySelector('.hb-mp'), it: hb.querySelector('.hb-it') };
  }
  return v;
}
// 釋放 GPU 資源：共用幾何（GEO）與精靈的內建幾何不釋放，貼圖由 tex() 快取共用也不釋放
function disposeObj(o) {
  if (!o) return;
  const shared = disposeObj.shared || (disposeObj.shared = new Set());
  if (!shared.size || shared.n !== Object.keys(GEO).length) { shared.clear(); for (const g of Object.values(GEO)) shared.add(g); shared.n = Object.keys(GEO).length; }
  o.traverse(c => {
    if (c.geometry && !c.isSprite && !shared.has(c.geometry)) c.geometry.dispose();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose());
  });
}
function s3Remove(k, instant) {
  const v = S3.V[k]; if (!v) return;
  for (const o of [v.R.root, v.blob, v.ring, v.stunG, v.icon, v.aura, v.bubble]) if (o) { S3.unitRoot.remove(o); disposeObj(o); }
  v.hb.remove(); delete S3.V[k];
}
// list: [{k,key,star,owner,enemy,x,z,y,hp,maxhp,shield,mana,manaMax,sleep,stun,stealth,alive,teleport,face, color}]
function s3Sync(list, mode) {
  const seen = {};
  for (const it of list) {
    const v = s3Unit(it.k, it); seen[it.k] = 1;
    v.info = it; v.mode = mode;
    if (it.star !== v.star || !!it.king !== !!v.king || !!it.mini !== !!v.mini) { v.star = it.star; v.king = !!it.king; v.mini = !!it.mini; v.hb.classList.toggle('mini', v.mini); v.el.st.textContent = (it.king ? '♛' : '') + '★'.repeat(it.star); v.el.st.className = 'hb-st s' + it.star; const sc = animalScale(it.key, it.star) * 1.05 * (it.king ? 1.2 : 1) * (it.mini ? 0.72 : 1); v.R.root.scale.setScalar(sc); v.scale = sc; }
    if (it.star >= 3 && ANIMALS[it.key] && !v.R.crown) { addEvolveLook(v.R); v.evoAura = true; }
    if ((it.skin || 'base') !== (v.skinId || 'base')) { v.skinId = it.skin || 'base'; applySkin(v.R, v.skinId); }
    if (it.neutral && !v.neutralSet) { v.neutralSet = true; v.hb.classList.add('neutral'); }
    if (v.R.melee === undefined) v.R.melee = ((ANIMALS[it.key] || EXTRA[it.key] || {}).rng || 1) === 1;
    if (v.colorKey !== it.color) { v.colorKey = it.color; v.ring.material.color.set(it.color || '#ffffff'); v.ring.visible = !!it.color; v.hb.style.setProperty('--own', it.color || '#9a8a7a'); v.hb.classList.toggle('enemy', !!it.enemy); }
    if (mode === 'prep') { v.R.root.visible = true; if (Math.hypot(v.tgt.x - it.x, v.tgt.z - it.z) > 0.01) { v.tween = { from: v.pos.clone().setY(0), t0: nowS(), dur: 0.34 }; } v.tgt.set(it.x, 0, it.z); if (!v.dragging && v.pos.distanceTo(v.tgt) > 3.5) { v.pos.copy(v.tgt); v.tween = null; } }
    else if (!v.dragging) { v.pos.set(it.x, it.y || 0, it.z); }
    if (it.alive === false && v.deadT === null) v.deadT = nowS();
    if (it.alive !== false && v.deadT !== null && mode === 'prep') v.deadT = null;
  }
  for (const k in S3.V) if (!seen[k]) s3Remove(k);
}
function v3top(v) { const p = v.pos.clone().add(V3(0, (v.R.headTop || 1) * (v.scale || 1) + 0.12 + v.lift + groundH(v.pos.x, v.pos.z), 0)); if (v.airOff) p.add(v.airOff); return p; }
function toScreen(p) { const q = p.clone().project(S3.cam); return [(q.x + 1) / 2 * S3.W, (1 - q.y) / 2 * S3.H, q.z]; }

// ---- 每幀更新 ----
// ---- 自動畫質：連續卡頓就降解析度與特效量，順了再慢慢升回來 ----
const QUALITY_STEPS = [{ pr: 1.75, q: 1 }, { pr: 1.4, q: 1 }, { pr: 1.15, q: 0.75 }, { pr: 1.0, q: 0.6 }, { pr: 0.85, q: 0.45 }];
const QUALITY_SLOW_MS = 24, QUALITY_FAST_MS = 14; // 平均每幀超過 24ms 降一級，低於 14ms 持續 6 秒升一級
function autoQuality() {
  const now = performance.now(), A = S3.aq || (S3.aq = { last: now, sum: 0, n: 0, lvl: 0, good: 0, t0: now });
  const d = now - A.last; A.last = now; if (d > 250) return; // 切到背景或卡住的那一幀不算
  A.sum += d; A.n++;
  if (now - A.t0 < 2000) return;
  const avg = A.sum / A.n; A.sum = 0; A.n = 0; A.t0 = now;
  const maxPr = Math.min(QUALITY_STEPS[0].pr, window.devicePixelRatio || 1);
  if (S3.qualityLock !== undefined) A.lvl = S3.qualityLock;
  else if (avg > QUALITY_SLOW_MS && A.lvl < QUALITY_STEPS.length - 1) { A.lvl++; A.good = 0; }
  else if (avg < QUALITY_FAST_MS && A.lvl > 0) { if (++A.good >= 3) { A.lvl--; A.good = 0; } }
  else A.good = 0;
  const st = QUALITY_STEPS[A.lvl], pr = Math.min(maxPr, st.pr);
  S3.quality = st.q; S3.avgMs = avg;
  if (Math.abs(S3.renderer.getPixelRatio() - pr) > 0.01) { S3.renderer.setPixelRatio(pr); S3.renderer.setSize(S3.W, S3.H, false); }
}
function s3Frame(dt, ctx) {
  autoQuality();
  CLK += dt;
  const t = nowS();
  // 相機與晃動
  S3.cam.position.copy(S3.camBase);
  if (S3.demoK && S3.V[S3.demoK]) { // 圖鑑技能展示：鏡頭拉近跟著主角（可調：DEMO_CAM 距離與高度）
    const dv = S3.V[S3.demoK], f = S3.demoF || (S3.demoF = dv.pos.clone()); f.lerp(V3(dv.pos.x, 0, dv.pos.z - 0.5), Math.min(1, dt * 3));
    const dc = S3.demoClose ? DEMO_CAM_ATK : DEMO_CAM; S3.cam.position.set(f.x + dc.x, dc.y, f.z + dc.z); S3.camLook.set(f.x, 0.5, f.z);
  } else if (S3.demoF) { S3.demoF = null; S3.camLook.set(0, 0, S3.W / S3.H < 1 ? 0.15 : 0.2); }
  if (S3.shake > 0) { S3.cam.position.x += (Math.random() - .5) * S3.shake; S3.cam.position.y += (Math.random() - .5) * S3.shake; S3.shake = Math.max(0, S3.shake - dt * 1.6); }
  S3.cam.lookAt(S3.camLook);
  // 夜晚
  S3.night += (S3.nightTarget - S3.night) * Math.min(1, dt * 1.5);
  if (S3.baseHemi) { S3.hemi.intensity = S3.baseHemi * (1 - 0.45 * S3.night); S3.sun.intensity = S3.baseSun * (1 - 0.6 * S3.night); S3.fill.intensity = 0.35 + 0.7 * S3.night; }
  S3.wrap.style.setProperty('--night', S3.night.toFixed(3));
  // 環境動畫
  for (const a of S3.ambient) {
    const o = a.o;
    if (a.k === 'sway') o.rotation.z = Math.sin(t * 0.8 + a.ph) * (a.small ? 0.04 : 0.02);
    else if (a.k === 'leaf') o.rotation.z = Math.sin(t * 1.2 + a.ph) * 0.08;
    else if (a.k === 'firefly') { o.position.set(a.base.x + Math.sin(t * 0.5 + a.ph) * 0.8, a.base.y + Math.sin(t * 0.9 + a.ph * 2) * 0.4, a.base.z + Math.cos(t * 0.4 + a.ph) * 0.6); o.material.opacity = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2 + a.ph)); }
    else if (a.k === 'flow') { o.position.x += dt * a.sp; if (o.position.x > 18) o.position.x = -18; }
    else if (a.k === 'water') o.scale.y = 0.02 * (1 + 0.15 * Math.sin(t * 2 + a.ph));
    else if (a.k === 'tumble') { o.position.x += dt * 1.6; o.rotation.z -= dt * 3; o.position.y = 0.05 + Math.abs(Math.sin(t * 3)) * 0.25; if (o.position.x > 13) o.position.x = -13 - Math.random() * 10; }
    else if (a.k === 'sand') { o.position.x += dt * a.sp; if (o.position.x > 10) o.position.x = -10; }
    else if (a.k === 'peck') o.rotation.x = Math.max(0, Math.sin(t * 3 + a.ph)) * 0.6;
    else if (a.k === 'bob') { const q = Math.sin(t * 3 + a.ph); o.scale.set(1 + 0.04 * q, 1 - 0.08 * q, 1 + 0.04 * q); }
    else if (a.k === 'spin') { o.rotation.y += dt * 4; o.children.forEach((c, i) => { c.position.x = Math.sin(t * 3 + i + a.ph) * 0.04; }); }
    else if (a.k === 'flame') o.children.forEach((f, i) => { const q = Math.sin(t * 9 + i * 2.1 + a.ph); f.scale.set(0.28 + 0.04 * q, 0.4 + 0.1 * q, 1); f.material.opacity = 0.75 + 0.25 * q; });
    else if (a.k === 'blink') o.visible = S3.night > 0.3 && (Math.sin(t * 0.7 + a.ph) > -0.6) && ((t * 1.3 + a.ph) % 4 > 0.15);
    else if (a.k === 'steam') { a.acc = (a.acc || 0) + dt; if (a.acc > 0.35) { a.acc = 0; const wp = new THREE.Vector3(); o.getWorldPosition(wp); sprite('puff', wp.add(V3((Math.random() - .5) * 0.3, 0.1, (Math.random() - .5) * 0.3)), { color: 0xf2f2f2, scale: 0.25, scale1: 0.7, life: 1.4, opacity: 0.45, vel: V3(0.1, 0.6, 0) }); } }
  }
  if (S3.cityWin) S3.cityWin.color.setHSL(0.11, 0.9, 0.65 + 0.15 * S3.night);
  // 單位
  for (const k in S3.V) {
    const v = S3.V[k], it = v.info || {};
    let moveP = null;
    if (v.mode === 'prep' && !v.dragging) {
      if (v.tween) {
        const k = Math.min(1, (t - v.tween.t0) / v.tween.dur), e = easeSpring(k), d = v.tween.from.distanceTo(v.tgt);
        v.pos.lerpVectors(v.tween.from, v.tgt, e); v.pos.y = Math.sin(k * Math.PI) * Math.min(0.45, 0.2 + d * 0.12);
        moveP = k; if (k >= 1) { v.tween = null; v.pos.copy(v.tgt); v.land = t; }
      } else { v.pos.copy(v.tgt); v.pos.y = 0; }
      v.moving = false;
    } else if (v.mode !== 'prep') { v.moving = false; if (it.moveP !== undefined && it.moveP !== null) moveP = it.moveP; if (it.landed) v.land = t; }
    if (v.dragging) v.moving = true;
    // 面向
    // 出手時鎖定攻擊對象（技能目標可能跟平常鎖定的不同），戰鬥中可以完全轉身背對鏡頭
    let ty = v.yaw === undefined ? 0 : (v.mode === 'prep' ? 0 : v.yaw), face = it.face;
    if (v.faceK && v.faceUntil > t && S3.V[v.faceK]) { const fv = S3.V[v.faceK]; face = [fv.pos.x, fv.pos.z]; }
    if (face && Math.hypot(face[0] - v.pos.x, face[1] - v.pos.z) > 0.05) { ty = Math.atan2(face[0] - v.pos.x, face[1] - v.pos.z); if (v.mode === 'prep') ty = Math.max(-1.95, Math.min(1.95, ty)); }
    else if (!face) ty = 0;
    let dy = ty - v.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    v.yaw += dy * Math.min(1, dt * (v.act ? 22 : 10));
    v.R.root.position.copy(v.pos); v.R.root.position.y += v.lift + groundH(v.pos.x, v.pos.z);
    if (v.enter) entranceFrame(v, t);
    else if (v.pop) { const k = Math.max(0, Math.min(1, (t - v.pop) / 0.4)); v.R.root.scale.setScalar((v.scale || 1) * Math.max(0.01, ease.back(k))); if (k >= 1) v.pop = 0; }
    v.R.yaw.rotation.y = v.yaw;
    // 動作
    let act = null;
    if (v.act) { const p = (t - v.act.t0) / v.act.dur; if (p >= 1) v.act = null; else act = { kind: v.act.kind, p }; }
    const hitP = (t - v.hitT) / 0.18;
    const dead = v.deadT !== null ? (t - v.deadT) / 0.9 : undefined;
    if (!act && it.jumpP !== undefined && it.jumpP !== null && v.R.melee && ACT[v.unitKey] && ACT[v.unitKey].atk) act = { kind: 'atk', p: it.jumpP };
    const landP = v.land ? (t - v.land) / 0.28 : 1;
    if (v.R.olMat) v.R.olMat.visible = (S3.quality || 1) >= MODEL_CFG.OUTLINE_MIN_Q; // 手機太卡時自動關描邊
    poseRig(v.R, { t, moving: v.moving, moveP, land: landP < 1 ? landP : null, sleep: it.sleep, stun: it.stun, act, hit: hitP < 1 ? hitP : 0, dead, victory: it.victory });
    if (v.air || v.toss || v.airOff || v.nudge) { airFrame(v, t); nudgeFrame(v, t); }
    // 選取時浮起
    const liftT = v.dragging ? 0.45 : (S3.selK === k && v.mode === 'prep') ? 0.2 : 0;
    v.lift += (liftT - v.lift) * Math.min(1, dt * 12);
    const fl = Math.max(0, 1 - hitP) * 0.55;
    if (fl !== v.lastFl) { setFlash(v.R, fl); v.lastFl = fl; }
    const nightOn = S3.night > 0.5 && (ANIMALS[v.unitKey] || {}).traits && ANIMALS[v.unitKey].traits.includes('night');
    if (nightOn !== v.nightOn) { setNightEyes(v.R, nightOn); v.nightOn = nightOn; }
    const ghost = it.stealth ? 0.45 : it.mirror ? 0.7 : 0;
    if (ghost !== v.ghost) { // 半透明（草叢／陰影隱身）：固定繪製順序＋寫入深度，避免身體零件前後順序每格互換造成閃爍
      v.ghost = ghost; let oi = 0; v.R.root.traverse(o => { if (o.isMesh) o.renderOrder = ghost ? 40 + oi++ : 0; });
      for (const m of v.R.mats) { m.transparent = !!ghost || m.userData.op < 1; m.opacity = ghost || m.userData.op; m.depthWrite = true; m.needsUpdate = true; } }
    // 影子與圈
    const gone = dead !== undefined && dead > 0.8;
    const gh = groundH(v.pos.x, v.pos.z);
    v.blob.position.set(v.pos.x, 0.03 + Math.max(gh, waterTop(v.pos.x, v.pos.z)), v.pos.z); v.blob.scale.setScalar(0.38 * (v.scale || 1) * (1 + 0.5 * v.lift - 0.25 * Math.min(1, v.R.fly || 0))); v.blob.material.opacity = 0.25 * (1 - 0.8 * v.lift); v.blob.visible = !gone;
    v.ring.position.set(v.pos.x, 0.035 + Math.max(gh, waterTop(v.pos.x, v.pos.z)), v.pos.z); v.ring.visible = (!!it.color || S3.selK === k) && !gone;
    if (S3.selK === k) { v.ring.material.color.set('#ffd34d'); v.ring.scale.setScalar((v.scale || 1) * (1.05 + 0.08 * Math.sin(t * 6))); } else { v.ring.material.color.set(it.color || '#ffffff'); v.ring.scale.setScalar(v.scale || 1); }
    // 暈眩星星
    if (it.stun && !v.stunG && !gone) { v.stunG = new THREE.Group(); for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('star'), transparent: true, depthWrite: false })); s.scale.setScalar(0.16); v.stunG.add(s); } S3.unitRoot.add(v.stunG); }
    if (v.stunG) { if (!it.stun || gone) { S3.unitRoot.remove(v.stunG); disposeObj(v.stunG); v.stunG = null; } else { const top = v3top(v); v.stunG.position.copy(top).add(V3(0, -0.12, 0)); v.stunG.children.forEach((s, i) => { const a = t * 5 + i * 2.1; s.position.set(Math.cos(a) * 0.28, Math.sin(t * 7 + i) * 0.03, Math.sin(a) * 0.18); }); } }
    // 狀態小圖示（嘲諷、致盲、睡覺）
    const ic = gone ? null : it.sleep ? 'zz' : it.taunted ? 'exclaim' : it.blind ? 'question' : null;
    if (ic !== v.iconKey) { if (v.icon) { S3.unitRoot.remove(v.icon); disposeObj(v.icon); } v.icon = null; v.iconKey = ic; if (ic) { v.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(ic), transparent: true, depthWrite: false })); v.icon.scale.setScalar(0.3); S3.unitRoot.add(v.icon); } }
    if (v.icon) { v.icon.position.copy(v3top(v)).add(V3(0.25, 0.08 + Math.sin(t * 3) * 0.05, 0)); if (ic === 'zz') { v.icon.position.y += (t % 1.5) * 0.2; v.icon.material.opacity = 1 - (t % 1.5) / 1.5; } }
    // 增益光環
    const aura = gone ? null : it.buffAtk ? 0xffc94a : it.buffAs ? 0x7cc8ff : null;
    if (aura !== v.auraCol) { if (v.aura) { S3.unitRoot.remove(v.aura); disposeObj(v.aura); } v.aura = null; v.auraCol = aura; if (aura) { v.aura = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.9, 20, 1, true), new THREE.MeshBasicMaterial({ map: tex('beam'), color: aura, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); S3.unitRoot.add(v.aura); } }
    if (v.aura) { v.aura.position.set(v.pos.x, 0.45 + gh, v.pos.z); v.aura.rotation.y = t; v.aura.material.opacity = 0.25 + 0.12 * Math.sin(t * 5); }
    // 護盾
    const sh = !gone && it.shield > 0;
    if (sh && !v.bubble) { v.bubble = new THREE.Mesh(GEO.sph, new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.22, depthWrite: false })); S3.unitRoot.add(v.bubble); }
    if (!sh && v.bubble) { S3.unitRoot.remove(v.bubble); disposeObj(v.bubble); v.bubble = null; }
    if (v.bubble) { v.bubble.position.copy(v.pos).add(V3(0, 0.5 * (v.scale || 1) + (v.R.fly || 0) + gh, 0)); v.bubble.scale.setScalar(0.62 * (v.scale || 1)); }
    // 血條
    const top = toScreen(v3top(v));
    const show = !gone && top[2] < 1;
    // 頭頂血條：只在數值有變時才寫 DOM（大量單位時省很多排版時間）
    const setS = (el, key, val) => { if (v.css[key] !== val) { v.css[key] = val; el.style[key === 'disp' ? 'display' : key === 'tf' ? 'transform' : 'width'] = val; } };
    v.css = v.css || {};
    setS(v.hb, 'disp', show ? '' : 'none');
    if (show) {
      setS(v.hb, 'tf', `translate(${Math.round(top[0])}px,${Math.round(top[1])}px)`);
      const mh = it.maxhp || 1, hp = Math.max(0, it.hp === undefined ? mh : it.hp) / mh;
      v.hpShow += (hp - v.hpShow) * Math.min(1, dt * 14);
      v.lag += (v.hpShow - v.lag) * Math.min(1, dt * (v.lag > v.hpShow ? 2.2 : 20));
      setS(v.el.hp, 'hpw', (v.hpShow * 100).toFixed(0) + '%');
      setS(v.el.lag, 'lagw', (v.lag * 100).toFixed(0) + '%');
      setS(v.el.sh, 'shw', Math.min(100, (it.shield || 0) / mh * 100).toFixed(0) + '%');
      // 技能條（照聯盟戰棋：血條正下方的藍條，滿了發亮、放技能時閃一下）；沒有技能的不顯示
      const hasMp = it.manaMax && it.manaMax < 999, mpf = hasMp ? Math.min(1, (it.mana || 0) / it.manaMax) : 0;
      setS(v.el.mp, 'mpw', (mpf * 100).toFixed(0) + '%');
      const mcls = !hasMp ? 'nomp' : mpf >= 1 ? 'full' : '';
      if (v.mcls !== mcls) { if (v.mcls === 'full' && mcls === '' && v.mode === 'combat') { v.el.mpb.classList.remove('cast'); void v.el.mpb.offsetWidth; v.el.mpb.classList.add('cast'); } v.mcls = mcls; v.el.mpb.classList.toggle('nomp', mcls === 'nomp'); v.el.mpb.classList.toggle('full', mcls === 'full'); }
      if (v.mlock !== !!it.mlock) { v.mlock = !!it.mlock; v.el.mpb.classList.toggle('lock', v.mlock); } // 鎖能量時能量條變灰色斜紋
      // 裝備小圖示（血條下方，不用點進去看）
      const ik = (it.items || []).join(',');
      if (v.ik !== ik) { v.ik = ik; v.el.it.innerHTML = (it.items || []).map(x => `<span>${iconItem(x)}</span>`).join(''); }
      if (v.tkMax !== mh) { v.tkMax = mh; v.el.tk.style.backgroundSize = `${Math.max(4, 300 / mh * 100)}% 100%`; }
    }
    // 死亡後移除（戰鬥中）
    if (dead !== undefined && dead > 1.2 && v.mode === 'combat') { v.R.root.visible = false; }
  }
  // 格子：淡入淡出，高亮的格子呼吸
  const br = 0.55 + 0.45 * Math.sin(t * 5);
  for (const tl of S3.tiles) { const u = tl.userData, target = u.hl !== undefined ? 0.5 + 0.3 * br : (S3.gridOn && u.vr < S3.gridRows ? 0.22 : 0); tl.material.opacity += (target - tl.material.opacity) * Math.min(1, dt * 12); }
  for (const o of S3.hlObjs || []) if (o.material.emissive) o.material.emissive.setHex(o.userData.hl).multiplyScalar(br);
  // 特效
  s3FxFrame(dt, t);
  S3.renderer.render(S3.scene, S3.cam);
  S3.calls = S3.renderer.info.render.calls;
}

// ---- 特效 ----
const FX_MAX = 260; // 同時存在的特效上限，超過就略過小粒子（效能調整參數）
function sprite(texName, pos, o) {
  o = o || {};
  if (S3.fx.length > FX_MAX * (S3.quality || 1) && !o.important) return { o: new THREE.Object3D(), dummy: true };
  const m = new THREE.SpriteMaterial({ map: tex(texName), color: o.color !== undefined ? o.color : 0xffffff, transparent: true, depthWrite: false, depthTest: o.depthTest !== false, opacity: o.opacity || 1, rotation: o.rot || 0, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending });
  const s = new THREE.Sprite(m); s.position.copy(pos); s.scale.setScalar(o.scale || 0.5); s.renderOrder = 5;
  S3.fxRoot.add(s);
  const f = { o: s, t0: nowS() + (o.delay || 0), life: o.life || 0.5, s0: o.scale || 0.5, s1: o.scale1 !== undefined ? o.scale1 : (o.scale || 0.5), vel: o.vel || null, g: o.g || 0, spin: o.spin || 0, fadeIn: o.fadeIn || 0, op: o.opacity || 1, follow: o.follow || null, off: o.off || null, sx: o.sx || 1 };
  s.visible = !o.delay;
  S3.fx.push(f); return f;
}
function meshFx(obj, o) { S3.fxRoot.add(obj); const f = Object.assign({ o: obj, t0: nowS() + (o.delay || 0), life: 0.5 }, o); obj.visible = !o.delay; S3.fx.push(f); return f; }
function groundRing(pos, color, size, life, delay) {
  if (!GEO.fxRing) GEO.fxRing = new THREE.RingGeometry(0.75, 1, 40);
  const m = new THREE.Mesh(GEO.fxRing, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.03 + groundH(pos.x, pos.z), pos.z);
  return meshFx(m, { life: life || 0.6, ring: size || 1.5, delay });
}
// ---- 戰鬥開場登場特效（依第一個羈絆分 7 種；ENTRANCE 可調每種時間）----
const ENTRANCE = { STAGGER: 0.05, SPAN: 0.8, DUR: { forest: 0.45, savanna: 0.5, water: 0.45, sky: 0.5, pack: 0.55, armor: 0.42, night: 0.55, pop: 0.35 } };
function entranceFrame(v, t) {
  const e = v.enter, k = (t - e.t0) / e.dur, R = v.R.root, base = v.scale || 1;
  if (k >= 1) { v.enter = null; R.scale.setScalar(base); return; }
  const p = V3(v.pos.x, groundH(v.pos.x, v.pos.z), v.pos.z);
  const fire = (name, fn) => { if (!e[name]) { e[name] = true; try { fn(); } catch (x) {} } };
  if (k < 0) { R.scale.setScalar(0.001); return; }
  let dy = 0, sm = 1;
  switch (e.kind) {
    case 'forest': // 葉子旋風裡冒出來
      fire('a', () => { groundRing(p, 0x6fae4a, 1.1, 0.5); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; sprite('leaf', p.clone().add(V3(Math.cos(a) * 0.45, 0.15, Math.sin(a) * 0.45)), { color: i % 2 ? 0x8cc85a : 0x5f9e3c, scale: 0.16, scale1: 0.05, life: 0.7, vel: V3(-Math.sin(a) * 1.6, 1.6, Math.cos(a) * 1.6), spin: 6 }); } sfx('place', 70); });
      sm = ease.back(Math.min(1, k * 1.2)); break;
    case 'savanna': // 跳進場、落地揚塵
      dy = Math.sin(k * Math.PI) * 1.1; sm = 0.5 + 0.5 * Math.min(1, k * 2);
      if (k > 0.85) fire('a', () => { burst(p.clone().add(V3(0, 0.1, 0)), 8, { tex: 'puff', color: 0xd9b77a, scale: 0.22, scale1: 0.4, speed: 1.4, up: 0.6, g: 0, life: 0.5 }); groundRing(p, 0xe6c88a, 0.9, 0.4); sfx('place', 70); });
      break;
    case 'water': // 水花裡蹦出來
      fire('a', () => { burst(p.clone().add(V3(0, 0.1, 0)), 12, { tex: 'drop', scale: 0.11, speed: 1.8, up: 3, g: -7, life: 0.6 }); groundRing(p, 0x6fb6e0, 1.0, 0.55); groundRing(p, 0xd6eef7, 0.6, 0.45, 0.1); sfx('splash', 90); });
      dy = -0.8 * (1 - ease.out(k)) + Math.sin(k * Math.PI) * 0.4; sm = Math.min(1, 0.3 + k * 1.4); break;
    case 'sky': // 從空中俯衝下來，羽毛散開
      dy = 4.2 * Math.pow(1 - k, 2); sm = 1;
      if (k > 0.9) fire('a', () => { burst(p.clone().add(V3(0, 0.4, 0)), 7, { tex: 'feather', scale: 0.15, speed: 1.4, up: 1.4, g: -1.5, life: 0.9, spin: 4 }); groundRing(p, 0xffffff, 0.8, 0.35); sfx('place', 70); });
      break;
    case 'pack': // 小土堆裡彈出來
      fire('a', () => { burst(p.clone().add(V3(0, 0.08, 0)), 7, { tex: 'puff', color: 0x9a7350, scale: 0.2, scale1: 0.32, speed: 0.9, up: 0.9, g: -1, life: 0.45 }); });
      if (k < 0.25) { R.scale.setScalar(0.001); return; }
      { const q = (k - 0.25) / 0.75; dy = Math.sin(q * Math.PI) * 1.4; sm = ease.back(Math.min(1, q * 1.6)); }
      fire('b', () => sfx('place', 70)); break;
    case 'armor': // 從高處重重砸下，震波
      dy = 3.4 * (1 - k * k); sm = 1;
      if (k > 0.92) fire('a', () => { groundRing(p, 0xb0a89a, 1.3, 0.5); groundRing(p, 0xe8e0d0, 0.8, 0.4, 0.08); burst(p.clone().add(V3(0, 0.1, 0)), 10, { tex: 'puff', color: 0xbfb4a0, scale: 0.24, scale1: 0.4, speed: 1.8, up: 0.5, g: 0, life: 0.5 }); S3.shake = Math.min(0.14, Math.max(S3.shake, 0.06)); sfx('thud', 90); });
      break;
    case 'night': // 紫色煙霧中現身
      fire('a', () => { for (let i = 0; i < 6; i++) sprite('cloud', p.clone().add(V3((Math.random() - .5) * 0.7, 0.2 + Math.random() * 0.5, (Math.random() - .5) * 0.7)), { color: i % 2 ? 0x7a5ab8 : 0x4a3a78, scale: 0.35, scale1: 0.8, life: 0.8, opacity: 0.75, vel: V3(0, 0.4, 0) }); sprite('star', p.clone().add(V3(0, 0.8, 0)), { color: 0xd8c8ff, scale: 0.3, scale1: 0.05, life: 0.5, add: true }); sfx('magic', 90); });
      if (k < 0.3) { R.scale.setScalar(0.001); return; }
      sm = ease.back(Math.min(1, (k - 0.3) / 0.7 * 1.3)); break;
    default: sm = ease.back(k); // 中立寶箱、召喚物
  }
  if (k > 0.8) fire('sig', () => { const f = ENTR_SIG[v.unitKey]; if (f) f(p, v); }); // 每隻動物的招牌登場小動作
  R.position.y += dy; R.scale.setScalar(base * Math.max(0.01, sm));
}
const ENTR_SIG = {
  hedgehog: p => burst(p.clone().add(V3(0, 0.3, 0)), 6, { tex: 'shard', color: 0xa8b0c0, scale: 0.1, speed: 1.4, up: 1, g: -4, life: 0.4 }),
  squirrel: p => sprite('leaf', p.clone().add(V3(0.2, 0.9, 0)), { color: 0xc89a5a, scale: 0.2, scale1: 0.1, life: 0.6, vel: V3(0, 1, 0), g: -3 }),
  wolf: p => sprite('note', p.clone().add(V3(0, 1.0, 0)), { scale: 0.2, scale1: 0.35, life: 0.8, vel: V3(0.2, 0.8, 0), color: 0xbfe2ff }),
  frog: p => groundRing(p, 0x9fd3ef, 0.6, 0.4),
  bat: p => burst(p.clone().add(V3(0, 0.6, 0)), 4, { tex: 'cloud', color: 0x4a2a5a, scale: 0.15, speed: 1, up: 0.6, g: 0, life: 0.5 }),
  redpanda: p => sprite('heart', p.clone().add(V3(0, 1, 0)), { scale: 0.2, scale1: 0.3, life: 0.7, vel: V3(0, 0.7, 0) }),
  skunk: p => sprite('cloud', p.clone().add(V3(-0.2, 0.4, 0)), { color: 0x9bc24a, scale: 0.25, scale1: 0.5, life: 0.8, opacity: 0.6, vel: V3(0, 0.4, 0) }),
  croc: p => burst(p.clone().add(V3(0, 0.1, 0)), 5, { tex: 'drop', scale: 0.08, speed: 1, up: 1.5, g: -6, life: 0.4 }),
  bee: p => burst(p.clone().add(V3(0, 0.6, 0)), 5, { tex: 'spark', color: 0xffd34d, scale: 0.07, speed: 1, up: 0.5, g: 0, add: true, life: 0.5 }),
  koala: p => sprite('zz', p.clone().add(V3(0.2, 1, 0)), { scale: 0.2, scale1: 0.3, life: 0.8, vel: V3(0.2, 0.6, 0) }),
  cheetah: p => sprite('puff', p.clone().add(V3(-0.4, 0.2, 0)), { color: 0xffd090, scale: 0.3, scale1: 0.6, life: 0.4, opacity: 0.6, vel: V3(-1.5, 0, 0) }),
  octopus: p => burst(p.clone().add(V3(0, 0.2, 0)), 4, { tex: 'cloud', color: 0x3a2a48, scale: 0.15, speed: 0.8, up: 0.4, g: 0, life: 0.5 }),
  owl: p => sprite('star', p.clone().add(V3(0, 1.1, 0)), { color: 0xfff2b0, scale: 0.15, scale1: 0.35, life: 0.6, add: true }),
  elephant: p => { groundRing(p, 0xd8c8a8, 1.3, 0.5); S3.shake = Math.min(0.12, Math.max(S3.shake, 0.05)); },
  lion: p => sprite('puff', p.clone().add(V3(0, 0.6, 0)), { color: 0xffd34d, scale: 0.8, scale1: 0.1, life: 0.35, add: true, opacity: 0.6 }),
  penguin: p => burst(p.clone().add(V3(0, 0.2, 0)), 5, { tex: 'shard', color: 0xdff2ff, scale: 0.08, speed: 1.2, up: 1, g: -4, life: 0.4 }),
  rhino: p => sprite('puff', p.clone().add(V3(0.3, 0.6, 0.2)), { color: 0xeeeeee, scale: 0.15, scale1: 0.4, life: 0.5, vel: V3(1, 0.3, 0), opacity: 0.6 }),
  chameleon: p => { const cols = [0xff6a6a, 0xffd34d, 0x8fd35a, 0x6fb6ff]; for (let i = 0; i < 4; i++) sprite('spark', p.clone().add(V3(0, 0.5, 0)), { color: cols[i], scale: 0.08, scale1: 0.02, life: 0.5, vel: V3(Math.cos(i * 1.6) * 1.2, 1, Math.sin(i * 1.6) * 1.2), g: -3, add: true }); },
  fox: p => sprite('flame', p.clone().add(V3(0.25, 0.5, 0)), { color: 0xff9a3a, scale: 0.18, scale1: 0.05, life: 0.6, vel: V3(0, 0.8, 0), add: true }),
  eagle: p => sprite('ring', p.clone().add(V3(0, 0.3, 0)), { color: 0xffffff, scale: 0.3, scale1: 1.0, life: 0.4, add: true, opacity: 0.6 }),
  eel: p => lightning(p.clone().add(V3(0, 1.2, 0)), p.clone().add(V3(0, 0.1, 0)), 0xfff27a, 0.2),
  gorilla: p => { groundRing(p, 0xff8a4a, 1.1, 0.4); sprite('anger', p.clone().add(V3(0.2, 1.1, 0)), { scale: 0.18, scale1: 0.35, life: 0.6 }); },
  whale: p => burst(p.clone().add(V3(0, 0.8, 0)), 10, { tex: 'drop', scale: 0.1, speed: 0.6, up: 3, g: -7, life: 0.7 }),
  peacock: p => { for (let i = 0; i < 6; i++) sprite('feather', p.clone().add(V3(0, 0.6, 0)), { color: i % 2 ? 0x3f8a5a : 0x4a8aff, scale: 0.16, scale1: 0.08, life: 0.7, vel: V3(Math.cos(i) * 1.2, 0.8, Math.sin(i) * 1.2), g: -1, spin: 3 }); },
  deer: p => burst(p.clone().add(V3(0, 0.8, 0)), 5, { tex: 'leaf', color: 0x9ad86a, scale: 0.1, speed: 0.8, up: 1, g: -2, life: 0.6 }),
  zebra: p => sprite('star', p.clone().add(V3(0, 1.0, 0)), { scale: 0.18, scale1: 0.05, life: 0.6, vel: V3(0, 0.8, 0) }),
  hippo: p => burst(p.clone().add(V3(0, 0.2, 0)), 6, { tex: 'drop', scale: 0.1, speed: 1.2, up: 1.6, g: -5, life: 0.5 }),
  parrot: p => sprite('note', p.clone().add(V3(0.2, 1.0, 0)), { scale: 0.2, scale1: 0.35, life: 0.8, vel: V3(0.3, 0.8, 0), color: 0xe8423a }),
  giraffe: p => sprite('puff', p.clone().add(V3(0, 1.4, 0.2)), { color: 0xf0c45a, scale: 0.25, scale1: 0.05, life: 0.5, add: true }),
  flamingo: p => sprite('ring', p.clone().add(V3(0, 0.05, 0)), { color: 0xf49ab4, scale: 0.3, scale1: 1.0, life: 0.6, add: true }),
  shark: p => sprite('cloud', p.clone().add(V3(0, 0.1, 0)), { color: 0x7fc8ff, scale: 0.3, scale1: 0.7, life: 0.5, opacity: 0.6 }),
  panda: p => burst(p.clone().add(V3(0, 0.6, 0)), 4, { tex: 'leaf', color: 0x7ab84a, scale: 0.12, speed: 1, up: 1.2, g: -3, life: 0.6 }),
  komodo: p => sprite('cloud', p.clone().add(V3(0, 0.2, 0.3)), { color: 0x8fd34a, scale: 0.2, scale1: 0.4, life: 0.6, opacity: 0.6 }),
};
function burst(pos, n, o) {
  n = Math.max(1, Math.round(n * (S3.quality || 1)));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = (o.speed || 2) * (0.5 + Math.random());
    sprite(o.tex || 'puff', pos.clone(), { color: o.color, scale: (o.scale || 0.2) * (0.7 + Math.random() * 0.6), scale1: o.scale1 !== undefined ? o.scale1 : 0.02, life: (o.life || 0.5) * (0.7 + Math.random() * 0.6), vel: V3(Math.cos(a) * sp, (o.up || 1.5) * Math.random() + (o.up0 || 0), Math.sin(a) * sp), g: o.g === undefined ? -4 : o.g, add: o.add, delay: o.delay, spin: (Math.random() - .5) * (o.spin || 0) });
  }
}
const kind_trail_ok = () => (S3.quality || 1) > 0.5 && S3.fx.length < FX_MAX * 0.7; // 特效太多或畫質降低時不拖尾
function projectile(from, to, kind, dur, o) {
  o = o || {};
  let obj;
  if (kind === 'acorn') { obj = new THREE.Group(); obj.add(mesh(GEO.sph, T('#b07a42'), [0, 0, 0], [0.09, 0.11, 0.09])); obj.add(mesh(GEO.sph, T('#7a4f28'), [0, 0.07, 0], [0.1, 0.05, 0.1])); }
  else if (kind === 'ink') obj = mesh(GEO.sph, T('#2d2438'), null, 0.11);
  else if (kind === 'stink') obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('cloud'), color: 0x9bc24a, transparent: true, depthWrite: false }));
  else if (kind === 'feather') obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('feather'), transparent: true, depthWrite: false }));
  else if (kind === 'squirrel') obj = buildAnimal('squirrel').root;
  else obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('spark'), color: o.color || 0xffffff, transparent: true, depthWrite: false }));
  if (obj.isSprite) obj.scale.setScalar(o.scale || 0.3);
  const trail = o.trail !== undefined ? o.trail : ({ acorn: 0xc89a6a, ink: 0x4a3a5a, stink: 0x9bc24a, feather: 0xffffff }[kind] || (o.color !== undefined ? o.color : 0xffffff));
  const end = o.onEnd, land = to.clone();
  return meshFx(obj, { proj: { from: from.clone(), to: to.clone(), arc: o.arc === undefined ? 0.6 : o.arc, spin: o.spin || 0, toV: o.toV, trail: o.noTrail ? 0 : trail }, life: dur, delay: o.delay,
    onEnd: () => { sprite('puff', land, { color: 0xffffff, scale: 0.3, scale1: 0.04, life: 0.14, add: true, opacity: 0.8 }); if (end) end(); } }); // 命中一閃
}
function s3FxFrame(dt, t) {
  // 先換成新陣列再跑：onEnd／custom 裡新增的特效會進新陣列，不會變成永遠留在場上的孤兒
  const list = S3.fx; S3.fx = [];
  const keep = list.filter(f => {
    if (t < f.t0) return true;
    f.o.visible = true;
    const p = (t - f.t0) / f.life;
    if (p >= 1) { S3.fxRoot.remove(f.o); disposeObj(f.o); if (f.onEnd) f.onEnd(); return false; }
    if (f.proj) {
      const P = f.proj, to = P.toV && S3.V[P.toV] ? S3.V[P.toV].pos.clone().add(V3(0, 0.45, 0)) : P.to;
      f.o.position.lerpVectors(P.from, to, p); f.o.position.y += Math.sin(p * Math.PI) * P.arc;
      if (P.spin) f.o.rotation.x += dt * P.spin;
      if (P.trail && kind_trail_ok()) { P.ta = (P.ta || 0) + dt; if (P.ta > 0.035) { P.ta = 0; sprite('puff', f.o.position.clone(), { color: P.trail, scale: 0.13, scale1: 0.02, life: 0.28, opacity: 0.55 }); } } // 投射物拖尾
      return true;
    }
    if (f.ring) { const s = 0.3 + f.ring * ease.out(p); f.o.scale.setScalar(s); f.o.material.opacity = 0.85 * (1 - p); return true; }
    if (f.tongue) { const fv = S3.V[f.tongue.from], tv = S3.V[f.tongue.to]; if (!fv) return true; const a = fv.pos.clone().add(V3(0, 0.35 * (fv.scale || 1), 0)); const b = tv ? tv.pos.clone().add(V3(0, 0.4, 0)) : f.tongue.pt; const ext = bell(p, 0, 1) ; const d = a.distanceTo(b) * ext; f.o.position.lerpVectors(a, b, ext * 0.5); f.o.scale.set(0.07, Math.max(0.01, d), 0.07); f.o.quaternion.setFromUnitVectors(V3(0, 1, 0), b.clone().sub(a).normalize()); return true; }
    if (f.custom) { f.custom(f, p, dt); return true; }
    // 一般精靈
    const o = f.o;
    if (f.vel) { o.position.addScaledVector(f.vel, dt); f.vel.y += f.g * dt; }
    if (f.follow && S3.V[f.follow]) o.position.copy(S3.V[f.follow].pos).add(f.off);
    const s = f.s0 + (f.s1 - f.s0) * ease.out(p);
    o.scale.set(s * f.sx, s, s);
    if (o.material) { o.material.opacity = f.op * (f.fadeIn && p < f.fadeIn ? p / f.fadeIn : 1) * (p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1); if (f.spin) o.material.rotation += f.spin * dt; }
    return true;
  });
  S3.fx = keep.concat(S3.fx);
}
const posOf = (k, h) => { const v = S3.V[k]; if (!v) return null; const p = v.pos.clone().add(V3(0, (h === undefined ? 0.45 : h) * (v.scale || 1) + (v.R.fly || 0) * 0.6 + groundH(v.pos.x, v.pos.z), 0)); if (v.airOff) p.add(v.airOff); return p; };
function slash(texName, at, o) { o = o || {}; return sprite(texName, at, { scale: o.scale || 0.7, scale1: (o.scale || 0.7) * 1.25, life: o.life || 0.28, rot: o.rot || 0, color: o.color, add: false, delay: o.delay, fadeIn: 0.15 }); }

// 特效播放：name 由 ACT 定義
// v0.12.7：所有攻擊／技能共用的細節層（打擊閃光、方向火花、施法光環與光柱）
const FX_THEME = { forest: 0x8fd35a, savanna: 0xffc15a, water: 0x7fc8ff, sky: 0xf2f6ff, pack: 0xffa060, armor: 0xd8d0c0, night: 0xb08cff };
let SKILL_FX = null;
function fxDetail(name, sv, A, sp, tp, tv) {
  if (!SKILL_FX) { SKILL_FX = new Set(); for (const k in ACT) if (ACT[k].skill && ACT[k].skill.fx) SKILL_FX.add(ACT[k].skill.fx); }
  const tr = ((ANIMALS[sv.unitKey] || {}).traits || [])[0], col = FX_THEME[tr] || 0xffffff, q = S3.quality || 1;
  if (SKILL_FX.has(name)) { // 施法：腳下光環＋往上飄的光點＋頭上一顆星
    groundRing(A, col, 1.5, 0.55); groundRing(A, 0xffffff, 0.9, 0.4, 0.06);
    for (let i = 0; i < Math.round(6 * q); i++) sprite('spark', A.clone().add(V3((Math.random() - .5) * 0.6, 0.1, (Math.random() - .5) * 0.6)), { color: col, scale: 0.12, scale1: 0.03, life: 0.7, vel: V3(0, 1.6 + Math.random(), 0), g: 0, add: true, delay: i * 0.03 });
    sprite('star', sp.clone().add(V3(0, 0.55, 0)), { color: col, scale: 0.15, scale1: 0.45, life: 0.45, add: true, opacity: 0.9 });
    if (tv) sprite('puff', tp.clone(), { color: 0xffffff, scale: 0.6, scale1: 0.05, life: 0.22, add: true, delay: 0.12 });
  } else if (tv) { // 普攻命中：一閃＋順著攻擊方向噴的小火花
    sprite('puff', tp.clone(), { color: 0xffffff, scale: 0.38, scale1: 0.05, life: 0.14, add: true, opacity: 0.85 });
    const dir = tp.clone().sub(sp).setY(0); if (dir.lengthSq() > 1e-4) dir.normalize();
    for (let i = 0; i < Math.round(3 * q); i++) sprite('spark', tp.clone(), { color: col, scale: 0.08, scale1: 0.02, life: 0.25, vel: dir.clone().multiplyScalar(1.8 + Math.random()).add(V3((Math.random() - .5) * 1.2, 0.6 + Math.random(), (Math.random() - .5) * 1.2)), g: -4, add: true });
  }
}
// v0.12.11：每隻動物獨有的大招演出（疊在原本特效上）；五費大招另外整個畫面閃一下
// ---- 技能的立體動作（純畫面，不影響戰鬥結果） ----
// kind：leap＝跳到目標砸下、jump＝原地跳起砸地、dive＝飛高再俯衝、breach＝鑽進地底從目標腳下竄出、blink＝瞬移連斬、float＝浮空施法、flip＝空翻
// 可調：h＝高度（格）、spin＝空中轉幾圈、flip＝翻幾圈、toss＝把目標打飛的高度（0＝不打飛）、shake＝落地震動
const AIR_CFG = {
  hedgehog: { kind: 'jump', h: 1.0, toss: 0, shake: 0.12 }, // v0.13.19 配合新技能動作
  squirrel: { kind: 'jump', h: 0.5, toss: 0, shake: 0.04 }, // v0.13.16 配合新技能動作
  wolf: { kind: 'jump', h: 0.2, toss: 0, shake: 0.08 }, // v0.13.17 配合新技能動作
  bat: { kind: 'dive', h: 2.4, toss: 0, shake: 0.06 },
  redpanda: { kind: 'jump', h: 0.2, toss: 0, shake: 0.14 }, // v0.13.17 配合新技能動作
  croc: { kind: 'breach', h: 1.6, toss: 1.4, shake: 0.12 }, // v0.13.19 配合新技能動作
  bee: { kind: 'float', h: 0.6, toss: 0, shake: 0.04 }, // v0.13.15 畫 8 字＋轉身刺，不再俯衝轉圈
  koala: { kind: 'leap', h: 1.5, toss: 1.0, shake: 0.2 }, // v0.13.17 配合新技能動作
  cheetah: { kind: 'blink', h: 0.4, toss: 0, shake: 0.1 },
  octopus: { kind: 'float', h: 0.6, toss: 0, shake: 0 }, // v0.13.18 配合新技能動作
  owl: { kind: 'dive', h: 3.0, toss: 0.6, shake: 0.08 },
  elephant: { kind: 'jump', h: 0.4, toss: 1.6, shake: 0.32 }, // v0.13.18 配合新技能動作
  lion: { kind: 'jump', h: 0.3, toss: 1.2, shake: 0.26 }, // v0.13.18 配合新技能動作
  penguin: { kind: 'leap', h: 0.25, toss: 1.4, shake: 0.1 }, // v0.13.14 肚皮貼地滑，不再翻跳；臭鼬改原地倒立（拿掉空翻）
  rhino: { kind: 'leap', h: 0.15, toss: 2.2, shake: 0.2 }, // v0.13.14 貼地連撞
  chameleon: { kind: 'blink', h: 0.6, toss: 0, shake: 0.06 },
  fox: { kind: 'leap', h: 3.0, toss: 0.6, shake: 0.1 }, // v0.13.17 配合新技能動作
  eagle: { kind: 'dive', h: 3.6, toss: 0, shake: 0.12 },
  eel: { kind: 'breach', h: 2.2, spin: 1, toss: 1.0, shake: 0.1 },
  gorilla: { kind: 'jump', h: 0.5, toss: 1.4, shake: 0.34 }, // v0.13.14 捶胸時小跳，第一拳落地震動
  whale: { kind: 'breach', h: 3.6, flip: 0.5, toss: 1.8, shake: 0.36 },
  peacock: { kind: 'float', h: 0.3, toss: 0, shake: 0 }, // v0.13.18 配合新技能動作
  komodo: { kind: 'leap', h: 1.0, toss: 1.0, shake: 0.16 }, // v0.13.19 配合新技能動作
  kingboar: { kind: 'jump', h: 2.4, toss: 1.6, shake: 0.36 },
  deer: { kind: 'jump', h: 0.4, toss: 0, shake: 0 }, // v0.13.16 配合新技能動作
  zebra: { kind: 'jump', h: 0.3, toss: 1.0, shake: 0.08 }, // v0.13.15 轉身後踢，拿掉後空翻
  hippo: { kind: 'leap', h: 1.6, toss: 0.8, shake: 0.24 },
  parrot: { kind: 'float', h: 0.8, toss: 0, shake: 0.04 }, // v0.13.16 配合新技能動作
  giraffe: { kind: 'jump', h: 0.3, toss: 1.2, shake: 0.14 }, // v0.13.15 甩一圈改由身體動作做
  flamingo: { kind: 'float', h: 0.3, toss: 0, shake: 0 }, // v0.13.16 配合新技能動作
  shark: { kind: 'breach', h: 2.8, flip: 1, toss: 1.4, shake: 0.16 },
  panda: { kind: 'leap', h: 0.6, toss: 1.0, shake: 0.26 }, // v0.13.19 配合新技能動作
};
const AIR_ON = { on: true };
const DEMO_CAM = { x: 0, y: 8.6, z: 9.6 }, DEMO_CAM_ATK = { x: 2.2, y: 4.6, z: 5.6 }; // 普攻展示鏡頭更近、稍微側面 // 設成 false 可整個關掉立體技能動作
function airStart(v, key, tk, dur, hit) {
  const C = AIR_CFG[key]; if (!C || !AIR_ON.on || !v) return;
  const tv = tk !== undefined ? S3.V[tk] : null;
  const to = tv ? V3(tv.pos.x - v.pos.x, 0, tv.pos.z - v.pos.z) : V3(0, 0, 0), d = to.length();
  if (d > 0.01) to.multiplyScalar(Math.max(0, d - (C.kind === 'breach' ? 0.1 : 0.55)) / d); // 停在目標前面
  v.air = { C, t0: nowS(), dur, hit, to, tk, fx: {} };
}
function airToss(v, h) { if (!v || !h || !AIR_ON.on) return; v.toss = { t0: nowS(), h, dur: 0.5 + h * 0.18, sp: (Math.random() < .5 ? -1 : 1) }; }
const tri = q => 4 * q * (1 - q);
function airFrame(v, t) {
  const R = v.R; v.airOff = v.airOff || V3(0, 0, 0); v.airOff.set(0, 0, 0);
  let pitch = 0, roll = 0;
  if (v.air) {
    const a = v.air, C = a.C, p = (t - a.t0) / a.dur, h = Math.max(0.15, Math.min(0.85, a.hit)), H = C.h;
    if (p >= 1 || v.deadT !== null) v.air = null;
    else {
      { const tv = S3.V[a.tk]; if (tv && tv.deadT === null) { a.to.set(tv.pos.x - v.pos.x, 0, tv.pos.z - v.pos.z); const d = a.to.length(); if (d > 0.01) a.to.multiplyScalar(Math.max(0, d - (C.kind === 'breach' ? 0.1 : 0.55)) / d); } } // 目標或自己移動（衝刺技）時跟著更新，避免重複位移
      let fwd = 0, y = 0, spin = 0; const once = (n, f) => { if (!a.fx[n]) { a.fx[n] = 1; try { f(); } catch (e) {} } };
      const back = q => { if (q < 0.25) return; const q2 = (q - 0.25) / 0.75; fwd = 1 - ease.inOut(q2); y = 0.5 * tri(q2); };
      const here = () => v.pos.clone().add(V3(a.to.x * fwd, groundH(v.pos.x, v.pos.z), a.to.z * fwd));
      if (C.kind === 'leap') {
        if (p < h) { const q = p / h; fwd = ease.inOut(q); y = H * tri(q); pitch = -0.5 + 1.3 * q; pitch += -Math.PI * 2 * (C.flip || 0) * ease.inOut(q); }
        else { fwd = 1; back((p - h) / (1 - h)); }
      } else if (C.kind === 'jump') {
        if (p < h) { const q = p / h; y = q < 0.62 ? H * ease.out(q / 0.62) : H * (1 - Math.pow((q - 0.62) / 0.38, 2)); spin = (C.spin || 0) * ease.inOut(q); pitch = -Math.PI * 2 * (C.flip || 0) * ease.inOut(q); }
      } else if (C.kind === 'dive') {
        const r = 0.55 * h;
        if (p < r) { const q = p / r; y = H * ease.out(q); fwd = -0.18 * Math.sin(q * Math.PI); spin = (C.spin || 0) * q; pitch = -0.6 * q; }
        else if (p < h) { const q = (p - r) / (h - r); y = H * (1 - q * q); fwd = q * q; pitch = -0.6 + 1.8 * q; spin = C.spin || 0; }
        else { fwd = 1; back((p - h) / (1 - h)); }
      } else if (C.kind === 'breach') {
        const s1 = 0.3 * h, s2 = 0.62 * h, D = -1.8;
        if (p < s1) { const q = p / s1; y = D * ease.inOut(q); pitch = 0.8 * q; once('dig', () => { const P = here(); burst(P.clone().add(V3(0, 0.1, 0)), 10, { color: 0xbfa880, scale: 0.22, speed: 1.6, up: 1.4, g: -5, life: 0.5 }); groundRing(P, 0x9a8a6a, 0.9, 0.4); }); }
        else if (p < s2) { const q = (p - s1) / (s2 - s1); y = D; fwd = ease.inOut(q); once('trail', () => { for (let i = 0; i < 6; i++) at(i * 0.05, () => { const P = v.pos.clone().add(V3(a.to.x * i / 5, groundH(v.pos.x, v.pos.z) + 0.05, a.to.z * i / 5)); burst(P, 3, { color: 0xbfa880, scale: 0.16, speed: 0.8, up: 1, g: -4, life: 0.4 }); }); }); }
        else if (p < h) { const q = (p - s2) / (h - s2); fwd = 1; y = D + (H - D) * ease.out(q); pitch = -0.9 + 0.6 * q; spin = (C.spin || 0) * q; pitch += -Math.PI * 2 * (C.flip || 0) * q;
          once('erupt', () => { const P = here(); groundRing(P, 0x8fd0ff, 1.8, 0.6); groundRing(P, 0xe8f6ff, 1.1, 0.5, 0.06); burst(P.clone().add(V3(0, 0.2, 0)), 22, { tex: 'drop', scale: 0.16, speed: 2.6, up: 4.2, g: -9, life: 0.9 }); burst(P.clone().add(V3(0, 0.1, 0)), 10, { color: 0xbfa880, scale: 0.3, speed: 2.2, up: 2, g: -6, life: 0.7 }); S3.shake = Math.max(S3.shake, C.shake || 0.1); airToss(S3.V[a.tk], C.toss); sfx('splashBig', 80); }); }
        else { const q = (p - h) / (1 - h); fwd = 1; if (q < 0.4) { y = H * (1 - Math.pow(q / 0.4, 2)); pitch = 0.9 * q / 0.4; } else { pitch = 0; back((q - 0.4) / 0.6 * 1 + 0); } if (q >= 0.4) once('land', () => { const P = here(); groundRing(P, 0xd8c8a8, 1.4, 0.5); burst(P.clone().add(V3(0, 0.1, 0)), 10, { tex: 'drop', scale: 0.12, speed: 2, up: 2, g: -7, life: 0.6 }); }); }
      } else if (C.kind === 'blink') {
        const side = V3(-a.to.z, 0, a.to.x).normalize().multiplyScalar(0.9), pts = [side.clone().add(a.to.clone().multiplyScalar(0.7)), side.clone().multiplyScalar(-1).add(a.to.clone().multiplyScalar(1.1)), a.to.clone().multiplyScalar(1.25)];
        const n = p < h ? Math.min(2, Math.floor(p / h * 3)) : p < 0.85 ? 2 : 3;
        if (n < 3) { const P = pts[n]; v.airOff.x = P.x; v.airOff.z = P.z; y = H * Math.abs(Math.sin((p / h) * 3 * Math.PI)); }
        if (a.n !== n) { a.n = n; const P = v.pos.clone().add(n < 3 ? pts[n] : V3(0, 0, 0)).add(V3(0, 0.45 + groundH(v.pos.x, v.pos.z), 0)); sprite('puff', P, { color: 0xffe2a0, scale: 0.6, scale1: 0.05, life: 0.3, add: true }); burst(P, 6, { tex: 'spark', color: 0xffd060, scale: 0.1, add: true, speed: 2.2 }); if (n < 3) slash('cross', S3.V[a.tk] ? posOf(a.tk) : P, { scale: 0.7, life: 0.25, rot: n }); sfx('whoosh', 40); }
        if (n < 3) { R.root.position.x += v.airOff.x; R.root.position.z += v.airOff.z; }
        v.airOff.y = y; R.root.position.y += y; fwd = 0; y = 0;
      } else if (C.kind === 'float') {
        y = p < h ? H * ease.out(p / h) : p < 0.8 ? H + 0.1 * Math.sin((p - h) * 20) : H * (1 - ease.inOut((p - 0.8) / 0.2)); spin = (C.spin || 0) * ease.inOut(Math.min(1, p / h)); roll = 0.15 * Math.sin(p * 12);
      } else if (C.kind === 'flip') {
        y = H * tri(p); pitch = -Math.PI * 2 * (C.flip || 0) * ease.inOut(p);
      }
      // 落地衝擊
      if ((C.kind === 'leap' || C.kind === 'jump' || C.kind === 'dive') && p >= h) once('land', () => {
        const P = here(); groundRing(P, 0xf2e6cf, 1.6 + H * 0.3, 0.6); groundRing(P, 0xffd9a0, 0.9, 0.4, 0.05);
        burst(P.clone().add(V3(0, 0.1, 0)), 12 + Math.round(H * 3), { color: 0xe8d8b8, scale: 0.28, speed: 2.4, up: 1, g: -4, life: 0.6 });
        sprite('ring', P.clone().add(V3(0, 0.08, 0)), { color: 0xfff3c8, scale: 0.3, scale1: 2 + H * 0.4, life: 0.35, add: true, opacity: 0.8 });
        S3.shake = Math.max(S3.shake, C.shake || 0); airToss(S3.V[a.tk], C.toss); sfx('thud', 60);
      });
      if (C.kind !== 'blink') { v.airOff.set(a.to.x * fwd, y, a.to.z * fwd); R.root.position.add(v.airOff); }
      if (spin) R.yaw.rotation.y += spin * Math.PI * 2;
      // 空中殘影
      if (y > 0.5 && (!a.lt || t - a.lt > 0.05)) { a.lt = t; sprite('puff', R.root.position.clone().add(V3(0, 0.4 * (v.scale || 1), 0)), { color: 0xffffff, scale: 0.35 * (v.scale || 1), scale1: 0.05, life: 0.25, opacity: 0.35, add: true }); }
    }
  }
  if (v.toss) { // 被打飛
    const q = (t - v.toss.t0) / v.toss.dur;
    if (q >= 1 || v.deadT !== null && q > 0.6) { v.toss = null; const P = v.pos.clone().add(V3(0, groundH(v.pos.x, v.pos.z) + 0.05, 0)); burst(P, 6, { color: 0xe8d8b8, scale: 0.2, speed: 1.4, up: 0.6, g: -3, life: 0.4 }); }
    else { const y = v.toss.h * tri(q); v.airOff.y += y; R.root.position.y += y; roll += v.toss.sp * Math.PI * 2 * ease.out(q) * Math.min(1, v.toss.h / 1.2); }
  }
  // 翻滾：繞身體中心轉（不是繞腳）
  if (pitch || roll || R.yaw.rotation.x || R.yaw.rotation.z) {
    R.yaw.rotation.order = 'YXZ'; R.yaw.rotation.x = pitch; R.yaw.rotation.z = roll;
    const c = 0.45 * (v.scale || 1), yw = R.yaw.rotation.y, f = V3(Math.sin(yw), 0, Math.cos(yw));
    R.root.position.y += c - c * Math.cos(pitch) * Math.cos(roll);
    R.root.position.addScaledVector(f, -c * Math.sin(pitch));
    R.root.position.x += c * Math.sin(roll) * Math.cos(yw); R.root.position.z += -c * Math.sin(roll) * Math.sin(yw);
  }
}
// 普通攻擊：出手前衝、命中時對方被擊退（純畫面）
function atkNudge(v, tv, heavy) {
  if (!v || !tv || !AIR_ON.on) return;
  const d = V3(tv.pos.x - v.pos.x, 0, tv.pos.z - v.pos.z); if (d.lengthSq() < 1e-4) return; d.normalize();
  v.nudge = { t0: nowS(), d, amt: heavy ? 0.16 : 0.1, dur: 0.22 }; // v0.14：攻擊動作本身已有前衝，這裡只補一點
  tv.nudge = { t0: nowS() + 0.04, d, amt: heavy ? 0.24 : 0.14, dur: 0.26, kb: true };
}
function nudgeFrame(v, t) {
  const n = v.nudge; if (!n) return; const q = (t - n.t0) / n.dur; if (q < 0) return; if (q >= 1) { v.nudge = null; return; }
  const k = n.kb ? n.amt * Math.sin(q * Math.PI) * (1 - q * 0.5) : n.amt * Math.sin(q * Math.PI);
  R0.copy(n.d).multiplyScalar(k); v.R.root.position.add(R0); if (v.airOff) v.airOff.add(R0);
}
const R0 = new THREE.Vector3();

const ULT_FLASH = { elephant: '#ffe6b0', lion: '#ffd34d', whale: '#9fd8ff', peacock: '#b8ffd8', komodo: '#c8ff9a' };
function screenFlash(col) { const st = document.getElementById('stage'); if (!st) return; const d = document.createElement('div'); d.className = 'sflash'; d.style.background = col; st.appendChild(d); setTimeout(() => d.remove(), 450); }
function radial(p, n, f) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; f(a, Math.cos(a), Math.sin(a), i); } }
const ULT = {
  hedgehog(c) { radial(c.A, 12, (a, x, z) => projectile(c.sp, c.A.clone().add(V3(x * 1.6, 0.2, z * 1.6)), 'spark', 0.3, { color: 0xc8d0e0, scale: 0.16, arc: 0.2 })); },
  squirrel(c) { for (let i = 0; i < 6; i++) projectile(c.tp.clone().add(V3((Math.random() - .5) * 1.4, 4, (Math.random() - .5) * 1.4)), c.tp.clone().add(V3((Math.random() - .5) * 1.2, 0, (Math.random() - .5) * 1.2)), 'acorn', 0.45, { arc: 0, delay: 0.1 + i * 0.07, onEnd: () => burst(c.tp, 3, { tex: 'leaf', color: 0xd9a050, scale: 0.1, speed: 1.2 }) }); },
  wolf(c) { sprite('ring', c.sp.clone().add(V3(0, 1.1, 0)), { color: 0xeaf4ff, scale: 0.4, scale1: 0.9, life: 1.0, opacity: 0.8 }); for (let i = 0; i < 3; i++) groundRing(c.A, 0x8ac8ff, 1.4 + i * 0.8, 0.7, i * 0.15); },
  frog(c) { groundRing(c.sp, 0x9fd3ef, 1.0, 0.5, 0.35); burst(c.sp.clone().add(V3(0, 0.1, 0)), 8, { tex: 'drop', scale: 0.1, speed: 1.4, up: 2, g: -6, life: 0.5, delay: 0.35 }); },
  bat(c) { radial(c.tp, 8, (a, x, z, i) => sprite('cloud', c.tp.clone().add(V3(x * 0.7, 0.4, z * 0.7)), { color: 0x4a2a5a, scale: 0.3, scale1: 0.05, life: 0.6, vel: V3(-x * 1.1, 0.3, -z * 1.1), delay: i * 0.02, opacity: 0.8 })); },
  redpanda(c) { groundRing(c.A, 0xff5a3c, 1.8, 0.5, 0.1); burst(c.A.clone().add(V3(0, 0.1, 0)), 10, { color: 0xe8b090, scale: 0.25, speed: 1.6, up: 0.4, g: 0, life: 0.6 }); },
  skunk(c) { for (let i = 0; i < 8; i++) sprite('cloud', c.tp.clone().add(V3((Math.random() - .5) * 1.6, 0.1, (Math.random() - .5) * 1.6)), { color: i % 2 ? 0x9bc24a : 0x7aa83a, scale: 0.3, scale1: 0.9, life: 1.3, vel: V3(0, 0.7, 0), opacity: 0.6, delay: i * 0.05 }); },
  croc(c) { for (let i = 0; i < 4; i++) sprite('ring', c.tp.clone().add(V3(0, 0.05 + i * 0.05, 0)), { color: 0x6fb6e0, scale: 0.3 + i * 0.2, scale1: 1.2, life: 0.6, delay: i * 0.12, rot: i, add: true, opacity: 0.7 }); },
  bee(c) { for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 4; sprite('spark', c.sp.clone().add(V3(Math.cos(a) * 0.6, 0.3 + i * 0.04, Math.sin(a) * 0.6)), { color: 0xffd34d, scale: 0.08, scale1: 0.02, life: 0.7, vel: V3(Math.cos(a + 1.6) * 1.5, 0.5, Math.sin(a + 1.6) * 1.5), g: 0, add: true, delay: i * 0.03 }); } },
  koala(c) { for (let i = 0; i < 8; i++) sprite('leaf', c.tp.clone().add(V3((Math.random() - .5) * 2, 2.2, (Math.random() - .5) * 2)), { color: 0x7aae4a, scale: 0.16, scale1: 0.12, life: 1.2, vel: V3(0, -1.4, 0), g: 0, spin: 4, delay: i * 0.05 }); },
  cheetah(c) { for (let i = 0; i < 8; i++) sprite('puff', c.sp.clone().lerp(c.tp, i / 8), { color: 0xffd090, scale: 0.25, scale1: 0.02, life: 0.35, add: true, delay: i * 0.015 }); },
  octopus(c) { radial(c.tp, 6, (a, x, z) => sprite('puff', c.tp.clone().add(V3(x * 0.9, 0.05, z * 0.9)), { color: 0x3a2a48, scale: 0.4, scale1: 0.7, life: 1.0, opacity: 0.7 })); },
  owl(c) { sprite('puff', c.tp.clone().add(V3(0, 1.6, 0)), { color: 0xf8f4e0, scale: 1.0, scale1: 0.2, life: 0.4, add: true, opacity: 0.6 }); for (let i = 0; i < 10; i++) { const a = i * 0.9; sprite('feather', c.tp.clone().add(V3(Math.cos(a) * 0.3, 0.3 + i * 0.08, Math.sin(a) * 0.3)), { scale: 0.18, scale1: 0.1, life: 0.9, vel: V3(Math.cos(a) * 1.2, 0.8, Math.sin(a) * 1.2), g: -1, spin: 3 }); } },
  elephant(c) { radial(c.A, 8, (a, x, z) => { const m = mesh(GEO.box, MB(0x3a2a20, 0.6)); m.scale.set(0.06, 0.01, 1.2 + Math.random() * 0.6); m.position.set(c.A.x + x * 0.8, 0.03, c.A.z + z * 0.8); m.rotation.y = Math.atan2(x, z); meshFx(m, { life: 1.4, custom: (f, q) => { m.material.opacity = 0.6 * (1 - q); } }); burst(c.A.clone().add(V3(x * 1.2, 0.1, z * 1.2)), 2, { color: 0x9a8a7a, scale: 0.12, speed: 0.8, up: 2.5, g: -8, life: 0.7 }); }); },
  lion(c) { sprite('puff', c.sp.clone().add(V3(0, 0.6, 0)), { color: 0xffc94a, scale: 1.4, scale1: 0.1, life: 0.5, add: true, opacity: 0.7 }); for (let i = 0; i < 3; i++) groundRing(c.A, 0xffd34d, 2.4 + i, 0.8, i * 0.12); S3.shake = Math.max(S3.shake, 0.22); },
  penguin(c) { radial(c.tp, 10, (a, x, z) => sprite('shard', c.tp.clone().add(V3(0, 0.2, 0)), { color: 0xdff2ff, scale: 0.14, scale1: 0.05, life: 0.6, vel: V3(x * 2.2, 1, z * 2.2), g: -5 })); groundRing(c.tp, 0xffffff, 1.6, 0.6); },
  rhino(c) { for (let i = 0; i < 10; i++) sprite('puff', c.sp.clone().lerp(c.tp, i / 10).setY(0.15), { color: 0xd8c8a8, scale: 0.3, scale1: 0.6, life: 0.7, opacity: 0.7, delay: i * 0.02 }); },
  chameleon(c) { const cols = [0xff6a6a, 0xffd34d, 0x8fd35a, 0x6fb6ff, 0xc08aff]; for (let i = 0; i < 15; i++) sprite('spark', c.tp.clone().add(V3(0, 0.4, 0)), { color: cols[i % 5], scale: 0.12, scale1: 0.03, life: 0.6, vel: V3((Math.random() - .5) * 3, 1 + Math.random() * 2, (Math.random() - .5) * 3), g: -4, add: true, delay: 0.2 }); },
  fox(c) { radial(c.tp, 6, (a, x, z, i) => sprite('flame', c.tp.clone().add(V3(x * 0.6, 0.2, z * 0.6)), { color: 0xff9a3a, scale: 0.25, scale1: 0.05, life: 0.6, vel: V3(0, 1, 0), add: true, delay: i * 0.04 })); },
  eagle(c) { for (let i = 0; i < 3; i++) sprite('ring', c.tp.clone().add(V3(0, 1.4 + i * 0.3, 0)), { color: 0xffffff, scale: 0.4, scale1: 1.4, life: 0.5, delay: i * 0.1, opacity: 0.6, add: true }); },
  eel(c) { for (let i = 0; i < 3; i++) lightning(c.sp.clone().add(V3(0, 0.5, 0)), c.A.clone().add(V3((Math.random() - .5) * 3, 0.1, (Math.random() - .5) * 3)), 0xfff27a, 0.25); },
  gorilla(c) { for (let i = 0; i < 3; i++) groundRing(c.A, 0xff8a4a, 1.2 + i * 0.9, 0.5, i * 0.18); radial(c.A, 6, (a, x, z) => burst(c.A.clone().add(V3(x, 0.1, z)), 1, { color: 0x8a7a6a, scale: 0.14, speed: 0.6, up: 2.8, g: -8, life: 0.7 })); },
  whale(c) { const dir = c.tp.clone().sub(c.sp).setY(0).normalize(), side = V3(-dir.z, 0, dir.x); for (let w = 0; w < 4; w++) for (let i = -4; i <= 4; i++) { const p0 = c.sp.clone().addScaledVector(side, i * 0.45).setY(0.2); sprite('drop', p0, { scale: 0.22, scale1: 0.12, life: 1.0, vel: dir.clone().multiplyScalar(4).add(V3(0, 1.2, 0)), g: -2.5, delay: 0.15 + w * 0.12 }); } },
  peacock(c) { radial(c.A, 10, (a, x, z, i) => sprite('ring', c.A.clone().add(V3(x * 1.4, 0.6, z * 1.4)), { color: i % 2 ? 0x3fbf8a : 0x4a8aff, scale: 0.2, scale1: 0.45, life: 0.8, add: true, opacity: 0.85, delay: 0.1 + i * 0.02 })); },
  komodo(c) { for (let i = 0; i < 10; i++) sprite('spark', c.tp.clone().add(V3((Math.random() - .5) * 1.2, 0.05, (Math.random() - .5) * 1.2)), { color: 0x8fd34a, scale: 0.14, scale1: 0.22, life: 1.0, vel: V3(0, 0.6, 0), g: 0, opacity: 0.8, delay: i * 0.05 }); const d = mesh(GEO.disc, MB(0x6aa82a, 0.5)); d.rotation.x = -Math.PI / 2; d.position.set(c.tp.x, 0.02, c.tp.z); d.scale.setScalar(1.4); meshFx(d, { life: 1.6, custom: (f, q) => { d.material.opacity = 0.5 * (1 - q); } }); },
  deer(c) { for (let i = 0; i < 12; i++) sprite('leaf', c.sp.clone().add(V3((Math.random() - .5) * 1.6, 1.6, (Math.random() - .5) * 1.6)), { color: 0x9ad86a, scale: 0.14, scale1: 0.1, life: 1.1, vel: V3(0, -1.2, 0), g: 0, spin: 4, delay: i * 0.04 }); },
  zebra(c) { for (let i = 0; i < 6; i++) sprite('star', c.tp.clone().add(V3(Math.cos(i) * 0.4, 0.7, Math.sin(i) * 0.4)), { scale: 0.14, scale1: 0.05, life: 0.8, vel: V3(Math.cos(i) * 0.8, 0.6, Math.sin(i) * 0.8) }); },
  hippo(c) { burst(c.tp, 12, { tex: 'drop', scale: 0.12, speed: 2, up: 2, g: -6, life: 0.7 }); },
  parrot(c) { for (let i = 0; i < 10; i++) sprite('spark', c.sp.clone().add(V3(0, 0.6, 0)), { color: [0xe8423a, 0xf2d24a, 0x3a8ad8][i % 3], scale: 0.1, scale1: 0.02, life: 0.6, vel: V3(Math.cos(i) * 2, 0.8, Math.sin(i) * 2), g: -2, add: true }); },
  giraffe(c) { radial(c.A, 10, (a, x, z) => sprite('puff', c.A.clone().add(V3(x * 1.4, 0.15, z * 1.4)), { color: 0xf0c45a, scale: 0.35, scale1: 0.05, life: 0.5, vel: V3(x, 0, z) })); },
  flamingo(c) { radial(c.sp, 8, (a, x, z, i) => sprite('ring', c.sp.clone().add(V3(0, 0.1, 0)), { color: 0xf49ab4, scale: 0.3, scale1: 1.8, life: 0.7, delay: i * 0.05, add: true, opacity: 0.6 })); },
  shark(c) { groundRing(c.tp, 0x6c8aa8, 1.8, 0.6); sprite('ring', c.tp.clone().add(V3(0, 0.1, 0)), { color: 0xffffff, scale: 0.3, scale1: 2, life: 0.4, add: true }); },
  panda(c) { for (let i = 0; i < 4; i++) groundRing(c.A, 0x7ab84a, 1.2 + i * 0.5, 0.6, i * 0.1); },
};
function playFx(name, sk, tk, ex) {
  const sv = S3.V[sk], tv = tk !== undefined ? S3.V[tk] : null;
  if (!sv) return;
  const A = sv.pos.clone().setY(sv.pos.y + groundH(sv.pos.x, sv.pos.z)), sp = posOf(sk), tp = tv ? posOf(tk) : sp.clone().add(V3(0, 0, -0.6));
  const hand = A.clone().add(V3(0, 0.5 * (sv.scale || 1), 0));
  if (!['acorn', 'stinkBall', 'inkBall'].includes(name)) try { fxDetail(name, sv, A, sp, tp, tv); } catch (e) {} // 遠程普攻由投射物命中時處理
  if (SKILL_FX && SKILL_FX.has(name) && ULT[sv.unitKey]) { try { ULT[sv.unitKey]({ A, sp, tp, tv, sv }); } catch (e) {} if (ULT_FLASH[sv.unitKey]) screenFlash(ULT_FLASH[sv.unitKey]); }
  switch (name) {
    // v0.13.23 多段技能動作的每一下（SKILL_V2 的 beats）：衝撞、捶地、跺腳、落地
    case 'beatImpact': slash('burst', tp, { scale: 0.55, color: 0xffe0b0 }); burst(tp, 7, { color: 0xe8d8b8, scale: 0.2, speed: 2, up: 0.8, g: -2, life: 0.5 }); S3.shake = Math.max(S3.shake, 0.08); break;
    case 'beatPound': groundRing(A, 0xe8d8b8, 1.3, 0.45); burst(A.clone().add(V3(0, 0.1, 0)), 8, { color: 0xe8d8b8, scale: 0.22, speed: 2, up: 0.6, g: -1.5, life: 0.55 }); S3.shake = Math.max(S3.shake, 0.1); break;
    case 'beatSlam': groundRing(A, 0xd8c8e0, 2.0, 0.6); groundRing(A, 0xffffff, 1.2, 0.4, 0.05); burst(A.clone().add(V3(0, 0.1, 0)), 14, { color: 0xe8d8b8, scale: 0.3, speed: 2.6, up: 0.8, g: -1.5, life: 0.7 }); S3.shake = Math.max(S3.shake, 0.18); break;
    case 'beatDust': burst(A.clone().add(V3(0, 0.08, 0)), 5, { color: 0xe8d8b8, scale: 0.18, speed: 1.2, up: 0.5, g: -1, life: 0.45 }); break;
    case 'bump': case 'kick': slash('burst', tp, { scale: 0.35, color: 0xffd9a0 }); burst(tp, 5, { color: 0xf2e6cf, scale: 0.12, speed: 1.6 }); break;
    case 'leafShot': projectile(hand, tp, 'leaf', 0.25, { scale: 0.2, arc: 0.3, spin: 8, color: 0x7ab84a, onEnd: () => burst(tp, 4, { tex: 'leaf', color: 0x9ad86a, scale: 0.1, speed: 1.2 }) }); break;
    case 'waterShot': projectile(posOf(sk, 0.8), tp, 'drop', 0.22, { scale: 0.18, arc: 0.25, onEnd: () => burst(tp, 6, { tex: 'drop', scale: 0.08, speed: 1.4, up: 1.2, g: -5, life: 0.4 }) }); break;
    case 'backKick': slash('burst', tp, { scale: 0.7, color: 0xffffff }); burst(tp, 8, { tex: 'star', scale: 0.12, speed: 2, up: 1, g: -2 }); S3.shake = Math.max(S3.shake, 0.06); break;
    case 'blessing': groundRing(A, 0x9ad86a, 2.2, 0.7); burst(sp, 14, { tex: 'leaf', color: 0x9ad86a, scale: 0.14, speed: 1, up: 1.5, g: -0.5, life: 1.0, spin: 3 }); break;
    case 'hippoGulp': slash('bite', tp, { scale: 0.9, color: 0xf6c0d0 }); groundRing(A, 0xc8b4c8, 1.4, 0.5); S3.shake = Math.max(S3.shake, 0.08); break;
    case 'featherVolley': for (let i = 0; i < 6; i++) projectile(hand, tp.clone().add(V3((Math.random() - .5) * 1.6, 0, (Math.random() - .5) * 1.6)), 'feather', 0.3, { scale: 0.28, arc: 0.2, delay: i * 0.04 }); break;
    case 'neckSwing': groundRing(A, 0xf0c45a, 2.6, 0.5); slash('cross', tp, { scale: 1.0, life: 0.3 }); S3.shake = Math.max(S3.shake, 0.12); break;
    case 'swirlDance': { const z = ex && ex.zone ? ex.zone : tp; for (let i = 0; i < 3; i++) sprite('ring', z.clone().add(V3(0, 0.05 + i * 0.05, 0)), { color: 0x7fd0ff, scale: 0.4 + i * 0.3, scale1: 1.6, life: 0.8, delay: i * 0.15, rot: i, add: true, opacity: 0.7 }); burst(z, 18, { tex: 'drop', scale: 0.12, speed: 1.8, up: 2.5, g: -6, life: 0.9 }); break; }
    case 'sharkBite': slash('bite', tp, { scale: 1.1, color: 0xffffff }); burst(tp, 14, { tex: 'drop', scale: 0.14, speed: 2.4, up: 2.5, g: -7, life: 0.8 }); S3.shake = Math.max(S3.shake, 0.12); break;
    case 'pandaRoll': groundRing(A, 0x7ab84a, 2.4, 0.6); burst(A.clone().add(V3(0, 0.1, 0)), 14, { tex: 'leaf', color: 0x7ab84a, scale: 0.16, speed: 2.4, up: 1, g: -3, life: 0.7, spin: 5 }); S3.shake = Math.max(S3.shake, 0.18); break;
    case 'acorn': break; // 由 proj 事件處理
    case 'acornVolley': burst(hand, 6, { tex: 'leaf', scale: 0.12, speed: 1.4, color: 0xd9a050 }); break;
    case 'bite': slash('bite', tp, { scale: 0.55, life: 0.3, color: 0xffffff }); burst(tp, 4, { tex: 'spark', color: 0xff8a6a, scale: 0.12, add: true }); break;
    case 'biteDrain': slash('bite', tp, { scale: 0.45, color: 0xffd0d0 }); for (let i = 0; i < 5; i++) projectile(tp, sp, 'spark', 0.45, { color: 0xff3a4a, scale: 0.13, arc: 0.3 + Math.random() * 0.3, delay: i * 0.05 }); break;
    case 'bigBite': slash('bite', tp, { scale: 0.85, life: 0.4, color: 0xff9a9a }); burst(tp, 8, { tex: 'spark', color: 0xff3a4a, scale: 0.14, add: true }); for (let i = 0; i < 8; i++) projectile(tp, sp, 'spark', 0.5, { color: 0xff3a4a, scale: 0.15, arc: 0.5, delay: 0.05 * i }); break;
    case 'claw1': slash('claw1', tp, { scale: 0.6, rot: -0.2, color: 0xfff1e0 }); burst(tp, 3, { tex: 'spark', color: 0xffc070, scale: 0.1, add: true }); break;
    case 'claw3': slash('claw3', tp, { scale: 0.65, rot: 0.15 }); burst(tp, 4, { tex: 'spark', color: 0xffd060, scale: 0.1, add: true, speed: 2.5 }); break;
    case 'claw3big': slash('claw3', tp, { scale: 0.95, rot: Math.PI / 2 + 0.15, color: 0xffe2a0 }); burst(tp, 6, { tex: 'spark', color: 0xffb040, scale: 0.13, add: true, speed: 2.8 }); S3.shake = Math.max(S3.shake, 0.05); break;
    case 'tongue': case 'tongueGrab': {
      const m = mesh(GEO.cap, T('#e98a9a')); meshFx(m, { life: name === 'tongue' ? 0.32 : 0.55, tongue: { from: sk, to: tk, pt: tp } });
      if (name === 'tongueGrab') burst(tp, 6, { tex: 'spark', color: 0xff9ab0, scale: 0.12, add: true, delay: 0.2 });
      break; }
    case 'howl': { for (let i = 0; i < 4; i++) sprite('note', posOf(sk, 1.1), { scale: 0.3, scale1: 0.9, life: 0.9, vel: V3(0, 0.6, 0), delay: i * 0.18, color: 0xbfe2ff, opacity: 0.9 }); groundRing(A, 0x8ac8ff, 2.2, 0.8); break; }
    case 'taunt': groundRing(A, 0xff5a3c, 2.6, 0.7); groundRing(A, 0xffb040, 1.6, 0.6, 0.12); sprite('exclaim', posOf(sk, 1.4), { scale: 0.2, scale1: 0.55, life: 0.8 }); S3.shake = Math.max(S3.shake, 0.06); break;
    case 'stinkBall': break;
    case 'gasSpray': for (let i = 0; i < 10; i++) { const p0 = posOf(sk, 0.9); const to = ex && ex.zone ? ex.zone : tp; projectile(p0, to.clone().add(V3((Math.random() - .5) * 0.8, 0.2, (Math.random() - .5) * 0.8)), 'stink', 0.5, { scale: 0.4, arc: 0.8, delay: i * 0.04 }); } break;
    case 'deathRoll': for (let i = 0; i < 3; i++) groundRing(tp, 0x9fd3ef, 1.2, 0.5, i * 0.2); burst(tp, 14, { tex: 'drop', scale: 0.12, speed: 2.4, up: 3, g: -7, life: 0.7 }); slash('bite', tp, { scale: 0.75, life: 0.35 }); break;
    case 'sting': slash('spark', tp, { scale: 0.25, color: 0xffe066 }); break;
    case 'swarm': burst(sp, 12, { tex: 'spark', color: 0xffd34d, scale: 0.1, speed: 1.6, up: 1, g: 0, add: true }); groundRing(A, 0xffd34d, 1.2, 0.6); break;
    case 'slam': slash('burst', tp, { scale: 0.55, color: 0xfff0d0 }); groundRing(tp, 0xf2e6cf, 0.9, 0.4); break;
    case 'bodySlam': groundRing(tp, 0xf2e6cf, 2.0, 0.6); burst(tp, 12, { color: 0xe8d8b8, scale: 0.3, speed: 2, up: 0.8, g: -1 }); slash('burst', tp, { scale: 0.8 }); S3.shake = Math.max(S3.shake, 0.12); break;
    case 'wake': sprite('anger', posOf(sk, 1.2).add(V3(0.2, 0, 0)), { scale: 0.2, scale1: 0.5, life: 0.9 }); burst(posOf(sk, 1.1), 6, { color: 0xffffff, scale: 0.18, speed: 0.8, up: 1.4, g: 0.5, life: 0.8 }); break;
    case 'crossSlash': slash('cross', tp, { scale: 1.0, life: 0.35 }); slash('burst', tp, { scale: 0.6, color: 0xffd060, delay: 0.08 }); burst(tp, 10, { tex: 'spark', color: 0xffc040, scale: 0.12, add: true, speed: 3 }); S3.shake = Math.max(S3.shake, 0.1); break;
    case 'inkBall': break;
    case 'inkCloud': { const z = ex && ex.zone ? ex.zone : tp; burst(z, 16, { tex: 'cloud', color: 0x2d2438, scale: 0.5, scale1: 0.9, speed: 1.2, up: 0.6, g: 0, life: 1.2 }); for (let i = 0; i < 4; i++) { const d = mesh(GEO.disc, MB(0x2d2438, 0.7)); d.rotation.x = -Math.PI / 2; d.position.set(z.x + (Math.random() - .5) * 2, 0.02, z.z + (Math.random() - .5) * 2); meshFx(d, { life: 2.0, custom: (f, p) => { f.o.scale.setScalar(0.35 * Math.min(1, p * 6)); f.o.material.opacity = 0.7 * (1 - Math.max(0, p - 0.6) / 0.4); } }); } break; }
    case 'feather': for (let i = 0; i < 3; i++) projectile(hand, tp.clone().add(V3((i - 1) * 0.15, 0, 0)), 'feather', 0.28, { scale: 0.28, arc: 0.15, delay: i * 0.05 }); break;
    case 'swoop': slash('claw3', tp, { scale: 0.85, rot: Math.PI * 0.75 }); burst(tp, 8, { tex: 'feather', scale: 0.16, speed: 1.6, up: 1.5, g: -2, life: 0.9, spin: 4 }); break;
    case 'trunkSlap': slash('claw1', tp, { scale: 0.75, rot: 0.6, color: 0xd8dde4 }); slash('burst', tp, { scale: 0.4, delay: 0.05 }); break;
    case 'stomp': groundRing(A, 0xf2e6cf, 3.2, 0.8); groundRing(A, 0xd9b98a, 2.2, 0.7, 0.15); burst(A.clone().add(V3(0, 0.1, 0)), 18, { color: 0xe8d8b8, scale: 0.35, speed: 3, up: 0.6, g: -1, life: 0.8 }); S3.shake = Math.max(S3.shake, 0.22); break;
    case 'roar': { const dir = tp.clone().sub(sp).setY(0).normalize(); for (let i = 0; i < 4; i++) sprite('ring', sp.clone().addScaledVector(dir, 0.3 + i * 0.35), { scale: 0.3, scale1: 1.4, life: 0.55, delay: i * 0.09, color: 0xffc94a, add: true }); groundRing(A, 0xffc94a, 3.0, 0.9); S3.shake = Math.max(S3.shake, 0.15); break; }
    case 'spikeBurst': burst(sp, 16, { tex: 'shard', color: 0x8a92a8, scale: 0.16, speed: 3.2, up: 1.2, g: -3 }); groundRing(A, 0xc8d0e0, 1.6, 0.5); break;
    // ---- v0.5 ----
    case 'flipper': slash('claw1', tp, { scale: 0.5, rot: 0.4, color: 0xdff2ff }); burst(tp, 5, { tex: 'drop', scale: 0.08, speed: 1.6, up: 1.5, g: -6, life: 0.45 }); break;
    case 'slideHit': groundRing(tp, 0xbfe6ff, 1.4, 0.5); burst(tp, 12, { tex: 'drop', scale: 0.1, speed: 2.6, up: 2, g: -7, life: 0.6 }); slash('burst', tp, { scale: 0.55, color: 0xdff2ff }); S3.shake = Math.max(S3.shake, 0.08); break;
    case 'headbutt': slash('burst', tp, { scale: 0.5, color: 0xfff0d0 }); burst(tp, 6, { color: 0xe8d8b8, scale: 0.18, speed: 1.8, up: 0.6, g: -1 }); break;
    case 'rhinoCharge': slash('burst', tp, { scale: 0.9, color: 0xffe0b0 }); groundRing(tp, 0xe8d8b8, 1.8, 0.6); burst(tp, 14, { color: 0xe8d8b8, scale: 0.3, speed: 2.6, up: 1, g: -2, life: 0.7 }); sprite('star', tp.clone().add(V3(0, 0.4, 0)), { scale: 0.2, scale1: 0.5, life: 0.5, vel: V3(0, 1.5, 0) }); S3.shake = Math.max(S3.shake, 0.16); break;
    case 'chamStrike': { const m = mesh(GEO.cap, T('#e98a9a')); meshFx(m, { life: 0.5, tongue: { from: sk, to: tk, pt: tp } }); burst(tp, 8, { tex: 'spark', color: 0x9be07a, scale: 0.13, add: true, delay: 0.2 }); slash('cross', tp, { scale: 0.7, delay: 0.22, color: 0xc8ff9a }); for (let i = 0; i < 6; i++) sprite('puff', sp.clone().add(V3((Math.random() - .5) * 0.5, Math.random() * 0.5, (Math.random() - .5) * 0.5)), { color: [0x9be07a, 0xf2b84a, 0x8fd3ff][i % 3], scale: 0.3, scale1: 0.05, life: 0.6, opacity: 0.7 }); break; }
    case 'pounce': slash('claw3', tp, { scale: 0.95, rot: Math.PI * 0.6, color: 0xffd0a0 }); groundRing(tp, 0xffb070, 1.3, 0.5); burst(tp, 10, { tex: 'spark', color: 0xff9a4a, scale: 0.13, add: true, speed: 2.6 }); S3.shake = Math.max(S3.shake, 0.1); break;
    case 'talonShot': for (let i = 0; i < 2; i++) projectile(hand.clone().add(V3(0, 0.2, 0)), tp.clone().add(V3((i - 0.5) * 0.15, 0, 0)), 'feather', 0.25, { scale: 0.3, arc: 0.2, delay: i * 0.06 }); at(0.28, () => slash('claw3', tp, { scale: 0.45, rot: 0.3 })); break;
    case 'grabLift': burst(tp, 10, { tex: 'feather', scale: 0.17, speed: 1.6, up: 2, g: -1.5, life: 1.0, spin: 4 }); groundRing(tp, 0xf2e6cf, 1.2, 0.5); slash('claw3', tp, { scale: 0.7, rot: Math.PI / 2 }); break;
    case 'zap': lightning(hand.clone().add(V3(0, 0.3, 0)), tp, 0xfff27a); burst(tp, 5, { tex: 'spark', color: 0xfff27a, scale: 0.12, add: true, speed: 2 }); break;
    case 'chainZap': sprite('ring', posOf(sk, 0.9), { scale: 0.3, scale1: 1.4, life: 0.4, color: 0xfff27a, add: true }); burst(posOf(sk, 0.9), 10, { tex: 'spark', color: 0xfff27a, scale: 0.12, add: true, speed: 2.5, g: 0 }); break;
    case 'fistSlam': slash('burst', tp, { scale: 0.6, color: 0xfff0d0 }); groundRing(tp, 0xe8d8b8, 1.0, 0.45); burst(tp, 6, { color: 0xe8d8b8, scale: 0.2, speed: 1.6, up: 0.5, g: -1 }); S3.shake = Math.max(S3.shake, 0.06); break;
    case 'chestBeat': groundRing(A, 0xff8a4a, 2.6, 0.7); groundRing(A, 0xe8d8b8, 1.6, 0.6, 0.1); burst(A.clone().add(V3(0, 0.1, 0)), 16, { color: 0xe8d8b8, scale: 0.32, speed: 2.6, up: 0.6, g: -1, life: 0.8 }); sprite('anger', posOf(sk, 1.3), { scale: 0.2, scale1: 0.5, life: 0.8 }); S3.shake = Math.max(S3.shake, 0.2); break;
    case 'spout': { const top = posOf(sk, 1.0); burst(top, 8, { tex: 'drop', scale: 0.1, speed: 0.8, up: 3, g: -6, life: 0.7 }); projectile(top, tp, 'spark', 0.3, { color: 0x8fd3ff, scale: 0.35, arc: 0.6, onEnd: () => { const b = posOf(tk); if (b) { burst(b, 8, { tex: 'drop', scale: 0.1, speed: 1.8, up: 2, g: -7, life: 0.5 }); slash('splat', b, { scale: 0.4, color: 0x8fd3ff }); } } }); break; }
    case 'tidal': { const top = posOf(sk, 1.1); for (let i = 0; i < 3; i++) burst(top, 10, { tex: 'drop', scale: 0.14, speed: 1, up: 4.5, g: -7, life: 0.9, delay: i * 0.1 }); break; }
    case 'fanOpen': groundRing(A, 0x3f8a5a, 3.6, 0.8); groundRing(A, 0xd8b54a, 2.4, 0.7, 0.12); for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; sprite('feather', posOf(sk, 0.8), { scale: 0.25, scale1: 0.1, life: 1.0, vel: V3(Math.cos(a) * 2.2, 0.6, Math.sin(a) * 2.2), g: -0.5, spin: 3, color: i % 2 ? 0x3f8a5a : 0x5a8ad8 }); } sprite('ring', posOf(sk, 0.8), { scale: 0.4, scale1: 2.6, life: 0.6, color: 0xff9ad0, add: true }); break;
    case 'venomBite': slash('bite', tp, { scale: 0.85, life: 0.4, color: 0xd8ff9a }); burst(tp, 12, { tex: 'cloud', color: 0x8fd34a, scale: 0.22, speed: 1.2, up: 0.8, g: 0, life: 0.9 }); S3.shake = Math.max(S3.shake, 0.08); break;
  }
}
// 閃電：鋸齒折線，每段一根細圓柱，加亮混色
function lightning(a, b, col, life) {
  const g = new THREE.Group(), n = 6, mat = new THREE.MeshBasicMaterial({ color: col || 0xfff27a, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  let prev = a.clone();
  for (let i = 1; i <= n; i++) {
    const p = a.clone().lerp(b, i / n); if (i < n) p.add(V3((Math.random() - .5) * 0.3, (Math.random() - .5) * 0.3, (Math.random() - .5) * 0.3));
    const d = p.distanceTo(prev), m = new THREE.Mesh(GEO.cyl, mat); m.scale.set(0.035, d, 0.035);
    m.position.copy(prev).lerp(p, 0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), p.clone().sub(prev).normalize()); g.add(m); prev = p;
  }
  meshFx(g, { life: life || 0.28, custom: (f, q) => { mat.opacity = q < 0.5 ? 1 : 1 - (q - 0.5) * 2; f.o.visible = Math.random() > 0.15; } });
  sprite('puff', b.clone(), { color: col || 0xfff27a, scale: 0.5, scale1: 0.1, life: 0.3, add: true });
}
const NUM_MAX = 36; // 同時顯示的傷害數字上限（效能調整參數）
function s3Num(k, text, cls, delay, big) {
  const v = S3.V[k]; if (!v) return;
  setTimeout(() => {
    if (!S3.V[k]) return;
    S3.numN = S3.numN || 0;
    if (S3.numN > NUM_MAX * (S3.quality || 1) && !big && cls !== 'crit' && cls !== 'skill') return;
    S3.numN++; setTimeout(() => { S3.numN--; }, 900);
    const p = toScreen(v3top(v));
    const d = document.createElement('div'); d.className = 'num ' + cls; d.textContent = text;
    d.style.left = (p[0] + (Math.random() - .5) * 26) + 'px'; d.style.top = (p[1] - 4) + 'px';
    if (big) d.style.fontSize = big + 'px';
    S3.ov.appendChild(d); setTimeout(() => d.remove(), 900);
  }, (delay || 0) * 1000);
}

// ---- 點選：回傳 {type:'unit',k} | {type:'tile',vc,vr} | {type:'bench',i} | null ----
function s3PickAt(cx, cy) {
  const r = S3.renderer.domElement.getBoundingClientRect();
  const nx = (cx - r.left) / r.width * 2 - 1, ny = -((cy - r.top) / r.height) * 2 + 1;
  S3.ray.setFromCamera({ x: nx, y: ny }, S3.cam);
  // 單位（用簡單圓柱碰撞，比逐面測試穩）
  let best = null, bd = 1e9;
  for (const k in S3.V) {
    const v = S3.V[k]; if (v.deadT !== null || v.dragging) continue;
    const c = v.pos.clone().add(V3(0, 0.45 * (v.scale || 1), 0));
    const d = S3.ray.ray.distanceSqToPoint(c), rad = 0.42 * (v.scale || 1);
    if (d < rad * rad) { const dist = S3.ray.ray.origin.distanceTo(c); if (dist < bd) { bd = dist; best = { type: 'unit', k }; } }
  }
  if (best) return best;
  const hits = S3.ray.intersectObjects(S3.tiles.concat(S3.bench), false);
  if (hits.length) { const u = hits[0].object.userData; return u.tile ? { type: 'tile', vc: u.vc, vr: u.vr } : { type: 'bench', i: u.i }; }
  return null;
}
function s3GroundAt(cx, cy) {
  const r = S3.renderer.domElement.getBoundingClientRect();
  S3.ray.setFromCamera({ x: (cx - r.left) / r.width * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }, S3.cam);
  const p = V3(0, 0, 0); S3.ray.ray.intersectPlane(new THREE.Plane(V3(0, 1, 0), 0), p); return p;
}
function s3NearestSlot(p) {
  // 依世界座標找最近的格子或備戰席
  let best = null, bd = 0.6;
  for (const t of S3.tiles) { const d = Math.hypot(t.position.x - p.x, t.position.z - p.z); if (d < bd) { bd = d; best = { type: 'tile', vc: t.userData.vc, vr: t.userData.vr, o: t }; } }
  for (const b of S3.bench) { const d = Math.hypot(b.position.x - p.x, b.position.z - p.z); if (d < bd) { bd = d; best = { type: 'bench', i: b.userData.i, o: b }; } }
  return best;
}
// 格子高亮：map key -> color
function s3Highlight(list, rows) {
  for (const t of S3.tiles) { delete t.userData.hl; t.material.color.set(0xffffff); }
  for (const b of S3.bench) b.material.emissive.setHex(0);
  S3.hlObjs = []; S3.gridOn = list.length > 0; S3.gridRows = rows || CFG.ROWS_HALF;
  for (const h of list) {
    const o = h.type === 'tile' ? S3.tiles[h.vr * CFG.COLS + h.vc] : S3.bench[h.i]; if (!o) continue;
    o.userData.hl = h.col;
    if (h.type === 'tile') { const c = new THREE.Color(h.col); c.r = Math.min(1, c.r * 2.6 + 0.15); c.g = Math.min(1, c.g * 2.6 + 0.15); c.b = Math.min(1, c.b * 2.6 + 0.15); o.material.color.copy(c); }
    else { o.material.emissive.setHex(h.col); S3.hlObjs.push(o); }
  }
}
