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
  POOL: { 1: 36, 2: 12, 3: 11, 4: 10, 5: 8 },           // v0.13.1：一費 36 張＝最多 4 家同時三星           // 全場共用卡池（每隻幾張）；每費只有 5 種動物（聯盟戰棋約 13 種），所以張數比較少，3 星難度才接近
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
    hp: 660, atk: 62, ai: 18, rng: 1, arm: 25, mr: 20, mana: 70, sm: 0, mv: 7, // v0.13.13 攻擊 58→62
    skill: '狼嚎', desc: '自身與 2 格內群居友軍攻速 +30%，持續 4 秒。' },
  frog: { name: '青蛙', cost: 1, traits: ['water', 'pack'], role: '法師',
    hp: 600, atk: 45, ai: 20, rng: 3, arm: 15, mr: 25, mana: 60, sm: 10, mv: 8, // v0.13.13 生命 560→600、能量 70→60
    skill: '長舌', desc: '把 4 格內最遠的敵人拉到身前，220 魔法傷害並暈 1.5 秒。' },
  bat: { name: '蝙蝠', cost: 1, traits: ['sky', 'night'], role: '刺客',
    hp: 540, atk: 56, ai: 16, rng: 1, arm: 15, mr: 15, mana: 50, sm: 0, mv: 6, // v0.13.12 能量 60→50；v0.13.13 生命 500→540；v0.13.21 攻擊 52→56
    skill: '吸血咬', desc: '開場飛向敵方後排。普攻吸血 20%。技能：咬 210 物理傷害並全額回血。' },
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
    skill: '肚皮滑行', desc: '趴下滑向 3 格內最遠的敵人，撞擊 180 魔法傷害並暈 1 秒，落點周圍敵人受 80 魔法傷害。' },
  rhino: { name: '犀牛', cost: 3, traits: ['savanna', 'armor'], role: '坦',
    hp: 900, atk: 60, ai: 24, rng: 1, arm: 40, mr: 30, mana: 100, sm: 20, mv: 8,
    skill: '犀角衝鋒', desc: '衝向 3 格內最遠的敵人，220 物理傷害並擊飛 1.25 秒，自身獲得 180 護盾。' },
  chameleon: { name: '變色龍', cost: 3, traits: ['forest', 'night'], role: '刺客',
    hp: 720, atk: 70, ai: 18, rng: 2, arm: 20, mr: 20, mana: 70, sm: 0, mv: 7, // v0.13.13 生命 680→720
    skill: '變色突襲', desc: '被動：開場隱身。技能：重新隱身，長舌彈向 3 格內血最少的敵人 280 物理傷害，下一次普攻必定暴擊。' },
  fox: { name: '狐狸', cost: 3, traits: ['savanna', 'night'], role: '刺客',
    hp: 720, atk: 68, ai: 16, rng: 1, arm: 25, mr: 25, mana: 70, sm: 0, mv: 6,
    skill: '跳躍撲鼠', desc: '高高躍起撲向攻擊最高的遠程敵人，240 物理傷害並偷走 40 能量。' },
  eagle: { name: '老鷹', cost: 4, traits: ['sky', 'savanna'], role: '遠程',
    hp: 880, atk: 84, ai: 20, rng: 3, arm: 25, mr: 25, mana: 80, sm: 0, mv: 6,
    skill: '高空擒拿', desc: '抓起目標飛上高空 1.5 秒（無法行動）再摔下，380 物理傷害，周圍 1 格敵人受 120 物理傷害。' },
  eel: { name: '電鰻', cost: 4, traits: ['water', 'night'], role: '法師',
    hp: 880, atk: 55, ai: 20, rng: 3, arm: 25, mr: 40, mana: 70, sm: 20, mv: 8, // v0.13.21 能量 80→70
    skill: '連鎖放電', desc: '電擊目標 280 魔法傷害並彈跳 4 次（每次 −15%），被電到的敵人暈 0.5 秒。' },
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
    hp: 1360, atk: 94, ai: 22, rng: 1, arm: 50, mr: 35, mana: 90, sm: 0, mv: 9, // v0.13.21 生命 1440→1360、攻擊 100→94
    skill: '劇毒撕咬', desc: '被動：普攻對中毒敵人傷害 +30%。技能：撕咬 260 物理傷害，5 秒內再造成目標最大生命 25% 的毒傷，自己回復 15% 生命。' },
  // ---- v0.13 新增：讓高階羈絆湊得到 ----
  deer: { name: '小鹿', cost: 1, traits: ['forest', 'pack'], role: '輔助',
    hp: 520, atk: 38, ai: 20, rng: 2, arm: 15, mr: 25, mana: 70, sm: 20, mv: 7,
    skill: '林間祝福', desc: '治療生命最低的友軍 200，並讓 2 格內的森林友軍回復 6% 生命。' },
  zebra: { name: '斑馬', cost: 1, traits: ['savanna', 'pack'], role: '戰士',
    hp: 690, atk: 60, ai: 18, rng: 1, arm: 25, mr: 20, mana: 70, sm: 0, mv: 6,
    skill: '斑紋後踢', desc: '後腿一踢：目標 170 物理傷害並致盲 2 秒（普攻落空）。' },
  hippo: { name: '河馬', cost: 2, traits: ['water', 'armor'], role: '坦',
    hp: 900, atk: 52, ai: 24, rng: 1, arm: 40, mr: 35, mana: 100, sm: 30, mv: 9, // v0.13.13 能量 90→100
    skill: '河馬大口', desc: '張大嘴嘲諷周圍 1 格敵人 2 秒，咬目標 200 魔法傷害，獲得 22% 生命護盾。' },
  parrot: { name: '鸚鵡', cost: 2, traits: ['sky', 'forest'], role: '遠程',
    hp: 500, atk: 50, ai: 17, rng: 3, arm: 15, mr: 20, mana: 70, sm: 10, mv: 6,
    skill: '尖嘯羽箭', desc: '一次射出 3 根羽箭打 3 個不同的敵人，各 130 物理傷害，被打到的魔抗 −20 持續 4 秒。' },
  giraffe: { name: '長頸鹿', cost: 3, traits: ['savanna', 'armor'], role: '戰士',
    hp: 900, atk: 66, ai: 22, rng: 2, arm: 35, mr: 30, mana: 90, sm: 20, mv: 8, // v0.13.21 生命 940→900
    skill: '長頸甩擊', desc: '甩動長脖子橫掃 2 格內所有敵人 180 物理傷害，並把他們擊退 1 格。' },
  flamingo: { name: '紅鶴', cost: 3, traits: ['sky', 'water'], role: '法師',
    hp: 700, atk: 50, ai: 20, rng: 3, arm: 20, mr: 35, mana: 80, sm: 20, mv: 7,
    skill: '單腳旋舞', desc: '在敵人密集處掀起水花漩渦 3 秒（中心＋周圍 6 格）：每秒 90 魔法傷害，區內敵人攻速 −25%。' },
  shark: { name: '鯊魚', cost: 3, traits: ['water', 'night'], role: '刺客',
    hp: 740, atk: 70, ai: 16, rng: 1, arm: 25, mr: 20, mana: 70, sm: 0, mv: 6,
    skill: '嗜血突襲', desc: '鑽進地下衝到血最少的敵人腳下 260 物理傷害；目標生命低於 50% 時傷害 +60%，擊殺回滿 50 能量。' },
  panda: { name: '熊貓', cost: 4, traits: ['forest', 'armor'], role: '坦',
    hp: 1220, atk: 74, ai: 24, rng: 1, arm: 45, mr: 45, mana: 100, sm: 40, mv: 10,
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
  night:   { name: '夜行', tiers: [2, 4, 6, 8], desc: ['第 10 秒入夜，夜行單位暴擊 +30%', '暴擊 +55%', '暴擊 +80%', '永夜：開場就入夜，暴擊 +110%'], val: [30, 55, 80, 110] }, // v0.13.3 模擬偏弱，小幅加強
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
// ===== 雙人默契（v0.14，只有一隊兩個人時才有）=====
// 連攜：開場時你的棋子緊鄰隊友的棋子 → 兩隻連成一組（每隻最多一組），兩隻都活著攻速 +LINK_AS%；其中一隻倒下，另一隻「報仇」攻擊 +AVENGE_ATK%、回 AVENGE_HEAL% 生命
// 擊掌合擊：隊友下戰鬥指令後 COMBO_WINDOW tick（20 tick＝1 秒）內你也下指令 → 全隊攻速 +COMBO_AS%、攻擊 +COMBO_ATK%，持續 COMBO_TICKS；電腦隊友會在 AI_REPLY tick 後跟上你的指令
const DUO_CFG = { LINK_AS: 10, AVENGE_ATK: 30, AVENGE_TICKS: 80, AVENGE_HEAL: 15, COMBO_WINDOW: 60, COMBO_AS: 20, COMBO_ATK: 20, COMBO_TICKS: 80, AI_REPLY: 20 };
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
