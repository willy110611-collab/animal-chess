// ===== 3D 大頭動物：球體拼裝、卡通著色、可動骨架（面向 +z）=====
const GEO = {};
function geos() {
  if (GEO.sph) return GEO;
  GEO.sph = new THREE.SphereGeometry(1, 22, 16);
  GEO.sphLo = new THREE.SphereGeometry(1, 12, 8);
  GEO.cone = new THREE.ConeGeometry(1, 1, 14);
  GEO.cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  GEO.disc = new THREE.CircleGeometry(1, 20);
  GEO.torus = new THREE.TorusGeometry(1, 0.22, 10, 28);
  GEO.box = new THREE.BoxGeometry(1, 1, 1);
  GEO.cap = new THREE.CapsuleGeometry(0.5, 1, 6, 12);
  return GEO;
}
let TOON_GRAD = null;
function toonGrad() {
  if (TOON_GRAD) return TOON_GRAD;
  const d = new Uint8Array([105, 105, 105, 255, 175, 175, 175, 255, 228, 228, 228, 255, 255, 255, 255, 255]);
  TOON_GRAD = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  TOON_GRAD.minFilter = TOON_GRAD.magFilter = THREE.NearestFilter; TOON_GRAD.needsUpdate = true;
  return TOON_GRAD;
}
// ===== v0.14 角色精緻化（只影響動物，場景不變）=====
// 可調：GRAD 角色的明暗色階（越大越亮）、RIM 邊緣光強度、RIM_POW 邊緣光寬窄（越大越細）、RIM_COL 邊緣光顏色
const MODEL_CFG = { GRAD: [150, 200, 238, 255], RIM: 0.3, RIM_POW: 2.6, RIM_COL: '1.0, 0.95, 0.84',
  OUTLINE: true, OUTLINE_W: 0.005, OUTLINE_COL: '#3a2a22', OUTLINE_MIN_Q: 0.7 }; // OUTLINE 描邊開關、OUTLINE_W 描邊粗細（畫面比例）、OUTLINE_COL 描邊顏色、OUTLINE_MIN_Q 自動畫質降到這以下就關描邊（省一半繪製）
