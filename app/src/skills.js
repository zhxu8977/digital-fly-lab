const freeze = (value) => {
  for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child);
  return Object.freeze(value);
};

// This is a game-balance chart, not a claim about fly biology or real elements.
// Every non-neutral element has exactly three advantages and three disadvantages.
// Opposite edges are reciprocal: 1.5 × (2 / 3) = 1; there are no immunities.
export const ELEMENT_CYCLE = Object.freeze(["fire", "wood", "earth", "electric", "water", "wind", "ice", "metal", "light", "shadow", "sound", "mind", "poison", "rock", "spirit", "fighting", "cosmic"]);
export const ELEMENT_EDGE_OFFSETS = Object.freeze([1, 5, 13]);
const elementDefinitions = {
  neutral: { label: "无属性", color: 0xd9eee7, description: "稳定、没有属性优势；同属性伤害为八成。" },
  fire: { label: "火", color: 0xff714d, description: "火焰与热浪，适合持续施压。" },
  electric: { label: "电", color: 0xffdf57, description: "电针与雷弧，动作短促而明亮。" },
  wood: { label: "木", color: 0x74d777, description: "叶刃与种子，擅长范围牵制。" },
  earth: { label: "土", color: 0xc49a67, description: "土团与地脉，稳健的近远程反击。" },
  water: { label: "水", color: 0x5bbcf6, description: "水珠与涟漪，适合灵活试探。" },
  wind: { label: "风", color: 0x9ef1dc, description: "风刃与旋流，轻巧的远程牵制。" },
  ice: { label: "冰", color: 0xb4e4ff, description: "冰晶与霜环，清晰的棱角轨迹。" },
  metal: { label: "金属", color: 0xaebcce, description: "旋刃与金属碎片，适合精确投掷。" },
  light: { label: "光", color: 0xfff3ad, description: "光球与光轮，明亮的蓄力反馈。" },
  shadow: { label: "暗", color: 0x9b78d9, description: "暗球与暮影，适合迂回袭扰。" },
  sound: { label: "音", color: 0xff9fc5, description: "音波与共鸣环，逐层扩散的波纹。" },
  mind: { label: "念", color: 0xd28dff, description: "念珠与心环，用奇幻光环表现专注。" },
  poison: { label: "毒", color: 0xbd70d4, description: "毒泡与毒雾，命中后可持续施压。" },
  rock: { label: "岩", color: 0xa99987, description: "岩片与碎岩环，厚重的冲击反馈。" },
  spirit: { label: "灵", color: 0x91d6e8, description: "灵焰与灵光环，轻盈的漂浮火花。" },
  fighting: { label: "格斗", color: 0xef947b, description: "气弹与掌震，近战也保留远程机会。" },
  cosmic: { label: "星辰", color: 0x9cafff, description: "流星与星轨，耀眼的远近程技能。" },
};
const matrix = Object.fromEntries(Object.keys(elementDefinitions).map((key) => [key, Object.fromEntries(Object.keys(elementDefinitions).map((target) => [target, key === target ? 0.8 : 1]))]));
for (let index = 0; index < ELEMENT_CYCLE.length; index += 1) {
  for (const offset of ELEMENT_EDGE_OFFSETS) {
    const attacker = ELEMENT_CYCLE[index];
    const defender = ELEMENT_CYCLE[(index + offset) % ELEMENT_CYCLE.length];
    matrix[attacker][defender] = 1.5;
    matrix[defender][attacker] = 2 / 3;
  }
}
export const ELEMENT_MATCHUPS = freeze(matrix);
export const MATCHUPS = ELEMENT_MATCHUPS;
export const ELEMENTS = freeze(Object.fromEntries(Object.entries(elementDefinitions).map(([key, definition]) => [key, {
  ...definition,
  strengths: Object.keys(elementDefinitions).filter((target) => matrix[key][target] === 1.5),
  weaknesses: Object.keys(elementDefinitions).filter((target) => matrix[key][target] === 2 / 3),
}])));

export function elementMultiplier(attackElement, defenseElement, resistances = {}) {
  const matchup = MATCHUPS[attackElement]?.[defenseElement] ?? 1;
  const savedResistance = Number(resistances?.[attackElement]);
  const resistance = Math.max(-0.5, Math.min(0.8, Number.isFinite(savedResistance) ? savedResistance : 0));
  return matchup * (1 - resistance);
}

