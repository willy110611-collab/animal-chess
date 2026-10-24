import { DurableObject } from 'cloudflare:workers';
// ===== 資料區：數值、文字可直接改這裡 =====
// 時間單位：tick（1 tick = 50ms，20 tick = 1 秒）
const CFG = {
  COLS: 9, ROWS_HALF: 5, ROWS: 10, // 棋盤欄數、每邊列數（v0.10 起 9×10；改這裡全部跟著變）
  TICK_MS: 50,
  RESULT_MS: 3000,          // 全部戰場打完後，統一結算畫面停多久（毫秒）才進準備
  PREP_SEC: 30,          // 準備階段秒數
  COMBAT_MAX_TICK: 700,  // 戰鬥最長 35 秒
  OVERTIME_TICK: 600,    // 30 秒後加時
  NIGHT_TICK: 200,       // 第 10 秒入夜
  TEAM_HP: 100,
  BENCH: 8,
  MAX_ITEMS: 3,
  START_GOLD: 4, START_LEVEL: 2,
  BASE_INCOME: 5, WIN_GOLD: 1, MAX_INTEREST: 5,
  INCOME_BY_STAGE: [0, 4, 5, 5, 6, 6, 6, 6], // 基本收入依階段提升（索引＝階段）
  XP_COST: 4, XP_BUY: 4, XP_ROUND: 2,
  XP_NEED: { 1: 2, 2: 2, 3: 6, 4: 10, 5: 20, 6: 36, 7: 48, 8: 76 }, // 從該等級升到下一級所需經驗（v0.12.6 起照聯盟戰棋）
  MAX_LEVEL: 9,
  SHOP_SIZE: 5, REROLL_COST: 2,
  // 商店機率（%）：等級 → [1費, 2費, 3費, 4費, 5費]
  SHOP_ODDS: { 1: [100, 0, 0, 0, 0], 2: [100, 0, 0, 0, 0], 3: [75, 25, 0, 0, 0], 4: [55, 30, 15, 0, 0], 5: [45, 33, 20, 2, 0], 6: [30, 40, 25, 5, 0], 7: [19, 30, 35, 15, 1], 8: [18, 25, 32, 22, 3], 9: [10, 20, 25, 35, 10] }, // v0.12.6 起照聯盟戰棋
  POOL: { 1: 12, 2: 12, 3: 11, 4: 10, 5: 8 },           // 全場共用卡池（每隻幾張）；每費只有 5 種動物（聯盟戰棋約 13 種），所以張數比較少，3 星難度才接近
  POOL_8P_PCT: 150,                                     // 8 人局（4 隊）卡池數量 %
  CAROUSEL_ROUNDS: [6, 11, 16, 21],                     // 選秀回合
  ENCOUNTER_ROUNDS: [2, 7, 12, 18],                     // 遭遇事件回合
  BANK_INTEREST_MAX: 3,                                 // 隊伍金庫利息上限
  AUG_ROUNDS: [4, 9, 14],                               // 海克斯三選一的回合（每場三次）
  AUG_TIER_ODDS: [[55, 35, 10], [30, 50, 20], [10, 45, 45]], // 第 1、2、3 次海克斯的 銀／金／彩 機率（%）；太強的彩色另有「最早回合」限制
  STAR_MUL: [0, 100, 180, 320],                         // 星級生命與攻擊倍率（%）
  GIFT_GOLD_MAX: 5,       // （舊版每回合上限，v0.12.7 起改用下面依階段的上限）
  GIFT_GOLD_STAGE: [0, 3, 5, 8, 10, 12, 15, 15],  // 每個大回合（階段）最多送隊友幾金（索引＝階段）
  GIFT_UNIT_STAGE: 1,                              // 每個大回合最多送隊友幾隻動物
  GIFT_UNIT_STAR: [0, 1, 1, 2, 2, 2, 2, 2],        // 每個階段能送的最高星數（3 星不能送）
  MAX_ROUND: 0,           // 0 = 不限回合，打到一隊血量歸零為止
  DMG_BASE: 2, DMG_STAR_PCT: 34, DMG_STAGE: 2, // 輸掉扣血 = 基本 + 存活星數×% + (階段−1)×DMG_STAGE
};

// 動物：hp 生命 atk 攻擊 ai 攻擊間隔(tick) rng 射程 arm 護甲 mr 魔抗 mana 能量上限 sm 起始能量 mv 移動一格 tick
const ANIMALS = {
  hedgehog: { name: '刺蝟', cost: 1, traits: ['forest', 'armor'], role: '坦',
    hp: 650, atk: 40, ai: 22, rng: 1, arm: 35, mr: 25, mana: 80, sm: 20, mv: 9,
    skill: '縮球', desc: '被動反彈 20% 近戰傷害。技能：縮成刺球 1.5 秒無敵，刺傷周圍敵人 120 魔法傷害。' },
  squirrel: { name: '松鼠', cost: 1, traits: ['forest', 'pack'], role: '遠程',
    hp: 450, atk: 45, ai: 18, rng: 3, arm: 15, mr: 15, mana: 60, sm: 0, mv: 7,
    skill: '松果連彈', desc: '丟松果 150 物理傷害，彈射另外 2 個敵人（70%）。' },
  wolf: { name: '野狼', cost: 1, traits: ['savanna', 'pack'], role: '戰士',
    hp: 660, atk: 58, ai: 18, rng: 1, arm: 25, mr: 20, mana: 70, sm: 0, mv: 7,
    skill: '狼嚎', desc: '自身與 2 格內群居友軍攻速 +30%，持續 4 秒。' },
  frog: { name: '青蛙', cost: 1, traits: ['water', 'pack'], role: '法師',
    hp: 560, atk: 45, ai: 20, rng: 3, arm: 15, mr: 25, mana: 70, sm: 10, mv: 8,
    skill: '長舌', desc: '把 4 格內最遠的敵人拉到身前，220 魔法傷害並暈 1.5 秒。' },
  bat: { name: '蝙蝠', cost: 1, traits: ['sky', 'night'], role: '刺客',
    hp: 500, atk: 52, ai: 16, rng: 1, arm: 15, mr: 15, mana: 60, sm: 0, mv: 6,
    skill: '吸血咬', desc: '開場飛向敵方後排。普攻吸血 20%。技能：咬 180 物理傷害並全額回血。' },
  redpanda: { name: '小熊貓', cost: 2, traits: ['forest', 'armor'], role: '坦',
    hp: 850, atk: 50, ai: 22, rng: 1, arm: 45, mr: 35, mana: 90, sm: 40, mv: 8,
    skill: '站立威嚇', desc: '嘲諷 2 格內敵人 3 秒，自身受到傷害 −30%。' },
  skunk: { name: '臭鼬', cost: 2, traits: ['forest', 'night'], role: '控制',
    hp: 780, atk: 48, ai: 20, rng: 2, arm: 30, mr: 30, mana: 70, sm: 0, mv: 8,
    skill: '臭氣', desc: '在敵人密集處放一圈臭氣（中心＋周圍 6 格）4 秒：區內敵人攻擊 −30%，每秒 40 魔法傷害。' },
  croc: { name: '鱷魚', cost: 2, traits: ['water', 'armor'], role: '戰士',
    hp: 800, atk: 65, ai: 22, rng: 1, arm: 40, mr: 25, mana: 80, sm: 0, mv: 9,
    skill: '死亡翻滾', desc: '咬住目標暈 2 秒，造成 300 物理傷害。站水格護甲加倍。' },
  bee: { name: '蜜蜂', cost: 2, traits: ['sky', 'pack'], role: '召喚',
    hp: 520, atk: 40, ai: 16, rng: 2, arm: 15, mr: 20, mana: 80, sm: 20, mv: 6,
    skill: '蜂群', desc: '召喚 3 隻小蜂。小蜂死亡時螫殺手 60 真實傷害。' },
  koala: { name: '無尾熊', cost: 3, traits: ['forest', 'night'], role: '坦／爆發',
    hp: 1080, atk: 72, ai: 22, rng: 1, arm: 40, mr: 40, mana: 100, sm: 0, mv: 10,
    skill: '起床氣', desc: '開場睡覺，每秒回 5% 生命、能量 +10。被打掉 15% 生命或能量滿時醒來，攻擊 +80% 持續 5 秒。樹格回血加倍。' },
  cheetah: { name: '獵豹', cost: 3, traits: ['savanna'], role: '刺客',
    hp: 720, atk: 67, ai: 14, rng: 1, arm: 25, mr: 20, mana: 80, sm: 0, mv: 4,
    skill: '疾馳撲殺', desc: '移動極快。連續攻擊同一目標每次攻速 +8%（最多 5 層）。技能：衝向血最少的敵人 300 物理傷害。' },
  octopus: { name: '章魚', cost: 4, traits: ['water', 'night'], role: '控制法師',
    hp: 920, atk: 58, ai: 20, rng: 3, arm: 25, mr: 40, mana: 80, sm: 20, mv: 8,
    skill: '噴墨', desc: '對敵人密集處噴一圈墨（中心＋周圍 6 格）：200 魔法傷害並致盲 3 秒（普攻落空）。' },
  owl: { name: '貓頭鷹', cost: 4, traits: ['sky', 'night'], role: '遠程',
    hp: 760, atk: 82, ai: 20, rng: 4, arm: 20, mr: 30, mana: 70, sm: 0, mv: 7,
    skill: '無聲撲擊', desc: '撲向血最少的敵人，350 物理傷害必定暴擊。' },
  elephant: { name: '大象', cost: 5, traits: ['savanna', 'pack', 'king'], role: '坦',
    hp: 1800, atk: 95, ai: 26, rng: 1, arm: 55, mr: 45, mana: 110, sm: 40, mv: 10,
    skill: '踩踏', desc: '震地：2 格內敵人暈 1.5 秒，220 魔法傷害。' },
  lion: { name: '獅子', cost: 5, traits: ['savanna', 'pack', 'king'], role: '領袖',
    hp: 1480, atk: 118, ai: 20, rng: 1, arm: 45, mr: 40, mana: 90, sm: 20, mv: 8,
    skill: '王者咆哮', desc: '全隊攻擊 +25% 持續 6 秒；2 格內敵人恐懼 1.5 秒。' },
  // ---- v0.5 新增 ----
  penguin: { name: '企鵝', cost: 2, traits: ['water', 'pack'], role: '戰士',
    hp: 760, atk: 55, ai: 20, rng: 1, arm: 35, mr: 25, mana: 70, sm: 10, mv: 7,
    skill: '肚皮滑行', desc: '趴下滑向 3 格內最遠的敵人，撞擊 160 魔法傷害並暈 1 秒，落點周圍敵人受 80 魔法傷害。' },
  rhino: { name: '犀牛', cost: 3, traits: ['savanna', 'armor'], role: '坦',
    hp: 900, atk: 60, ai: 24, rng: 1, arm: 40, mr: 30, mana: 100, sm: 20, mv: 8,
    skill: '犀角衝鋒', desc: '衝向 3 格內最遠的敵人，220 物理傷害並擊飛 1.25 秒，自身獲得 180 護盾。' },
  chameleon: { name: '變色龍', cost: 3, traits: ['forest', 'night'], role: '刺客',
    hp: 680, atk: 70, ai: 18, rng: 2, arm: 20, mr: 20, mana: 70, sm: 0, mv: 7,
    skill: '變色突襲', desc: '被動：開場隱身。技能：重新隱身，長舌彈向 3 格內血最少的敵人 280 物理傷害，下一次普攻必定暴擊。' },
  fox: { name: '狐狸', cost: 3, traits: ['savanna', 'night'], role: '刺客',
    hp: 720, atk: 68, ai: 16, rng: 1, arm: 25, mr: 25, mana: 70, sm: 0, mv: 6,
    skill: '跳躍撲鼠', desc: '高高躍起撲向攻擊最高的遠程敵人，240 物理傷害並偷走 40 能量。' },
  eagle: { name: '老鷹', cost: 4, traits: ['sky', 'savanna'], role: '遠程',
    hp: 880, atk: 84, ai: 20, rng: 3, arm: 25, mr: 25, mana: 80, sm: 0, mv: 6,
    skill: '高空擒拿', desc: '抓起目標飛上高空 1.5 秒（無法行動）再摔下，380 物理傷害，周圍 1 格敵人受 120 物理傷害。' },
  eel: { name: '電鰻', cost: 4, traits: ['water', 'night'], role: '法師',
    hp: 880, atk: 55, ai: 20, rng: 3, arm: 25, mr: 40, mana: 80, sm: 20, mv: 8,
    skill: '連鎖放電', desc: '電擊目標 260 魔法傷害並彈跳 4 次（每次 −15%），被電到的敵人暈 0.5 秒。' },
  gorilla: { name: '大猩猩', cost: 4, traits: ['forest', 'armor'], role: '坦',
    hp: 1280, atk: 76, ai: 24, rng: 1, arm: 45, mr: 40, mana: 100, sm: 40, mv: 9,
    skill: '捶胸震地', desc: '捶胸嘲諷 2 格內敵人 2.5 秒，獲得 18% 生命護盾，再雙拳砸地，周圍 1 格 200 魔法傷害。' },
  whale: { name: '鯨魚', cost: 5, traits: ['water', 'armor', 'king'], role: '坦／法師',
    hp: 1850, atk: 85, ai: 26, rng: 2, arm: 45, mr: 50, mana: 120, sm: 40, mv: 11,
    skill: '潮汐巨浪', desc: '噴出巨浪，沿自己左右各 1 格寬的直線橫掃全場：敵人 260 魔法傷害並暈 1 秒，友軍回復 15% 生命。' },
  peacock: { name: '孔雀', cost: 5, traits: ['sky', 'forest', 'king'], role: '輔助',
    hp: 1350, atk: 95, ai: 20, rng: 3, arm: 30, mr: 40, mana: 100, sm: 30, mv: 8,
    skill: '孔雀開屏', desc: '3 格內敵人被魅惑 1.5 秒；3 格內友軍攻速 +30%、受到傷害 −20%，持續 4 秒。' },
  komodo: { name: '科摩多巨蜥', cost: 5, traits: ['savanna', 'armor', 'king'], role: '戰士',
    hp: 1440, atk: 100, ai: 22, rng: 1, arm: 50, mr: 35, mana: 90, sm: 0, mv: 9,
    skill: '劇毒撕咬', desc: '被動：普攻對中毒敵人傷害 +30%。技能：撕咬 260 物理傷害，5 秒內再造成目標最大生命 30% 的毒傷，自己回復 20% 生命。' },
  // ---- v0.13 新增：讓高階羈絆湊得到 ----
  deer: { name: '小鹿', cost: 1, traits: ['forest', 'pack'], role: '輔助',
    hp: 520, atk: 38, ai: 20, rng: 2, arm: 15, mr: 25, mana: 70, sm: 20, mv: 7,
    skill: '林間祝福', desc: '治療生命最低的友軍 200，並讓 2 格內的森林友軍回復 6% 生命。' },
  zebra: { name: '斑馬', cost: 1, traits: ['savanna', 'pack'], role: '戰士',
    hp: 690, atk: 60, ai: 18, rng: 1, arm: 25, mr: 20, mana: 70, sm: 0, mv: 6,
    skill: '斑紋後踢', desc: '後腿一踢：目標 170 物理傷害並致盲 2 秒（普攻落空）。' },
  hippo: { name: '河馬', cost: 2, traits: ['water', 'armor'], role: '坦',
    hp: 900, atk: 52, ai: 24, rng: 1, arm: 40, mr: 35, mana: 90, sm: 30, mv: 9,
    skill: '河馬大口', desc: '張大嘴嘲諷周圍 1 格敵人 2 秒，咬目標 200 魔法傷害，獲得 22% 生命護盾。' },
  parrot: { name: '鸚鵡', cost: 2, traits: ['sky', 'forest'], role: '遠程',
    hp: 500, atk: 50, ai: 17, rng: 3, arm: 15, mr: 20, mana: 70, sm: 10, mv: 6,
    skill: '尖嘯羽箭', desc: '一次射出 3 根羽箭打 3 個不同的敵人，各 130 物理傷害，被打到的魔抗 −20 持續 4 秒。' },
  giraffe: { name: '長頸鹿', cost: 3, traits: ['savanna', 'armor'], role: '戰士',
    hp: 940, atk: 66, ai: 22, rng: 2, arm: 35, mr: 30, mana: 90, sm: 20, mv: 8,
    skill: '長頸甩擊', desc: '甩動長脖子橫掃 2 格內所有敵人 200 物理傷害，並把他們擊退 1 格。' },
  flamingo: { name: '紅鶴', cost: 3, traits: ['sky', 'water'], role: '法師',
    hp: 700, atk: 50, ai: 20, rng: 3, arm: 20, mr: 35, mana: 80, sm: 20, mv: 7,
    skill: '單腳旋舞', desc: '在敵人密集處掀起水花漩渦 3 秒（中心＋周圍 6 格）：每秒 90 魔法傷害，區內敵人攻速 −25%。' },
  shark: { name: '鯊魚', cost: 3, traits: ['water', 'night'], role: '刺客',
    hp: 740, atk: 70, ai: 16, rng: 1, arm: 25, mr: 20, mana: 70, sm: 0, mv: 6,
    skill: '嗜血突襲', desc: '鑽進地下衝到血最少的敵人腳下 260 物理傷害；目標生命低於 50% 時傷害 +60%，擊殺回滿 50 能量。' },
  panda: { name: '熊貓', cost: 4, traits: ['forest', 'armor'], role: '坦',
    hp: 1300, atk: 74, ai: 24, rng: 1, arm: 45, mr: 45, mana: 100, sm: 40, mv: 10,
    skill: '竹林滾滾', desc: '抱成一團滾過前方，沿路 2 格內的敵人 240 魔法傷害並暈 1 秒，自己回復 18% 生命。' },
};

// 召喚物與野生動物（不進商店）
const EXTRA = {
  minibee: { name: '小蜂', cost: 0, traits: [], hp: 160, atk: 22, ai: 14, rng: 1, arm: 10, mr: 10, mana: 999, sm: 0, mv: 5 },
  hare: { name: '野兔', cost: 0, traits: [], hp: 300, atk: 22, ai: 20, rng: 1, arm: 10, mr: 10, mana: 999, sm: 0, mv: 6 },
  boar: { name: '野豬', cost: 0, traits: [], hp: 900, atk: 45, ai: 24, rng: 1, arm: 35, mr: 25, mana: 999, sm: 0, mv: 8 },
  kingboar: { name: '野豬王', cost: 0, traits: [], hp: 8000, atk: 240, ai: 21, rng: 1, arm: 95, mr: 85, mana: 100, sm: 30, mv: 9, skill: '震地', desc: '用力踏地，2 格內的敵人受到魔法傷害並暈眩。' }, // 魔王（第 3 階段起的野生回合）
};

const TRAITS = {
  // v0.13：參考聯盟戰棋，低階好湊、高階很難；環境羈絆（森林、草原、水域、天空）湊到最高階＝「生態圈」，有專屬音樂與戰場特效
  forest:  { name: '森林', tiers: [2, 4, 6, 8], desc: ['森林單位每秒回 2% 生命', '每秒回 4% 生命', '每秒回 6% 生命', '生態圈「萬木回春」：全隊每秒回 4% 生命，森林單位回 8%；每場第一個倒下的我方棋子 1 秒後復活（50% 生命）'], val: [2, 4, 6, 8], eco: 8 },
  savanna: { name: '草原', tiers: [2, 4, 6, 8], desc: ['草原單位攻速 +20%，全隊移動加快', '攻速 +40%', '攻速 +65%', '生態圈「獸群狂奔」：草原單位攻速 +90%；開場 4 秒全隊攻速 +50%'], val: [20, 40, 65, 90], eco: 8 },
  water:   { name: '水域', tiers: [2, 4, 6, 8], desc: ['水域單位開場護盾 15% 生命', '護盾 25%；站水格加倍', '護盾 40%', '生態圈「深海巨浪」：護盾 55%；每 6 秒一道巨浪打全場敵人 120 魔法傷害，我方回 5% 生命'], val: [15, 25, 40, 55], eco: 8 },
  sky:     { name: '天空', tiers: [2, 3, 4, 6], desc: ['天空單位閃避 20%', '閃避 30%', '閃避 40%', '生態圈「萬里晴空」：天空單位閃避 50%，全隊閃避 +20%、攻擊 +15%'], val: [20, 30, 40, 50], eco: 6 },
  pack:    { name: '群居', tiers: [3, 6, 9], desc: ['每個相鄰群居友軍 +8% 傷害', '+14%', '+22%，而且全隊都算群居（互相加成）'], val: [8, 14, 22] },
  armor:   { name: '甲冑', tiers: [2, 4, 6], desc: ['甲冑單位護甲魔抗 +30，全隊 +10', '甲冑 +60，全隊 +15', '甲冑 +100，全隊 +30'], val: [30, 60, 100] },
  night:   { name: '夜行', tiers: [2, 4, 6, 8], desc: ['第 10 秒入夜，夜行單位暴擊 +25%', '暴擊 +45%', '暴擊 +70%', '永夜：開場就入夜，暴擊 +100%'], val: [25, 45, 70, 100] },
  king:    { name: '百獸之王', tiers: [2, 3, 4], desc: ['（只有 5 費動物）全隊生命與攻擊 +8%', '+16%', '傳說：+30%，百獸之王的技能能量需求 −30%'], val: [8, 16, 30] },
};
let SYNERGY_BONUS = 20; // 默契加成：兩位隊友都有出該羈絆時效果 +20%

const TERRAIN = {
  grass: { name: '草叢', desc: '開場隱身，第一擊 +50%' },
  water: { name: '水池', desc: '非水域單位移動變慢；水域單位攻擊 +20%' },
  tree:  { name: '樹', desc: '遠程射程 +1；森林單位回血加倍' },
  rock:  { name: '岩石', desc: '不可站立，阻擋移動' },
  bounce:{ name: '彈射', desc: '站滿 2 秒會被彈到對面同款地塊旁，落地震傷周圍敵人 80' },
  burn:  { name: '灼燒', desc: '站在上面每秒失去 4% 生命，但攻速 +30%' },
  shadow:{ name: '暗影', desc: '站在上面時隱身，只有貼身的敵人能鎖定你' },
};
// 高台：遠程射程 +1；從低處打高台的普攻 25% 落空；爬坡移動變慢
const HIGH = { RANGE: 1, MISS: 25, CLIMB_PCT: 40 };
const BOUNCE_TICKS = 40, BURN_PCT = 4, BURN_AS = 30, BOUNCE_DMG = 80;

// 材料
const MATS = {
  twig:   { name: '樹枝', stat: { atk: 15 } },
  acorn:  { name: '橡實', stat: { hp: 150 } },
  feather:{ name: '羽毛', stat: { as: 12 } },
  shell:  { name: '貝殼', stat: { arm: 20 } },
  dew:    { name: '露珠', stat: { mr: 20 } },
  honey:  { name: '蜂蜜', stat: { sm: 15 } },
};
// 成品：兩材料合成（key 依字母排序相接）
const ITEMS = {
  fang:    { name: '獠牙', from: ['feather', 'twig'], stat: { atk: 20, as: 15 }, desc: '普攻附加流血：3 秒共造成目標最大生命 4%' },
  hardshell:{ name: '硬殼', from: ['acorn', 'shell'], stat: { hp: 200, arm: 25 }, desc: '受到傷害 −12%' },
  morningdew:{ name: '晨露', from: ['dew', 'honey'], stat: { sm: 40, mr: 20 }, desc: '開場能量 +40' },
  bigstick:{ name: '大樹枝', from: ['twig', 'twig'], stat: { atk: 25 }, desc: '攻擊 +40%' },
  honeypot:{ name: '蜂蜜罐', from: ['honey', 'honey'], stat: { sm: 20 }, desc: '放完技能回 25 能量' },
  nest:    { name: '鳥巢', from: ['acorn', 'feather'], stat: { hp: 150, as: 20 }, desc: '開場護盾 200' },
  pearl:   { name: '珍珠', from: ['dew', 'shell'], stat: { arm: 25, mr: 25 }, desc: '免疫第一次控制' },
  beeswax: { name: '蜂蠟', from: ['honey', 'twig'], stat: { atk: 10, sm: 10 }, desc: '技能傷害 +30%' },
};
Object.assign(ITEMS, {
  warhammer: { name: '橡木戰槌', from: ['acorn', 'twig'], stat: { atk: 15, hp: 150 }, desc: '生命低於 40% 時攻擊 +35%' },
  thornshell:{ name: '刺貝殼', from: ['shell', 'twig'], stat: { atk: 10, arm: 20 }, desc: '被普攻時反彈 15% 傷害' },
  frostbranch:{ name: '霜枝', from: ['dew', 'twig'], stat: { atk: 10, mr: 20 }, desc: '普攻讓目標攻速 −20%，持續 2 秒' },
  bigacorn:{ name: '巨橡果', from: ['acorn', 'acorn'], stat: { hp: 400 }, desc: '每秒回復 1.5% 生命' },
  fogcloak:{ name: '晨霧披風', from: ['acorn', 'dew'], stat: { hp: 150, mr: 20 }, desc: '開場 3 秒無法被選為目標' },
  honeyacorn:{ name: '蜜糖橡實', from: ['acorn', 'honey'], stat: { hp: 150, sm: 15 }, desc: '放技能時回復 12% 生命' },
  galefeather:{ name: '疾風羽', from: ['feather', 'feather'], stat: { as: 30 }, desc: '每次普攻攻速再 +3%（最多 +30%）' },
  featherarmor:{ name: '羽甲', from: ['feather', 'shell'], stat: { as: 12, arm: 20 }, desc: '閃避 +15%' },
  dewfeather:{ name: '露羽', from: ['dew', 'feather'], stat: { as: 12, mr: 20 }, desc: '普攻額外造成 35 魔法傷害' },
  pollen:  { name: '花粉', from: ['feather', 'honey'], stat: { as: 12, sm: 15 }, desc: '普攻額外回 5 能量' },
  conch:   { name: '大海螺', from: ['shell', 'shell'], stat: { arm: 50 }, desc: '開場相鄰友軍護甲 +20' },
  waxshell:{ name: '蜜蠟殼', from: ['honey', 'shell'], stat: { arm: 20, sm: 15 }, desc: '放完技能獲得 200 護盾' },
  moondew: { name: '月露', from: ['dew', 'dew'], stat: { mr: 50 }, desc: '開場相鄰友軍魔抗 +20，自己免疫第一次控制' },
});
const RECIPE = {};
for (const k in ITEMS) RECIPE[ITEMS[k].from.slice().sort().join('+')] = k;
// 紋章：裝上後多算一個羈絆（同一隻只能裝一個同名紋章，已有該羈絆的動物裝了無效）
const EMBLEMS = {};
for (const t in TRAITS) if (t !== 'king') EMBLEMS['emb_' + t] = { name: TRAITS[t].name + '紋章', trait: t, stat: {}, desc: '裝上後這隻動物多算一個「' + TRAITS[t].name + '」羈絆' }; // 百獸之王沒有紋章
// 消耗品：拖到棋子身上立即使用
const CONSUMABLES = {
  reforge: { name: '重鑄器', desc: '把這隻身上的裝備全部換成其他隨機裝備（材料換材料、成品換成品）' },
  dupe:    { name: '複製器', desc: '複製一隻同種類的 1 星動物到備戰席（卡池要有剩）' },
  remover: { name: '拆卸器', desc: '把這隻身上的裝備全部拆回裝備欄' },
};
const itemDef = k => MATS[k] || ITEMS[k] || EMBLEMS[k] || CONSUMABLES[k];

// 合體技：a、b 為動物 key，需分屬兩位隊友且開場相鄰
const COMBOS = [
  { id: 'hunt',   a: 'lion',     b: 'cheetah',  name: '狩獵圍捕', desc: '獵豹瞬移到血最少的敵人旁，生命低於 15% 直接斬殺，否則 250 物理傷害' },
  { id: 'swamp',  a: 'croc',     b: 'frog',     name: '沼澤陷阱', desc: '在敵人密集處生成一圈水池（中心＋周圍 6 格）5 秒' },
  { id: 'guard',  a: 'redpanda', b: 'koala',    name: '樹下守護', desc: '兩者回復 30% 生命，小熊貓受傷 −40% 持續 4 秒' },
  { id: 'toxic',  a: 'bee',      b: 'skunk',    name: '毒霧蜂群', desc: '我方蜜蜂與小蜂 5 秒內普攻附加中毒' },
  { id: 'throw',  a: 'elephant', b: 'squirrel', name: '象鼻投擲', desc: '大象把松鼠甩進敵方後排，落地 250 魔法範圍傷害並暈 0.5 秒' },
  { id: 'dusk',   a: 'owl',      b: 'bat',      name: '夜幕降臨', desc: '立即入夜，我方夜行單位能量 +30' },
];

// 野生回合陣容（team-local 座標 c,r；r=3 為前排）
const PVE = {
  1: [['hare', 2, 3], ['hare', 4, 3]],
  2: [['hare', 1, 3], ['hare', 3, 3], ['hare', 5, 3]],
  3: [['boar', 2, 3], ['boar', 4, 3]],
  8: [['boar', 1, 3], ['boar', 3, 3], ['boar', 5, 3], ['hare', 2, 1], ['hare', 4, 1]],
  // 第 3 階段起：魔王回合（野豬王＋小弟）
  13: [['kingboar', 3, 2], ['boar', 1, 3], ['boar', 5, 3], ['hare', 3, 3]],
  18: [['kingboar', 3, 2], ['boar', 0, 3], ['boar', 2, 3], ['boar', 4, 3], ['boar', 6, 3]],
  23: [['kingboar', 2, 2], ['kingboar', 4, 2], ['boar', 1, 3], ['boar', 3, 3], ['boar', 5, 3]],
};
const PVE_STAR = { 1: 1, 2: 1, 3: 1, 8: 2, 13: 2, 18: 3, 23: 3 };

const OWNER_COLORS = ['#3d7fc4', '#e08a2c', '#3d7fc4', '#e08a2c']; // 每隊第一人藍、第二人橘

// 場景：每個階段換一個；weights 為地形抽選權重，max 為每邊上限
const ARENAS = {
  jungle: { name: '叢林', weights: { grass: 3, tree: 2, water: 2, rock: 1, bounce: 2, shadow: 2 }, count: [5, 6], maxRock: 1, hills: [1, 2] },
  desert: { name: '沙漠', weights: { rock: 2, grass: 1, tree: 1, water: 1, burn: 3, bounce: 2, shadow: 1 }, count: [5, 6], maxRock: 2, hills: [2, 2] },
  city:   { name: '都市', weights: { rock: 2, water: 1, tree: 1, grass: 1, bounce: 2, burn: 2, shadow: 2 }, count: [5, 6], maxRock: 2, hills: [1, 2] },
};
// hills：每邊高台數量 [最少, 最多]，每座 2～3 格
const ARENA_ORDER = ['jungle', 'desert', 'city'];
// 地形在各場景的稱呼（畫面也會跟著換）
const TERRAIN_SKIN = {
  jungle: { grass: '蕨叢', water: '水塘', tree: '雨林樹', rock: '青苔石', bounce: '彈跳蘑菇', burn: '火焰蘭', shadow: '濃蔭', high: '青苔丘' },
  desert: { grass: '枯草叢', water: '綠洲', tree: '棕櫚樹', rock: '砂岩', bounce: '沙塵旋風', burn: '熔岩裂縫', shadow: '岩縫陰影', high: '平頂岩台' },
  city:   { grass: '樹籬', water: '積水', tree: '行道樹', rock: '路障', bounce: '蒸氣人孔', burn: '燃燒油桶', shadow: '暗巷', high: '階梯廣場' },
};

