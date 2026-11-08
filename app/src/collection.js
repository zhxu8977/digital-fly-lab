// Original spirit families. The three forms share a rig but have distinct
// silhouettes, palettes and accessories; none are licensed game characters.
import { ELEMENTS, SKILLS } from "./skills.js";

const FAMILY_DEFINITIONS = [
  { id: "ember-dragon", names: ["烛尾龙", "焰绒龙", "晨曦翼龙"], body: "aerial", element: "fire", personality: "brave", emoji: "🐉", role: "俯冲进攻", colors: ["#f59b67", "#ffe28b", "#fff1cf"], features: ["dragon", "round-horns", "flame-tail", "small-wings"], description: "把尾巴上的暖光当作夜灯的圆脸小龙，越熟悉主人越爱展示飞行。", stats: [310, 1.04, 0.09, 116] },
  { id: "storm-rabbit", names: ["雷耳兔", "疾电兔", "星雷跃兔"], body: "biped", element: "electric", personality: "curious", emoji: "🐰", role: "灵活突进", colors: ["#f6db68", "#ad83e9", "#fff4df"], features: ["rabbit", "long-ears", "cheek-zigzag", "pom-tail"], description: "两只长耳朵像小天线，先观察对手，再用短距离加速寻找机会。", stats: [282, 0.96, 0.08, 129] },
  { id: "amber-corgi", names: ["面包柯", "暖团柯", "金穗守卫柯"], body: "corgi", element: "earth", personality: "balanced", emoji: "🐶", role: "稳定守护", colors: ["#eab37a", "#aa713e", "#fff1dc"], features: ["dog", "corgi-ears", "pear-belly", "white-socks"], description: "像刚烤好的面包一样软乎，短腿也能跑得很快，喜欢陪主人散步。", stats: [345, 0.93, 0.16, 106] },
  { id: "mint-cat", names: ["薄荷喵", "芽芽喵", "森冠灵喵"], body: "cat", element: "wood", personality: "curious", emoji: "🐱", role: "灵巧游击", colors: ["#9ed9a8", "#4a9171", "#fff7de"], features: ["cat", "leaf-ears", "curled-tail", "leaf-stripes"], description: "会把落叶藏在窝里的小猫，喜欢追逐气味，遇到危险时绕到侧面。", stats: [288, 0.94, 0.10, 121] },
  { id: "cloud-bird", names: ["云啾", "绵云雀", "晴空羽冠"], body: "aerial", element: "wind", personality: "cautious", emoji: "🐦", role: "远程牵制", colors: ["#bbdce9", "#649abb", "#fff9ed"], features: ["bird", "round-beak", "feather-wings", "cloud-crest"], description: "翅膀像两朵棉花云，习惯用远距离试探，确认安全后才会靠近。", stats: [275, 0.90, 0.08, 132] },
  { id: "pearl-moth", names: ["铃粉蝶", "月绒蝶", "星幕幻蝶"], body: "aerial", element: "neutral", personality: "cautious", emoji: "🦋", role: "标记追踪", colors: ["#cfb8f0", "#ee9bbb", "#fff3dd"], features: ["moth", "butterfly-wings", "round-antennae", "wing-eyespots"], description: "圆圆的蝶翼带有珍珠花纹，会用标记和迂回飞行保护自己。", stats: [296, 0.88, 0.12, 114] },
  { id: "tide-turtle", names: ["泡泡龟", "澜甲龟", "珊瑚堡龟"], body: "cat", element: "water", personality: "balanced", emoji: "🐢", role: "耐久反击", colors: ["#83cfc5", "#438c9c", "#fff0c6"], features: ["turtle", "rounded-shell", "shell-rings", "paddle-feet"], description: "背着圆鼓鼓的小壳，跑步不慌张，擅长守住位置再反击。", stats: [368, 0.88, 0.22, 94] },
  { id: "frost-penguin", names: ["雪团企鹅", "浪花企鹅", "极光企鹅"], body: "biped", element: "water", personality: "balanced", emoji: "🐧", role: "远近兼顾", colors: ["#89bccc", "#375b85", "#fff8e8"], features: ["penguin", "round-beak", "flipper-arms", "belly-oval"], description: "走路会轻轻摇摆的小企鹅，认真起来会把水珠弹得很准。", stats: [332, 0.96, 0.15, 102] },
  { id: "cinder-fox", names: ["团焰狐", "赤绒狐", "霞尾灵狐"], body: "cat", element: "fire", personality: "curious", emoji: "🦊", role: "侧翼奇袭", colors: ["#f6a575", "#9f5343", "#ffeccd"], features: ["fox", "tall-ears", "bushy-tail", "white-tail-tip"], description: "爱从树后探出头观察伙伴，蓬松尾巴一摇就像一簇晚霞。", stats: [292, 1.03, 0.09, 122] },
  { id: "forest-deer", names: ["芽角鹿", "枝铃鹿", "春庭冠鹿"], body: "cat", element: "wood", personality: "cautious", emoji: "🦌", role: "敏捷支援", colors: ["#d7c19c", "#77ad86", "#fff3dc"], features: ["deer", "branch-antlers", "spotted-coat", "short-tail"], description: "小角上会长出嫩芽，安静但不胆小，总在寻找更安全的路线。", stats: [305, 0.90, 0.11, 126] },
  { id: "moss-shroom", names: ["团菇", "苔帽菇", "森林伞王"], body: "biped", element: "wood", personality: "balanced", emoji: "🍄", role: "范围控制", colors: ["#c2ce90", "#bd777e", "#fff0d6"], features: ["shroom", "mushroom-cap", "cap-spots", "stubby-arms"], description: "蘑菇帽会随着跑步晃动，喜欢甜果和潮湿草地，耐心等候进攻时机。", stats: [355, 0.94, 0.19, 96] },
  { id: "stone-bear", names: ["软岩熊", "绒岗熊", "山眠守护熊"], body: "corgi", element: "earth", personality: "brave", emoji: "🐻", role: "近战重击", colors: ["#bc9c88", "#746775", "#f7e3ca"], features: ["bear", "round-ears", "heavy-paws", "chest-chevron"], description: "看起来像石头，其实是一团温暖绒毛，慢热而可靠，护住朋友时很勇敢。", stats: [382, 1.08, 0.20, 98] },
  { id: "spark-hamster", names: ["电团鼠", "咕噜电鼠", "闪耀轮鼠"], body: "corgi", element: "electric", personality: "brave", emoji: "🐹", role: "高速闪避", colors: ["#e6c683", "#e69a70", "#fff2d9"], features: ["hamster", "round-ears", "cheek-patches", "tiny-tail"], description: "把果实塞进脸颊的小团子，追逐游戏总是第一名，擅长短促爆发。", stats: [280, 0.99, 0.09, 128] },
  { id: "lagoon-otter", names: ["贝贝獭", "汐绒獭", "月湾浪獭"], body: "corgi", element: "water", personality: "curious", emoji: "🦦", role: "连续远攻", colors: ["#bda689", "#669bbb", "#fff1d9"], features: ["otter", "round-ears", "long-tail", "shell-pendant"], description: "把喜欢的小贝壳送给主人，打水漂练出的准头也能用在远程攻击上。", stats: [326, 0.98, 0.12, 112] },
  { id: "dusk-bat", names: ["夜团蝠", "暮铃蝠", "月轮绒蝠"], body: "aerial", element: "wind", personality: "curious", emoji: "🦇", role: "空中绕后", colors: ["#aa98d0", "#6776ac", "#f1dfed"], features: ["bat", "big-ears", "scalloped-wings", "moon-belly"], description: "大耳朵和圆翼膜让它像一只会飞的小玩偶，常从意外方向出现。", stats: [284, 0.95, 0.10, 130] },
  { id: "sun-lion", names: ["茸球狮", "金绒狮", "朝阳冠狮"], body: "cat", element: "fire", personality: "brave", emoji: "🦁", role: "正面压制", colors: ["#e8c27d", "#e39166", "#fff0cf"], features: ["lion", "round-mane", "tuft-tail", "paw-socks"], description: "鬃毛像一圈太阳花，平时爱撒娇，战斗时会坚定地保护自己的领地。", stats: [334, 1.12, 0.12, 113] },
  { id: "opal-golem", names: ["团玉仔", "星玉灵", "虹纹守卫"], body: "aerial", element: "neutral", personality: "balanced", emoji: "💎", role: "悬浮反击", colors: ["#a7cbd4", "#bd9bcf", "#eaf0f1"], features: ["golem", "crystal-crest", "rounded-armor", "inset-gems"], description: "漂浮的小矿晶会发出温柔光泽，用晶翼维持平衡，观察、牵制、反击是它喜欢的节奏。", stats: [372, 1.02, 0.22, 92] },
  { id: "breeze-sheep", names: ["棉云羊", "卷风羊", "天绒巡羊"], body: "aerial", element: "wind", personality: "cautious", emoji: "🐑", role: "拉距牵制", colors: ["#e4e1ec", "#adbeda", "#fff5e6"], features: ["sheep", "curled-horns", "fluffy-wings", "wool-tufts"], description: "小翅膀藏在蓬松羊毛里，起飞时像一朵散步的云，爱在高处观察。", stats: [322, 0.87, 0.15, 110] },
  { id: "frost-lynx", names: ["雪棉喵", "霜铃猞", "寒星冠猞"], body: "cat", element: "ice", personality: "cautious", emoji: "🐈", role: "冰晶远袭", colors: ["#b8dbe8", "#5b88bb", "#fff8ee"], features: ["cat", "tufted-ears", "frost-stripes", "snow-tail"], visualSize: 0.90, signature: ["iceOrb", "iceBurst"], description: "耳尖像两撮雪绒，幼年爱钻暖窝，成长后安静地守在冰晶之间。", stats: [300, 1.0, 0.11, 122] },
  { id: "iron-pup", names: ["铁糖汪", "银甲汪", "铂铠守卫犬"], body: "corgi", element: "metal", personality: "balanced", emoji: "🐕", role: "精确反击", colors: ["#afbaca", "#536a90", "#eee7d6"], features: ["dog", "silver-ears", "pear-belly", "armor-stripes"], visualSize: 1.03, signature: ["metalOrb", "metalBurst"], description: "毛色像糖纸里的银光，盔甲花纹画在绒毛上，认真起来就会保护伙伴。", stats: [365, 0.98, 0.21, 101] },
  { id: "moon-moth", names: ["灯绒蝶", "月灯蝶", "耀羽圣蝶"], body: "aerial", element: "light", personality: "balanced", emoji: "🦋", role: "光轮牵制", colors: ["#f6e5a8", "#e3a873", "#fff9e9"], features: ["moth", "butterfly-wings", "round-antennae", "sun-eyespots"], visualSize: 0.80, signature: ["lightOrb", "lightBurst"], description: "小翅膀像两盏暖灯，陪玩时会撒下亮点，成熟后展开明亮的冠纹。", stats: [293, 0.96, 0.12, 117] },
  { id: "shade-fox", names: ["暮团狐", "夜绒狐", "影冠玄狐"], body: "cat", element: "shadow", personality: "curious", emoji: "🦊", role: "暗影侧袭", colors: ["#b8a0cf", "#604875", "#ede0ee"], features: ["fox", "tall-ears", "bushy-tail", "shadow-tail-tip"], visualSize: 0.91, signature: ["shadowOrb", "shadowBurst"], description: "白天喜欢藏在柔软阴影里，先悄悄观察，再从侧面探出毛绒脑袋。", stats: [286, 1.04, 0.10, 125] },
  { id: "ripple-otter", names: ["铃铃獭", "奏波獭", "回声乐獭"], body: "corgi", element: "sound", personality: "curious", emoji: "🦦", role: "音波试探", colors: ["#e2b4c4", "#956ac1", "#fff1d9"], features: ["otter", "round-ears", "long-tail", "musical-coat"], visualSize: 0.88, signature: ["soundOrb", "soundBurst"], description: "喜欢敲小石头和哼旋律，用一圈圈音波问候世界，也会认真反击。", stats: [316, 0.98, 0.13, 113] },
  { id: "thought-rabbit", names: ["梦耳兔", "心环兔", "幻冠月兔"], body: "biped", element: "mind", personality: "cautious", emoji: "🐰", role: "专注远攻", colors: ["#d3b5ef", "#8762be", "#fff2ec"], features: ["rabbit", "long-ears", "cheek-stars", "pom-tail"], visualSize: 0.85, signature: ["mindOrb", "mindBurst"], description: "转头时耳朵也会跟着晃，爱先观察再行动，成熟后有醒目的幻光环纹。", stats: [299, 1.01, 0.12, 119] },
  { id: "venom-shroom", names: ["葡糖菇", "雾帽菇", "紫雾伞王"], body: "biped", element: "poison", personality: "curious", emoji: "🍄", role: "毒雾控场", colors: ["#caa1d8", "#815794", "#f8e7dc"], features: ["shroom", "mushroom-cap", "cap-spots", "violet-coat"], visualSize: 0.82, signature: ["poisonOrb", "poisonBurst"], description: "圆帽像一颗葡萄软糖，平时爱闻花香，战斗时把紫色泡泡甩得远远的。", stats: [336, 0.94, 0.17, 105] },
  { id: "boulder-turtle", names: ["石饼龟", "岩纹龟", "山岳堡龟"], body: "cat", element: "rock", personality: "brave", emoji: "🐢", role: "岩环守护", colors: ["#c5b39a", "#766c7a", "#f8edd2"], features: ["turtle", "rounded-shell", "shell-rings", "stone-feet"], visualSize: 1.10, signature: ["rockOrb", "rockBurst"], description: "像背着饼干壳的小团子，遇到困难不急躁，成长后的甲纹像一座小城堡。", stats: [391, 1.01, 0.23, 94] },
  { id: "mystic-deer", names: ["灵芽鹿", "祈铃鹿", "灵冠巡鹿"], body: "cat", element: "spirit", personality: "balanced", emoji: "🦌", role: "灵光反击", colors: ["#a8d6d5", "#798fc4", "#f2f2dd"], features: ["deer", "branch-antlers", "spotted-coat", "spirit-marks"], visualSize: 1.04, signature: ["spiritOrb", "spiritBurst"], description: "小角会映出淡淡灵光，亲近主人时用额头轻蹭，成长后有枝状冠角。", stats: [325, 0.98, 0.13, 118] },
  { id: "punch-bear", names: ["拳团熊", "绒拳熊", "赤带武熊"], body: "corgi", element: "fighting", personality: "brave", emoji: "🐻", role: "近远衔接", colors: ["#dbac8b", "#a95756", "#fff0d7"], features: ["bear", "round-ears", "heavy-paws", "fighter-coat"], visualSize: 1.08, signature: ["fightingOrb", "fightingBurst"], description: "拍掌像两块软面包，练习时十分专注；打不到远处敌人时会改用气弹。", stats: [355, 1.14, 0.15, 110] },
  { id: "star-dragon", names: ["星糖龙", "星轨龙", "穹冠星龙"], body: "aerial", element: "cosmic", personality: "brave", emoji: "🐉", role: "星轨远袭", colors: ["#adc0ed", "#7b69b4", "#fff2d1"], features: ["dragon", "round-horns", "star-tail", "stellar-wings"], visualSize: 1.13, signature: ["cosmicOrb", "cosmicBurst"], description: "把星星纹带在小尾巴上，幼年圆滚滚，成长后展开醒目的星轨双翼。", stats: [333, 1.06, 0.12, 114] },
  { id: "dew-sheep", names: ["露棉羊", "雨卷羊", "澜云绒羊"], body: "aerial", element: "water", personality: "balanced", emoji: "🐑", role: "水珠牵制", colors: ["#c9e4e5", "#71a8bd", "#fff8e6"], features: ["sheep", "curled-horns", "fluffy-wings", "droplet-coat"], visualSize: 0.93, signature: ["waterOrb", "tide"], description: "毛绒上点着露珠纹，爱在水边转头找主人，成长后像一朵雨云。", stats: [330, 0.91, 0.16, 108] },
  { id: "voltage-bird", names: ["闪啾", "雷羽雀", "雷冠巡隼"], body: "aerial", element: "electric", personality: "brave", emoji: "🐦", role: "电针快攻", colors: ["#f4d68a", "#807dc3", "#fff3da"], features: ["bird", "round-beak", "feather-wings", "thunder-crest"], visualSize: 0.73, signature: ["electricOrb", "thunder"], description: "小羽冠像一簇绒毛，喜欢抢着出发，成长后会耐心等候短促突击的时机。", stats: [278, 1.0, 0.08, 134] },
  { id: "wind-cat", names: ["风棉喵", "旋尾喵", "疾风冠猫"], body: "cat", element: "wind", personality: "curious", emoji: "🐈", role: "地面灵巧", colors: ["#bdded2", "#548e9b", "#fff6df"], features: ["cat", "tufted-ears", "curled-tail", "wind-stripes"], visualSize: 0.79, signature: ["windOrb", "cyclone"], description: "尾巴像一弯轻风，不会飞也能灵活跑动，用风弹应对高处对手。", stats: [281, 0.96, 0.09, 133] },
  { id: "sprout-corgi", names: ["芽饼柯", "花团柯", "森穗卫柯"], body: "corgi", element: "wood", personality: "balanced", emoji: "🐶", role: "木叶守护", colors: ["#bbcd93", "#698c62", "#fff2d6"], features: ["dog", "corgi-ears", "pear-belly", "leaf-socks"], visualSize: 0.93, signature: ["woodOrb", "spores"], description: "脚尖的叶纹像小袜子，喜欢嗅嗅果园，主人招手时总会摇着身体跑来。", stats: [349, 0.94, 0.17, 107] },
  { id: "ember-penguin", names: ["暖糖企鹅", "赤围企鹅", "焰披巡企鹅"], body: "biped", element: "fire", personality: "brave", emoji: "🐧", role: "暖焰远攻", colors: ["#eab78d", "#a55e63", "#fff1dc"], features: ["penguin", "round-beak", "flipper-arms", "flame-belly"], visualSize: 0.88, signature: ["fireOrb", "flame"], description: "火色花纹像柔软围巾，跑步会左右晃动，认真起来吐出一串暖焰流星。", stats: [340, 1.03, 0.14, 105] },
  { id: "clay-rabbit", names: ["陶耳兔", "砂跃兔", "岩砂冠兔"], body: "biped", element: "earth", personality: "balanced", emoji: "🐰", role: "稳健突进", colors: ["#cfb291", "#8c7792", "#fff0da"], features: ["rabbit", "long-ears", "cheek-rings", "pom-tail"], visualSize: 0.91, signature: ["earthOrb", "quake"], description: "毛色像柔和陶土，先站稳脚步再起跳，成长后的耳纹像一圈圈年轮。", stats: [329, 1.0, 0.16, 113] },
  { id: "snow-bat", names: ["雪铃蝠", "霜翼蝠", "冰冠月蝠"], body: "aerial", element: "ice", personality: "curious", emoji: "🦇", role: "冰翼侧袭", colors: ["#c2d6e9", "#8395cc", "#fff0ef"], features: ["bat", "big-ears", "scalloped-wings", "snow-belly"], visualSize: 0.78, signature: ["iceOrb", "iceBurst"], description: "像一只戴雪绒围巾的小蝙蝠，先歪头看看，再把晶莹飞梭甩向远处。", stats: [287, 0.99, 0.10, 127] },
];

