// ===== 3D 場景：相機、燈光、三種場地、棋盤、地形道具 =====
const S3 = {
  renderer: null, scene: null, cam: null, wrap: null, ov: null, W: 1, H: 1,
  arena: null, arenaKey: '', board: null, tiles: [], bench: [], props: null, deco: [], ambient: [],
  hemi: null, sun: null, camBase: new THREE.Vector3(), camLook: new THREE.Vector3(0, 0, 0.5), shake: 0,
  night: 0, nightTarget: 0, V: {}, fx: [], parts: [], texCache: {}, pick: [], ray: new THREE.Raycaster(),
};
const SPR_SIZE = 128;
// ---- 畫特效貼圖 ----
function tex(name) {
  if (S3.texCache[name]) return S3.texCache[name];
  const c = document.createElement('canvas'); c.width = c.height = SPR_SIZE;
  const g = c.getContext('2d'), M = SPR_SIZE / 2;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const glowStroke = (path, w, col, glow) => { g.save(); g.shadowColor = glow; g.shadowBlur = 14; g.strokeStyle = glow; g.lineWidth = w + 6; path(); g.stroke(); g.shadowBlur = 0; g.strokeStyle = col; g.lineWidth = w; path(); g.stroke(); g.restore(); };
  switch (name) {
    case 'claw3': for (let i = -1; i <= 1; i++) glowStroke(() => { g.beginPath(); g.moveTo(22 + i * 14, 18 - i * 8); g.quadraticCurveTo(M + 10 + i * 14, M - 6 - i * 6, 106 + i * 10, 108 - i * 12); }, 5 - Math.abs(i), '#ffffff', 'rgba(255,190,90,.9)'); break;
    case 'claw1': glowStroke(() => { g.beginPath(); g.moveTo(18, 30); g.quadraticCurveTo(M + 18, M - 10, 110, 100); }, 8, '#fffdf2', 'rgba(255,140,90,.9)'); break;
    case 'bite': for (const s of [-1, 1]) { g.save(); g.translate(M, M + s * 16); g.scale(1, s); g.fillStyle = '#fff'; g.shadowColor = 'rgba(255,80,60,.9)'; g.shadowBlur = 12; g.beginPath(); g.moveTo(-46, 0); g.quadraticCurveTo(0, -36, 46, 0); for (let i = 4; i >= -4; i--) { g.lineTo(i * 10 + 5, 2); g.lineTo(i * 10, 16); } g.closePath(); g.fill(); g.restore(); } break;
    case 'burst': { g.translate(M, M); g.fillStyle = '#fff6d8'; g.shadowColor = 'rgba(255,170,60,1)'; g.shadowBlur = 18; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 22 : 54; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); break; }
    case 'puff': { const gr = g.createRadialGradient(M, M, 4, M, M, M); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(M, M, M, 0, 7); g.fill(); break; }
    case 'cloud': { g.fillStyle = '#fff'; for (const [x, y, r] of [[44, 70, 26], [70, 56, 30], [92, 74, 22], [64, 82, 24]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } break; }
    case 'spark': { g.translate(M, M); g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 10; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = i % 2 ? 8 : 50; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); break; }
    case 'star': { g.translate(M, M); g.fillStyle = '#ffd34d'; g.strokeStyle = '#a86a10'; g.lineWidth = 5; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * Math.PI * 2, r = i % 2 ? 22 : 52; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.stroke(); g.fill(); break; }
    case 'ring': { g.strokeStyle = '#fff'; g.lineWidth = 9; g.shadowColor = '#fff'; g.shadowBlur = 10; g.beginPath(); g.arc(M, M, M - 12, 0, 7); g.stroke(); break; }
    case 'note': glowStroke(() => { g.beginPath(); for (const r of [20, 36, 52]) { g.moveTo(M + Math.cos(-0.7) * r - 30, M + Math.sin(-0.7) * r); g.arc(M - 30, M, r, -0.7, 0.7); } }, 6, '#ffffff', 'rgba(140,200,255,.9)'); break;
    case 'drop': { g.fillStyle = '#9fd3ef'; g.beginPath(); g.moveTo(M, 14); g.quadraticCurveTo(M + 38, 70, M, 110); g.quadraticCurveTo(M - 38, 70, M, 14); g.fill(); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(M - 10, 72, 8, 0, 7); g.fill(); break; }
    case 'leaf': { g.fillStyle = '#7fae55'; g.beginPath(); g.moveTo(20, 100); g.quadraticCurveTo(20, 20, 108, 20); g.quadraticCurveTo(108, 100, 20, 100); g.fill(); g.strokeStyle = '#4f7a35'; g.lineWidth = 4; g.beginPath(); g.moveTo(24, 96); g.lineTo(100, 28); g.stroke(); break; }
    case 'exclaim': case 'question': case 'anger': case 'zz': {
      g.font = '900 96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#3a2620';
      const t = { exclaim: '!', question: '?', zz: 'Z', anger: '✱' }[name], col = { exclaim: '#ff5a3c', question: '#b9a4ff', zz: '#f7e9cf', anger: '#ff4a3a' }[name];
      g.strokeText(t, M, M + 6); g.fillStyle = col; g.fillText(t, M, M + 6); break; }
    case 'coin': { g.fillStyle = '#d99a2b'; g.beginPath(); g.arc(M, M, 46, 0, 7); g.fill(); g.fillStyle = '#f7cf55'; g.beginPath(); g.arc(M, M, 34, 0, 7); g.fill(); g.fillStyle = '#d99a2b'; g.font = '900 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', M, M + 2); break; }
    case 'feather': { g.translate(M, M); g.rotate(-0.8); g.fillStyle = '#f2e6cf'; g.beginPath(); g.ellipse(0, 0, 14, 50, 0, 0, 7); g.fill(); g.strokeStyle = '#8b6a4e'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -50); g.lineTo(0, 56); g.stroke(); break; }
    case 'cross': for (const s of [-1, 1]) glowStroke(() => { g.beginPath(); g.moveTo(M - 48 * s, 16); g.quadraticCurveTo(M + 6 * s, M, M + 48 * s, 112); }, 7, '#ffffff', 'rgba(255,200,80,.95)'); break;
    case 'heal': { g.fillStyle = '#8fe07a'; g.shadowColor = '#5fbf4a'; g.shadowBlur = 10; g.fillRect(M - 12, 24, 24, 80); g.fillRect(24, M - 12, 80, 24); break; }
    case 'beam': { const gr = g.createLinearGradient(0, 0, 0, SPR_SIZE); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.35, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,.95)'); g.fillStyle = gr; g.fillRect(0, 0, SPR_SIZE, SPR_SIZE); break; }
    case 'shard': { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(M, 8); g.lineTo(M + 14, M); g.lineTo(M, 120); g.lineTo(M - 14, M); g.fill(); break; }
    case 'cell': { // 尖頂六角形（平面 1.1 寬，外接半徑 0.55 → 畫布半徑約 62px，留邊）
      const R = 58; g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + i * Math.PI / 3; g.lineTo(M + Math.cos(a) * R, M + Math.sin(a) * R); } g.closePath();
      g.fillStyle = 'rgba(255,255,255,.26)'; g.fill(); g.lineWidth = 6; g.lineJoin = 'round'; g.strokeStyle = 'rgba(255,255,255,.95)'; g.stroke(); break; }
    case 'flame': { const gr = g.createRadialGradient(M, M + 18, 4, M, M + 10, 50); gr.addColorStop(0, 'rgba(255,250,200,1)'); gr.addColorStop(.35, 'rgba(255,190,60,.95)'); gr.addColorStop(.7, 'rgba(240,90,30,.6)'); gr.addColorStop(1, 'rgba(200,40,20,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(M, 6); g.bezierCurveTo(M + 40, 50, M + 42, 100, M, 118); g.bezierCurveTo(M - 42, 100, M - 40, 50, M, 6); g.fill(); break; }
    case 'heart': { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(M, 108); g.bezierCurveTo(10, 66, 22, 14, M, 40); g.bezierCurveTo(106, 14, 118, 66, M, 108); g.fill(); break; }
    case 'splat': { g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, r = 30 + (i * 37 % 19); g.lineTo(M + Math.cos(a) * r, M + Math.sin(a) * r); } g.fill(); for (const [x, y, r] of [[18, 30, 8], [110, 40, 7], [100, 104, 9], [26, 98, 6]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } break; }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  S3.texCache[name] = t; return t;
}

// ---- 初始化 ----
function s3Init(wrap, canvas, overlay) {
  geos();
  S3.wrap = wrap; S3.ov = overlay;
  const R = S3.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  R.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  S3.scene = new THREE.Scene();
  S3.cam = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
  S3.hemi = new THREE.HemisphereLight(0xfff1dc, 0x8a5a3c, 1.25); S3.scene.add(S3.hemi);
  S3.sun = new THREE.DirectionalLight(0xffe2b8, 2.1); S3.sun.position.set(-5, 9, 6); S3.scene.add(S3.sun);
  S3.fill = new THREE.DirectionalLight(0xb8d4ff, 0.35); S3.fill.position.set(6, 4, -4); S3.scene.add(S3.fill);
  S3.fxRoot = new THREE.Group(); S3.scene.add(S3.fxRoot);
  S3.unitRoot = new THREE.Group(); S3.scene.add(S3.unitRoot);
  s3Resize();
  window.addEventListener('resize', s3Resize);
}
const CAM_FIT = 1; // 額外鏡頭距離倍率（1 = 剛好把整個棋盤＋備戰席放進畫面；數字越大越遠）
function s3Resize() {
  const w = S3.wrap.clientWidth, h = S3.wrap.clientHeight;
  S3.W = w; S3.H = h;
  S3.renderer.setSize(w, h, false);
  const a = w / h; S3.cam.aspect = a;
  S3.cam.fov = 36; S3.cam.updateProjectionMatrix();
  const ang = 0.93;
  S3.camLook.set(0, 0, a < 1 ? 0.15 : 0.2);
  // 自動對焦：從近處開始往後退，直到棋盤左右兩側、我方備戰席、對手備戰席都在畫面內（上緣留給 HUD）
  const pts = [];
  for (const vr of [0, CFG.ROWS - 1]) { const [x0, z] = cellWorld(0, vr), [x1] = cellWorld(CFG.COLS - 1, vr); pts.push([x0 - 0.55, z], [x1 + 0.55, z]); }
  const bz = benchWorld(0)[1]; pts.push([benchWorld(0)[0] - 0.4, bz + 0.3], [benchWorld(CFG.BENCH - 1)[0] + 0.4, bz + 0.3]);
  pts.push([0, oppBenchZ() - 0.3]);
  const v = new THREE.Vector3(), topLim = a < 1 ? 0.56 : 0.6; // 上緣留給血條與天氣列
  let dist = 9;
  for (let n = 0; n < 60; n++) {
    S3.camBase.set(0, Math.sin(ang) * dist, Math.cos(ang) * dist + 0.9);
    S3.cam.position.copy(S3.camBase); S3.cam.lookAt(S3.camLook); S3.cam.updateMatrixWorld();
    const ok = pts.every(([x, z]) => { v.set(x, 0.3, z).project(S3.cam); return Math.abs(v.x) < 0.97 && v.y > -0.97 && v.y < topLim; });
    if (ok) break;
    dist *= 1.03;
  }
  dist *= CAM_FIT;
  S3.camBase.set(0, Math.sin(ang) * dist, Math.cos(ang) * dist + 0.9);
}

// ---- 座標 ----
// 六角格：奇數列往右半格，列距 √3/2；整盤以 (0, -0.5) 為中心
const HEX_DZ = 0.866;
const BOARD_CX = (CFG.COLS - 1) / 2 + 0.25, BOARD_CZ = (CFG.ROWS - 1) / 2; // 棋盤中心（odd-r 點對稱）
const cellWorld = (vc, vr) => [vc + ((vr & 1) ? 0.5 : 0) - BOARD_CX, -0.5 + (BOARD_CZ - vr) * HEX_DZ];
const benchWorld = i => [(i - 3.5) * 0.8, -0.5 + BOARD_CZ * HEX_DZ + 1.32];
const oppBenchZ = () => -0.5 - BOARD_CZ * HEX_DZ - 0.85; // 對手備戰席（棋盤最上方）
const oppBenchWorld = (j, n) => [(j - (n - 1) / 2) * Math.min(0.62, 9.4 / n), oppBenchZ()];
const BOARD_GROW_X = (CFG.COLS - 7) / 2, BOARD_GROW_Z = (CFG.ROWS - 8) / 2 * HEX_DZ; // 比原本 7×8 大多少

// ---- 場地 ----
const ARENA_LOOK = {
  jungle: { sky: 'linear-gradient(#bcd59a 0%, #e9d9a0 45%, #7e9c58 100%)', ground: '#6b8b46', tileA: '#c4a46a', tileB: '#b8955a', tileE: '#a98652', tileF: '#9d7a48', slab: '#6e4a30', board: ['#7fa052', '#93b25c', '#6c8f45'], cliff: '#8a6a48', top: '#a3c46a', rim: '#5a4630', hemi: [0xfff3d6, 0x5a6a3a, 1.25], sun: [0xfff0c8, 2.0], fog: 0xa9c487 },
  desert: { sky: 'linear-gradient(#f6c27a 0%, #f7dca6 45%, #e3b07a 100%)', ground: '#e2b97a', tileA: '#efd29e', tileB: '#e6c38a', tileE: '#d9b07a', tileF: '#cfa36e', slab: '#b0683e', board: ['#e8c590', '#f0d3a2', '#dcb47c'], cliff: '#c06e40', top: '#e9a868', rim: '#a65a34', hemi: [0xfff1dc, 0xb07040, 1.35], sun: [0xffd9a0, 2.5], fog: 0xf0cf98 },
  city: { sky: 'linear-gradient(#7b6ea6 0%, #e89a7a 55%, #f2c48a 100%)', ground: '#5b5a62', tileA: '#d6cfc3', tileB: '#c9c1b4', tileE: '#bdb3a6', tileF: '#b2a89a', slab: '#3f3e45', board: ['#a9a49c', '#bdb6aa', '#97928b'], cliff: '#77706a', top: '#c9b79a', rim: '#4a4850', hemi: [0xffe2d0, 0x4a4560, 1.15], sun: [0xffc9a0, 1.8], fog: 0xb898a8 },
};
function disposeGroup(g) { if (!g) return; g.traverse(o => { if (o.isMesh && o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose(); }); g.parent && g.parent.remove(g); }
function rnd(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; }
const T = (hex) => new THREE.MeshToonMaterial({ color: hex, gradientMap: toonGrad() });
const MB = (hex, op) => new THREE.MeshBasicMaterial({ color: hex, transparent: op !== undefined, opacity: op === undefined ? 1 : op });

function s3SetArena(key) {
  if (S3.arenaKey === key) return;
  S3.arenaKey = key;
  const L = ARENA_LOOK[key];
  S3.wrap.style.background = L.sky;
  S3.hemi.color.setHex(L.hemi[0]); S3.hemi.groundColor.setHex(L.hemi[1]); S3.hemi.intensity = L.hemi[2];
  S3.sun.color.setHex(L.sun[0]); S3.sun.intensity = L.sun[1];
  S3.baseHemi = L.hemi[2]; S3.baseSun = L.sun[1];
  S3.scene.fog = new THREE.Fog(L.fog, 22, 44);
  disposeGroup(S3.arena); disposeGroup(S3.board);
  S3.arena = new THREE.Group(); S3.scene.add(S3.arena);
  S3.board = new THREE.Group(); S3.scene.add(S3.board);
  S3.ambient = [];
  const r = rnd(key.length * 977 + 13);
  // 地面
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 48), T(L.ground)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.32; S3.arena.add(ground);
  ARENA_DECO[key](S3.arena, r);
  // 棋盤底座
  // 棋盤是一塊有機形狀的島（地面網格在 s3SetTerrain 依高台重建），這裡只放邊緣點綴
  if (key === 'jungle') { for (let i = 0; i < 22; i++) { const v = new THREE.Mesh(GEO.sph, T(i % 2 ? '#4f7a35' : '#6b9a45')); const a = i / 22 * Math.PI * 2; v.scale.set(0.3 + r() * 0.2, 0.18 + r() * 0.1, 0.35); v.position.set(Math.cos(a) * 4.45, -0.25, -0.5 + Math.sin(a) * 4.45); v.rotation.y = r() * 3; S3.board.add(v); } }
  if (key === 'desert') { for (let i = 0; i < 16; i++) { const v = new THREE.Mesh(GEO.box, T(['#c98a5a', '#b87a4c', '#d9a070'][i % 3])); const a = i / 16 * Math.PI * 2 + r() * 0.2; v.scale.set(0.3 + r() * 0.3, 0.2 + r() * 0.2, 0.3 + r() * 0.3); v.rotation.y = r() * 3; v.position.set(Math.cos(a) * 4.5, -0.25, -0.5 + Math.sin(a) * 4.5); S3.board.add(v); } }
  if (key === 'city') { for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; const v = new THREE.Mesh(GEO.box, T(i % 2 ? '#c8c0b4' : '#b0a89c')); v.scale.set(0.5, 0.16, 0.25); v.rotation.y = -a + Math.PI / 2; v.position.set(Math.cos(a) * 4.42, -0.24, -0.5 + Math.sin(a) * 4.42); S3.board.add(v); } }
  // 格子
  S3.tiles = [];
  // 格子：平常完全透明，只在拖曳／選取時淡淡浮現（像聯盟戰棋）
  if (!GEO.cellPlane) { GEO.cellPlane = new THREE.PlaneGeometry(1.1, 1.1); GEO.cellPlane.rotateX(-Math.PI / 2); }
  for (let vr = 0; vr < CFG.ROWS; vr++) for (let vc = 0; vc < CFG.COLS; vc++) {
    const m = new THREE.MeshBasicMaterial({ map: tex('cell'), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const t = new THREE.Mesh(GEO.cellPlane, m); t.renderOrder = 2;
    const [x, z] = cellWorld(vc, vr); t.position.set(x, 0.02, z);
    t.userData = { tile: true, vc, vr, op: 0 };
    S3.board.add(t); S3.tiles.push(t);
  }
  // 備戰席
  S3.bench = [];
  for (let i = 0; i < CFG.BENCH; i++) {
    const [x, z] = benchWorld(i);
    let pad;
    if (key === 'jungle') { pad = new THREE.Mesh(GEO.sph, new THREE.MeshToonMaterial({ color: '#5f8f3e', gradientMap: toonGrad(), emissive: 0 })); pad.scale.set(0.38, 0.05, 0.33); }
    else if (key === 'desert') { pad = new THREE.Mesh(GEO.box, new THREE.MeshToonMaterial({ color: i % 2 ? '#b8553a' : '#d0803e', gradientMap: toonGrad(), emissive: 0 })); pad.scale.set(0.7, 0.06, 0.62); }
    else { pad = new THREE.Mesh(GEO.cyl, new THREE.MeshToonMaterial({ color: '#6d6a70', gradientMap: toonGrad(), emissive: 0 })); pad.scale.set(0.35, 0.06, 0.35); }
    pad.position.set(x, -0.08, z); pad.userData = { benchPad: true, i, base: pad.material.color.clone() };
    S3.board.add(pad); S3.bench.push(pad);
  }
  mergeStatic(S3.arena); mergeStatic(S3.board);
  S3.terrainKey = '';
}

// 場地裝飾（避開棋盤區）
const ARENA_DECO = {
  jungle(g, r) {
    // 後方河流
    const river = new THREE.Mesh(new THREE.PlaneGeometry(40, 2.4), T('#6fa3b8')); river.rotation.x = -Math.PI / 2; river.position.set(0, -0.3, -7.6); g.add(river);
    for (let i = 0; i < 14; i++) { const s = new THREE.Mesh(GEO.sph, MB(0xbfe0ea, 0.6)); s.scale.set(0.5 + r(), 0.01, 0.05); s.position.set(-16 + i * 2.4 + r(), -0.27, -7.6 + (r() - 0.5) * 1.6); g.add(s); S3.ambient.push({ o: s, k: 'flow', sp: 0.6 + r() * 0.4 }); }
    const tree = (x, z, s) => { const t = new THREE.Group(); t.position.set(x, -0.3, z); t.scale.setScalar(s);
      const tr = new THREE.Mesh(GEO.cyl, T('#6e4a30')); tr.scale.set(0.22, 2.4, 0.22); tr.position.y = 1.2; t.add(tr);
      for (const [cx, cy, cz, cr, col] of [[0, 2.7, 0, 1.2, '#4f7a35'], [0.7, 2.3, 0.3, 0.9, '#5f8f3e'], [-0.7, 2.4, 0.2, 0.95, '#6b9a45'], [0.1, 3.3, -0.2, 0.8, '#7fae55']]) { const c = new THREE.Mesh(GEO.sph, T(col)); c.scale.setScalar(cr); c.position.set(cx, cy, cz); t.add(c); }
      g.add(t); S3.ambient.push({ o: t, k: 'sway', ph: r() * 6 }); };
    for (const [x, z, s] of [[-6.5, -6, 1.3], [6.8, -5.5, 1.4], [-8.5, -1, 1.1], [8.6, -0.5, 1.2], [-5.6, -9.5, 1.6], [4.5, -10, 1.5], [0.5, -11, 1.8]]) tree(x, z, s);
    // 大葉子
    const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.bezierCurveTo(0.6, 0.3, 0.7, 1.1, 0, 1.6); leafShape.bezierCurveTo(-0.7, 1.1, -0.6, 0.3, 0, 0);
    const leafGeo = new THREE.ShapeGeometry(leafShape, 8);
    for (let i = 0; i < 16; i++) { const side = i % 2 ? 1 : -1; const l = new THREE.Mesh(leafGeo, T(i % 3 ? '#5f8f3e' : '#7fae55')); l.material.side = THREE.DoubleSide;
      l.position.set(side * (4.4 + r() * 2.5), -0.25, -5 + r() * 11); l.rotation.set(-1.0 - r() * 0.5, r() * 6, 0); l.scale.setScalar(0.8 + r() * 0.8); g.add(l); S3.ambient.push({ o: l, k: 'leaf', ph: r() * 6 }); }
    // 花
    for (let i = 0; i < 14; i++) { const f = new THREE.Mesh(GEO.sph, T(['#f29bb0', '#f2c14e', '#ffffff'][i % 3])); f.scale.setScalar(0.09); const side = i % 2 ? 1 : -1; f.position.set(side * (4.1 + r() * 3), -0.2, -4 + r() * 9); g.add(f); }
    // 螢火蟲
    for (let i = 0; i < 14; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('puff'), color: 0xfff3a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(0.25); sp.position.set((r() - 0.5) * 14, 0.6 + r() * 2, -6 + r() * 10); g.add(sp); S3.ambient.push({ o: sp, k: 'firefly', ph: r() * 6, base: sp.position.clone() }); }
  },
  desert(g, r) {
    for (let i = 0; i < 9; i++) { const d = new THREE.Mesh(GEO.sph, T(i % 2 ? '#d9a865' : '#e8c48a')); d.scale.set(5 + r() * 4, 0.5 + r() * 0.7, 3 + r() * 2); d.position.set(-16 + i * 4, -0.5, -12 - r() * 4); g.add(d); }
    for (const [x, z] of [[-10, -3], [10.5, -2], [-11, 3], [11, 4]]) { const d = new THREE.Mesh(GEO.sph, T('#e6c086')); d.scale.set(3.5, 0.35, 4.5); d.position.set(x, -0.35, z); g.add(d); }
    // 平頂山
    for (const [x, z, h] of [[-7, -15, 3], [8, -16, 4], [0, -19, 2.5]]) { for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(GEO.cyl, T(['#c46a3e', '#d98a52', '#b85a34'][k])); m.scale.set(3.4 - k * 0.5, h / 3, 2.6 - k * 0.4); m.position.set(x, -0.3 + h / 6 + k * h / 3, z); g.add(m); } }
    // 仙人掌
    const cactus = (x, z, s) => { const c = new THREE.Group(); c.position.set(x, -0.3, z); c.scale.setScalar(s); const mt = T('#6f9a5a');
      const tr = new THREE.Mesh(GEO.cap, mt); tr.scale.set(0.42, 1.5, 0.42); tr.position.y = 1.0; c.add(tr);
      for (const sd of [-1, 1]) { const a = new THREE.Mesh(GEO.cap, mt); a.scale.set(0.26, 0.6, 0.26); a.position.set(sd * 0.35, 1.2 + (sd > 0 ? 0.3 : 0), 0); c.add(a); const b = new THREE.Mesh(GEO.cap, mt); b.scale.set(0.24, 0.3, 0.24); b.rotation.z = sd * 1.4; b.position.set(sd * 0.22, 0.9 + (sd > 0 ? 0.3 : 0), 0); c.add(b); }
      const fl = new THREE.Mesh(GEO.sph, T('#f29bb0')); fl.scale.setScalar(0.12); fl.position.y = 1.95; c.add(fl); g.add(c); };
    for (const [x, z, s] of [[-5.6, -6, 1.2], [6, -7, 1.4], [-7.5, 1, 1], [7.2, 2.5, 0.9], [-4.8, 6.4, 0.7], [5.4, 6.2, 0.8]]) cactus(x, z, s);
    for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(GEO.sph, T('#6f9a5a')); b.scale.setScalar(0.25 + r() * 0.15); const side = i % 2 ? 1 : -1; b.position.set(side * (4.3 + r() * 3), -0.15, -5 + r() * 11); g.add(b); }
    for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(GEO.box, T(['#c98a5a', '#b87a4c', '#d9a070'][i % 3])); s.rotation.y = r() * 3; s.scale.set(0.3 + r() * 0.4, 0.18 + r() * 0.25, 0.3 + r() * 0.3); const side = i % 2 ? 1 : -1; s.position.set(side * (4.2 + r() * 4), -0.2, -6 + r() * 12); g.add(s); }
    // 風滾草
    const tw = new THREE.Group(); for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(GEO.torus, T('#a8804e')); t.scale.setScalar(0.35); t.rotation.set(r() * 3, r() * 3, 0); tw.add(t); } tw.position.set(-12, 0.05, 5.6); g.add(tw); S3.ambient.push({ o: tw, k: 'tumble' });
    // 風沙
    for (let i = 0; i < 18; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('puff'), color: 0xf4dcae, transparent: true, opacity: 0.35, depthWrite: false })); sp.scale.setScalar(0.5); sp.position.set((r() - 0.5) * 20, 0.2 + r() * 1.2, -6 + r() * 12); g.add(sp); S3.ambient.push({ o: sp, k: 'sand', sp: 1 + r() }); }
  },
  city(g, r) {
    // 馬路與人行道
    const road = new THREE.Mesh(new THREE.PlaneGeometry(40, 3), T('#4a4950')); road.rotation.x = -Math.PI / 2; road.position.set(0, -0.29, -7.2); g.add(road);
    for (let i = 0; i < 12; i++) { const l = new THREE.Mesh(GEO.box, MB(0xf2c14e)); l.scale.set(1.1, 0.01, 0.1); l.position.set(-18 + i * 3.4, -0.27, -7.2); g.add(l); }
    for (const z of [-5.5, -8.9]) { const sw = new THREE.Mesh(GEO.box, T('#b8b0a6')); sw.scale.set(40, 0.2, 0.9); sw.position.set(0, -0.25, z); g.add(sw); }
    for (let i = 0; i < 6; i++) { const cw = new THREE.Mesh(GEO.box, MB(0xf2efe8)); cw.scale.set(0.5, 0.01, 1.8); cw.position.set(-1.6 + i * 0.65, -0.27, 6.0); g.add(cw); }
    // 建築
    const winMat = MB(0xffd98a); S3.cityWin = winMat;
    for (let i = 0; i < 9; i++) {
      const w = 2.2 + r() * 1.6, h = 3 + r() * 5, x = -15 + i * 3.6 + r(), z = -11.5 - r() * 2;
      const b = new THREE.Mesh(GEO.box, T(['#b5654a', '#e3cfa8', '#5f8c8a', '#c98a5a', '#8a7aa8'][i % 5])); b.scale.set(w, h, 2.2); b.position.set(x, h / 2 - 0.3, z); g.add(b);
      const roof = new THREE.Mesh(GEO.box, T('#4a4550')); roof.scale.set(w + 0.2, 0.2, 2.4); roof.position.set(x, h - 0.2, z); g.add(roof);
      for (let yy = 1; yy < h - 0.6; yy += 0.9) for (let xx = -w / 2 + 0.45; xx < w / 2 - 0.2; xx += 0.6) { if (r() < 0.3) continue; const wi = new THREE.Mesh(GEO.box, winMat); wi.scale.set(0.3, 0.42, 0.02); wi.position.set(x + xx, yy - 0.3, z + 1.11); g.add(wi); }
    }
    // 路燈
    for (const [x, z] of [[-5, -5.4], [5, -5.4], [-5.2, 3.5], [5.2, 3.5]]) { const p = new THREE.Mesh(GEO.cyl, T('#3a3a42')); p.scale.set(0.06, 3, 0.06); p.position.set(x, 1.2, z); g.add(p); const hd = new THREE.Mesh(GEO.box, T('#3a3a42')); hd.scale.set(0.5, 0.08, 0.16); hd.position.set(x + (x < 0 ? 0.2 : -0.2), 2.7, z); g.add(hd); const bulb = new THREE.Mesh(GEO.sph, MB(0xfff0b0)); bulb.scale.set(0.14, 0.08, 0.1); bulb.position.set(x + (x < 0 ? 0.35 : -0.35), 2.62, z); g.add(bulb);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('puff'), color: 0xffe6a0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(1.4); glow.position.copy(bulb.position); g.add(glow); }
    // 三角錐、消防栓、長椅
    for (const [x, z] of [[-4.6, 5.4], [-4.2, 5.9], [4.5, -4.9]]) { const c = new THREE.Mesh(GEO.cone, T('#f07a2c')); c.scale.set(0.2, 0.5, 0.2); c.position.set(x, -0.05, z); g.add(c); const s = new THREE.Mesh(GEO.cyl, MB(0xffffff)); s.scale.set(0.13, 0.08, 0.13); s.position.set(x, 0.0, z); g.add(s); }
    const hy = new THREE.Group(); hy.position.set(4.6, -0.3, 5.2); const hb = new THREE.Mesh(GEO.cap, T('#c8433a')); hb.scale.set(0.28, 0.5, 0.28); hb.position.y = 0.42; hy.add(hb); const hc = new THREE.Mesh(GEO.cyl, T('#c8433a')); hc.scale.set(0.3, 0.12, 0.12); hc.rotation.z = Math.PI / 2; hc.position.y = 0.45; hy.add(hc); g.add(hy);
    for (const sd of [-1, 1]) { const tree = new THREE.Group(); tree.position.set(sd * 6.2, -0.3, -2); const pl = new THREE.Mesh(GEO.box, T('#8a8580')); pl.scale.set(0.9, 0.4, 0.9); pl.position.y = 0.2; tree.add(pl); const tr = new THREE.Mesh(GEO.cyl, T('#6e4a30')); tr.scale.set(0.1, 1.4, 0.1); tr.position.y = 1; tree.add(tr); const cn = new THREE.Mesh(GEO.sph, T('#5f8f3e')); cn.scale.setScalar(0.8); cn.position.y = 2; tree.add(cn); g.add(tree); S3.ambient.push({ o: tree, k: 'sway', ph: sd }); }
    // 鴿子
    for (let i = 0; i < 3; i++) { const p = new THREE.Group(); const b = new THREE.Mesh(GEO.sph, T('#9a98a8')); b.scale.set(0.14, 0.12, 0.2); p.add(b); const h = new THREE.Mesh(GEO.sph, T('#7f7d90')); h.scale.setScalar(0.08); h.position.set(0, 0.1, 0.12); p.add(h); p.position.set(-6 + i * 0.5, -0.15, 5 + i * 0.3); g.add(p); S3.ambient.push({ o: p, k: 'peck', ph: i * 2 }); }
  },
};