// ===== 海克斯增幅（參考 Gemini 規格書，改寫成自走棋版本）=====
// tier: 1 銀、2 金、3 彩；hook 說明效果在哪裡生效（econ 立即經濟、start 開場、tick 戰鬥中、hit 傷害、kill 擊殺、round 回合結算）
const AUGMENTS = [
  { id: 'ambush', tier: 1, name: '伏擊本能', hook: 'start', desc: '你站在草叢或最外側兩欄的棋子，開場隱身，第一擊 +50%。' },
  { id: 'wavestep', tier: 1, name: '輕足踏浪', hook: 'start', desc: '你的棋子不受水池減速，站在水池上攻擊 +20%。' },
  { id: 'fortress', tier: 1, name: '固若金湯', hook: 'start', desc: '你放在後兩排的棋子，護甲與魔抗 +25。' },
  { id: 'scout', tier: 1, name: '迅捷斥候', hook: 'start', desc: '你的 1 費棋子移動速度加倍，攻速 +15%。' },
  { id: 'united', tier: 1, name: '同仇敵愾', hook: 'hit', desc: '你的棋子每有一個相鄰友軍，受到傷害 −5%（最多 −20%）。' },
  { id: 'piggy', tier: 1, name: '存錢罐', hook: 'econ', desc: '立即獲得 8 金；利息上限從 5 提高到 6。' },
  { id: 'catstep', tier: 1, name: '貓步輕盈', hook: 'start', desc: '你的棋子閃避 +10%。' },
  { id: 'guarddog', tier: 1, name: '警戒看門犬', hook: 'start', desc: '你放在最後一排的棋子生命 +400、護甲 +20。' },
  { id: 'firstmove', tier: 1, name: '先制威懾', hook: 'start', desc: '戰鬥前 5 秒，你的棋子攻速 +40%。' },
  { id: 'nourish', tier: 1, name: '野性滋潤', hook: 'start', desc: '你站在草叢、水池或樹上的棋子，開場獲得 200 護盾。' },
  { id: 'recycle', tier: 1, name: '資源回收', hook: 'round', desc: '每場戰鬥後，你每陣亡一隻棋子 +1 金（最多 +4）。' },
  { id: 'howl', tier: 1, name: '狼群長嚎', hook: 'start', desc: '你的群居棋子攻速 +15%。' },
  { id: 'retreat', tier: 1, name: '退堂鼓', hook: 'kill', desc: '你的棋子擊殺後回復 15% 生命。' },
  { id: 'vanguard', tier: 1, name: '破陣尖兵', hook: 'start', desc: '你放在最前排的棋子攻擊 +20%。' },
  { id: 'discount', tier: 1, name: '打折狂潮', hook: 'econ', desc: '接下來 4 回合，商店刷新只要 1 金。' },
  { id: 'pounce', tier: 2, name: '猛獸飛撲', hook: 'start', desc: '你的近戰棋子開場撲向 3 格內最近的敵人，第一擊必定暴擊。' },
  { id: 'underdog', tier: 2, name: '以小博大', hook: 'hit', desc: '你的 1～3 費棋子對 4、5 費敵人傷害 +80%。' },
  { id: 'trample', tier: 2, name: '巨象踐踏', hook: 'tick', desc: '你的坦克（刺蝟、小熊貓、鱷魚、無尾熊、犀牛、大猩猩、大象、鯨魚）放技能時，周圍 1 格敵人被震暈 1 秒。' },
  { id: 'chainhunt', tier: 2, name: '連環狩獵', hook: 'kill', desc: '你的棋子擊殺後立刻再攻擊一次，並獲得 20 能量。' },
  { id: 'amphibious', tier: 2, name: '兩棲突擊', hook: 'start', desc: '你的所有棋子都享有水池效果，水域羈絆的護盾也套用在你全部棋子身上。' },
  { id: 'shadow', tier: 2, name: '暗影潛行', hook: 'start', desc: '你的棋子開場隱身，第一次攻擊前無法被選為目標。' },
  { id: 'gangup', tier: 2, name: '狼群圍剿', hook: 'hit', desc: '同一個敵人被你 2 隻以上棋子鎖定時，受到的傷害 +25%。' },
  { id: 'rapids', tier: 2, name: '激流勇進', hook: 'start', desc: '你的棋子移動速度 +60%，開場能量 +15。' },
  { id: 'goldrain', tier: 2, name: '金幣雨', hook: 'kill', desc: '你的棋子每擊殺一個敵人 +1 金（每回合最多 +3）；擊殺 4、5 費敵人時，下回合免費刷新一次。' },
  { id: 'roar', tier: 2, name: '威嚇咆哮', hook: 'start', desc: '開場你費用最高的棋子咆哮，2 格內敵人恐懼 1.5 秒。' },
  { id: 'quake', tier: 2, name: '巨像撼地', hook: 'tick', desc: '你的 4、5 費棋子每 6 秒震地，周圍 1 格敵人暈 0.5 秒並受 120 魔法傷害。' },
  { id: 'riposte', tier: 2, name: '回馬槍', hook: 'kill', desc: '你的棋子陣亡時，50% 機率對殺手造成其最大生命 30% 的真實傷害。' },
  { id: 'scapegoat', tier: 2, name: '替罪之身', hook: 'kill', desc: '你的 3 費以上棋子第一次將被擊殺時，由身邊最近的 1、2 費友軍代替陣亡，核心回復 30% 生命。' },
  { id: 'lastStand', tier: 2, name: '絕處逢生', hook: 'start', desc: '團隊血量低於 40 時，你的棋子攻擊與攻速 +25%。' },
  { id: 'lunge', tier: 2, name: '疾風突刺', hook: 'start', desc: '你的近戰棋子射程 +1。' },
  { id: 'beastking', tier: 3, minRound: 9, name: '百獸之王', hook: 'start', desc: '你場上費用最高的棋子成為獸王：體型 1.2 倍，生命與攻擊 +80%，開場能量 +30。' },
  { id: 'shift', tier: 3, name: '乾坤大挪移', hook: 'tick', desc: '戰鬥第 3 秒與第 12 秒，你血量最低的棋子與最健康的棋子互換位置，並各回復 50% 生命。' },
  { id: 'soulfeed', tier: 3, minRound: 9, name: '噬魂進化', hook: 'kill', desc: '你的棋子每擊殺一次，本場攻擊 +15%、生命上限 +10%。' },
  { id: 'domain', tier: 3, name: '絕對領域', hook: 'hit', desc: '敵人站在我方後兩排時，攻擊與護甲 −40%，每秒受到 30 真實傷害。' },
  { id: 'mutation', tier: 3, name: '基因突變', hook: 'start', desc: '你的每隻棋子都獲得 +25 護甲魔抗與 10% 護盾。' },
  { id: 'ark', tier: 3, name: '最後的方舟', hook: 'econ', desc: '團隊血量 +20；本局接下來前 2 次敗北不扣血。' },
  { id: 'rewind', tier: 3, name: '時間回溯', hook: 'tick', desc: '戰鬥第 12 秒，你存活的棋子生命回到開場時的數值，並獲得 20% 護盾。' },
  { id: 'meteor', tier: 3, name: '天降隕石', hook: 'tick', desc: '每 6 秒轟炸敵人最密集的一圈（中心＋周圍 6 格），造成 200 魔法傷害。' },
  { id: 'plague', tier: 3, name: '鼠疫肆虐', hook: 'tick', desc: '戰鬥中敵方全體每 4 秒攻擊與護甲 −6%（可疊加）。' },
  { id: 'beastgod', tier: 3, minRound: 14, name: '獸神降臨', hook: 'econ', desc: '立即獲得一隻 2 星的 5 費動物。' },
  { id: 'bind', tier: 3, name: '地靈束縛', hook: 'start', desc: '戰鬥開始時，敵方 2 隻前排棋子被定身 2.5 秒。' },
  { id: 'armsrace', tier: 3, minRound: 9, name: '軍備競賽', hook: 'econ', desc: '立即升 1 級並獲得 20 金；人口上限額外 +1（最多 10）。' },
  { id: 'mirror', tier: 3, minRound: 9, name: '鏡像分身', hook: 'start', desc: '開場複製你場上費用最高的棋子（生命 50%），分身存活不會讓敵方扣你血。' },
  { id: 'carnival', tier: 3, name: '生死狂歡', hook: 'kill', desc: '你的棋子每擊殺一次，你全部棋子回復 5% 生命並獲得 10 能量。' },
  { id: 'necro', tier: 3, minRound: 9, name: '通靈轉生', hook: 'kill', desc: '每場戰鬥你前 2 隻陣亡的棋子，1 秒後以全滿生命復活，並獲得 50 能量。' },
];
const AUG = {}; for (const a of AUGMENTS) AUG[a.id] = a;
const AUG_TIER_NAME = ['', '銀色', '金色', '彩色'];

// ===== 3 星進化（生命攻擊 +20%、技能 +30%、相鄰友軍攻速 +10%）=====
const EVOLVE = {
  hedgehog: '鋼刺蝟王', squirrel: '松果將軍', wolf: '狼王', frog: '蛙王', bat: '吸血伯爵', redpanda: '小熊貓武尊', skunk: '毒霧公爵',
  croc: '鱷魚霸主', bee: '蜂后', koala: '尤加利神', cheetah: '閃電獵豹', octopus: '深海巫師', owl: '月夜梟王', elephant: '萬象巨神', lion: '百獸之王',
  penguin: '冰原皇帝', rhino: '鋼角戰車', chameleon: '千面幻影', fox: '九尾狐', eagle: '蒼穹霸鷹', eel: '雷霆鰻神', gorilla: '叢林金剛', whale: '深藍巨鯨', peacock: '鳳凰孔雀', komodo: '龍蜥之王',
  deer: '森之聖鹿', zebra: '雷紋斑馬', hippo: '河神巨口', parrot: '虹羽鸚鵡', giraffe: '天梯長頸鹿', flamingo: '晚霞紅鶴', shark: '深淵鯊王', panda: '功夫熊貓',
};
// ===== 食物鏈：天敵對獵物傷害 +25% =====
const PREY = {
  lion: ['cheetah', 'wolf', 'boar', 'hare'], cheetah: ['hare', 'frog'], wolf: ['hare', 'squirrel', 'boar'],
  owl: ['squirrel', 'frog', 'bat', 'hare'], croc: ['frog', 'wolf', 'boar', 'hare'], bat: ['bee', 'minibee'],
  frog: ['bee', 'minibee'], skunk: ['bee', 'minibee'], hedgehog: ['frog'], bee: ['elephant'], elephant: ['lion'], octopus: ['croc'],
  eagle: ['squirrel', 'hare', 'fox', 'penguin', 'chameleon'], fox: ['hare', 'squirrel', 'frog'], komodo: ['boar', 'hare', 'wolf', 'rhino'],
  chameleon: ['bee', 'minibee'], peacock: ['frog', 'chameleon'], eel: ['frog', 'penguin'], whale: ['octopus'], penguin: ['eel'],
  shark: ['penguin', 'frog', 'flamingo'], lion: ['zebra', 'deer', 'cheetah', 'wolf', 'boar', 'hare'], croc: ['zebra', 'deer', 'frog', 'wolf', 'boar', 'hare'], hippo: ['croc'], parrot: ['bee', 'minibee'],
};
let PREY_BONUS = 25;
// ===== 天氣（依場地抽，每回合一次）=====
const WEATHER = {
  sunny: { name: '晴天', desc: '沒有特殊效果' },
  rain:  { name: '雨天', desc: '水域單位攻擊 +15%，所有單位每次普攻多回 2 能量' },
  fog:   { name: '濃霧', desc: '開場 3 秒全體隱身；遠程射程 −1' },
  sand:  { name: '沙塵暴', desc: '遠程射程 −1，天空單位閃避 −10%' },
  heat:  { name: '酷熱', desc: '全體攻速 +15%，草原單位再 +10%' },
};
const ARENA_WEATHER = { jungle: ['sunny', 'rain', 'rain', 'fog'], desert: ['sunny', 'sand', 'heat', 'heat'], city: ['sunny', 'rain', 'fog', 'heat'] };
// ===== 中立物件（雙方都能打，最後一擊的人拿獎勵）=====
Object.assign(EXTRA, {
  chest: { name: '寶箱', cost: 0, traits: [], hp: 500, atk: 0, ai: 999, rng: 0, arm: 20, mr: 20, mana: 999, sm: 0, mv: 99, neutral: true },
  crate: { name: '木箱', cost: 0, traits: [], hp: 300, atk: 0, ai: 999, rng: 0, arm: 0, mr: 0, mana: 999, sm: 0, mv: 99, neutral: true },
});
// ===== 戰鬥指令（每人每場一次）=====
const COMMANDS = {
  charge:  { name: '衝鋒', desc: '你的棋子攻速 +35%、攻擊 +15%，持續 4 秒' },
  rally:   { name: '集結', desc: '你的棋子受到傷害 −25%，持續 4 秒' },
  hold:    { name: '堅守', desc: '你的棋子回復 10% 生命並獲得 15% 護盾' },
};
// ===== 開局傳送門（全場投票）=====
const PORTALS = [
  { id: 'goldseason', name: '金幣雨季', desc: '每回合基本收入 +1' },
  { id: 'blitz', name: '速戰速決', desc: '準備時間 20 秒，團隊血量 80' },
  { id: 'harvest', name: '豐收之地', desc: '野生回合掉落加倍' },
  { id: 'headstart', name: '天生贏家', desc: '開局 Lv.3，多 3 金' },
  { id: 'eternalnight', name: '永夜', desc: '戰鬥一開始就是夜晚' },
  { id: 'prismatic', name: '海克斯狂熱', desc: '第一次海克斯一定是彩色' },
  { id: 'crowd', name: '群獸齊聚', desc: '卡池數量 +30%' },
  { id: 'quake', name: '地動山搖', desc: '每次換場地多 2 格地形' },
  { id: 'bond', name: '心有靈犀', desc: '合體技只要距離 2 格內就能觸發' },
  { id: 'xpboost', name: '經驗加速', desc: '每回合自動經驗 +4（原本 +2）' },
  { id: 'wildweather', name: '天氣多變', desc: '每回合一定是特殊天氣' },
  { id: 'freeroll', name: '神秘商人', desc: '每回合第一次刷新免費' },
];
// ===== 遭遇事件（指定回合隨機發生）=====
const ENCOUNTERS = [
  { id: 'merchant', name: '流浪商人', desc: '每人獲得 2 次免費刷新' },
  { id: 'picnic', name: '野餐補給', desc: '每人獲得 1 個隨機材料' },
  { id: 'zoo', name: '動物園開放', desc: '每人獲得一隻隨機 2 費動物' },
  { id: 'spring', name: '經驗之泉', desc: '每人經驗 +6' },
  { id: 'goldrain', name: '黃金雨', desc: '每人 +5 金' },
  { id: 'captain', name: '隊長的抉擇', desc: '隊長選擇：全隊每人 +4 金，或每人 1 件隨機成品裝備', choice: ['gold', 'item'] },
  { id: 'migration', name: '大遷徙', desc: '本回合商店只出同一個羈絆的動物' },
  { id: 'emblemrain', name: '天降紋章', desc: '每人獲得 1 個隨機紋章' },
  { id: 'storm', name: '暴風預報', desc: '接下來 3 回合都是特殊天氣' },
  { id: 'toolbox', name: '工具箱', desc: '每人獲得 1 個重鑄器和 1 個拆卸器' },
];

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

// ===== 戰鬥引擎：決定性整數模擬（同種子同結果，四台手機各自跑） =====
function makeRng(seed) {
  let a = seed >>> 0;
  const f = function (n) { // 回傳 0..n-1 整數
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) % n);
  };
  f.get = () => a; f.set = v => { a = v | 0; }; // 換房主時接續亂數狀態
  return f;
}
const SKILL_MUL = [0, 100, 150, 225];
const idx = (c, r) => r * CFG.COLS + c;
const inB = (c, r) => c >= 0 && c < CFG.COLS && r >= 0 && r < CFG.ROWS;
// ===== 六角格（odd-r：奇數列往右半格）。棋盤 CFG.COLS×CFG.ROWS（目前 9×10），以棋盤中心點對稱 =====
const hexD = (c1, r1, c2, r2) => { const q1 = c1 - ((r1 - (r1 & 1)) >> 1), q2 = c2 - ((r2 - (r2 & 1)) >> 1), dq = q1 - q2, dr = r1 - r2; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
const hexX = (c, r) => c + ((r & 1) ? 0.5 : 0); // 橫向實際位置（算「欄」範圍用）
const NB_EVEN = [[0, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [-1, -1]], NB_ODD = [[1, 1], [0, 1], [1, 0], [-1, 0], [1, -1], [0, -1]];
function hexNb(c, r, team) { // 鄰格順序：往前優先；對面隊伍用鏡像順序，雙方尋路偏好完全對稱
  if (team === 1) { const mc = CFG.COLS - 1 - c, mr = CFG.ROWS - 1 - r; return ((mr & 1) ? NB_ODD : NB_EVEN).map(([dc, dr]) => [CFG.COLS - 1 - (mc + dc), CFG.ROWS - 1 - (mr + dr)]); }
  return ((r & 1) ? NB_ODD : NB_EVEN).map(([dc, dr]) => [c + dc, r + dr]);
}
const dist = (a, b) => hexD(a.c, a.r, b.c, b.r);
const statOf = key => ANIMALS[key] || EXTRA[key];
const hasTrait = (u, t) => u.traits.indexOf(t) >= 0;

// input: { seed, terrain: {cellIdx:type}, units:[{key,star,owner,team,c,r,items}] }  (c,r 為全場座標，team0 在 r0-3)
function createBattle(input) {
  const B = {
    t: 0, rng: makeRng(input.seed), units: [], grid: new Array(CFG.COLS * CFG.ROWS).fill(-1),
    terrain: Object.assign({}, input.terrain || {}), temp: [], zones: [], ev: [], night: false,
    over: false, winner: -1, combos: [], nextId: 0, pve: !!input.pve,
    aug: input.aug || {}, low: input.low || {}, kills: {}, deaths: {}, bigKill: {}, revives: [], necroUsed: {},
    flags: input.flags || {}, weather: input.weather || 'sunny', cmdUsed: {}, loot: [],
    height: Object.assign({}, input.height || {}), landings: [],
  };
  for (const s of input.units) {
    let c = s.c, r = s.r;
    if (B.grid[idx(c, r)] !== -1 || B.terrain[idx(c, r)] === 'rock') { const f = freeNear(B, c, r, null); if (!f) continue; c = f[0]; r = f[1]; } // 前線爭奪等情況撞格時往旁邊挪
    const nu = spawn(B, s.key, s.star, s.owner, s.team, c, r, s.items || [], false); nu.uid = s.uid;
    if (s.mul) { nu.maxhp = Math.floor(nu.maxhp * s.mul / 100); nu.atk = Math.floor(nu.atk * s.mul / 100); } // 魔王依回合變強
  }
  for (const n of input.neutrals || []) if (B.grid[idx(n.c, n.r)] === -1 && B.terrain[idx(n.c, n.r)] !== 'rock') { const x = spawn(B, n.key, 1, -2, 2, n.c, n.r, [], false); x.maxhp = x.hp = n.hp || x.maxhp; }
  applyTraits(B);
  for (const u of B.units) {
    const tt = B.terrain[idx(u.c, u.r)];
    if (tt === 'grass') { u.stealth = true; u.firstHit = true; }
    if (u.waterShieldPct) u.shield += Math.floor(u.maxhp * u.waterShieldPct * (tt === 'water' ? 2 : 1) / 100);
    if (u.key === 'koala') u.asleep = true;
    if (u.key === 'chameleon') { u.stealth = true; u.firstHit = true; }
  }
  // 天氣、物品開場效果、進化光環
  for (const u of B.units) {
    if (u.neutral) continue;
    if ((B.weather === 'fog' || B.weather === 'sand') && u.rng >= 2) u.rng = Math.max(1, u.rng - 1);
    if (B.weather === 'fog') u.stealth = true;
    if (B.weather === 'sand' && hasTrait(u, 'sky')) u.dodge = Math.max(0, u.dodge - 10);
    for (const a of B.units) if (a !== u && a.alive && a.team === u.team && !a.neutral && dist(a, u) <= 1) {
      if (u.conch) a.arm += 20;
      if (u.moondew) a.mr += 20;
      if (u.evo) a.asPct += 10;
    }
  }
  if (B.flags.eternalnight) B.night = true;
  augStart(B);
  findCombos(B);
  return B;
}

function spawn(B, key, star, owner, team, c, r, items, summon) {
  const s = statOf(key), m = CFG.STAR_MUL[star];
  const u = {
    id: B.nextId++, key, star, owner, team, c, r, summon, alive: true,
    traits: s.traits.slice(), maxhp: Math.floor(s.hp * m / 100), atk: Math.floor(s.atk * m / 100),
    ai: s.ai, rng: s.rng, arm: s.arm, mr: s.mr, manaMax: s.mana, mana: s.sm, mv: s.mv,
    asPct: 0, atkPct: 0, baseDr: 0, shield: 0, dodge: 0, crit: 0, nightCrit: 0, regenPct: 0, packPct: 0,
    buffs: [], dots: [], target: -1, nextAtk: 0, mvFrom: null, busy: 0, stun: 0, invuln: 0, blind: 0,
    tauntBy: -1, tauntUntil: 0, stealth: false, firstHit: false, castCount: 0, items: items.slice(),
    lifesteal: key === 'bat' ? 20 : 0, sameHits: 0, lastTgt: -1, asleep: false, slept: 0,
    ccImmune: 0, fang: false, honeypot: false, skillAmp: false, toxicUntil: 0, dmgDone: 0, waterShieldPct: 0,
  };
  for (const it of items) {
    const d = MATS[it] || ITEMS[it] || EMBLEMS[it]; if (!d) continue;
    if (EMBLEMS[it] && u.traits.indexOf(EMBLEMS[it].trait) < 0) u.traits.push(EMBLEMS[it].trait);
    const st = d.stat;
    if (st.atk) u.atk += st.atk; if (st.hp) u.maxhp += st.hp; if (st.as) u.asPct += st.as;
    if (st.arm) u.arm += st.arm; if (st.mr) u.mr += st.mr; if (st.sm) u.mana += st.sm;
    if (it === 'fang') u.fang = true;
    if (it === 'hardshell') u.baseDr += 12;
    if (it === 'bigstick') u.atkPct += 40;
    if (it === 'honeypot') u.honeypot = true;
    if (it === 'nest') u.shield += 200;
    if (it === 'pearl') u.ccImmune = 1;
    if (it === 'beeswax') u.skillAmp = true;
    if (it === 'warhammer') u.warhammer = true;
    if (it === 'thornshell') u.thorn = (u.thorn || 0) + 15;
    if (it === 'frostbranch') u.frost = true;
    if (it === 'bigacorn') u.itemRegen = (u.itemRegen || 0) + 15; // 千分比
    if (it === 'fogcloak') u.cloakUntil = 60;
    if (it === 'honeyacorn') u.honeyHeal = true;
    if (it === 'galefeather') u.gale = true;
    if (it === 'featherarmor') u.dodge += 15;
    if (it === 'dewfeather') u.dewHit = true;
    if (it === 'pollen') u.pollen = true;
    if (it === 'conch') u.conch = true;
    if (it === 'waxshell') u.waxShell = true;
    if (it === 'moondew') { u.moondew = true; u.ccImmune = 1; }
  }
  // 3 星進化
  if (star >= 3 && ANIMALS[key]) { u.evo = true; u.maxhp = Math.floor(u.maxhp * 12 / 10); u.atk = Math.floor(u.atk * 12 / 10); }
  if (s.neutral) u.neutral = true;
  u.hp = u.maxhp;
  B.units.push(u);
  B.grid[idx(c, r)] = u.id;
  return u;
}

function traitCounts(units, team) {
  // 依「不同動物種類」計算，兩位隊友合併
  const seen = {}, cnt = {}, owners = {};
  for (const u of units) {
    if (u.team !== team || u.summon || !ANIMALS[u.key]) continue;
    for (const t of (u.traits || ANIMALS[u.key].traits)) {
      (owners[t] = owners[t] || {})[u.owner] = 1;
      if (seen[u.key + t]) continue; seen[u.key + t] = 1;
      cnt[t] = (cnt[t] || 0) + 1;
    }
  }
  const res = {};
  for (const t in TRAITS) {
    const c = cnt[t] || 0; let tier = -1;
    TRAITS[t].tiers.forEach((n, i) => { if (c >= n) tier = i; });
    res[t] = { count: c, tier, duo: tier >= 0 && Object.keys(owners[t] || {}).length >= 2 };
  }
  return res;
}

function applyTraits(B) {
  for (const team of [0, 1]) {
    const tc = traitCounts(B.units, team);
    const v = t => { const x = tc[t]; if (x.tier < 0) return 0; const b = TRAITS[t].val[x.tier]; return x.duo ? Math.floor(b * (100 + SYNERGY_BONUS) / 100) : b; };
    for (const u of B.units) {
      if (u.team !== team) continue;
      const top = t => tc[t] && tc[t].tier >= 0 && tc[t].tier === TRAITS[t].tiers.length - 1; // 湊到最高階
      if (hasTrait(u, 'forest')) u.regenPct = v('forest');
      if (top('forest')) u.regenPct = Math.max(u.regenPct, 4); // 生態圈：全隊回血
      if (v('savanna')) { if (hasTrait(u, 'savanna')) u.asPct += v('savanna'); u.mv = Math.max(3, u.mv - 1); }
      if (top('savanna')) u.ecoRush = true; // 生態圈：開場全隊攻速 +50%
      if (hasTrait(u, 'water')) u.waterShieldPct = v('water');
      if (hasTrait(u, 'sky')) u.dodge += v('sky');
      if (top('sky')) { u.dodge += 20; u.atkPct += 15; }
      if (hasTrait(u, 'pack') || top('pack')) u.packPct = v('pack');
      if (top('pack')) u.packAll = true; // 9 群居：全隊都算群居
      if (v('armor')) { const add = hasTrait(u, 'armor') ? v('armor') : [10, 15, 30][tc.armor.tier] || 10; u.arm += add; u.mr += add; }
      if (hasTrait(u, 'night')) u.nightCrit = v('night');
      if (v('king')) { const k = v('king'); u.maxhp = Math.floor(u.maxhp * (100 + k) / 100); u.hp = u.maxhp; u.atkPct += k; if (top('king') && hasTrait(u, 'king')) u.manaMax = Math.floor(u.manaMax * 70 / 100); }
    }
    B['traits' + team] = tc;
    // 生態圈（環境羈絆最高階）：記在戰場上，畫面換裝與專屬音樂也看這個
    B.eco = B.eco || {};
    for (const t of ['forest', 'savanna', 'water', 'sky']) if (tc[t] && tc[t].tier >= 0 && tc[t].tier === TRAITS[t].tiers.length - 1) { (B.eco[team] = B.eco[team] || {})[t] = 1; B.ev.push({ k: 'eco', team, t }); }
    if (B.eco[team] && B.eco[team].forest) B.ecoRevive = Object.assign(B.ecoRevive || {}, { [team]: 1 });
    if (tc.night && tc.night.tier === TRAITS.night.tiers.length - 1 && !B.night) { B.night = true; B.ev.push({ k: 'night' }); } // 永夜
  }
}

function findCombos(B) {
  for (const cb of COMBOS) for (const team of [0, 1]) {
    const as = B.units.filter(u => u.team === team && u.key === cb.a);
    const bs = B.units.filter(u => u.team === team && u.key === cb.b);
    let done = false;
    for (const a of as) { if (done) break; for (const b of bs) if ((a.owner !== b.owner || B.flags.solo) && a !== b && dist(a, b) <= (B.flags.bond ? 2 : 1)) { B.combos.push({ cb, a: a.id, b: b.id, team, fired: false }); done = true; break; } }
  }
}

// ---- 狀態工具 ----
const U = (B, id) => B.units[id];
function buffSum(B, u, stat) { let s = 0; for (const b of u.buffs) if (b.s === stat && b.u > B.t) s += b.v; return s; }
function terrainAt(B, c, r) {
  for (const z of B.temp) if (z.until > B.t && hexD(z.c, z.r, c, r) <= 1 && B.terrain[idx(c, r)] !== 'rock') return z.type;
  return B.terrain[idx(c, r)];
}
function inZone(B, u, kind, team) {
  for (const z of B.zones) if (z.kind === kind && z.team !== u.team && z.until > B.t && hexD(z.c, z.r, u.c, u.r) <= 1) return true;
  return false;
}
const isHigh = (B, c, r) => !!(B.height && B.height[idx(c, r)]);
const onTile = (B, u, type) => terrainAt(B, u.c, u.r) === type;
function hiddenFrom(B, e, u) { return (e.stealth || e.cloakUntil > B.t || onTile(B, e, 'shadow')) && dist(e, u) > 1; }
function effAtk(B, u) {
  let p = 100 + u.atkPct + buffSum(B, u, 'atk');
  if ((hasTrait(u, 'water') || u.wave) && terrainAt(B, u.c, u.r) === 'water') p += 20;
  if (inZone(B, u, 'gas')) p -= 30;
  if (u.plague) p -= 6 * u.plague;
  if (u.warhammer && u.hp * 100 < u.maxhp * 40) p += 35;
  if (B.weather === 'rain' && hasTrait(u, 'water')) p += 15;
  if (inDomain(B, u)) p -= 40;
  return Math.max(1, Math.floor(u.atk * p / 100));
}
function effInterval(B, u) {
  let p = 100 + u.asPct + buffSum(B, u, 'as');
  if (u.key === 'cheetah') p += Math.min(5, u.sameHits) * 8;
  if (u.ecoRush && B.t < 80) p += 50;
  if (inZone(B, u, 'swirl')) p -= 25;
  if (u.galeStacks) p += u.galeStacks * 3;
  if (B.weather === 'heat') p += 15 + (hasTrait(u, 'savanna') ? 10 : 0);
  if (onTile(B, u, 'burn')) p += BURN_AS;
  return Math.max(5, Math.floor(u.ai * 100 / p));
}
function effRange(B, u) { return u.rng + (u.rng >= 2 && terrainAt(B, u.c, u.r) === 'tree' ? 1 : 0) + (u.rng >= 2 && isHigh(B, u.c, u.r) ? HIGH.RANGE : 0); }
function enemies(B, u) { return B.units.filter(e => e.alive && e.team !== u.team); }
function allies(B, u) { return B.units.filter(e => e.alive && e.team === u.team); }

function stun(B, u, ticks, kind) {
  if (!u.alive || u.invuln > B.t) return;
  if (u.ccImmune) { u.ccImmune = 0; B.ev.push({ k: 'txt', id: u.id, s: '免疫' }); return; }
  u.stun = Math.max(u.stun, B.t + ticks);
  B.ev.push({ k: 'cc', id: u.id, s: kind || '暈' });
}
function heal(B, u, amt) {
  if (!u.alive || amt <= 0) return;
  const before = u.hp; u.hp = Math.min(u.maxhp, u.hp + amt);
  u.healed = (u.healed || 0) + (u.hp - before);
  if (u.hp - before >= 25) B.ev.push({ k: 'heal', id: u.id, a: u.hp - before });
}
function addDot(B, src, tgt, per, ticks, kind) { tgt.dots.push({ src: src.id, per, until: B.t + ticks, kind }); }

function damage(B, src, tgt, raw, type, o) {
  o = o || {};
  if (!tgt.alive) return 0;
  if (tgt.invuln > B.t) { B.ev.push({ k: 'miss', id: tgt.id, s: '無敵' }); return 0; }
  if (o.atk) {
    if (src.blind > B.t) { B.ev.push({ k: 'miss', id: tgt.id, s: '落空' }); return 0; }
    if (tgt.dodge && B.rng(100) < tgt.dodge) { B.ev.push({ k: 'miss', id: tgt.id, s: '閃避' }); return 0; }
    if (isHigh(B, tgt.c, tgt.r) && !isHigh(B, src.c, src.r) && B.rng(100) < HIGH.MISS) { B.ev.push({ k: 'miss', id: tgt.id, s: '仰攻落空' }); return 0; }
  }
  let amt = raw, crit = !!o.crit;
  if (o.skill && src.skillAmp) amt = Math.floor(amt * 130 / 100);
  if (src.packPct && (o.atk || o.skill)) {
    let n = 0; for (const a of B.units) if (a.alive && a !== src && a.team === src.team && (src.packAll || hasTrait(a, 'pack')) && dist(a, src) <= 1) n++;
    amt = Math.floor(amt * (100 + n * src.packPct) / 100);
  }
  if (o.atk && src.forceCrit) { crit = true; src.forceCrit = false; }
  if (PREY[src.key] && PREY[src.key].indexOf(tgt.key) >= 0) { amt = Math.floor(amt * (100 + PREY_BONUS) / 100); o.prey = true; }
  if (o.skill && src.evo) amt = Math.floor(amt * 130 / 100);
  if (o.atk && src.key === 'komodo' && tgt.dots.some(d => d.kind === 'poison' && d.until > B.t)) amt = Math.floor(amt * 130 / 100);
  if (hasAug(B, src, 'underdog') && costOf(src) <= 3 && costOf(tgt) >= 4) amt = Math.floor(amt * 180 / 100);
  if (hasAug(B, src, 'gangup')) { let n = 0; for (const a of B.units) if (a.alive && a.team === src.team && a.target === tgt.id) n++; if (n >= 2) amt = Math.floor(amt * 125 / 100); }
  if (!crit && o.atk) { const cc = src.crit + (B.night ? src.nightCrit : 0); if (cc && B.rng(100) < cc) crit = true; }
  if (crit) amt = Math.floor(amt * 150 / 100);
  if (o.atk && src.firstHit) { amt = Math.floor(amt * 150 / 100); src.firstHit = false; }
  if (B.t > CFG.OVERTIME_TICK) amt = Math.floor(amt * (100 + 10 * Math.floor((B.t - CFG.OVERTIME_TICK) / 20)) / 100);
  if (type === 'phys') {
    let arm = tgt.arm; if (tgt.key === 'croc' && terrainAt(B, tgt.c, tgt.r) === 'water') arm *= 2;
    if (tgt.plague) arm = Math.floor(arm * Math.max(10, 100 - 6 * tgt.plague) / 100);
    if (inDomain(B, tgt)) arm = Math.floor(arm * 60 / 100);
    amt = Math.floor(amt * 100 / (100 + Math.max(0, arm)));
  } else if (type === 'magic') amt = Math.floor(amt * 100 / (100 + Math.max(0, tgt.mr - buffSum(B, tgt, 'mrd'))));
  let dr = Math.min(80, tgt.baseDr + buffSum(B, tgt, 'dr'));
  if (hasAug(B, tgt, 'united')) { let n = 0; for (const a of B.units) if (a.alive && a !== tgt && a.team === tgt.team && dist(a, tgt) <= 1) n++; dr = Math.min(80, dr + Math.min(20, 5 * n)); }
  amt = Math.floor(amt * (100 - dr) / 100);
  if (amt < 1) amt = 1;
  let left = amt;
  if (tgt.shield > 0) { const ab = Math.min(tgt.shield, left); tgt.shield -= ab; left -= ab; }
  tgt.hp -= left;
  src.dmgDone += amt;
  B.ev.push({ k: 'dmg', id: tgt.id, a: amt, c: crit, ty: type, src: src.id, sk: !!o.skill, at: !!o.atk, prey: !!o.prey }); tgt.dmgTaken = (tgt.dmgTaken || 0) + amt;
  if (!tgt.asleep) tgt.mana += Math.min(15, 2 + Math.floor(amt / 40));
  else { tgt.slept += amt; if (tgt.slept * 100 >= tgt.maxhp * 15) wake(B, tgt, false); }
  if (o.atk && src.lifesteal) heal(B, src, Math.floor(amt * src.lifesteal / 100));
  if (o.atk && tgt.key === 'hedgehog' && statOf(src.key).rng === 1 && src.alive && tgt.hp > 0) {
    damage(B, tgt, src, Math.floor(amt * 20 / 100), 'magic', { reflect: true });
  }
  if (o.atk && src.fang) addDot(B, src, tgt, Math.max(1, Math.floor(tgt.maxhp * 4 / 300)), 60, 'bleed');
  if (o.atk && src.frost) tgt.buffs.push({ s: 'as', v: -20, u: B.t + 40 });
  if (o.atk && src.gale) src.galeStacks = Math.min(10, (src.galeStacks || 0) + 1);
  if (o.atk && src.pollen) src.mana += 5;
  if (o.atk && B.weather === 'rain') src.mana += 2;
  if (o.atk && tgt.thorn && src.alive && tgt.hp > 0) damage(B, tgt, src, Math.floor(amt * tgt.thorn / 100), 'magic', { reflect: true });
  if (o.atk && src.dewHit && tgt.hp > 0 && tgt.alive) damage(B, src, tgt, 35, 'magic', {});
  if (o.atk && src.toxicUntil > B.t) addDot(B, src, tgt, 30, 60, 'poison');
  if (tgt.hp <= 0) kill(B, tgt, src);
  return amt;
}

function kill(B, u, killer) {
  // 替罪之身：由身邊的 1、2 費友軍代替陣亡
  if (hasAug(B, u, 'scapegoat') && !u.scaped && costOf(u) >= 3) {
    let sub = null, sd = 99;
    for (const a of B.units) if (a.alive && a !== u && a.owner === u.owner && !a.summon && costOf(a) <= 2) { const d = dist(a, u); if (d < sd) { sd = d; sub = a; } }
    if (sub) { u.scaped = true; u.hp = Math.floor(u.maxhp * 30 / 100); B.ev.push({ k: 'txt', id: u.id, s: '替罪之身' }); B.ev.push({ k: 'aug', id: u.id, a: 'scapegoat', to: sub.id }); kill(B, sub, killer); return; }
  }
  u.alive = false; u.hp = 0;
  if (u.neutral) { if (B.grid[idx(u.c, u.r)] === u.id) B.grid[idx(u.c, u.r)] = -1; B.ev.push({ k: 'die', id: u.id, key: u.key, team: 2, by: killer ? killer.id : -1 }); if (killer && killer.owner >= 0) B.loot.push({ owner: killer.owner, key: u.key }); return; }
  if (!u.summon && u.owner >= 0) B.deaths[u.owner] = (B.deaths[u.owner] || 0) + 1;
  if (B.ecoRevive && B.ecoRevive[u.team] === 1 && !u.summon && !u.revived) { B.ecoRevive[u.team] = 2; u.revived = true; B.revives.push({ id: u.id, t: B.t + 20, c: u.c, r: u.r, eco: true }); } // 森林生態圈：第一個倒下的復活
  if (hasAug(B, u, 'riposte') && killer && killer.alive && killer !== u && B.rng(100) < 50) { B.ev.push({ k: 'aug', id: u.id, a: 'riposte', to: killer.id }); damage(B, u, killer, Math.floor(killer.maxhp * 30 / 100), 'true', {}); }
  if (hasAug(B, u, 'necro') && (B.necroUsed[u.owner] || 0) < 2 && !u.summon && !u.revived) { B.necroUsed[u.owner] = (B.necroUsed[u.owner] || 0) + 1; u.revived = true; B.revives.push({ id: u.id, t: B.t + 20, c: u.c, r: u.r }); }
  if (killer && killer.alive && killer.team !== u.team && killer.owner >= 0) {
    const ko = killer.owner;
    B.kills[ko] = (B.kills[ko] || 0) + 1; if (costOf(u) >= 4) B.bigKill[ko] = true;
    if (hasAug(B, killer, 'retreat')) heal(B, killer, Math.floor(killer.maxhp * 15 / 100));
    if (hasAug(B, killer, 'chainhunt')) { killer.nextAtk = B.t; killer.mana += 20; }
    if (hasAug(B, killer, 'soulfeed')) { killer.atkPct += 15; const add = Math.floor(killer.maxhp * 10 / 100); killer.maxhp += add; killer.hp += add; B.ev.push({ k: 'aug', id: killer.id, a: 'soulfeed' }); }
    if (hasAug(B, killer, 'carnival')) for (const a of B.units) if (a.alive && a.owner === ko) { heal(B, a, Math.floor(a.maxhp * 5 / 100)); a.mana += 10; }
  }
  if (B.grid[idx(u.c, u.r)] === u.id) B.grid[idx(u.c, u.r)] = -1;
  B.ev.push({ k: 'die', id: u.id, key: u.key, team: u.team, by: killer ? killer.id : -1 });
  if (u.key === 'minibee' && killer && killer.alive) damage(B, u, killer, 60, 'true', {});
}

function wake(B, u, byMana) {
  if (!u.asleep) return;
  u.asleep = false; u.castCount++;
  u.buffs.push({ s: 'atk', v: 80, u: B.t + 100 });
  if (byMana) u.mana = 0;
  B.ev.push({ k: 'skill', id: u.id, s: '起床氣！' });
}

// ---- 移動 ----
function passable(B, c, r, self) {
  if (!inB(c, r)) return false;
  if (B.terrain[idx(c, r)] === 'rock') return false;
  const g = B.grid[idx(c, r)];
  return g === -1 || g === self;
}
function moveTo(B, u, c, r, ticks) {
  B.grid[idx(u.c, u.r)] = -1;
  u.mvFrom = { c: u.c, r: u.r, t0: B.t, t1: B.t + ticks };
  u.c = c; u.r = r; B.grid[idx(c, r)] = u.id;
}
function teleport(B, u, c, r) {
  B.grid[idx(u.c, u.r)] = -1;
  u.mvFrom = { c: u.c, r: u.r, t0: B.t, t1: B.t + 4, jump: true };
  u.c = c; u.r = r; B.grid[idx(c, r)] = u.id;
}
function stepToward(B, u, tgt, range) {
  // BFS 找最近能打到目標的格子，回傳第一步
  const start = idx(u.c, u.r), prev = new Map([[start, -1]]), q = [[u.c, u.r]];
  let goal = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const [c, r] = q[qi];
    if (hexD(c, r, tgt.c, tgt.r) <= range) { goal = idx(c, r); break; }
    for (const [nc, nr] of hexNb(c, r, u.team)) {
      const k = idx(nc, nr);
      if (!passable(B, nc, nr, u.id) || prev.has(k)) continue;
      prev.set(k, idx(c, r)); q.push([nc, nr]);
    }
  }
  if (goal === -1 || goal === start) return null;
  let k = goal; while (prev.get(k) !== start) k = prev.get(k);
  return [k % CFG.COLS, Math.floor(k / CFG.COLS)];
}
function freeNear(B, c, r, from) {
  // 找 (c,r) 周圍最近的空格；from 用於平手時偏好
  let best = null, bd = 99;
  for (let rad = 1; rad <= 3 && !best; rad++) for (let nr = r - rad; nr <= r + rad; nr++) for (let nc = c - rad - 1; nc <= c + rad + 1; nc++) {
    if (hexD(c, r, nc, nr) !== rad || !passable(B, nc, nr, -2)) continue;
    const d = from ? hexD(nc, nr, from.c, from.r) : 0;
    if (d < bd) { bd = d; best = [nc, nr]; }
  }
  return best;
}
function clusterCenter(B, u) {
  // 敵人最密集的「半徑 1（7 格）」中心
  let best = null, bn = -1;
  for (const e of enemies(B, u)) {
    let n = 0; for (const f of enemies(B, u)) if (hexD(f.c, f.r, e.c, e.r) <= 1) n++;
    if (n > bn) { bn = n; best = e; }
  }
  return best;
}
// 塔防：往第 0 列（我方底線）走的下一步（會繞過擋路的棋子）
function tdMarch(B, u) {
  const start = idx(u.c, u.r), prev = new Map([[start, -1]]), q = [[u.c, u.r]];
  let goal = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const [c, r] = q[qi];
    if (r === 0) { goal = idx(c, r); break; }
    for (const [nc, nr] of hexNb(c, r, u.team)) {
      const k = idx(nc, nr);
      if (prev.has(k)) continue;
      if (!passable(B, nc, nr, u.id)) continue;
      prev.set(k, idx(c, r)); q.push([nc, nr]);
    }
  }
  if (goal === -1 || goal === start) return null;
  let k = goal; while (prev.get(k) !== start) k = prev.get(k);
  const nc = k % CFG.COLS, nr = Math.floor(k / CFG.COLS);
  return [nc, nr];
}
function pickTarget(B, u) {
  if (u.tauntUntil > B.t) { const tb = U(B, u.tauntBy); if (tb && tb.alive) return tb; }
  const cur = u.target >= 0 ? U(B, u.target) : null;
  const hidden = e => hiddenFrom(B, e, u);
  if (cur && cur.alive && !cur.neutral && !(hidden(cur) && enemies(B, u).some(e => !hidden(e) && !e.neutral))) return cur;
  let best = null, bd = 99;
  const all = enemies(B, u), es = all.filter(e => !e.neutral), vis = es.filter(e => !hidden(e)), pool = vis.length ? vis : es;
  // 中立物件：只有在射程內、而且附近沒有敵人時才順手打
  if (cur && cur.alive && cur.neutral && dist(u, cur) <= effRange(B, u) && !es.some(e => dist(u, e) <= effRange(B, u))) return cur;
  if (!es.some(e => dist(u, e) <= effRange(B, u))) for (const n of all) if (n.neutral && dist(u, n) <= effRange(B, u)) return n;
  for (const e of pool) { const d = dist(u, e); if (d < bd) { bd = d; best = e; } }
  return best;
}