const FORM_SUFFIXES = ["base", "grown", "crown"];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const integer = (value, min, max, fallback = min) => Math.round(clamp(finite(value, fallback), min, max));
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
const clone = (value) => {
  if (value == null) return null;
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
};
const cloneState = (value) => value && typeof value === "object" && !Array.isArray(value) ? clone(value) : null;
function boundSavedNumber(state, key, min, max, round = false) {
  if (!(key in state)) return;
  const value = Number(state[key]);
  if (!Number.isFinite(value)) { delete state[key]; return; }
  state[key] = round ? Math.round(clamp(value, min, max)) : clamp(value, min, max);
}
function cleanIndividualState(value, kind, personality = "balanced") {
  const state = cloneState(value);
  if (!state) return null;
  if (kind === "biology") {
    for (const key of ["health", "stamina", "hunger", "fatigue", "pain", "stress", "arousal", "temperature"]) boundSavedNumber(state, key, 0, 1);
    if (state.traits != null) {
      state.traits = object(state.traits);
      for (const key of Object.keys(state.traits)) boundSavedNumber(state.traits, key, 0, 1);
    }
    if (state.injuries != null) {
      state.injuries = object(state.injuries);
      for (const key of ["wing", "leg", "poison"]) boundSavedNumber(state.injuries, key, 0, 1);
    }
  } else if (kind === "memory") {
    for (const key of ["affinity", "fear", "attackSkill", "confidence", "dodgeLateral", "dodgeVertical", "rangeDiscipline", "counterRush", "probePatience", "rememberedPressure"]) boundSavedNumber(state, key, 0, 1);
    for (const key of ["attackAttempts", "attackHits", "dodgeAttempts", "dodgeSuccesses", "combatEncounters"]) boundSavedNumber(state, key, 0, 999999, true);
    if (!["balanced", "brave", "cautious", "curious"].includes(state.personality)) state.personality = personality;
  } else if (kind === "skills" && state.states != null) {
    state.states = object(state.states);
    for (const key of Object.keys(state.states)) {
      const skill = object(state.states[key]);
      boundSavedNumber(skill, "cooldown", 0, 60);
      boundSavedNumber(skill, "level", 1, 30, true);
      boundSavedNumber(skill, "xp", 0, 150, true);
      state.states[key] = skill;
    }
  }
  return state;
}
const freeze = (value) => {
  for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child);
  return Object.freeze(value);
};