export function skillDistanceWindow(skill) {
  if (!skill) return { min: 0, max: 0, ideal: 0 };
  if (skill.type === "buff") return { min: 0, max: Infinity, ideal: 0 };
  const max = skill.type === "area" ? skill.radius : skill.range;
  const min = skill.minRange ?? (["projectile", "mark"].includes(skill.type) ? Math.min(220, max * 0.18) : 0);
  return { min, max, ideal: skill.idealRange ?? min + (max - min) * 0.68 };
}

export function skillInRange(skill, distance) {
  const window = skillDistanceWindow(skill);
  return distance >= window.min && distance <= window.max;
}

// A lightweight firing-window estimate. It does not guarantee a hit; it stops
// the AI from throwing slow projectiles at a fast target crossing the line of
// fire when the required lead would be implausibly large.
export function estimateShotOpportunity({ skill, distance, projectileSpeed = 650, hitRadius = 90, targetSpeed = 0, targetHeadingOffset = 0 }) {
  const window = skillDistanceWindow(skill);
  const inRange = distance >= window.min && distance <= window.max;
  if (!inRange) return { viable: false, confidence: 0, travelTime: 0, leadDistance: 0, window };
  if (!["projectile", "mark", "cone", "chain"].includes(skill.type)) {
    return { viable: true, confidence: 1, travelTime: 0, leadDistance: 0, window };
  }
  const travelTime = distance / Math.max(1, projectileSpeed);
  const lateralSpeed = Math.abs(Math.sin(targetHeadingOffset)) * targetSpeed;
  const leadDistance = lateralSpeed * travelTime;
  const confidence = Math.max(0, Math.min(1, hitRadius / Math.max(hitRadius, hitRadius * 0.55 + leadDistance * 0.22 + travelTime * 26)));
  return { viable: travelTime <= 2.15 && confidence >= 0.28, confidence, travelTime, leadDistance, window };
}

