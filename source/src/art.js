// ===== SVG 動物：原創、暖色平塗、無黑描邊；腳底為 (0,0)，高約 64 =====
const INK = '#2e221d';
const el = (cx, cy, rx, ry, f, extra) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}"${extra ? ' ' + extra : ''}/>`;
const ci = (cx, cy, r, f, extra) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"${extra ? ' ' + extra : ''}/>`;
const pa = (d, f, extra) => `<path d="${d}" fill="${f}"${extra ? ' ' + extra : ''}/>`;
// 有體積感的球：深色底 + 左上偏移亮面（光從左上）
const ball = (cx, cy, rx, ry, col, sh) => el(cx, cy, rx, ry, sh) + el(cx - rx * 0.12, cy - ry * 0.08, rx * 0.88, ry * 0.9, col);
const eyes = (y, dx, r, sleep) => sleep
  ? pa(`M${-dx - r},${y} q${r},${r * 1.2} ${r * 2},0`, 'none', `stroke="${INK}" stroke-width="1.6" stroke-linecap="round"`) + pa(`M${dx - r},${y} q${r},${r * 1.2} ${r * 2},0`, 'none', `stroke="${INK}" stroke-width="1.6" stroke-linecap="round"`)
  : ci(-dx, y, r, INK) + ci(dx, y, r, INK);
const mouth = (y, w) => pa(`M${-w},${y} q${w / 2},${w * 0.7} ${w},0 q${w / 2},${w * 0.7} ${w},0`, 'none', `stroke="${INK}" stroke-width="1.3" stroke-linecap="round" opacity=".75"`);
const feet = (col, dx, y) => el(-dx, y || -2, 6, 3.6, col) + el(dx, y || -2, 6, 3.6, col);
const blush = (y, dx) => el(-dx, y, 3.2, 2, '#e98a7a', 'opacity=".45"') + el(dx, y, 3.2, 2, '#e98a7a', 'opacity=".45"');
function spikes(cx, cy, rx, ry, a0, a1, n, out, col) {
  let d = '';
  for (let i = 0; i <= n * 2; i++) {
    const a = (a0 + (a1 - a0) * i / (n * 2)) * Math.PI / 180, k = i % 2 ? out : 1;
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rx * k).toFixed(1) + ',' + (cy - Math.sin(a) * ry * k).toFixed(1);
  }
  return pa(d + 'Z', col);
}