// Temperament is an interpretable game adapter above the shared neural circuit.
// It does not invent new motor neurons or train the imported connectome weights.
export const COMBAT_PERSONALITIES = freeze({
  balanced: { label: "稳健", attackBias: 0.50, dodgeBias: 0.52, patience: 0.62, retreatHealth: 0.22 },
  brave: { label: "勇敢", attackBias: 0.72, dodgeBias: 0.40, patience: 0.40, retreatHealth: 0.13 },
  cautious: { label: "谨慎", attackBias: 0.39, dodgeBias: 0.73, patience: 0.78, retreatHealth: 0.32 },
  curious: { label: "好奇", attackBias: 0.56, dodgeBias: 0.60, patience: 0.51, retreatHealth: 0.24 },
});
const temperamentDefinitions = [
  ["gentle", "温柔", "balanced", "亲近、喜欢轻蹭与安静陪伴", "affectionate", -0.06, 0.04, 0.08],
  ["protective", "护主", "balanced", "先确认主人安全，再稳健地反击", "protective", 0.07, -0.03, 0.04],
  ["patient", "耐心", "balanced", "愿意等候机会，对玩具和食物很专注", "calm", -0.02, 0.05, 0.12],
  ["competitive", "好胜", "brave", "爱展示本领，但仍会保留闪避和恢复机会", "proud", 0.08, -0.03, -0.04],
  ["loyal", "忠诚", "brave", "喜欢跟随主人，保护伙伴时更积极", "affectionate", -0.01, 0.04, 0.03],
  ["energetic", "活力", "brave", "爱追逐和打滚，偏好短促进攻而非一直狂奔", "playful", 0.04, 0.07, -0.03],
  ["shy", "害羞", "cautious", "先歪头观察，熟悉以后才靠近撒娇", "shy", -0.04, 0.05, 0.05],
  ["observant", "细心", "cautious", "擅长试探和保留距离，互动时会认真看人", "calm", 0.04, -0.02, 0.02],
  ["reserved", "慢热", "cautious", "需要更多陪伴建立亲密，但不是永远逃跑", "reserved", -0.01, 0.02, 0.08],
  ["playful", "顽皮", "curious", "爱追玩具、转圈和打滚，喜欢换一种尝试", "playful", 0.03, 0.03, -0.05],
  ["inquisitive", "探索", "curious", "爱嗅闻新东西，战斗中也会先认识对手", "inquisitive", -0.01, 0.04, 0.08],
  ["cheerful", "开朗", "curious", "招手时积极靠近，喜欢眨眼和开心的小动作", "affectionate", 0.02, -0.02, 0.03],
];
export const TEMPERAMENTS = freeze(Object.fromEntries(temperamentDefinitions.map(([id, label, archetype, description, social, attack, dodge, patience]) => [id, {
  id, label, archetype, description, social,
  attackBias: Number(clamp(COMBAT_PERSONALITIES[archetype].attackBias + attack, 0.2, 0.85).toFixed(2)),
  dodgeBias: Number(clamp(COMBAT_PERSONALITIES[archetype].dodgeBias + dodge, 0.2, 0.85).toFixed(2)),
  patience: Number(clamp(COMBAT_PERSONALITIES[archetype].patience + patience, 0.2, 0.9).toFixed(2)),
  retreatHealth: COMBAT_PERSONALITIES[archetype].retreatHealth,
  preferredInteraction: social === "playful" ? "roll" : social === "shy" || social === "reserved" ? "tilt" : "nuzzle",
}])));