const LEGACY_SKILLS = {
  dash: { name: "冲刺撞击", type: "melee", element: "neutral", damage: 24, range: 92, radius: 0, cost: 0.012, cooldown: 1.8, source: "body", sourceLabel: "头胸与身体", requiresFacing: true, description: "收拢翅膀后以头胸正面撞击目标，命中后获得攻击经验。" },
  venom: { name: "毒液弹", type: "projectile", element: "wood", damage: 18, range: 720, radius: 0, cost: 0.014, cooldown: 2.6, source: "mouth", sourceLabel: "口器", requiresFacing: true, status: "poison", description: "从口器远程喷出毒液弹，附加持续中毒接口。" },
  flame: { name: "火焰喷射", type: "cone", element: "fire", damage: 22, range: 480, radius: 90, cost: 0.025, cooldown: 3.4, source: "mouth", sourceLabel: "口器", requiresFacing: true, description: "从口器持续喷射锥形火焰，需要身体朝向目标。" },
  fireBolt: { name: "焰尾火球", type: "projectile", element: "fire", damage: 24, range: 1100, radius: 0, cost: 0.012, cooldown: 2.1, source: "mouth", sourceLabel: "口器", requiresFacing: true, description: "吐出有焰尾的直线火球，用于远程试探与对地攻击；离口后独立飞行，目标可以闪避。" },
  starShot: { name: "星屑弹", type: "projectile", element: "neutral", damage: 17, range: 1000, radius: 0, cost: 0.008, cooldown: 1.8, source: "wing", sourceLabel: "翅缘或前肢", requiresFacing: false, description: "从翅缘或前肢甩出低消耗星屑弹，让无属性伙伴也有中远程伤害能力。" },
  thunder: { name: "连锁雷弧", type: "chain", element: "electric", damage: 20, range: 620, radius: 145, cost: 0.035, cooldown: 4.2, source: "antenna", sourceLabel: "触角", requiresFacing: false, description: "由触角释放可弯折的雷弧，不必完全正对，击中后造成短暂痉挛。" },
  spark: { name: "电光飞针", type: "projectile", element: "electric", damage: 13, range: 800, radius: 0, cost: 0.006, cooldown: 1.45, source: "wing", sourceLabel: "翅膀", requiresFacing: false, description: "由翅缘甩出低消耗电针，可以在侧飞时发射。" },
  spores: { name: "孢子爆发", type: "area", element: "wood", damage: 16, range: 0, radius: 240, cost: 0.03, cooldown: 5, source: "body", sourceLabel: "体表", requiresFacing: false, description: "从全身体表释放孢子，形成近身范围伤害与减速。" },
  shell: { name: "岩壳防御", type: "buff", element: "earth", damage: 0, range: 0, radius: 0, cost: 0.022, cooldown: 6, duration: 3.5, source: "body", sourceLabel: "全身", requiresFacing: false, description: "全身形成岩壳护盾，不需要面向敌人。" },
  quake: { name: "地脉震荡", type: "area", element: "earth", damage: 22, range: 0, radius: 265, cost: 0.032, cooldown: 4.6, source: "paws", sourceLabel: "四足", requiresFacing: false, description: "由四足向周围释放冲击波，掀起附近目标。" },
  waterJet: { name: "水流弹", type: "projectile", element: "water", damage: 20, range: 760, radius: 0, cost: 0.012, cooldown: 2.2, source: "mouth", sourceLabel: "口器", requiresFacing: true, description: "从口器发射低消耗直线水弹，需要短暂瞄准。" },
  tide: { name: "潮汐环", type: "area", element: "water", damage: 18, range: 0, radius: 255, cost: 0.03, cooldown: 4.8, source: "body", sourceLabel: "身体", requiresFacing: false, description: "由身体向四周释放环形水浪，无需面向目标。" },
  gust: { name: "风刃", type: "projectile", element: "wind", damage: 16, range: 850, radius: 0, cost: 0.008, cooldown: 1.75, source: "wing", sourceLabel: "翅膀", requiresFacing: false, description: "由翅膀挥出远程风刃，允许高速侧飞射击。" },
  cyclone: { name: "旋风场", type: "area", element: "wind", damage: 19, range: 0, radius: 285, cost: 0.035, cooldown: 5.2, source: "wing", sourceLabel: "双翅", requiresFacing: false, description: "双翅制造旋风场，将近身目标卷起并旋转。" },
  scentMark: { name: "气味标记", type: "mark", element: "neutral", damage: 0, range: 950, radius: 0, cost: 0.008, cooldown: 8, duration: 16, source: "mouth", sourceLabel: "口器", requiresFacing: true, description: "从口器喷出气味标记；命中后由嗅觉跨越整张地图追踪。" },
  palmPulse: { name: "掌心脉冲", type: "projectile", element: "neutral", damage: 15, range: 1150, radius: 0, cost: 0.006, cooldown: 1.6, source: "wing", sourceLabel: "手掌", requiresFacing: true, description: "双足型将翅部运动输出映射到前臂与手掌，发射低消耗远程脉冲，用于攻击空中或远距离目标。" },
  throwingDart: { name: "回旋飞镖", type: "projectile", element: "neutral", damage: 17, range: 1350, minRange: 240, idealRange: 860, radius: 0, cost: 0.007, cooldown: 1.85, source: "wing", sourceLabel: "投掷手", requiresFacing: true, gesture: "throw", description: "双足型跨步转髋、抬肘蓄力后单手甩出回旋飞镖；适合中远距离预测射击，贴身时不会乱扔。" },
  risingStrike: { name: "升空截击", type: "melee", element: "neutral", damage: 31, range: 145, radius: 0, cost: 0.018, cooldown: 3.2, source: "paws", sourceLabel: "腿部与拳臂", requiresFacing: true, description: "仅在目标进入近身窗口时跳起截击；距离过远时不会空挥。" },
};