// ---- 技能 ----
function cast(B, u) {
  const m = SKILL_MUL[u.star] || 100, sk = v => Math.floor(v * m / 100);
  const tgt = u.target >= 0 ? U(B, u.target) : null;
  const es = enemies(B, u);
  B.ev.push({ k: 'skill', id: u.id, s: (ANIMALS[u.key] || {}).skill || '', tg: u.target });
  u.stealth = false;
  switch (u.key) {
    case 'hedgehog':
      u.invuln = B.t + 30;
      for (const e of es) if (dist(e, u) <= 1) damage(B, u, e, sk(120), 'magic', { skill: 1 });
      break;
    case 'squirrel': {
      const t0 = tgt && tgt.alive ? tgt : pickTarget(B, u); if (!t0) break;
      B.ev.push({ k: 'proj', id: u.id, tg: t0.id, s: 'acorn' });
      damage(B, u, t0, sk(150), 'phys', { skill: 1 });
      const rest = es.filter(e => e.alive && e !== t0).sort((a, b) => dist(a, t0) - dist(b, t0) || a.id - b.id).slice(0, 2);
      for (const e of rest) { B.ev.push({ k: 'proj', id: t0.id, tg: e.id, s: 'acorn' }); damage(B, u, e, sk(105), 'phys', { skill: 1 }); }
      break; }
    case 'wolf':
      { const ids = []; for (const a of allies(B, u)) if (a === u || (hasTrait(a, 'pack') && dist(a, u) <= 2)) { a.buffs.push({ s: 'as', v: 30, u: B.t + 80 }); ids.push(a.id); } B.ev.push({ k: 'buff', id: u.id, ids, s: 'as' }); }
      break;
    case 'frog': {
      let far = null, fd = -1;
      for (const e of es) { const d = dist(e, u); if (d <= 4 && d > fd) { fd = d; far = e; } }
      if (!far) break;
      if (fd > 1 && far.invuln <= B.t) { const spot = freeNear(B, u.c, u.r, far); if (spot) teleport(B, far, spot[0], spot[1]); }
      B.ev.push({ k: 'proj', id: u.id, tg: far.id, s: 'tongue' });
      damage(B, u, far, sk(220), 'magic', { skill: 1 }); stun(B, far, 30);
      break; }
    case 'bat': {
      const t0 = tgt && tgt.alive ? tgt : pickTarget(B, u); if (!t0) break;
      const d = damage(B, u, t0, sk(180), 'phys', { skill: 1 }); heal(B, u, d);
      break; }
    case 'redpanda':
      { const ids = []; for (const e of es) if (dist(e, u) <= 2) { e.tauntBy = u.id; e.tauntUntil = B.t + 60; e.target = u.id; ids.push(e.id); } B.ev.push({ k: 'taunt', id: u.id, ids }); }
      u.buffs.push({ s: 'dr', v: 30, u: B.t + 60 });
      break;
    case 'skunk': {
      const cc = clusterCenter(B, u); if (!cc) break;
      B.zones.push({ kind: 'gas', team: u.team, c: cc.c, r: cc.r, until: B.t + 80, per: sk(40), src: u.id }); B.ev.push({ k: 'zone', kind: 'gas', c: cc.c, r: cc.r, id: u.id });
      break; }
    case 'croc':
      if (tgt && tgt.alive) { stun(B, tgt, 40); damage(B, u, tgt, sk(300), 'phys', { skill: 1 }); }
      break;
    case 'bee':
      for (let i = 0; i < 3; i++) {
        const spot = freeNear(B, u.c, u.r, tgt || u); if (!spot) break;
        const mb = spawn(B, 'minibee', u.star, u.owner, u.team, spot[0], spot[1], [], true);
        if (u.toxicUntil > B.t) mb.toxicUntil = u.toxicUntil;
        B.ev.push({ k: 'spawn', id: mb.id });
      }
      break;
    case 'koala':
      if (u.asleep) { wake(B, u, true); return; }
      u.buffs.push({ s: 'atk', v: 80, u: B.t + 100 });
      if (tgt && tgt.alive) damage(B, u, tgt, sk(250), 'phys', { skill: 1 });
      break;
    case 'cheetah': {
      let low = null; for (const e of es) if (!low || e.hp * 1000 / e.maxhp < low.hp * 1000 / low.maxhp) low = e;
      if (!low) break;
      if (dist(low, u) > 1) { const spot = freeNear(B, low.c, low.r, u); if (spot) teleport(B, u, spot[0], spot[1]); }
      u.target = low.id; u.sameHits = 0;
      damage(B, u, low, sk(300), 'phys', { skill: 1 });
      break; }
    case 'octopus': {
      const cc = clusterCenter(B, u); if (!cc) break;
      B.zones.push({ kind: 'ink', team: u.team, c: cc.c, r: cc.r, until: B.t + 30, per: 0 }); B.ev.push({ k: 'zone', kind: 'ink', c: cc.c, r: cc.r, id: u.id });
      for (const e of es) if (hexD(e.c, e.r, cc.c, cc.r) <= 1) {
        damage(B, u, e, sk(200), 'magic', { skill: 1 }); e.blind = Math.max(e.blind, B.t + 60); B.ev.push({ k: 'cc', id: e.id, s: '致盲' });
      }
      break; }
    case 'owl': {
      let low = null; for (const e of es) if (!low || e.hp < low.hp) low = e;
      if (!low) break;
      B.ev.push({ k: 'proj', id: u.id, tg: low.id, s: 'owl' });
      damage(B, u, low, sk(350), 'phys', { skill: 1, crit: 1 });
      break; }
    case 'kingboar': // 魔王：震地
      for (const e of es) if (dist(e, u) <= 2) { stun(B, e, 25); damage(B, u, e, sk(150), 'magic', { skill: 1 }); }
      B.ev.push({ k: 'shake', id: u.id });
      break;
    case 'elephant':
      for (const e of es) if (dist(e, u) <= 2) { stun(B, e, 30); damage(B, u, e, sk(220), 'magic', { skill: 1 }); }
      B.ev.push({ k: 'shake', id: u.id });
      break;
    case 'lion':
      { const ids = []; for (const a of allies(B, u)) { a.buffs.push({ s: 'atk', v: 25, u: B.t + 120 }); ids.push(a.id); } B.ev.push({ k: 'buff', id: u.id, ids, s: 'atk' }); }
      for (const e of es) if (dist(e, u) <= 2) stun(B, e, 30, '恐懼');
      break;
    // ---- v0.5 新動物 ----
    case 'penguin': {
      let far = null, fd = -1; for (const e of es) { const d = dist(e, u); if (d <= 3 && d > fd) { fd = d; far = e; } }
      if (!far) far = tgt && tgt.alive ? tgt : null; if (!far) break;
      if (dist(far, u) > 1) { const spot = freeNear(B, far.c, far.r, u); if (spot) { teleport(B, u, spot[0], spot[1]); u.mvFrom.t1 = B.t + 8; u.mvFrom.slide = true; u.mvFrom.jump = false; } }
      u.target = far.id; B.ev.push({ k: 'dash', id: u.id, tg: far.id, s: 'slide' });
      damage(B, u, far, sk(160), 'magic', { skill: 1 }); stun(B, far, 20);
      for (const e of es) if (e !== far && e.alive && dist(e, u) <= 1) damage(B, u, e, sk(80), 'magic', { skill: 1 });
      break; }
    case 'rhino': {
      let far = null, fd = -1; for (const e of es) { const d = dist(e, u); if (d <= 3 && d > fd) { fd = d; far = e; } }
      if (!far) far = tgt && tgt.alive ? tgt : null; if (!far) break;
      if (dist(far, u) > 1) { const spot = freeNear(B, far.c, far.r, u); if (spot) { teleport(B, u, spot[0], spot[1]); u.mvFrom.t1 = B.t + 8; u.mvFrom.slide = true; u.mvFrom.jump = false; } }
      u.target = far.id; B.ev.push({ k: 'dash', id: u.id, tg: far.id, s: 'charge' });
      damage(B, u, far, sk(220), 'phys', { skill: 1 }); stun(B, far, 25, '擊飛');
      u.shield += sk(180);
      break; }
    case 'chameleon': {
      let low = null; for (const e of es) if (dist(e, u) <= 3 && (!low || e.hp < low.hp)) low = e;
      if (!low) low = tgt && tgt.alive ? tgt : null; if (!low) break;
      B.ev.push({ k: 'proj', id: u.id, tg: low.id, s: 'tongue' });
      damage(B, u, low, sk(280), 'phys', { skill: 1 });
      u.stealth = true; u.forceCrit = true; u.target = low.id;
      break; }
    case 'fox': {
      let best = null; for (const e of es) if (!e.neutral && (!best || (e.rng >= 2) > (best.rng >= 2) || ((e.rng >= 2) === (best.rng >= 2) && e.atk > best.atk))) best = e;
      if (!best) break;
      if (dist(best, u) > 1) { const spot = freeNear(B, best.c, best.r, u); if (spot) { teleport(B, u, spot[0], spot[1]); u.mvFrom.t1 = B.t + 10; u.mvFrom.big = true; } }
      u.target = best.id;
      damage(B, u, best, sk(240), 'phys', { skill: 1 }); best.mana = Math.max(0, best.mana - 40);
      break; }
    case 'eagle': {
      const t0 = tgt && tgt.alive && !tgt.neutral ? tgt : pickTarget(B, u); if (!t0) break;
      stun(B, t0, 30, '被抓走');
      if (t0.alive && t0.invuln <= B.t) { t0.mvFrom = { c: t0.c, r: t0.r, t0: B.t, t1: B.t + 30, jump: true, grab: true }; }
      B.ev.push({ k: 'grab', id: u.id, tg: t0.id });
      B.landings.push({ id: t0.id, t: B.t + 30, by: u.id, dmg: sk(380), splash: sk(120) });
      break; }
    case 'eel': {
      let cur = tgt && tgt.alive ? tgt : pickTarget(B, u); if (!cur) break;
      const hit = [cur.id], chain = [u.id, cur.id]; let amt = sk(260);
      damage(B, u, cur, amt, 'magic', { skill: 1 }); stun(B, cur, 10, '麻痺');
      for (let i = 0; i < 4; i++) {
        let nx = null, nd = 99; for (const e of es) if (e.alive && !hit.includes(e.id)) { const d = dist(e, cur); if (d < nd || (d === nd && e.id < nx.id)) { nd = d; nx = e; } }
        if (!nx || nd > 3) break;
        amt = Math.floor(amt * 85 / 100); hit.push(nx.id); chain.push(nx.id);
        damage(B, u, nx, amt, 'magic', { skill: 1 }); stun(B, nx, 10, '麻痺'); cur = nx;
      }
      B.ev.push({ k: 'chain', id: u.id, ids: chain });
      break; }
    case 'gorilla': {
      const ids = []; for (const e of es) if (dist(e, u) <= 2) { e.tauntBy = u.id; e.tauntUntil = B.t + 50; e.target = u.id; ids.push(e.id); } B.ev.push({ k: 'taunt', id: u.id, ids });
      u.shield += Math.floor(u.maxhp * 18 / 100);
      for (const e of es) if (dist(e, u) <= 1) damage(B, u, e, sk(200), 'magic', { skill: 1 });
      break; }
    case 'whale': {
      const ux = hexX(u.c, u.r); // 以自己為中心、左右各 1 格寬的直線帶
      for (const e of es) if (Math.abs(hexX(e.c, e.r) - ux) <= 1) { damage(B, u, e, sk(260), 'magic', { skill: 1 }); stun(B, e, 20); }
      for (const a of allies(B, u)) if (Math.abs(hexX(a.c, a.r) - ux) <= 1) heal(B, a, Math.floor(a.maxhp * 15 / 100));
      B.ev.push({ k: 'wave', id: u.id, c: u.c, x: ux });
      break; }
    case 'peacock': {
      for (const e of es) if (dist(e, u) <= 3) stun(B, e, 30, '魅惑');
      const ids = []; for (const a of allies(B, u)) if (dist(a, u) <= 3) { a.buffs.push({ s: 'as', v: 30, u: B.t + 80 }); a.buffs.push({ s: 'dr', v: 20, u: B.t + 80 }); ids.push(a.id); }
      B.ev.push({ k: 'buff', id: u.id, ids, s: 'as' });
      break; }
    // ---- v0.13 新動物 ----
    case 'deer': {
      let low = null; for (const a of allies(B, u)) if (!low || a.hp * 1000 / a.maxhp < low.hp * 1000 / low.maxhp) low = a;
      if (low) heal(B, low, sk(200));
      const ids = []; for (const a of allies(B, u)) if (hasTrait(a, 'forest') && dist(a, u) <= 2) { heal(B, a, Math.floor(a.maxhp * 6 / 100)); ids.push(a.id); }
      B.ev.push({ k: 'buff', id: u.id, ids: low ? ids.concat(low.id) : ids, s: 'heal' });
      break; }
    case 'zebra': {
      const t0 = tgt && tgt.alive ? tgt : pickTarget(B, u); if (!t0) break;
      damage(B, u, t0, sk(170), 'phys', { skill: 1 }); t0.blind = Math.max(t0.blind, B.t + 40); B.ev.push({ k: 'cc', id: t0.id, s: '致盲' });
      break; }
    case 'hippo': {
      const ids = []; for (const e of es) if (dist(e, u) <= 1) { e.tauntBy = u.id; e.tauntUntil = B.t + 40; e.target = u.id; ids.push(e.id); } B.ev.push({ k: 'taunt', id: u.id, ids });
      if (tgt && tgt.alive) damage(B, u, tgt, sk(200), 'magic', { skill: 1 });
      u.shield += Math.floor(u.maxhp * 22 / 100);
      break; }
    case 'parrot': {
      const list = es.filter(e => e.alive && !e.neutral).sort((a, b) => dist(a, u) - dist(b, u) || a.id - b.id).slice(0, 3);
      for (const e of list) { B.ev.push({ k: 'proj', id: u.id, tg: e.id, s: 'feather' }); damage(B, u, e, sk(130), 'phys', { skill: 1 }); e.buffs.push({ s: 'mrd', v: 20, u: B.t + 80 }); }
      break; }
    case 'giraffe': {
      for (const e of es) if (e.alive && dist(e, u) <= 2) {
        damage(B, u, e, sk(200), 'phys', { skill: 1 });
        if (e.alive && e.invuln <= B.t) { const dc = Math.sign(e.c - u.c), dr = Math.sign(e.r - u.r), nc = e.c + dc, nr = e.r + dr; if (nc >= 0 && nc < CFG.COLS && nr >= 0 && nr < CFG.ROWS && passable(B, nc, nr, e.id)) teleport(B, e, nc, nr); }
      }
      B.ev.push({ k: 'shake', id: u.id });
      break; }
    case 'flamingo': {
      const cc = clusterCenter(B, u); if (!cc) break;
      B.zones.push({ kind: 'swirl', team: u.team, c: cc.c, r: cc.r, until: B.t + 60, per: sk(90), src: u.id }); B.ev.push({ k: 'zone', kind: 'swirl', c: cc.c, r: cc.r, id: u.id });
      break; }
    case 'shark': {
      let low = null; for (const e of es) if (!e.neutral && (!low || e.hp * 1000 / e.maxhp < low.hp * 1000 / low.maxhp)) low = e;
      if (!low) break;
      if (dist(low, u) > 1) { const spot = freeNear(B, low.c, low.r, u); if (spot) teleport(B, u, spot[0], spot[1]); }
      u.target = low.id;
      const bonus = low.hp * 2 < low.maxhp ? 160 : 100;
      damage(B, u, low, Math.floor(sk(260) * bonus / 100), 'phys', { skill: 1 });
      if (!low.alive) u.mana += 50;
      break; }
    case 'panda': {
      const fwd = u.team === 0 ? 1 : -1, hit = [];
      for (const e of es) if (e.alive && dist(e, u) <= 2 && (e.r - u.r) * fwd >= -1) { damage(B, u, e, sk(240), 'magic', { skill: 1 }); stun(B, e, 20); hit.push(e.id); }
      heal(B, u, Math.floor(u.maxhp * 18 / 100));
      B.ev.push({ k: 'shake', id: u.id });
      break; }
    case 'komodo': {
      const t0 = tgt && tgt.alive ? tgt : pickTarget(B, u); if (!t0) break;
      damage(B, u, t0, sk(260), 'phys', { skill: 1 });
      if (t0.alive) addDot(B, u, t0, Math.max(1, Math.floor(t0.maxhp * 6 / 100 * m / 100)), 100, 'poison');
      heal(B, u, Math.floor(u.maxhp * 20 / 100));
      break; }
  }
  u.castCount++;
  if (u.honeyHeal) heal(B, u, Math.floor(u.maxhp * 12 / 100));
  if (u.waxShell) u.shield += 200;
  if (hasAug(B, u, 'trample') && TANKS.includes(u.key)) { for (const e of enemies(B, u)) if (dist(e, u) <= 1) stun(B, e, 20); B.ev.push({ k: 'aug', id: u.id, a: 'trample' }); }
}