function mixColor(hex, toward, amount) {
  const source = parseInt(hex.slice(1), 16), target = parseInt(toward.slice(1), 16);
  const channels = [16, 8, 0].map((shift) => Math.round(((source >> shift) & 255) * (1 - amount) + ((target >> shift) & 255) * amount));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
const FAMILY_SIGNATURES = {
  "ember-dragon": ["fireBolt", "flame"], "storm-rabbit": ["spark", "thunder"], "amber-corgi": ["earthOrb", "shell"],
  "mint-cat": ["woodOrb", "spores"], "cloud-bird": ["gust", "cyclone"], "pearl-moth": ["starShot", "scentMark"],
  "tide-turtle": ["waterOrb", "tide"], "frost-penguin": ["waterJet", "waterBurst"], "cinder-fox": ["fireOrb", "fireBurst"],
  "forest-deer": ["woodOrb", "woodBurst"], "moss-shroom": ["venom", "spores"], "stone-bear": ["earthOrb", "quake"],
  "spark-hamster": ["electricOrb", "electricBurst"], "lagoon-otter": ["waterJet", "waterOrb"], "dusk-bat": ["windOrb", "cyclone"],
  "sun-lion": ["fireBolt", "fireBurst"], "opal-golem": ["starShot", "palmPulse"], "breeze-sheep": ["gust", "windBurst"],
};
const STAGE_VISUALS = freeze([
  { headScale: 1.18, bodyScale: 0.92, limbScale: 0.88, crestScale: 0.32, wingScale: 0.86, maturity: "圆润幼年" },
  { headScale: 1.04, bodyScale: 1.05, limbScale: 1.06, crestScale: 0.88, wingScale: 1.08, maturity: "轻捷成长" },
  { headScale: 0.94, bodyScale: 1.16, limbScale: 1.17, crestScale: 1.5, wingScale: 1.28, maturity: "冠饰成熟" },
]);

export const SPECIES = freeze(FAMILY_DEFINITIONS.flatMap((family, familyIndex) => family.names.map((name, stage) => {
  const stagePalette = {
    body: mixColor(family.colors[0], stage === 0 ? "#ffffff" : "#263243", [0.22, 0.05, 0.18][stage]),
    accent: mixColor(family.colors[1], stage === 0 ? "#ffffff" : "#162239", [0.18, 0.03, 0.10][stage]),
    belly: mixColor(family.colors[2], "#ffffff", [0.10, 0.04, 0][stage]),
    pattern: mixColor(family.colors[1], stage === 2 ? "#ffffff" : "#212633", stage === 2 ? 0.38 : 0.08 + stage * 0.16),
  };
  const temperaments = Object.values(TEMPERAMENTS).filter((temperament) => temperament.archetype === family.personality);
  const temperament = temperaments[familyIndex % temperaments.length];
  return {
  id: `${family.id}-${FORM_SUFFIXES[stage]}`,
  familyId: family.id,
  stage,
  name,
  bodyType: family.body,
  element: family.element,
  personality: family.personality,
  temperamentId: temperament.id,
  temperament,
  emoji: family.emoji,
  description: `${family.description}${stage === 1 ? "成长后配色更加鲜明，动作也更自信。" : stage === 2 ? "最终形态拥有醒目的冠饰和更稳健的体魄。" : ""}`,
  role: family.role,
  colors: { body: stagePalette.body, accent: stagePalette.accent, belly: stagePalette.belly },
  stagePalette,
  visualSize: Number(((family.visualSize || ({ aerial: 0.96, biped: 0.94, corgi: 1.03, cat: 0.92 }[family.body])) * [0.90, 1.04, 1.14][stage]).toFixed(3)),
  evolutionVisual: STAGE_VISUALS[stage],
  signatureSkills: [...(family.signature || FAMILY_SIGNATURES[family.id] || [`${family.element}Orb`, `${family.element}Burst`])],
  features: [...family.features, ...(stage > 0 ? ["grown-markings"] : []), ...(stage === 2 ? ["crown-crest"] : [])],
  baseStats: { health: Math.round(family.stats[0] * [1, 1.13, 1.27][stage]), attack: family.stats[1] * [1, 1.10, 1.22][stage], defense: family.stats[2] + stage * 0.025, speed: Math.round(family.stats[3] * [1, 1.035, 1.07][stage]) },
  nextEvolutionId: stage < 2 ? `${family.id}-${FORM_SUFFIXES[stage + 1]}` : null,
  evolution: stage < 2 ? { level: [3, 7][stage], bond: [35, 60][stage], coins: [80, 160][stage], material: { id: "evolutionShard", quantity: stage + 1 } } : null,
  assetHint: { silhouette: family.features[0], rig: family.body, growth: stage, pattern: family.features[3], scale: [1, 1.1, 1.2][stage], formStyle: ["round-cub", "athletic", "regal"][stage] },
};
})));
export const SPECIES_BY_ID = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(SPECIES.map((species) => [species.id, species]))));
export const STARTER_IDS = Object.freeze(["ember-dragon-base", "storm-rabbit-base", "amber-corgi-base", "mint-cat-base"]);
export const MAX_LEVEL = 30;
export const TRAINING_CAP = 20;