const VISUALS = freeze({
  neutral: { style: "star", speed: 1450, hitRadius: 150, reaction: "recoil", trail: "sparkle", particles: 8 },
  fire: { style: "fireball", speed: 1600, hitRadius: 175, reaction: "burn", trail: "embers", particles: 12 },
  electric: { style: "needle", speed: 1650, hitRadius: 135, reaction: "shock", trail: "zigzag", particles: 8 },
  wood: { style: "leaf", speed: 1450, hitRadius: 155, reaction: "recoil", trail: "leaves", particles: 9 },
  earth: { style: "stone", speed: 1400, hitRadius: 180, reaction: "launch", trail: "dust", particles: 10 },
  water: { style: "water", speed: 1500, hitRadius: 165, reaction: "recoil", trail: "droplets", particles: 10 },
  wind: { style: "wind", speed: 1600, hitRadius: 145, reaction: "spin", trail: "arcs", particles: 6 },
  ice: { style: "ice", speed: 1500, hitRadius: 150, reaction: "recoil", trail: "crystals", particles: 8 },
  metal: { style: "metal", speed: 1600, hitRadius: 140, reaction: "recoil", trail: "sparks", particles: 8 },
  light: { style: "light", speed: 1550, hitRadius: 160, reaction: "recoil", trail: "rays", particles: 10 },
  shadow: { style: "shadow", speed: 1450, hitRadius: 165, reaction: "recoil", trail: "wisps", particles: 9 },
  sound: { style: "sound", speed: 1500, hitRadius: 180, reaction: "recoil", trail: "rings", particles: 5 },
  mind: { style: "mind", speed: 1450, hitRadius: 165, reaction: "recoil", trail: "orbits", particles: 7 },
  poison: { style: "poison", speed: 1400, hitRadius: 165, reaction: "poison", trail: "bubbles", particles: 10 },
  rock: { style: "rock", speed: 1350, hitRadius: 180, reaction: "launch", trail: "rubble", particles: 10 },
  spirit: { style: "spirit", speed: 1500, hitRadius: 160, reaction: "recoil", trail: "wisps", particles: 9 },
  fighting: { style: "fighting", speed: 1550, hitRadius: 155, reaction: "launch", trail: "streaks", particles: 6 },
  cosmic: { style: "cosmic", speed: 1500, hitRadius: 160, reaction: "recoil", trail: "stars", particles: 12 },
});
const ELEMENT_SKILL_NAMES = {
  fire: ["绯焰流星", "热浪绽放"], electric: ["雷光星针", "电环跃动"], wood: ["青叶飞旋", "芽之绽放"],
  earth: ["团土流弹", "地脉回响"], water: ["珍珠水弹", "涟漪绽放"], wind: ["弧月风刃", "环风回旋"],
  ice: ["雪晶飞梭", "霜环绽放"], metal: ["银羽旋刃", "钢星震环"], light: ["暖阳光球", "光轮绽放"],
  shadow: ["暮影绒球", "暗幕回响"], sound: ["铃音飞波", "共鸣震环"], mind: ["念珠飞环", "心光波纹"],
  poison: ["紫雾泡泡", "毒雾绽放"], rock: ["碎岩飞片", "岩环震击"], spirit: ["灵火流珠", "灵光回响"],
  fighting: ["绒掌气弹", "寸劲掌震"], cosmic: ["星轨流弹", "群星绽放"],
};
const elementalSkills = {};
for (const [element, names] of Object.entries(ELEMENT_SKILL_NAMES)) {
  const visual = VISUALS[element];
  elementalSkills[`${element}Orb`] = {
    name: names[0], type: "projectile", element, damage: 18, range: 1250, minRange: 110, idealRange: 780,
    radius: 0, cost: 0.008, cooldown: 1.85, source: "wing", sourceLabel: "前肢、翅缘或头部的发射点", requiresFacing: true,
    gesture: "throw", vfxStyle: visual.style, projectileSpeed: visual.speed, hitRadius: visual.hitRadius, reaction: visual.reaction,
    ...(element === "poison" ? { status: "poison" } : {}),
    description: `甩出可闪避的直线${ELEMENTS[element].label}属性弹，离开发射点后独立飞行；低消耗用于远程试探。`,
  };
  elementalSkills[`${element}Burst`] = {
    name: names[1], type: "area", element, damage: 26, range: 0, radius: 300,
    cost: 0.018, cooldown: 4.5, source: "body", sourceLabel: "躯干与前肢", requiresFacing: false,
    gesture: "pulse", vfxStyle: "ring", reaction: element === "electric" ? "shock" : element === "fire" ? "burn" : element === "poison" ? "poison" : element === "earth" || element === "rock" || element === "fighting" ? "launch" : "recoil",
    description: `蓄力后向近身范围释放${ELEMENTS[element].label}属性震环；目标在范围外时不会空放。`,
  };
}
const skillDefinitions = { ...LEGACY_SKILLS, ...elementalSkills };
export const SKILLS = freeze(Object.fromEntries(Object.entries(skillDefinitions).map(([id, skill]) => [id, {
  ...skill,
  gesture: skill.gesture || (skill.type === "buff" ? "guard" : skill.type === "area" ? "pulse" : skill.type === "melee" ? "strike" : skill.type === "cone" ? "breathe" : skill.type === "mark" ? "mark" : skill.source === "mouth" ? "spit" : "throw"),
  vfxStyle: skill.vfxStyle || (skill.type === "buff" ? "shield" : skill.type === "area" ? "ring" : skill.type === "mark" ? "mark" : VISUALS[skill.element].style),
  reaction: skill.reaction || (skill.type === "melee" ? "launch" : VISUALS[skill.element].reaction),
}])));