const ART = {
  hedgehog() {
    return spikes(3, -14, 24, 20, -10, 190, 11, 1.2, '#4c5466') + el(3, -14, 22, 17, '#5d6779') + el(0, -16, 18, 13, '#6d778a') +
      el(-7, -11, 13, 11, '#ecd29a') + el(-16, -13, 7, 5, '#ecd29a') + ci(-22, -14, 2.2, INK) + ci(-11, -17, 2.1, INK) +
      el(-9, -11, 2.6, 1.5, '#e98a7a', 'opacity=".5"') + feet('#c9ad78', 8);
  },
  squirrel() {
    return el(15, -34, 12, 24, '#9e5428', 'transform="rotate(18 15 -34)"') + el(14, -38, 9, 19, '#c8743a', 'transform="rotate(18 14 -38)"') + el(17, -52, 6, 7, '#e9b27e', 'transform="rotate(18 17 -52)"') +
      ball(-2, -17, 15, 15, '#c8743a', '#a65d2c') + el(-3, -15, 9, 10, '#f3dcb5') +
      pa('M-15,-50 l3,-11 l6,9z', '#a65d2c') + pa('M6,-50 l3,-11 l-9,8z', '#a65d2c') +
      ball(-3, -40, 14, 13, '#c8743a', '#a65d2c') + el(-3, -35, 7, 5, '#f3dcb5') + eyes(-42, 6, 2.1) + ci(-3, -38, 1.6, INK) +
      el(-3, -21, 4.5, 4, '#b07a42') + el(-3, -25, 5, 2.4, '#7a4f28') + feet('#a65d2c', 7);
  },
  wolf() {
    return pa('M14,-10 q16,-4 14,-22 q-8,8 -16,10z', '#7b828c') +
      ball(0, -18, 17, 17, '#8e959e', '#737a84') + el(-1, -15, 10, 11, '#e9e3d6') +
      pa('M-15,-46 l2,-17 l10,12z', '#737a84') + pa('M15,-46 l-2,-17 l-10,12z', '#737a84') + pa('M-12,-48 l1,-9 l5,6z', '#d9a7a0') + pa('M12,-48 l-1,-9 l-5,6z', '#d9a7a0') +
      ball(0, -42, 16, 14, '#8e959e', '#737a84') + el(0, -35, 9, 7, '#e9e3d6') + eyes(-45, 6.5, 2.1) + el(0, -38, 3, 2.2, INK) + mouth(-34, 2.6) + feet('#737a84', 8);
  },
  frog() {
    return ball(0, -16, 23, 16, '#6fa35a', '#5a8a48') + el(0, -12, 15, 10, '#e3e7b0') +
      ci(-11, -33, 8, '#5a8a48') + ci(-12, -34, 7, '#6fa35a') + ci(11, -33, 8, '#5a8a48') + ci(10, -34, 7, '#6fa35a') +
      ci(-11, -34, 3, INK) + ci(11, -34, 3, INK) + el(0, -26, 17, 8, '#6fa35a') +
      pa('M-9,-24 q9,7 18,0', 'none', `stroke="${INK}" stroke-width="1.5" stroke-linecap="round"`) + blush(-24, 13) +
      el(-15, -2, 8, 3.5, '#5a8a48') + el(15, -2, 8, 3.5, '#5a8a48');
  },
  bat() {
    const wing = s => pa(`M${s * 8},-26 q${s * 16},-14 ${s * 30},-10 q${-s * 4},6 ${-s * 8},4 q${-s * 3},6 ${-s * 8},4 q${-s * 4},6 ${-s * 9},2 z`, '#3f3149');
    return wing(-1) + wing(1) + ball(0, -20, 13, 14, '#5b4766', '#4a3955') + el(0, -17, 7, 8, '#8a7393') +
      pa('M-12,-38 l1,-15 l9,10z', '#4a3955') + pa('M12,-38 l-1,-15 l-9,10z', '#4a3955') + pa('M-10,-40 l1,-8 l5,5z', '#c98fa0') + pa('M10,-40 l-1,-8 l-5,5z', '#c98fa0') +
      ball(0, -36, 12, 11, '#5b4766', '#4a3955') + eyes(-37, 5, 2) + pa('M-3,-31 l1.2,3 l1.2,-3z M1,-31 l1.2,3 l1.2,-3z', '#fff') + feet('#3f3149', 5, -4);
  },
  redpanda() {
    return el(16, -18, 8, 17, '#8e3824', 'transform="rotate(-30 16 -18)"') + pa('M10,-26 l12,-5 M13,-19 l11,-4 M16,-12 l9,-3', 'none', 'stroke="#e8c49a" stroke-width="3" transform="rotate(-8 16 -18)"') +
      ball(0, -18, 17, 17, '#a8442c', '#8e3824') + el(0, -14, 10, 11, '#4a2a22') +
      el(-12, -22, 4.5, 8, '#4a2a22') + el(12, -22, 4.5, 8, '#4a2a22') +
      pa('M-17,-46 l2,-13 l10,8z', '#8e3824') + pa('M17,-46 l-2,-13 l-10,8z', '#8e3824') + pa('M-14,-48 l1,-7 l6,5z', '#f4ead8') + pa('M14,-48 l-1,-7 l-6,5z', '#f4ead8') +
      ball(0, -41, 17, 14, '#a8442c', '#8e3824') + el(0, -35, 8, 6, '#f4ead8') + el(-8, -46, 4, 2.6, '#f4ead8') + el(8, -46, 4, 2.6, '#f4ead8') +
      eyes(-42, 6.5, 2.1) + el(0, -37.5, 2.6, 1.8, INK) + mouth(-34, 2) + feet('#4a2a22', 8);
  },
  skunk() {
    return pa('M8,-10 q24,-6 18,-44 q-4,-10 -12,-4 q8,24 -12,34z', '#2f2b33') + pa('M14,-14 q14,-10 10,-36 q-2,-4 -4,-1 q4,22 -9,33z', '#f2efe8') +
      ball(0, -18, 16, 16, '#2f2b33', '#211e25') + el(0, -15, 8, 10, '#4a4550') +
      ci(-11, -50, 5, '#211e25') + ci(11, -50, 5, '#211e25') + ball(0, -40, 15, 13, '#2f2b33', '#211e25') +
      pa('M-2.5,-53 q2.5,-2 5,0 l-1,14 h-3z', '#f2efe8') + el(0, -35, 6, 4.5, '#4a4550') +
      ci(-6, -41, 2.2, '#f2efe8') + ci(6, -41, 2.2, '#f2efe8') + ci(-6, -41, 1.3, INK) + ci(6, -41, 1.3, INK) + el(0, -36.5, 2.2, 1.6, '#e98a9a') + feet('#211e25', 7);
  },
  croc() {
    let bumps = ''; for (let i = 0; i < 4; i++) bumps += ci(9 + i * 1.5, -32 + i * 7, 3, '#4c7339');
    return bumps + ball(0, -17, 18, 17, '#5e8a4a', '#4c7339') + el(0, -13, 11, 12, '#d8d7a0') + pa('M-11,-18 h22 M-10,-12 h20 M-9,-6 h18', 'none', 'stroke="#c4c384" stroke-width="1.2"') +
      ball(0, -41, 15, 11, '#5e8a4a', '#4c7339') + el(0, -31, 13, 7, '#6e9a58') +
      pa('M-11,-28 l2,3 l2,-3 l2,3 l2,-3 l2,3 l2,-3 l2,3 l2,-3 l2,3 l2,-3', 'none', 'stroke="#fff" stroke-width="1.4" stroke-linejoin="round"') +
      ci(-7, -49, 4.5, '#5e8a4a') + ci(7, -49, 4.5, '#5e8a4a') + ci(-7, -50, 2, INK) + ci(7, -50, 2, INK) + ci(-3, -35, 1, INK) + ci(3, -35, 1, INK) + feet('#4c7339', 8);
  },
  bee(mini) {
    return el(-9, -36, 8, 11, '#dcebf2', 'opacity=".85" transform="rotate(-25 -9 -36)"') + el(9, -36, 8, 11, '#dcebf2', 'opacity=".85" transform="rotate(25 9 -36)"') +
      ball(0, -20, 16, 15, '#f2c14e', '#d9a53a') +
      pa('M-15,-22 q15,5 30,0 l-.5,5 q-14.5,5 -29,0z', '#3a2e28') + pa('M-12,-12 q12,5 24,0 l-2,4 q-10,4 -20,0z', '#3a2e28') +
      pa('M-5,-34 q-4,-10 -9,-12 M5,-34 q4,-10 9,-12', 'none', `stroke="${INK}" stroke-width="1.4" stroke-linecap="round"`) + ci(-14, -46, 2, INK) + ci(14, -46, 2, INK) +
      eyes(-27, 5, 1.9) + mouth(-24, 2) + blush(-24, 9) + pa('M-2,-5 l2,5 l2,-5z', INK);
  },
  koala(o) {
    const sl = o && o.sleep;
    return ball(0, -18, 18, 17, '#8f9fae', '#76879a') + el(0, -15, 11, 11, '#c9d1d8') +
      ci(-17, -50, 10, '#76879a') + ci(17, -50, 10, '#76879a') + ci(-17, -50, 6, '#ece6dc') + ci(17, -50, 6, '#ece6dc') +
      ball(0, -42, 19, 15, '#8f9fae', '#76879a') + eyes(-45, 8, 2.1, sl) + el(0, -40, 5, 6.5, '#3a3338') + (sl ? '' : el(0, -33, 3, 1.6, '#c96b6b')) + feet('#76879a', 8);
  },
  cheetah() {
    let sp = ''; [[-8, -24], [6, -26], [-4, -12], [10, -14], [-12, -16], [2, -30], [8, -42], [-9, -47], [12, -6]].forEach(([x, y]) => sp += ci(x, y, 1.7, '#5a3a1e'));
    return pa('M12,-8 q18,0 14,-24', 'none', 'stroke="#c99437" stroke-width="4" stroke-linecap="round"') +
      ball(0, -18, 15, 17, '#e3b04b', '#c99437') + el(0, -14, 8, 11, '#f6e7c4') +
      ci(-11, -51, 4.5, '#c99437') + ci(11, -51, 4.5, '#c99437') + ball(0, -42, 15, 13, '#e3b04b', '#c99437') + el(0, -36, 7, 5, '#f6e7c4') + sp +
      eyes(-43, 6, 2) + pa('M-6,-41 q-1,5 -3,8 M6,-41 q1,5 3,8', 'none', 'stroke="#5a3a1e" stroke-width="1.5" stroke-linecap="round"') + el(0, -38.5, 2.4, 1.7, INK) + feet('#c99437', 7);
  },
  octopus() {
    let t = ''; [-14, -7, 0, 7, 14].forEach((x, i) => t += pa(`M${x},-22 q${(i % 2 ? 4 : -4)},12 ${x * 0.3},20 q${i % 2 ? -5 : 5},2 ${i % 2 ? -7 : 7},-3`, 'none', 'stroke="#c25858" stroke-width="6" stroke-linecap="round"'));
    return t + ball(0, -36, 18, 20, '#d46a6a', '#bb5555') + ci(-7, -48, 3, '#e89a8a') + ci(6, -51, 2, '#e89a8a') + ci(10, -44, 2.4, '#e89a8a') +
      el(-6, -33, 2.4, 3, INK) + el(6, -33, 2.4, 3, INK) + pa('M-3,-26 q3,3 6,0', 'none', `stroke="${INK}" stroke-width="1.3" stroke-linecap="round"`) + blush(-28, 10);
  },
  owl() {
    let ch = ''; for (let i = 0; i < 3; i++) ch += pa(`M${-6 + i * 6},-14 l2,2.5 l2,-2.5`, 'none', 'stroke="#b8946e" stroke-width="1.2"');
    return el(-15, -24, 6, 15, '#6e523c') + el(15, -24, 6, 15, '#6e523c') + ball(0, -27, 17, 24, '#8b6a4e', '#755841') + el(0, -18, 10, 12, '#e9d6b4') + ch +
      pa('M-15,-46 l1,-13 l9,8z', '#755841') + pa('M15,-46 l-1,-13 l-9,8z', '#755841') +
      ci(-7, -38, 8, '#e9d6b4') + ci(7, -38, 8, '#e9d6b4') + ci(-7, -38, 3.4, INK) + ci(7, -38, 3.4, INK) + ci(-6, -39, 1, '#fff') + ci(8, -39, 1, '#fff') +
      pa('M-2.5,-33 l2.5,5 l2.5,-5z', '#e09a3a') + feet('#e09a3a', 6, -2);
  },
  elephant() {
    return el(-22, -44, 14, 17, '#76838f') + el(22, -44, 14, 17, '#76838f') + el(-22, -44, 9, 12, '#c9a9a6') + el(22, -44, 9, 12, '#c9a9a6') +
      ball(0, -20, 24, 20, '#8c98a6', '#76838f') + el(0, -16, 13, 12, '#a3aebb') +
      ball(0, -44, 19, 17, '#8c98a6', '#76838f') + pa('M0,-40 q-1,14 -6,22 q-1,3 2,3', 'none', 'stroke="#7f8b99" stroke-width="8" stroke-linecap="round"') +
      pa('M-7,-34 q-3,6 -1,10 M7,-34 q3,6 1,10', 'none', 'stroke="#f4ecd8" stroke-width="3" stroke-linecap="round"') + eyes(-46, 8, 2.2) + blush(-40, 12) + feet('#76838f', 12);
  },
  lion() {
    let mane = '', d = '';
    for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2, k = i % 2 ? 1 : 1.16; d += (i ? 'L' : 'M') + (Math.cos(a) * 22 * k).toFixed(1) + ',' + (-42 + Math.sin(a) * 21 * k).toFixed(1); }
    mane = pa(d + 'Z', '#9a5226') + ci(-1, -43, 20, '#b0622e');
    return pa('M14,-8 q14,2 14,-16', 'none', 'stroke="#c48d3c" stroke-width="3.5" stroke-linecap="round"') + ci(28, -25, 4, '#9a5226') +
      ball(0, -18, 18, 17, '#d9a24a', '#c48d3c') + el(0, -14, 10, 11, '#f5e2b8') + mane +
      ci(-11, -54, 4, '#c48d3c') + ci(11, -54, 4, '#c48d3c') + ball(0, -42, 15, 14, '#d9a24a', '#c48d3c') + el(0, -36, 8, 6, '#f5e2b8') +
      eyes(-44, 6, 2.1) + pa('M-3,-40 h6 l-3,3z', '#5a3220') + mouth(-35, 2.2) + feet('#c48d3c', 8);
  },
  minibee() { return `<g transform="scale(.6)">${ART.bee(true)}</g>`; },
  hare() {
    return el(-6, -52, 4.5, 14, '#b9a283', 'transform="rotate(-10 -6 -52)"') + el(6, -52, 4.5, 14, '#b9a283', 'transform="rotate(10 6 -52)"') +
      el(-6, -52, 2.2, 10, '#e8b8b0', 'transform="rotate(-10 -6 -52)"') + el(6, -52, 2.2, 10, '#e8b8b0', 'transform="rotate(10 6 -52)"') +
      ball(0, -15, 14, 14, '#cdb79a', '#b9a283') + el(0, -12, 8, 9, '#efe3cf') + ball(0, -34, 12, 11, '#cdb79a', '#b9a283') + eyes(-35, 5, 1.8) + el(0, -31, 2, 1.4, '#c96b6b') + feet('#b9a283', 6);
  },
  boar() {
    let br = ''; for (let i = 0; i < 6; i++) br += pa(`M${-10 + i * 4},-35 l2,-6 l2,6z`, '#4e3628');
    return br + ball(0, -20, 22, 18, '#6e4e3a', '#5a3f2e') + pa('M-14,-44 l3,-9 l7,6z', '#5a3f2e') + pa('M14,-44 l-3,-9 l-7,6z', '#5a3f2e') +
      ball(0, -36, 15, 12, '#6e4e3a', '#5a3f2e') + el(0, -29, 7, 5, '#c98d7a') + ci(-2.5, -29, 1.2, INK) + ci(2.5, -29, 1.2, INK) +
      pa('M-7,-27 q-3,-4 -2,-8 M7,-27 q3,-4 2,-8', 'none', 'stroke="#f4ecd8" stroke-width="2.4" stroke-linecap="round"') + eyes(-38, 6, 1.9) + feet('#4e3628', 10);
  },
};
const ART_SCALE = { 0: 0.85, 1: 0.86, 2: 0.95, 3: 1.03, 4: 1.15 };
function animalSvg(key, o) {
  const fn = ART[key]; if (!fn) return '';
  return fn(o);
}
function animalScale(key, star) {
  const A = ANIMALS[key] || EXTRA[key];
  let s = ART_SCALE[A.cost] || 0.9;
  if (key === 'boar') s = 1.05; if (key === 'minibee') s = 1;
  return s * (1 + (star - 1) * 0.08);
}
// 獨立小圖（商店、備戰區、圖鑑）
function portrait(key, size, o) {
  return `<svg viewBox="-34 -70 68 74" width="${size}" height="${size}" aria-hidden="true">${el(0, 0, 20, 4, 'rgba(60,30,20,.18)')}${animalSvg(key, o)}</svg>`;
}
