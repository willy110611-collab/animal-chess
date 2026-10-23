// ===== 由「遊戲數據.xlsx」產生（tools/xlsx2sheet.py），請不要手改；要改請改 Excel =====
const SHEET = {};
(function applySheet(S) {
  if (S.CFG) { Object.assign(CFG, S.CFG); CFG.ROWS = CFG.ROWS_HALF * 2; }
  for (const k in S.ANIMALS || {}) Object.assign(ANIMALS[k], S.ANIMALS[k]);
  for (const k in S.EVOLVE || {}) EVOLVE[k] = S.EVOLVE[k];
  for (const k in S.TRAITS || {}) Object.assign(TRAITS[k], S.TRAITS[k]);
  for (const k in S.MATS || {}) Object.assign(MATS[k], S.MATS[k]);
  for (const k in S.ITEMS || {}) ITEMS[k] = Object.assign(ITEMS[k] || {}, S.ITEMS[k]);
  for (const k in S.AUG || {}) if (AUG[k]) Object.assign(AUG[k], S.AUG[k]);
  if (S.MISC) { if (S.MISC.SYNERGY_BONUS !== undefined) SYNERGY_BONUS = S.MISC.SYNERGY_BONUS; if (S.MISC.PREY_BONUS !== undefined) PREY_BONUS = S.MISC.PREY_BONUS; }
  for (const k in RECIPE) delete RECIPE[k];
  for (const k in ITEMS) RECIPE[ITEMS[k].from.slice().sort().join('+')] = k;
  for (const t in TRAITS) if (EMBLEMS['emb_' + t]) { EMBLEMS['emb_' + t].name = TRAITS[t].name + '紋章'; EMBLEMS['emb_' + t].desc = '裝上後這隻動物多算一個「' + TRAITS[t].name + '」羈絆'; }
})(SHEET);