// Developer specimens are detached, repeatable practice records. No adoption,
// unlock, currency or saved collection is modified by creating one.
export function createDeveloperPreviewRecord(speciesId, { level = 7 } = {}) {
  const species = SPECIES_BY_ID[speciesId];
  if (!species) return null;
  const previewLevel = integer(level, 1, MAX_LEVEL, 7);
  return {
    id: `preview-${species.id}`, speciesId: species.id, nickname: "", developerPreview: true,
    xp: experienceForLevel(previewLevel), level: previewLevel, bond: 70,
    training: { endurance: 3, power: 3, agility: 3 }, trainingLoad: 0, battles: 0, wins: 0,
    biology: { health: 1, stamina: 1, hunger: 0.35, fatigue: 0, pain: 0, stress: 0, arousal: 0.25 },
    memory: { personality: species.personality, affinity: 0.7, confidence: 0.55, fear: 0, attackSkill: 0.25 },
    skills: { states: Object.fromEntries(Object.keys(SKILLS).map((id) => [id, { level: 1, cooldown: 0, xp: 0 }])) },
  };
}

// Experience is cumulative: levelling and evolution never reset learned progress.
export function experienceForLevel(level) {
  const n = integer(level, 1, MAX_LEVEL) - 1;
  return n * (40 + Math.max(0, n - 1) * 12);
}
// Required experience within this level; use xp - experienceForLevel(level)
// for the current progress because an individual's xp is cumulative.
export function xpToNextLevel(level) {
  const current = integer(level, 1, MAX_LEVEL);
  return current === MAX_LEVEL ? 0 : experienceForLevel(current + 1) - experienceForLevel(current);
}
function levelForExperience(xp) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= experienceForLevel(level + 1)) level += 1;
  return level;
}

