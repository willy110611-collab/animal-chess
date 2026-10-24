// ===== 音效與配樂：全部用 WebAudio 即時合成，不載入任何音檔 =====
const AUD = { ctx: null, master: null, sfxG: null, musG: null, last: {}, music: null, set: { sfx: 0.8, mus: 0.45, mute: false } };
try { const s = JSON.parse(localStorage.getItem('zoo_audio') || 'null'); if (s) Object.assign(AUD.set, s); } catch (e) {}
function audSave() { try { localStorage.setItem('zoo_audio', JSON.stringify(AUD.set)); } catch (e) {} }
function audInit() {
  if (AUD.ctx) { if (AUD.ctx.state === 'suspended') AUD.ctx.resume(); return; }
  try {
    const C = new (window.AudioContext || window.webkitAudioContext)();
    AUD.ctx = C; AUD.master = C.createGain(); AUD.master.connect(C.destination);
    AUD.sfxG = C.createGain(); AUD.sfxG.connect(AUD.master); AUD.musG = C.createGain(); AUD.musG.connect(AUD.master);
    const comp = C.createDynamicsCompressor(); AUD.master.disconnect(); AUD.master.connect(comp); comp.connect(C.destination);
    audApply();
    const nb = C.createBuffer(1, C.sampleRate, C.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; AUD.noise = nb;
  } catch (e) { AUD.ctx = null; }
}
function audApply() { if (!AUD.ctx) return; AUD.master.gain.value = AUD.set.mute ? 0 : 1; AUD.sfxG.gain.value = AUD.set.sfx; AUD.musG.gain.value = AUD.set.mus * 0.6; }
// ---- 基本音源 ----
function tone(freq, dur, o) {
  const C = AUD.ctx; if (!C) return;
  o = o || {}; const t = C.currentTime + (o.at || 0);
  const osc = C.createOscillator(), g = C.createGain();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
  if (o.det) osc.detune.value = o.det;
  const v = o.vol === undefined ? 0.3 : o.vol;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.att || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc;
  if (o.lp) { const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
  node.connect(g); g.connect(o.bus || AUD.sfxG); osc.start(t); osc.stop(t + dur + 0.02);
}
function noise(dur, o) {
  const C = AUD.ctx; if (!C || !AUD.noise) return;
  o = o || {}; const t = C.currentTime + (o.at || 0);
  const src = C.createBufferSource(); src.buffer = AUD.noise; src.playbackRate.value = o.rate || 1;
  const f = C.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 1200, t); if (o.fto) f.frequency.exponentialRampToValueAtTime(o.fto, t + dur); f.Q.value = o.q || 1;
  const g = C.createGain(), v = o.vol === undefined ? 0.25 : o.vol;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.att || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(o.bus || AUD.sfxG); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}
// ---- 音效表 ----
const SFX = {
  click: () => tone(880, 0.05, { vol: 0.12 }),
  buy: () => { tone(988, 0.08, { type: 'triangle', vol: 0.25 }); tone(1319, 0.16, { type: 'triangle', vol: 0.25, at: 0.06 }); },
  sell: () => { for (let i = 0; i < 3; i++) tone(1400 - i * 180, 0.07, { type: 'triangle', vol: 0.18, at: i * 0.05 }); },
  reroll: () => { noise(0.22, { f: 600, fto: 3000, q: 2, vol: 0.18 }); for (let i = 0; i < 5; i++) tone(500 + i * 120, 0.03, { vol: 0.06, at: 0.03 * i }); },
  level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.22, at: i * 0.07 })),
  star: () => { [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.16, at: i * 0.06 })); noise(0.5, { f: 6000, q: 0.5, vol: 0.08, at: 0.1 }); },
  aug: () => { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.9, { type: 'sine', vol: 0.12, at: i * 0.03, det: i * 6 })); noise(0.8, { f: 4000, q: 0.4, vol: 0.05 }); },
  place: () => tone(160, 0.12, { to: 70, vol: 0.3 }),
  error: () => tone(140, 0.14, { type: 'square', vol: 0.08, lp: 900 }),
  claw: () => { noise(0.09, { f: 3500, fto: 1200, q: 1.5, vol: 0.22 }); },
  bite: () => { tone(220, 0.05, { type: 'square', vol: 0.1, lp: 1200 }); tone(180, 0.05, { type: 'square', vol: 0.1, lp: 1200, at: 0.05 }); },
  thud: () => { tone(110, 0.12, { to: 60, vol: 0.35 }); noise(0.06, { f: 800, vol: 0.12 }); },
  pew: () => tone(900, 0.12, { to: 300, type: 'triangle', vol: 0.12 }),
  magic: () => { tone(660, 0.25, { vol: 0.12 }); tone(990, 0.25, { vol: 0.08, at: 0.03 }); },
  crit: () => { noise(0.1, { f: 2500, q: 0.8, vol: 0.3 }); tone(90, 0.18, { to: 45, vol: 0.4 }); },
  skill: () => { noise(0.3, { f: 400, fto: 4000, q: 1.2, vol: 0.15 }); tone(1047, 0.3, { vol: 0.1, at: 0.15 }); },
  death: () => noise(0.3, { ft: 'lowpass', f: 1500, fto: 200, vol: 0.25 }),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i === 4 ? 0.6 : 0.18, { type: 'triangle', vol: 0.2, at: i * 0.11 })),
  lose: () => [392, 311, 262, 196].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.18, at: i * 0.16 })),
  round: () => { tone(110, 1.4, { vol: 0.25, att: 0.01 }); tone(220, 1.2, { vol: 0.1 }); tone(331, 1.0, { vol: 0.06 }); },
  combo: () => { [262, 330, 392, 523].forEach(f => tone(f, 0.7, { type: 'sawtooth', vol: 0.06, lp: 2000 })); tone(70, 0.5, { to: 35, vol: 0.45 }); },
  boom: () => { tone(70, 0.6, { to: 30, vol: 0.5 }); noise(0.5, { ft: 'lowpass', f: 600, fto: 80, vol: 0.4 }); },
  roar: () => { tone(110, 0.5, { type: 'sawtooth', to: 80, vol: 0.18, lp: 700 }); noise(0.4, { f: 300, q: 0.7, vol: 0.15 }); },
  howl: () => { tone(420, 0.8, { to: 680, vol: 0.12, att: 0.1 }); tone(680, 0.5, { to: 520, vol: 0.1, at: 0.6 }); },
  cmd: () => { tone(294, 0.18, { type: 'sawtooth', vol: 0.1, lp: 1600 }); tone(392, 0.35, { type: 'sawtooth', vol: 0.1, lp: 1600, at: 0.16 }); },
  coin: () => tone(1568, 0.1, { type: 'triangle', vol: 0.15 }),
  splash: () => noise(0.3, { f: 1500, fto: 400, q: 0.6, vol: 0.2 }),
  zap: () => { noise(0.15, { f: 5000, q: 3, vol: 0.2 }); tone(1200, 0.1, { to: 200, type: 'square', vol: 0.06 }); },
  ping: () => { tone(1320, 0.12, { vol: 0.15 }); tone(1760, 0.18, { vol: 0.12, at: 0.08 }); },
  draft: () => [659, 784, 988].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.15, at: i * 0.05 })),
  // v0.12.7：更細的攻擊／技能音效
  whoosh: () => noise(0.18, { f: 700, fto: 2400, q: 0.9, vol: 0.14, att: 0.03 }),
  tok: () => { tone(820, 0.05, { type: 'triangle', to: 500, vol: 0.14 }); noise(0.03, { f: 3000, q: 2, vol: 0.06 }); },
  bloop: () => { tone(300, 0.12, { to: 700, vol: 0.12 }); tone(700, 0.08, { to: 420, vol: 0.06, at: 0.1 }); },
  hiss: () => noise(0.35, { ft: 'highpass', f: 3500, vol: 0.09, att: 0.05 }),
  crunch: () => { noise(0.06, { f: 1800, q: 1.2, vol: 0.2 }); noise(0.05, { f: 900, q: 1.2, vol: 0.15, at: 0.05 }); tone(160, 0.08, { type: 'square', to: 90, vol: 0.06, lp: 900 }); },
  slam: () => { tone(80, 0.25, { to: 40, vol: 0.45 }); noise(0.2, { ft: 'lowpass', f: 900, fto: 150, vol: 0.3 }); },
  chime: () => [1319, 1760, 2093].forEach((f, i) => tone(f, 0.35, { vol: 0.07, at: i * 0.04 })),
  sparkle: () => { for (let i = 0; i < 5; i++) tone(2000 + Math.random() * 1500, 0.08, { vol: 0.04, at: i * 0.04 }); },
  splashBig: () => { noise(0.5, { f: 1200, fto: 250, q: 0.5, vol: 0.28 }); tone(140, 0.3, { to: 60, vol: 0.2 }); },
  hitTick: () => noise(0.035, { f: 2400, q: 1.5, vol: 0.07 }),
  sting: () => { tone(2400, 0.05, { to: 3200, vol: 0.06 }); noise(0.04, { f: 5000, q: 2, vol: 0.05 }); },
};
// 每個攻擊／技能特效配的音效（沒列到的用預設）
const FX_SOUND = {
  bump: ['thud'], acorn: ['tok'], acornVolley: ['whoosh', 'tok'], bite: ['bite'], biteDrain: ['bite', 'sparkle'], bigBite: ['crunch', 'sparkle'], claw1: ['claw'], claw3: ['claw', 'whoosh'], claw3big: ['claw', 'thud'],
  tongue: ['bloop'], tongueGrab: ['bloop', 'whoosh'], howl: [], taunt: ['roar'], stinkBall: ['bloop'], gasSpray: ['hiss', 'bloop'], deathRoll: ['splashBig', 'crunch'], sting: ['sting'], swarm: ['sparkle', 'hiss'],
  slam: ['thud'], bodySlam: ['slam'], crossSlash: ['whoosh', 'claw'], inkBall: ['bloop'], inkCloud: ['bloop', 'splash'], feather: ['whoosh'], swoop: ['whoosh', 'claw'], trunkSlap: ['thud', 'whoosh'], stomp: ['boom'],
  roar: [], spikeBurst: ['crunch', 'sparkle'], flipper: ['splash'], slideHit: ['splashBig'], headbutt: ['thud'], rhinoCharge: ['slam', 'whoosh'], chamStrike: ['bloop', 'claw'], pounce: ['whoosh', 'claw'],
  talonShot: ['whoosh'], grabLift: ['whoosh', 'claw'], zap: ['zap'], chainZap: ['zap', 'sparkle'], fistSlam: ['thud'], chestBeat: ['slam', 'roar'], spout: ['splash'], tidal: ['splashBig'], fanOpen: ['chime', 'whoosh'], venomBite: ['crunch', 'hiss'],
};
function fxSound(fx, gap) { const L = FX_SOUND[fx]; if (!L) return false; L.forEach((n, i) => i ? setTimeout(() => sfx(n, gap), 60 * i) : sfx(n, gap)); return true; }
function sfx(name, minGap) {
  if (!AUD.ctx || AUD.set.mute) return;
  const now = performance.now(); if (now - (AUD.last[name] || 0) < (minGap || 45)) return; AUD.last[name] = now;
  try { (SFX[name] || SFX.click)(); } catch (e) {}
}
// ---- 動物叫聲（備戰時偶爾叫一兩聲用；全部即時合成）----
const VOICE = {
  hedgehog: () => { noise(0.05, { f: 4000, q: 2, vol: 0.08 }); noise(0.05, { f: 4200, q: 2, vol: 0.08, at: 0.09 }); tone(2400, 0.08, { to: 2900, vol: 0.06, at: 0.2 }); },
  squirrel: () => { for (let i = 0; i < 4; i++) tone(1900 + (i % 2) * 300, 0.04, { type: 'triangle', vol: 0.07, at: i * 0.055 }); },
  wolf: () => { tone(460, 0.55, { to: 700, vol: 0.08, att: 0.08 }); tone(700, 0.35, { to: 560, vol: 0.07, at: 0.45 }); },
  frog: () => { tone(240, 0.09, { type: 'square', to: 300, vol: 0.07, lp: 900 }); tone(260, 0.12, { type: 'square', to: 200, vol: 0.07, lp: 900, at: 0.13 }); },
  bat: () => { for (let i = 0; i < 3; i++) tone(3200 - i * 200, 0.035, { vol: 0.05, at: i * 0.07 }); },
  redpanda: () => { tone(1150, 0.1, { to: 1500, vol: 0.07 }); tone(1300, 0.12, { to: 1650, vol: 0.06, at: 0.14 }); },
  skunk: () => { noise(0.18, { ft: 'lowpass', f: 900, vol: 0.1 }); tone(140, 0.15, { type: 'sawtooth', to: 110, vol: 0.05, lp: 600, at: 0.08 }); },
  croc: () => { tone(80, 0.45, { type: 'sawtooth', to: 65, vol: 0.09, lp: 400 }); noise(0.35, { f: 2500, q: 0.6, vol: 0.05, at: 0.05 }); },
  bee: () => { tone(220, 0.5, { type: 'sawtooth', vol: 0.05, lp: 1600, det: 20 }); tone(226, 0.5, { type: 'sawtooth', vol: 0.04, lp: 1600 }); },
  koala: () => { tone(95, 0.35, { type: 'sawtooth', to: 75, vol: 0.08, lp: 500 }); tone(90, 0.3, { type: 'sawtooth', to: 70, vol: 0.07, lp: 500, at: 0.4 }); },
  cheetah: () => { tone(1500, 0.07, { to: 1850, vol: 0.07 }); tone(1500, 0.07, { to: 1850, vol: 0.06, at: 0.12 }); },
  octopus: () => { for (let i = 0; i < 3; i++) tone(500 + i * 220, 0.06, { to: 1100 + i * 220, vol: 0.06, at: i * 0.09 }); },
  owl: () => { tone(420, 0.22, { vol: 0.09, att: 0.04 }); tone(400, 0.3, { vol: 0.08, att: 0.04, at: 0.3 }); },
  elephant: () => { tone(380, 0.5, { type: 'sawtooth', to: 620, vol: 0.07, lp: 2400, att: 0.05 }); tone(760, 0.4, { type: 'sawtooth', to: 900, vol: 0.03, lp: 3000, at: 0.05 }); },
  lion: () => { tone(120, 0.5, { type: 'sawtooth', to: 85, vol: 0.09, lp: 700 }); noise(0.4, { f: 320, q: 0.7, vol: 0.07 }); },
  penguin: () => { for (let i = 0; i < 3; i++) tone(520 - i * 30, 0.1, { type: 'square', vol: 0.05, lp: 1700, at: i * 0.13 }); },
  rhino: () => { noise(0.2, { ft: 'lowpass', f: 600, fto: 200, vol: 0.12 }); tone(100, 0.2, { to: 70, vol: 0.08, at: 0.03 }); },
  chameleon: () => { tone(2100, 0.08, { to: 300, vol: 0.06 }); tone(300, 0.06, { to: 1800, vol: 0.05, at: 0.12 }); },
  fox: () => { tone(900, 0.08, { to: 1350, vol: 0.07 }); tone(950, 0.09, { to: 1400, vol: 0.06, at: 0.14 }); },
  eagle: () => { tone(1900, 0.4, { type: 'sawtooth', to: 1300, vol: 0.05, lp: 4200, att: 0.02 }); },
  eel: () => { noise(0.12, { f: 5000, q: 3, vol: 0.08 }); noise(0.08, { f: 6000, q: 3, vol: 0.06, at: 0.15 }); },
  gorilla: () => { for (let i = 0; i < 4; i++) tone(90, 0.07, { to: 60, vol: 0.14, at: i * 0.09 }); tone(330, 0.25, { to: 280, vol: 0.05, at: 0.42 }); },
  whale: () => { tone(300, 0.9, { to: 500, vol: 0.07, att: 0.2 }); tone(500, 0.6, { to: 260, vol: 0.06, at: 0.7 }); },
  peacock: () => { tone(900, 0.18, { type: 'triangle', to: 1400, vol: 0.07 }); tone(1400, 0.25, { type: 'triangle', to: 1000, vol: 0.06, at: 0.18 }); },
  komodo: () => { noise(0.4, { ft: 'highpass', f: 3000, vol: 0.06, att: 0.05 }); },
};
function voice(key) { if (!AUD.ctx || AUD.set.mute) return; try { (VOICE[key] || VOICE.squirrel)(); } catch (e) {} }
// ---- 配樂：依場地生成的循環 ----
const SONGS = {
  jungle: { bpm: 96, root: 60, scale: [0, 2, 4, 7, 9], lead: 'sine', bass: 'triangle', perc: 'shaker', chords: [[0, 4, 7], [9, 0, 4], [5, 9, 0], [7, 11, 2]] },
  desert: { bpm: 84, root: 62, scale: [0, 1, 4, 5, 7, 8, 10], lead: 'triangle', bass: 'sine', perc: 'tamb', drone: true, chords: [[0, 4, 7], [1, 5, 8], [0, 4, 7], [10, 2, 5]] },
  city: { bpm: 88, root: 57, scale: [0, 2, 3, 5, 7, 10], lead: 'triangle', bass: 'sine', perc: 'lofi', chords: [[5, 9, 0, 4], [4, 7, 11, 2], [2, 5, 9, 0], [0, 4, 7, 11]] },
};
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
function musicStart(arena) {
  if (!AUD.ctx) return;
  if (AUD.music && AUD.music.arena === arena) return;
  musicStop();
  const S = SONGS[arena] || SONGS.jungle, beat = 60 / S.bpm / 2; // 八分音符
  const M = { arena, step: 0, next: AUD.ctx.currentTime + 0.1, seed: 7, deg: 2 };
  const rnd = () => { M.seed = (M.seed * 16807) % 2147483647; return M.seed / 2147483647; };
  M.timer = setInterval(() => {
    const C = AUD.ctx; if (!C) return;
    while (M.next < C.currentTime + 0.25) {
      const st = M.step, bar = Math.floor(st / 8) % S.chords.length, ch = S.chords[bar], at = M.next - C.currentTime, b = { bus: AUD.musG };
      // 和弦／低音
      if (st % 8 === 0) { ch.forEach((n, i) => tone(midi(S.root - 12 + n), beat * 7.5, Object.assign({ type: 'sine', vol: 0.05, at, att: 0.05, det: i * 3 }, b))); tone(midi(S.root - 24 + ch[0]), beat * 3.5, Object.assign({ type: S.bass, vol: 0.12, at }, b)); }
      if (st % 8 === 4) tone(midi(S.root - 24 + ch[0] + 7), beat * 3, Object.assign({ type: S.bass, vol: 0.09, at }, b));
      if (S.drone && st % 32 === 0) tone(midi(S.root - 24), beat * 31, Object.assign({ type: 'sine', vol: 0.05, at, att: 0.4 }, b));
      // 旋律：音階上隨機走
      if (rnd() < (st % 2 ? 0.35 : 0.7)) { M.deg = Math.max(0, Math.min(S.scale.length * 2 - 1, M.deg + Math.round((rnd() - 0.5) * 3))); const n = S.root + S.scale[M.deg % S.scale.length] + 12 * Math.floor(M.deg / S.scale.length); tone(midi(n), beat * (S.lead === 'sine' ? 1.6 : 1.1), Object.assign({ type: S.lead, vol: 0.07, at }, b)); if (arena === 'jungle') tone(midi(n + 12), beat * 0.6, Object.assign({ type: 'sine', vol: 0.025, at }, b)); }
      // 打擊
      if (S.perc === 'shaker') noise(0.05, Object.assign({ f: 7000, q: 0.8, vol: st % 2 ? 0.03 : 0.05, at }, b));
      if (S.perc === 'tamb' && st % 2 === 1) noise(0.08, Object.assign({ f: 9000, q: 1.5, vol: 0.04, at }, b));
      if (S.perc === 'lofi') { if (st % 4 === 0) tone(90, 0.18, Object.assign({ to: 45, vol: 0.2, at }, b)); if (st % 8 === 4) noise(0.12, Object.assign({ f: 1800, q: 0.7, vol: 0.06, at }, b)); noise(0.03, Object.assign({ f: 8000, q: 1, vol: 0.02, at }, b)); }
      M.step++; M.next += beat;
    }
  }, 80);
  AUD.music = M;
}
function musicStop() { if (AUD.music) { clearInterval(AUD.music.timer); AUD.music = null; } }