function fireCombo(B, cbx) {
  const a = U(B, cbx.a), b = U(B, cbx.b);
  cbx.fired = true;
  B.ev.push({ k: 'combo', a: a.id, b: b.id, s: cbx.cb.name });
  const es = enemies(B, a);
  switch (cbx.cb.id) {
    case 'hunt': { // b = 獵豹
      let low = null; for (const e of es) if (!low || e.hp < low.hp) low = e;
      if (!low) break;
      const spot = freeNear(B, low.c, low.r, b); if (spot) teleport(B, b, spot[0], spot[1]);
      b.target = low.id;
      if (low.hp * 100 < low.maxhp * 15) damage(B, b, low, low.hp + low.shield + 9999, 'true', { skill: 1 });
      else damage(B, b, low, Math.floor(250 * SKILL_MUL[b.star] / 100), 'phys', { skill: 1 });
      break; }
    case 'swamp': {
      const cc = clusterCenter(B, a); if (cc) { B.temp.push({ type: 'water', c: cc.c, r: cc.r, until: B.t + 100 }); B.ev.push({ k: 'zone', kind: 'water', c: cc.c, r: cc.r, id: a.id }); }
      break; }
    case 'guard':
      heal(B, a, Math.floor(a.maxhp * 30 / 100)); heal(B, b, Math.floor(b.maxhp * 30 / 100));
      a.buffs.push({ s: 'dr', v: 40, u: B.t + 80 });
      break;
    case 'toxic':
      for (const x of allies(B, a)) if (x.key === 'bee' || x.key === 'minibee') x.toxicUntil = B.t + 100;
      break;
    case 'throw': { // b = 松鼠
      let back = null; for (const e of es) if (!back || (a.team === 0 ? e.r > back.r : e.r < back.r) || (e.r === back.r && e.id < back.id)) back = e;
      if (!back) break;
      const spot = freeNear(B, back.c, back.r, b); if (spot) teleport(B, b, spot[0], spot[1]);
      for (const e of es) if (dist(e, b) <= 1) { damage(B, a, e, Math.floor(250 * SKILL_MUL[a.star] / 100), 'magic', { skill: 1 }); stun(B, e, 10); }
      break; }
    case 'dusk':
      B.night = true;
      for (const x of allies(B, a)) if (hasTrait(x, 'night')) x.mana += 30;
      break;
  }
}

// ---- 主迴圈 ----
function step(B) {
  if (B.over) return;
  B.t++;
  const t = B.t;
  if (!B.night && t >= CFG.NIGHT_TICK) { B.night = true; B.ev.push({ k: 'night' }); }
  if (B.eco && t % 120 === 0) for (const team of [0, 1]) if (B.eco[team] && B.eco[team].water) { // 水域生態圈：每 6 秒巨浪
    const src = B.units.find(x => x.alive && x.team === team && hasTrait(x, 'water')) || B.units.find(x => x.alive && x.team === team); if (!src) continue;
    B.ev.push({ k: 'ecowave', team, id: src.id });
    for (const e of B.units) if (e.alive && e.team !== team && !e.neutral) damage(B, src, e, 120, 'magic', {});
    for (const a of B.units) if (a.alive && a.team === team) heal(B, a, Math.floor(a.maxhp * 5 / 100));
  }
  augTick(B);
  // 開場：蝙蝠飛向後排
  if (t === 1) for (const u of B.units) if (u.key === 'bat' && u.alive) {
    let back = null; for (const e of enemies(B, u)) if (!back || (u.team === 0 ? e.r > back.r : e.r < back.r) || (e.r === back.r && e.id < back.id)) back = e;
    if (back) { const spot = freeNear(B, back.c, back.r, u); if (spot) { teleport(B, u, spot[0], spot[1]); u.target = back.id; } }
  }
  const sec = t % 20 === 0;
  // 區域傷害
  if (sec) for (const z of B.zones) if (z.until >= t && z.per) {
    const src = U(B, z.src);
    for (const e of B.units) if (e.alive && e.team !== z.team && hexD(e.c, e.r, z.c, z.r) <= 1) damage(B, src, e, z.per, 'magic', {});
  }
  envTick(B);
  const order = (t & 1) ? B.units.slice().reverse() : B.units; // 每 tick 交替行動順序，避免先手優勢
  for (const u of order) {
    if (!u.alive || u.neutral) continue;
    if (sec) {
      for (const d of u.dots) if (d.until >= t && u.alive) damage(B, U(B, d.src), u, d.per, 'magic', {});
      u.dots = u.dots.filter(d => d.until > t);
      if (!u.alive) continue;
      const onTree = terrainAt(B, u.c, u.r) === 'tree';
      if (u.regenPct) heal(B, u, Math.floor(u.maxhp * u.regenPct * (onTree ? 2 : 1) / 100));
      if (u.itemRegen) heal(B, u, Math.floor(u.maxhp * u.itemRegen / 1000));
      if (u.asleep) { heal(B, u, Math.floor(u.maxhp * 5 * (onTree ? 2 : 1) / 100)); u.mana += 10; }
      if (t % 100 === 0) u.buffs = u.buffs.filter(b => b.u > t);
    }
    if (u.asleep) { if (u.mana >= u.manaMax) wake(B, u, true); continue; }
    if (u.stun > t) continue;
    if (u.mvFrom && u.mvFrom.t1 > t) continue;
    if (u.mvFrom) u.mvFrom = null;
    if (u.busy > t) continue;
    if (u.mana >= u.manaMax && u.manaMax < 999) {
      u.mana = u.honeypot ? 25 : 0;
      cast(B, u); u.busy = t + 8;
      continue;
    }
    let tg = pickTarget(B, u);
    if (B.td) { // 塔防模式：我方守住位置不追；敵方只在靠近時交戰，否則一路往我方底線走（飛行的直接飛過去，只會順手打射程內的）
      if (u.team === 0 && tg && dist(u, tg) > effRange(B, u) + (u.rng <= 1 ? (B.td.leash || 0) : 0)) tg = null; // 近戰可以往前追幾格
      if (u.team === 1 && (!tg || dist(u, tg) > effRange(B, u) + (hasTrait(u, 'sky') ? 0 : (B.td.engage || 0)))) {
        const nx = tdMarch(B, u); if (nx) moveTo(B, u, nx[0], nx[1], u.mv); continue;
      }
    }
    if (!tg) continue;
    if (tg.id !== u.target) { u.target = tg.id; }
    if (dist(u, tg) <= effRange(B, u)) {
      if (t >= u.nextAtk) {
        if (u.key === 'cheetah') { if (u.lastTgt === tg.id) u.sameHits++; else u.sameHits = 0; u.lastTgt = tg.id; }
        B.ev.push({ k: 'atk', id: u.id, tg: tg.id, rg: u.rng > 1 });
        u.stealth = false;
        damage(B, u, tg, effAtk(B, u), 'phys', { atk: 1 });
        u.mana += 10;
        u.nextAtk = t + effInterval(B, u);
      }
    } else {
      const nx = stepToward(B, u, tg, effRange(B, u));
      if (nx) {
        let mt = u.mv;
        if (!hasTrait(u, 'water') && terrainAt(B, nx[0], nx[1]) === 'water') mt = Math.floor(mt * 13 / 10);
        if (isHigh(B, nx[0], nx[1]) && !isHigh(B, u.c, u.r)) mt = Math.floor(mt * (100 + HIGH.CLIMB_PCT) / 100);
        moveTo(B, u, nx[0], nx[1], mt);
      } else u.target = -1;
    }
  }
  for (const cbx of B.combos) if (!cbx.fired) {
    const a = U(B, cbx.a), b = U(B, cbx.b);
    if (a.alive && b.alive && a.castCount > 0 && b.castCount > 0) fireCombo(B, cbx);
  }
  B.zones = B.zones.filter(z => z.until >= t);
  B.temp = B.temp.filter(z => z.until > t);
  if (B.td) return; // 塔防：結束與否由波次程式判斷
  const alive0 = B.units.some(u => u.alive && u.team === 0), alive1 = B.units.some(u => u.alive && u.team === 1);
  if (!alive0 || !alive1) { B.over = true; B.winner = alive0 ? 0 : alive1 ? 1 : -1; }
  else if (t >= CFG.COMBAT_MAX_TICK) { B.over = true; B.winner = -1; }
}

// ===== 地形互動：彈射、灼燒（v0.5）=====
function envDamage(B, u, amt, kind) {
  if (!u.alive || u.invuln > B.t || amt <= 0) return;
  let left = amt; if (u.shield > 0) { const ab = Math.min(u.shield, left); u.shield -= ab; left -= ab; }
  u.hp -= left; u.dmgTaken = (u.dmgTaken || 0) + amt;
  B.ev.push({ k: 'dmg', id: u.id, a: amt, c: false, ty: 'true', src: -1, env: kind });
  if (u.hp <= 0) kill(B, u, null);
}
function envTick(B) {
  const t = B.t, sec = t % 20 === 0;
  for (const u of B.units) {
    if (!u.alive || u.neutral) continue;
    const tt = terrainAt(B, u.c, u.r), moving = u.mvFrom && u.mvFrom.t1 > t;
    // 彈射：站滿 2 秒，彈到對面同款地塊旁
    if (tt === 'bounce' && !moving && !(u.bounceCd > t)) {
      u.bounceT = (u.bounceT || 0) + 1;
      if (u.bounceT >= BOUNCE_TICKS) {
        u.bounceT = 0; u.bounceCd = t + 100;
        const pc = CFG.COLS - 1 - u.c, pr = CFG.ROWS - 1 - u.r;
        const spot = passable(B, pc, pr, -2) ? [pc, pr] : freeNear(B, pc, pr, u);
        if (spot) {
          const fc = u.c, fr = u.r;
          B.grid[idx(u.c, u.r)] = -1; u.c = spot[0]; u.r = spot[1]; B.grid[idx(u.c, u.r)] = u.id;
          u.mvFrom = { c: fc, r: fr, t0: t, t1: t + 18, jump: true, big: true };
          u.target = -1; u.busy = t + 18;
          B.landings.push({ id: u.id, t: t + 18 });
          B.ev.push({ k: 'launch', id: u.id, fc, fr, c: u.c, r: u.r });
        }
      }
    } else if (!moving) u.bounceT = 0;
    // 灼燒：每秒失去 4% 生命
    if (sec && tt === 'burn') envDamage(B, u, Math.max(1, Math.floor(u.maxhp * BURN_PCT / 100)), 'burn');
  }
  B.landings = B.landings.filter(L => {
    if (L.t > t) return true;
    const u = B.units[L.id]; if (!u || !u.alive) return false;
    if (L.by !== undefined) { // 老鷹摔下
      const src = B.units[L.by];
      B.ev.push({ k: 'land', id: u.id, drop: true });
      damage(B, src, u, L.dmg, 'phys', { skill: 1 });
      for (const e of B.units) if (e.alive && e !== u && e.team === u.team && dist(e, u) <= 1) damage(B, src, e, L.splash, 'phys', { skill: 1 });
      return false;
    }
    B.ev.push({ k: 'land', id: u.id });
    for (const e of enemies(B, u)) if (dist(e, u) <= 1 && !e.neutral) damage(B, u, e, BOUNCE_DMG, 'magic', {});
    return false;
  });
}

function runBattle(input) {
  const B = createBattle(input);
  while (!B.over) { step(B); B.ev.length = 0; }
  return B;
}
function survivorStars(B, team) {
  let s = 0; for (const u of B.units) if (u.alive && u.team === team && !u.summon) s += u.star; return s;
}

// ===== 海克斯增幅：戰鬥內效果 =====
const TANKS = ['hedgehog', 'redpanda', 'croc', 'koala', 'rhino', 'gorilla', 'elephant', 'whale'];
const costOf = u => (ANIMALS[u.key] || { cost: 0 }).cost;
function hasAug(B, u, id) { const a = u && u.owner >= 0 && B.aug[u.owner]; return !!(a && a.indexOf(id) >= 0); }
function ownersWith(B, id) { const r = []; for (const k in B.aug) if (B.aug[k].indexOf(id) >= 0) r.push(+k); return r; }
function teamOfOwner(B, o) { const u = B.units.find(x => x.owner === o); return u ? u.team : -1; }
function backRow(team, r, n) { return team === 0 ? r < n : r >= CFG.ROWS - n; }
function inDomain(B, u) {
  if (!B.domainTeams) { B.domainTeams = []; for (const o of ownersWith(B, 'domain')) { const t = teamOfOwner(B, o); if (t >= 0 && !B.domainTeams.includes(t)) B.domainTeams.push(t); } }
  for (const t of B.domainTeams) if (u.team !== t && backRow(t, u.r, 2)) return true;
  return false;
}
function augStart(B) {
  const byOwner = {};
  for (const u of B.units) if (u.owner >= 0) (byOwner[u.owner] = byOwner[u.owner] || []).push(u);
  for (const u of B.units) {
    if (u.owner < 0) continue;
    const tt = B.terrain[idx(u.c, u.r)], A = ANIMALS[u.key] || {};
    if (hasAug(B, u, 'ambush') && (tt === 'grass' || u.c === 0 || u.c === CFG.COLS - 1)) { u.stealth = true; u.firstHit = true; }
    if (hasAug(B, u, 'wavestep')) u.wave = true;
    if (hasAug(B, u, 'fortress') && backRow(u.team, u.r, 2)) { u.arm += 25; u.mr += 25; }
    if (hasAug(B, u, 'scout') && A.cost === 1) { u.mv = Math.max(2, Math.floor(u.mv / 2)); u.asPct += 15; }
    if (hasAug(B, u, 'catstep')) u.dodge += 10;
    if (hasAug(B, u, 'guarddog') && backRow(u.team, u.r, 1)) { u.maxhp += 400; u.hp += 400; u.arm += 20; }
    if (hasAug(B, u, 'firstmove')) u.buffs.push({ s: 'as', v: 40, u: 100 });
    if (hasAug(B, u, 'nourish') && (tt === 'grass' || tt === 'water' || tt === 'tree')) u.shield += 200;
    if (hasAug(B, u, 'howl') && hasTrait(u, 'pack')) u.asPct += 15;
    if (hasAug(B, u, 'vanguard') && (u.team === 0 ? u.r === CFG.ROWS_HALF - 1 : u.r === CFG.ROWS_HALF)) u.atkPct += 20;
    if (hasAug(B, u, 'pounce') && u.rng === 1) { u.pounce = true; u.forceCrit = true; }
    if (hasAug(B, u, 'amphibious')) { u.wave = true; if (!u.waterShieldPct) u.shield += Math.floor(u.maxhp * 15 / 100); }
    if (hasAug(B, u, 'shadow')) u.stealth = true;
    if (hasAug(B, u, 'rapids')) { u.mv = Math.max(2, Math.floor(u.mv * 6 / 10)); u.mana += 15; }
    if (hasAug(B, u, 'lastStand') && B.low[u.owner]) { u.atkPct += 25; u.asPct += 25; }
    if (hasAug(B, u, 'lunge') && u.rng === 1) u.rng = 2;
    if (hasAug(B, u, 'mutation')) { u.arm += 25; u.mr += 25; u.shield += Math.floor(u.maxhp * 10 / 100); }
    u.startHp = u.maxhp;
  }
  for (const o in byOwner) {
    const list = byOwner[o].filter(u => !u.summon);
    if (!list.length) continue;
    const top = list.slice().sort((a, b) => (costOf(b) - costOf(a)) || (b.star - a.star) || a.id - b.id)[0];
    if (hasAug(B, top, 'beastking')) { top.king = true; top.maxhp = Math.floor(top.maxhp * 18 / 10); top.hp = top.maxhp; top.startHp = top.maxhp; top.atk = Math.floor(top.atk * 18 / 10); top.mana += 30; }
    if (hasAug(B, top, 'mirror')) {
      const spot = freeNear(B, top.c, top.r, null);
      if (spot) { const m = spawn(B, top.key, top.star, top.owner, top.team, spot[0], spot[1], top.items, true); m.maxhp = Math.floor(m.maxhp / 2); m.hp = m.maxhp; m.mirror = true; for (const k of ['traits', 'asPct', 'arm', 'mr', 'dodge', 'packPct', 'regenPct', 'nightCrit']) if (k !== 'traits') m[k] = top[k]; B.ev.push({ k: 'spawn', id: m.id }); if (m.key === 'koala') m.asleep = true; }
    }
  }
}
function augTick(B) {
  const t = B.t;
  if (t === 1) {
    for (const u of B.units) if (u.alive && u.pounce) {
      let best = null, bd = 99; for (const e of enemies(B, u)) { const d = dist(e, u); if (d <= 3 && d < bd) { bd = d; best = e; } }
      if (best && bd > 1) { const spot = freeNear(B, best.c, best.r, u); if (spot) { teleport(B, u, spot[0], spot[1]); u.target = best.id; B.ev.push({ k: 'aug', id: u.id, a: 'pounce' }); } }
    }
    for (const o of ownersWith(B, 'roar')) {
      const list = B.units.filter(u => u.alive && u.owner === o && !u.summon); if (!list.length) continue;
      const top = list.sort((a, b) => (costOf(b) - costOf(a)) || (b.star - a.star))[0];
      for (const e of enemies(B, top)) if (dist(e, top) <= 2) stun(B, e, 30, '恐懼');
      B.ev.push({ k: 'aug', id: top.id, a: 'roar' });
    }
    for (const o of ownersWith(B, 'bind')) {
      const tm = teamOfOwner(B, o); if (tm < 0) continue;
      const foes = B.units.filter(u => u.alive && u.team !== tm).sort((a, b) => (tm === 0 ? a.r - b.r : b.r - a.r) || a.id - b.id).slice(0, 2);
      for (const e of foes) { stun(B, e, 50, '定身'); B.ev.push({ k: 'aug', id: e.id, a: 'bind' }); }
    }
  }
  if (t % 120 === 0) {
    for (const u of B.units) if (u.alive && hasAug(B, u, 'quake') && costOf(u) >= 4) { for (const e of enemies(B, u)) if (dist(e, u) <= 1) { stun(B, e, 10); damage(B, u, e, 120, 'magic', {}); } B.ev.push({ k: 'aug', id: u.id, a: 'quake' }); }
    for (const o of ownersWith(B, 'meteor')) {
      const src = B.units.find(u => u.alive && u.owner === o); if (!src) continue;
      const cc = clusterCenter(B, src); if (!cc) continue;
      B.ev.push({ k: 'zone', kind: 'meteor', c: cc.c, r: cc.r, id: src.id });
      for (const e of enemies(B, src)) if (hexD(e.c, e.r, cc.c, cc.r) <= 1) damage(B, src, e, 200, 'magic', {});
    }
  }
  if (t % 20 === 0 && ownersWith(B, 'domain').length) { const src0 = B.units.find(u => u.alive && hasAug(B, u, 'domain')); if (src0) for (const e of B.units) if (e.alive && inDomain(B, e)) damage(B, src0, e, 30, 'true', {}); }
  if (t % 80 === 0) for (const o of ownersWith(B, 'plague')) { const tm = teamOfOwner(B, o); if (tm < 0) continue; for (const e of B.units) if (e.alive && e.team !== tm) e.plague = (e.plague || 0) + 1; B.ev.push({ k: 'aug', id: -1, a: 'plague', team: tm }); }
  if (t === 60 || t === 240) for (const o of ownersWith(B, 'shift')) {
    const list = B.units.filter(u => u.alive && u.owner === o && !u.summon); if (list.length < 2) continue;
    list.sort((a, b) => a.hp * 1000 / a.maxhp - b.hp * 1000 / b.maxhp);
    const lo = list[0], hi = list[list.length - 1];
    const lc = lo.c, lr = lo.r, hc = hi.c, hr = hi.r;
    B.grid[idx(lc, lr)] = -1; B.grid[idx(hc, hr)] = -1;
    lo.mvFrom = { c: lc, r: lr, t0: t, t1: t + 6, jump: true }; hi.mvFrom = { c: hc, r: hr, t0: t, t1: t + 6, jump: true };
    lo.c = hc; lo.r = hr; hi.c = lc; hi.r = lr; B.grid[idx(lo.c, lo.r)] = lo.id; B.grid[idx(hi.c, hi.r)] = hi.id;
    heal(B, lo, Math.floor(lo.maxhp * 50 / 100)); heal(B, hi, Math.floor(hi.maxhp * 50 / 100));
    B.ev.push({ k: 'aug', id: lo.id, a: 'shift', to: hi.id });
  }
  if (t === 240) for (const u of B.units) if (u.alive && hasAug(B, u, 'rewind')) { u.hp = Math.max(u.hp, Math.min(u.maxhp, u.startHp)); u.shield += Math.floor(u.maxhp * 20 / 100); B.ev.push({ k: 'aug', id: u.id, a: 'rewind' }); }
  B.revives = B.revives.filter(rv => {
    if (rv.t > t) return true;
    const u = B.units[rv.id];
    const spot = passable(B, rv.c, rv.r, -2) ? [rv.c, rv.r] : freeNear(B, rv.c, rv.r, null);
    if (!spot) return false;
    u.alive = true; u.hp = rv.eco ? Math.floor(u.maxhp / 2) : u.maxhp; u.c = spot[0]; u.r = spot[1]; u.mvFrom = null; u.stun = 0; u.mana = Math.min(u.manaMax - 1, 50); u.dots = [];
    B.grid[idx(u.c, u.r)] = u.id; B.ev.push({ k: 'revive', id: u.id }); B.ev.push(rv.eco ? { k: 'txt', id: u.id, s: '萬木回春' } : { k: 'aug', id: u.id, a: 'necro' });
    return false;
  });
}

// ===== 戰鬥指令：每位玩家每場一次 =====
function battleCommand(B, owner, type) {
  if (B.over || B.cmdUsed[owner] || !COMMANDS[type]) return false;
  B.cmdUsed[owner] = type;
  for (const u of B.units) if (u.alive && u.owner === owner) {
    if (type === 'charge') { u.buffs.push({ s: 'as', v: 35, u: B.t + 80 }); u.buffs.push({ s: 'atk', v: 15, u: B.t + 80 }); }
    if (type === 'rally') u.buffs.push({ s: 'dr', v: 25, u: B.t + 80 });
    if (type === 'hold') { heal(B, u, Math.floor(u.maxhp * 10 / 100)); u.shield += Math.floor(u.maxhp * 15 / 100); }
  }
  B.ev.push({ k: 'cmd', owner, type });
  (B.cmdLog = B.cmdLog || []).push({ t: B.t, owner, type }); // 連線時讓其他玩家在同一個 tick 重現
  return true;
}

// ===== 對局流程：經濟、卡池、升星、送禮、回合、AI =====
const isPve = R => R <= 3 || (R - 3) % 5 === 0;
const isBoss = R => isPve(R) && R >= 13; // 第 3 階段起的野生回合是魔王
const BOSS_CFG = { STAR: 2, MUL: { 13: 100, 18: 320, 23: 300 }, MUL_STEP: 80 }; // 魔王星數；各回合生命攻擊倍率（%），之後每 5 回合 +MUL_STEP
const bossMul = R => BOSS_CFG.MUL[R] || (BOSS_CFG.MUL[23] + Math.floor((R - 23) / 5) * BOSS_CFG.MUL_STEP); // 魔王固定幾星（強度主要調 data.js 的 EXTRA.kingboar）
const stageOf = R => R <= 3 ? 1 : 2 + Math.floor((R - 4) / 5);
const stageStart = R => R === 1 || (R >= 4 && (R - 4) % 5 === 0);
// team 本地座標（自己半場 r0 後排 → r3 前排）↔ 全場座標
// side：0 = 下半場、1 = 上半場（team1 的座標點對稱翻轉）
const CENTER_COLS = () => { const m = (CFG.COLS - 1) >> 1, o = [m]; for (let d = 1; d <= m; d++) o.push(m - d, m + d); return o.slice(0, 5); }; // 由中間往兩邊
const toGlobal = (side, c, r) => side === 0 ? [c, r] : [CFG.COLS - 1 - c, CFG.ROWS - 1 - r];
const toLocal = toGlobal; // 對稱
// 多隊模式：每兩隊共用一塊棋盤存放（隊 0/1 用 0～55，隊 2/3 用 100～155…），戰鬥時再搬到同一張戰場
const BSTRIDE = 100;
const SIDE = t => t & 1, GRP = t => t >> 1;
const cellBase = k => k % BSTRIDE;
const cellRC = k => { const b = k % BSTRIDE; return [b % CFG.COLS, Math.floor(b / CFG.COLS)]; };
const teamCell = (team, gcell) => GRP(team) * BSTRIDE + gcell; // 隊伍棋盤上的格子編號
const aliveTeams = G => G.teams.map((T, i) => T.out ? -1 : i).filter(i => i >= 0);
const sellValue = u => { const c = ANIMALS[u.key].cost; const n = Math.pow(3, u.star - 1); return c * n - (u.star > 1 && c > 1 ? 1 : 0); };
const power = u => ANIMALS[u.key].cost * u.star * u.star + u.items.length;

// 自訂房間規則（大廳可改）
const DEFAULT_RULES = { teams: 2, teamHp: CFG.TEAM_HP, prepSec: CFG.PREP_SEC, maxRound: CFG.MAX_ROUND, augments: true, portals: true, encounters: true, weather: true, carousel: true, neutrals: true, frontline: false, commands: true, bans: [], aiLevel: 'normal' };
function createGame(opt) {
  const rules = Object.assign({}, DEFAULT_RULES, opt.rules || {});
  const G = {
    seed: opt.seed >>> 0, rng: makeRng(opt.seed), round: 0, phase: 'lobby', timer: 0, rules, portal: null, portalVote: null, weather: 'sunny', stormLeft: 0,
    draft: null, encounter: null, migration: null, pings: [], lootLog: [], speed: 1,
    solo: !!(opt.solo || rules.solo), // 單人混戰：每人自己一隊
    teams: Array.from({ length: (opt.solo || rules.solo) ? opt.players.length : opt.players.length >> 1 }, (_, t) => ({ hp: rules.teamHp, streak: 0, ark: 0, bank: 0, captain: (opt.solo || rules.solo) ? t : t * 2, out: false, place: 0 })),
    players: opt.players.map((p, i) => ({
      id: i, name: p.name, team: (opt.solo || rules.solo) ? i : i >> 1, slot: (opt.solo || rules.solo) ? 0 : i % 2, ai: !!p.ai, out: false,
      gold: CFG.START_GOLD, xp: 0, level: CFG.START_LEVEL, bench: new Array(CFG.BENCH).fill(null),
      items: [], ready: false, giftedGold: 0, lastIncome: null, shop: [], locked: false,
      augs: [], augChoice: null, augRolled: [], popBonus: 0, discount: 0, freeRoll: 0, killGold: 0, reserved: {}, avoidCells: {}, vote: null, firstRollFree: false,
    })),
    meta: opt.meta || [], // 伺服器整理的高勝率玩家陣容（電腦模仿用；開局分配完就刪掉，不進畫面同步）
    board: {}, pool: {}, terrain: {}, height: {}, arena: 'jungle', arenaStart: 0, uid: 1, battles: [], log: [], winner: -1, lastResult: null, acc: 0,
  };
  const poolMul = G.teams.length > 2 ? CFG.POOL_8P_PCT : 100; // 8 人局卡池放大
  for (const k in ANIMALS) G.pool[k] = (rules.bans.includes(k) || !(ANIMALS[k].cost >= 1)) ? 0 : Math.floor((CFG.POOL[ANIMALS[k].cost] || 0) * poolMul / 100); // 費用 0 ＝ 停用
  G.lastOpp = G.teams.map(() => -1);
  return G;
}
const teammate = (G, pid) => G.players.find(p => p.team === G.players[pid].team && p.id !== pid);
function ownUnits(G, pid) {
  const res = [];
  for (const k in G.board) if (G.board[k].owner === pid) res.push({ u: G.board[k], zone: 'board', cell: +k });
  G.players[pid].bench.forEach((u, i) => { if (u) res.push({ u, zone: 'bench', i }); });
  return res;
}
const boardCount = (G, pid) => Object.values(G.board).filter(u => u.owner === pid).length;
function inHalf(team, cell) { if (Math.floor(cell / BSTRIDE) !== GRP(team)) return false; const r = cellRC(cell)[1]; return SIDE(team) === 0 ? r < CFG.ROWS_HALF : r >= CFG.ROWS_HALF; }
// 前線爭奪：開啟時可以把棋子放進敵方最前排（每人最多 1 隻；只有 2 隊模式）
const enemyFront = (team, cell) => Math.floor(cell / BSTRIDE) === GRP(team) && cellRC(cell)[1] === (SIDE(team) === 0 ? CFG.ROWS_HALF : CFG.ROWS_HALF - 1);
function canPlace(G, P, cell) { return inHalf(P.team, cell) || (G.rules.frontline && G.teams.length === 2 && enemyFront(P.team, cell)); }
const intruders = (G, pid) => Object.keys(G.board).filter(k => G.board[k].owner === pid && !inHalf(G.players[pid].team, +k)).length;

function newUnit(G, key, star, owner) { return { uid: G.uid++, key, star: star || 1, owner, items: [] }; }

function checkMerge(G, pid) {
  const P = G.players[pid];
  for (let guard = 0; guard < 6; guard++) {
    const groups = {};
    const benchOnly = G.phase !== 'prep'; // 戰鬥中只合成備戰席上的，場上的等回合結束再合
    for (const o of ownUnits(G, pid)) { if (o.u.star >= 3 || (benchOnly && o.zone === 'board')) continue; const k = o.u.key + '|' + o.u.star; (groups[k] = groups[k] || []).push(o); }
    let merged = false;
    for (const k in groups) {
      const g = groups[k]; if (g.length < 3) continue;
      g.sort((a, b) => (a.zone === 'board' ? 0 : 1) - (b.zone === 'board' ? 0 : 1));
      const keep = g[0], rest = g.slice(1, 3);
      let items = keep.u.items.slice();
      for (const o of rest) { items = items.concat(o.u.items); if (o.zone === 'board') delete G.board[o.cell]; else P.bench[o.i] = null; }
      keep.u.star++;
      keep.u.items = items.slice(0, CFG.MAX_ITEMS);
      P.items.push(...items.slice(CFG.MAX_ITEMS));
      G.log.push({ k: 'merge', pid, key: keep.u.key, star: keep.u.star, uid: keep.u.uid, eaten: rest.map(o => o.u.uid) });
      merged = true; break;
    }
    if (!merged) break;
  }
}

