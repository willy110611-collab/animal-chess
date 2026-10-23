// ===== 羈絆與裝備圖示（SVG）=====
const ICON_TRAIT = {
  forest: '<path d="M12 3c5 2 7 7 6 12-3 3-8 4-12 2C5 11 7 6 12 3z" fill="currentColor"/><path d="M8 19L15 8" stroke="var(--ib)" stroke-width="1.6" fill="none"/>',
  savanna: '<circle cx="12" cy="9" r="4.5" fill="currentColor"/><path d="M3 20c3-4 4-4 6 0M9 20c2-5 4-5 6 0M15 20c2-4 4-4 6 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  water: '<path d="M2 10c3-3 5 3 8 0s5 3 8 0 3 0 4 0M2 16c3-3 5 3 8 0s5 3 8 0 3 0 4 0" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  sky: '<path d="M3 15c3-8 10-10 18-9-3 2-4 3-5 5 2 0 3 0 4 1-3 1-5 2-7 4 1 0 2 0 3 1-5 1-9 0-13-2z" fill="currentColor"/>',
  pack: '<ellipse cx="12" cy="16" rx="5" ry="4" fill="currentColor"/><circle cx="6" cy="10" r="2.2" fill="currentColor"/><circle cx="10" cy="6.5" r="2.2" fill="currentColor"/><circle cx="14" cy="6.5" r="2.2" fill="currentColor"/><circle cx="18" cy="10" r="2.2" fill="currentColor"/>',
  armor: '<path d="M12 2l8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5z" fill="currentColor"/><path d="M12 6v12" stroke="var(--ib)" stroke-width="1.6"/>',
  night: '<path d="M15 3a9 9 0 1 0 6 13A7 7 0 0 1 15 3z" fill="currentColor"/><circle cx="18" cy="6" r="1.2" fill="currentColor"/>',
};
const ICON_ITEM = {
  twig: '<path d="M4 20L19 5M12 12l5 1M9 15l-1-5" stroke="#8a5a2b" stroke-width="2.6" stroke-linecap="round" fill="none"/><ellipse cx="18" cy="4.5" rx="2.6" ry="1.5" fill="#6f9a5a" transform="rotate(-30 18 4.5)"/>',
  acorn: '<ellipse cx="12" cy="14" rx="6" ry="7" fill="#c49a5a"/><path d="M5 11c0-4 3-6 7-6s7 2 7 6z" fill="#7a4f28"/><path d="M12 5V2" stroke="#7a4f28" stroke-width="2"/>',
  feather: '<path d="M6 20C6 10 12 4 19 3c0 7-5 13-13 17z" fill="#f2e6cf"/><path d="M5 21L17 6" stroke="#8b6a4e" stroke-width="1.6"/>',
  shell: '<path d="M3 17c0-7 4-12 9-12s9 5 9 12z" fill="#f0c9b0"/><path d="M12 5v12M7 8l2 9M17 8l-2 9" stroke="#c98a6a" stroke-width="1.4"/><rect x="9" y="17" width="6" height="3" rx="1" fill="#c98a6a"/>',
  dew: '<path d="M12 3c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z" fill="#8fc8e8"/><circle cx="10" cy="15" r="1.8" fill="#fff"/>',
  honey: '<path d="M6 8h12l-1 11a3 3 0 0 1-3 2h-4a3 3 0 0 1-3-2z" fill="#f2c14e"/><rect x="5" y="5" width="14" height="3.5" rx="1.5" fill="#b8763a"/><path d="M9 11c0 3 1 4 1 6" stroke="#fff3c0" stroke-width="1.5"/>',
  fang: '<path d="M7 3c4 0 6 4 5 9l-3 9-2-9C6 8 6 5 7 3z" fill="#f4ecd8"/><path d="M17 3c-3 1-4 4-3 8l2 6 2-6c1-3 0-6-1-8z" fill="#e8dcc0"/><circle cx="10" cy="20" r="1.4" fill="#d9483a"/>',
  hardshell: '<path d="M12 2l8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6z" fill="#c98a6a"/><path d="M12 5l5 2.5v4c0 3-2 5-5 6.5-3-1.5-5-3.5-5-6.5v-4z" fill="#f0c9b0"/>',
  morningdew: '<path d="M8 4c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8zM16 9c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z" fill="#8fc8e8"/><circle cx="16" cy="18" r="1.4" fill="#f2c14e"/>',
  bigstick: '<path d="M3 21L20 4" stroke="#7a4f28" stroke-width="4.5" stroke-linecap="round"/><path d="M12 12l6 2M8 16l-1-6" stroke="#8a5a2b" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="20" cy="4" rx="3" ry="1.8" fill="#6f9a5a"/>',
  honeypot: '<path d="M5 9h14l-1 9a4 4 0 0 1-4 3h-4a4 4 0 0 1-4-3z" fill="#d98a3a"/><rect x="4" y="6" width="16" height="4" rx="2" fill="#8a5a2b"/><path d="M8 10c0 3 0 4 1 5" stroke="#f2c14e" stroke-width="3" stroke-linecap="round"/>',
  nest: '<ellipse cx="12" cy="15" rx="9" ry="5" fill="#a8804e"/><path d="M3 14c6 3 12 3 18 0" stroke="#7a5a32" stroke-width="1.6" fill="none"/><ellipse cx="9.5" cy="12" rx="2.6" ry="3" fill="#e8f2f7"/><ellipse cx="14" cy="12" rx="2.6" ry="3" fill="#cfe4ee"/>',
  pearl: '<path d="M2 16c2-6 6-9 10-9s8 3 10 9z" fill="#e3c8d8"/><circle cx="12" cy="13" r="4" fill="#fbf6f0"/><circle cx="10.6" cy="11.6" r="1.2" fill="#fff"/>',
  beeswax: '<path d="M12 2l7 4v8l-7 4-7-4V6z" fill="#f2c14e"/><path d="M12 6l3.5 2v4L12 14l-3.5-2V8z" fill="#d99a2b"/><path d="M12 18v4" stroke="#7a4f28" stroke-width="2"/>',
};
Object.assign(ICON_ITEM, {
  warhammer: '<rect x="10.5" y="9" width="3" height="13" rx="1" fill="#7a4f28"/><rect x="4" y="3" width="16" height="8" rx="3" fill="#c49a5a"/><path d="M6 5h12" stroke="#8a5a2b" stroke-width="1.5"/>',
  thornshell: '<path d="M3 17c0-7 4-12 9-12s9 5 9 12z" fill="#f0c9b0"/><path d="M5 9l-3-3M12 5V1M19 9l3-3M8 6L6 2M16 6l2-4" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round"/>',
  frostbranch: '<path d="M4 20L19 5" stroke="#8a5a2b" stroke-width="2.6" stroke-linecap="round"/><path d="M17 3v6M14 6h6M15 4l4 4M19 4l-4 4" stroke="#8fd3ff" stroke-width="1.6" stroke-linecap="round"/>',
  bigacorn: '<ellipse cx="12" cy="14" rx="8" ry="8.5" fill="#c49a5a"/><path d="M3 11c0-5 4-7 9-7s9 2 9 7z" fill="#7a4f28"/><path d="M12 4V1" stroke="#7a4f28" stroke-width="2"/><path d="M8 16q4 3 8 0" stroke="#e8c48a" stroke-width="1.5" fill="none"/>',
  fogcloak: '<path d="M6 4h12l2 17H4z" fill="#b8c4d0"/><path d="M6 4q6 5 12 0" fill="#8a96a8"/><circle cx="8" cy="14" r="3" fill="#e8eef4" opacity=".8"/><circle cx="15" cy="17" r="3.5" fill="#e8eef4" opacity=".8"/>',
  honeyacorn: '<ellipse cx="12" cy="14" rx="6" ry="7" fill="#c49a5a"/><path d="M5 11c0-4 3-6 7-6s7 2 7 6z" fill="#7a4f28"/><path d="M9 13c0 3 1 5 1 7M14 13c0 2 0 3 1 4" stroke="#f2c14e" stroke-width="2.4" stroke-linecap="round"/>',
  galefeather: '<path d="M4 19C5 10 11 4 19 3c0 7-5 13-15 16z" fill="#f2e6cf"/><path d="M2 8h6M1 12h5M3 16h4" stroke="#8fd3ff" stroke-width="1.8" stroke-linecap="round"/>',
  featherarmor: '<path d="M12 2l8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5z" fill="#c98a6a"/><path d="M8 17c0-6 3-10 8-11 0 5-3 9-8 11z" fill="#f2e6cf"/>',
  dewfeather: '<path d="M4 20C5 11 11 5 19 4c0 7-5 13-15 16z" fill="#f2e6cf"/><path d="M17 12c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z" fill="#8fc8e8"/>',
  pollen: '<circle cx="12" cy="12" r="4" fill="#f2c14e"/><g fill="#f29bb0"><circle cx="12" cy="5" r="3"/><circle cx="12" cy="19" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/></g><circle cx="12" cy="12" r="3" fill="#f2c14e"/>',
  conch: '<path d="M4 18c-1-7 3-14 10-14 5 0 7 4 6 8-1 5-6 8-11 8-3 0-5-1-5-2z" fill="#f0c9b0"/><path d="M14 7c-3 0-5 3-4 6s5 3 6 0" stroke="#c98a6a" stroke-width="1.6" fill="none"/>',
  waxshell: '<path d="M3 17c0-7 4-12 9-12s9 5 9 12z" fill="#f2c14e"/><path d="M12 5v12M7 8l2 9M17 8l-2 9" stroke="#b8763a" stroke-width="1.4"/>',
  moondew: '<path d="M15 3a8 8 0 1 0 6 12A6 6 0 0 1 15 3z" fill="#e8e0b8"/><path d="M8 10c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z" fill="#8fc8e8"/>',
  reforge: '<path d="M3 15h18l-3 5H6z" fill="#7a7a8a"/><rect x="7" y="10" width="10" height="5" fill="#9a9aaa"/><path d="M14 2l3 3-6 6-3-3z" fill="#c98a6a"/><path d="M15 3l-7 7" stroke="#6a4a30" stroke-width="2"/>',
  dupe: '<circle cx="9" cy="12" r="6" fill="#8fd3ff" opacity=".9"/><circle cx="15" cy="12" r="6" fill="#f2c14e" opacity=".9"/><path d="M12 9v6M9 12h6" stroke="#fff" stroke-width="2"/>',
  remover: '<path d="M6 3l5 9-5 9M18 3l-5 9 5 9" stroke="#7a7a8a" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="2.4" fill="#d9483a"/>',
});
const iconTrait = (t, cls) => `<svg viewBox="0 0 24 24" class="${cls || ''}" aria-hidden="true">${ICON_TRAIT[t]}</svg>`;
const iconItem = (k, cls) => EMBLEMS[k] ? `<svg viewBox="0 0 24 24" class="${cls || ''}" aria-hidden="true"><path d="M12 1l9 5v12l-9 5-9-5V6z" fill="#f2c14e"/><g transform="translate(5.5 5.5) scale(.54)" style="color:#5a3a10;--ib:#f2c14e">${ICON_TRAIT[EMBLEMS[k].trait]}</g></svg>` : `<svg viewBox="0 0 24 24" class="${cls || ''}" aria-hidden="true">${ICON_ITEM[k] || ''}</svg>`;
const COST_COL = { 1: '#9a8a7a', 2: '#4f8a45', 3: '#3d7fc4', 4: '#8a4fc4', 5: '#d99a2b' };
const AUG_COL = { 1: 'linear-gradient(135deg,#9aa6b2,#e8eef4,#9aa6b2)', 2: 'linear-gradient(135deg,#c8902a,#ffe08a,#c8902a)', 3: 'linear-gradient(135deg,#ff8ab0,#ffe27a,#8af0c8,#8ab8ff,#d88aff)' };
const augIcon = (id, cls) => { const a = AUG[id]; return `<span class="aug-ic t${a.tier} ${cls || ''}" title="${a.name}">${a.name[0]}</span>`; };