const legacyLoadouts = {
  neutral: ["starShot", "dash", "scentMark"], fire: ["fireBolt", "flame", "dash", "scentMark"], electric: ["spark", "thunder", "electricBurst", "scentMark"],
  wood: ["venom", "spores", "scentMark"], earth: ["earthOrb", "quake", "shell", "scentMark"], water: ["waterJet", "tide", "scentMark"], wind: ["gust", "cyclone", "scentMark"],
};
export const ELEMENT_LOADOUTS = freeze(Object.fromEntries(Object.keys(ELEMENTS).map((element) => [element, legacyLoadouts[element] || [`${element}Orb`, `${element}Burst`, "dash", "scentMark"]])));
export const BIPED_ELEMENT_LOADOUTS = freeze(Object.fromEntries(Object.keys(ELEMENTS).map((element) => [element,
  element === "neutral" ? ["throwingDart", "palmPulse", "risingStrike", "dash", "scentMark"]
    : [...new Set([element === "fire" ? "fireBolt" : legacyLoadouts[element]?.find((id) => SKILLS[id].type === "projectile") || `${element}Orb`, `${element}Burst`, "throwingDart", "risingStrike", "scentMark"])],
])));

export function getSpeciesLoadout(species, { ground = species?.bodyType !== "aerial" } = {}) {
  const element = ELEMENTS[species?.element] ? species.element : "neutral";
  const base = ground ? BIPED_ELEMENT_LOADOUTS[element] : ELEMENT_LOADOUTS[element];
  const signature = (Array.isArray(species?.signatureSkills) ? species.signatureSkills : []).filter((id) => SKILLS[id] && (SKILLS[id].element === element || SKILLS[id].element === "neutral"));
  // A signature complements shared basic moves; it does not delete ranged or
  // close options needed to fight opponents using another body rig.
  return [...new Set([...signature, ...base])];
}

export function getSkillVisual(id, { stage = 0 } = {}) {
  const skill = SKILLS[id] || SKILLS.starShot;
  const visual = VISUALS[skill.element] || VISUALS.neutral;
  return {
    ...visual, style: skill.vfxStyle, color: ELEMENTS[skill.element].color,
    speed: skill.projectileSpeed || visual.speed, hitRadius: skill.hitRadius || visual.hitRadius,
    reaction: skill.reaction, particles: Math.min(16, visual.particles + Math.max(0, Math.min(2, Number(stage) || 0)) * 2),
  };
}

export class SkillSystem {
  constructor(saved = {}) {
    this.states = {};
    Object.keys(SKILLS).forEach((id) => {
      const raw = saved?.states?.[id] || {};
      const level = Number.isFinite(Number(raw.level)) ? Math.round(Math.max(1, Math.min(30, Number(raw.level)))) : 1;
      this.states[id] = {
        cooldown: Number.isFinite(Number(raw.cooldown)) ? Math.max(0, Math.min(60, Number(raw.cooldown))) : 0,
        level,
        xp: Number.isFinite(Number(raw.xp)) ? Math.max(0, Math.min(level * 5 - 1, Number(raw.xp))) : 0,
      };
    });
    this.shield = 0;
  }

  tick(dt) {
    const step = Number.isFinite(Number(dt)) ? Math.max(0, Math.min(10, Number(dt))) : 0;
    Object.values(this.states).forEach((state) => { state.cooldown = Math.max(0, state.cooldown - step); });
    this.shield = Math.max(0, this.shield - step);
  }

  activate(id, { actor, distance = Infinity, targetElement = "neutral", resistances = {} }) {
    const skill = SKILLS[id], state = this.states[id];
    if (!skill || !state) return { ok: false, reason: "未知技能" };
    if (state.cooldown > 0) return { ok: false, reason: `冷却中 ${state.cooldown.toFixed(1)} 秒` };
    const inRange = skillInRange(skill, distance);
    if (!inRange) return { ok: false, spent: false, reason: distance < skillDistanceWindow(skill).min ? "目标距离过近" : "目标超出技能距离", skill };
    if (!actor.spendStamina(skill.cost)) return { ok: false, reason: "体力不足" };
    state.cooldown = skill.cooldown;
    if (skill.type === "buff") this.shield = skill.duration;
    const multiplier = elementMultiplier(skill.element, targetElement, resistances);
    const requestedPower = actor.modifiers ? Number(actor.modifiers().combat) : 1;
    const power = Number.isFinite(requestedPower) ? Math.max(0.1, Math.min(2.2, requestedPower)) : 1;
    const damage = skill.damage * (1 + (state.level - 1) * 0.12) * multiplier * power;
    if (state.level < 30) {
      state.xp += 1;
      if (state.xp >= state.level * 5) { state.xp = 0; state.level = Math.min(30, state.level + 1); }
    }
    return { ok: true, hit: true, id, skill, damage, multiplier, level: state.level, effectType: skill.type };
  }

  snapshot() {
    return { states: JSON.parse(JSON.stringify(this.states)) };
  }
}