function canAfford(P, key) { return P.gold >= ANIMALS[key].cost; }
// 送隊友的上限：每個大回合（階段）重算
function giftReset(G, P) { const st = stageOf(Math.max(1, G.round)); if (P.giftStage !== st) { P.giftStage = st; P.giftedGold = 0; P.giftedUnits = 0; } }
const stageArr = (arr, st) => arr[Math.min(st, arr.length - 1)];
function giftGoldLeft(G, P) { giftReset(G, P); return Math.max(0, stageArr(CFG.GIFT_GOLD_STAGE, stageOf(Math.max(1, G.round))) - (P.giftedGold || 0)); }
function giftUnitLeft(G, P) { giftReset(G, P); return Math.max(0, CFG.GIFT_UNIT_STAGE - (P.giftedUnits || 0)); }
function giftMaxStar(G) { return Math.min(2, stageArr(CFG.GIFT_UNIT_STAR, stageOf(Math.max(1, G.round)))); }
function rollShop(G, P) {
  if (G.td && typeof tdRollShop === 'function') return tdRollShop(G, P); // 塔防：小商店
  const odds = CFG.SHOP_ODDS[P.level];
  P.shop = [];
  for (let i = 0; i < CFG.SHOP_SIZE; i++) {
    let roll = G.rng(100), cost = 1;
    for (let c = 0; c < odds.length; c++) { if (roll < odds[c]) { cost = c + 1; break; } roll -= odds[c]; }
    const mig = k => !G.migration || ANIMALS[k].traits.includes(G.migration);
    let keys = Object.keys(ANIMALS).filter(k => ANIMALS[k].cost === cost && G.pool[k] > 0 && mig(k));
    if (!keys.length && G.migration) keys = Object.keys(ANIMALS).filter(k => G.pool[k] > 0 && mig(k) && ANIMALS[k].cost <= cost);
    if (!keys.length) keys = Object.keys(ANIMALS).filter(k => G.pool[k] > 0 && ANIMALS[k].cost <= cost);
    if (!keys.length) { P.shop.push(null); continue; }
    let tot = 0; for (const k of keys) tot += G.pool[k];
    let r = G.rng(tot), pick = keys[0];
    for (const k of keys) { if (r < G.pool[k]) { pick = k; break; } r -= G.pool[k]; }
    P.shop.push(pick);
  }
}

// ---- 玩家動作（連線版由房主套用） ----
function act(G, pid, a) {
  const P = G.players[pid];
  if (G.phase === 'over' || G.phase === 'lobby' || P.out) return 'bad';
  if (G.phase !== 'prep') {
    // 戰鬥中：可以買賣、刷新、升級、整理備戰席；場上的棋子不能動
    const onBoard = uid => ownUnits(G, pid).some(o => o.u.uid === uid && o.zone === 'board');
    if (a.t === 'move' && (a.to.zone !== 'bench' || onBoard(a.uid))) return 'board_locked';
    if ((a.t === 'sell' || (a.t === 'gift' && a.uid)) && onBoard(a.uid)) return 'board_locked'; // 裝備可以在戰鬥中放（場上的棋子下一場生效，跟聯盟戰棋一樣）
  }
  switch (a.t) {
    case 'reroll': {
      const cost = G.td && typeof TD_CFG !== 'undefined' ? TD_CFG.REROLL : P.firstRollFree ? 0 : rerollCost(P);
      if (P.gold < cost) return 'no_gold';
      P.gold -= cost; if (P.firstRollFree) P.firstRollFree = false; else if (P.freeRoll > 0 && cost === 0) P.freeRoll--;
      rollShop(G, P); G.log.push({ k: 'reroll', pid }); return 'ok';
    }
    case 'aug': {
      if (!P.augChoice || !P.augChoice.includes(a.id)) return 'bad';
      P.augChoice = null; P.augs.push(a.id); applyAugNow(G, P, a.id);
      G.log.push({ k: 'aug', pid, id: a.id }); return 'ok';
    }
    case 'lock': P.locked = !P.locked; return 'ok';
    case 'buy': {
      a.key = P.shop[a.slot]; const A = ANIMALS[a.key]; if (!A) return 'bad';
      if (G.pool[a.key] <= 0) return 'pool_empty';
      if (P.gold < A.cost) return 'no_gold';
      let slot = P.bench.indexOf(null);
      if (slot < 0) {
        const same = ownUnits(G, pid).filter(o => o.u.key === a.key && o.u.star === 1).length;
        if (same < 2) return 'bench_full';
      }
      P.gold -= A.cost; G.pool[a.key]--; P.shop[a.slot] = null;
      const u = newUnit(G, a.key, 1, pid);
      G.log.push({ k: 'buy', pid, uid: u.uid, slot: a.slot });
      if (slot >= 0) P.bench[slot] = u;
      else { P.bench.push(u); checkMerge(G, pid); compactBench(G, P); return 'ok'; }
      checkMerge(G, pid);
      return 'ok';
    }
    case 'sell': {
      const o = ownUnits(G, pid).find(o => o.u.uid === a.uid); if (!o) return 'bad';
      P.gold += sellValue(o.u); G.pool[o.u.key] += Math.pow(3, o.u.star - 1); G.log.push({ k: 'sell', pid, uid: o.u.uid, gold: sellValue(o.u) });
      P.items.push(...o.u.items);
      if (o.zone === 'board') delete G.board[o.cell]; else P.bench[o.i] = null;
      return 'ok';
    }
    case 'move': {
      const o = ownUnits(G, pid).find(o => o.u.uid === a.uid); if (!o) return moveMateUnit(G, pid, a); // 不是自己的：可能是在搬電腦隊友的棋子
      if (a.to.zone === 'bench') {
        const i = a.to.i, other = P.bench[i];
        if (o.zone === 'bench') { P.bench[o.i] = other; P.bench[i] = o.u; return 'ok'; }
        delete G.board[o.cell]; P.bench[i] = o.u; if (other) G.board[o.cell] = other;
        return 'ok';
      }
      const cell = a.to.cell;
      if (G.td && !tdCanPlace(G, cell)) return 'td_line';
      if (!canPlace(G, P, cell) || G.terrain[cellBase(cell)] === 'rock') return 'bad_cell';
      if (!inHalf(P.team, cell) && !(o.zone === 'board' && !inHalf(P.team, o.cell)) && intruders(G, pid) >= 1) return 'front_full';
      const occ = G.board[cell];
      if (occ && G.players[occ.owner].team !== P.team) return 'enemy_cell';
      if (occ && occ.owner !== pid) {
        // 跟隊友的棋子互換：只限電腦隊友（真人隊友的棋子不能動）
        const Mo = G.players[occ.owner];
        if (Mo.team !== P.team || !Mo.ai) return 'teammate_cell';
        if (o.zone === 'bench') { // 從備戰席放到電腦隊友的位置：電腦的棋子讓到它的備戰席
          if (G.phase !== 'prep' || boardCount(G, pid) >= popCap(P)) return 'teammate_cell';
          const sl = Mo.bench.indexOf(null); if (sl < 0) return 'teammate_cell';
          delete G.board[cell]; Mo.bench[sl] = occ; occ.pinned = false; P.bench[o.i] = null; G.board[cell] = o.u; return 'ok';
        }
        occ.pinned = true;
        G.board[o.cell] = occ; G.board[cell] = o.u; G.log.push({ k: 'swap', pid, uid: o.u.uid, other: occ.uid }); return 'ok';
      }
      if (o.zone === 'board') { delete G.board[o.cell]; if (occ) G.board[o.cell] = occ; G.board[cell] = o.u; return 'ok'; }
      if (!occ && boardCount(G, pid) >= popCap(P)) return 'pop_full';
      P.bench[o.i] = occ || null; G.board[cell] = o.u;
      return 'ok';
    }
    case 'level': {
      if (P.level >= CFG.MAX_LEVEL || P.gold < CFG.XP_COST) return 'no';
      P.gold -= CFG.XP_COST; addXp(P, CFG.XP_BUY); return 'ok';
    }
    case 'equip': {
      const it = P.items[a.idx]; if (!it) return 'bad';
      const tgt = ownUnits(G, pid).find(o => o.u.uid === a.uid); if (!tgt) return 'bad';
      const u = tgt.u;
      if (CONSUMABLES[it]) return useConsumable(G, P, a.idx, tgt);
      if (EMBLEMS[it]) {
        if (ANIMALS[u.key].traits.includes(EMBLEMS[it].trait) || u.items.includes(it)) return 'emblem_dup';
      }
      if (MATS[it]) {
        const mi = u.items.findIndex(x => MATS[x] && RECIPE[[x, it].sort().join('+')]);
        if (mi >= 0) { u.items[mi] = RECIPE[[u.items[mi], it].sort().join('+')]; P.items.splice(a.idx, 1); G.log.push({ k: 'craft', pid, item: u.items[mi], uid: u.uid }); return 'ok'; }
      }
      if (u.items.length >= CFG.MAX_ITEMS) return 'full';
      u.items.push(it); P.items.splice(a.idx, 1); G.log.push({ k: 'equip', pid, item: it, uid: u.uid }); return 'ok';
    }
    case 'gift': {
      const T = teammate(G, pid); if (!T) return 'bad';
      giftReset(G, P);
      if (a.gold) {
        const g = Math.min(a.gold, P.gold, giftGoldLeft(G, P)); if (g <= 0) return P.gold <= 0 ? 'no_gold' : 'gift_gold_limit';
        P.gold -= g; T.gold += g; P.giftedGold += g; G.log.push({ k: 'gift', pid, to: T.id, s: g + ' 金' }); return 'ok';
      }
      if (a.uid) {
        const o = ownUnits(G, pid).find(o => o.u.uid === a.uid); if (!o) return 'bad';
        if ((P.giftedUnits || 0) >= CFG.GIFT_UNIT_STAGE) return 'gift_unit_limit';
        if (o.u.star > giftMaxStar(G)) return 'gift_star';
        const slot = T.bench.indexOf(null); if (slot < 0) return 'their_bench_full';
        P.giftedUnits = (P.giftedUnits || 0) + 1;
        if (o.zone === 'board') delete G.board[o.cell]; else P.bench[o.i] = null;
        o.u.owner = T.id; T.bench[slot] = o.u; checkMerge(G, T.id);
        G.log.push({ k: 'gift', pid, to: T.id, s: ANIMALS[o.u.key].name }); return 'ok';
      }
      if (a.item !== undefined) {
        const it = P.items[a.item]; if (!it) return 'bad';
        P.items.splice(a.item, 1); T.items.push(it);
        G.log.push({ k: 'gift', pid, to: T.id, s: (MATS[it] || ITEMS[it]).name }); return 'ok';
      }
      return 'bad';
    }
    case 'ready': P.ready = !P.ready; return 'ok';
    case 'vote': if (!G.portalVote || !G.portalVote.options.includes(a.id)) return 'bad'; P.vote = a.id; return 'ok';
    case 'draft': return draftPick(G, pid, a.i);
    case 'encounter': if (!G.encounter || !G.encounter.pending || G.teams[P.team].captain !== pid) return 'bad'; resolveEncounter(G, a.choice); return 'ok';
    case 'deposit': { const n = Math.min(a.n || 1, P.gold); if (n <= 0) return 'no_gold'; P.gold -= n; G.teams[P.team].bank += n; G.log.push({ k: 'bank', pid, n }); return 'ok'; }
    case 'withdraw': { const T = G.teams[P.team], n = Math.min(a.n || 1, T.bank); if (n <= 0) return 'bank_empty'; T.bank -= n; P.gold += n; G.log.push({ k: 'bank', pid, n: -n }); return 'ok'; }
    case 'captain': { const T = G.teams[P.team]; if (T.captain !== pid || !teammate(G, pid)) return 'not_captain'; T.captain = teammate(G, pid).id; G.log.push({ k: 'captain', pid, to: T.captain }); return 'ok'; }
    case 'cmd': {
      if (!G.rules.commands || G.phase !== 'combat') return 'bad';
      const bt = G.battles.find(b => b.teams.includes(P.team)); if (!bt) return 'bad';
      return battleCommand(bt.B, pid, a.type) ? 'ok' : 'cmd_used';
    }
    case 'aitoggle': { P.ai = !P.ai; if (P.ai) { P.ready = true; if (G.phase === 'prep') aiPrep(G, pid); } else P.ready = false; return 'ok'; }
    case 'surrender': { if (G.teams[P.team].out) return 'bad'; G.teams[P.team].hp = 0; G.surrendered = P.team; eliminate(G); return 'ok'; }
    case 'augroll': {
      if (!P.augChoice || P.augRolled[a.i] || !P.augChoice[a.i]) return 'bad';
      const tier = AUG[P.augChoice[a.i]].tier;
      const pool = AUGMENTS.filter(x => x.tier === tier && !P.augs.includes(x.id) && !P.augChoice.includes(x.id) && augOk(G, x)).map(x => x.id);
      if (!pool.length) return 'bad';
      P.augChoice[a.i] = pool[G.rng(pool.length)]; P.augRolled[a.i] = true; return 'ok';
    }
    case 'emote': { // 快捷表情：每個階段（準備／戰鬥）最多 4 次，避免洗頻
      const key = G.round + G.phase; if (P.emoteKey !== key) { P.emoteKey = key; P.emoteN = 0; }
      if ((P.emoteN || 0) >= 4 || !(+a.id >= 0 && +a.id < 8)) return 'bad';
      P.emoteN = (P.emoteN || 0) + 1; G.log.push({ k: 'emote', pid, id: +a.id }); return 'ok';
    }
    case 'ping': {
      const T = teammate(G, pid) || { ai: false };
      G.pings.push({ pid, kind: a.kind, cell: a.cell, key: a.key, t: G.round });
      if (T.ai) {
        if (a.kind === 'want' && a.key) { T.reserved[a.key] = true; aiSay(G, T.id, pid, `好，${ANIMALS[a.key].name}讓給你`); const mine = ownUnits(G, T.id).find(o => o.u.key === a.key && o.u.star === 1); if (mine && act(G, T.id, { t: 'gift', uid: mine.u.uid }) === 'ok') aiSay(G, T.id, pid, `我這隻${ANIMALS[a.key].name}先給你`); }
        if (a.kind === 'place' && a.cell !== undefined) { T.avoidCells[a.cell] = true; aiSay(G, T.id, pid, '收到，那格留給你'); }
        if (a.kind === 'danger') aiSay(G, T.id, pid, '了解，我會小心那邊');
        if (a.kind === 'rally') aiSay(G, T.id, pid, '好，往那邊集合');
        if (a.kind === 'buy' && a.key) {
          const i = T.shop.indexOf(a.key);
          if (i >= 0 && T.gold >= ANIMALS[a.key].cost && P.bench.indexOf(null) >= 0 && act(G, T.id, { t: 'buy', slot: i }) === 'ok') {
            const bought = ownUnits(G, T.id).filter(o => o.zone === 'bench' && o.u.key === a.key).pop();
            if (bought && act(G, T.id, { t: 'gift', uid: bought.u.uid }) === 'ok') aiSay(G, T.id, pid, `買好了，${ANIMALS[a.key].name}給你！`);
          } else G.log.push({ k: 'pingfail', pid, to: T.id, key: a.key });
        }
      }
      G.log.push({ k: 'ping', pid, kind: a.kind, cell: a.cell, key: a.key }); return 'ok';
    }
  }
  return 'bad';
}
// 真人可以搬動 AI 隊友場上的棋子（只限準備階段、只在我方半場）；搬過的棋子 AI 不會再自己移回去
function moveMateUnit(G, pid, a) {
  const P = G.players[pid], M = teammate(G, pid);
  if (!M || !M.ai || P.ai || G.phase !== 'prep' || !a.to || a.to.zone !== 'board') return 'bad';
  const o = ownUnits(G, M.id).find(x => x.u.uid === a.uid && x.zone === 'board'); if (!o) return 'bad';
  const cell = a.to.cell;
  if (!inHalf(P.team, cell) || G.terrain[cellBase(cell)] === 'rock') return 'bad_cell';
  const occ = G.board[cell];
  if (occ && G.players[occ.owner].team !== P.team) return 'enemy_cell';
  delete G.board[o.cell]; if (occ) { G.board[o.cell] = occ; if (occ.owner === M.id) occ.pinned = true; }
  G.board[cell] = o.u; o.u.pinned = true;
  G.log.push({ k: 'swap', pid, uid: o.u.uid, other: occ ? occ.uid : 0, mate: true }); return 'ok';
}
function addXp(P, n) {
  P.xp += n;
  while (P.level < CFG.MAX_LEVEL && P.xp >= CFG.XP_NEED[P.level]) { P.xp -= CFG.XP_NEED[P.level]; P.level++; }
  if (P.level >= CFG.MAX_LEVEL) P.xp = 0;
}

// ---- 地形 ----
function rollTerrain(G) {
  const st = stageOf(G.round);
  G.arena = ARENA_ORDER[(G.arenaStart + st - 1) % ARENA_ORDER.length];
  const A = ARENAS[G.arena];
  const n = A.count[0] + G.rng(A.count[1] - A.count[0] + 1) + (G.portal === 'quake' ? 2 : 0);
  const bag = []; for (const t in A.weights) for (let i = 0; i < A.weights[t]; i++) bag.push(t);
  const chosen = []; let rock = 0;
  for (let guard = 0; chosen.length < n && guard < 50; guard++) {
    const t = bag[G.rng(bag.length)];
    if (t === 'rock' && rock >= A.maxRock) continue;
    if (t === 'rock') rock++; chosen.push(t);
  }
  const used = {}; G.terrain = {}; G.height = {};
  // 高台：每座 2～3 格相連，雙方鏡像對稱；不放在已被岩石佔的位置
  const nh = (A.hills || [0, 0])[0] + G.rng(((A.hills || [0, 0])[1] - (A.hills || [0, 0])[0]) + 1);
  for (let h = 0; h < nh; h++) {
    for (let tries = 0; tries < 30; tries++) {
      const c = G.rng(CFG.COLS), r = G.rng(CFG.ROWS_HALF), size = 2 + G.rng(2), cells = [[c, r]];
      const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      for (let g = 0; cells.length < size && g < 12; g++) { const b = cells[G.rng(cells.length)], d = dirs[G.rng(4)], nc = b[0] + d[0], nr = b[1] + d[1]; if (nc >= 0 && nc < CFG.COLS && nr >= 0 && nr < CFG.ROWS_HALF && !cells.some(x => x[0] === nc && x[1] === nr)) cells.push([nc, nr]); }
      if (cells.some(([cc, rr]) => G.height[rr * CFG.COLS + cc])) continue;
      for (const [cc, rr] of cells) { const k = rr * CFG.COLS + cc, [gc, gr] = toGlobal(1, cc, rr); G.height[k] = 1; G.height[gr * CFG.COLS + gc] = 1; }
      break;
    }
  }
  for (const t of chosen) {
    for (let tries = 0; tries < 40; tries++) {
      const c = G.rng(CFG.COLS), r = G.rng(CFG.ROWS_HALF), k = r * CFG.COLS + c;
      if (used[k]) continue;
      const [gc, gr] = toGlobal(1, c, r), k2 = gr * CFG.COLS + gc;
      if (t === 'rock' && Object.keys(G.board).some(b => cellBase(+b) === k || cellBase(+b) === k2)) continue;
      if (G.height[k] && (t === 'water' || t === 'rock' || t === 'bounce')) continue; // 高台上不放水、岩石、彈射
      used[k] = 1; G.terrain[k] = t; G.terrain[k2] = t; break;
    }
  }
}

// ---- 回合流程 ----
function startGame(G) {
  // 電腦模仿玩家：從高勝率的玩家陣容裡挑一套當目標（依勝率加權）
  for (const P of G.players) if (P.ai) P.target = G.rng(100) < aiLv(G, P).meta ? metaPick(G) : null;
  delete G.meta;
  G.round = 0; G.arenaStart = G.rng(ARENA_ORDER.length);
  if (G.rules.portals) {
    const pool = PORTALS.map(p => p.id), opts = []; while (opts.length < 3) opts.push(pool.splice(G.rng(pool.length), 1)[0]);
    G.portalVote = { options: opts, votes: {} };
    for (const P of G.players) if (P.ai) P.vote = opts[G.rng(3)];
  }
  startPrep(G);
}
function resolvePortal(G) {
  if (!G.portalVote) return;
  const opts = G.portalVote.options, cnt = {};
  for (const P of G.players) { const v = P.vote || opts[G.rng(3)]; cnt[v] = (cnt[v] || 0) + 1; }
  let best = opts[0], bn = -1; for (const o of opts) { const n = (cnt[o] || 0) + G.rng(100) / 1000; if (n > bn) { bn = n; best = o; } }
  G.portal = best; G.portalVote = null; G.log.push({ k: 'portal', id: best });
  if (best === 'blitz') { G.rules.prepSec = 20; for (const T of G.teams) T.hp = Math.min(T.hp, 80); }
  if (best === 'headstart') for (const P of G.players) { P.level = Math.max(P.level, 3); P.xp = 0; P.gold += 3; rollShop(G, P); }
  if (best === 'crowd') for (const k in G.pool) if (G.pool[k] > 0) G.pool[k] = Math.floor(G.pool[k] * 13 / 10);
  if (best === 'freeroll') for (const P of G.players) P.firstRollFree = true;
  for (const P of G.players) if (P.ai) aiPrep(G, P.id);
}
function startPrep(G) {
  G.round++;
  const R = G.round;
  if (stageStart(R)) rollTerrain(G);
  for (const P of G.players) {
    P.ready = false; giftReset(G, P);
    if (P.out) { P.ready = true; P.augChoice = null; continue; }
    if (R === 1) {
      const keys = Object.keys(ANIMALS).filter(k => ANIMALS[k].cost === 1);
      const k = keys[G.rng(keys.length)]; G.pool[k]--; P.bench[0] = newUnit(G, k, 1, P.id);
    } else {
      const T = G.teams[P.team], s = Math.abs(T.streak);
      const inc = { base: CFG.INCOME_BY_STAGE[Math.min(stageOf(R), CFG.INCOME_BY_STAGE.length - 1)] || CFG.BASE_INCOME, interest: Math.min(CFG.MAX_INTEREST + (P.augs.includes('piggy') ? 1 : 0), Math.floor(P.gold / 10)), streak: s >= 6 ? 3 : s >= 4 ? 2 : s >= 2 ? 1 : 0 };
      if (G.portal === 'goldseason') inc.base += 1;
      P.gold += inc.base + inc.interest + inc.streak; P.lastIncome = inc;
      addXp(P, CFG.XP_ROUND + (G.portal === 'xpboost' ? 2 : 0));
      if (G.portal === 'freeroll') P.firstRollFree = true;
    }
    if (!P.locked) rollShop(G, P); P.locked = false;
    if (P.discount > 0 && R > 1) P.discount--;
  }
  G.phase = 'prep'; for (const P of G.players) checkMerge(G, P.id);
  if (R > 1) for (const T of G.teams) { const i = Math.min(CFG.BANK_INTEREST_MAX, Math.floor(T.bank / 10)); T.bank += i; T.bankInt = i; }
  for (const P of G.players) { P.reserved = {}; P.avoidCells = {}; }
  G.pings = [];
  rollWeather(G);
  G.migration = null;
  if (G.rules.encounters && CFG.ENCOUNTER_ROUNDS.includes(R)) startEncounter(G);
  if (G.rules.augments && CFG.AUG_ROUNDS.includes(R)) offerAugments(G);
  if (G.rules.carousel && CFG.CAROUSEL_ROUNDS.includes(R)) startDraft(G);
  G.phase = 'prep'; G.timer = G.rules.prepSec * 1000;
  planNextOpponents(G);
  // AI 行動順序每回合輪替，避免某一隊總是先搶卡池
  const order = G.players.map(p => p.id); for (let i = 0; i < G.round % 4; i++) order.push(order.shift());
  for (const id of order) if (G.players[id].ai && !G.players[id].out) aiPrep(G, id);
}