function outlineMat() { // 描邊：背面往外推一點、塗深色（粗細固定在畫面上，不受部位大小影響）
  const m = new THREE.MeshBasicMaterial({ color: MODEL_CFG.OUTLINE_COL, side: THREE.BackSide });
  const w = MODEL_CFG.OUTLINE_W.toFixed(4);
  m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vec3 oN = normalize(normalMatrix * normal);
  gl_Position.xy += normalize(oN.xy + 1e-5) * ${w} * gl_Position.w;`); };
  m.customProgramCacheKey = () => 'charOutline'; m.userData.op = 1; return m;
}
let CHAR_GRAD = null;
function charGrad() {
  if (CHAR_GRAD) return CHAR_GRAD;
  const g = MODEL_CFG.GRAD, d = new Uint8Array(g.length * 4); g.forEach((v, i) => d.set([v, v, v, 255], i * 4));
  CHAR_GRAD = new THREE.DataTexture(d, g.length, 1, THREE.RGBAFormat);
  CHAR_GRAD.minFilter = CHAR_GRAD.magFilter = THREE.NearestFilter; CHAR_GRAD.needsUpdate = true;
  return CHAR_GRAD;
}
function charMat(m) { // 邊緣光：輪廓旁邊一圈淡淡的亮邊，讓動物從草地上跳出來
  const rim = `#include <dithering_fragment>
  float rimK = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), ${MODEL_CFG.RIM_POW.toFixed(2)});
  gl_FragColor.rgb += rimK * ${MODEL_CFG.RIM.toFixed(2)} * vec3(${MODEL_CFG.RIM_COL});`;
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', rim); };
  m.customProgramCacheKey = () => 'charRim'; return m;
}
// 每隻單位各自一套材質（受擊閃白、夜行眼睛發光）
function Mats() {
  const cache = {}, list = [];
  const f = (hex, opt) => {
    const k = hex + (opt ? JSON.stringify(opt) : '');
    if (cache[k]) return cache[k];
    const m = opt && opt.basic ? new THREE.MeshBasicMaterial({ color: hex, transparent: !!opt.op, opacity: opt.op || 1, depthWrite: !opt.op })
      : charMat(new THREE.MeshToonMaterial({ color: hex, gradientMap: charGrad(), transparent: !!(opt && opt.op), opacity: (opt && opt.op) || 1 }));
    m.userData.op = m.opacity; cache[k] = m; list.push(m); return m;
  };
  f.list = list; return f;
}
function mesh(geo, mat, p, s, r) {
  const m = new THREE.Mesh(geo, mat);
  if (p) m.position.set(p[0], p[1], p[2]);
  if (s) typeof s === 'number' ? m.scale.setScalar(s) : m.scale.set(s[0], s[1], s[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  return m;
}
function grp(parent, p, r) { const g = new THREE.Group(); if (p) g.position.set(p[0], p[1], p[2]); if (r) g.rotation.set(r[0], r[1], r[2]); if (parent) parent.add(g); return g; }
function saveBase(g) { g.userData.b = { p: g.position.clone(), r: g.rotation.clone(), s: g.scale.clone() }; return g; }
function resetG(g) { const b = g.userData.b; if (!b) return; g.position.copy(b.p); g.rotation.copy(b.r); g.scale.copy(b.s); }

const INK3 = 0x2e221d;
// ---- 共用部件 ----
function addEyes(R, head, y, dx, z, size, glowCol) {
  const em = R.M('#241914');
  R.eyeMat = em; R.glow = glowCol || '#ffe27a';
  for (const s of [-1, 1]) {
    const e = mesh(GEO.sph, em, [s * dx, y, z], [size, size * 1.15, size * 0.6]);
    head.add(e);
    const hl = mesh(GEO.sphLo, R.M('#ffffff', { basic: 1 }), [s * dx + size * 0.35, y + size * 0.4, z + size * 0.45], size * 0.32);
    head.add(hl);
    head.add(mesh(GEO.sphLo, R.M('#ffffff', { basic: 1 }), [s * dx - size * 0.3, y - size * 0.35, z + size * 0.5], size * 0.14)); // v0.14 第二顆小反光
  }
}
function addBlush(R, head, y, dx, z) {
  const m = R.M('#ee8f7d', { basic: 1, op: 0.45 });
  for (const s of [-1, 1]) { const b = mesh(GEO.disc, m, [s * dx, y, z], [0.055, 0.035, 1], [0, s * 0.5, 0]); head.add(b); }
}
function triEar(R, head, x, y, z, col, inner, h, tilt) {
  const g = saveBase(grp(head, [x, y, z], [0, 0, -Math.sign(x) * (tilt || 0.25)]));
  g.add(mesh(GEO.cone, R.M(col), [0, h / 2, 0], [h * 0.42, h, h * 0.28]));
  if (inner) g.add(mesh(GEO.cone, R.M(inner), [0, h * 0.45, 0.045], [h * 0.25, h * 0.7, h * 0.12]));
  return g;
}
function roundEar(R, head, x, y, z, col, inner, r) {
  const g = saveBase(grp(head, [x, y, z]));
  g.add(mesh(GEO.sph, R.M(col), [0, 0, 0], [r, r, r * 0.55]));
  if (inner) g.add(mesh(GEO.sph, R.M(inner), [0, 0, r * 0.3], [r * 0.62, r * 0.62, r * 0.3]));
  return g;
}
// 標準 Q 版站姿：大頭小身
function plush(R, o) {
  const M = R.M;
  const body = R.body = saveBase(grp(R.yaw, [0, 0, 0]));
  const bw = o.bodyW || 0.25, bh = o.bodyH || 0.27;
  R.torso = saveBase(mesh(GEO.sph, M(o.fur), [0, 0.27, 0], [bw, bh, bw * 0.92])); body.add(R.torso);
  if (o.belly) body.add(mesh(GEO.sph, M(o.belly), [0, 0.25, bw * 0.48], [bw * 0.66, bh * 0.72, bw * 0.5]));
  // 腳
  for (const s of [-1, 1]) {
    const leg = saveBase(grp(body, [s * 0.12, 0.13, 0.02]));
    leg.add(mesh(GEO.sph, M(o.limb || o.fur), [0, -0.07, 0.05], [0.085, 0.065, 0.11]));
    if (s < 0) R.legL = leg; else R.legR = leg;
  }
  // 手（樞紐在肩）
  for (const s of [-1, 1]) {
    const arm = saveBase(grp(body, [s * (bw * 0.82), 0.37, 0.04]));
    arm.add(mesh(GEO.sph, M(o.limb || o.fur), [0, -0.1, 0.02], [0.065, 0.12, 0.07]));
    if (o.paw) arm.add(mesh(GEO.sph, M(o.paw), [0, -0.2, 0.04], [0.05, 0.035, 0.05]));
    if (s < 0) R.armL = arm; else R.armR = arm;
  }
  // 頭
  const hr = o.headR || 0.31;
  R.headR = hr;
  R.head = saveBase(grp(body, [0, 0.5, 0]));
  R.head.add(mesh(GEO.sph, M(o.headCol || o.fur), [0, hr * 0.72, 0], [hr, hr * 0.9, hr * 0.92]));
  R.headTop = hr * 1.55 + 0.5;
  if (o.muzzle) R.head.add(mesh(GEO.sph, M(o.muzzle), [0, hr * 0.5, hr * 0.72], [hr * 0.42, hr * 0.3, hr * 0.32]));
  if (o.nose) R.head.add(mesh(GEO.sph, M(o.nose), [0, hr * 0.62, hr * 0.98], [hr * 0.11, hr * 0.08, hr * 0.07]));
  addEyes(R, R.head, hr * 0.8, hr * 0.36, hr * 0.84, hr * 0.1);
  if (o.blush !== false) addBlush(R, R.head, hr * 0.52, hr * 0.56, hr * 0.78);
  return body;
}
function bushyTail(R, parent, pts, col, tip, r0) {
  const g = saveBase(grp(parent, [0, 0.2, -0.2]));
  pts.forEach((p, i) => g.add(mesh(GEO.sph, R.M(i === pts.length - 1 && tip ? tip : col), p, (r0 || 0.11) * (1 - i * 0.06))));
  R.tail = g; return g;
}

// ---- 各動物 ----
const BUILD = {
  hedgehog(R) {
    const M = R.M;
    R.body = saveBase(grp(R.yaw));
    R.torso = saveBase(mesh(GEO.sph, M('#5d6779'), [0, 0.27, -0.04], [0.33, 0.27, 0.34])); R.body.add(R.torso);
    const sp = R.spikes = saveBase(grp(R.body, [0, 0.27, -0.04]));
    const sm = M('#454d5e'), sm2 = M('#6e7890');
    for (let i = 0; i < 34; i++) {
      const a = (i * 2.399) % (Math.PI * 2), t = 0.15 + (i / 34) * 0.85, el = Math.acos(1 - t) * 0.95;
      const dir = new THREE.Vector3(Math.sin(el) * Math.cos(a), Math.cos(el), Math.sin(el) * Math.sin(a));
      if (dir.z > 0.55 && dir.y < 0.7) continue;
      const c = mesh(GEO.cone, i % 3 ? sm : sm2, [dir.x * 0.3, dir.y * 0.25, dir.z * 0.31 - 0.02], [0.05, 0.2, 0.05]);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); sp.add(c);
    }
    R.head = saveBase(grp(R.body, [0, 0.2, 0.2]));
    R.head.add(mesh(GEO.sph, M('#ecd29a'), [0, 0.07, 0.04], [0.21, 0.19, 0.18]));
    R.head.add(mesh(GEO.sph, M('#ecd29a'), [0, 0.03, 0.2], [0.09, 0.075, 0.12]));
    R.head.add(mesh(GEO.sph, M('#2e221d'), [0, 0.05, 0.32], [0.035, 0.03, 0.03]));
    roundEar(R, R.head, -0.13, 0.2, 0.0, '#d9b97f', '#f1d9b0', 0.05); roundEar(R, R.head, 0.13, 0.2, 0.0, '#d9b97f', '#f1d9b0', 0.05);
    addEyes(R, R.head, 0.12, 0.09, 0.19, 0.03); addBlush(R, R.head, 0.03, 0.13, 0.17);
    for (const s of [-1, 1]) { const l = saveBase(grp(R.body, [s * 0.15, 0.06, 0.1])); l.add(mesh(GEO.sph, M('#c9ad78'), [0, -0.03, 0.03], [0.06, 0.045, 0.08])); s < 0 ? (R.armL = l) : (R.armR = l); }
    R.headR = 0.2; R.headTop = 0.62;
  },
  squirrel(R) {
    plush(R, { fur: '#c8743a', belly: '#f3dcb5', muzzle: '#f3dcb5', nose: '#3a2620', paw: '#a65d2c', headR: 0.28 });
    triEar(R, R.head, -0.15, 0.4, -0.02, '#a65d2c', '#e9b27e', 0.17); triEar(R, R.head, 0.15, 0.4, -0.02, '#a65d2c', '#e9b27e', 0.17);
    bushyTail(R, R.body, [[0.04, 0, 0], [0.1, 0.16, -0.1], [0.17, 0.34, -0.12], [0.22, 0.52, -0.08], [0.24, 0.68, 0.0], [0.2, 0.78, 0.08]], '#c8743a', '#e9b27e', 0.17);
    R.prop = mesh(GEO.sph, R.M('#b07a42'), [0, -0.2, 0.08], [0.05, 0.06, 0.05]); R.armR.add(R.prop);
  },
  wolf(R) {
    plush(R, { fur: '#8e959e', belly: '#e9e3d6', muzzle: '#e9e3d6', nose: '#2e221d', headR: 0.29 });
    R.head.children[1].scale.set(0.15, 0.1, 0.17); R.head.children[1].position.z = 0.26;
    triEar(R, R.head, -0.16, 0.4, -0.03, '#737a84', '#d9a7a0', 0.2, 0.18); triEar(R, R.head, 0.16, 0.4, -0.03, '#737a84', '#d9a7a0', 0.2, 0.18);
    R.jaw = saveBase(grp(R.head, [0, 0.1, 0.18])); R.jaw.add(mesh(GEO.sph, R.M('#d9d1c2'), [0, 0, 0.05], [0.09, 0.03, 0.08]));
    bushyTail(R, R.body, [[0, 0, 0], [0.04, 0.02, -0.12], [0.08, 0.08, -0.22]], '#7b828c', '#e9e3d6', 0.1);
  },
  frog(R) {
    const M = R.M;
    R.body = saveBase(grp(R.yaw));
    R.torso = saveBase(mesh(GEO.sph, M('#6fa35a'), [0, 0.24, 0], [0.34, 0.24, 0.3])); R.body.add(R.torso);
    R.body.add(mesh(GEO.sph, M('#e3e7b0'), [0, 0.2, 0.13], [0.24, 0.15, 0.2]));
    R.head = saveBase(grp(R.body, [0, 0.32, 0.02]));
    for (const s of [-1, 1]) {
      R.head.add(mesh(GEO.sph, M('#6fa35a'), [s * 0.16, 0.12, 0.06], 0.11));
      R.head.add(mesh(GEO.sph, M('#f7f2df'), [s * 0.16, 0.14, 0.13], [0.07, 0.07, 0.05]));
    }
    R.eyeMat = M('#241914'); R.glow = '#ffe27a';
    for (const s of [-1, 1]) R.head.add(mesh(GEO.sph, R.eyeMat, [s * 0.16, 0.14, 0.17], [0.04, 0.045, 0.025]));
    R.mouth = saveBase(mesh(GEO.torus, M('#3a2620'), [0, -0.01, 0.2], [0.14, 0.05, 0.08], [0.2, 0, 0])); R.head.add(R.mouth);
    addBlush(R, R.head, 0.01, 0.2, 0.17);
    for (const s of [-1, 1]) {
      const l = saveBase(grp(R.body, [s * 0.27, 0.1, -0.04])); l.add(mesh(GEO.sph, M('#5a8a48'), [0, 0, 0], [0.13, 0.09, 0.17]));
      l.add(mesh(GEO.sph, M('#5a8a48'), [s * 0.04, -0.08, 0.13], [0.09, 0.03, 0.07])); s < 0 ? (R.legL = l) : (R.legR = l);
      const a = saveBase(grp(R.body, [s * 0.15, 0.12, 0.2])); a.add(mesh(GEO.sph, M('#5a8a48'), [0, -0.05, 0.02], [0.05, 0.08, 0.05])); s < 0 ? (R.armL = a) : (R.armR = a);
    }
    R.tongue = mesh(GEO.cap, M('#e98a9a'), [0, 0, 0], [0.05, 1, 0.05]); R.tongue.visible = false; R.yaw.add(R.tongue);
    R.headR = 0.25; R.headTop = 0.6;
  },
  bat(R) {
    const M = R.M;
    R.fly = 0.42;
    R.body = saveBase(grp(R.yaw));
    R.torso = saveBase(mesh(GEO.sph, M('#5b4766'), [0, 0.24, 0], [0.17, 0.2, 0.16])); R.body.add(R.torso);
    R.body.add(mesh(GEO.sph, M('#8a7393'), [0, 0.22, 0.08], [0.11, 0.13, 0.09]));
    R.head = saveBase(grp(R.body, [0, 0.4, 0]));
    R.head.add(mesh(GEO.sph, M('#5b4766'), [0, 0.12, 0], [0.22, 0.19, 0.2]));
    triEar(R, R.head, -0.13, 0.24, -0.02, '#4a3955', '#c98fa0', 0.2, 0.35); triEar(R, R.head, 0.13, 0.24, -0.02, '#4a3955', '#c98fa0', 0.2, 0.35);
    addEyes(R, R.head, 0.15, 0.08, 0.17, 0.028, '#ff5a5a'); addBlush(R, R.head, 0.07, 0.13, 0.16);
    for (const s of [-1, 1]) R.head.add(mesh(GEO.cone, M('#ffffff'), [s * 0.035, 0.03, 0.19], [0.015, 0.04, 0.015], [Math.PI, 0, 0]));
    // 翅膀：扇形翼膜（波浪下緣）＋沿上緣的翼骨，雙面著色，從側面看也不會變成一條線
    const ws = new THREE.Shape(); ws.moveTo(0, 0.04); ws.lineTo(0.56, 0.14);
    ws.quadraticCurveTo(0.5, -0.02, 0.44, -0.12); ws.quadraticCurveTo(0.38, -0.02, 0.3, -0.16); ws.quadraticCurveTo(0.22, -0.04, 0.14, -0.14); ws.quadraticCurveTo(0.06, -0.06, 0, -0.08); ws.lineTo(0, 0.04);
    const wgeo = new THREE.ShapeGeometry(ws, 6);
    const wmat = charMat(new THREE.MeshToonMaterial({ color: '#3f3149', gradientMap: charGrad(), side: THREE.DoubleSide })); wmat.userData.op = 1; R.M.list.push(wmat);
    const bmat = M('#2d2236');
    for (const s of [-1, 1]) {
      const w = saveBase(grp(R.body, [s * 0.13, 0.3, -0.04], [0, s * 0.35, 0]));
      const mem = new THREE.Mesh(wgeo, wmat); mem.scale.x = s; w.add(mem);
      const bone = (x0, y0, x1, y1, r) => { const len = Math.hypot(x1 - x0, y1 - y0); const b = mesh(GEO.cyl, bmat, [s * (x0 + x1) / 2, (y0 + y1) / 2, 0.004], [r, len, r], [0, 0, s * (Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2)]); w.add(b); };
      bone(0, 0.04, 0.56, 0.14, 0.013); bone(0.02, 0.03, 0.44, -0.1, 0.007); bone(0.02, 0.02, 0.3, -0.14, 0.007); bone(0.02, 0.01, 0.14, -0.12, 0.007);
      w.add(mesh(GEO.sph, bmat, [s * 0.56, 0.14, 0], 0.02));
      s < 0 ? (R.wingL = w) : (R.wingR = w);
    }
    for (const s of [-1, 1]) { const l = saveBase(grp(R.body, [s * 0.06, 0.06, 0])); l.add(mesh(GEO.sph, M('#3f3149'), [0, -0.02, 0], [0.04, 0.05, 0.04])); s < 0 ? (R.legL = l) : (R.legR = l); }
    R.headR = 0.2; R.headTop = 0.85;
  },
  redpanda(R) {
    plush(R, { fur: '#a8442c', limb: '#4a2a22', belly: '#4a2a22', muzzle: '#f4ead8', nose: '#2e221d', headR: 0.3 });
    const hr = 0.3;
    for (const s of [-1, 1]) R.head.add(mesh(GEO.sph, R.M('#f4ead8'), [s * 0.12, hr * 1.05, hr * 0.8], [0.05, 0.03, 0.03]));
    for (const s of [-1, 1]) R.head.add(mesh(GEO.sph, R.M('#7a2e1e'), [s * 0.11, hr * 0.55, hr * 0.86], [0.025, 0.07, 0.02], [0, 0, s * 0.3]));
    triEar(R, R.head, -0.18, 0.42, -0.02, '#8e3824', '#f4ead8', 0.17, 0.4); triEar(R, R.head, 0.18, 0.42, -0.02, '#8e3824', '#f4ead8', 0.17, 0.4);
    const t = saveBase(grp(R.body, [0, 0.15, -0.2])); R.tail = t;
    for (let i = 0; i < 6; i++) t.add(mesh(GEO.sph, R.M(i % 2 ? '#e8c49a' : '#a8442c'), [Math.sin(i * 0.5) * 0.06, i * 0.035, -i * 0.07], 0.1 - i * 0.004));
  },
  skunk(R) {
    plush(R, { fur: '#3d3842', belly: '#4a4550', muzzle: '#4a4550', nose: '#e98a9a', headR: 0.29 });
    R.head.add(mesh(GEO.sph, R.M('#f2efe8'), [0, 0.36, 0.12], [0.05, 0.15, 0.17], [0.4, 0, 0]));
    roundEar(R, R.head, -0.18, 0.4, -0.02, '#2e2a33', '#4a4550', 0.07); roundEar(R, R.head, 0.18, 0.4, -0.02, '#2e2a33', '#4a4550', 0.07);
    R.body.add(mesh(GEO.sph, R.M('#f2efe8'), [0, 0.42, -0.12], [0.05, 0.14, 0.12]));
    const t = saveBase(grp(R.body, [0, 0.18, -0.22])); R.tail = t;
    const pts = [[0.04, 0, 0], [0.1, 0.16, -0.1], [0.17, 0.36, -0.12], [0.22, 0.56, -0.06], [0.22, 0.72, 0.04]];
    pts.forEach((p, i) => { t.add(mesh(GEO.sph, R.M('#3d3842'), p, 0.16 - i * 0.01)); t.add(mesh(GEO.sph, R.M('#f2efe8'), [p[0] - 0.05, p[1] + 0.02, p[2] + 0.04], [0.06, 0.11, 0.12])); });
  },
  croc(R) {
    plush(R, { fur: '#5e8a4a', belly: '#d8d7a0', headR: 0.28, blush: false });
    const hr = 0.28, M = R.M;
    R.head.children[0].scale.set(0.27, 0.2, 0.26); R.head.children[0].position.y = 0.16;
    R.jawU = saveBase(grp(R.head, [0, 0.16, 0.12]));
    R.jawU.add(mesh(GEO.sph, M('#6e9a58'), [0, 0.02, 0.18], [0.2, 0.08, 0.24]));
    for (let i = 0; i < 7; i++) R.jawU.add(mesh(GEO.cone, M('#ffffff'), [-0.15 + i * 0.05, -0.05, 0.14 + Math.cos((i - 3) / 3) * 0.1], [0.015, 0.035, 0.015], [Math.PI, 0, 0]));
    for (const s of [-1, 1]) R.jawU.add(mesh(GEO.sph, M('#2e221d'), [s * 0.05, 0.08, 0.38], 0.015));
    R.jaw = saveBase(grp(R.head, [0, 0.08, 0.1])); R.jaw.add(mesh(GEO.sph, M('#d8d7a0'), [0, 0, 0.16], [0.17, 0.05, 0.2]));
    R.eyeMat = M('#241914'); R.glow = '#ffe27a';
    for (const s of [-1, 1]) { R.head.add(mesh(GEO.sph, M('#5e8a4a'), [s * 0.11, 0.33, 0.04], 0.075)); R.head.add(mesh(GEO.sph, R.eyeMat, [s * 0.11, 0.35, 0.1], [0.03, 0.035, 0.02])); }
    for (let i = 0; i < 4; i++) R.body.add(mesh(GEO.sph, M('#4c7339'), [0, 0.45 - i * 0.1, -0.2 - i * 0.02], 0.045));
    const t = saveBase(grp(R.body, [0, 0.12, -0.2])); R.tail = t; t.add(mesh(GEO.cone, M('#5e8a4a'), [0, 0, -0.2], [0.13, 0.42, 0.08], [-1.45, 0, 0]));
    R.headTop = 0.95;
  },
  bee(R) {
    const M = R.M;
    R.fly = 0.38;
    R.body = saveBase(grp(R.yaw));
    R.torso = saveBase(mesh(GEO.sph, M('#f2c14e'), [0, 0.2, -0.04], [0.2, 0.19, 0.22])); R.body.add(R.torso);
    for (const [y, r] of [[0.24, 0.19], [0.13, 0.15]]) R.body.add(mesh(GEO.torus, M('#3a2e28'), [0, y, -0.04], [r, r, 0.22], [Math.PI / 2, 0, 0]));
    R.body.add(mesh(GEO.cone, M('#3a2e28'), [0, 0.06, -0.18], [0.035, 0.1, 0.035], [-2.3, 0, 0]));
    R.head = saveBase(grp(R.body, [0, 0.36, 0.03]));
    R.head.add(mesh(GEO.sph, M('#f6cf63'), [0, 0.12, 0], [0.25, 0.23, 0.23]));
    addEyes(R, R.head, 0.15, 0.09, 0.2, 0.033); addBlush(R, R.head, 0.07, 0.15, 0.19);
    R.head.add(mesh(GEO.torus, M('#3a2620'), [0, 0.05, 0.215], [0.035, 0.025, 0.03], [0, 0, Math.PI]));
    for (const s of [-1, 1]) {
      const a = saveBase(grp(R.head, [s * 0.08, 0.3, 0.06], [0.3, 0, -s * 0.4])); a.add(mesh(GEO.cyl, M('#3a2e28'), [0, 0.08, 0], [0.012, 0.16, 0.012])); a.add(mesh(GEO.sph, M('#3a2e28'), [0, 0.17, 0], 0.03));
      s < 0 ? (R.earL = a) : (R.earR = a);
      const w = saveBase(grp(R.body, [s * 0.1, 0.36, -0.15])); w.add(mesh(GEO.sph, M('#dcebf2', { op: 0.75 }), [s * 0.13, 0.08, 0], [0.15, 0.1, 0.02], [0, 0, s * 0.5]));
      s < 0 ? (R.wingL = w) : (R.wingR = w);
    }
    R.headR = 0.25; R.headTop = 0.85;
  },
  koala(R) {
    plush(R, { fur: '#8f9fae', belly: '#c9d1d8', headR: 0.32, paw: '#76879a' });
    R.head.add(mesh(GEO.sph, R.M('#3a3338'), [0, 0.22, 0.29], [0.07, 0.09, 0.06]));
    roundEar(R, R.head, -0.27, 0.36, -0.02, '#8f9fae', '#ece6dc', 0.13); roundEar(R, R.head, 0.27, 0.36, -0.02, '#8f9fae', '#ece6dc', 0.13);
  },
  cheetah(R) {
    plush(R, { fur: '#e3b04b', belly: '#f6e7c4', muzzle: '#f6e7c4', nose: '#2e221d', headR: 0.28, bodyW: 0.22 });
    const sp = R.M('#5a3a1e');
    [[0.1, 0.32, 0.17], [-0.12, 0.28, 0.15], [0.16, 0.2, 0.08], [-0.16, 0.36, 0.06], [0.05, 0.4, -0.18], [-0.08, 0.2, -0.18]].forEach(p => R.body.add(mesh(GEO.sph, sp, p, [0.025, 0.025, 0.012])));
    [[0.16, 0.34, 0.16], [-0.17, 0.3, 0.15], [-0.08, 0.4, -0.2]].forEach(p => R.head.add(mesh(GEO.sph, sp, p, [0.022, 0.022, 0.012])));
    for (const s of [-1, 1]) R.head.add(mesh(GEO.cap, sp, [s * 0.085, 0.15, 0.255], [0.011, 0.07, 0.011], [0.25, 0, s * 0.12]));
    roundEar(R, R.head, -0.18, 0.4, -0.02, '#c99437', '#f6e7c4', 0.06); roundEar(R, R.head, 0.18, 0.4, -0.02, '#c99437', '#f6e7c4', 0.06);
    const t = saveBase(grp(R.body, [0, 0.14, -0.18])); R.tail = t;
    for (let i = 0; i < 6; i++) t.add(mesh(GEO.sph, R.M(i % 2 ? '#5a3a1e' : '#e3b04b'), [0.02 * i, 0.03 * i, -0.06 * i], 0.05));
  },
  octopus(R) {
    const M = R.M;
    R.body = saveBase(grp(R.yaw));
    R.head = saveBase(grp(R.body, [0, 0.3, 0]));
    R.torso = saveBase(mesh(GEO.sph, M('#d46a6a'), [0, 0.2, 0], [0.3, 0.34, 0.3])); R.head.add(R.torso);
    [[0.12, 0.42, 0.18], [-0.15, 0.36, 0.2], [0.2, 0.25, 0.18], [-0.05, 0.5, 0.1]].forEach(p => R.head.add(mesh(GEO.sph, M('#e89a8a'), p, [0.045, 0.045, 0.02])));
    addEyes(R, R.head, 0.16, 0.11, 0.27, 0.045); addBlush(R, R.head, 0.06, 0.19, 0.24);
    R.head.add(mesh(GEO.torus, M('#7a2e2e'), [0, 0.05, 0.29], [0.025, 0.025, 0.02]));
    R.tents = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const t = saveBase(grp(R.body, [Math.sin(a) * 0.17, 0.18, Math.cos(a) * 0.17], [0, a, 0]));
      const segs = [];
      let parent = t;
      for (let k = 0; k < 4; k++) { const s = saveBase(grp(parent, [0, -0.02, k ? 0.07 : 0])); s.add(mesh(GEO.sph, M(k % 2 ? '#c25858' : '#d46a6a'), [0, 0, 0.03], 0.065 - k * 0.011)); segs.push(s); parent = s; }
      R.tents.push(segs);
    }
    R.headR = 0.3; R.headTop = 0.9;
  },
  owl(R) {
    const M = R.M;
    R.body = saveBase(grp(R.yaw));
    R.torso = saveBase(mesh(GEO.sph, M('#8b6a4e'), [0, 0.32, 0], [0.27, 0.34, 0.25])); R.body.add(R.torso);
    R.body.add(mesh(GEO.sph, M('#e9d6b4'), [0, 0.25, 0.12], [0.18, 0.2, 0.15]));
    for (let i = 0; i < 3; i++) R.body.add(mesh(GEO.cone, M('#b8946e'), [-0.06 + i * 0.06, 0.25, 0.26], [0.02, 0.03, 0.01], [0, 0, Math.PI]));
    R.head = saveBase(grp(R.body, [0, 0.5, 0]));
    R.head.add(mesh(GEO.sph, M('#8b6a4e'), [0, 0.15, 0], [0.29, 0.25, 0.26]));
    for (const s of [-1, 1]) R.head.add(mesh(GEO.sph, M('#e9d6b4'), [s * 0.11, 0.15, 0.17], [0.11, 0.11, 0.08]));
    R.eyeMat = M('#241914'); R.glow = '#ffcf3a';
    for (const s of [-1, 1]) { R.head.add(mesh(GEO.sph, R.eyeMat, [s * 0.11, 0.15, 0.24], [0.055, 0.06, 0.03])); R.head.add(mesh(GEO.sphLo, M('#ffffff', { basic: 1 }), [s * 0.11 + 0.02, 0.18, 0.265], 0.016)); }
    R.head.add(mesh(GEO.cone, M('#e09a3a'), [0, 0.07, 0.27], [0.03, 0.07, 0.03], [Math.PI * 0.85, 0, 0]));
    triEar(R, R.head, -0.18, 0.32, -0.02, '#755841', null, 0.13, 0.5); triEar(R, R.head, 0.18, 0.32, -0.02, '#755841', null, 0.13, 0.5);
    for (const s of [-1, 1]) {
      const w = saveBase(grp(R.body, [s * 0.24, 0.42, -0.02])); w.add(mesh(GEO.sph, M('#6e523c'), [0, -0.13, 0], [0.07, 0.17, 0.13]));
      s < 0 ? (R.wingL = w) : (R.wingR = w);
      const l = saveBase(grp(R.body, [s * 0.09, 0.04, 0.08])); l.add(mesh(GEO.sph, M('#e09a3a'), [0, -0.02, 0.02], [0.05, 0.03, 0.06])); s < 0 ? (R.legL = l) : (R.legR = l);
    }
    R.armL = R.wingL; R.armR = R.wingR;
    R.headR = 0.28; R.headTop = 0.98;
  },
  elephant(R) {
    plush(R, { fur: '#8c98a6', belly: '#a3aebb', headR: 0.32, bodyW: 0.3, bodyH: 0.3 });
    const M = R.M;
    for (const s of [-1, 1]) {
      const e = saveBase(grp(R.head, [s * 0.28, 0.24, -0.02], [0, s * 0.35, 0]));
      e.add(mesh(GEO.sph, M('#76838f'), [s * 0.1, 0, 0], [0.2, 0.24, 0.04])); e.add(mesh(GEO.sph, M('#c9a9a6'), [s * 0.1, 0, 0.03], [0.14, 0.17, 0.02]));
      s < 0 ? (R.earL = e) : (R.earR = e);
      R.head.add(mesh(GEO.cone, M('#f4ecd8'), [s * 0.1, 0.08, 0.27], [0.025, 0.12, 0.025], [2.3, 0, -s * 0.3]));
    }
    R.trunk = [];
    let parent = saveBase(grp(R.head, [0, 0.2, 0.28], [0.25, 0, 0]));
    R.trunk.push(parent);
    for (let i = 0; i < 5; i++) { parent.add(mesh(GEO.sph, M('#8c98a6'), [0, -0.04, 0.01], [0.075 - i * 0.008, 0.07, 0.075 - i * 0.008])); const n = saveBase(grp(parent, [0, -0.07, 0.01], [0.18, 0, 0])); R.trunk.push(n); parent = n; }
    R.headTop = 1.0;
  },
  lion(R) {
    plush(R, { fur: '#d9a24a', belly: '#f5e2b8', muzzle: '#f5e2b8', nose: '#5a3220', headR: 0.27 });
    const mane = R.mane = saveBase(grp(R.head, [0, 0.2, -0.05]));
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; mane.add(mesh(GEO.sph, R.M(i % 2 ? '#9a5226' : '#b0622e'), [Math.cos(a) * 0.29, Math.sin(a) * 0.27, -0.02], 0.12)); }
    mane.add(mesh(GEO.sph, R.M('#b0622e'), [0, 0, -0.06], [0.33, 0.31, 0.12]));
    mane.add(mesh(GEO.sph, R.M('#9a5226'), [0, -0.02, -0.17], [0.31, 0.3, 0.16]));
    roundEar(R, R.head, -0.18, 0.36, 0.02, '#c48d3c', '#f5e2b8', 0.06); roundEar(R, R.head, 0.18, 0.36, 0.02, '#c48d3c', '#f5e2b8', 0.06);
    R.jaw = saveBase(grp(R.head, [0, 0.1, 0.2])); R.jaw.add(mesh(GEO.sph, R.M('#e9cf9c'), [0, 0, 0.02], [0.08, 0.03, 0.05]));
    const t = saveBase(grp(R.body, [0, 0.12, -0.2])); R.tail = t; t.add(mesh(GEO.cyl, R.M('#c48d3c'), [0, 0.12, -0.08], [0.02, 0.3, 0.02], [-0.6, 0, 0])); t.add(mesh(GEO.sph, R.M('#9a5226'), [0, 0.25, -0.17], 0.05));
    R.headTop = 1.05;
  },
  hare(R) {
    plush(R, { fur: '#cdb79a', belly: '#efe3cf', muzzle: '#efe3cf', nose: '#c96b6b', headR: 0.26 });
    for (const s of [-1, 1]) { const e = saveBase(grp(R.head, [s * 0.08, 0.4, -0.02], [0, 0, -s * 0.15])); e.add(mesh(GEO.sph, R.M('#b9a283'), [0, 0.17, 0], [0.05, 0.19, 0.035])); e.add(mesh(GEO.sph, R.M('#e8b8b0'), [0, 0.17, 0.02], [0.028, 0.14, 0.02])); s < 0 ? (R.earL = e) : (R.earR = e); }
    R.headTop = 1.05;
  },
  boar(R) {
    plush(R, { fur: '#6e4e3a', headR: 0.29, bodyW: 0.3, limb: '#4e3628', blush: false });
    R.head.add(mesh(GEO.sph, R.M('#c98d7a'), [0, 0.14, 0.26], [0.1, 0.075, 0.07]));
    for (const s of [-1, 1]) { R.head.add(mesh(GEO.sph, R.M('#2e221d'), [s * 0.035, 0.15, 0.32], 0.015)); R.head.add(mesh(GEO.cone, R.M('#f4ecd8'), [s * 0.1, 0.12, 0.25], [0.02, 0.09, 0.02], [0, 0, -s * 0.4])); }
    triEar(R, R.head, -0.17, 0.36, 0, '#5a3f2e', null, 0.11, 0.6); triEar(R, R.head, 0.17, 0.36, 0, '#5a3f2e', null, 0.11, 0.6);
    for (let i = 0; i < 6; i++) R.head.add(mesh(GEO.cone, R.M('#4e3628'), [0, 0.43 - i * 0.03, -0.05 - i * 0.06], [0.03, 0.09, 0.03], [-0.5 - i * 0.2, 0, 0]));
  },
};
// 魔王：野豬王（野豬加金冠、大獠牙）
BUILD.kingboar = function (R) {
  BUILD.boar(R);
  const crown = grp(R.head); crown.position.set(0, 0.42, 0);
  crown.add(mesh(GEO.cyl, R.M('#f2c14e'), [0, 0, 0], [0.16, 0.05, 0.16]));
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; crown.add(mesh(GEO.cone, R.M('#ffd34d'), [Math.cos(a) * 0.14, 0.07, Math.sin(a) * 0.14], [0.035, 0.08, 0.035])); }
  crown.add(mesh(GEO.sph, R.M('#d9483a'), [0, 0.03, 0.16], 0.03));
  for (const s of [-1, 1]) R.head.add(mesh(GEO.cone, R.M('#fff6e0'), [s * 0.13, 0.1, 0.27], [0.035, 0.16, 0.035], [0.3, 0, -s * 0.6]));
};
// ---- v0.5 新動物 ----
Object.assign(BUILD, {
  penguin(R) {
    plush(R, { fur: '#3a4152', belly: '#f4f1ea', headR: 0.28, limb: '#3a4152', bodyW: 0.27, bodyH: 0.29 });
    const M = R.M, hr = 0.28;
    R.head.add(mesh(GEO.sph, M('#f4f1ea'), [0, hr * 0.62, hr * 0.5], [0.22, 0.17, 0.14]));
    R.head.add(mesh(GEO.cone, M('#f0a030'), [0, hr * 0.55, hr * 1.02], [0.045, 0.09, 0.035], [Math.PI / 2, 0, 0]));
    for (const a of [R.armL, R.armR]) { a.children[0].scale.set(0.035, 0.15, 0.085); a.children[0].position.y = -0.12; }
    for (const l of [R.legL, R.legR]) { l.children[0].material = M('#f0a030'); l.children[0].scale.set(0.08, 0.03, 0.12); }
    R.body.add(mesh(GEO.sph, M('#f2c14e'), [0, 0.47, 0.17], [0.09, 0.03, 0.05]));
    R.headTop = 0.98;
  },
  rhino(R) {
    plush(R, { fur: '#8e8a86', belly: '#aaa49d', headR: 0.29, bodyW: 0.31, bodyH: 0.29, limb: '#7a7672', blush: false });
    const M = R.M;
    R.head.add(mesh(GEO.sph, M('#9c9893'), [0, 0.13, 0.22], [0.17, 0.13, 0.17]));
    for (const s of [-1, 1]) R.head.add(mesh(GEO.sph, M('#5a5450'), [s * 0.05, 0.12, 0.38], [0.015, 0.02, 0.01]));
    R.horn = saveBase(grp(R.head, [0, 0.2, 0.3], [0.35, 0, 0]));
    R.horn.add(mesh(GEO.cone, M('#e8dcc0'), [0, 0.1, 0], [0.065, 0.22, 0.065]));
    R.horn.add(mesh(GEO.cone, M('#e8dcc0'), [0, 0.03, -0.12], [0.04, 0.1, 0.04]));
    triEar(R, R.head, -0.17, 0.4, -0.04, '#7a7672', '#d9b0a8', 0.13, 0.5); triEar(R, R.head, 0.17, 0.4, -0.04, '#7a7672', '#d9b0a8', 0.13, 0.5);
    for (let i = 0; i < 3; i++) R.body.add(mesh(GEO.sph, M('#7f7b77'), [0, 0.42 - i * 0.08, -0.22], [0.2, 0.03, 0.06]));
    const t = saveBase(grp(R.body, [0, 0.16, -0.26])); R.tail = t; t.add(mesh(GEO.cyl, M('#7a7672'), [0, -0.04, -0.03], [0.015, 0.12, 0.015], [-0.4, 0, 0])); t.add(mesh(GEO.sph, M('#4a4542'), [0, -0.1, -0.05], 0.025));
    R.headTop = 1.0;
  },
  chameleon(R) {
    plush(R, { fur: '#6cbf5c', belly: '#d8ef9a', headR: 0.27, limb: '#58a84a', blush: true });
    const M = R.M;
    R.head.add(mesh(GEO.cone, M('#58a84a'), [0, 0.42, -0.08], [0.16, 0.2, 0.08], [-0.5, 0, 0]));
    for (const s of [-1, 1]) {
      R.head.add(mesh(GEO.sph, M('#6cbf5c'), [s * 0.2, 0.24, 0.12], [0.1, 0.1, 0.1]));
      R.head.add(mesh(GEO.sph, M('#f7f2df'), [s * 0.24, 0.25, 0.16], [0.045, 0.05, 0.04]));
    }
    for (let i = 0; i < 5; i++) R.body.add(mesh(GEO.cone, M('#4f9a40'), [0, 0.5 - i * 0.07, -0.2 - i * 0.02], [0.025, 0.05, 0.025], [-0.6, 0, 0]));
    [[0.12, 0.3, 0.2], [-0.15, 0.24, 0.17], [0.18, 0.2, 0.05]].forEach(p => R.body.add(mesh(GEO.sph, M('#f2b84a'), p, [0.03, 0.03, 0.015])));
    const t = saveBase(grp(R.body, [0, 0.12, -0.24])); R.tail = t;
    t.add(mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 20, Math.PI * 1.6), M('#58a84a'), [0, 0.04, -0.08], 1, [0, Math.PI / 2, 0]));
    R.tongue = mesh(GEO.cap, M('#e98a9a'), [0, 0, 0], [0.05, 1, 0.05]); R.tongue.visible = false; R.yaw.add(R.tongue);
    R.headTop = 1.02;
  },
  fox(R) {
    plush(R, { fur: '#e07a34', belly: '#fbeedd', muzzle: '#fbeedd', nose: '#2e221d', headR: 0.28, limb: '#4a2e22', bodyW: 0.23 });
    R.head.children[1].scale.set(0.13, 0.09, 0.17); R.head.children[1].position.z = 0.25;
    triEar(R, R.head, -0.16, 0.4, -0.03, '#d06a28', '#3a2620', 0.24, 0.22); triEar(R, R.head, 0.16, 0.4, -0.03, '#d06a28', '#3a2620', 0.24, 0.22);
    for (const s of [-1, 1]) R.head.add(mesh(GEO.sph, R.M('#fbeedd'), [s * 0.14, 0.12, 0.17], [0.09, 0.07, 0.07]));
    R.jaw = saveBase(grp(R.head, [0, 0.1, 0.2])); R.jaw.add(mesh(GEO.sph, R.M('#f2dcc4'), [0, 0, 0.03], [0.07, 0.025, 0.07]));
    bushyTail(R, R.body, [[0, 0, 0], [0.06, 0.08, -0.12], [0.12, 0.2, -0.2], [0.15, 0.34, -0.22], [0.14, 0.46, -0.18]], '#e07a34', '#fbeedd', 0.15);
  },
  eagle(R) {
    const M = R.M;
    R.body = saveBase(grp(R.yaw));
    R.torso = saveBase(mesh(GEO.sph, M('#6b4a32'), [0, 0.3, 0], [0.25, 0.3, 0.24])); R.body.add(R.torso);
    R.body.add(mesh(GEO.sph, M('#8a6444'), [0, 0.26, 0.11], [0.16, 0.2, 0.14]));
    R.head = saveBase(grp(R.body, [0, 0.5, 0.02]));
    R.head.add(mesh(GEO.sph, M('#f4efe6'), [0, 0.14, 0], [0.25, 0.23, 0.24]));
    R.head.add(mesh(GEO.sph, M('#f4efe6'), [0, 0.0, -0.04], [0.2, 0.1, 0.2]));
    R.beak = saveBase(grp(R.head, [0, 0.1, 0.22]));
    R.beak.add(mesh(GEO.sph, M('#f2c14e'), [0, 0.0, 0.02], [0.07, 0.055, 0.08]));
    R.beak.add(mesh(GEO.cone, M('#e0a020'), [0, -0.03, 0.08], [0.035, 0.07, 0.03], [Math.PI * 0.75, 0, 0]));
    addEyes(R, R.head, 0.19, 0.1, 0.2, 0.032); addBlush(R, R.head, 0.09, 0.15, 0.19);
    for (const s of [-1, 1]) R.head.add(mesh(GEO.sph, M('#3a2620'), [s * 0.1, 0.25, 0.19], [0.06, 0.015, 0.02], [0, 0, s * -0.35]));
    for (const s of [-1, 1]) {
      const w = saveBase(grp(R.body, [s * 0.22, 0.44, -0.02]));
      w.add(mesh(GEO.sph, M('#5a3c28'), [s * 0.04, -0.12, -0.02], [0.08, 0.2, 0.15]));
      for (let i = 0; i < 3; i++) w.add(mesh(GEO.sph, M(i % 2 ? '#3f2a1c' : '#4a3222'), [s * 0.05, -0.28 - i * 0.04, -0.06 - i * 0.04], [0.05, 0.08, 0.06]));
      s < 0 ? (R.wingL = w) : (R.wingR = w);
      const l = saveBase(grp(R.body, [s * 0.09, 0.05, 0.06])); l.add(mesh(GEO.sph, M('#f2c14e'), [0, -0.02, 0.03], [0.05, 0.03, 0.06]));
      for (let i = -1; i <= 1; i++) l.add(mesh(GEO.cone, M('#2e221d'), [i * 0.025, -0.03, 0.09], [0.012, 0.035, 0.012], [Math.PI / 2, 0, 0]));
      s < 0 ? (R.legL = l) : (R.legR = l);
    }
    R.armL = R.wingL; R.armR = R.wingR;
    const t = saveBase(grp(R.body, [0, 0.14, -0.2])); R.tail = t; t.add(mesh(GEO.sph, M('#f4efe6'), [0, 0, -0.08], [0.13, 0.03, 0.12], [-0.4, 0, 0]));
    R.headR = 0.25; R.headTop = 0.98;
  },
  eel(R) {
    const M = R.M;
    R.body = saveBase(grp(R.yaw));
    R.torso = saveBase(mesh(GEO.torus, M('#3c6e8f'), [0, 0.1, 0], [0.22, 0.22, 0.4], [Math.PI / 2, 0, 0])); R.body.add(R.torso);
    R.body.add(mesh(GEO.sph, M('#3c6e8f'), [0, 0.08, 0], [0.17, 0.08, 0.17]));
    R.segs = []; let parent = saveBase(grp(R.body, [0, 0.14, 0.12]));
    R.segs.push(parent);
    for (let i = 0; i < 4; i++) { parent.add(mesh(GEO.sph, M(i % 2 ? '#356585' : '#3c6e8f'), [0, 0.06, 0], [0.11 - i * 0.004, 0.09, 0.11 - i * 0.004])); parent.add(mesh(GEO.sph, M('#f2d24a'), [0.06, 0.06, 0.07], 0.022)); const n = saveBase(grp(parent, [0, 0.11, -0.005])); R.segs.push(n); parent = n; }
    R.head = saveBase(grp(parent, [0, 0.02, 0]));
    R.head.add(mesh(GEO.sph, M('#4a82a6'), [0, 0.12, 0.02], [0.2, 0.17, 0.2]));
    R.head.add(mesh(GEO.sph, M('#d8e8c0'), [0, 0.05, 0.12], [0.12, 0.06, 0.1]));
    addEyes(R, R.head, 0.15, 0.09, 0.17, 0.035, '#ffef6a'); addBlush(R, R.head, 0.07, 0.14, 0.16);
    R.head.add(mesh(GEO.cone, M('#2f5a76'), [0, 0.3, -0.05], [0.07, 0.14, 0.03], [-0.4, 0, 0]));
    for (const s of [-1, 1]) { const f = saveBase(grp(R.head, [s * 0.18, 0.08, 0])); f.add(mesh(GEO.sph, M('#2f5a76'), [s * 0.04, 0, 0], [0.06, 0.03, 0.05])); s < 0 ? (R.earL = f) : (R.earR = f); }
    R.headR = 0.2; R.headTop = 0.95;
  },
  gorilla(R) {
    plush(R, { fur: '#4b4547', belly: '#6a5e58', headR: 0.29, bodyW: 0.33, bodyH: 0.3, limb: '#3e3839', paw: '#5a4e48', blush: false });
    const M = R.M;
    R.head.add(mesh(GEO.sph, M('#7a6a62'), [0, 0.17, 0.17], [0.19, 0.15, 0.15]));
    R.head.add(mesh(GEO.sph, M('#3e3839'), [0, 0.27, 0.19], [0.2, 0.045, 0.08]));
    for (const s of [-1, 1]) R.head.add(mesh(GEO.sph, M('#2e221d'), [s * 0.035, 0.13, 0.31], [0.018, 0.012, 0.01]));
    roundEar(R, R.head, -0.27, 0.22, 0, '#4b4547', '#6a5e58', 0.06); roundEar(R, R.head, 0.27, 0.22, 0, '#4b4547', '#6a5e58', 0.06);
    for (const a of [R.armL, R.armR]) { a.children[0].scale.set(0.1, 0.17, 0.1); a.children[0].position.y = -0.14; if (a.children[1]) { a.children[1].scale.set(0.08, 0.06, 0.08); a.children[1].position.y = -0.3; } }
    R.body.add(mesh(GEO.sph, M('#9aa0a8'), [0, 0.32, -0.22], [0.2, 0.15, 0.06]));
    R.headTop = 1.02;
  },
  whale(R) {
    const M = R.M;
    R.body = saveBase(grp(R.yaw));
    R.torso = saveBase(mesh(GEO.sph, M('#4a78a8'), [0, 0.34, 0], [0.4, 0.34, 0.44])); R.body.add(R.torso);
    R.body.add(mesh(GEO.sph, M('#e9eef2'), [0, 0.22, 0.12], [0.3, 0.2, 0.33]));
    for (let i = 0; i < 4; i++) R.body.add(mesh(GEO.sph, M('#c8d4de'), [0, 0.12 + i * 0.05, 0.36 - i * 0.02], [0.22 - i * 0.03, 0.008, 0.04]));
    R.head = saveBase(grp(R.body, [0, 0.36, 0.2]));
    addEyes(R, R.head, 0.06, 0.17, 0.17, 0.045); addBlush(R, R.head, -0.03, 0.24, 0.15);
    R.head.add(mesh(GEO.torus, M('#2f4f72'), [0, -0.1, 0.25], [0.08, 0.04, 0.05], [0, 0, Math.PI]));
    R.blow = saveBase(grp(R.head, [0, 0.32, -0.12])); R.blow.add(mesh(GEO.sph, M('#2f4f72'), [0, 0, 0], [0.04, 0.015, 0.03]));
    for (const s of [-1, 1]) { const f = saveBase(grp(R.body, [s * 0.36, 0.2, 0.08], [0, 0, s * 0.6])); f.add(mesh(GEO.sph, M('#3f6a96'), [s * 0.1, -0.04, 0], [0.14, 0.04, 0.09])); s < 0 ? (R.armL = f) : (R.armR = f); }
    const t = saveBase(grp(R.body, [0, 0.3, -0.42])); R.tail = t;
    t.add(mesh(GEO.sph, M('#4a78a8'), [0, 0.05, -0.08], [0.14, 0.12, 0.16]));
    for (const s of [-1, 1]) t.add(mesh(GEO.sph, M('#3f6a96'), [s * 0.13, 0.2, -0.16], [0.16, 0.04, 0.09], [0.5, 0, -s * 0.5]));
    R.headR = 0.4; R.headTop = 0.85;
  },
  peacock(R) {
    const M = R.M;
    R.body = saveBase(grp(R.yaw));
    R.fan = saveBase(grp(R.body, [0, 0.25, -0.2]));
    for (let i = 0; i < 11; i++) {
      const a = (i / 10 - 0.5) * 2.6, f = grp(R.fan, [0, 0, 0], [0, 0, a]);
      f.add(mesh(GEO.sph, M('#3f8a5a'), [0, 0.42, 0], [0.09, 0.32, 0.02]));
      f.add(mesh(GEO.sph, M('#d8b54a'), [0, 0.62, 0.012], [0.06, 0.07, 0.01]));
      f.add(mesh(GEO.sph, M('#2a5aa8'), [0, 0.62, 0.02], [0.035, 0.04, 0.01]));
    }
    R.torso = saveBase(mesh(GEO.sph, M('#2f6fb0'), [0, 0.25, 0], [0.2, 0.22, 0.2])); R.body.add(R.torso);
    R.body.add(mesh(GEO.sph, M('#3f84c4'), [0, 0.24, 0.09], [0.13, 0.15, 0.12]));
    R.head = saveBase(grp(R.body, [0, 0.42, 0.04]));
    R.head.add(mesh(GEO.sph, M('#2f6fb0'), [0, 0.13, 0], [0.22, 0.2, 0.2]));
    for (const s of [-1, 1]) R.head.add(mesh(GEO.sph, M('#f4f1ea'), [s * 0.09, 0.14, 0.15], [0.07, 0.035, 0.03]));
    addEyes(R, R.head, 0.14, 0.09, 0.18, 0.028); addBlush(R, R.head, 0.07, 0.14, 0.17);
    R.head.add(mesh(GEO.cone, M('#d8b090'), [0, 0.08, 0.21], [0.03, 0.06, 0.025], [Math.PI / 2, 0, 0]));
    for (let i = -1; i <= 1; i++) { R.head.add(mesh(GEO.cyl, M('#2a4f80'), [i * 0.04, 0.38, -0.02], [0.006, 0.14, 0.006], [0, 0, i * 0.3])); R.head.add(mesh(GEO.sph, M('#2a5aa8'), [i * 0.06, 0.46, -0.02], 0.025)); }
    for (const s of [-1, 1]) { const w = saveBase(grp(R.body, [s * 0.18, 0.32, -0.02])); w.add(mesh(GEO.sph, M('#a88a5a'), [s * 0.02, -0.08, 0], [0.06, 0.13, 0.1])); s < 0 ? (R.wingL = w) : (R.wingR = w);
      const l = saveBase(grp(R.body, [s * 0.07, 0.06, 0.04])); l.add(mesh(GEO.cyl, M('#8a7a6a'), [0, -0.01, 0], [0.012, 0.1, 0.012])); l.add(mesh(GEO.sph, M('#8a7a6a'), [0, -0.05, 0.03], [0.04, 0.015, 0.05])); s < 0 ? (R.legL = l) : (R.legR = l); }
    R.armL = R.wingL; R.armR = R.wingR;
    R.headR = 0.22; R.headTop = 1.05;
  },
  komodo(R) {
    plush(R, { fur: '#7b7356', belly: '#a39a76', headR: 0.27, bodyW: 0.3, bodyH: 0.25, limb: '#6a6248', blush: false });
    const M = R.M;
    R.head.children[0].scale.set(0.26, 0.2, 0.3); R.head.children[0].position.y = 0.17;
    R.jawU = saveBase(grp(R.head, [0, 0.16, 0.14])); R.jawU.add(mesh(GEO.sph, M('#857c5e'), [0, 0.01, 0.12], [0.17, 0.08, 0.17]));
    for (const s of [-1, 1]) R.jawU.add(mesh(GEO.sph, M('#2e221d'), [s * 0.04, 0.04, 0.28], 0.012));
    R.jaw = saveBase(grp(R.head, [0, 0.1, 0.13])); R.jaw.add(mesh(GEO.sph, M('#b0a682'), [0, 0, 0.1], [0.14, 0.04, 0.15]));
    R.eyeMat = M('#241914'); R.glow = '#ffe27a';
    for (const s of [-1, 1]) { R.head.add(mesh(GEO.sph, M('#7b7356'), [s * 0.12, 0.29, 0.06], 0.07)); R.head.add(mesh(GEO.sph, R.eyeMat, [s * 0.13, 0.3, 0.12], [0.03, 0.035, 0.02])); }
    R.tongue = mesh(GEO.cap, M('#e8c24a'), [0, 0, 0], [0.03, 1, 0.03]); R.tongue.visible = false; R.yaw.add(R.tongue);
    [[0.12, 0.3, 0.15], [-0.14, 0.26, 0.12], [0.18, 0.2, 0.0], [-0.1, 0.38, -0.12], [0.08, 0.34, -0.18]].forEach(p => R.body.add(mesh(GEO.sph, M('#5e573f'), p, [0.035, 0.035, 0.015])));
    const t = saveBase(grp(R.body, [0, 0.12, -0.22])); R.tail = t; t.add(mesh(GEO.cone, M('#7b7356'), [0, 0, -0.22], [0.14, 0.48, 0.1], [-1.45, 0, 0]));
    R.headTop = 0.95;
  },
});
BUILD.minibee = R => BUILD.bee(R);
// 中立物件
BUILD.chest = R => {
  const M = R.M; R.body = saveBase(grp(R.yaw)); R.head = saveBase(grp(R.body, [0, 0.3, 0]));
  R.torso = saveBase(mesh(GEO.box, M('#9a5a2e'), [0, 0.17, 0], [0.62, 0.34, 0.44])); R.body.add(R.torso);
  R.head.add(mesh(GEO.cyl, M('#b06a36'), [0, 0.04, 0], [0.31, 0.62, 0.22], [0, 0, Math.PI / 2]));
  for (const x of [-0.24, 0.24]) R.body.add(mesh(GEO.box, M('#f2c14e'), [x, 0.2, 0.001], [0.06, 0.42, 0.46]));
  R.body.add(mesh(GEO.box, M('#f2c14e'), [0, 0.28, 0.23], [0.1, 0.12, 0.03]));
  R.headR = 0.3; R.headTop = 0.6;
};
BUILD.crate = R => {
  const M = R.M; R.body = saveBase(grp(R.yaw)); R.head = saveBase(grp(R.body, [0, 0.5, 0]));
  R.torso = saveBase(mesh(GEO.box, M('#c49a5a'), [0, 0.25, 0], [0.5, 0.5, 0.5])); R.body.add(R.torso);
  for (const [x, z] of [[0, 0.255], [0, -0.255]]) { R.body.add(mesh(GEO.box, M('#8a6a3a'), [x, 0.25, z], [0.5, 0.08, 0.01])); R.body.add(mesh(GEO.box, M('#8a6a3a'), [x, 0.25, z], [0.08, 0.5, 0.01])); }
  R.headR = 0.25; R.headTop = 0.6;
};
// 小小英雄：圓滾滾的小雞
BUILD.chick = R => {
  const M = R.M; R.body = saveBase(grp(R.yaw));
  R.torso = saveBase(mesh(GEO.sph, M('#f7d24a'), [0, 0.24, 0], [0.24, 0.23, 0.22])); R.body.add(R.torso);
  R.body.add(mesh(GEO.sph, M('#fbe6a0'), [0, 0.2, 0.12], [0.15, 0.13, 0.1]));
  R.head = saveBase(grp(R.body, [0, 0.4, 0])); R.head.add(mesh(GEO.sph, M('#f7d24a'), [0, 0.1, 0], 0.18));
  R.head.add(mesh(GEO.cone, M('#f08a3a'), [0, 0.08, 0.19], [0.05, 0.09, 0.04], [Math.PI / 2, 0, 0]));
  addEyes(R, R.head, 0.14, 0.07, 0.15, 0.025); addBlush(R, R.head, 0.06, 0.11, 0.14);
  for (let i = 0; i < 3; i++) R.head.add(mesh(GEO.sph, M('#f2b830'), [-0.03 + i * 0.03, 0.29 + (i === 1 ? 0.03 : 0), 0], [0.03, 0.06, 0.03]));
  for (const s of [-1, 1]) { const w = saveBase(grp(R.body, [s * 0.22, 0.28, 0])); w.add(mesh(GEO.sph, M('#f2c02e'), [s * 0.03, -0.04, 0], [0.06, 0.11, 0.08])); s < 0 ? (R.armL = w) : (R.armR = w);
    const l = saveBase(grp(R.body, [s * 0.08, 0.04, 0.02])); l.add(mesh(GEO.sph, M('#f08a3a'), [0, -0.01, 0.04], [0.05, 0.02, 0.07])); s < 0 ? (R.legL = l) : (R.legR = l); }
  R.headR = 0.18; R.headTop = 0.75;
};

// 建立一隻：回傳 rig
// ---- v0.13 新動物 ----
Object.assign(BUILD, {
  deer(R) {
    plush(R, { fur: '#c98a52', belly: '#f4e2c4', muzzle: '#f4e2c4', nose: '#3a2418', headR: 0.27, limb: '#a86e3e' });
    const M = R.M;
    for (let i = 0; i < 5; i++) R.body.add(mesh(GEO.sph, M('#fbf2e2'), [(i % 2 ? 1 : -1) * 0.1, 0.36 - i * 0.03, -0.12 - i * 0.02], 0.03)); // 背上白點
    for (const s of [-1, 1]) { // 鹿角
      const a = saveBase(grp(R.head, [s * 0.1, 0.4, -0.02], [0, 0, -s * 0.25]));
      a.add(mesh(GEO.cyl, M('#8a5a32'), [0, 0.08, 0], [0.018, 0.16, 0.018]));
      a.add(mesh(GEO.cyl, M('#8a5a32'), [s * 0.04, 0.12, 0], [0.014, 0.08, 0.014], [0, 0, -s * 0.8]));
      a.add(mesh(GEO.sph, M('#9a6a3e'), [0, 0.17, 0], 0.022));
    }
    triEar(R, R.head, -0.2, 0.3, -0.02, '#b87a46', '#f4d2b4', 0.12, 1.1); triEar(R, R.head, 0.2, 0.3, -0.02, '#b87a46', '#f4d2b4', 0.12, 1.1);
    const t = saveBase(grp(R.body, [0, 0.3, -0.24])); R.tail = t; t.add(mesh(GEO.sph, M('#fbf2e2'), [0, 0, -0.02], [0.05, 0.07, 0.04]));
    R.headTop = 1.02;
  },
  zebra(R) {
    plush(R, { fur: '#fafafa', belly: '#fafafa', muzzle: '#3a3638', nose: '#1e1b1c', headR: 0.27, limb: '#f4f2ee', bodyW: 0.27 });
    const M = R.M;
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) R.body.add(mesh(GEO.sph, M('#2a2628'), [s * 0.24, 0.27, -0.15 + i * 0.09], [0.035, 0.2 - Math.abs(i - 1.5) * 0.03, 0.035], [0, 0, s * 0.15])); // 身體條紋
    for (let i = 0; i < 3; i++) R.body.add(mesh(GEO.sph, M('#2a2628'), [0, 0.18 + i * 0.09, 0.225 - Math.abs(i - 1) * 0.01], [0.17 - Math.abs(i - 1) * 0.03, 0.022, 0.03])); // 胸前條紋
    for (let i = 0; i < 3; i++) R.body.add(mesh(GEO.sph, M('#2a2628'), [0, 0.47, -0.12 + i * 0.09], [0.12, 0.02, 0.025])); // 背上條紋
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) R.head.add(mesh(GEO.sph, M('#2a2628'), [s * 0.24, 0.24 + i * 0.08, -0.02], [0.03, 0.03, 0.13], [0, 0, s * 0.3])); // 臉頰條紋
    for (let i = 0; i < 6; i++) R.head.add(mesh(GEO.box, M('#2a2628'), [0, 0.46 - i * 0.02, -0.04 - i * 0.06], [0.04, 0.08, 0.05], [-0.3 - i * 0.15, 0, 0])); // 鬃毛
    triEar(R, R.head, -0.16, 0.38, 0, '#f4f2ee', '#2a2628', 0.12, 0.4); triEar(R, R.head, 0.16, 0.38, 0, '#f4f2ee', '#2a2628', 0.12, 0.4);
    const t = saveBase(grp(R.body, [0, 0.2, -0.24])); R.tail = t; t.add(mesh(GEO.cyl, M('#f4f2ee'), [0, -0.05, -0.03], [0.015, 0.12, 0.015], [-0.4, 0, 0])); t.add(mesh(GEO.sph, M('#2a2628'), [0, -0.12, -0.06], [0.035, 0.06, 0.035]));
    R.headTop = 1.0;
  },
  hippo(R) {
    plush(R, { fur: '#9a8aa8', belly: '#c8b4c8', headR: 0.32, bodyW: 0.31, bodyH: 0.29, limb: '#8a7a98', blush: true });
    const M = R.M;
    R.jaw = saveBase(grp(R.head, [0, 0.14, 0.14]));
    R.jaw.add(mesh(GEO.sph, M('#b4a2c0'), [0, -0.02, 0.1], [0.24, 0.1, 0.17]));
    R.jaw.add(mesh(GEO.sph, M('#e98a9a'), [0, 0.04, 0.12], [0.18, 0.04, 0.12]));
    for (const s of [-1, 1]) R.jaw.add(mesh(GEO.cone, M('#fbf6ea'), [s * 0.1, 0.07, 0.2], [0.025, 0.06, 0.025]));
    R.head.add(mesh(GEO.sph, M('#a898b4'), [0, 0.28, 0.24], [0.2, 0.12, 0.13]));
    for (const s of [-1, 1]) { R.head.add(mesh(GEO.sph, M('#5a4a68'), [s * 0.06, 0.32, 0.36], [0.02, 0.015, 0.01])); roundEar(R, R.head, s * 0.17, 0.48, -0.04, '#8a7a98', '#e8b0c0', 0.05); }
    R.headTop = 1.05;
  },
  parrot(R) {
    plush(R, { fur: '#3cb44a', belly: '#f2d24a', headR: 0.27, limb: '#3a3a3a', bodyW: 0.23, blush: false });
    const M = R.M;
    R.head.children[0].material = M('#e8423a');
    R.head.add(mesh(GEO.sph, M('#f4f1ea'), [0, 0.2, 0.18], [0.16, 0.13, 0.1]));
    R.beak = saveBase(grp(R.head, [0, 0.15, 0.25])); R.beak.add(mesh(GEO.sph, M('#3a3638'), [0, 0, 0.02], [0.07, 0.08, 0.07])); R.beak.add(mesh(GEO.cone, M('#3a3638'), [0, -0.05, 0.05], [0.04, 0.08, 0.03], [Math.PI * 0.8, 0, 0]));
    for (let i = 0; i < 3; i++) R.head.add(mesh(GEO.cone, M(['#f2d24a', '#e8423a', '#3a8ad8'][i]), [0, 0.42, -0.06 - i * 0.06], [0.03, 0.12, 0.03], [-0.5 - i * 0.3, 0, 0]));
    for (const a of [R.armL, R.armR]) { a.children[0].material = M('#3a8ad8'); a.children[0].scale.set(0.05, 0.16, 0.12); }
    R.wingL = R.armL; R.wingR = R.armR;
    const t = saveBase(grp(R.body, [0, 0.2, -0.2])); R.tail = t;
    ['#3a8ad8', '#e8423a', '#f2d24a'].forEach((c, i) => t.add(mesh(GEO.sph, M(c), [(i - 1) * 0.05, -0.05 - i * 0.02, -0.1 - i * 0.03], [0.04, 0.03, 0.16], [0.5, (i - 1) * 0.3, 0])));
    R.fly = 0.3; R.headTop = 0.98;
  },
  giraffe(R) {
    plush(R, { fur: '#f0c45a', belly: '#f8e6b0', muzzle: '#f8e6b0', nose: '#6a4a2a', headR: 0.25, limb: '#e0b04a' });
    const M = R.M;
    // 長脖子：頭往上抬高
    R.head.position.y += 0.35; saveBase(R.head);
    R.neck = R.body.add(mesh(GEO.cap, M('#f0c45a'), [0, 0.66, 0.02], [0.17, 0.38, 0.17]));
    for (let i = 0; i < 8; i++) { const a = i * 1.7; R.body.add(mesh(GEO.sph, M('#b06a2a'), [Math.cos(a) * 0.15, 0.25 + (i % 4) * 0.12, Math.sin(a) * 0.15 + 0.02], [0.06, 0.05, 0.03])); }
    for (let i = 0; i < 4; i++) R.body.add(mesh(GEO.sph, M('#b06a2a'), [(i % 2 ? 1 : -1) * 0.08, 0.55 + i * 0.09, 0.12], [0.04, 0.04, 0.02]));
    for (const s of [-1, 1]) { R.head.add(mesh(GEO.cyl, M('#e0b04a'), [s * 0.08, 0.45, -0.02], [0.02, 0.12, 0.02])); R.head.add(mesh(GEO.sph, M('#8a5a2a'), [s * 0.08, 0.52, -0.02], 0.035)); }
    triEar(R, R.head, -0.2, 0.32, -0.04, '#e0b04a', '#f8e6b0', 0.1, 1.2); triEar(R, R.head, 0.2, 0.32, -0.04, '#e0b04a', '#f8e6b0', 0.1, 1.2);
    R.headTop = 1.4;
  },
  flamingo(R) {
    const M = R.M;
    R.body = saveBase(grp(R.yaw));
    R.torso = saveBase(mesh(GEO.sph, M('#f49ab4'), [0, 0.42, -0.02], [0.24, 0.2, 0.28])); R.body.add(R.torso);
    for (const s of [-1, 1]) { const l = saveBase(grp(R.body, [s * 0.06, 0.3, 0])); l.add(mesh(GEO.cyl, M('#e8708e'), [0, -0.14, 0], [0.015, 0.3, 0.015])); l.add(mesh(GEO.sph, M('#e8708e'), [0, -0.28, 0.03], [0.04, 0.015, 0.06])); s < 0 ? (R.legL = l) : (R.legR = l); }
    R.legR.rotation.x = -1.2; saveBase(R.legR); // 單腳站
    R.body.add(mesh(GEO.cap, M('#f49ab4'), [0, 0.6, 0.12], [0.06, 0.3, 0.06], [0.3, 0, 0]));
    R.head = saveBase(grp(R.body, [0, 0.78, 0.17]));
    R.head.add(mesh(GEO.sph, M('#f7aac0'), [0, 0.06, 0], [0.13, 0.12, 0.13]));
    R.beak = saveBase(grp(R.head, [0, 0.03, 0.12])); R.beak.add(mesh(GEO.cone, M('#2e2a2c'), [0, -0.04, 0.04], [0.03, 0.12, 0.03], [Math.PI * 0.7, 0, 0])); R.beak.add(mesh(GEO.sph, M('#fbe6ea'), [0, 0, 0], [0.04, 0.035, 0.05]));
    addEyes(R, R.head, 0.09, 0.07, 0.1, 0.022);
    for (const s of [-1, 1]) { const w = saveBase(grp(R.body, [s * 0.2, 0.46, -0.02])); w.add(mesh(GEO.sph, M('#e8708e'), [s * 0.03, -0.04, -0.04], [0.06, 0.13, 0.2])); s < 0 ? (R.wingL = w) : (R.wingR = w); }
    R.armL = R.wingL; R.armR = R.wingR;
    const t = saveBase(grp(R.body, [0, 0.44, -0.28])); R.tail = t; t.add(mesh(GEO.cone, M('#e8708e'), [0, 0, -0.04], [0.06, 0.12, 0.04], [-Math.PI / 2, 0, 0]));
    R.headR = 0.13; R.headTop = 1.0;
  },
  shark(R) {
    const M = R.M;
    R.body = saveBase(grp(R.yaw));
    R.torso = saveBase(mesh(GEO.sph, M('#6c8aa8'), [0, 0.3, 0], [0.26, 0.24, 0.38])); R.body.add(R.torso);
    R.body.add(mesh(GEO.sph, M('#f2f2ee'), [0, 0.22, 0.06], [0.2, 0.15, 0.3]));
    R.body.add(mesh(GEO.cone, M('#5a7894'), [0, 0.6, -0.05], [0.09, 0.22, 0.05], [-0.3, 0, 0])); // 背鰭
    R.head = saveBase(grp(R.body, [0, 0.3, 0.26]));
    R.head.add(mesh(GEO.sph, M('#6c8aa8'), [0, 0.04, 0.02], [0.2, 0.17, 0.16]));
    R.jaw = saveBase(grp(R.head, [0, -0.05, 0.08])); R.jaw.add(mesh(GEO.sph, M('#f2f2ee'), [0, -0.02, 0.02], [0.15, 0.06, 0.1]));
    for (let i = 0; i < 5; i++) R.jaw.add(mesh(GEO.cone, M('#ffffff'), [(i - 2) * 0.05, 0.03, 0.09], [0.015, 0.035, 0.015]));
    addEyes(R, R.head, 0.1, 0.11, 0.12, 0.03, '#7ff0ff');
    for (const s of [-1, 1]) { const f = saveBase(grp(R.body, [s * 0.22, 0.22, 0.05], [0, 0, s * 0.6])); f.add(mesh(GEO.sph, M('#5a7894'), [s * 0.08, 0, 0], [0.12, 0.03, 0.08])); s < 0 ? (R.armL = f) : (R.armR = f); }
    for (const s of [-1, 1]) { const l = saveBase(grp(R.body, [s * 0.1, 0.1, -0.1])); l.add(mesh(GEO.sph, M('#5a7894'), [0, -0.04, 0], [0.05, 0.04, 0.07])); s < 0 ? (R.legL = l) : (R.legR = l); }
    const t = saveBase(grp(R.body, [0, 0.32, -0.36])); R.tail = t; t.add(mesh(GEO.cone, M('#5a7894'), [0, 0.1, -0.05], [0.06, 0.22, 0.03], [-0.6, 0, 0])); t.add(mesh(GEO.cone, M('#5a7894'), [0, -0.06, -0.05], [0.05, 0.15, 0.03], [-2.4, 0, 0]));
    R.headR = 0.2; R.headTop = 0.8;
  },
  panda(R) {
    plush(R, { fur: '#f6f4ef', belly: '#f6f4ef', limb: '#353032', muzzle: '#f6f4ef', nose: '#1e1b1c', headR: 0.32, bodyW: 0.3, bodyH: 0.3 });
    const M = R.M;
    for (const s of [-1, 1]) R.head.add(mesh(GEO.sph, M('#353032'), [s * 0.12, 0.27, 0.24], [0.08, 0.1, 0.05], [0, 0, s * 0.5]));
    roundEar(R, R.head, -0.22, 0.46, -0.02, '#353032', '#3a3638', 0.08); roundEar(R, R.head, 0.22, 0.46, -0.02, '#353032', '#3a3638', 0.08);
    R.body.add(mesh(GEO.sph, M('#353032'), [0, 0.42, -0.02], [0.3, 0.08, 0.27]));
    R.prop = saveBase(grp(R.armR, [0, -0.2, 0.05])); // 竹子
    R.prop.add(mesh(GEO.cyl, M('#7ab84a'), [0, 0.12, 0], [0.022, 0.42, 0.022])); for (let i = 0; i < 3; i++) R.prop.add(mesh(GEO.cyl, M('#5a983a'), [0, i * 0.13, 0], [0.026, 0.015, 0.026]));
    R.prop.add(mesh(GEO.sph, M('#9ad86a'), [0.05, 0.33, 0], [0.06, 0.02, 0.03], [0, 0, 0.6]));
    R.headTop = 1.08;
  },
});
function buildAnimal(key) {
  geos();
  const R = { key, M: Mats(), root: new THREE.Group(), fly: 0 };
  R.yaw = saveBase(grp(R.root));
  (BUILD[key] || BUILD.hare)(R);
  for (const k of ['armL', 'armR', 'legL', 'legR', 'head', 'body', 'tail', 'earL', 'earR', 'wingL', 'wingR', 'jaw', 'jawU', 'mane', 'spikes', 'torso', 'mouth', 'horn', 'beak', 'fan', 'blow']) if (R[k]) saveBase(R[k]);
  R.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.userData.unit = true; } });
  if (key === 'minibee') R.root.scale.setScalar(0.55);
  mergeRig(R);
  R.groups = []; R.root.traverse(o => { if (o.userData.b) R.groups.push(o); });
  return R;
}

// 同一個骨架節點底下的靜態網格合併成一個（頂點色），每隻約 10 次繪製
function mergeRig(R) {
  const keep = new Set([R.torso, R.mouth, R.prop, R.tongue].filter(Boolean));
  const vmat = charMat(new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: charGrad() }));
  vmat.userData.op = 1;
  const nodes = []; R.root.traverse(o => { if (!o.isMesh) nodes.push(o); });
  for (const n of nodes) {
    const list = n.children.filter(c => c.isMesh && !keep.has(c) && c.visible && c.material.isMeshToonMaterial && !c.material.transparent && c.material.side !== THREE.DoubleSide && c.material !== R.eyeMat);
    if (list.length < 2) continue;
    let cnt = 0; const gs = [];
    for (const c of list) { c.updateMatrix(); const g = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()); g.applyMatrix4(c.matrix); gs.push([g, c.material.color]); cnt += g.attributes.position.count; }
    const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3); let off = 0;
    for (const [g, c] of gs) { const k = g.attributes.position.count; pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); for (let i = 0; i < k; i++) { col[(off + i) * 3] = c.r; col[(off + i) * 3 + 1] = c.g; col[(off + i) * 3 + 2] = c.b; } off += k; g.dispose(); }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const c of list) n.remove(c);
    const mm = new THREE.Mesh(mg, vmat); mm.userData.unit = true; n.add(mm);
  }
  // 其餘同材質（眼睛、眼神光、腮紅）也合併
  for (const n of nodes) {
    const by = new Map();
    for (const c of n.children) if (c.isMesh && !keep.has(c) && c.material !== vmat && c.visible) { if (!by.has(c.material)) by.set(c.material, []); by.get(c.material).push(c); }
    for (const [m, list] of by) {
      if (list.length < 2) continue;
      let cnt = 0; const gs = [];
      for (const c of list) { c.updateMatrix(); const g = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()); g.applyMatrix4(c.matrix); gs.push(g); cnt += g.attributes.position.count; }
      const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3); let off = 0;
      for (const g of gs) { pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); off += g.attributes.position.count; g.dispose(); }
      const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      for (const c of list) n.remove(c);
      n.add(new THREE.Mesh(mg, m));
    }
  }
  R.mats = [vmat].concat(R.M.list);
  if (MODEL_CFG.OUTLINE) { // 身體、頭、手腳等不透明的部位加描邊（眼睛、腮紅、透明的不加）
    const om = outlineMat(), add = [];
    R.root.traverse(o => { if (o.isMesh && o.visible && o !== R.tongue && !o.userData.outline && !o.material.transparent && o.material.isMeshToonMaterial && o.material !== R.eyeMat) add.push(o); });
    for (const o of add) { const ol = new THREE.Mesh(o.geometry, om); ol.userData.outline = true; ol.userData.unit = true; ol.position.copy(o.position); ol.rotation.copy(o.rotation); ol.scale.copy(o.scale); ol.renderOrder = -1; o.parent.add(ol); if (o === R.torso || o === R.mouth) (R.olSync = R.olSync || []).push([o, ol]); }
    R.mats.push(om); R.olMat = om;
  }
}

// ===== 動作 =====
const ease = { out: p => 1 - (1 - p) * (1 - p), inOut: p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2, back: p => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2) };
const bell = (p, a, b) => p < a ? 0 : p > b ? 0 : Math.sin((p - a) / (b - a) * Math.PI);
const ramp = (p, a, b) => p <= a ? 0 : p >= b ? 1 : (p - a) / (b - a);
// 爪擊：手從左上舉起往右下揮（s = 1 右手，-1 左手）
function clawSwing(R, p, s, big) {
  const arm = s > 0 ? R.armR : R.armL; if (!arm) return;
  const up = ramp(p, 0, 0.4), down = ramp(p, 0.4, 0.62), back = ramp(p, 0.75, 1);
  const k = ease.out(up) * (1 - down), sw = ease.inOut(down) * (1 - back);
  arm.rotation.x += -2.6 * k + 1.1 * sw - 0.3 * (1 - back) * down;
  arm.rotation.z += s * (0.9 * k - 1.1 * sw) * (big ? 1.3 : 1);
  R.body.rotation.y += s * (0.35 * k - 0.5 * sw);
  R.body.position.z += 0.12 * sw;
}
function lunge(R, p, dist, at) { const f = bell(p, at || 0.25, 0.85); R.body.position.z += f * dist; R.body.rotation.x += f * 0.35; return f; }
function hopUp(R, p, h) { R.body.position.y += Math.sin(Math.min(1, p) * Math.PI) * h; }

// dur 秒；hit = 命中時間點（0..1）；fx = 特效種類（由場景播放）
const ACT = {
  hedgehog: {
    atk: { dur: 0.42, hit: 0.5, fx: 'bump', fn(R, p) { R.spikes.scale.setScalar(1 + bell(p, 0.2, 0.7) * 0.3); lunge(R, p, 0.32); } },
    skill: { dur: 1.5, hit: 0.35, fx: 'spikeBurst', fn(R, p) { const k = bell(p, 0, 1); R.head.scale.setScalar(1 - 0.8 * Math.min(1, k * 2)); R.spikes.scale.setScalar(1 + 0.45 * Math.min(1, k * 2)); R.body.rotation.x += ease.inOut(p) * Math.PI * 4; R.body.position.y += 0.08 * k; } },
  },
  squirrel: {
    atk: { dur: 0.5, hit: 0.55, fx: 'acorn', fn(R, p) { R.armR.rotation.x += -2.8 * bell(p, 0, 0.55) + 1.2 * bell(p, 0.45, 0.85); R.prop.visible = p < 0.48 || p > 0.9; R.tail.rotation.x += 0.4 * bell(p, 0.3, 0.8); R.body.rotation.x += 0.15 * bell(p, 0.4, 0.8); } },
    skill: { dur: 1.0, hit: 0.3, fx: 'acornVolley', fn(R, p) { for (let i = 0; i < 3; i++) { const a = i % 2 ? R.armL : R.armR; a.rotation.x += -2.6 * bell(p, i * 0.28, i * 0.28 + 0.3); } R.tail.rotation.x += 0.6 * Math.sin(p * 18) * bell(p, 0, 1); hopUp(R, p, 0.12); R.prop.visible = false; } },
  },
  wolf: {
    atk: { dur: 0.42, hit: 0.5, fx: 'bite', fn(R, p) { lunge(R, p, 0.4, 0.2); R.jaw.rotation.x += 0.7 * bell(p, 0.25, 0.5); R.head.rotation.x += 0.2 * bell(p, 0.3, 0.7); } },
    skill: { dur: 1.3, hit: 0.35, fx: 'howl', fn(R, p) { const k = bell(p, 0, 1); R.body.rotation.x -= 0.25 * k; R.head.rotation.x -= 0.9 * Math.min(1, k * 1.6); R.jaw.rotation.x += 0.6 * Math.min(1, k * 1.6); R.armL.rotation.x -= 0.5 * k; R.armR.rotation.x -= 0.5 * k; R.head.rotation.z += 0.08 * Math.sin(p * 30) * k; } },
  },
  frog: {
    atk: { dur: 0.45, hit: 0.45, fx: 'tongue', fn(R, p) { R.body.scale.y = 1 - 0.2 * bell(p, 0, 0.35); R.mouth.scale.y *= 1 + 1.5 * bell(p, 0.3, 0.8); } },
    skill: { dur: 0.9, hit: 0.45, fx: 'tongueGrab', fn(R, p) { R.body.scale.y = 1 - 0.3 * bell(p, 0, 0.3); hopUp(R, ramp(p, 0.25, 0.65), 0.35); R.legL.rotation.x += 1.2 * bell(p, 0.25, 0.6); R.legR.rotation.x += 1.2 * bell(p, 0.25, 0.6); R.mouth.scale.y *= 1 + 1.8 * bell(p, 0.35, 0.9); } },
  },
  bat: {
    atk: { dur: 0.45, hit: 0.5, fx: 'biteDrain', fn(R, p) { const f = bell(p, 0.1, 0.9); R.body.position.z += f * 0.45; R.body.position.y -= f * 0.25; R.body.rotation.x += f * 0.6; } },
    skill: { dur: 1.0, hit: 0.6, fx: 'bigBite', fn(R, p) { R.wingL.rotation.y += 1.2 * bell(p, 0, 0.55); R.wingR.rotation.y -= 1.2 * bell(p, 0, 0.55); R.body.rotation.y += ease.inOut(ramp(p, 0, 0.5)) * Math.PI * 2; const f = bell(p, 0.45, 1); R.body.position.z += f * 0.5; R.body.position.y -= f * 0.2; } },
  },
  redpanda: {
    atk: { dur: 0.45, hit: 0.55, fx: 'claw1', fn(R, p) { clawSwing(R, p, 1); } },
    skill: { dur: 1.3, hit: 0.3, fx: 'taunt', fn(R, p) { const k = Math.min(1, bell(p, 0, 1) * 2); R.body.position.y += 0.14 * k; R.body.scale.y *= 1 + 0.2 * k; R.armL.rotation.z -= 2.3 * k; R.armR.rotation.z += 2.3 * k; R.armL.rotation.x -= 0.5 * k; R.armR.rotation.x -= 0.5 * k; R.tail.rotation.x -= 0.6 * k; R.body.rotation.z += 0.06 * Math.sin(p * 25) * k; } },
  },
  skunk: {
    atk: { dur: 0.5, hit: 0.5, fx: 'stinkBall', fn(R, p) { R.tail.rotation.x += 1.0 * bell(p, 0.2, 0.7); R.body.rotation.y += 0.4 * bell(p, 0, 0.6); } },
    skill: { dur: 1.4, hit: 0.5, fx: 'gasSpray', fn(R, p) { const k = Math.min(1, bell(p, 0, 1) * 2.2); R.body.rotation.x += 1.9 * k; R.body.position.y += 0.22 * k; R.body.position.z -= 0.1 * k; R.armL.rotation.x -= 2.6 * k; R.armR.rotation.x -= 2.6 * k; R.tail.rotation.x += 0.5 * k + 0.15 * Math.sin(p * 30) * k; } },
  },
  croc: {
    atk: { dur: 0.45, hit: 0.55, fx: 'bite', fn(R, p) { R.jawU.rotation.x -= 0.9 * bell(p, 0, 0.55); R.jaw.rotation.x += 0.4 * bell(p, 0, 0.55); lunge(R, p, 0.3, 0.35); } },
    skill: { dur: 1.3, hit: 0.3, fx: 'deathRoll', fn(R, p) { R.jawU.rotation.x -= 0.8 * bell(p, 0, 0.25); const f = bell(p, 0.15, 1); R.body.position.z += f * 0.45; R.body.rotation.z += ease.inOut(ramp(p, 0.2, 0.9)) * Math.PI * 4; R.body.position.y += 0.15 * f; } },
  },
  bee: {
    atk: { dur: 0.4, hit: 0.5, fx: 'sting', fn(R, p) { const f = bell(p, 0.15, 0.9); R.body.position.z += f * 0.5; R.body.rotation.x += f * 0.9; } },
    skill: { dur: 1.2, hit: 0.55, fx: 'swarm', fn(R, p) { const k = bell(p, 0, 1); R.body.rotation.z += 0.5 * Math.sin(p * 40) * k; R.body.rotation.y += ease.inOut(p) * Math.PI * 2; R.body.position.x += 0.1 * Math.sin(p * 20) * k; } },
  },
  minibee: { atk: { dur: 0.35, hit: 0.5, fx: 'sting', fn(R, p) { const f = bell(p, 0.1, 0.9); R.body.position.z += f * 0.4; R.body.rotation.x += f * 0.9; } } },
  koala: {
    atk: { dur: 0.55, hit: 0.6, fx: 'slam', fn(R, p) { const up = bell(p, 0, 0.6), dn = bell(p, 0.5, 0.85); R.armL.rotation.x -= 2.8 * up - 0.6 * dn; R.armR.rotation.x -= 2.8 * up - 0.6 * dn; R.body.rotation.x += 0.4 * dn - 0.15 * up; R.body.position.z += 0.12 * dn; } },
    skill: { dur: 1.1, hit: 0.62, fx: 'bodySlam', fn(R, p) { R.body.scale.y *= 1 - 0.25 * bell(p, 0, 0.25); hopUp(R, ramp(p, 0.2, 0.62), 0.6); R.body.position.z += 0.3 * ramp(p, 0.2, 0.62) * (1 - ramp(p, 0.8, 1)); R.body.rotation.x += 0.5 * bell(p, 0.4, 0.8); R.armL.rotation.z -= 1.4 * bell(p, 0.2, 0.7); R.armR.rotation.z += 1.4 * bell(p, 0.2, 0.7); R.body.scale.y *= 1 - 0.3 * bell(p, 0.6, 0.8); } },
    wake: { dur: 1.0, hit: 0.3, fx: 'wake', fn(R, p) { hopUp(R, ramp(p, 0, 0.4), 0.35); R.armL.rotation.z -= 1.8 * bell(p, 0.2, 1); R.armR.rotation.z += 1.8 * bell(p, 0.2, 1); R.body.rotation.z += 0.1 * Math.sin(p * 40) * bell(p, 0.3, 1); } },
  },
  cheetah: {
    atk: { dur: 0.32, hit: 0.58, fx: 'claw3', fn(R, p) { clawSwing(R, p, -1); } },
    skill: { dur: 0.9, hit: 0.5, fx: 'crossSlash', fn(R, p) { R.body.rotation.x += 0.6 * bell(p, 0, 0.4); hopUp(R, ramp(p, 0.3, 0.7), 0.4); clawSwing(R, ramp(p, 0.3, 0.75), -1, true); clawSwing(R, ramp(p, 0.4, 0.85), 1, true); } },
  },
  octopus: {
    atk: { dur: 0.5, hit: 0.5, fx: 'inkBall', fn(R, p) { R.head.scale.setScalar(1 + 0.12 * bell(p, 0, 0.45) - 0.08 * bell(p, 0.45, 0.7)); R.head.rotation.x += 0.25 * bell(p, 0.4, 0.8); } },
    skill: { dur: 1.2, hit: 0.55, fx: 'inkCloud', fn(R, p) { const inf = bell(p, 0, 0.6); R.head.scale.setScalar(1 + 0.35 * inf - 0.15 * bell(p, 0.55, 0.8)); R.body.position.y += 0.15 * inf; for (const t of R.tents) t[0].rotation.x -= 1.0 * inf; } },
  },
  owl: {
    atk: { dur: 0.5, hit: 0.5, fx: 'feather', fn(R, p) { R.wingR.rotation.z += 1.4 * bell(p, 0, 0.5); R.wingR.rotation.x -= 0.8 * bell(p, 0.3, 0.7); R.head.rotation.z += 0.2 * bell(p, 0.2, 0.6); } },
    skill: { dur: 1.3, hit: 0.55, fx: 'swoop', fn(R, p) { const f = bell(p, 0.1, 1); R.body.position.y += 0.7 * f; R.body.position.z += 0.9 * bell(p, 0.25, 0.95); R.wingL.rotation.z -= 1.6 * Math.abs(Math.sin(p * 14)) * f; R.wingR.rotation.z += 1.6 * Math.abs(Math.sin(p * 14)) * f; R.body.rotation.x += 0.7 * bell(p, 0.4, 0.7); R.legL.rotation.x -= 1.2 * bell(p, 0.45, 0.65); R.legR.rotation.x -= 1.2 * bell(p, 0.45, 0.65); } },
  },
  elephant: {
    atk: { dur: 0.6, hit: 0.6, fx: 'trunkSlap', fn(R, p) { const up = bell(p, 0, 0.55), sw = bell(p, 0.45, 0.85); R.trunk.forEach((t, i) => { t.rotation.x += -0.35 * up + 0.25 * sw; t.rotation.z += 0.25 * sw * (i ? 1 : 0); }); R.head.rotation.x += 0.2 * sw - 0.15 * up; } },
    skill: { dur: 1.4, hit: 0.62, fx: 'stomp', fn(R, p) { const rear = bell(p, 0, 0.62); R.body.rotation.x -= 0.6 * rear; R.body.position.y += 0.2 * rear; R.armL.rotation.x -= 1.6 * rear; R.armR.rotation.x -= 1.6 * rear; R.trunk.forEach(t => t.rotation.x -= 0.4 * rear); R.earL.rotation.y -= 0.6 * rear; R.earR.rotation.y += 0.6 * rear; R.body.scale.y *= 1 - 0.15 * bell(p, 0.6, 0.75); } },
  },
  lion: {
    atk: { dur: 0.48, hit: 0.58, fx: 'claw3big', fn(R, p) { clawSwing(R, p, 1, true); } },
    skill: { dur: 1.3, hit: 0.4, fx: 'roar', fn(R, p) { const pre = bell(p, 0, 0.4), ro = Math.min(1, bell(p, 0.3, 1) * 1.6); R.head.rotation.x -= 0.4 * pre - 0.15 * ro; R.body.position.z += 0.15 * ro; R.jaw.rotation.x += 0.8 * ro; R.mane.scale.setScalar(1 + 0.3 * ro); R.head.rotation.z += 0.05 * Math.sin(p * 50) * ro; R.armL.rotation.x -= 0.6 * ro; R.armR.rotation.x -= 0.6 * ro; } },
  },
  hare: { atk: { dur: 0.45, hit: 0.55, fx: 'kick', fn(R, p) { hopUp(R, p, 0.25); R.legL.rotation.x -= 1.5 * bell(p, 0.35, 0.8); R.legR.rotation.x -= 1.5 * bell(p, 0.35, 0.8); R.body.position.z += 0.25 * bell(p, 0.2, 0.9); } } },
  boar: { atk: { dur: 0.5, hit: 0.6, fx: 'bump', fn(R, p) { R.body.position.z -= 0.12 * bell(p, 0, 0.45); lunge(R, p, 0.45, 0.4); R.head.rotation.x += 0.4 * bell(p, 0.45, 0.85); } } },
  kingboar: { atk: { dur: 0.55, hit: 0.6, fx: 'headbutt', fn(R, p) { R.body.position.z -= 0.15 * bell(p, 0, 0.45); lunge(R, p, 0.5, 0.45); R.head.rotation.x += 0.5 * bell(p, 0.45, 0.85); } }, skill: { dur: 1.1, hit: 0.55, fx: 'stomp', fn(R, p) { const up = bell(p, 0, 0.55); R.body.rotation.x -= 0.6 * up; R.body.position.y += 0.35 * up; R.head.rotation.x -= 0.4 * up; } } },
};

// ---- v0.5 新動物動作 ----
Object.assign(ACT, {
  penguin: {
    atk: { dur: 0.42, hit: 0.55, fx: 'flipper', fn(R, p) { clawSwing(R, p, 1); R.body.rotation.z += 0.12 * bell(p, 0.3, 0.8); } },
    skill: { dur: 0.9, hit: 0.55, fx: 'slideHit', fn(R, p) { const k = bell(p, 0, 1), lay = Math.min(1, k * 2.2); R.body.rotation.x += 1.35 * lay; R.body.position.y += 0.05 * lay - 0.02; R.armL.rotation.z -= 1.2 * lay; R.armR.rotation.z += 1.2 * lay; R.body.position.z += 0.35 * bell(p, 0.3, 0.8); R.body.rotation.z += 0.12 * Math.sin(p * 30) * lay; } },
  },
  rhino: {
    atk: { dur: 0.5, hit: 0.58, fx: 'headbutt', fn(R, p) { R.body.position.z -= 0.1 * bell(p, 0, 0.4); lunge(R, p, 0.42, 0.38); R.head.rotation.x += 0.5 * bell(p, 0.35, 0.8); R.horn.rotation.x -= 0.2 * bell(p, 0.4, 0.7); } },
    skill: { dur: 0.95, hit: 0.5, fx: 'rhinoCharge', fn(R, p) { const pre = bell(p, 0, 0.35), run = bell(p, 0.25, 0.85); R.body.rotation.x += 0.35 * run - 0.15 * pre; R.head.rotation.x += 0.45 * run; R.legL.rotation.x += 1.0 * Math.sin(p * 40) * run; R.legR.rotation.x -= 1.0 * Math.sin(p * 40) * run; R.body.position.z += 0.5 * bell(p, 0.35, 0.75); R.body.position.y += 0.06 * Math.abs(Math.sin(p * 40)) * run; } },
  },
  chameleon: {
    atk: { dur: 0.45, hit: 0.5, fx: 'tongue', fn(R, p) { R.head.position.z += 0.05 * bell(p, 0.2, 0.7); R.body.rotation.x += 0.15 * bell(p, 0.1, 0.6); R.tail.rotation.x += 0.4 * bell(p, 0, 0.8); } },
    skill: { dur: 1.0, hit: 0.55, fx: 'chamStrike', fn(R, p) { R.body.scale.y *= 1 - 0.18 * bell(p, 0, 0.4); R.head.rotation.x -= 0.25 * bell(p, 0.2, 0.5); R.head.position.z += 0.08 * bell(p, 0.45, 0.8); R.tail.rotation.x += 0.8 * bell(p, 0, 1); } },
  },
  fox: {
    atk: { dur: 0.38, hit: 0.55, fx: 'bite', fn(R, p) { lunge(R, p, 0.38, 0.22); R.jaw.rotation.x += 0.6 * bell(p, 0.3, 0.6); R.tail.rotation.x += 0.3 * bell(p, 0.2, 0.8); } },
    skill: { dur: 1.0, hit: 0.72, fx: 'pounce', fn(R, p) { R.body.scale.y *= 1 - 0.25 * bell(p, 0, 0.25); const air = ramp(p, 0.18, 0.75); hopUp(R, air, 0.9); R.body.rotation.x += -0.6 * bell(p, 0.18, 0.45) + 1.4 * bell(p, 0.5, 0.82); R.armL.rotation.x -= 2.0 * bell(p, 0.45, 0.8); R.armR.rotation.x -= 2.0 * bell(p, 0.45, 0.8); R.tail.rotation.x -= 0.8 * bell(p, 0.2, 0.8); } },
  },
  eagle: {
    atk: { dur: 0.5, hit: 0.55, fx: 'talonShot', fn(R, p) { const f = bell(p, 0, 0.6); R.wingL.rotation.z -= 1.4 * f; R.wingR.rotation.z += 1.4 * f; R.body.position.y += 0.12 * f; R.head.rotation.x += 0.35 * bell(p, 0.4, 0.8); R.beak.rotation.x += 0.3 * bell(p, 0.4, 0.7); } },
    skill: { dur: 1.5, hit: 0.3, fx: 'grabLift', fn(R, p) { const up = bell(p, 0, 1); R.body.position.y += 1.2 * Math.min(1, up * 1.4); R.body.position.z += 0.4 * bell(p, 0.1, 0.5); const fl = Math.abs(Math.sin(p * 26)); R.wingL.rotation.z -= (0.6 + 1.2 * fl) * up; R.wingR.rotation.z += (0.6 + 1.2 * fl) * up; R.legL.rotation.x -= 1.0 * up; R.legR.rotation.x -= 1.0 * up; R.body.rotation.x += 0.5 * bell(p, 0.75, 1); } },
  },
  eel: {
    atk: { dur: 0.5, hit: 0.55, fx: 'zap', fn(R, p) { const k = bell(p, 0, 0.7); R.segs.forEach((s, i) => { s.rotation.x += (i % 2 ? -0.2 : 0.25) * k; s.rotation.z += 0.15 * Math.sin(p * 40 + i) * k; }); R.head.rotation.x += 0.3 * bell(p, 0.4, 0.8); } },
    skill: { dur: 1.1, hit: 0.5, fx: 'chainZap', fn(R, p) { const k = bell(p, 0, 1); R.segs.forEach((s, i) => { s.rotation.z += 0.35 * Math.sin(p * 55 + i * 1.3) * k; s.rotation.x -= 0.12 * k; }); R.head.scale.setScalar(1 + 0.15 * bell(p, 0.35, 0.6)); R.earL.rotation.z += 0.6 * k; R.earR.rotation.z -= 0.6 * k; } },
  },
  gorilla: {
    atk: { dur: 0.6, hit: 0.62, fx: 'fistSlam', fn(R, p) { const up = bell(p, 0, 0.6), dn = bell(p, 0.5, 0.85); R.armL.rotation.x -= 2.9 * up - 0.7 * dn; R.armR.rotation.x -= 2.9 * up - 0.7 * dn; R.body.rotation.x += 0.45 * dn - 0.2 * up; R.body.position.z += 0.15 * dn; R.body.position.y += 0.08 * up; } },
    skill: { dur: 1.5, hit: 0.75, fx: 'chestBeat', fn(R, p) { const beat = bell(p, 0, 0.62); R.body.rotation.x -= 0.25 * beat; R.armL.rotation.x -= (1.4 + 0.5 * Math.sin(p * 40)) * beat; R.armR.rotation.x -= (1.4 - 0.5 * Math.sin(p * 40)) * beat; R.armL.rotation.z += 0.6 * beat; R.armR.rotation.z -= 0.6 * beat; R.head.rotation.x -= 0.4 * beat; const sl = bell(p, 0.6, 0.95); R.armL.rotation.x -= 2.6 * bell(p, 0.55, 0.72) - 0.6 * sl; R.armR.rotation.x -= 2.6 * bell(p, 0.55, 0.72) - 0.6 * sl; R.body.rotation.x += 0.5 * sl; R.body.scale.y *= 1 - 0.12 * bell(p, 0.72, 0.85); } },
  },
  whale: {
    atk: { dur: 0.6, hit: 0.55, fx: 'spout', fn(R, p) { R.body.rotation.x -= 0.18 * bell(p, 0, 0.5); R.body.scale.y *= 1 + 0.08 * bell(p, 0.3, 0.6); R.tail.rotation.x += 0.4 * bell(p, 0, 0.7); } },
    skill: { dur: 1.5, hit: 0.55, fx: 'tidal', fn(R, p) { const rear = bell(p, 0, 0.6); R.body.rotation.x -= 0.55 * rear; R.body.position.y += 0.35 * rear; R.armL.rotation.z -= 0.8 * rear; R.armR.rotation.z += 0.8 * rear; R.tail.rotation.x += 0.9 * bell(p, 0.1, 0.7); R.body.scale.y *= 1 - 0.15 * bell(p, 0.55, 0.7); } },
  },
  peacock: {
    atk: { dur: 0.5, hit: 0.55, fx: 'feather', fn(R, p) { R.fan.scale.y *= 1 + 0.3 * bell(p, 0, 0.6); R.body.rotation.y += 0.5 * bell(p, 0, 0.5) - 0.3 * bell(p, 0.45, 0.8); R.head.rotation.x += 0.2 * bell(p, 0.4, 0.8); } },
    skill: { dur: 1.6, hit: 0.45, fx: 'fanOpen', fn(R, p) { const o = Math.min(1, bell(p, 0, 1) * 1.8); R.fan.scale.setScalar(1 + 0.8 * o); R.fan.rotation.x -= 0.5 * o; R.fan.position.y += 0.15 * o; R.fan.rotation.z += 0.06 * Math.sin(p * 40) * o; R.body.position.y += 0.06 * o; R.head.rotation.x -= 0.2 * o; } },
  },
  komodo: {
    atk: { dur: 0.48, hit: 0.58, fx: 'bite', fn(R, p) { R.jawU.rotation.x -= 0.7 * bell(p, 0, 0.55); R.jaw.rotation.x += 0.35 * bell(p, 0, 0.55); lunge(R, p, 0.32, 0.35); R.tail.rotation.y += 0.4 * bell(p, 0.2, 0.9); } },
    skill: { dur: 1.1, hit: 0.5, fx: 'venomBite', fn(R, p) { R.jawU.rotation.x -= 1.0 * bell(p, 0, 0.5); R.jaw.rotation.x += 0.5 * bell(p, 0, 0.5); R.body.position.z -= 0.12 * bell(p, 0, 0.35); lunge(R, p, 0.5, 0.35); R.body.rotation.y += 0.4 * Math.sin(p * 30) * bell(p, 0.5, 0.9); R.tail.rotation.y += 0.6 * Math.sin(p * 20) * bell(p, 0.3, 1); } },
  },
});
// 每幀姿勢：st = {t 秒, moving, sleep, stun, act:{kind,p}, dead:p, hit:p, night, face}
// v0.13 新動物的動作
Object.assign(ACT, {
  deer: {
    atk: { dur: 0.45, hit: 0.5, fx: 'leafShot', fn(R, p) { R.head.rotation.x += 0.45 * bell(p, 0.1, 0.6); R.armR.rotation.x -= 1.2 * bell(p, 0, 0.5); } },
    skill: { dur: 1.1, hit: 0.5, fx: 'blessing', fn(R, p) { hopUp(R, ramp(p, 0.1, 0.6), 0.3); R.head.rotation.x -= 0.6 * bell(p, 0, 1); R.armL.rotation.z -= 1.5 * bell(p, 0.1, 0.9); R.armR.rotation.z += 1.5 * bell(p, 0.1, 0.9); } },
  },
  zebra: {
    atk: { dur: 0.42, hit: 0.5, fx: 'bite', fn(R, p) { lunge(R, p, 0.35, 0.2); R.head.rotation.x += 0.3 * bell(p, 0.2, 0.6); } },
    skill: { dur: 0.9, hit: 0.5, fx: 'backKick', fn(R, p) { const k = bell(p, 0.2, 0.8); R.body.rotation.x += 0.9 * k; R.legL.rotation.x -= 1.6 * k; R.legR.rotation.x -= 1.6 * k; R.body.position.y += 0.15 * k; } },
  },
  hippo: {
    atk: { dur: 0.5, hit: 0.55, fx: 'bite', fn(R, p) { R.jaw.rotation.x += 0.9 * bell(p, 0, 0.55); lunge(R, p, 0.25, 0.35); } },
    skill: { dur: 1.2, hit: 0.55, fx: 'hippoGulp', fn(R, p) { const o = bell(p, 0, 0.6); R.jaw.rotation.x += 1.3 * o; R.head.rotation.x -= 0.5 * o; R.body.scale.y *= 1 + 0.12 * o; lunge(R, ramp(p, 0.45, 1), 0.35); } },
  },
  parrot: {
    atk: { dur: 0.45, hit: 0.5, fx: 'feather', fn(R, p) { R.wingR.rotation.z += 1.4 * bell(p, 0, 0.5); R.head.rotation.x += 0.3 * bell(p, 0.3, 0.7); } },
    skill: { dur: 1.0, hit: 0.5, fx: 'featherVolley', fn(R, p) { const f = Math.abs(Math.sin(p * 24)); R.wingL.rotation.z -= 1.3 * f; R.wingR.rotation.z += 1.3 * f; R.head.rotation.x -= 0.5 * bell(p, 0.3, 0.6); R.beak.scale.y = 1 + 0.6 * bell(p, 0.35, 0.6); } },
  },
  giraffe: {
    atk: { dur: 0.55, hit: 0.55, fx: 'headbutt', fn(R, p) { R.head.rotation.x += 0.9 * bell(p, 0.1, 0.7); R.head.position.z += 0.25 * bell(p, 0.2, 0.7); } },
    skill: { dur: 1.2, hit: 0.5, fx: 'neckSwing', fn(R, p) { const k = bell(p, 0, 1); R.body.rotation.y += Math.sin(ramp(p, 0.1, 0.8) * Math.PI * 2) * 1.4 * k; R.head.rotation.z += 0.8 * Math.sin(p * 12) * k; } },
  },
  flamingo: {
    atk: { dur: 0.5, hit: 0.55, fx: 'waterShot', fn(R, p) { R.head.position.z += 0.15 * bell(p, 0.1, 0.7); R.head.rotation.x += 0.6 * bell(p, 0.1, 0.7); R.wingR.rotation.z += 0.8 * bell(p, 0, 0.6); } },
    skill: { dur: 1.3, hit: 0.45, fx: 'swirlDance', fn(R, p) { R.body.rotation.y += ease.inOut(ramp(p, 0, 0.9)) * Math.PI * 4; const f = bell(p, 0, 1); R.wingL.rotation.z -= 1.4 * f; R.wingR.rotation.z += 1.4 * f; } },
  },
  shark: {
    atk: { dur: 0.42, hit: 0.5, fx: 'bite', fn(R, p) { R.jaw.rotation.x += 0.8 * bell(p, 0, 0.5); lunge(R, p, 0.4, 0.25); } },
    skill: { dur: 1.1, hit: 0.6, fx: 'sharkBite', fn(R, p) { R.jaw.rotation.x += 1.2 * bell(p, 0.35, 0.75); R.tail.rotation.y += 0.8 * Math.sin(p * 30) * bell(p, 0, 1); } },
  },
  panda: {
    atk: { dur: 0.55, hit: 0.6, fx: 'slam', fn(R, p) { const up = bell(p, 0, 0.6); R.armR.rotation.x -= 2.6 * up; R.body.rotation.x += 0.3 * bell(p, 0.5, 0.85); } },
    skill: { dur: 1.3, hit: 0.5, fx: 'pandaRoll', fn(R, p) { const k = bell(p, 0, 1); R.head.scale.setScalar(1 - 0.3 * Math.min(1, k * 2)); R.body.rotation.x += ease.inOut(ramp(p, 0.05, 0.85)) * Math.PI * 4; R.body.position.y += 0.25 * k; } },
  },
});

// ===== v0.14 普通攻擊重做：每隻用自己的身體部位（手揮、腳踢、肚子頂、頭撞、屁股推、尾巴甩…）=====
// 階段：蓄力（0～0.42）→ 出手（0.42～0.56，命中點 0.5）→ 停住 → 收回（0.7～1）
const ATKP = p => { const w = ease.out(ramp(p, 0, 0.42)), s = ease.out(ramp(p, 0.42, 0.56)), r = ease.inOut(ramp(p, 0.7, 1)); return { w: w * (1 - s), s: s * (1 - r), r }; };
const turnBack = p => ease.inOut(ramp(p, 0, 0.36)) * (1 - ease.inOut(ramp(p, 0.72, 1))); // 轉身用背後攻擊時的轉身量
const ATK_V2 = {
  hedgehog: { dur: 0.55, desc: '縮成刺球滾過去撞', fx: 'bump', fn(R, p) { const k = ATKP(p); R.body.scale.y *= 1 - 0.22 * k.w; R.head.scale.setScalar(1 - 0.55 * Math.min(1, k.w * 1.5 + k.s)); if (R.spikes) R.spikes.scale.setScalar(1 + 0.35 * (k.w + k.s)); R.body.rotation.x += Math.PI * 2 * ease.inOut(ramp(p, 0.3, 0.62)); R.body.position.z += 0.5 * k.s; R.body.position.y += 0.12 * Math.sin(ramp(p, 0.3, 0.62) * Math.PI); } },
  wolf: { dur: 0.5, desc: '壓低身子撲上去咬', fx: 'bite', fn(R, p) { const k = ATKP(p); R.body.position.y -= 0.08 * k.w; R.body.rotation.x -= 0.25 * k.w; R.body.position.z += 0.55 * k.s; R.body.position.y += 0.16 * k.s; R.body.rotation.x += 0.4 * k.s; if (R.jaw) R.jaw.rotation.x += 0.9 * bell(p, 0.3, 0.6); if (R.legL) { R.legL.rotation.x -= 0.9 * k.s; R.legR.rotation.x -= 0.9 * k.s; } if (R.armL) { R.armL.rotation.x -= 1.4 * k.s; R.armR.rotation.x -= 1.4 * k.s; } } },
  redpanda: { dur: 0.55, desc: '站起來雙手往下揮', fx: 'claw3', fn(R, p) { const k = ATKP(p); R.body.position.y += 0.16 * k.w; R.body.scale.y *= 1 + 0.15 * k.w; for (const s of [-1, 1]) { const a = s < 0 ? R.armL : R.armR; a.rotation.x += -2.9 * k.w + 0.9 * k.s; a.rotation.z += s * (0.7 * k.w - 0.2 * k.s); } R.body.position.z += 0.35 * k.s; R.body.rotation.x += 0.35 * k.s; } },
  skunk: { dur: 0.6, desc: '轉身翹起屁股放臭氣彈', fx: 'stinkBall', fn(R, p) { const k = ATKP(p), t = turnBack(p); R.body.rotation.y += Math.PI * t; R.tail.rotation.x += 1.1 * (k.w + k.s); R.body.rotation.x += 0.35 * k.s; R.body.position.z += 0.18 * k.s; R.body.position.y += 0.05 * k.w; } },
  croc: { dur: 0.6, desc: '原地轉一圈用尾巴甩', fx: 'bump', fn(R, p) { const k = ATKP(p); R.body.rotation.y += Math.PI * 2 * ease.inOut(ramp(p, 0.15, 0.62)); if (R.tail) R.tail.rotation.y += 0.9 * Math.sin(ramp(p, 0.15, 0.62) * Math.PI); R.body.position.z += 0.2 * k.s; if (R.jawU) R.jawU.rotation.x -= 0.5 * k.s; } },
  bee: { dur: 0.5, desc: '轉身用屁股的針刺', fx: 'sting', fn(R, p) { const k = ATKP(p), t = turnBack(p); R.body.rotation.y += Math.PI * t; R.body.position.z += 0.5 * k.s; R.body.rotation.x -= 0.6 * k.s; R.body.position.y += 0.1 * k.w; } },
  cheetah: { dur: 0.45, desc: '左右爪快速連抓', fx: 'claw3', fn(R, p) { clawSwing(R, ramp(p, 0, 0.55), -1); clawSwing(R, ramp(p, 0.3, 0.85), 1); R.body.position.z += 0.3 * bell(p, 0.2, 0.9); } },
  elephant: { dur: 0.65, desc: '鼻子捲起來再甩下去', fx: 'trunkSlap', fn(R, p) { const k = ATKP(p); (R.trunk || []).forEach((g, i) => { g.rotation.x += -0.55 * k.w * (1 + i * 0.1) + 0.45 * k.s; }); R.body.rotation.x -= 0.2 * k.w; R.body.position.y += 0.06 * k.w; R.body.rotation.x += 0.15 * k.s; R.body.position.z += 0.2 * k.s; if (R.earL) { R.earL.rotation.y -= 0.5 * k.w; R.earR.rotation.y += 0.5 * k.w; } } },
  lion: { dur: 0.6, desc: '人立起來一掌重拍', fx: 'claw3big', fn(R, p) { const k = ATKP(p); R.body.rotation.x -= 0.5 * k.w; R.body.position.y += 0.16 * k.w; R.armR.rotation.x += -3.0 * k.w + 1.1 * k.s; R.armL.rotation.x += -1.2 * k.w; R.body.rotation.x += 0.45 * k.s; R.body.position.z += 0.45 * k.s; if (R.jaw) R.jaw.rotation.x += 0.6 * k.w; if (R.mane) R.mane.scale.setScalar(1 + 0.12 * k.s); } },
  penguin: { dur: 0.55, desc: '挺起肚子往前頂', fx: 'bump', fn(R, p) { const k = ATKP(p); R.body.rotation.x -= 0.45 * k.w; R.body.position.z -= 0.08 * k.w; R.armL.rotation.z -= 1.2 * (k.w + k.s); R.armR.rotation.z += 1.2 * (k.w + k.s); R.body.position.z += 0.55 * k.s; R.body.rotation.x -= 0.2 * k.s; R.body.scale.z *= 1 + 0.2 * k.s; } },
  rhino: { dur: 0.6, desc: '低頭刨地，用角撞上去', fx: 'headbutt', fn(R, p) { const k = ATKP(p); R.head.rotation.x += 0.55 * k.w; if (R.armR) R.armR.rotation.x -= 0.7 * Math.abs(Math.sin(p * 30)) * k.w; R.body.position.z += 0.65 * k.s; R.head.rotation.x -= 0.45 * k.s; R.body.position.y += 0.05 * k.s; } },
  fox: { dur: 0.55, desc: '轉一圈用大尾巴甩', fx: 'claw1', fn(R, p) { const k = ATKP(p); R.body.rotation.y += Math.PI * 2 * ease.inOut(ramp(p, 0.2, 0.62)); if (R.tail) { R.tail.rotation.x -= 0.6 * (k.w + k.s); R.tail.scale.setScalar(1 + 0.25 * k.s); } R.body.position.y += 0.12 * Math.sin(ramp(p, 0.2, 0.62) * Math.PI); R.body.position.z += 0.25 * k.s; } },
  whale: { dur: 0.65, desc: '身體往前倒，尾巴從上面拍下來', fx: 'spout', fn(R, p) { const k = ATKP(p); R.body.rotation.x -= 0.35 * k.w; R.body.rotation.x += 0.7 * k.s; R.body.position.z += 0.25 * k.s; if (R.tail) R.tail.rotation.x -= 1.4 * k.w - 0.6 * k.s; } },
  komodo: { dur: 0.55, desc: '身體一扭，尾巴掃過去再咬', fx: 'bite', fn(R, p) { const k = ATKP(p); R.body.rotation.y += -0.9 * k.w + 0.7 * k.s; if (R.tail) R.tail.rotation.y += 1.0 * k.w - 0.8 * k.s; R.body.position.z += 0.4 * k.s; if (R.jaw) R.jaw.rotation.x += 0.7 * k.s; } },
  deer: { dur: 0.5, desc: '低頭用鹿角一挑', fx: 'leafShot', fn(R, p) { const k = ATKP(p); R.head.rotation.x += 0.8 * k.w - 0.7 * k.s; R.body.rotation.x += 0.2 * k.w - 0.15 * k.s; R.body.position.z += 0.15 * k.s; R.body.position.y += 0.1 * k.s; } },
  zebra: { dur: 0.6, desc: '轉身用後腳踢', fx: 'kick', fn(R, p) { const k = ATKP(p), t = turnBack(p); R.body.rotation.y += Math.PI * t; R.body.rotation.x += -0.2 * k.w + 0.7 * k.s; R.legL.rotation.x -= 1.8 * k.s; R.legR.rotation.x -= 1.8 * k.s; R.armL.rotation.x += 0.4 * k.s; R.armR.rotation.x += 0.4 * k.s; R.body.position.y += 0.1 * k.s; } },
  hippo: { dur: 0.6, desc: '張大嘴挺著肚子撞', fx: 'bite', fn(R, p) { const k = ATKP(p); R.body.rotation.x -= 0.3 * k.w; if (R.jaw) R.jaw.rotation.x += 1.0 * (k.w + k.s * 0.5); R.body.position.z += 0.5 * k.s; R.body.scale.setScalar(1 + 0.08 * k.s); } },
  giraffe: { dur: 0.6, desc: '長脖子往後仰，再用頭槌', fx: 'headbutt', fn(R, p) { const k = ATKP(p); R.head.rotation.x -= 0.6 * k.w; R.head.position.z -= 0.1 * k.w; R.head.rotation.x += 1.0 * k.s; R.head.position.z += 0.28 * k.s; R.body.rotation.x += 0.15 * k.s; } },
  flamingo: { dur: 0.55, desc: '單腳站，另一腳往前踢', fx: 'waterShot', fn(R, p) { const k = ATKP(p); R.legL.rotation.x += 0.6 * k.w - 1.8 * k.s; R.wingL.rotation.z -= 1.0 * (k.w + k.s); R.wingR.rotation.z += 1.0 * (k.w + k.s); R.body.rotation.x -= 0.2 * k.s; } },
  shark: { dur: 0.5, desc: '甩尾衝上去大口咬', fx: 'bite', fn(R, p) { const k = ATKP(p); R.tail.rotation.y += 0.9 * Math.sin(p * 30) * (k.w + k.s); R.jaw.rotation.x += 1.0 * k.w; R.body.position.z += 0.55 * k.s; R.jaw.rotation.x -= 0.6 * k.s; } },
  panda: { dur: 0.6, desc: '舉起竹子當棍子打', fx: 'slam', fn(R, p) { const k = ATKP(p); R.armR.rotation.x += -3.0 * k.w + 1.3 * k.s; R.armR.rotation.z += 0.3 * k.w; R.body.rotation.y += 0.3 * k.w - 0.3 * k.s; R.body.rotation.x += 0.3 * k.s; R.body.position.z += 0.3 * k.s; } },
};
for (const k in ATK_V2) { const A = ATK_V2[k]; if (!ACT[k]) continue; ACT[k].atk = { dur: A.dur, hit: 0.5, fx: A.fx, fn: A.fn, desc: A.desc }; }

// ===== v0.13.14～ 技能動作重做：用身體本身做出技能（特效沿用原本的 fx）=====
// 可調：dur 動作秒數、hit 特效出現的時間點（0～1）；整隻跳起來的高度在 units3d.js 的 AIR_CFG
const SKILL_V2 = {
  penguin: { dur: 1.1, hit: 0.45, desc: '跳起來肚皮貼地往前滑，滑完彈起來', fn(R, p) {
    const crouch = bell(p, 0, 0.18), lay = ease.out(ramp(p, 0.12, 0.3)) * (1 - ease.inOut(ramp(p, 0.78, 0.95))), slide = ease.out(ramp(p, 0.22, 0.75)) * (1 - ease.inOut(ramp(p, 0.82, 1)));
    R.body.scale.y *= 1 - 0.2 * crouch; hopUp(R, ramp(p, 0.1, 0.3), 0.3);
    R.body.rotation.x += 1.45 * lay; R.body.position.y += 0.18 * lay; R.body.position.z += 0.25 * slide;
    R.body.rotation.z += 0.12 * Math.sin(p * 40) * lay; // 滑的時候左右晃
    R.armL.rotation.z -= 1.4 * lay; R.armR.rotation.z += 1.4 * lay; R.armL.rotation.x += 0.8 * lay; R.armR.rotation.x += 0.8 * lay;
    if (R.legL) { R.legL.rotation.x -= 1.2 * lay; R.legR.rotation.x -= 1.2 * lay; }
    hopUp(R, ramp(p, 0.8, 1), 0.25); } },
  hippo: { dur: 1.3, hit: 0.55, beats: [0.6], beatFx: 'beatSlam', desc: '轉身、跳起來，用大屁股重重坐下去', fn(R, p) {
    const turn = ease.inOut(ramp(p, 0, 0.25)) * (1 - ease.inOut(ramp(p, 0.8, 1)));
    R.body.rotation.y += Math.PI * turn;
    const sit = bell(p, 0.5, 0.85); R.body.rotation.x -= 0.55 * sit; R.body.scale.y *= 1 - 0.25 * bell(p, 0.52, 0.66); R.body.scale.x *= 1 + 0.15 * bell(p, 0.52, 0.66);
    if (R.legL) { R.legL.rotation.x -= 1.3 * sit; R.legR.rotation.x -= 1.3 * sit; }
    R.armL.rotation.z -= 1.0 * bell(p, 0.25, 0.6); R.armR.rotation.z += 1.0 * bell(p, 0.25, 0.6);
    if (R.jaw) R.jaw.rotation.x += 0.9 * bell(p, 0.5, 0.9); } },
  rhino: { dur: 1.3, hit: 0.3, beats: [0.48, 0.76], beatFx: 'beatImpact', desc: '低頭連撞三下，一下比一下用力', fn(R, p) {
    R.head.rotation.x += 0.75 * Math.min(1, bell(p, 0, 1) * 2);
    for (let i = 0; i < 3; i++) { const a = 0.08 + i * 0.28, k = bell(p, a, a + 0.24), s = 0.45 + i * 0.2; R.body.position.z += s * k; R.body.rotation.x += 0.3 * k; R.body.scale.z *= 1 - 0.18 * bell(p, a + 0.1, a + 0.2); R.body.scale.y *= 1 + 0.1 * bell(p, a + 0.1, a + 0.2); R.body.position.y += 0.05 * Math.abs(Math.sin(k * Math.PI * 2)); }
    const run = Math.sin(p * 45) * bell(p, 0, 1);
    if (R.legL) { R.legL.rotation.x += 0.9 * run; R.legR.rotation.x -= 0.9 * run; }
    if (R.armL) { R.armL.rotation.x -= 0.9 * run; R.armR.rotation.x += 0.9 * run; } } },
  skunk: { dur: 1.5, hit: 0.45, desc: '轉身倒立、尾巴豎起來對著敵人噴', fn(R, p) {
    const turn = ease.inOut(ramp(p, 0, 0.2)) * (1 - ease.inOut(ramp(p, 0.85, 1)));
    R.body.rotation.y += Math.PI * turn;
    const hs = ease.out(ramp(p, 0.15, 0.4)) * (1 - ease.inOut(ramp(p, 0.75, 0.92))); // 倒立
    R.body.rotation.x += 2.1 * hs; R.body.position.y += 0.3 * hs; R.body.position.z += 0.1 * hs;
    R.armL.rotation.x -= 1.2 * hs; R.armR.rotation.x -= 1.2 * hs;
    if (R.legL) { R.legL.rotation.x += 0.5 * hs; R.legR.rotation.x += 0.5 * hs; }
    const puff = bell(p, 0.4, 0.75); R.tail.rotation.x += 0.9 * hs + 0.25 * Math.sin(p * 50) * puff; R.tail.scale.setScalar(1 + 0.25 * puff);
    R.body.rotation.z += 0.08 * Math.sin(p * 30) * puff; } },
  gorilla: { dur: 1.5, hit: 0.38, beats: [0.58, 0.74, 0.9], beatFx: 'beatPound', desc: '先捶胸，再左右拳輪流捶地四下', fn(R, p) {
    const chest = bell(p, 0, 0.3);
    R.armL.rotation.x -= 1.3 * chest * (0.6 + 0.4 * Math.sin(p * 60)); R.armR.rotation.x -= 1.3 * chest * (0.6 - 0.4 * Math.sin(p * 60));
    R.body.position.y += 0.1 * chest; R.head.rotation.x -= 0.3 * chest;
    for (let i = 0; i < 4; i++) { const a = 0.3 + i * 0.16, up = bell(p, a, a + 0.1), hit = bell(p, a + 0.08, a + 0.16), arm = i % 2 ? R.armR : R.armL;
      arm.rotation.x += -3.0 * up + 1.0 * hit; arm.rotation.z += (i % 2 ? 0.5 : -0.5) * up; R.body.rotation.x += 0.45 * hit; R.body.position.y -= 0.1 * hit; R.body.scale.y *= 1 - 0.12 * hit; R.body.rotation.z += (i % 2 ? -1 : 1) * 0.12 * (up + hit); } } },
  // ---- v0.13.15 第二批 ----
  zebra: { dur: 1.1, hit: 0.5, desc: '轉身、前腳撐地，兩隻後腳用力往後踢', fn(R, p) {
    const t = turnBack(p), k = bell(p, 0.38, 0.68), pre = bell(p, 0.15, 0.42);
    R.body.rotation.y += Math.PI * t;
    R.body.rotation.x -= 0.2 * pre; R.body.position.y -= 0.05 * pre; // 蓄力壓低
    R.body.rotation.x += 0.85 * k; R.body.position.y += 0.22 * k; R.head.rotation.x += 0.5 * k; // 屁股翹起
    R.legL.rotation.x -= 2.2 * k; R.legR.rotation.x -= 2.2 * k;
    R.armL.rotation.x += 0.5 * k; R.armR.rotation.x += 0.5 * k;
    if (R.tail) R.tail.rotation.x -= 1.2 * k;
    R.body.scale.y *= 1 - 0.12 * bell(p, 0.66, 0.8); } },
  giraffe: { dur: 1.3, hit: 0.55, desc: '頭往後仰蓄力，再用長脖子甩一整圈', fn(R, p) {
    const w = ease.out(ramp(p, 0, 0.35)) * (1 - ramp(p, 0.35, 0.45));
    R.body.rotation.y -= 0.7 * w; R.head.rotation.x -= 0.6 * w; R.head.rotation.y -= 0.5 * w;
    const sw = ease.inOut(ramp(p, 0.38, 0.8)); R.body.rotation.y += Math.PI * 2 * sw; // 甩一圈
    const lag = bell(p, 0.38, 0.85); R.head.rotation.y -= 0.6 * lag; R.head.rotation.z += 0.5 * lag; R.body.rotation.z -= 0.15 * lag;
    R.body.position.y += 0.06 * lag; R.body.scale.y *= 1 - 0.1 * bell(p, 0.82, 0.95); } },
  shark: { dur: 1.2, hit: 0.6, desc: '頭朝下潛進地底，竄出來張大嘴咬住再甩頭', fn(R, p) {
    const dive = bell(p, 0, 0.35), up = bell(p, 0.45, 0.75), shake = bell(p, 0.62, 0.95);
    R.body.rotation.x += 0.9 * dive; R.tail.rotation.x -= 0.8 * dive;
    R.body.rotation.x -= 0.8 * up; R.body.position.y += 0.15 * up; R.jaw.rotation.x += 1.3 * bell(p, 0.45, 0.65);
    R.body.rotation.y += 0.45 * Math.sin(p * 55) * shake; R.body.rotation.z += 0.2 * Math.sin(p * 55) * shake; // 咬住甩頭
    R.tail.rotation.y += 0.9 * Math.sin(p * 30) * bell(p, 0, 1); } },
  chameleon: { dur: 1.2, hit: 0.6, desc: '壓低身子左右晃、悄悄靠近，再猛然出舌', fn(R, p) {
    const sneak = bell(p, 0, 0.55), strike = bell(p, 0.52, 0.75);
    R.body.scale.y *= 1 - 0.2 * sneak; R.body.position.y -= 0.04 * sneak;
    R.body.rotation.z += 0.3 * Math.sin(p * 16) * sneak; R.body.position.x += 0.12 * Math.sin(p * 16) * sneak; // 左右晃（像在樹枝上）
    R.head.rotation.x -= 0.2 * sneak;
    R.body.position.z += 0.3 * strike; R.head.rotation.x -= 0.35 * strike; R.head.position.z += 0.12 * strike; R.body.scale.z *= 1 + 0.15 * strike;
    if (R.tail) R.tail.rotation.x += 0.8 * sneak - 0.6 * strike; } },
  bee: { dur: 1.3, hit: 0.6, desc: '畫 8 字指揮蜂群，再轉身用尾針往前刺', fn(R, p) {
    const f8 = bell(p, 0, 0.6), q = ramp(p, 0, 0.6) * Math.PI * 2;
    R.body.position.x += 0.35 * Math.sin(q) * f8; R.body.position.z += 0.18 * Math.sin(q * 2) * f8; R.body.rotation.z -= 0.5 * Math.cos(q) * f8; // 8 字飛
    R.body.position.y += 0.1 * f8;
    const t = turnBack(ramp(p, 0.45, 1)), st = bell(p, 0.55, 0.8);
    R.body.rotation.y += Math.PI * t; R.body.position.z += 0.45 * st; R.body.rotation.x -= 0.7 * st;
    if (R.wingL) { R.wingL.rotation.z += 0.5 * Math.sin(p * 90); R.wingR.rotation.z -= 0.5 * Math.sin(p * 90); } } },
  // ---- v0.13.16 第三批 ----
  eel: { dur: 1.2, hit: 0.55, desc: '身體捲起來蓄電、一閃一閃，再整條往前甩出電', fn(R, p) {
    const coil = bell(p, 0, 0.6), whip = bell(p, 0.5, 0.8);
    R.segs.forEach((s, i) => { s.rotation.z += 0.5 * Math.sin(p * 30 - i * 0.9) * coil; s.rotation.x -= 0.25 * coil - 0.35 * whip; });
    R.head.rotation.x -= 0.5 * coil; R.head.scale.setScalar(1 + 0.18 * Math.abs(Math.sin(p * 24)) * coil); // 一閃一閃
    R.body.position.y += 0.15 * coil; R.body.position.z += 0.35 * whip; R.head.rotation.x += 0.7 * whip;
    R.earL.rotation.z += 0.7 * coil; R.earR.rotation.z -= 0.7 * coil; } },
  parrot: { dur: 1.1, hit: 0.45, desc: '張開翅膀大叫，左右翅膀輪流把三根羽毛甩出去', fn(R, p) {
    const open = bell(p, 0, 1), scream = bell(p, 0.05, 0.4);
    R.wingL.rotation.z -= 1.2 * open; R.wingR.rotation.z += 1.2 * open;
    R.body.rotation.x -= 0.35 * scream; R.head.rotation.x -= 0.5 * scream; if (R.beak) R.beak.scale.y = 1 + 0.8 * scream;
    for (let i = 0; i < 3; i++) { const a = 0.3 + i * 0.18, k = bell(p, a, a + 0.16), w = i % 2 ? R.wingR : R.wingL; w.rotation.y += (i % 2 ? 1.6 : -1.6) * k; w.rotation.z += (i % 2 ? -1.0 : 1.0) * k; R.body.rotation.y += (i % 2 ? -0.5 : 0.5) * k; R.body.rotation.x += 0.45 * k; R.body.position.z += 0.18 * k; }
    if (R.tail) R.tail.rotation.x -= 0.6 * open; } },
  deer: { dur: 1.3, hit: 0.55, desc: '前腳抬起站起來，再低頭深深一鞠躬灑下祝福', fn(R, p) {
    const rear = bell(p, 0, 0.5), bow = bell(p, 0.45, 0.95);
    R.body.rotation.x -= 0.55 * rear; R.body.position.y += 0.08 * rear;
    R.armL.rotation.x -= 1.2 * rear * (0.7 + 0.3 * Math.sin(p * 30)); R.armR.rotation.x -= 1.2 * rear * (0.7 - 0.3 * Math.sin(p * 30));
    R.head.rotation.x -= 0.4 * rear;
    R.head.rotation.x += 0.9 * bow; R.body.rotation.x += 0.3 * bow; R.armL.rotation.x += 0.4 * bow; R.armR.rotation.x += 0.4 * bow;
    if (R.tail) R.tail.rotation.x -= 0.6 * Math.abs(Math.sin(p * 20)) * bell(p, 0, 1); } },
  flamingo: { dur: 1.4, hit: 0.45, desc: '單腳站、翅膀張開，優雅地轉兩圈', fn(R, p) {
    const pose = bell(p, 0, 1), spin = ease.inOut(ramp(p, 0.15, 0.85));
    R.legL.rotation.x -= 1.6 * Math.min(1, pose * 2); // 一隻腳收起來
    R.wingL.rotation.z -= 1.5 * Math.min(1, pose * 2); R.wingR.rotation.z += 1.5 * Math.min(1, pose * 2);
    R.body.rotation.y += Math.PI * 4 * spin; R.body.position.y += 0.1 * pose;
    R.head.rotation.x -= 0.3 * pose; R.head.rotation.z += 0.25 * Math.sin(p * 14) * pose; } },
  bat: { dur: 1.1, hit: 0.6, desc: '用翅膀把自己包起來，再猛然張開撲上去咬', fn(R, p) {
    const wrap = bell(p, 0, 0.5), flare = bell(p, 0.42, 0.75), bite = bell(p, 0.55, 0.8);
    R.wingL.rotation.y -= 1.4 * wrap; R.wingR.rotation.y += 1.4 * wrap; R.wingL.rotation.z += 0.6 * wrap; R.wingR.rotation.z -= 0.6 * wrap; R.body.scale.setScalar(1 - 0.12 * wrap);
    R.wingL.rotation.z -= 1.6 * flare; R.wingR.rotation.z += 1.6 * flare;
    R.body.position.z += 0.45 * bite; R.body.rotation.x += 0.6 * bite; R.head.rotation.x += 0.4 * bite; } },
  squirrel: { dur: 1.1, hit: 0.3, desc: '站起來鼓起臉頰，尾巴翹高，左右手連丟三顆松果', fn(R, p) {
    const up = bell(p, 0, 1), puff = bell(p, 0, 0.35);
    R.body.rotation.x -= 0.25 * up; R.body.position.y += 0.06 * up;
    R.head.scale.x *= 1 + 0.25 * puff; R.head.scale.y *= 1 - 0.05 * puff; // 鼓臉頰
    for (let i = 0; i < 3; i++) { const a = 0.22 + i * 0.22, w = bell(p, a - 0.08, a + 0.06), s = bell(p, a + 0.02, a + 0.16), arm = i % 2 ? R.armL : R.armR;
      arm.rotation.x += -2.8 * w + 0.6 * s; R.body.rotation.y += (i % 2 ? 0.4 : -0.4) * (w + s); R.body.rotation.x += -0.2 * w + 0.45 * s; R.body.position.z += 0.1 * s; }
    if (R.tail) R.tail.rotation.x -= 0.7 * up + 0.25 * Math.sin(p * 30) * up;
    if (R.prop) R.prop.visible = p > 0.9; } }, // 丟完松果，最後手上再拿一顆
  // ---- v0.13.17 第四批 ----
  wolf: { dur: 1.4, hit: 0.4, desc: '坐下來、挺胸仰頭對天長嚎，最後甩甩毛', fn(R, p) {
    const sit = bell(p, 0, 0.85), howl = Math.min(1, bell(p, 0.15, 0.85) * 1.6), shake = bell(p, 0.8, 1);
    R.body.rotation.x -= 0.45 * sit; R.body.position.y -= 0.04 * sit; R.legL.rotation.x -= 0.9 * sit; R.legR.rotation.x -= 0.9 * sit;
    R.head.rotation.x -= 1.1 * howl; R.head.rotation.z += 0.06 * Math.sin(p * 40) * howl; if (R.jaw) R.jaw.rotation.x += 0.7 * howl;
    R.torso.scale.z *= 1 + 0.12 * howl; R.armL.rotation.x -= 0.4 * howl; R.armR.rotation.x -= 0.4 * howl;
    R.body.rotation.y += 0.3 * Math.sin(p * 60) * shake; } },
  frog: { dur: 1.0, hit: 0.45, desc: '蹲低、鼓起臉頰，張大嘴吐舌，再往後一坐把敵人拉過來', fn(R, p) {
    const crouch = bell(p, 0, 0.4), shoot = bell(p, 0.3, 0.6), pull = bell(p, 0.5, 0.95);
    R.body.scale.y *= 1 - 0.35 * crouch; R.body.scale.x *= 1 + 0.2 * crouch; R.head.scale.x *= 1 + 0.3 * crouch;
    R.body.rotation.x += 0.75 * shoot; R.body.position.z += 0.25 * shoot; R.body.position.y += 0.08 * shoot; R.mouth.scale.y *= 1 + 2.2 * shoot;
    R.body.rotation.x -= 0.7 * pull; R.body.position.z -= 0.15 * pull; R.armL.rotation.x -= 1.0 * pull; R.armR.rotation.x -= 1.0 * pull;
    R.legL.rotation.x += 0.6 * pull; R.legR.rotation.x += 0.6 * pull; } },
  redpanda: { dur: 1.4, hit: 0.35, beats: [0.58, 0.78], beatFx: 'beatPound', desc: '站起來雙手舉高變大隻，左右搖擺再用力跺腳', fn(R, p) {
    const up = Math.min(1, bell(p, 0, 1) * 1.8);
    R.body.position.y += 0.18 * up; R.body.scale.y *= 1 + 0.22 * up; R.body.rotation.x -= 0.15 * up;
    R.armL.rotation.z -= 2.6 * up; R.armR.rotation.z += 2.6 * up; R.armL.rotation.x -= 0.3 * up; R.armR.rotation.x -= 0.3 * up;
    R.body.rotation.z += 0.18 * Math.sin(p * 18) * up; // 左右搖
    for (let i = 0; i < 2; i++) { const a = 0.5 + i * 0.2, k = bell(p, a, a + 0.12), leg = i ? R.legR : R.legL; leg.rotation.x -= 1.0 * k; R.body.position.y -= 0.05 * bell(p, a + 0.08, a + 0.16); }
    if (R.tail) R.tail.rotation.x -= 0.8 * up; } },
  koala: { dur: 1.2, hit: 0.62, desc: '氣到雙手亂揮，跳起來用肚子壓下去', fn(R, p) {
    const flail = bell(p, 0, 0.45), slam = bell(p, 0.5, 0.8);
    R.armL.rotation.x -= (1.6 + 0.9 * Math.sin(p * 50)) * flail; R.armR.rotation.x -= (1.6 - 0.9 * Math.sin(p * 50)) * flail;
    R.body.rotation.z += 0.12 * Math.sin(p * 40) * flail; R.head.rotation.x += 0.2 * flail;
    R.body.scale.y *= 1 - 0.2 * bell(p, 0.35, 0.5);
    R.body.rotation.x += 1.2 * slam; R.armL.rotation.z -= 1.3 * slam; R.armR.rotation.z += 1.3 * slam; R.legL.rotation.x -= 1.0 * slam; R.legR.rotation.x -= 1.0 * slam;
    R.body.scale.y *= 1 - 0.18 * bell(p, 0.6, 0.75); } },
  cheetah: { dur: 1.0, hit: 0.5, desc: '壓低身子全速衝刺，最後雙爪交叉撲抓', fn(R, p) {
    const run = bell(p, 0, 0.7), ph = p * 55;
    R.body.position.y -= 0.06 * run; R.body.scale.z *= 1 + 0.2 * run; R.body.rotation.x += 0.2 * run;
    R.legL.rotation.x += 1.1 * Math.sin(ph) * run; R.legR.rotation.x += 1.1 * Math.sin(ph + 0.8) * run;
    R.armL.rotation.x -= 1.1 * Math.sin(ph + 2) * run; R.armR.rotation.x -= 1.1 * Math.sin(ph + 2.8) * run;
    if (R.tail) R.tail.rotation.x -= 0.5 * run;
    hopUp(R, ramp(p, 0.5, 0.75), 0.3); clawSwing(R, ramp(p, 0.55, 0.9), -1, true); clawSwing(R, ramp(p, 0.6, 0.95), 1, true); } },
  fox: { dur: 1.2, hit: 0.72, desc: '歪頭聽聲音、壓低，高高跳起頭朝下插進去', fn(R, p) {
    const listen = bell(p, 0, 0.35), crouch = bell(p, 0.2, 0.42), air = ramp(p, 0.4, 0.75);
    R.head.rotation.z += 0.5 * listen; R.head.rotation.x += 0.2 * listen;
    R.body.scale.y *= 1 - 0.25 * crouch; R.body.position.y -= 0.05 * crouch;
    R.body.rotation.x += (-0.7 + 2.3 * ease.inOut(air)) * bell(p, 0.4, 0.95); // 先朝上再頭朝下
    R.armL.rotation.x -= 2.2 * bell(p, 0.55, 0.85); R.armR.rotation.x -= 2.2 * bell(p, 0.55, 0.85);
    if (R.tail) R.tail.rotation.x -= 1.0 * bell(p, 0.4, 0.9); } },
  // ---- v0.13.18 第五批 ----
  octopus: { dur: 1.2, hit: 0.55, desc: '頭脹大、八隻腳張開，再一縮往後噴墨', fn(R, p) {
    const inf = bell(p, 0, 0.55), jet = bell(p, 0.48, 0.8);
    R.head.scale.setScalar(1 + 0.4 * inf - 0.25 * jet); R.body.position.y += 0.2 * inf;
    R.tents.forEach((t, i) => { t[0].rotation.x -= 1.2 * inf - 0.9 * jet; t[0].rotation.z += 0.15 * Math.sin(p * 20 + i) * inf; });
    R.body.position.z -= 0.3 * jet; R.body.rotation.x -= 0.4 * jet; } },
  owl: { dur: 1.3, hit: 0.55, desc: '頭轉一百八十度鎖定獵物，張翅無聲滑翔，爪子往前抓', fn(R, p) {
    const look = bell(p, 0, 0.35), glide = bell(p, 0.25, 0.9), grab = bell(p, 0.45, 0.7);
    R.head.rotation.y += Math.PI * 0.9 * look; R.head.scale.setScalar(1 + 0.1 * look);
    R.wingL.rotation.z -= 1.5 * glide; R.wingR.rotation.z += 1.5 * glide; R.body.rotation.x += 0.45 * glide; R.body.position.y += 0.15 * glide;
    R.body.rotation.x -= 0.3 * grab; R.legL.rotation.x -= 1.6 * grab; R.legR.rotation.x -= 1.6 * grab; R.body.position.z += 0.25 * grab; } },
  elephant: { dur: 1.4, hit: 0.62, desc: '前腳抬起、鼻子高舉吹號角，耳朵張開，再重重踩下', fn(R, p) {
    const rear = bell(p, 0, 0.62), trumpet = Math.min(1, bell(p, 0.05, 0.6) * 1.5);
    R.body.rotation.x -= 0.65 * rear; R.body.position.y += 0.2 * rear; R.armL.rotation.x -= 1.6 * rear; R.armR.rotation.x -= 1.6 * rear;
    R.trunk.forEach((t, i) => { t.rotation.x -= (0.5 + i * 0.12) * trumpet; t.rotation.z += 0.05 * Math.sin(p * 40) * trumpet; });
    R.earL.rotation.y -= 0.9 * trumpet; R.earR.rotation.y += 0.9 * trumpet;
    R.body.scale.y *= 1 - 0.18 * bell(p, 0.6, 0.75); R.body.position.y -= 0.04 * bell(p, 0.6, 0.75); } },
  lion: { dur: 1.3, hit: 0.4, desc: '壓低身子，再往前挺身張大嘴咆哮，鬃毛整個炸開', fn(R, p) {
    const pre = bell(p, 0, 0.35), roar = Math.min(1, bell(p, 0.28, 1) * 1.6);
    R.body.scale.y *= 1 - 0.15 * pre; R.head.rotation.x += 0.35 * pre;
    R.body.position.z += 0.25 * roar; R.body.rotation.x += 0.2 * roar; R.head.rotation.x -= 0.25 * roar;
    if (R.jaw) R.jaw.rotation.x += 0.9 * roar; if (R.mane) R.mane.scale.setScalar(1 + 0.3 * roar);
    R.head.rotation.z += 0.07 * Math.sin(p * 55) * roar; R.body.position.x += 0.02 * Math.sin(p * 70) * roar;
    R.armR.rotation.x -= 1.5 * bell(p, 0.25, 0.5); if (R.tail) R.tail.rotation.x -= 0.7 * roar; } },
  eagle: { dur: 1.5, hit: 0.3, desc: '用力拍翅、爪子張開往前抓住，再抱著獵物往上飛', fn(R, p) {
    const flap = Math.abs(Math.sin(p * 20)), claw = bell(p, 0.15, 0.4), lift = bell(p, 0.3, 1);
    R.wingL.rotation.z -= (0.6 + 1.3 * flap) * bell(p, 0, 1); R.wingR.rotation.z += (0.6 + 1.3 * flap) * bell(p, 0, 1);
    R.legL.rotation.x -= 1.8 * claw; R.legR.rotation.x -= 1.8 * claw; R.body.rotation.x -= 0.4 * claw; R.body.position.z += 0.3 * claw;
    R.body.position.y += 1.0 * lift; R.legL.rotation.x -= 0.6 * lift; R.legR.rotation.x -= 0.6 * lift; R.body.rotation.x += 0.3 * lift;
    if (R.tail) R.tail.rotation.x += 0.4 * lift; } },
  peacock: { dur: 1.6, hit: 0.45, desc: '尾羽整個張開沙沙抖動，慢慢轉一圈炫耀', fn(R, p) {
    const o = Math.min(1, bell(p, 0, 1) * 1.8), rattle = bell(p, 0.25, 0.85);
    R.fan.scale.setScalar(1 + 0.6 * o); R.fan.rotation.x -= 0.5 * o; R.fan.position.y += 0.15 * o;
    R.fan.rotation.z += 0.12 * Math.sin(p * 90) * rattle; // 抖動尾羽
    R.body.rotation.y += Math.PI * 2 * ease.inOut(ramp(p, 0.2, 0.9));
    R.head.rotation.x -= 0.3 * o; R.body.position.y += 0.06 * o; R.wingL.rotation.z -= 0.5 * o; R.wingR.rotation.z += 0.5 * o; } },
  // ---- v0.13.19 第六批 ----
  whale: { dur: 1.5, hit: 0.55, desc: '弓起背、噴水孔噴水，尾巴高舉，再整個肚子拍下去掀起巨浪', fn(R, p) {
    const arch = bell(p, 0, 0.55), crash = bell(p, 0.5, 0.75);
    R.body.rotation.x -= 0.6 * arch; R.body.position.y += 0.3 * arch; R.armL.rotation.z -= 1.0 * arch; R.armR.rotation.z += 1.0 * arch;
    if (R.tail) R.tail.rotation.x += 1.1 * arch - 0.6 * crash;
    if (R.blow) R.blow.scale.setScalar(1 + 1.5 * bell(p, 0.05, 0.45));
    R.body.rotation.x += 0.5 * crash; R.body.scale.y *= 1 - 0.22 * bell(p, 0.55, 0.72); R.body.scale.x *= 1 + 0.12 * bell(p, 0.55, 0.72); } },
  komodo: { dur: 1.2, hit: 0.5, desc: '壓低頭左右晃著靠近，張大嘴咬住再甩頭撕扯', fn(R, p) {
    const stalk = bell(p, 0, 0.45), bite = bell(p, 0.35, 0.6), tear = bell(p, 0.5, 0.95);
    R.body.position.y -= 0.04 * stalk; R.head.rotation.x += 0.2 * stalk; R.body.rotation.y += 0.4 * Math.sin(p * 18) * stalk; R.body.scale.y *= 1 - 0.12 * stalk;
    if (R.jawU) R.jawU.rotation.x -= 1.0 * bite; if (R.jaw) R.jaw.rotation.x += 0.6 * bite; R.body.position.z += 0.6 * bite; R.body.rotation.x += 0.25 * bite;
    R.body.rotation.y += 0.4 * Math.sin(p * 50) * tear; R.head.rotation.z += 0.25 * Math.sin(p * 50) * tear;
    if (R.tail) R.tail.rotation.y += 0.8 * Math.sin(p * 22) * bell(p, 0, 1); } },
  hedgehog: { dur: 1.4, hit: 0.5, desc: '發抖、縮成刺球原地狂轉，刺一口氣炸開', fn(R, p) {
    const shiver = bell(p, 0, 0.25), ball = Math.min(1, bell(p, 0.15, 0.9) * 2), burst = bell(p, 0.45, 0.65);
    R.body.position.x += 0.03 * Math.sin(p * 120) * shiver;
    R.head.scale.setScalar(1 - 0.8 * ball); R.armL.scale.setScalar(1 - 0.8 * ball); R.armR.scale.setScalar(1 - 0.8 * ball);
    R.spikes.scale.setScalar(1 + 0.35 * ball + 0.5 * burst);
    R.body.rotation.y += Math.PI * 4 * ease.inOut(ramp(p, 0.2, 0.85)); R.body.position.y += 0.1 * ball; } },
  croc: { dur: 1.3, hit: 0.3, beats: [0.5, 0.72], beatFx: 'beatDust', desc: '張大嘴撲上去咬住，整隻翻滾兩圈', fn(R, p) {
    const open = bell(p, 0, 0.3), lunge = bell(p, 0.15, 0.95);
    if (R.jawU) R.jawU.rotation.x -= 1.1 * open; if (R.jaw) R.jaw.rotation.x += 0.4 * open;
    R.body.position.z += 0.45 * lunge; R.body.position.y += 0.12 * lunge;
    R.body.rotation.z += ease.inOut(ramp(p, 0.25, 0.9)) * Math.PI * 4; // 死亡翻滾
    if (R.tail) R.tail.rotation.y += 0.8 * Math.sin(p * 25) * lunge; } },
  panda: { dur: 1.3, hit: 0.5, beats: [0.25, 0.4, 0.62, 0.75], beatFx: 'beatDust', desc: '抱住膝蓋縮成球往前滾三圈，滾完張開雙手', fn(R, p) {
    const curl = Math.min(1, bell(p, 0.05, 0.85) * 2), open = bell(p, 0.8, 1);
    R.head.scale.setScalar(1 - 0.25 * curl); R.armL.rotation.x -= 1.5 * curl; R.armR.rotation.x -= 1.5 * curl; R.legL.rotation.x -= 1.2 * curl; R.legR.rotation.x -= 1.2 * curl;
    R.body.rotation.x += ease.inOut(ramp(p, 0.1, 0.8)) * Math.PI * 6; R.body.position.y += 0.25 * curl; R.body.position.z += 0.3 * curl;
    R.armL.rotation.z -= 2.2 * open; R.armR.rotation.z += 2.2 * open;
    if (R.prop) R.prop.visible = p > 0.8 || p < 0.05; } },
};
for (const k in SKILL_V2) { const A = SKILL_V2[k]; if (!ACT[k] || !ACT[k].skill) continue; ACT[k].skill = { dur: A.dur, hit: A.hit, fx: ACT[k].skill.fx, fn: A.fn, desc: A.desc, beats: A.beats, beatFx: A.beatFx }; }
function poseRig(R, st) {
  for (const g of R.groups) resetG(g);
  const t = st.t + R.phase;
  // 待機呼吸
  const br = Math.sin(t * 2.4);
  if (R.torso) R.torso.scale.y *= 1 + 0.03 * br;
  R.head.position.y += 0.008 * br;
  R.head.rotation.z += 0.04 * Math.sin(t * 1.1);
  if (R.tail) { R.tail.rotation.y += 0.25 * Math.sin(t * 2); R.tail.rotation.z += 0.08 * Math.sin(t * 1.3); }
  if (R.earL) { const tw = Math.max(0, Math.sin(t * 0.9) - 0.92) * 6; R.earL.rotation.z += 0.3 * tw; R.earR.rotation.z -= 0.2 * tw; }
  if (R.tents) R.tents.forEach((seg, i) => seg.forEach((s, k) => { s.rotation.x += 0.25 * Math.sin(t * 2.2 + i + k * 0.8); }));
  if (R.trunk) R.trunk.forEach((s, k) => { s.rotation.z += 0.08 * Math.sin(t * 1.6 + k * 0.6); });
  if (R.segs) R.segs.forEach((s, k) => { s.rotation.z += 0.12 * Math.sin(t * 2.4 + k * 0.9); s.rotation.x += 0.05 * Math.sin(t * 1.7 + k); });
  if (R.fan) { R.fan.rotation.z += 0.03 * Math.sin(t * 1.3); R.fan.scale.y *= 1 + 0.03 * Math.sin(t * 2.1); }
  if (R.earL && R.key === 'elephant') { R.earL.rotation.y += 0.15 * Math.sin(t * 2); R.earR.rotation.y -= 0.15 * Math.sin(t * 2); }
  if (R.fly) {
    R.body.position.y += R.fly + 0.05 * Math.sin(t * 4);
    const fl = R.key === 'bat' ? Math.sin(t * 14) * 0.7 : Math.sin(t * 60) * 0.5;
    if (R.wingL) { R.wingL.rotation.z += fl; R.wingR.rotation.z -= fl; }
  }
  // 貓頭鷹偶爾轉頭 180°
  if (R.key === 'owl' && !st.act) { const c = (t % 9); R.head.rotation.y += c > 7 ? Math.sin((c - 7) / 2 * Math.PI) * Math.PI * 0.95 : 0; }
  // 移動：擠壓與伸展（起步壓扁、空中拉長、落地回彈）
  if (st.moveP !== null && st.moveP !== undefined) {
    const k = st.moveP, sy = 1 - 0.13 * bell(k, 0, 0.22) + 0.12 * bell(k, 0.18, 0.78) - 0.12 * bell(k, 0.75, 1);
    R.body.scale.y *= sy; R.body.scale.x *= 1 - (sy - 1) * 0.6; R.body.scale.z *= 1 - (sy - 1) * 0.6;
    if (R.legL && !R.fly) { R.legL.rotation.x += 0.6 * Math.sin(k * Math.PI * 2); R.legR.rotation.x -= 0.6 * Math.sin(k * Math.PI * 2); }
    R.body.rotation.x += 0.12 * bell(k, 0.1, 0.9);
  }
  if (st.land !== null && st.land !== undefined) { const k = st.land, sq = 0.16 * Math.sin(k * Math.PI) * (1 - k) - 0.05 * Math.sin(k * Math.PI * 2) * k; R.body.scale.y *= 1 - sq; R.body.scale.x *= 1 + sq * 0.6; R.body.scale.z *= 1 + sq * 0.6; }
  if (st.moving) {
    const ph = t * 13;
    R.body.position.y += Math.abs(Math.sin(ph)) * (R.fly ? 0.03 : 0.08);
    R.body.rotation.z += 0.08 * Math.sin(ph);
    if (R.legL && !R.fly) { R.legL.rotation.x += 0.7 * Math.sin(ph); R.legR.rotation.x -= 0.7 * Math.sin(ph); }
    if (R.armL && !R.wingL) { R.armL.rotation.x -= 0.5 * Math.sin(ph); R.armR.rotation.x += 0.5 * Math.sin(ph); }
  }
  if (st.sleep) {
    R.body.rotation.x += 0.35; R.body.position.y -= 0.05; R.head.rotation.x += 0.45;
    R.armL.rotation.x -= 1.0; R.armR.rotation.x -= 1.0; R.armL.rotation.z += 0.5; R.armR.rotation.z -= 0.5;
    R.torso.scale.y *= 1 + 0.05 * Math.sin(t * 1.2);
  }
  if (st.act) { const A = (ACT[R.key] || {})[st.act.kind]; if (A) A.fn(R, Math.min(1, st.act.p)); if (st.act.kind === 'atk' && R.melee) { R.body.position.z -= 0.1 * bell(st.act.p, 0, 0.24); R.body.scale.z *= 1 - 0.08 * bell(st.act.p, 0, 0.24); } }
  if (st.stun) R.head.rotation.z += 0.18 * Math.sin(t * 6);
  if (st.hit > 0) { const k = Math.sin(st.hit * Math.PI); R.body.scale.x *= 1 + 0.12 * k; R.body.scale.y *= 1 - 0.12 * k; R.body.position.z -= 0.06 * k; }
  if (st.dead !== undefined) { const d = Math.min(1, st.dead); R.body.rotation.z += 0.5 * ease.out(Math.min(1, d * 3)) * (R.phase > 1.5 ? 1 : -1); R.yaw.rotation.y += ease.inOut(d) * Math.PI * 4; R.body.position.y += 0.25 * ease.out(d); const sc = 1 - ramp(d, 0.35, 1); R.yaw.scale.setScalar(Math.max(0.001, sc)); }
  else R.yaw.scale.setScalar(1);
  if (st.victory) hopUp(R, (t * 1.6) % 1, 0.25);
  if (R.olSync) for (const [o, ol] of R.olSync) { ol.position.copy(o.position); ol.scale.copy(o.scale); ol.rotation.copy(o.rotation); ol.visible = o.visible; } // 會自己縮放的部位，描邊跟著動
}
function setFlash(R, k) {
  for (const m of R.mats) if (m.emissive) { m.emissive.setRGB(k, k * 0.95, k * 0.9); if (m === R.mats[0] && R.skinGlow) m.emissive.add(R.skinGlow); }
}
function setNightEyes(R, on) {
  if (!R.eyeMat) return;
  R.eyeMat.color.set(on ? R.glow : '#241914');
}
// 體型：費用越高越大，星級再放大
const ART_SCALE = { 0: 1.0, 1: 1.0, 2: 1.07, 3: 1.14, 4: 1.22, 5: 1.32 };
function animalScale(key, star) {
  const A = ANIMALS[key] || EXTRA[key];
  let s = ART_SCALE[A.cost] || 0.95;
  if (key === 'boar') s = 1.15; if (key === 'minibee') s = 1.1; if (key === 'kingboar') s = 1.85;
  return s * (1 + (star - 1) * 0.08);
}

// 造型：整隻動物染色（乘色＋微亮）
const SKINS = {
  base: { name: '原色', tint: '#ffffff', glow: '#000000' },
  gold: { name: '黃金', tint: '#ffe08a', glow: '#2a1a00' },
  night: { name: '夜影', tint: '#8a86b8', glow: '#000000' },
  snow: { name: '雪白', tint: '#ffffff', glow: '#3a3a40' },
  sakura: { name: '櫻花', tint: '#ffc0d0', glow: '#1a0008' },
  jade: { name: '翡翠', tint: '#a8e0b8', glow: '#001a08' },
  seasonGold: { name: '賽季黃金', tint: '#ffd34d', glow: '#4a3000' }, // 賽季獎勵
  seasonDia: { name: '賽季鑽石', tint: '#9fe8ff', glow: '#00303f' },
};
function applySkin(R, id) {
  const sk = SKINS[id] || SKINS.base;
  const m = R.mats[0]; if (!m) return;
  m.color.set(sk.tint); m.emissive = new THREE.Color(sk.glow); R.skinGlow = m.emissive.clone();
}
// 3 星進化外觀：皇冠＋金色光環
function addEvolveLook(R) {
  if (R.crown) return;
  const g = new THREE.Group(), gm = new THREE.MeshToonMaterial({ color: '#f2c14e', gradientMap: toonGrad(), emissive: new THREE.Color('#3a2400') });
  g.add(mesh(GEO.cyl, gm, [0, 0, 0], [0.13, 0.06, 0.13]));
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.add(mesh(GEO.cone, gm, [Math.cos(a) * 0.11, 0.07, Math.sin(a) * 0.11], [0.035, 0.09, 0.035])); g.add(mesh(GEO.sph, new THREE.MeshBasicMaterial({ color: ['#ff5a5a', '#5ac8ff', '#9be07a', '#ffd34d', '#d88aff'][i] }), [Math.cos(a) * 0.11, 0.13, Math.sin(a) * 0.11], 0.02)); }
  g.position.set(0, (R.headTop || 1) - 0.42, 0);
  R.head.add(g); R.crown = g;
}