// ---- 靜態物件合併（降低繪製次數，手機才跑得動）----
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const skip = new Set(S3.ambient.map(a => a.o));
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = {}, kill = [];
  root.traverse(o => {
    if (!o.isMesh || o.userData.tile || o.userData.benchPad || o.userData.noMerge) return;
    for (let p = o; p && p !== root; p = p.parent) if (skip.has(p)) return;
    const m = o.material; if (m.map || m.transparent || m.side === THREE.DoubleSide) return;
    const key = m.type + m.color.getHexString();
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    (buckets[key] = buckets[key] || { m, gs: [] }).gs.push(g); kill.push(o);
  });
  for (const o of kill) o.parent.remove(o);
  for (const k in buckets) {
    const { m, gs } = buckets[k]; let n = 0; for (const g of gs) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let off = 0;
    for (const g of gs) { pos.set(g.attributes.position.array, off * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, off * 3); off += g.attributes.position.count; g.dispose(); }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    root.add(new THREE.Mesh(mg, m));
  }
}

// ---- 地形道具（依場地換造型）----
function terrainProp(arena, type, r) {
  const g = new THREE.Group();
  const add = (geo, mat, p, s, rot) => { const m = mesh(geo, mat, p, s, rot); g.add(m); return m; };
  if (type === 'water') {
    const wcol = arena === 'city' ? '#7d93a3' : '#6fa3c8';
    if (arena === 'desert') add(GEO.cyl, T('#e8c48a'), [0, 0.0, 0], [0.47, 0.03, 0.47]);
    const w = add(GEO.cyl, new THREE.MeshToonMaterial({ color: wcol, gradientMap: toonGrad(), transparent: true, opacity: 0.92 }), [0, 0.02, 0], [arena === 'city' ? 0.36 : 0.42, 0.02, arena === 'city' ? 0.3 : 0.42]);
    S3.ambient.push({ o: w, k: 'water', ph: r() * 6 });
    add(GEO.sph, MB(0xd6eef7, 0.7), [-0.12, 0.04, -0.06], [0.14, 0.005, 0.04]);
    if (arena === 'jungle') { add(GEO.cyl, T('#5f8f3e'), [0.15, 0.045, 0.12], [0.13, 0.01, 0.13]); add(GEO.sph, T('#f29bb0'), [0.16, 0.08, 0.12], 0.04); }
    if (arena === 'city') add(GEO.cyl, T('#4a4950'), [0.18, 0.04, -0.12], [0.12, 0.01, 0.12]);
  } else if (type === 'grass') {
    if (arena === 'jungle') for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; add(GEO.sph, T(i % 2 ? '#5f8f3e' : '#7fae55'), [Math.cos(a) * 0.17, 0.16, Math.sin(a) * 0.17], [0.05, 0.22, 0.09], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]); }
    else if (arena === 'desert') { for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; add(GEO.cone, T('#b89458'), [Math.cos(a) * 0.12, 0.12, Math.sin(a) * 0.12], [0.03, 0.28, 0.03], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]); } add(GEO.sph, T('#c9a66a'), [0, 0.08, 0], [0.16, 0.1, 0.16]); }
    else { add(GEO.box, T('#8a8580'), [0, 0.07, 0], [0.7, 0.14, 0.7]); add(GEO.sph, T('#5f8f3e'), [0, 0.24, 0], [0.32, 0.18, 0.32]); add(GEO.sph, T('#f2c14e'), [0.12, 0.38, 0.1], 0.04); }
  } else if (type === 'tree') {
    if (arena === 'desert') { let y = 0; for (let i = 0; i < 5; i++) { add(GEO.cyl, T(i % 2 ? '#9a6a42' : '#b07a4c'), [i * 0.03, y + 0.11, 0], [0.07 - i * 0.004, 0.2, 0.07 - i * 0.004]); y += 0.2; } for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(GEO.sph, T(i % 2 ? '#5f8f3e' : '#7fae55'), [0.15 + Math.cos(a) * 0.3, y + 0.02, Math.sin(a) * 0.3], [0.32, 0.04, 0.1], [0, -a, -0.45]); } }
    else if (arena === 'city') { add(GEO.box, T('#8a8580'), [0, 0.1, 0], [0.5, 0.2, 0.5]); add(GEO.cyl, T('#6e4a30'), [0, 0.5, 0], [0.05, 0.7, 0.05]); add(GEO.sph, T('#5f8f3e'), [0, 1.0, 0], 0.33); add(GEO.sph, T('#7fae55'), [-0.1, 1.12, 0.1], 0.18); }
    else { add(GEO.cyl, T('#6e4a30'), [0, 0.35, 0], [0.07, 0.7, 0.07]); add(GEO.sph, T('#4f7a35'), [0, 0.85, 0], 0.36); add(GEO.sph, T('#6b9a45'), [0.18, 0.78, 0.1], 0.24); add(GEO.sph, T('#7fae55'), [-0.12, 1.05, 0.05], 0.2); }
    S3.ambient.push({ o: g, k: 'sway', ph: r() * 6, small: true });
  } else if (type === 'rock') {
    if (arena === 'desert') { add(GEO.box, T('#c98a5a'), [0, 0.12, 0], [0.75, 0.25, 0.65], [0, 0.2, 0]); add(GEO.box, T('#d9a070'), [0.05, 0.34, 0], [0.55, 0.2, 0.5], [0, -0.1, 0]); add(GEO.box, T('#b87a4c'), [-0.03, 0.5, 0.02], [0.35, 0.14, 0.3], [0, 0.3, 0]); }
    else if (arena === 'city') { add(GEO.box, T('#d8d2c8'), [0, 0.18, 0], [0.82, 0.36, 0.3]); for (let i = 0; i < 3; i++) add(GEO.box, MB(i % 2 ? 0xffffff : 0xd9483a), [-0.27 + i * 0.27, 0.22, 0.16], [0.26, 0.14, 0.01]); }
    else { add(GEO.sph, T('#8a8580'), [0, 0.2, 0], [0.4, 0.3, 0.36]); add(GEO.sph, T('#9d9890'), [0.18, 0.12, 0.15], [0.2, 0.16, 0.18]); add(GEO.sph, T('#6b9a45'), [-0.05, 0.42, -0.02], [0.28, 0.08, 0.24]); }
  } else if (type === 'bounce') {
    if (arena === 'jungle') { // 彈跳蘑菇：扁平大傘，站上去會被彈飛
      const cap = new THREE.Group(); g.add(cap);
      cap.add(mesh(GEO.cyl, T('#f2e6cf'), [0, 0.05, 0], [0.12, 0.1, 0.12]));
      cap.add(mesh(GEO.sph, T('#d9483a'), [0, 0.11, 0], [0.42, 0.07, 0.42]));
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; cap.add(mesh(GEO.sph, T('#fff3e0'), [Math.cos(a) * 0.26, 0.16, Math.sin(a) * 0.26], [0.06, 0.02, 0.06])); }
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + 1; add(GEO.sph, T('#e8a04a'), [Math.cos(a) * 0.42, 0.04, Math.sin(a) * 0.42], [0.06, 0.06, 0.06]); }
      S3.ambient.push({ o: cap, k: 'bob', ph: r() * 6 });
    } else if (arena === 'desert') { // 沙塵旋風
      add(GEO.cyl, T('#d9b07a'), [0, 0.005, 0], [0.44, 0.01, 0.44]);
      const sp = new THREE.Group(); g.add(sp);
      for (let i = 0; i < 4; i++) { const ring = mesh(GEO.torus, MB(0xf4dcae, 0.55 - i * 0.08), [0, 0.1 + i * 0.16, 0], [0.18 + i * 0.07, 0.18 + i * 0.07, 0.25], [Math.PI / 2, 0, 0]); ring.material.depthWrite = false; sp.add(ring); }
      S3.ambient.push({ o: sp, k: 'spin', ph: r() * 6 });
    } else { // 蒸氣人孔
      add(GEO.cyl, T('#3a3a42'), [0, 0.01, 0], [0.36, 0.02, 0.36]);
      add(GEO.cyl, T('#5a5a62'), [0, 0.025, 0], [0.3, 0.02, 0.3]);
      for (let i = -2; i <= 2; i++) add(GEO.box, T('#3a3a42'), [i * 0.1, 0.04, 0], [0.03, 0.01, 0.42]);
      S3.ambient.push({ o: g, k: 'steam', ph: r() * 6 });
    }
  } else if (type === 'burn') {
    if (arena === 'desert') { // 熔岩裂縫
      add(GEO.cyl, T('#5a3a30'), [0, 0.005, 0], [0.44, 0.01, 0.4]);
      for (let i = 0; i < 4; i++) add(GEO.box, MB(0xff7a2a), [(i - 1.5) * 0.12, 0.014, (i % 2 ? 0.08 : -0.06)], [0.05, 0.005, 0.5], [0, 0.4 + i * 0.5, 0]);
    } else if (arena === 'city') { // 燃燒油桶
      add(GEO.cyl, T('#4a4e58'), [0, 0.005, 0], [0.42, 0.01, 0.42]);
      add(GEO.cyl, T('#b0503a'), [0.3, 0.17, -0.28], [0.12, 0.34, 0.12]); add(GEO.cyl, T('#8a3a2a'), [0.3, 0.2, -0.28], [0.125, 0.04, 0.125]);
    } else { // 火焰蘭
      add(GEO.cyl, T('#6a4a30'), [0, 0.005, 0], [0.4, 0.01, 0.4]);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(GEO.cone, T('#e8603a'), [Math.cos(a) * 0.3, 0.08, Math.sin(a) * 0.3], [0.05, 0.14, 0.05]); }
    }
    const fl = new THREE.Group(); g.add(fl);
    for (let i = 0; i < 3; i++) { const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('flame'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); f.position.set((i - 1) * 0.2 + (arena === 'city' ? 0.3 : 0), arena === 'city' ? 0.45 : 0.15, (i % 2 ? 0.1 : -0.1) + (arena === 'city' ? -0.28 : 0)); f.scale.set(0.3, 0.42, 1); fl.add(f); }
    S3.ambient.push({ o: fl, k: 'flame', ph: r() * 6 });
  } else if (type === 'shadow') {
    const sh = add(GEO.cyl, MB(0x1a1024, 0.42), [0, 0.012, 0], [0.48, 0.01, 0.48]); sh.material.depthWrite = false;
    if (arena === 'jungle') { const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.bezierCurveTo(0.3, 0.15, 0.35, 0.55, 0, 0.8); leafShape.bezierCurveTo(-0.35, 0.55, -0.3, 0.15, 0, 0); const lg = new THREE.ShapeGeometry(leafShape, 6); for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(lg, T(i % 2 ? '#2f5a2a' : '#3f6e35')); l.material.side = THREE.DoubleSide; l.position.set(i < 2 ? -0.4 : 0.4, 0.02, (i % 2 ? 0.25 : -0.25)); l.rotation.set(-1.1, i < 2 ? -0.9 : 0.9, 0); l.scale.setScalar(0.65); g.add(l); } }
    else if (arena === 'desert') { add(GEO.box, T('#a8603a'), [-0.4, 0.3, 0], [0.12, 0.6, 0.7]); add(GEO.box, T('#b8703e'), [-0.25, 0.62, 0], [0.45, 0.1, 0.72], [0, 0, -0.15]); }
    else { add(GEO.box, T('#4a4550'), [-0.42, 0.3, 0], [0.08, 0.6, 0.8]); add(GEO.box, T('#8a6a48'), [-0.3, 0.1, -0.3], [0.18, 0.18, 0.18]); add(GEO.box, T('#7a5a3a'), [-0.3, 0.1, 0.25], [0.16, 0.2, 0.16], [0, 0.4, 0]); }
    const eyes = new THREE.Group(); g.add(eyes); for (const s of [-1, 1]) eyes.add(mesh(GEO.sph, MB(0xfff3a0, 0.85), [s * 0.05, 0.1, -0.2], [0.02, 0.012, 0.01]));
    S3.ambient.push({ o: eyes, k: 'blink', ph: r() * 6 });
  }
  return g;
}
function s3SetTerrain(terrain, vt, temp, height) {
  const key = S3.arenaKey + JSON.stringify(terrain) + vt + JSON.stringify((temp || []).map(z => [z.c, z.r])) + JSON.stringify(height || {});
  if (key === S3.terrainKey) return;
  S3.terrainKey = key;
  disposeGroup(S3.props); if (S3.groundMesh) { S3.scene.remove(S3.groundMesh); S3.groundMesh.geometry.dispose(); }
  S3.ambient = S3.ambient.filter(a => !a.prop);
  S3.props = new THREE.Group(); S3.scene.add(S3.props);
  const r = rnd(7), all = Object.assign({}, terrain);
  for (const z of temp || []) for (let rr = 0; rr < CFG.ROWS; rr++) for (let c = 0; c < CFG.COLS; c++) if (hexD(z.c, z.r, c, rr) <= 1 && all[rr * CFG.COLS + c] !== 'rock') all[rr * CFG.COLS + c] = z.type;
  // 高度場：高台與水窪（視角座標）
  S3.hcells = []; S3.wcells = [];
  for (const k in height || {}) if (height[k]) { const c = +k % CFG.COLS, rr = Math.floor(+k / CFG.COLS), [vc, vr] = vview(c, rr, vt); S3.hcells.push(cellWorld(vc, vr)); }
  for (const k in all) if (all[k] === 'water') { const c = +k % CFG.COLS, rr = Math.floor(+k / CFG.COLS), [vc, vr] = vview(c, rr, vt); S3.wcells.push(cellWorld(vc, vr)); }
  S3.groundMesh = buildGround(S3.arenaKey); S3.scene.add(S3.groundMesh);
  for (const t of S3.tiles) t.position.y = groundH(t.position.x, t.position.z) + 0.025;
  const before = S3.ambient.length;
  const occupied = {};
  for (const k in all) {
    const c = +k % CFG.COLS, rr = Math.floor(+k / CFG.COLS), [vc, vr] = vview(c, rr, vt), [x, z] = cellWorld(vc, vr);
    occupied[vc + ',' + vr] = 1;
    const p = terrainProp(S3.arenaKey, all[k], r); p.position.set(x, groundH(x, z), z); S3.props.add(p);
  }
  for (const [x, z] of S3.hcells) S3.props.add(hillDeco(S3.arenaKey, x, z, r));
  groundDeco(S3.arenaKey, S3.props, occupied, rnd(31 + S3.arenaKey.length));
  for (let i = before; i < S3.ambient.length; i++) S3.ambient[i].prop = true;
  mergeStatic(S3.props);
}
// ---- 高度：高台（含斜坡）與水窪 ----
const HILL_H = 0.42;
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function groundH(x, z) {
  let h = 0, w = 0;
  for (const [cx, cz] of S3.hcells || []) { const ax = Math.abs(x - cx), az = Math.abs(z - cz), d = Math.max(ax, ax * 0.5 + az * 0.866) - 0.5; if (d < 0.3) h = Math.max(h, HILL_H * (1 - sstep(0, 0.3, Math.max(0, d)))); } // 六角形高台，邊緣 0.3 斜坡
  for (const [cx, cz] of S3.wcells || []) { const d = Math.hypot(x - cx, z - cz); if (d < 0.5) w = Math.min(w, -0.1 * (1 - sstep(0.22, 0.5, d))); }
  return h + w;
}
// 水窪水面高度（影子和選取圈要畫在水面上，不然會跟半透明的水互相遮擋閃爍）
function waterTop(x, z) { for (const [cx, cz] of S3.wcells || []) if (Math.hypot(x - cx, z - cz) < 0.45) return -0.06; return -9; }
function vnoise(x, z) { // 簡單平滑雜訊 0..1
  const h = (i, j) => { let n = Math.imul(i * 374761393 + j * 668265263, 1274126177); n ^= n >>> 13; return ((n >>> 0) % 1000) / 1000; };
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}
function buildGround(key) {
  const L = ARENA_LOOK[key], W = 9.6 + BOARD_GROW_X * 2, D = 10.6 + BOARD_GROW_Z * 2, geo = new THREE.PlaneGeometry(W, D, Math.round(W * 10), Math.round(D * 10)); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, n = pos.count, cols = new Float32Array(n * 3), edge = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i) - 0.5; pos.setZ(i, z);
    const u = Math.abs(x) / (4.2 + BOARD_GROW_X), w = Math.abs(z + 0.5) / (4.2 + BOARD_GROW_Z), d = Math.pow(Math.pow(u, 5) + Math.pow(w, 5), 0.2) + (vnoise(x * 1.7 + 9, z * 1.7) - 0.5) * 0.05;
    edge[i] = d;
    let y = groundH(x, z);
    if (d > 0.985) y = -0.12 - (d - 0.985) * 9; // 島邊緣往下收
    pos.setY(i, Math.max(-0.42, y));
  }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal, b0 = new THREE.Color(L.board[0]), b1 = new THREE.Color(L.board[1]), b2 = new THREE.Color(L.board[2]), cliff = new THREE.Color(L.cliff), top = new THREE.Color(L.top), rim = new THREE.Color(L.rim), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const n1 = vnoise(x * 1.1, z * 1.1), n2 = vnoise(x * 3.3 + 40, z * 3.3);
    c.copy(b0).lerp(b1, sstep(0.35, 0.75, n1)).lerp(b2, sstep(0.55, 0.9, n2) * 0.7);
    c.offsetHSL(0, 0, (sstep(-0.9, -0.1, z) - 0.5) * 0.035); // 我方半場略亮，不畫中線
    if (y > 0.05) c.lerp(top, Math.min(1, y / HILL_H) * 0.75);
    if (y < -0.03 && edge[i] < 0.98) c.lerp(new THREE.Color('#5e8ea8'), 0.35);
    const ny = nor.getY(i); if (ny < 0.8 && edge[i] < 0.98) c.lerp(cliff, sstep(0.8, 0.45, ny));
    if (edge[i] > 0.94) c.lerp(rim, sstep(0.94, 1.0, edge[i]));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGrad() }));
  m.userData.noMerge = true; return m;
}
// 高台頂部點綴（只在高台格中心附近，不擋棋子）
function hillDeco(key, x, z, r) {
  const g = new THREE.Group(), y = groundH(x, z);
  if (key === 'jungle') { for (let i = 0; i < 3; i++) { const a = r() * 6.28; g.add(mesh(GEO.sph, T(i % 2 ? '#5f8f3e' : '#7fae55'), [x + Math.cos(a) * 0.38, y + 0.03, z + Math.sin(a) * 0.38], [0.1, 0.05, 0.1])); } }
  else if (key === 'desert') { for (let i = 0; i < 2; i++) { const a = r() * 6.28; g.add(mesh(GEO.box, T('#b8653a'), [x + Math.cos(a) * 0.4, y + 0.04, z + Math.sin(a) * 0.4], [0.12, 0.08, 0.1], [0, r() * 3, 0])); } }
  else { for (const s of [-1, 1]) g.add(mesh(GEO.box, T('#d8d0c4'), [x + s * 0.42, y + 0.03, z], [0.06, 0.06, 0.8])); }
  return g;
}
// 地面零碎點綴：草叢、碎石、磁磚，避開有地形的格子並偏離格心
function groundDeco(key, root, occupied, r) {
  for (let vr = 0; vr < CFG.ROWS; vr++) for (let vc = 0; vc < CFG.COLS; vc++) {
    if (occupied[vc + ',' + vr]) continue;
    const [cx, cz] = cellWorld(vc, vr), k = 1 + Math.floor(r() * 2);
    for (let i = 0; i < k; i++) {
      const a = r() * 6.28, rad = 0.32 + r() * 0.14, x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad, y = groundH(x, z);
      if (key === 'jungle') { const t = r(); if (t < 0.6) for (let j = 0; j < 3; j++) root.add(mesh(GEO.cone, T(j % 2 ? '#5f8f3e' : '#79a84e'), [x + (j - 1) * 0.04, y + 0.05, z], [0.02, 0.12, 0.02], [0, 0, (j - 1) * 0.35])); else root.add(mesh(GEO.sph, T(['#f29bb0', '#ffffff', '#f2c14e'][Math.floor(r() * 3)]), [x, y + 0.03, z], 0.035)); }
      else if (key === 'desert') { const t = r(); if (t < 0.6) root.add(mesh(GEO.sph, T(['#c9a070', '#b08a5e', '#d9b88a'][Math.floor(r() * 3)]), [x, y + 0.01, z], [0.05 + r() * 0.05, 0.03, 0.05 + r() * 0.04])); else root.add(mesh(GEO.box, T('#d4b07c'), [x, y + 0.004, z], [0.3, 0.008, 0.03], [0, r() * 3, 0])); }
      else { const t = r(); if (t < 0.5) root.add(mesh(GEO.box, T(['#b3ada2', '#9d978e'][Math.floor(r() * 2)]), [x, y + 0.005, z], [0.18 + r() * 0.1, 0.01, 0.14 + r() * 0.08], [0, r() * 0.4, 0])); else if (t < 0.75) root.add(mesh(GEO.cone, T('#6f9a5a'), [x, y + 0.04, z], [0.025, 0.08, 0.025])); }
    }
  }
}