function battleUnitsForTeam(G, team, asTeam) {
  // 把 team 的棋子轉成戰鬥輸入；asTeam 為在該場戰鬥中的陣營（0 下半場、1 上半場）
  const out = [];
  for (const k in G.board) {
    const u = G.board[k]; const P = G.players[u.owner]; if (P.team !== team) continue;
    const [c, r] = cellRC(+k);
    const [lc, lr] = toLocal(SIDE(team), c, r); const [gc, gr] = toGlobal(asTeam, lc, lr);
    out.push({ uid: u.uid, key: u.key, star: u.star, owner: u.owner, team: asTeam, c: gc, r: gr, items: u.items });
  }
  return out;
}
function heightFor(G, team) {
  const h = G.height || {};
  if (SIDE(team) === 0) return Object.assign({}, h);
  const t = {}; for (const k in h) { const c = +k % CFG.COLS, r = Math.floor(+k / CFG.COLS); const [gc, gr] = toGlobal(1, c, r); t[gr * CFG.COLS + gc] = h[k]; }
  return t;
}
function terrainFor(G, team) {
  // team 作為戰鬥 team0 時的地形（team1 視角需翻轉）
  if (SIDE(team) === 0) return Object.assign({}, G.terrain);
  const t = {};
  for (const k in G.terrain) { const c = +k % CFG.COLS, r = Math.floor(+k / CFG.COLS); const [gc, gr] = toGlobal(1, c, r); t[gr * CFG.COLS + gc] = G.terrain[k]; }
  return t;
}
function startCombat(G) {
  for (const P of G.players) if (!P.ai && !P.out) P.lastComp = compOf(G, P.id); // 記下真人這回合的陣容（結束時給伺服器學）
  const R = G.round, seed = (G.seed ^ Math.imul(R, 2654435761)) >>> 0;
  G.battles = [];
  if (isPve(R)) {
    for (const team of aliveTeams(G)) {
      const units = battleUnitsForTeam(G, team, 0);
      for (const [key, c, r] of pveOf(R)) { const [gc, gr] = toGlobal(1, c, r); units.push({ key, star: key === 'kingboar' ? BOSS_CFG.STAR : PVE_STAR[R] || 3, mul: key === 'kingboar' ? bossMul(R) : 0, owner: -1, team: 1, c: gc, r: gr, items: [] }); }
      const input = { seed: seed + team, terrain: terrainFor(G, team), height: heightFor(G, team), units, pve: true, aug: augMap(G), low: lowMap(G), flags: battleFlags(G), weather: G.weather };
      G.battles.push({ teams: [team, -1], input: JSON.parse(JSON.stringify(input)), B: createBattle(input) });
    }
  } else {
    for (const [a, b, ghost] of pairTeams(G)) {
      const units = battleUnitsForTeam(G, a, 0).concat(battleUnitsForTeam(G, b, 1));
      const input = { seed: seed + a * 7, terrain: Object.assign({}, G.terrain), height: Object.assign({}, G.height || {}), units, aug: augMap(G), low: lowMap(G), flags: battleFlags(G), weather: G.weather, neutrals: rollNeutrals(G, units) };
      G.battles.push({ teams: [a, b], ghost: !!ghost, input: JSON.parse(JSON.stringify(input)), B: createBattle(input) });
    }
  }
  G.phase = 'combat'; G.acc = 0;
  // AI 戰鬥指令時間點
  G.aiCmd = {}; for (const P of G.players) if (P.ai && G.rules.commands) G.aiCmd[P.id] = { t: 120 + G.rng(200), type: ['charge', 'rally', 'hold'][G.rng(3)] };
}
function combatDone(G) { return G.battles.every(b => b.B.over); }
// 對戰配對：2 隊就是 0 對 1；4 隊每回合隨機配對、盡量不連續打同一隊；剩奇數隊時有一隊打「幽靈」（別隊的複製，輸贏不影響對方）
// 準備階段就先排好下一場的配對（藏在 G.nextPairs，不會傳給玩家），再給每隊幾個「可能的對手」（真正的對手一定在裡面）
const NEXT_OPP_CFG = { SOLO: 3, TEAM: 2 }; // 單人混戰顯示 3 個、雙人（4 隊）顯示 2 個
function planNextOpponents(G) {
  G.nextPairs = null; G.nextCand = null;
  const alive = aliveTeams(G); if (alive.length <= 2 || isPve(G.round)) return;
  const pairs = pairTeams(G, true); G.nextPairs = pairs;
  const opp = {}; for (const [a, b, gh] of pairs) { opp[a] = b; if (!gh) opp[b] = a; }
  const n = G.solo ? NEXT_OPP_CFG.SOLO : NEXT_OPP_CFG.TEAM; G.nextCand = {};
  for (const t of alive) {
    const others = alive.filter(x => x !== t && x !== opp[t]);
    for (let i = others.length - 1; i > 0; i--) { const j = G.rng(i + 1); [others[i], others[j]] = [others[j], others[i]]; }
    const c = [opp[t]].concat(others.slice(0, Math.max(0, n - 1))).filter(x => x !== undefined);
    for (let i = c.length - 1; i > 0; i--) { const j = G.rng(i + 1); [c[i], c[j]] = [c[j], c[i]]; }
    G.nextCand[t] = c;
  }
}
function pairTeams(G, planOnly) {
  if (!planOnly && G.nextPairs && G.nextPairs.every(([a, b]) => !G.teams[a].out && !G.teams[b].out)) { const best = G.nextPairs; G.nextPairs = null; for (const [p, q, gh] of best) { G.lastOpp[p] = q; if (!gh) G.lastOpp[q] = p; } return best; }
  const alive = aliveTeams(G);
  if (alive.length === 2) { G.lastOpp[alive[0]] = alive[1]; G.lastOpp[alive[1]] = alive[0]; return [[alive[0], alive[1], false]]; }
  let best = null, bestBad = 99;
  for (let tries = 0; tries < 12; tries++) {
    const a = alive.slice(); for (let i = a.length - 1; i > 0; i--) { const j = G.rng(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    const pairs = []; for (let i = 0; i + 1 < a.length; i += 2) pairs.push([a[i], a[i + 1], false]);
    if (a.length % 2) { const x = a[a.length - 1], others = alive.filter(t => t !== x); pairs.push([x, others[G.rng(others.length)], true]); }
    const bad = pairs.filter(([p, q, gh]) => !gh && G.lastOpp[p] === q).length;
    if (bad < bestBad) { best = pairs; bestBad = bad; if (!bad) break; }
  }
  if (!planOnly) for (const [p, q, gh] of best) { G.lastOpp[p] = q; if (!gh) G.lastOpp[q] = p; }
  return best;
}
// 淘汰：血量歸零的隊伍出局，依血量決定名次；剩 1 隊（或回合上限）時結束
// 血歸 0 就當場淘汰（照聯盟戰棋）。同一回合被淘汰的隊：血負越多名次越後；一樣多時先被打到 0 的排後。
// 名次當下就給：還在打的戰場會先在後台快轉模擬到結束，預先知道誰還會死、會負多少。
// （只有真人之後在戰鬥中下指令改變了結果時，名次才可能再調整一次）
function knockOut(G, team, dieT, batch) {
  const T = G.teams[team]; if (T.out) return;
  G.dieSeq = (G.dieSeq || 0) + 1;
  T.out = true; T.dieRound = G.round; T.dieSeq = G.dieSeq; T.dieT = dieT || 0;
  for (const P of G.players) if (P.team === team) { P.out = true; P.ready = true; P.augChoice = null;
    for (const o of ownUnits(G, P.id)) { G.pool[o.u.key] += Math.pow(3, o.u.star - 1); if (o.zone === 'board') delete G.board[o.cell]; else P.bench[o.i] = null; } }
  if (batch) return; // 同一場兩隊同時歸零（平手）：全部標記完再一起排名
  rankRoundOuts(G);
  G.log.push({ k: 'out', team, place: T.place });
}
// 把還沒打完的戰場複製一份快轉到結束（跟客人手機重播用的是同一套決定性模擬）
function predictBattle(G, bt) {
  const B = bt.B, C = createBattle(JSON.parse(JSON.stringify(bt.input))), log = B.cmdLog || [];
  let done = 0, n = 0;
  const cmds = () => { while (done < log.length && log[done].t <= C.t) { const c = log[done++]; C.cmdUsed[c.owner] = false; battleCommand(C, c.owner, c.type); } };
  while (C.t < B.t && !C.over && n++ < 20000) { cmds(); step(C); }
  while (!C.over && n++ < 20000) {
    cmds();
    for (const pid in G.aiCmd || {}) { const c = G.aiCmd[pid]; if (c && C.t === c.t && c.t >= B.t && bt.teams.includes(G.players[pid].team)) battleCommand(C, +pid, c.type); }
    step(C);
  }
  return C;
}
function battleDamage(G, B, side) { return CFG.DMG_BASE + Math.floor(survivorStars(B, 1 - side) * CFG.DMG_STAR_PCT / 100) + CFG.DMG_STAGE * (stageOf(G.round) - 1); }
function rankRoundOuts(G) {
  const list = G.teams.map((T, i) => i).filter(i => G.teams[i].out && G.teams[i].dieRound === G.round)
    .map(i => ({ t: i, hp: G.teams[i].hp, at: G.teams[i].dieT, seq: G.teams[i].dieSeq, real: true }));
  if (!isPve(G.round)) for (const bt of G.battles) { // 還在打的戰場：預測誰還會在這回合歸零
    if (bt.settled) continue;
    const C = bt.B.over ? bt.B : predictBattle(G, bt); // 同一格剛打完、還沒輪到結算的直接用結果
    bt.teams.forEach((team, side) => {
      if (side === 1 && bt.ghost) return; const T = G.teams[team]; if (!T || T.out || C.winner === side) return;
      const hp = T.hp - (T.ark > 0 ? 0 : battleDamage(G, C, side));
      if (hp <= 0) list.push({ t: team, hp, at: C.t, seq: 1e9, real: false });
    });
  }
  const aliveEnd = aliveTeams(G).length - list.filter(x => !x.real).length;
  list.sort((x, y) => (y.hp - x.hp) || (y.at - x.at) || (y.seq - x.seq)); // 好的在前：血多、晚死
  list.forEach((x, i) => { if (!x.real) return; const T = G.teams[x.t], p = aliveEnd + 1 + i; if (T.place && T.place !== p) G.log.push({ k: 'place', team: x.t, place: p }); T.place = p; });
}
function eliminate(G, force) {
  const alive = aliveTeams(G), dead = alive.filter(t => G.teams[t].hp <= 0).sort((x, y) => G.teams[y].hp - G.teams[x].hp);
  let place = alive.length;
  for (let i = dead.length - 1; i >= 0; i--) { const t = dead[i], T = G.teams[t]; T.out = true; T.place = place--; G.log.push({ k: 'out', team: t, place: T.place });
    for (const P of G.players) if (P.team === t) { P.out = true; P.ready = true; P.augChoice = null;
      for (const o of ownUnits(G, P.id)) { G.pool[o.u.key] += Math.pow(3, o.u.star - 1); if (o.zone === 'board') delete G.board[o.cell]; else P.bench[o.i] = null; } } }
  const left = aliveTeams(G);
  if (left.length <= 1 || force) {
    left.sort((x, y) => G.teams[y].hp - G.teams[x].hp).forEach((t, i) => { G.teams[t].place = i + 1; });
    if (!left.length && !G.teams.some(T => T.place === 1)) { const all = G.teams.map((T, i) => i).sort((x, y) => G.teams[y].hp - G.teams[x].hp); all.forEach((t, i) => { G.teams[t].place = i + 1; }); } // 最後兩隊同回合一起歸零：名次已由 knockOut 排好
    G.winner = G.teams.findIndex(T => T.place === 1);
    G.phase = 'over';
    return true;
  }
  return false;
}

// 每場戰鬥一打完就先結算那一場（扣血、連勝敗、勝場金、戰利品），像聯盟戰棋一樣；全部打完才進入回合結算
function roundRes(G) {
  const n = G.teams.length;
  if (!G.roundRes || G.roundRes.round !== G.round) G.roundRes = { round: G.round, pve: isPve(G.round), dmg: new Array(n).fill(0), win: new Array(n).fill(false), opp: new Array(n).fill(-1), done: [] };
  return G.roundRes;
}
function settleBattle(G, bt) {
  if (bt.settled) return; bt.settled = true;
  const R = G.round, st = stageOf(R), res = roundRes(G), B = bt.B;
  if (isPve(R)) {
    const team = bt.teams[0]; res.win[team] = B.winner === 0;
    for (const P of G.players) if (P.team === team) {
      const times = G.portal === 'harvest' ? 2 : 1;
      for (let k = 0; k < times; k++) for (const d of rollLoot(G, R, res.win[team])) giveLoot(G, P, d);
    }
  } else {
    const w = B.winner;
    bt.teams.forEach((team, side) => {
      if (side === 1 && bt.ghost) return; // 幽靈對手：不影響被複製的那隊
      const T = G.teams[team]; res.opp[team] = bt.teams[1 - side];
      if (w === side) { res.win[team] = true; T.streak = T.streak > 0 ? T.streak + 1 : 1; for (const P of G.players) if (P.team === team) P.gold += CFG.WIN_GOLD; }
      else {
        let d = CFG.DMG_BASE + Math.floor(survivorStars(B, 1 - side) * CFG.DMG_STAR_PCT / 100) + CFG.DMG_STAGE * (st - 1);
        if (T.ark > 0) { T.ark--; d = 0; res.ark = true; }
        T.hp -= d; res.dmg[team] = d; T.streak = T.streak < 0 ? T.streak - 1 : -1;
      }
    });
  }
  // 增幅：戰後經濟
  for (const l of B.loot || []) { const P = G.players[l.owner]; if (!P) continue; giveLoot(G, P, { type: 'gold', n: l.key === 'chest' ? NEUTRAL_CFG.CHEST_GOLD : NEUTRAL_CFG.CRATE_GOLD }); if (l.key === 'chest' && G.rng(100) < NEUTRAL_CFG.CHEST_MAT_PCT) giveLoot(G, P, { type: 'mat', k: Object.keys(MATS)[G.rng(6)] }); }
  for (const P of G.players) {
    if (P.augs.includes('recycle') && B.deaths[P.id]) P.gold += Math.min(4, B.deaths[P.id]);
    if (P.augs.includes('goldrain')) { if (B.kills[P.id]) P.gold += Math.min(3, B.kills[P.id]); if (B.bigKill[P.id]) P.freeRoll++; }
  }
  res.done.push(G.battles.indexOf(bt));
  const dying = bt.teams.filter((team, side) => team >= 0 && !(side === 1 && bt.ghost) && G.teams[team] && G.teams[team].hp <= 0 && !G.teams[team].out);
  for (const team of dying) knockOut(G, team, B.t, true);
  if (G.teams.some(T => T.out && T.dieRound === R)) rankRoundOuts(G);
  for (const team of dying) G.log.push({ k: 'out', team, place: G.teams[team].place }); // 有人實際結果跟預測不同（例如真人下了戰鬥指令）時校正
}
function endCombat(G) {
  const R = G.round;
  for (const bt of G.battles) if (bt.B.over) settleBattle(G, bt); // 只剩一隊提早結束時，沒打完的不算
  const res = roundRes(G);
  G.lastResult = res;
  G.hpHist = (G.hpHist || []).concat([G.teams.map(T => Math.max(0, T.hp))]).slice(-60); // 血量走勢圖用
  if (!eliminate(G, G.rules.maxRound > 0 && R >= G.rules.maxRound)) { G.phase = 'result'; G.timer = CFG.RESULT_MS || 3000; }
}

// 主更新：dt 毫秒
function update(G, dt) {
  if (G.td) return tdUpdate(G, dt); // 塔防模式（只在玩家端）
  if (G.phase === 'prep') {
    const humans = G.players.filter(p => !p.ai && !p.out);
    if (G.portalVote && humans.every(p => p.vote)) resolvePortal(G);
    if (G.draft) aiDraftTurns(G);
    const waiting = humans.some(p => p.augChoice) || G.portalVote || G.draft || (G.encounter && G.encounter.pending) || G.paused;
    if (!waiting) G.timer -= dt; // 有人在選擇時暫停倒數
    if (G.timer <= 5000 && G.aiLate !== G.round) { G.aiLate = G.round; for (const P of G.players) if (P.ai && !P.out) aiLate(G, P.id); } // 準備最後 5 秒：電腦隊友再看一次真人隊友的擺法
    if (G.aiMid !== G.round && G.timer < G.rules.prepSec * 600) { G.aiMid = G.round; for (const P of G.players) if (P.ai && !P.out) aiHelpMate(G, P.id); } // 準備到一半：AI 隊友看玩家買了什麼，再幫一次
    if (G.timer <= 0 || (humans.length && humans.every(p => p.ready))) {
      for (const P of G.players) if (P.augChoice) act(G, P.id, { t: 'aug', id: P.augChoice[0] });
      if (G.portalVote) resolvePortal(G);
      while (G.draft) draftPick(G, G.draft.order[G.draft.idx], 0);
      if (G.encounter && G.encounter.pending) resolveEncounter(G, G.encounter.choice[0]);
      startCombat(G);
    }
  } else if (G.phase === 'combat') {
    G.acc += dt * (G.speed || 1);
    while (G.acc >= CFG.TICK_MS && !combatDone(G)) {
      G.acc -= CFG.TICK_MS;
      for (const b of G.battles) {
        for (const pid in G.aiCmd || {}) { const c = G.aiCmd[pid]; if (c && b.B.t === c.t && b.teams.includes(G.players[pid].team)) battleCommand(b.B, +pid, c.type); }
        step(b.B);
      }
    }
    for (const b of G.battles) if (b.B.over && !b.settled) settleBattle(G, b); // 先打完的先結算
    if (combatDone(G) || aliveTeams(G).length <= 1) endCombat(G); // 只剩一隊就直接結束
  } else if (G.phase === 'result') {
    G.timer -= dt; if (G.timer <= 0) startPrep(G);
  }
}

// ---- AI ----
function aiSay(G, from, to, text) { G.log.push({ k: 'aichat', pid: from, to, text }); }
// AI 隊友主動幫忙：送玩家湊三星的棋子、幫買、玩家沒錢時送金幣，並朝玩家的羈絆湊陣容
function aiHelpMate(G, pid) {
  const P = G.players[pid], H = teammate(G, pid);
  if (!H || H.ai || H.out) return {};
  const hc = {}; for (const o of ownUnits(G, H.id)) if (o.u.star === 1) hc[o.u.key] = (hc[o.u.key] || 0) + 1;
  let gave = 0;
  // 1. 我手上有玩家正在湊的 1 星棋子 → 送過去（玩家已有 2 隻優先，其次 1 隻且是玩家標記想要的）
  for (const o of ownUnits(G, pid)) {
    if (gave >= 2) break;
    const k = o.u.key; if (o.u.star !== 1 || !(hc[k] >= 2 || (hc[k] >= 1 && P.reserved[k]))) continue;
    if (H.bench.indexOf(null) < 0) break;
    if (act(G, pid, { t: 'gift', uid: o.u.uid }) === 'ok') { aiSay(G, pid, H.id, `送你一隻${ANIMALS[k].name}，湊三星！`); hc[k]++; gave++; }
  }
  // 2. 商店有玩家差一隻就升星的 → 幫買再送
  for (let i = 0; i < P.shop.length && gave < 2; i++) {
    const k = P.shop[i]; if (!k || hc[k] !== 2 || P.gold < ANIMALS[k].cost || H.bench.indexOf(null) < 0) continue;
    if (act(G, pid, { t: 'buy', slot: i }) !== 'ok') continue;
    const b = ownUnits(G, pid).filter(o => o.zone === 'bench' && o.u.key === k && o.u.star === 1).pop();
    if (b && act(G, pid, { t: 'gift', uid: b.u.uid }) === 'ok') { aiSay(G, pid, H.id, `商店剛好有${ANIMALS[k].name}，幫你買了`); gave++; }
  }
  // 3. 玩家快沒錢、我很有錢 → 送金幣
  if (H.gold < 4 && P.gold >= 16 && giftGoldLeft(G, P) > 0) { const g = Math.min(giftGoldLeft(G, P), 5); if (act(G, pid, { t: 'gift', gold: g }) === 'ok') aiSay(G, pid, H.id, `你錢不多，先拿 ${g} 金去用`); }
  // 4. 玩家主力羈絆（場上最多的那個）→ 我買棋子時加分
  const tr = {}; for (const k in G.board) { const u = G.board[k]; if (u.owner === H.id) for (const t of ANIMALS[u.key].traits) tr[t] = (tr[t] || 0) + 1; }
  return tr;
}
// ---- AI（v0.12：會跟玩家配合、照陣容買、會存利息、懂站位）----
// 數值都可以在 AI_CFG 調整
const AI_CFG = {
  LEVEL_AT: { 2: 3, 4: 4, 6: 5, 10: 6, 14: 7, 19: 8, 25: 9 }, // 第幾回合起想要升到幾級（普通難度）
  SAVE: 50,                // 血量健康時存到多少金（吃滿利息）
  ROLL_HP: 40,             // 團隊血量低於這個就開始刷新找牌
};
// 電腦強度（練習時在「選擇模式」切換；只影響對手，電腦隊友固定普通）
// lvl：升級目標加減｜rollKeep：刷新時至少留多少金｜rollLv：到幾級開始固定刷新
// meta：照玩家高勝率陣容打的機率%｜plan：照羈絆計畫買牌的程度｜noise：買牌亂數｜misplace：每隻棋子亂站的機率%｜combo：會不會湊合體技｜smartItems：裝備給對的人
const AI_LEVELS = {
  easy:   { meta: 0,   plan: 0.3, noise: 30, misplace: 70, combo: false, smartItems: false, lvl: -1, rollKeep: 999, rollLv: 99 },
  normal: { meta: 50,  plan: 0.8, noise: 14, misplace: 20, combo: true,  smartItems: true,  lvl: 0,  rollKeep: 20,  rollLv: 7 },
  hard:   { meta: 100, plan: 1,   noise: 8,  misplace: 0,  combo: true,  smartItems: true,  lvl: 0,  rollKeep: 20,  rollLv: 7 },
};
const aiLvName = (G, P) => P.aiLv || (G.players.some(q => q.team === P.team && !q.ai) ? 'normal' : (G.rules.aiLevel || 'normal'));
const aiLv = (G, P) => AI_LEVELS[aiLvName(G, P)] || AI_LEVELS.normal;
const aiRoleOf = key => { const A = ANIMALS[key]; if (!A) return 'fighter'; const r = A.role || ''; return r.includes('坦') ? 'tank' : r.includes('刺客') ? 'assassin' : A.rng >= 2 ? 'carry' : 'fighter'; };
const aiHumanMate = (G, pid) => { const T = teammate(G, pid); return T && !T.ai && !T.out ? T : null; };
// 隊伍的羈絆計畫：看我和隊友場上＋備戰席已經有的種類，挑最有希望的 2～3 個羈絆
const META_CFG = { USE_PCT: 70, TARGET_BUY: 18, TARGET_KEEP: 10 }; // 有玩家陣容時照著打的機率%、買目標棋子加分、留著目標棋子加分
function compOf(G, pid) {
  const P = G.players[pid], list = [];
  for (const k in G.board) { const u = G.board[k]; if (u.owner !== pid) continue; const [c, r] = cellRC(+k), [lc, lr] = toLocal(SIDE(P.team), c, r); list.push([u.key, u.star, lc, lr]); }
  return list;
}
function metaPick(G) {
  const L = (G.meta || []).filter(m => m.units && m.units.length >= 3); if (!L.length || G.rng(100) >= META_CFG.USE_PCT) return null;
  let tot = 0; for (const m of L) tot += Math.max(1, Math.round((m.wr || 0.5) * 100)); let r = G.rng(tot);
  for (const m of L) { r -= Math.max(1, Math.round((m.wr || 0.5) * 100)); if (r < 0) return { id: m.id, units: m.units }; }
  return null;
}
function aiPlan(G, pid) {
  const P = G.players[pid], seen = {}, cnt = {};
  if (P.target) for (const [k] of P.target.units) if (ANIMALS[k]) for (const t of ANIMALS[k].traits) cnt[t] = (cnt[t] || 0) + (G.round >= 6 ? 1.5 : 0.6); // 目標陣容的羈絆
  const add = (key, w) => { if (!ANIMALS[key] || seen[key]) return; seen[key] = 1; for (const t of ANIMALS[key].traits) cnt[t] = (cnt[t] || 0) + w; };
  for (const k in G.board) { const u = G.board[k]; if (G.players[u.owner].team === P.team) add(u.key, u.owner === pid ? 1.2 : 1); }
  for (const u of P.bench) if (u) add(u.key, 0.8);
  const order = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
  const plan = {}; order.slice(0, 3).forEach((t, i) => { plan[t] = 3 - i; });
  return plan;
}
function aiUnitValue(G, pid, u, plan) {
  const A = ANIMALS[u.key]; if (!A) return 0;
  let v = A.cost * u.star * u.star * 10 + u.items.length * 8;
  for (const t of A.traits) v += (plan[t] || 0) * 4;
  const P = G.players[pid]; if (P.target && P.target.units.some(x => x[0] === u.key)) v += META_CFG.TARGET_KEEP;
  return v;
}
function aiPickAug(G, P) {
  const R = G.round, T = G.teams[P.team];
  const plan = aiPlan(G, P.id);
  const score = id => {
    const a = AUG[id]; let s = 10 + G.rng(6);
    if (a.hook === 'econ') s += R <= 9 ? 8 : -4;
    if (id === 'ark' && T.hp < 50) s += 12;
    if (id === 'lastStand' && T.hp < 50) s += 8;
    if (id === 'howl' && plan.pack) s += 10;
    if ((id === 'amphibious' || id === 'wavestep') && plan.water) s += 8;
    if (id === 'fortress' || id === 'mutation' || id === 'beastking') s += 4;
    return s;
  };
  return P.augChoice.slice().sort((a, b) => score(b) - score(a))[0];
}
function aiPrep(G, pid) {
  const P = G.players[pid], R = G.round, lv = aiLvName(G, P), L = aiLv(G, P), T = G.teams[P.team];
  if (P.out) return;
  if (P.augChoice) act(G, pid, { t: 'aug', id: aiPickAug(G, P) });
  const human = aiHumanMate(G, pid);
  // 1) 想要的等級
  let target = 2; for (const r in AI_CFG.LEVEL_AT) if (R >= +r) target = AI_CFG.LEVEL_AT[r];
  target = Math.max(2, Math.min(CFG.MAX_LEVEL, target + L.lvl + (T.hp < AI_CFG.ROLL_HP ? 1 : 0)));
  const healthy = T.hp >= 50, save = L.lvl < 0 ? 10 : (R >= 6 && healthy ? Math.min(AI_CFG.SAVE, 10 * Math.floor(P.gold / 10)) : 0);
  while (P.level < target && P.gold >= CFG.XP_COST && P.gold - CFG.XP_COST >= Math.min(save, 20)) if (act(G, pid, { t: 'level' }) !== 'ok') break;
  // 2) 先照顧真人隊友：他快湊滿三隻的，我手上有就送他
  const mateTr = aiHelpMate(G, pid); // 回應真人隊友（送棋子、送錢、幫買）—— 互動用 v0.12 甲版
  // 3) 買牌
  const plan = aiPlan(G, pid); for (const t in plan) plan[t] *= L.plan;
  const keepGold = () => (P.level >= target || P.level >= CFG.MAX_LEVEL) ? Math.min(save, 50) : save;
  const buyPass = () => {
    for (let loop = 0; loop < CFG.SHOP_SIZE; loop++) {
      const own = ownUnits(G, pid), cnt = {};
      for (const o of own) if (o.u.star === 1) cnt[o.u.key] = (cnt[o.u.key] || 0) + 1;
      const benchFree = P.bench.filter(x => !x).length;
      let best = -1, bs = 0;
      P.shop.forEach((k, i) => {
        if (!k || G.pool[k] <= 0 || P.reserved[k]) return;
        const A = ANIMALS[k], c = cnt[k] || 0;
        if (P.gold < A.cost) return;
        const merges = c >= 2;
        if (!merges && P.gold - A.cost < keepGold()) return;
        if (!merges && benchFree <= 1) return;
        let s = A.cost * 6 + c * 22 + G.rng(L.noise) + (P.target && P.target.units.some(x => x[0] === k) ? META_CFG.TARGET_BUY : 0);
        for (const t of A.traits) s += (plan[t] || 0) * 7 + (mateTr[t] || 0) * 3; // 跟著真人隊友的羈絆湊
        if (A.cost > P.level - 1 && !c) s -= 8; // 太貴、還湊不起來的先不急
        if (own.length >= popCap(P) + 4 && !c) s -= 30;
        if (s > bs) { bs = s; best = i; }
      });
      if (best < 0 || bs < 12) break;
      if (act(G, pid, { t: 'buy', slot: best }) !== 'ok') break;
    }
  };
  buyPass();
  // 4) 刷新：血少或到了固定刷新的等級
  const keep = L.rollKeep, rollLv = L.rollLv;
  const wantRoll = T.hp < AI_CFG.ROLL_HP || P.level >= rollLv;
  for (let n = 0; n < 12 && wantRoll && P.gold >= keep + rerollCost(P) && (T.hp < AI_CFG.ROLL_HP || P.gold >= Math.max(keep, 30)); n++) { if (act(G, pid, { t: 'reroll' }) !== 'ok') break; buyPass(); }
  // 5) 備戰席太滿：賣最沒用的（不賣有對子的）
  const sellWorst = () => {
    const cnt = {}; for (const o of ownUnits(G, pid)) if (o.u.star === 1) cnt[o.u.key] = (cnt[o.u.key] || 0) + 1;
    const cand = ownUnits(G, pid).filter(o => o.zone === 'bench').sort((a, b) => (aiUnitValue(G, pid, a.u, plan) + (cnt[a.u.key] >= 2 && a.u.star === 1 ? 60 : 0)) - (aiUnitValue(G, pid, b.u, plan) + (cnt[b.u.key] >= 2 && b.u.star === 1 ? 60 : 0)));
    if (cand[0]) act(G, pid, { t: 'sell', uid: cand[0].u.uid });
  };
  for (let g = 0; g < 10 && P.bench.filter(x => !x).length < 1; g++) sellWorst();
  aiPlace(G, pid);
  // 6) 場上用不到、又不在計畫裡的低費卡，後期賣掉換錢
  if (R >= 10) for (const o of ownUnits(G, pid).filter(o => o.zone === 'bench' && o.u.star === 1 && ANIMALS[o.u.key].cost <= 2)) { const same = ownUnits(G, pid).filter(x => x.u.key === o.u.key && x.u.star === 1).length; if (same < 2 && !ANIMALS[o.u.key].traits.some(t => plan[t])) act(G, pid, { t: 'sell', uid: o.u.uid }); }
  aiItems(G, pid);
  P.ready = true;
}
function aiItems(G, pid) {
  const P = G.players[pid];
  const board = ownUnits(G, pid).filter(o => o.zone === 'board' && !o.u.summon);
  if (!board.length) return;
  const score = (o, role) => ANIMALS[o.u.key].cost * o.u.star * o.u.star + (aiRoleOf(o.u.key) === role ? 6 : 0) - o.u.items.length * 2;
  const carry = board.slice().sort((a, b) => score(b, 'carry') - score(a, 'carry'))[0];
  const tank = board.slice().sort((a, b) => score(b, 'tank') - score(a, 'tank'))[0];
  const DEF = { acorn: 1, shell: 1, dew: 1 };
  if (!aiLv(G, P).smartItems) { for (let i = P.items.length - 1; i >= 0; i--) { if (CONSUMABLES[P.items[i]]) continue; const o = board[G.rng(board.length)]; act(G, pid, { t: 'equip', idx: i, uid: o.u.uid }); } return; }
  for (let i = P.items.length - 1; i >= 0; i--) {
    const it = P.items[i]; if (CONSUMABLES[it]) continue;
    let order;
    if (EMBLEMS[it]) order = board.filter(o => !ANIMALS[o.u.key].traits.includes(EMBLEMS[it].trait)).sort((a, b) => score(b, 'carry') - score(a, 'carry'));
    else if (MATS[it]) {
      const pair = board.find(o => o.u.items.some(x => MATS[x] && RECIPE[[x, it].sort().join('+')])); // 能合成就先合成
      const main = DEF[it] ? tank : carry;
      order = [pair && (pair === main || pair.u.items.length < CFG.MAX_ITEMS) ? pair : null, main, carry, tank].filter(Boolean).concat(board);
    } else order = [ITEMS[it] && /受到傷害|護盾|生命|護甲|閃避|免疫/.test(ITEMS[it].desc) ? tank : carry, carry, tank].concat(board);
    for (const o of order) if (act(G, pid, { t: 'equip', idx: i, uid: o.u.uid }) === 'ok') break;
  }
}
function aiPlace(G, pid) {
  const P = G.players[pid], L = aiLv(G, P);
  const inMine = k => inHalf(P.team, +k);
  // 被真人隊友移動過的棋子（pinned）留在原地；其他的先收回重新排
  for (const k in G.board) { const u = G.board[k]; if (u.owner !== pid) continue; if (u.pinned && inMine(k)) continue; delete G.board[k]; const s = P.bench.indexOf(null); if (s >= 0) P.bench[s] = u; else P.bench.push(u); }
  const plan = aiPlan(G, pid);
  const onBoard = boardCount(G, pid);
  const list = ownUnits(G, pid).filter(o => o.zone === 'bench').sort((a, b) => aiUnitValue(G, pid, b.u, plan) - aiUnitValue(G, pid, a.u, plan)).slice(0, Math.max(0, popCap(P) - onBoard));
  const free = [];
  for (let r = 0; r < CFG.ROWS_HALF; r++) for (let c = 0; c < CFG.COLS; c++) {
    const [gc, gr] = toGlobal(SIDE(P.team), c, r), k = teamCell(P.team, gr * CFG.COLS + gc);
    if (!G.board[k] && G.terrain[cellBase(k)] !== 'rock' && !P.avoidCells[k]) free.push({ k, c, r });
  }
  const mid = (CFG.COLS - 1) / 2 + 0.25;
  const centerScore = f => { const [c, r] = cellRC(f.k); return Math.abs(hexX(c, r) - mid); };
  // 先放坦克、戰士，再放輸出、刺客（後排的才知道要躲在誰後面）
  const rank = { tank: 0, fighter: 1, carry: 2, assassin: 3 };
  list.sort((a, b) => rank[aiRoleOf(a.u.key)] - rank[aiRoleOf(b.u.key)]);
  const front = CFG.ROWS_HALF - 1; // r：0 後排 … ROWS_HALF−1 最前排（本地座標）
  for (const o of list) {
    const A = ANIMALS[o.u.key], role = aiRoleOf(o.u.key);
    let spot = null;
    if (P.target) { const tp = P.target.units.find(x => x[0] === o.u.key); if (tp) spot = free.find(f => f.c === tp[2] && f.r === tp[3]) || null; } // 照玩家陣容的站位
    if (!spot && L.misplace && G.rng(100) < L.misplace && free.length) spot = free[G.rng(free.length)]; // 較弱的電腦：亂站
    // 合體技：靠近搭檔（隊友的或自己的）
    if (!spot && L.combo) for (const cb of COMBOS) {
      const partner = cb.a === o.u.key ? cb.b : cb.b === o.u.key ? cb.a : null; if (!partner) continue;
      for (const k in G.board) {
        const pu = G.board[k]; if (pu.key !== partner || G.players[pu.owner].team !== P.team || (pu.owner === pid && !G.solo)) continue;
        const [pc, pr] = cellRC(+k);
        const adj = free.filter(f => { const [fc, fr] = cellRC(f.k); return hexD(fc, fr, pc, pr) <= 1; });
        adj.sort((x, y) => (A.rng === 1 ? y.r - x.r : x.r - y.r) || centerScore(x) - centerScore(y));
        spot = adj[0]; if (spot) break;
      }
      if (spot) break;
    }
    if (!spot && G.rules.frontline && G.teams.length === 2 && (o.u.key === 'bat' || o.u.key === 'cheetah') && intruders(G, pid) < 1 && G.rng(2)) {
      const row = SIDE(P.team) === 0 ? CFG.ROWS_HALF : CFG.ROWS_HALF - 1;
      for (const c of CENTER_COLS()) { const k = teamCell(P.team, row * CFG.COLS + c); if (!G.board[k] && G.terrain[cellBase(k)] !== 'rock') { if (act(G, pid, { t: 'move', uid: o.u.uid, to: { zone: 'board', cell: k } }) === 'ok') spot = 'done'; break; } }
      if (spot === 'done') continue;
    }
    if (!spot) {
      const tScore = f => { const tt = G.terrain[f.k], hi = (G.height || {})[f.k]; let s = 0;
        if (tt === 'burn') s += 1.5; if (A.rng >= 2 && (hi || tt === 'shadow' || tt === 'tree')) s -= 1.2; if (tt === 'bounce') s += A.rng >= 2 || role === 'tank' ? 2 : -0.8; if (tt === 'water' && A.traits.includes('water')) s -= 0.8; return s; };
      // 想站的列：坦克最前、戰士第二排、輸出後排（射程越遠越後面）、刺客後排角落（開場會跳）
      const wantRow = role === 'tank' ? front : role === 'fighter' ? Math.max(0, front - 1) : role === 'assassin' ? 0 : Math.max(0, Math.min(front - 1, front - A.rng));
      const sideBias = f => role === 'assassin' ? -Math.abs(f.c - (CFG.COLS - 1) / 2) * 0.35 : role === 'carry' ? centerScore(f) * 0.25 : centerScore(f) * 0.15;
      // 輸出躲在坦克後面：同一欄前方有隊友比較好
      const covered = f => { if (role !== 'carry') return 0; for (const k in G.board) { const u = G.board[k]; if (G.players[u.owner].team !== P.team) continue; const [c, r] = cellRC(+k), [lc, lr] = toLocal(SIDE(P.team), c, r); if (Math.abs(lc - f.c) <= 1 && lr > f.r) return -0.6; } return 0; };
      const cand = free.slice().sort((a, b) => (Math.abs(a.r - wantRow) + tScore(a) + sideBias(a) + covered(a)) - (Math.abs(b.r - wantRow) + tScore(b) + sideBias(b) + covered(b)) || a.c - b.c);
      spot = cand[0];
    }
    if (!spot) break;
    free.splice(free.indexOf(spot), 1);
    act(G, pid, { t: 'move', uid: o.u.uid, to: { zone: 'board', cell: spot.k } });
  }
  compactBench(G, P);
}
// 準備階段最後幾秒：AI 隊友再看一次真人隊友的擺法（讓開被標記的位置、補位）
function aiLate(G, pid) {
  const P = G.players[pid], human = aiHumanMate(G, pid); if (!human || P.out) return;
  aiHelpMate(G, pid);
  aiPlace(G, pid); aiItems(G, pid);
}
function compactBench(G, P) {
  const extra = P.bench.slice(CFG.BENCH).filter(Boolean);
  P.bench.length = CFG.BENCH;
  for (const u of extra) {
    const s = P.bench.indexOf(null);
    if (s >= 0) P.bench[s] = u;
    else { P.gold += sellValue(u); G.pool[u.key] += Math.pow(3, u.star - 1); P.items.push(...u.items); }
  }
  for (let i = 0; i < CFG.BENCH; i++) if (P.bench[i] === undefined) P.bench[i] = null;
}

// ---- 海克斯增幅 ----
const popCap = P => Math.min(10, P.level + P.popBonus);
const rerollCost = P => P.freeRoll > 0 ? 0 : P.discount > 0 ? 1 : CFG.REROLL_COST;
function augMap(G) { const m = {}; for (const P of G.players) m[P.id] = P.augs.slice(); return m; }
function lowMap(G) { const m = {}; for (const P of G.players) m[P.id] = G.teams[P.team].hp < 40; return m; }
const augOk = (G, a) => !(a.minRound > G.round) && !(a.solo === false && G.solo); // 太強的海克斯只在後面回合出現
function offerAugments(G) {
  const idx = CFG.AUG_ROUNDS.indexOf(G.round), odds = CFG.AUG_TIER_ODDS[Math.min(idx, CFG.AUG_TIER_ODDS.length - 1)];
  let r = G.rng(100), tier = 1; for (let i = 0; i < 3; i++) { if (r < odds[i]) { tier = i + 1; break; } r -= odds[i]; }
  if (G.portal === 'prismatic' && idx === 0) tier = 3; // 傳送門「海克斯狂熱」：第一次就彩色（但仍受每個海克斯的最早回合限制）
  G.augTier = tier;
  for (const P of G.players) {
    if (P.out) continue;
    const pool = AUGMENTS.filter(a => a.tier === tier && !P.augs.includes(a.id) && augOk(G, a)).map(a => a.id);
    const pick = [];
    while (pick.length < 3 && pool.length) pick.push(pool.splice(G.rng(pool.length), 1)[0]);
    P.augChoice = pick; P.augRolled = [];
  }
}
function applyAugNow(G, P, id) {
  if (id === 'piggy') P.gold += 8;
  if (id === 'discount') P.discount = 4;
  if (id === 'ark') { G.teams[P.team].hp += 20; G.teams[P.team].ark += 2; }
  if (id === 'armsrace') { P.level = Math.min(CFG.MAX_LEVEL, P.level + 1); P.xp = 0; P.gold += 20; P.popBonus += 1; }
  if (id === 'beastgod') {
    const keys = Object.keys(ANIMALS).filter(k => ANIMALS[k].cost === 5);
    const k = keys[G.rng(keys.length)];
    if (P.bench.indexOf(null) < 0) { const w = ownUnits(G, P.id).filter(o => o.zone === 'bench').sort((a, b) => power(a.u) - power(b.u))[0]; act(G, P.id, { t: 'sell', uid: w.u.uid }); }
    const u = newUnit(G, k, 2, P.id); P.bench[P.bench.indexOf(null)] = u;
    G.log.push({ k: 'gain', pid: P.id, uid: u.uid, key: k });
  }
}

function pveOf(R) { const dc = (CFG.COLS - 7) >> 1, dr = CFG.ROWS_HALF - 4; return (PVE[R] || PVE[23]).map(([k, c, r]) => [k, c + dc, r + dr]); } // PVE 座標以 7×4 半場寫，換算到目前棋盤（置中、前排對齊）

// ===== 天氣、遭遇、選秀、掉落、消耗品、中立物件 =====
function battleFlags(G) { return { eternalnight: G.portal === 'eternalnight', bond: G.portal === 'bond', solo: !!G.solo }; }
function rollWeather(G) {
  if (!G.rules.weather) { G.weather = 'sunny'; return; }
  let list = ARENA_WEATHER[G.arena] || ['sunny'];
  if (G.portal === 'wildweather' || G.stormLeft > 0) list = list.filter(w => w !== 'sunny');
  if (G.stormLeft > 0) G.stormLeft--;
  G.weather = list[G.rng(list.length)];
}
function startEncounter(G) {
  const E = ENCOUNTERS[G.rng(ENCOUNTERS.length)];
  G.encounter = { id: E.id, round: G.round, pending: false, choice: E.choice || null };
  const mats = Object.keys(MATS), embs = Object.keys(EMBLEMS);
  for (const P of G.players) {
    if (E.id === 'merchant') P.freeRoll += 2;
    if (E.id === 'picnic') P.items.push(mats[G.rng(mats.length)]);
    if (E.id === 'zoo') { const ks = Object.keys(ANIMALS).filter(k => ANIMALS[k].cost === 2 && G.pool[k] > 0); if (ks.length && P.bench.indexOf(null) >= 0) { const k = ks[G.rng(ks.length)]; G.pool[k]--; P.bench[P.bench.indexOf(null)] = newUnit(G, k, 1, P.id); checkMerge(G, P.id); } }
    if (E.id === 'spring') addXp(P, 6);
    if (E.id === 'goldrain') P.gold += 5;
    if (E.id === 'emblemrain') P.items.push(embs[G.rng(embs.length)]);
    if (E.id === 'toolbox') P.items.push('reforge', 'remover');
  }
  if (E.id === 'migration') { const ts = Object.keys(TRAITS); G.migration = ts[G.rng(ts.length)]; for (const P of G.players) if (!P.locked) rollShop(G, P); }
  if (E.id === 'storm') { G.stormLeft = 3; rollWeather(G); }
  if (E.id === 'captain') {
    G.encounter.pending = true;
    // AI 隊長直接決定；玩家隊長要自己選
    for (const T of G.teams) if (!T.out && G.players[T.captain].ai) applyCaptain(G, G.teams.indexOf(T), E.choice[G.rng(2)]);
    G.encounter.pendingTeams = G.teams.map((T, i) => T.out || G.players[T.captain].ai ? null : i).filter(x => x !== null);
    if (!G.encounter.pendingTeams.length) G.encounter.pending = false;
  }
  G.log.push({ k: 'encounter', id: E.id, trait: G.migration });
}
function applyCaptain(G, team, choice) {
  const done = Object.keys(ITEMS);
  for (const P of G.players) if (P.team === team) { if (choice === 'gold') P.gold += 4; else P.items.push(done[G.rng(done.length)]); }
  G.log.push({ k: 'captainChoice', team, choice });
}
function resolveEncounter(G, choice) {
  const E = G.encounter; if (!E || !E.pending) return;
  for (const t of E.pendingTeams || []) applyCaptain(G, t, choice);
  E.pending = false; E.pendingTeams = [];
}
function startDraft(G) {
  const st = stageOf(G.round), maxCost = Math.min(5, Math.max(1, st)), opts = [];
  const mats = Object.keys(MATS), done = Object.keys(ITEMS), embs = Object.keys(EMBLEMS);
  for (let i = 0; i < 8; i++) {
    const ks = Object.keys(ANIMALS).filter(k => ANIMALS[k].cost <= maxCost && G.pool[k] > 0); if (!ks.length) break;
    const key = ks[G.rng(ks.length)];
    const r = G.rng(100), item = G.round < 11 ? mats[G.rng(mats.length)] : r < 25 ? embs[G.rng(embs.length)] : r < 70 ? done[G.rng(done.length)] : mats[G.rng(mats.length)];
    opts.push({ key, item, taken: false });
  }
  const order = G.players.filter(p => !p.out).sort((a, b) => (G.teams[a.team].hp - G.teams[b.team].hp) || (a.slot - b.slot) || (a.team - b.team)).map(p => p.id);
  G.draft = { options: opts, order, idx: 0 };
  G.log.push({ k: 'draft' });
}
function draftPick(G, pid, i) {
  const D = G.draft; if (!D) return 'bad';
  if (D.order[D.idx] !== pid) return 'not_turn';
  let o = D.options[i];
  if (!o || o.taken) { o = D.options.find(x => !x.taken); if (!o) { G.draft = null; return 'bad'; } }
  o.taken = pid; const P = G.players[pid];
  if (G.pool[o.key] > 0) {
    G.pool[o.key]--;
    const slot = P.bench.indexOf(null);
    if (slot >= 0) { P.bench[slot] = newUnit(G, o.key, 1, pid); } else P.gold += ANIMALS[o.key].cost;
  }
  P.items.push(o.item);
  G.log.push({ k: 'drafted', pid, key: o.key, item: o.item });
  checkMerge(G, pid);
  D.idx++;
  if (D.idx >= D.order.length) G.draft = null;
  return 'ok';
}
function aiDraftTurns(G) {
  while (G.draft && G.players[G.draft.order[G.draft.idx]].ai) {
    const pid = G.draft.order[G.draft.idx], own = {};
    for (const o of ownUnits(G, pid)) own[o.u.key] = (own[o.u.key] || 0) + 1;
    let best = 0, bs = -1;
    G.draft.options.forEach((o, i) => { if (o.taken) return; const sc = ANIMALS[o.key].cost * 10 + (own[o.key] || 0) * 15 + (ITEMS[o.item] ? 8 : 0) + G.rng(5); if (sc > bs) { bs = sc; best = i; } });
    draftPick(G, pid, best);
  }
}
// 野怪掉落（v0.12.8 調低，接近聯盟戰棋）：第 1 階段每關 1 個材料；之後的野怪關打贏才有 1 份掉落、打輸只有安慰金幣
const LOOT_CFG = { EARLY_GOLD: 1, MAT: 40, GOLD: 30, UNIT: 18, GOLD_MIN: 2, GOLD_MAX: 3, LOSE_GOLD: 1 }; // 機率（%，剩下的是消耗品／紋章）與金幣數
function rollLoot(G, R, win) {
  if (R <= 3) return [{ type: 'mat', k: Object.keys(MATS)[G.rng(6)] }].concat(R === 3 && LOOT_CFG.EARLY_GOLD ? [{ type: 'gold', n: LOOT_CFG.EARLY_GOLD }] : []);
  if (win === false) return LOOT_CFG.LOSE_GOLD ? [{ type: 'gold', n: LOOT_CFG.LOSE_GOLD }] : [];
  const out = isBoss(R) ? [{ type: 'mat', k: Object.keys(MATS)[G.rng(6)] }] : [], // 打贏魔王多一個材料
    st = stageOf(R), C = LOOT_CFG, r = G.rng(100);
  if (r < C.MAT) out.push({ type: 'mat', k: Object.keys(MATS)[G.rng(6)] });
  else if (r < C.MAT + C.GOLD) out.push({ type: 'gold', n: C.GOLD_MIN + G.rng(C.GOLD_MAX - C.GOLD_MIN + 1) });
  else if (r < C.MAT + C.GOLD + C.UNIT) { const ks = Object.keys(ANIMALS).filter(k => ANIMALS[k].cost <= Math.min(5, st) && G.pool[k] > 0); if (ks.length) out.push({ type: 'unit', k: ks[G.rng(ks.length)] }); else out.push({ type: 'gold', n: C.GOLD_MIN }); }
  else if (R < 13 || G.rng(100) < 60) { const cs = Object.keys(CONSUMABLES); out.push({ type: 'item', k: cs[G.rng(cs.length)] }); }
  else { const es = Object.keys(EMBLEMS); out.push({ type: 'item', k: es[G.rng(es.length)] }); }
  return out;
}
function giveLoot(G, P, d) {
  if (d.type === 'gold') P.gold += d.n;
  else if (d.type === 'mat' || d.type === 'item') P.items.push(d.k);
  else if (d.type === 'unit') {
    if (G.pool[d.k] > 0 && P.bench.indexOf(null) >= 0) { G.pool[d.k]--; P.bench[P.bench.indexOf(null)] = newUnit(G, d.k, 1, P.id); checkMerge(G, P.id); }
    else { d = { type: 'gold', n: ANIMALS[d.k].cost }; P.gold += d.n; }
  }
  G.log.push({ k: 'loot', pid: P.id, d });
}
function useConsumable(G, P, idx, tgt) {
  const it = P.items[idx], u = tgt.u;
  if (it === 'remover') { if (!u.items.length) return 'no_items'; P.items.push(...u.items); u.items = []; }
  else if (it === 'reforge') {
    if (!u.items.length) return 'no_items';
    const mats = Object.keys(MATS), done = Object.keys(ITEMS), embs = Object.keys(EMBLEMS);
    u.items = u.items.map(x => { const pool = MATS[x] ? mats : EMBLEMS[x] ? embs.filter(e => !ANIMALS[u.key].traits.includes(EMBLEMS[e].trait)) : done; const c = pool.filter(y => y !== x); return c.length ? c[G.rng(c.length)] : x; });
  } else if (it === 'dupe') {
    if (G.pool[u.key] <= 0) return 'pool_empty';
    const slot = P.bench.indexOf(null); if (slot < 0) return 'bench_full';
    G.pool[u.key]--; P.bench[slot] = newUnit(G, u.key, 1, P.id);
  } else return 'bad';
  P.items.splice(P.items.indexOf(it), 1);
  G.log.push({ k: 'consume', pid: P.id, item: it, uid: u.uid });
  if (it === 'dupe') checkMerge(G, P.id);
  return 'ok';
}
// 戰鬥中的中立寶箱／木箱（v0.12.8 調低：不是每場都有，掉落也變少）
const NEUTRAL_CFG = { CHEST_PCT: 50, CRATE_PCT: 50, CHEST_GOLD: 1, CHEST_MAT_PCT: 50, CRATE_GOLD: 1 };
function rollNeutrals(G, units) {
  if (!G.rules.neutrals) return [];
  const st = stageOf(G.round), out = [], occ = {};
  for (const u of units || []) occ[u.r * CFG.COLS + u.c] = 1;
  const free = (c, r) => !occ[r * CFG.COLS + c] && G.terrain[r * CFG.COLS + c] !== 'rock';
  // 中線寶箱：放在雙方前排之一（隨機），兩隊都有機會打到
  const cols = [3, 2, 4, 1, 5, 0, 6];
  const row = G.rng(2) ? CFG.ROWS_HALF - 1 : CFG.ROWS_HALF;
  if (G.rng(100) < NEUTRAL_CFG.CHEST_PCT) for (const c of cols) if (free(c, row)) { out.push({ key: 'chest', c, r: row, hp: 350 + st * 120 }); break; }
  // 木箱：雙方對稱各一個
  if (G.rng(100) < NEUTRAL_CFG.CRATE_PCT) for (let tries = 0; tries < 20; tries++) {
    const c = G.rng(CFG.COLS), r = 1 + G.rng(2), [c2, r2] = toGlobal(1, c, r);
    if (free(c, r) && free(c2, r2)) { out.push({ key: 'crate', c, r, hp: 200 + st * 60 }, { key: 'crate', c: c2, r: r2, hp: 200 + st * 60 }); break; }
  }
  return out;
}

// ===== 動物戰棋 伺服器（Cloudflare Workers + Durable Objects）=====
// 整場遊戲在伺服器上跑（玩家只送操作），帳號、天梯分數也只存在伺服器：玩家改自己的瀏覽器改不了結果。
// 前面接上 data.js / engine.js / game.js（打包時串在一起）。

const SV = {
  ORIGINS: ['https://willy110611-collab.github.io', 'https://zoochess.pages.dev', 'http://localhost:8123', 'http://127.0.0.1:8123'], // 網站網址（Cloudflare Pages 的預覽網址 *.zoochess.pages.dev 也允許）
  VERSION: '0.13.0',    // 打包時自動填入（跟網站版本一致），一鍵更新用來確認伺服器已部署新版
  TICK_MS: 100,          // 伺服器遊戲迴圈
  SNAP_MS: 250,          // 多久檢查一次要不要送畫面
  SNAP_KEEPALIVE_MS: 2000, // 畫面沒變時，最久多久還是送一次（校正倒數計時）
  BTICK_MS: 200,         // 戰鬥中多久送一次 tick
  JOIN_WAIT_MS: 15000,   // 配對成功後最多等成員進房多久
  IDLE_CLOSE_MS: 120000, // 房間沒人多久關掉
  PBKDF2_ITER: 60000,    // 密碼雜湊強度
  SESSION_DAYS: 120,
  ACTIVE_MAX_MS: 4 * 3600e3,
  SAVE_MS: 5000,         // 對局狀態多久存一次（伺服器重啟或房間被清掉時能接回來）
  SEASON_DAYS: 35,       // 一個賽季幾天（到期自動結算、天梯歸零）
  SEASON_REWARD: [[6, 'seasonDia'], [3, 'seasonGold']], // 賽季結束時牌位（0＝黑鐵…6＝鑽石）達到多少給哪個造型
  FRIEND_MAX: 50, ONLINE_MS: 60000, INVITE_MS: 120000,
  LIVE_MAX_MS: 2 * 3600e3, // 「回到對局」紀錄最多保留多久（一場不會打這麼久）
  REG_PER_IP_DAY: 5,     // 同一個 IP 一天最多註冊幾個帳號（擋大量分身）
  LOGIN_FAIL_HOUR: 10,   // 同一帳號一小時最多輸錯幾次
  MM_SAME_TZ: 2, MM_WIDEN_MS: 20000,
  META: { MIN_UNITS: 4, MAX: 300, SEND: 60, MIN_GAMES: 6, MIN_WR: 0.35, KEEP_DAYS: 30 }, // 電腦模仿陣容庫：最多幾套、每次給電腦幾套、用過幾場後勝率低於多少就刪、多久沒更新就刪
  LADDER: { WIN2: 24, LOSE2: -18, PLACE4: [0, 36, 16, -10, -24], ELO_SPAN: 250, SOLO_TOP: 36 }, // SOLO_TOP：單人混戰第 1 名基本分（最後一名 −36，中間平均分配）
};
const AI_NAMES_S = ['阿熊', '野狼幫甲', '野狼幫乙', '河馬團甲', '河馬團乙', '鴨鴨隊甲', '鴨鴨隊乙', '狸貓'];
const MM_ORDER_S = { 4: [0, 2, 1, 3], 8: [0, 2, 4, 6, 1, 3, 5, 7], solo: [0, 1, 2, 3, 4, 5, 6, 7], duel: [0, 1] };
const te = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const avgLp = seats => { const a = seats.filter(Boolean).map(s => s.lp || 0); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; };
function weekOf(t) { const d = new Date(t); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const y = d.getUTCFullYear(), w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7); return y + '-W' + String(w).padStart(2, '0'); }
function roomCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(4)); return [...r].map(x => A[x % A.length]).join(''); }