const TRAINING = Object.freeze({
  feed: { coins: 8, food: 1, xp: 24, bond: 9, load: -12, label: "喂食" },
  play: { coins: 12, food: 0, xp: 28, bond: 12, load: 8, label: "陪玩" },
  endurance: { coins: 18, food: 0, xp: 42, bond: 3, load: 22, label: "耐力训练", stat: "endurance" },
  power: { coins: 18, food: 0, xp: 42, bond: 3, load: 22, label: "力量训练", stat: "power" },
  agility: { coins: 18, food: 0, xp: 42, bond: 3, load: 22, label: "敏捷训练", stat: "agility" },
  rest: { coins: 0, food: 0, xp: 0, bond: 0, load: -55, label: "休息" },
});

export class SpiritCollection {
  constructor(saved = {}) {
    const state = object(saved);
    const resources = object(state.resources);
    this.resources = {
      coins: integer(resources.coins, 0, 999999, 2000),
      food: integer(resources.food, 0, 9999, 40),
      materials: { evolutionShard: integer(object(resources.materials).evolutionShard, 0, 9999, 12) },
    };
    this.records = [];
    const families = new Set();
    const ids = new Set();
    for (const raw of Array.isArray(state.records) ? state.records.slice(0, FAMILY_DEFINITIONS.length) : []) {
      const entry = object(raw);
      const species = SPECIES_BY_ID[entry.speciesId];
      if (!species || entry.developerPreview || String(entry.id || "").startsWith("preview-") || families.has(species.familyId)) continue;
      let id = typeof entry.id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(entry.id) ? entry.id : `spirit-${this.records.length + 1}`;
      while (ids.has(id)) id = `${id.slice(0, 54)}-${this.records.length + 1}`;
      const xp = integer(entry.xp, 0, experienceForLevel(MAX_LEVEL), experienceForLevel(entry.level || 1));
      const training = object(entry.training);
      this.records.push({
        id, speciesId: species.id, nickname: typeof entry.nickname === "string" ? entry.nickname.slice(0, 24) : "",
        xp, level: levelForExperience(xp), bond: integer(entry.bond, 0, 100, 24),
        training: { endurance: integer(training.endurance, 0, TRAINING_CAP), power: integer(training.power, 0, TRAINING_CAP), agility: integer(training.agility, 0, TRAINING_CAP) },
        trainingLoad: integer(entry.trainingLoad, 0, 100),
        battles: integer(entry.battles, 0, 999999), wins: integer(entry.wins, 0, integer(entry.battles, 0, 999999)),
        biology: cleanIndividualState(entry.biology, "biology"), memory: cleanIndividualState(entry.memory, "memory", species.personality), skills: cleanIndividualState(entry.skills, "skills"),
      });
      families.add(species.familyId);
      ids.add(id);
    }
    if (!this.records.length) for (const speciesId of STARTER_IDS) this.records.push(this._newRecord(speciesId));
    this.activeId = this.records.some((record) => record.id === state.activeId) ? state.activeId : this.records[0].id;
    const unlocked = new Set((Array.isArray(state.unlocked) ? state.unlocked : []).filter((id) => SPECIES_BY_ID[id]));
    // Owning an evolved form also records its earlier forms in the dex.
    for (const record of this.records) {
      const species = SPECIES_BY_ID[record.speciesId];
      for (const form of SPECIES) if (form.familyId === species.familyId && form.stage <= species.stage) unlocked.add(form.id);
    }
    this.unlocked = [...unlocked];
    this._serial = Math.max(this.records.length, ...this.records.map((record) => finite(/^spirit-(\d+)$/.exec(record.id)?.[1], 0))) + 1;
  }