function cors(req) {
  const o = req.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': (SV.ORIGINS.includes(o) || /^https:\/\/[a-z0-9-]+\.zoochess\.pages\.dev$/.test(o)) ? o : SV.ORIGINS[0], 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' };
}
const json = (req, obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors(req)) });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    const acc = env.ACC.get(env.ACC.idFromName('main'));
    const ip = req.headers.get('CF-Connecting-IP') || '0';
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    try {
      if (p === '/api/register' && req.method === 'POST') { const b = await req.json(); return json(req, await acc.register(String(b.user || ''), String(b.pass || ''), String(b.name || ''), ip)); }
      if (p === '/api/login' && req.method === 'POST') { const b = await req.json(); return json(req, await acc.login(String(b.user || ''), String(b.pass || ''))); }
      if (p === '/api/me') return json(req, await acc.me(tok));
      if (p === '/api/rename' && req.method === 'POST') { const b = await req.json(); return json(req, await acc.rename(tok, String(b.name || ''))); }
      if (p === '/api/logout' && req.method === 'POST') return json(req, await acc.logout(tok));
      if (p === '/api/ladder') return json(req, await acc.ladder(tok, url.searchParams.get('mode') || 'duo'));
      if (p === '/api/meta') return json(req, { ok: true, list: await acc.getMeta() });
      if (p === '/api/friends') return json(req, await acc.friends(tok));
      if (p === '/api/friend' && req.method === 'POST') { const b = await req.json(); return json(req, await acc.friendAdd(tok, String(b.user || ''))); }
      if (p === '/api/friend/remove' && req.method === 'POST') { const b = await req.json(); return json(req, await acc.friendRemove(tok, String(b.uid || ''))); }
      if (p === '/api/invite' && req.method === 'POST') { const b = await req.json(); return json(req, await acc.invite(tok, String(b.uid || ''), String(b.code || ''))); }
      if (p === '/api/live') return json(req, await acc.liveList());
      if (p === '/api/season') return json(req, await acc.seasonInfo());
      if (p === '/report') return new Response(await acc.reportHtml(url.searchParams.get('w') || ''), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      if (p === '/api/active') { // 重開 App：有沒有還沒打完、自己也還沒被淘汰的對局
        const a = await acc.getActive(tok); if (!a) return json(req, { ok: true, code: '' });
        const st = await env.ROOM.get(env.ROOM.idFromName(a.code)).status(a.uid).catch(() => null);
        if (!st || !st.alive) { await acc.clearActive([a.uid], a.code); return json(req, { ok: true, code: '' }); }
        return json(req, { ok: true, code: a.code });
      }
      if (p === '/api/ping') return json(req, { ok: true, t: Date.now(), v: SV.VERSION, colo: (req.cf && req.cf.colo) || '' });
      if (req.headers.get('Upgrade') === 'websocket') {
        let m;
        if (p === '/ws/new') { const code = roomCode(), solo = url.searchParams.get('solo') === '1', md = solo ? Math.max(2, Math.min(8, +url.searchParams.get('mode') || 8)) : (url.searchParams.get('mode') === '8' ? 8 : 4); return env.ROOM.get(env.ROOM.idFromName(code)).fetch(new Request(url.origin + '/ws?code=' + code + '&mode=' + md + (solo ? '&solo=1' : ''), req)); }
        if ((m = p.match(/^\/ws\/room\/([A-Z0-9]{4})$/))) return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(new Request(url.origin + '/ws?code=' + m[1], req));
        if (p === '/ws/mm') return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(req);
      }
      return json(req, { err: 'not found' }, 404);
    } catch (e) { return json(req, { err: '伺服器錯誤' }, 500); }
  },
};

// ===================== 帳號與天梯 =====================
export class Accounts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, user TEXT UNIQUE, salt TEXT, hash TEXT, name TEXT, lp INTEGER DEFAULT 0, games INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, created INTEGER, ip TEXT);
      CREATE TABLE IF NOT EXISTS sessions (tok TEXT PRIMARY KEY, uid TEXT, exp INTEGER);
      CREATE TABLE IF NOT EXISTS fails (user TEXT, t INTEGER);
      CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, t INTEGER, data TEXT);
      CREATE INDEX IF NOT EXISTS users_lp ON users(lp DESC);`);
    // v0.12：單人天梯分開計分（舊資料表補欄位）
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (id TEXT PRIMARY KEY, data TEXT, n INTEGER, games INTEGER DEFAULT 1, wins INTEGER DEFAULT 1, t INTEGER)');
    for (const c of ['lp1', 'games1', 'wins1']) { try { this.sql.exec(`ALTER TABLE users ADD COLUMN ${c} INTEGER DEFAULT 0`); } catch (e) {} }
    // v0.12.5：每個帳號正在打的對局（重開 App 自動回到同一場）
    this.sql.exec('CREATE TABLE IF NOT EXISTS active (uid TEXT PRIMARY KEY, code TEXT, t INTEGER)');
    // v0.12.12：平衡統計、好友、邀請、觀戰清單、賽季
    this.sql.exec(`CREATE TABLE IF NOT EXISTS bal (week TEXT, kind TEXT, key TEXT, games INTEGER DEFAULT 0, place REAL DEFAULT 0, top INTEGER DEFAULT 0, PRIMARY KEY (week, kind, key));
      CREATE TABLE IF NOT EXISTS friends (a TEXT, b TEXT, ok INTEGER DEFAULT 0, t INTEGER, PRIMARY KEY (a, b));
      CREATE TABLE IF NOT EXISTS invites (too TEXT, frm TEXT, code TEXT, t INTEGER, PRIMARY KEY (too, frm));
      CREATE TABLE IF NOT EXISTS live (code TEXT PRIMARY KEY, data TEXT, t INTEGER);
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS season_hist (uid TEXT, season INTEGER, lp INTEGER, lp1 INTEGER, PRIMARY KEY (uid, season));`);
    try { this.sql.exec('ALTER TABLE users ADD COLUMN seen INTEGER DEFAULT 0'); } catch (e) {}
  }
  async hashPw(pass, salt) {
    const k = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: te.encode(salt), iterations: SV.PBKDF2_ITER }, k, 256));
  }
  row(q, ...a) { const r = this.sql.exec(q, ...a).toArray(); return r[0] || null; }
  pub(u) { return u ? { uid: u.uid, user: u.user, name: u.name, lp: u.lp, games: u.games, wins: u.wins, lp1: u.lp1 || 0, games1: u.games1 || 0, wins1: u.wins1 || 0 } : null; }
  newSession(uid) { const tok = rand(24); this.sql.exec('INSERT INTO sessions VALUES (?,?,?)', tok, uid, Date.now() + SV.SESSION_DAYS * 864e5); return tok; }
  async register(user, pass, name, ip) {
    user = user.trim().toLowerCase(); name = name.trim().slice(0, 8);
    if (!/^[a-z0-9_]{3,16}$/.test(user)) return { err: '帳號要 3～16 個英文小寫、數字或底線' };
    if (pass.length < 6 || pass.length > 64) return { err: '密碼要 6～64 個字' };
    if (!name) return { err: '請填暱稱' };
    if (this.row('SELECT uid FROM users WHERE user=?', user)) return { err: '這個帳號已經有人用了' };
    const n = this.row('SELECT COUNT(*) AS n FROM users WHERE ip=? AND created>?', ip, Date.now() - 864e5).n;
    if (n >= SV.REG_PER_IP_DAY && !['127.0.0.1', '::1', '0'].includes(ip)) return { err: '這個網路今天註冊太多帳號了，明天再試' };
    const uid = 'u' + rand(6), salt = rand(12);
    this.sql.exec('INSERT INTO users (uid,user,salt,hash,name,created,ip) VALUES (?,?,?,?,?,?,?)', uid, user, salt, await this.hashPw(pass, salt), name, Date.now(), ip);
    return { ok: true, token: this.newSession(uid), me: this.pub(this.row('SELECT * FROM users WHERE uid=?', uid)) };
  }
  async login(user, pass) {
    user = user.trim().toLowerCase();
    const fails = this.row('SELECT COUNT(*) AS n FROM fails WHERE user=? AND t>?', user, Date.now() - 36e5).n;
    if (fails >= SV.LOGIN_FAIL_HOUR) return { err: '輸錯太多次，請一小時後再試' };
    const u = this.row('SELECT * FROM users WHERE user=?', user);
    if (!u || (await this.hashPw(pass, u.salt)) !== u.hash) { this.sql.exec('INSERT INTO fails VALUES (?,?)', user, Date.now()); return { err: '帳號或密碼不對' }; }
    this.sql.exec('DELETE FROM sessions WHERE exp<?', Date.now());
    return { ok: true, token: this.newSession(u.uid), me: this.pub(u) };
  }
  verify(tok) {
    if (!tok) return null;
    const s = this.row('SELECT uid, exp FROM sessions WHERE tok=?', String(tok));
    if (!s || s.exp < Date.now()) return null;
    return this.pub(this.row('SELECT * FROM users WHERE uid=?', s.uid));
  }
  async me(tok) { this.seasonCheck(); const u = this.verify(tok); if (!u) return { err: '請重新登入' }; this.sql.exec('UPDATE users SET seen=? WHERE uid=?', Date.now(), u.uid); u.rewards = this.rewardsOf(u.uid); return { ok: true, me: u }; }
  // ---- 賽季：到期就把分數存進歷史、發造型、天梯歸零 ----
  kvGet(k) { const r = this.row('SELECT v FROM kv WHERE k=?', k); return r ? JSON.parse(r.v) : null; }
  kvSet(k, v) { this.sql.exec('INSERT OR REPLACE INTO kv VALUES (?,?)', k, JSON.stringify(v)); }
  season() { let S = this.kvGet('season'); if (!S) { S = { n: 1, start: Date.now() }; this.kvSet('season', S); } return S; }
  seasonCheck() {
    const S = this.season(); if (Date.now() < S.start + SV.SEASON_DAYS * 864e5) return;
    this.sql.exec('INSERT OR REPLACE INTO season_hist SELECT uid, ?, lp, lp1 FROM users WHERE games>0 OR games1>0', S.n);
    this.sql.exec('UPDATE users SET lp=0, lp1=0');
    this.kvSet('season', { n: S.n + 1, start: Date.now() });
  }
  async seasonInfo() { this.seasonCheck(); const S = this.season(); return { ok: true, n: S.n, end: S.start + SV.SEASON_DAYS * 864e5 }; }
  rewardsOf(uid) { const out = []; for (const r of this.sql.exec('SELECT season, lp, lp1 FROM season_hist WHERE uid=?', uid).toArray()) { const tier = Math.floor(Math.max(r.lp, r.lp1) / 100); for (const [need, skin] of SV.SEASON_REWARD) if (tier >= need) { out.push({ season: r.season, skin, tier }); break; } } return out; }
  // ---- 平衡統計：每週記每隻動物、每個海克斯的出場與名次 ----
  async balAdd(rows) { const w = weekOf(Date.now()); for (const r of rows || []) this.sql.exec('INSERT INTO bal (week,kind,key,games,place,top) VALUES (?,?,?,1,?,?) ON CONFLICT(week,kind,key) DO UPDATE SET games=games+1, place=place+excluded.place, top=top+excluded.top', w, r.kind, String(r.key), +r.place || 0, r.top ? 1 : 0); return { ok: true }; }
  async reportHtml(w) {
    w = /^\d{4}-W\d{2}$/.test(w) ? w : weekOf(Date.now());
    const weeks = this.sql.exec('SELECT DISTINCT week FROM bal ORDER BY week DESC LIMIT 12').toArray().map(r => r.week);
    const tab = kind => { const rows = this.sql.exec('SELECT key, games, place, top FROM bal WHERE week=? AND kind=? ORDER BY (place*1.0/games) ASC', w, kind).toArray(); return rows.map(r => `<tr><td>${r.key}</td><td>${r.games}</td><td>${(r.place / r.games * 100).toFixed(0)}</td><td>${Math.round(r.top / r.games * 100)}%</td></tr>`).join('') || '<tr><td colspan=4>這週還沒有資料</td></tr>'; };
    return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>動物戰棋 平衡報告</title><style>body{font-family:sans-serif;max-width:720px;margin:20px auto;padding:0 12px}table{border-collapse:collapse;width:100%;margin-bottom:20px}td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}a{margin-right:8px}</style>
      <h1>平衡報告 ${w}</h1><p>名次分數：0＝都拿第一、100＝都最後一名，越低越強。前半＝拿到前一半名次的比例。只算真人與電腦都有的正式對局（伺服器上的房間）。</p><p>${weeks.map(x => `<a href="?w=${x}">${x}</a>`).join('')}</p>
      <h2>動物</h2><table><tr><th>動物</th><th>場</th><th>名次分數</th><th>前半</th></tr>${tab('u')}</table><h2>海克斯</h2><table><tr><th>海克斯</th><th>場</th><th>名次分數</th><th>前半</th></tr>${tab('a')}</table>`;
  }
  // ---- 好友與邀請 ----
  uidByUser(user) { const r = this.row('SELECT uid FROM users WHERE user=?', user.trim().toLowerCase()); return r ? r.uid : null; }
  async friends(tok) {
    const u = this.verify(tok); if (!u) return { err: '請重新登入' };
    const now = Date.now(); this.sql.exec('UPDATE users SET seen=? WHERE uid=?', now, u.uid);
    const info = (uid) => { const x = this.row('SELECT uid, name, lp, seen FROM users WHERE uid=?', uid); if (!x) return null; const a = this.row('SELECT code FROM active WHERE uid=?', uid); return { uid: x.uid, name: x.name, lp: x.lp, online: now - (x.seen || 0) < SV.ONLINE_MS, playing: !!a }; };
    const list = this.sql.exec('SELECT b FROM friends WHERE a=? AND ok=1', u.uid).toArray().map(r => info(r.b)).filter(Boolean);
    const incoming = this.sql.exec('SELECT a FROM friends WHERE b=? AND ok=0', u.uid).toArray().map(r => info(r.a)).filter(Boolean);
    this.sql.exec('DELETE FROM invites WHERE t<?', now - SV.INVITE_MS);
    const invites = this.sql.exec('SELECT frm, code FROM invites WHERE too=?', u.uid).toArray().map(r => ({ from: r.frm, name: (this.row('SELECT name FROM users WHERE uid=?', r.frm) || {}).name || '', code: r.code }));
    this.sql.exec('DELETE FROM invites WHERE too=?', u.uid); // 拿到就清掉，同一個邀請只跳一次
    return { ok: true, list, incoming, invites };
  }
  async friendAdd(tok, user) {
    const u = this.verify(tok); if (!u) return { err: '請重新登入' };
    const f = /^u[0-9a-f]{12}$/.test(user) ? user : this.uidByUser(user); if (!f) return { err: '找不到這個帳號' }; if (f === u.uid) return { err: '不能加自己' };
    if (this.row('SELECT COUNT(*) AS n FROM friends WHERE a=? AND ok=1', u.uid).n >= SV.FRIEND_MAX) return { err: '好友已滿' };
    const back = this.row('SELECT ok FROM friends WHERE a=? AND b=?', f, u.uid);
    if (back) { this.sql.exec('INSERT OR REPLACE INTO friends VALUES (?,?,1,?)', u.uid, f, Date.now()); this.sql.exec('UPDATE friends SET ok=1 WHERE a=? AND b=?', f, u.uid); return { ok: true, msg: '已成為好友' }; }
    this.sql.exec('INSERT OR IGNORE INTO friends VALUES (?,?,0,?)', u.uid, f, Date.now()); return { ok: true, msg: '已送出好友邀請，對方同意後就是好友' };
  }
  async friendRemove(tok, f) { const u = this.verify(tok); if (!u) return { err: '請重新登入' }; this.sql.exec('DELETE FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)', u.uid, f, f, u.uid); return { ok: true }; }
  async invite(tok, to, code) {
    const u = this.verify(tok); if (!u) return { err: '請重新登入' };
    if (!this.row('SELECT ok FROM friends WHERE a=? AND b=? AND ok=1', u.uid, to)) return { err: '對方還不是你的好友' };
    if (!/^[A-Z0-9]{4}$/.test(code)) return { err: '房號不對' };
    this.sql.exec('INSERT OR REPLACE INTO invites VALUES (?,?,?,?)', to, u.uid, code, Date.now()); return { ok: true };
  }
  // ---- 觀戰：正在打的排位房 ----
  async liveSet(code, data) { if (data) this.sql.exec('INSERT OR REPLACE INTO live VALUES (?,?,?)', code, JSON.stringify(data), Date.now()); else this.sql.exec('DELETE FROM live WHERE code=?', code); return { ok: true }; }
  async liveList() { this.sql.exec('DELETE FROM live WHERE t<?', Date.now() - SV.LIVE_MAX_MS); return { ok: true, list: this.sql.exec('SELECT code, data, t FROM live ORDER BY t DESC LIMIT 30').toArray().map(r => Object.assign({ code: r.code, t: r.t }, JSON.parse(r.data))) }; }
  async logout(tok) { this.sql.exec('DELETE FROM sessions WHERE tok=?', String(tok)); return { ok: true }; }
  async rename(tok, name) { const u = this.verify(tok); name = name.trim().slice(0, 8); if (!u) return { err: '請重新登入' }; if (!name) return { err: '請填暱稱' }; this.sql.exec('UPDATE users SET name=? WHERE uid=?', name, u.uid); return { ok: true, me: this.verify(tok) }; }
  async ladder(tok, mode) {
    this.seasonCheck();
    const [L, Gm, W] = mode === 'solo' ? ['lp1', 'games1', 'wins1'] : ['lp', 'games', 'wins'];
    const top = this.sql.exec(`SELECT uid, name, ${L} AS lp, ${Gm} AS games, ${W} AS wins FROM users WHERE ${Gm}>0 ORDER BY ${L} DESC, ${Gm} DESC LIMIT 100`).toArray();
    const total = this.row(`SELECT COUNT(*) AS n FROM users WHERE ${Gm}>0`).n;
    const u = this.verify(tok); let rank = 0;
    const ul = u ? (mode === 'solo' ? u.lp1 : u.lp) : 0, ug = u ? (mode === 'solo' ? u.games1 : u.games) : 0;
    if (u && ug) rank = this.row(`SELECT COUNT(*) AS n FROM users WHERE ${Gm}>0 AND (${L}>? OR (${L}=? AND ${Gm}>?))`, ul, ul, ug).n + 1;
    return { ok: true, top, total, me: u, rank, mode: mode === 'solo' ? 'solo' : 'duo' };
  }
  // ---- 進行中的對局 ----
  async setActive(uids, code) { for (const u of uids) this.sql.exec('INSERT OR REPLACE INTO active VALUES (?,?,?)', String(u), String(code), Date.now()); return { ok: true }; }
  async clearActive(uids, code) { for (const u of uids) this.sql.exec('DELETE FROM active WHERE uid=? AND code=?', String(u), String(code)); return { ok: true }; }
  async getActive(tok) {
    const u = this.verify(tok); if (!u) return null;
    const r = this.row('SELECT code, t FROM active WHERE uid=?', u.uid);
    if (!r) return null;
    if (Date.now() - r.t > SV.ACTIVE_MAX_MS) { this.sql.exec('DELETE FROM active WHERE uid=?', u.uid); return null; }
    return { uid: u.uid, code: r.code };
  }
  // ---- 電腦模仿玩家：高勝率陣容庫 ----
  // 收進「打出好名次的真人陣容」；電腦用過後回報名次。勝率 =（好名次+1）/（場數+2）；勝率太低或太舊的慢慢淘汰
  async metaAdd(comps, results) {
    const now = Date.now();
    for (const c of comps || []) {
      if (!Array.isArray(c.units) || c.units.length < SV.META.MIN_UNITS || c.units.length > 12) continue;
      const units = c.units.filter(u => Array.isArray(u) && typeof u[0] === 'string' && u[0].length < 20).map(u => [u[0], +u[1] || 1, +u[2] || 0, +u[3] || 0]);
      const id = units.map(u => u[0]).sort().join(',');
      if (this.row('SELECT id FROM meta WHERE id=?', id)) this.sql.exec('UPDATE meta SET data=?, games=games+1, wins=wins+1, t=? WHERE id=?', JSON.stringify(units), now, id);
      else this.sql.exec('INSERT INTO meta (id,data,n,games,wins,t) VALUES (?,?,?,1,1,?)', id, JSON.stringify(units), +c.n || 2, now);
    }
    for (const r of results || []) if (r && r.id) this.sql.exec('UPDATE meta SET games=games+1, wins=wins+? WHERE id=?', r.good ? 1 : 0, String(r.id));
    const M = SV.META;
    this.sql.exec('DELETE FROM meta WHERE games>=? AND (wins*1.0/games)<?', M.MIN_GAMES, M.MIN_WR);
    this.sql.exec('DELETE FROM meta WHERE t<?', now - M.KEEP_DAYS * 864e5);
    this.sql.exec('DELETE FROM meta WHERE id NOT IN (SELECT id FROM meta ORDER BY (wins+1.0)/(games+2) DESC, t DESC LIMIT ?)', M.MAX);
    return { ok: true };
  }
  async getMeta() {
    return this.sql.exec('SELECT id, data, games, wins FROM meta ORDER BY (wins+1.0)/(games+2) DESC LIMIT ?', SV.META.SEND).toArray().map(r => ({ id: r.id, units: JSON.parse(r.data), wr: Math.round((r.wins + 1) / (r.games + 2) * 100) / 100, games: r.games }));
  }
  // 一場（或一隊被淘汰時）結算：plist = [{uid, team, place}]，teamsLp 由這裡查
  async settle(matchId, n, plist, teamOfAll, solo) {
    const res = {}, LC = solo ? 'lp1' : 'lp', GC = solo ? 'games1' : 'games', WC = solo ? 'wins1' : 'wins';
    const lpOf = uid => { const u = this.row(`SELECT ${LC} AS v FROM users WHERE uid=?`, uid); return u ? (u.v || 0) : 0; };
    const humans = teamOfAll.map(x => ({ uid: x.uid, team: x.team, lp: lpOf(x.uid) }));
    const avg = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    const allAvg = avg(humans.map(h => h.lp));
    const teamLp = t => { const v = humans.filter(h => h.team === t).map(h => h.lp); return v.length ? avg(v) : allAvg; };
    for (const p of plist) {
      const key = matchId + ':' + p.uid;
      if (this.row('SELECT id FROM matches WHERE id=?', key)) continue; // 同一場只算一次
      const L = SV.LADDER, base = n === 2 ? (p.place === 1 ? L.WIN2 : L.LOSE2) : solo ? Math.round(L.SOLO_TOP - (p.place - 1) * 2 * L.SOLO_TOP / (n - 1)) : L.PLACE4[Math.min(4, p.place)];
      const opp = avg(Array.from({ length: n }, (_, t) => t).filter(t => t !== p.team).map(teamLp));
      const diff = Math.max(-500, Math.min(500, opp - teamLp(p.team))) / L.ELO_SPAN;
      let d = base > 0 ? base * (1 + 0.5 * diff) : base * (1 - 0.5 * diff);
      d = Math.round(Math.max(base > 0 ? 3 : -60, Math.min(base > 0 ? 60 : -3, d)));
      const before = lpOf(p.uid), after = Math.max(0, before + d);
      this.sql.exec(`UPDATE users SET ${LC}=?, ${GC}=${GC}+1, ${WC}=${WC}+? WHERE uid=?`, after, p.place === 1 ? 1 : 0, p.uid);
      this.sql.exec('INSERT INTO matches VALUES (?,?,?)', key, Date.now(), JSON.stringify({ n, solo: !!solo, place: p.place, d: after - before }));
      res[p.uid] = { before, after, d: after - before, place: p.place, solo: !!solo };
    }
    return res;
  }
}