  _newRecord(speciesId) {
    const serial = this._serial || this.records.length + 1;
    this._serial = serial + 1;
    return { id: `spirit-${serial}`, speciesId, nickname: "", xp: 0, level: 1, bond: 24, training: { endurance: 0, power: 0, agility: 0 }, trainingLoad: 0, battles: 0, wins: 0, biology: null, memory: null, skills: null };
  }

  get active() { return this.get(this.activeId); }
  get species() { return SPECIES_BY_ID[this.active?.speciesId] || null; }
  get(id) { return this.records.find((record) => record.id === id || record.speciesId === id) || null; }

  select(id) {
    const record = this.get(id);
    if (!record) return { ok: false, message: "这只精灵还没有加入伙伴队伍。" };
    this.activeId = record.id;
    return { ok: true, message: `已选择${SPECIES_BY_ID[record.speciesId].name}。`, record };
  }

  adopt(speciesId) {
    const species = SPECIES_BY_ID[speciesId];
    if (!species || species.stage !== 0) return { ok: false, message: "只能领养初始形态，成长形态需要培养和进化。" };
    const existing = this.records.find((record) => SPECIES_BY_ID[record.speciesId].familyId === species.familyId);
    if (existing) return { ok: false, message: "这一家族已经有伙伴了，可以继续培养它。", record: existing };
    if (this.resources.coins < 85) return { ok: false, message: "领养需要 85 枚星币。" };
    this.resources.coins -= 85;
    const record = this._newRecord(speciesId);
    this.records.push(record);
    if (!this.unlocked.includes(speciesId)) this.unlocked.push(speciesId);
    return { ok: true, message: `${species.name}加入了伙伴队伍！`, record };
  }

  gainExperience(amount) {
    const record = this.active;
    if (record.developerPreview) return { ok: true, preview: true, amount: 0, level: record.level, levelsGained: 0, message: "开发预览不改变真实伙伴经验。" };
    const previousLevel = record.level;
    const awarded = integer(amount, 0, 999999);
    record.xp = Math.min(experienceForLevel(MAX_LEVEL), record.xp + awarded);
    record.level = levelForExperience(record.xp);
    return { ok: true, amount: awarded, level: record.level, levelsGained: record.level - previousLevel, message: record.level > previousLevel ? `升级到 Lv.${record.level}！` : `获得 ${awarded} 经验。` };
  }

  train(kind) {
    if (this.active.developerPreview) return { ok: false, preview: true, message: "开发预览不消耗培养材料；退出预览后再培养真实伙伴。" };
    const task = TRAINING[kind];
    if (!task) return { ok: false, message: "请选择喂食、陪玩、耐力、力量、敏捷或休息。" };
    const record = this.active;
    if (task.stat && record.training[task.stat] >= TRAINING_CAP) return { ok: false, message: "这项训练已达到上限，继续战斗积累经验吧。" };
    if (task.load > 0 && record.trainingLoad > 82) return { ok: false, message: "伙伴训练累了，先喂食或休息一下。" };
    if (this.resources.coins < task.coins || this.resources.food < task.food) return { ok: false, message: `${task.label}需要 ${task.coins} 枚星币${task.food ? `和 ${task.food} 份食物` : ""}。` };
    this.resources.coins -= task.coins;
    this.resources.food -= task.food;
    record.bond = Math.min(100, record.bond + task.bond);
    record.trainingLoad = clamp(record.trainingLoad + task.load, 0, 100);
    if (task.stat) record.training[task.stat] += 1;
    // These are per-individual game physiology fields, not connectome weights.
    if (record.biology) {
      if (kind === "feed") record.biology.hunger = clamp(finite(record.biology.hunger, 0.7) - 0.3, 0, 1);
      if (kind === "rest") {
        record.biology.stamina = 1;
        record.biology.fatigue = Math.max(0, finite(record.biology.fatigue) - 0.5);
        record.biology.health = clamp(finite(record.biology.health, 1) + 0.18, 0, 1);
      }
      if (kind === "play") record.biology.stress = Math.max(0, finite(record.biology.stress) - 0.15);
    }
    const progress = this.gainExperience(task.xp);
    return { ok: true, kind, ...progress, message: `${task.label}完成${task.bond ? `，亲密度 +${task.bond}` : "，恢复训练状态"}${task.xp ? `，经验 +${task.xp}` : ""}${progress.levelsGained ? `，升到 Lv.${record.level}` : ""}。` };
  }