// ===================== 房間（整場遊戲在這裡跑）=====================
export class Room extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.code = ''; this.conns = new Set(); this.seats = null; this.owner = null; this.G = null; this.timer = 0; this.mm = null; this.last = Date.now(); this.settled = {}; }
  acc() { return this.env.ACC.get(this.env.ACC.idFromName('main')); }
  // ---- 對局存檔：房間被清出記憶體（或伺服器更新）後，有人連回來就從存檔接著打 ----
  async load() {
    if (this.G || this.loaded) return; this.loaded = true;
    let st = null; try { st = await this.ctx.storage.get('st'); } catch (e) {}
    if (!st || !st.G) return;
    Object.assign(this, { code: st.code, seats: st.seats, owner: st.owner, mm: st.mm, solo: st.solo, settled: st.settled || {}, activeCleared: st.activeCleared || {}, metaDone: st.metaDone, comps: st.comps || {} });
    const G = JSON.parse(st.G); G.rng = makeRng(0); G.rng.set(st.ra); G.log = []; G.aiCmd = st.aiCmd || {};
    G.battles = (st.battles || []).map(b => {
      const B = createBattle(JSON.parse(JSON.stringify(b.input))), log = b.cmd || []; let done = 0, n = 0;
      while (B.t < b.t && !B.over && n++ < 20000) { while (done < log.length && log[done].t <= B.t) { const c = log[done++]; B.cmdUsed[c.owner] = false; battleCommand(B, c.owner, c.type); } step(B); }
      return { teams: b.teams, ghost: b.ghost, input: b.input, B, settled: b.settled };
    });
    for (let i = 0; i < G.players.length; i++) if (G.humanAt && G.humanAt[i] && !G.players[i].out) { G.players[i].ai = true; G.players[i].ready = true; } // 真人連回來前先由電腦代打
    this.G = G; this.lastSnap = ''; this.logSent = 0; this.snapAcc = 1e9; this.ensureTimer();
  }
  persist(force) {
    const G = this.G, now = Date.now(); if (!G) return;
    if (!force && now - (this.saveAt || 0) < SV.SAVE_MS) return; this.saveAt = now;
    if (G.phase === 'over') { this.ctx.storage.delete('st').catch(() => {}); return; }
    const st = { code: this.code, seats: this.seats, owner: this.owner, mm: this.mm, solo: this.solo, settled: this.settled, activeCleared: this.activeCleared || {}, metaDone: this.metaDone, comps: this.comps || {},
      G: JSON.stringify(G, (k, v) => (k === 'rng' || k === 'battles' || k === 'log' || k === 'aiCmd') ? undefined : v), ra: G.rng.get(), aiCmd: G.aiCmd || {},
      battles: G.battles.map(b => ({ teams: b.teams, ghost: !!b.ghost, input: b.input, settled: !!b.settled, t: b.B.t, cmd: b.B.cmdLog || [] })) };
    this.ctx.storage.put('st', st).catch(() => {});
  }
  async fetch(req) {
    await this.load();
    const url = new URL(req.url);
    if (!this.code) this.code = url.searchParams.get('code') || '';
    if (!this.seats) { const n = +url.searchParams.get('mode') || 0; if (n) this.seats = Array(n).fill(null); this.solo = url.searchParams.get('solo') === '1'; }
    if (!this.metaReq) { this.metaReq = true; this.acc().getMeta().then(m => { this.meta = m; }).catch(() => {}); }
    const pair = new WebSocketPair(); const ws = pair[1]; ws.accept();
    const c = { ws, uid: null, seat: -1, last: Date.now() };
    this.conns.add(c);
    ws.addEventListener('message', e => { c.last = Date.now(); let m; try { m = JSON.parse(e.data); } catch (x) { return; } this.onMsg(c, m).catch(() => {}); });
    const gone = () => { try { ws.close(); } catch (e) {} if (this.conns.delete(c)) this.drop(c); };
    ws.addEventListener('close', gone); ws.addEventListener('error', gone);
    this.ensureTimer();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  // 配對大廳先呼叫：設定人數與座位表，人到齊自動開打
  async setup(mode, seatOf, solo) { this.solo = !!solo; this.seats = Array(mode).fill(null); this.mm = { seatOf, t0: Date.now() }; this.ensureTimer(); return { ok: true }; }
  send(c, m) { try { c.ws.send(JSON.stringify(m)); } catch (e) {} }
  bcast(m) { const s = JSON.stringify(m); for (const c of this.conns) if (c.uid) try { c.ws.send(s); } catch (e) {} }
  roomMsg() { return { k: 'room', code: this.code, seats: this.seats, owner: this.seats ? this.seats.findIndex(s => s && s.uid === this.owner) : -1, ranked: !!this.mm, solo: !!this.solo }; }
  async onMsg(c, m) {
    if (m.k === 'ping') { this.send(c, { k: 'pong', t: m.t }); return; }
    if (m.k === 'hello' && m.spec) { // 觀戰：不佔座位，只收畫面
      if (!this.G) { this.send(c, { k: 'full', why: '這場還沒開始或已經結束了' }); return; }
      c.uid = 'spec:' + rand(4); c.spec = true; c.seat = -1;
      const sv = this.seats.findIndex(Boolean);
      this.send(c, { k: 'seat', seat: Math.max(0, sv) }); this.send(c, { k: 'start', seat: Math.max(0, sv), spec: true }); this.resync(); return;
    }
    if (m.k === 'hello') {
      const u = await this.acc().verify(String(m.token || ''));
      if (!u) { this.send(c, { k: 'full', why: '請先登入帳號' }); return; }
      if (!this.seats) { this.send(c, { k: 'full', why: '找不到這個房號' }); return; }
      for (const o of this.conns) if (o !== c && o.uid === u.uid) { this.send(o, { k: 'full', why: '你在別的地方登入了這個房間' }); this.conns.delete(o); try { o.ws.close(); } catch (e) {} }
      c.uid = u.uid;
      let seat = this.seats.findIndex(s => s && s.uid === u.uid);
      if (seat < 0) {
        if (this.G && this.mm && this.mm.seatOf[u.uid] !== undefined && !this.seats[this.mm.seatOf[u.uid]]) { // 配對成員晚到：接回原本保留的位置（原本由電腦代打）
          seat = this.mm.seatOf[u.uid]; this.seats[seat] = { uid: u.uid, name: u.name, lp: u.lp };
          this.acc().setActive([u.uid], this.code).catch(() => {});
          const P = this.G.players[seat]; if (P && !P.out) { P.ai = false; P.name = u.name; this.G.humanAt[seat] = true; this.G.ladder[seat] = { lp: u.lp, pid: u.uid, name: u.name }; this.G.ranked = this.isRanked(); }
        } else if (this.G) { this.send(c, { k: 'full', why: '遊戲已經開始了' }); c.uid = null; return; }
        else {
          if (this.mm) { seat = this.mm.seatOf[u.uid]; if (seat === undefined) { this.send(c, { k: 'full', why: '這是配對房，你不在名單上' }); c.uid = null; return; } }
          else seat = this.seats.findIndex(s => !s);
          if (seat < 0 || this.seats[seat]) { this.send(c, { k: 'full', why: '房間滿了' }); c.uid = null; return; }
          this.seats[seat] = { uid: u.uid, name: u.name, lp: u.lp };
          if (!this.owner) this.owner = u.uid;
        }
      }
      c.seat = seat;
      this.send(c, { k: 'seat', seat });
      if (this.G) { const P = this.G.players[seat]; if (P && !P.out) P.ai = false; this.send(c, { k: 'start', seat }); this.resync(); }
      else this.bcast(this.roomMsg());
      return;
    }
    if (!c.uid) return;
    if (m.k === 'bye') { this.conns.delete(c); this.drop(c); try { c.ws.close(); } catch (e) {} return; }
    if (!this.G) {
      if (m.k === 'seat' && !this.mm) { const to = +m.seat; if (to >= 0 && to < this.seats.length && !this.seats[to]) { this.seats[to] = this.seats[c.seat]; this.seats[c.seat] = null; c.seat = to; this.send(c, { k: 'seat', seat: to }); this.bcast(this.roomMsg()); } }
      else if (m.k === 'mode' && c.uid === this.owner && !this.mm) { const solo = !!m.solo; const n = solo ? Math.max(2, Math.min(8, +m.n || 8)) : (+m.n === 8 ? 8 : 4); this.solo = solo; this.setMode(n, true); }
      else if (m.k === 'start' && c.uid === this.owner) this.start();
      return;
    }
    if (m.k === 'act' && c.seat >= 0) {
      const a = m.a && typeof m.a === 'object' ? m.a : {};
      const r = act(this.G, c.seat, a);
      this.send(c, { k: 'res', id: m.id, r }); this.snapAcc = 1e9;
    }
  }
  setMode(n, force) {
    if (n === this.seats.length) { if (force) this.bcast(this.roomMsg()); return; }
    if (n < this.seats.length) {
      for (let i = n; i < this.seats.length; i++) if (this.seats[i]) { const f = this.seats.slice(0, n).findIndex(x => !x); if (f < 0) return; this.seats[f] = this.seats[i]; this.seats[i] = null; for (const c of this.conns) if (c.seat === i) { c.seat = f; this.send(c, { k: 'seat', seat: f }); } }
      this.seats = this.seats.slice(0, n);
    } else while (this.seats.length < n) this.seats.push(null);
    this.bcast(this.roomMsg());
  }
  drop(c) {
    if (!c.uid || c.spec) return;
    if (this.G) { const P = this.G.players[c.seat]; if (P && ![...this.conns].some(o => o.uid === c.uid)) { P.ai = true; P.ready = true; } }
    else if (!this.mm && c.seat >= 0 && this.seats[c.seat] && this.seats[c.seat].uid === c.uid) { this.seats[c.seat] = null; if (this.owner === c.uid) { const s = this.seats.find(Boolean); this.owner = s ? s.uid : null; } this.bcast(this.roomMsg()); }
  }
  start() {
    if (this.G) return;
    const players = this.seats.map((s, i) => s ? { name: s.name, ai: false } : { name: AI_NAMES_S[i] || 'AI', ai: true });
    this.G = createGame({ seed: (Date.now() & 0x7fffffff), rules: Object.assign({}, DEFAULT_RULES, { teams: this.solo ? this.seats.length : this.seats.length >> 1, solo: !!this.solo }), players, solo: !!this.solo, meta: this.meta || [] });
    const G = this.G; G.online = true; G.server = true; G.humanAt = players.map(p => !p.ai);
    G.ladder = this.seats.map(s => s ? { lp: s.lp || 0, pid: s.uid, name: s.name } : null);
    G.ranked = this.isRanked();
    startGame(G);
    this.acc().setActive(this.seats.filter(Boolean).map(s => s.uid), this.code).catch(() => {});
    if (this.mm) this.acc().liveSet(this.code, { n: this.seats.length, solo: !!this.solo, names: this.seats.filter(Boolean).map(s => s.name), lp: Math.round(avgLp(this.seats)) }).catch(() => {}); // 排位房：放進觀戰清單
    this.persist(true);
    for (const c of this.conns) if (c.uid) this.send(c, { k: 'start', seat: c.seat });
    this.resync();
  }
  async status(uid) { await this.load(); const G = this.G; if (!G || G.phase === 'over' || !this.seats) return { alive: false }; const i = this.seats.findIndex(s => s && s.uid === uid); return { alive: i >= 0 && !!G.players[i] && !G.players[i].out }; }
  // 進行中對局紀錄：開打時記下所有真人；被淘汰或整場結束就清掉
  trackActive() {
    const G = this.G; if (!G || !this.seats) return;
    this.activeCleared = this.activeCleared || {};
    const gone = this.seats.map((s, i) => s && !this.activeCleared[s.uid] && (G.phase === 'over' || (G.players[i] && G.players[i].out)) ? s.uid : null).filter(Boolean);
    if (gone.length) { for (const u of gone) this.activeCleared[u] = true; this.acc().clearActive(gone, this.code).catch(() => {}); }
  }
  isRanked() { const G = this.G; return G.teams.filter((T, t) => G.players.some((p, i) => p.team === t && G.humanAt[i])).length >= 2; }
  resync() { this.lastSnap = ''; this.logSent = 0; this.snapAcc = 1e9; if (this.G && this.G.phase === 'combat') this.sendBattles(); }
  sendBattles() {
    const G = this.G; if (!G.battles.length || !G.battles[0].input) return;
    this.battleKey = G.round + G.phase + G.battles.length;
    this.bcast({ k: 'battles', round: G.round, list: G.battles.map(b => ({ teams: b.teams, ghost: !!b.ghost, input: b.input })), t: G.battles.map(b => b.B.t), cmds: G.battles.map(b => b.B.cmdLog || []) });
  }
  ensureTimer() { if (!this.timer) { this.lastT = Date.now(); this.timer = setInterval(() => { try { this.tick(); } catch (e) {} }, SV.TICK_MS); } }
  tick() {
    const now = Date.now(), dt = Math.min(1000, now - this.lastT); this.lastT = now;
    const live = [...this.conns].filter(c => c.uid);
    if (live.length) this.last = now;
    if (now - this.last > SV.IDLE_CLOSE_MS || (this.G && this.G.phase === 'over' && !live.length)) { clearInterval(this.timer); this.timer = 0; return; }
    if (!this.G) { if (this.mm && (this.seats.filter(Boolean).length >= Object.keys(this.mm.seatOf).length || now - this.mm.t0 > SV.JOIN_WAIT_MS) && this.seats.some(Boolean)) this.start(); return; }
    const G = this.G;
    if (G.phase !== 'over') update(G, dt);
    this.settleOuts(); this.trackActive();
    const pk = G.round + G.phase; if (this.phaseKey !== pk) { this.phaseKey = pk; if (G.phase === 'combat') this.compSnap(); this.persist(true); } else this.persist(false);
    if (G.phase === 'over' && !this.balDone) { this.balDone = true; this.balReport(); if (this.mm) this.acc().liveSet(this.code, null).catch(() => {}); }
    if (G.phase === 'over' && !this.metaDone) { this.metaDone = true; this.metaReport(); }
    const bk = G.round + G.phase + G.battles.length;
    if (G.phase === 'combat' && this.battleKey !== bk && G.battles.length && G.battles[0].input) this.sendBattles();
    this.snapAcc = (this.snapAcc || 0) + dt;
    if (this.snapAcc >= SV.SNAP_MS) {
      this.snapAcc = 0;
      const log = G.log.slice(this.logSent || 0);
      const s = JSON.stringify(G, (k, v) => (k === 'rng' || k === 'B' || k === 'log' || k === 'battles' || k === 'input' || k === 'nextPairs') ? undefined : v); // nextPairs：下一場真正的配對，不能讓玩家看到
      // 只有內容真的變了才送（倒數計時與戰鬥進度每格都在變，比對時不算；客人自己會倒數），另外每隔一段時間保底送一次校正
      const cmp = s.replace(/"(timer|acc)":-?[0-9.e+-]+/g, '');
      if (cmp !== this.lastSnap || log.length || now - (this.snapAt || 0) >= SV.SNAP_KEEPALIVE_MS) { this.lastSnap = cmp; this.snapAt = now; this.bcast({ k: 'snap', s, log, logFrom: this.logSent || 0 }); this.logSent = G.log.length; }
    }
    this.btAcc = (this.btAcc || 0) + dt;
    if (G.phase === 'combat' && this.btAcc >= SV.BTICK_MS) { this.btAcc = 0; this.bcast({ k: 'tick', round: G.round, t: G.battles.map(b => b.B.t), cmds: G.battles.map(b => b.B.cmdLog || []), speed: 1 }); }
  }
  compSnap() { const G = this.G; this.comps = this.comps || {}; G.players.forEach((P, i) => { if (!P.out) this.comps[i] = { units: Object.values(G.board).filter(u => u.owner === i).map(u => u.key), augs: (P.augs || []).slice() }; }); }
  balReport() { // 平衡統計：每位玩家最後的陣容與海克斯，配上隊伍名次
    const G = this.G, n = G.teams.length, rows = [];
    G.players.forEach((P, i) => { const c = (this.comps || {})[i]; if (!c) return; const pl = G.teams[P.team].place || n, score = (pl - 1) / Math.max(1, n - 1), top = pl <= Math.max(1, Math.floor(n / 2));
      for (const k of new Set(c.units)) rows.push({ kind: 'u', key: k, place: score, top }); for (const a of c.augs) rows.push({ kind: 'a', key: a, place: score, top }); });
    if (rows.length) this.acc().balAdd(rows).catch(() => {});
  }
  metaReport() {
    const G = this.G, n = G.teams.length, top = n <= 3 ? 1 : 2, good = t => (G.teams[t].place || 99) <= top;
    const comps = G.players.filter((P, i) => G.humanAt[i] && good(P.team) && P.lastComp).map(P => ({ units: P.lastComp, n }));
    const results = G.players.filter(P => P.ai && P.target).map(P => ({ id: P.target.id, good: (G.teams[P.team].place || 99) <= Math.max(1, Math.floor(n / 2)) }));
    if (comps.length || results.length) this.acc().metaAdd(comps, results).catch(() => {});
  }
  // 天梯：某隊名次確定（被淘汰或比賽結束）就結算那一隊的真人
  settleOuts() {
    const G = this.G; if (!G.ranked) return;
    const ready = G.teams.map((T, t) => t).filter(t => !this.settled[t] && G.teams[t].place && ((G.teams[t].out && !(G.phase === 'combat' && G.teams[t].dieRound === G.round)) || G.phase === 'over')); // 同回合還有戰場在打時名次可能往前調：等這回合打完才算分
    if (!ready.length) return;
    for (const t of ready) this.settled[t] = true;
    const all = this.seats.map((s, i) => s ? { uid: s.uid, team: G.players[i].team } : null).filter(Boolean);
    const plist = all.filter(x => ready.includes(x.team)).map(x => ({ uid: x.uid, team: x.team, place: G.teams[x.team].place }));
    if (!plist.length) return;
    this.acc().settle(this.code + ':' + G.seed, G.teams.length, plist, all, !!G.solo).then(res => {
      for (const c of this.conns) if (c.uid && res[c.uid]) this.send(c, Object.assign({ k: 'lp', seed: G.seed }, res[c.uid]));
    }).catch(() => {});
  }
}

// ===================== 排位配對 =====================
export class Lobby extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.q = { 4: new Map(), 8: new Map(), solo: new Map(), duel: new Map() }; this.timer = 0; }
  async fetch(req) {
    const pair = new WebSocketPair(); const ws = pair[1]; ws.accept();
    const c = { ws, uid: null };
    ws.addEventListener('message', e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } this.onMsg(c, m).catch(() => {}); });
    const gone = () => { try { ws.close(); } catch (e) {} for (const q of Object.values(this.q)) if (c.uid && q.get(c.uid) && q.get(c.uid).c === c) q.delete(c.uid); };
    ws.addEventListener('close', gone); ws.addEventListener('error', gone);
    if (!this.timer) this.timer = setInterval(() => { try { this.match(); } catch (e) {} }, 1000);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async onMsg(c, m) {
    if (m.k === 'q') {
      const u = await this.env.ACC.get(this.env.ACC.idFromName('main')).verify(String(m.token || ''));
      if (!u) { try { c.ws.send(JSON.stringify({ k: 'err', why: '請先登入帳號' })); } catch (e) {} return; }
      c.uid = u.uid; const mode = ['solo', 'duel'].includes(m.mode) ? m.mode : m.mode === 8 ? 8 : 4;
      for (const q of Object.values(this.q)) q.delete(u.uid);
      this.q[mode].set(u.uid, { c, uid: u.uid, tz: Math.max(-12, Math.min(14, +m.tz || 0)), t: Date.now(), name: u.name });
    } else if (m.k === 'cancel') { for (const q of Object.values(this.q)) q.delete(c.uid); }
  }
  match() {
    const now = Date.now();
    for (const mode of [4, 8, 'solo', 'duel']) {
      const need = mode === 'solo' ? 8 : mode === 'duel' ? 2 : mode;
      const q = this.q[mode];
      for (const [uid, x] of q) if (x.c.ws.readyState !== 1) q.delete(uid);
      const n = q.size;
      for (const x of q.values()) try { x.c.ws.send(JSON.stringify({ k: 'stat', n, near: [...q.values()].filter(y => Math.abs(y.tz - x.tz) <= SV.MM_SAME_TZ).length, wait: now - x.t })); } catch (e) {}
      while (q.size >= 2) {
        const all = [...q.values()].sort((a, b) => a.t - b.t), lead = all[0];
        const others = all.slice(1).map(x => ({ x, near: Math.abs(x.tz - lead.tz) <= SV.MM_SAME_TZ })).sort((a, b) => (b.near - a.near) || (a.x.t - b.x.t));
        const nearN = others.filter(o => o.near).length, wide = now - lead.t >= SV.MM_WIDEN_MS;
        let pick = null;
        if (nearN >= need - 1) pick = others.filter(o => o.near).slice(0, need - 1);
        else if (wide) pick = others.slice(0, need - 1);
        if (!pick) break;
        const members = [lead].concat(pick.map(o => o.x)), seatOf = {};
        members.forEach((x, i) => { seatOf[x.uid] = MM_ORDER_S[mode][i]; q.delete(x.uid); });
        const code = roomCode();
        this.env.ROOM.get(this.env.ROOM.idFromName(code)).setup(need, seatOf, mode === 'solo' || mode === 'duel').then(() => {
          for (const x of members) try { x.c.ws.send(JSON.stringify({ k: 'match', room: code, n: members.length })); } catch (e) {}
        }).catch(() => {});
      }
    }
  }
}