  awardBattle(won) {
    const victory = won === true;
    const record = this.active;
    if (record.developerPreview) return { ok: true, preview: true, won: victory, amount: 0, level: record.level, levelsGained: 0, coins: 0, food: 0, shards: 0, message: "开发预览对战结束，不领取奖励，也不改变真实收藏。" };
    record.battles = Math.min(999999, record.battles + 1);
    record.wins = Math.min(999999, record.wins + Number(victory));
    record.bond = Math.min(100, record.bond + (victory ? 5 : 3));
    this.resources.coins = Math.min(999999, this.resources.coins + (victory ? 110 : 45));
    this.resources.food = Math.min(9999, this.resources.food + (victory ? 2 : 1));
    if (victory) this.resources.materials.evolutionShard = Math.min(9999, this.resources.materials.evolutionShard + 1);
    const progress = this.gainExperience(victory ? 90 : 45);
    return { ...progress, won: victory, coins: victory ? 110 : 45, food: victory ? 2 : 1, shards: Number(victory), message: `${victory ? "胜利" : "实战练习"}奖励：${victory ? 110 : 45} 星币、${victory ? 2 : 1} 食物、${victory ? 90 : 45} 经验${victory ? "、1 进化晶石" : ""}。` };
  }

  canEvolve() {
    const species = this.species;
    const next = SPECIES_BY_ID[species.nextEvolutionId] || null;
    if (this.active.developerPreview) return { ready: false, preview: true, reasons: ["开发预览可直接切换任意形态，不需要解锁进化。"], next };
    if (!next) return { ready: false, reasons: ["已经是最终形态。"], next: null };
    const requirement = species.evolution;
    const reasons = [];
    if (this.active.level < requirement.level) reasons.push(`等级 ${this.active.level}/${requirement.level}`);
    if (this.active.bond < requirement.bond) reasons.push(`亲密度 ${this.active.bond}/${requirement.bond}`);
    if (this.resources.coins < requirement.coins) reasons.push(`星币 ${this.resources.coins}/${requirement.coins}`);
    if (this.resources.materials[requirement.material.id] < requirement.material.quantity) reasons.push(`进化晶石 ${this.resources.materials[requirement.material.id]}/${requirement.material.quantity}`);
    return { ready: reasons.length === 0, reasons, next };
  }

  evolve() {
    const eligibility = this.canEvolve();
    if (!eligibility.ready) return { ok: false, message: eligibility.reasons.join(" · "), ...eligibility };
    const previous = this.species;
    const requirement = previous.evolution;
    this.resources.coins -= requirement.coins;
    this.resources.materials[requirement.material.id] -= requirement.material.quantity;
    this.active.speciesId = eligibility.next.id;
    if (!this.unlocked.includes(eligibility.next.id)) this.unlocked.push(eligibility.next.id);
    return { ok: true, previous, species: eligibility.next, record: this.active, message: `${previous.name}进化成了${eligibility.next.name}！经验、亲密度和记忆全部保留。` };
  }

  stats(record = this.active) {
    const species = SPECIES_BY_ID[record?.speciesId];
    if (!species) return { health: 280, attack: 1, defense: 0.1, speed: 110, healthMultiplier: 1, attackMultiplier: 1, defenseBonus: 0, speedMultiplier: 1 };
    const training = object(record.training);
    const level = integer(record.level, 1, MAX_LEVEL) - 1;
    const endurance = integer(training.endurance, 0, TRAINING_CAP);
    const power = integer(training.power, 0, TRAINING_CAP);
    const agility = integer(training.agility, 0, TRAINING_CAP);
    return {
      health: Math.round(clamp(species.baseStats.health * (1 + level * 0.012 + endurance * 0.007), 200, 900)),
      attack: Number(clamp(species.baseStats.attack * (1 + level * 0.01 + power * 0.008), 0.7, 2.2).toFixed(3)),
      defense: Number(clamp(species.baseStats.defense + level * 0.002 + endurance * 0.0015, 0.05, 0.38).toFixed(3)),
      speed: Math.round(clamp(species.baseStats.speed * (1 + level * 0.0015 + agility * 0.002), 80, 155)),
      healthMultiplier: Number(clamp(1 + level * 0.012 + endurance * 0.007 + species.stage * 0.08, 1, 1.65).toFixed(3)),
      attackMultiplier: Number(clamp(1 + level * 0.01 + power * 0.008 + species.stage * 0.07, 1, 1.6).toFixed(3)),
      defenseBonus: Number(clamp(level * 0.002 + endurance * 0.0015 + species.stage * 0.018, 0, 0.14).toFixed(3)),
      speedMultiplier: Number(clamp(1 + level * 0.0015 + agility * 0.002 + species.stage * 0.025, 1, 1.14).toFixed(3)),
    };
  }

  snapshot() {
    const records = this.records.filter((record) => !record.developerPreview && !record.id.startsWith("preview-"));
    const activeId = records.some((record) => record.id === this.activeId) ? this.activeId : records[0]?.id;
    return clone({ version: 1, activeId, records, resources: this.resources, unlocked: this.unlocked });
  }
}
