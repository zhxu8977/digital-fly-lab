import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ConnectomeBrain } from "./brain.js";
import { CompanionLearning } from "./learning.js";
import { movementSpeed, updateFlightState } from "./locomotion.js";
import { BiologicalState } from "./biology.js";
import { BIPED_ELEMENT_LOADOUTS, ELEMENTS, ELEMENT_LOADOUTS, SKILLS, SkillSystem, estimateShotOpportunity, skillDistanceWindow, skillInRange, getSpeciesLoadout, getSkillVisual } from "./skills.js";
import { moveBody, separateBodies } from "./physics.js";
import { resolveFlightDirection, updateCombatOrientation } from "./orientation.js";
import { selectGroundCombatPace, updateGroundLocomotion } from "./ground-locomotion.js";
import { knockdownDuration, knockdownGroundClearance, quadrupedKnockdownPose, shouldKnockDown, timedKnockdownState } from "./knockdown.js";
import { planGroundRoute, probeGroundPath } from "./navigation.js";
import { directionalGait } from "./biped-gait.js";
import { finishForaging, foodScentRange, updateForagingState } from "./foraging.js";
import { combatPowerIndex, evaluateCombatDisposition, shouldRetreatFromDuel } from "./combat-personality.js";
import { populateOpenSourceWorld, readRendererName, selectGraphicsProfile } from "./open-source-world.js";
import { attackFlightEnvelope, combatDamageReach } from "./combat-envelope.js";
import { groundClearance, refreshSkinnedBounds } from "./skinned-bounds.js";
import { CameraInteraction, selectManualReaction } from "./camera-interaction.js";
import { SpiritCollection, SPECIES, SPECIES_BY_ID, COMBAT_PERSONALITIES, createDeveloperPreviewRecord } from "./collection.js";
import { mountCollectionView } from "./collection-view.js";
import { applySpeciesAppearance, attachSpeciesAsset, releaseSpeciesAppearance, applySocialExpression } from "./creature-art.js";
import { DeveloperPreviewSession } from "./developer-preview.js";
import { updateRobot, robotReceptionPoint, planRobotReception, socialCallDuration } from "./robot-controller.js";
import { createTVRobot } from "./tv-robot.js";
import { decorateSkillEffect } from "./skill-vfx.js";

const WORLD_W = 7200;
const WORLD_H = 4800;
const MAX_FLIGHT_ALTITUDE = 1600;
const GROUND_BOUNDS = Object.freeze({ minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H });
const DESIGN_W = 960;
const DESIGN_H = 620;
const OWNER_START = { x: WORLD_W / 2, y: WORLD_H / 2 };
const CREATURE_START = { x: WORLD_W / 2, y: WORLD_H / 2 + 245 };
const ROBOT_START = { x: WORLD_W / 2, y: WORLD_H / 2, angle: -Math.PI / 2 };
const INTERACTION_SCREEN_POINT = { ...ROBOT_START };
const INTERACTION_RECEPTION_POINT = robotReceptionPoint(ROBOT_START);
const arenaHost = document.querySelector("#arena3d");
const brainCanvas = document.querySelector("#brain");
const bctx = brainCanvas.getContext("2d");
const ui = {
  provenance: document.querySelector("#provenance"), status: document.querySelector("#worldStatus"),
  pause: document.querySelector("#pauseButton"), log: document.querySelector("#eventLog"),
  score: document.querySelector("#scoreValue"), hunger: document.querySelector("#hungerValue"),
  escape: document.querySelector("#escapeMeter"), feed: document.querySelector("#feedMeter"),
  odor: document.querySelector("#odorMeter"), bitter: document.querySelector("#bitterMeter"),
  escapeValue: document.querySelector("#escapeValue"), feedValue: document.querySelector("#feedValue"),
  odorValue: document.querySelector("#odorValue"), bitterValue: document.querySelector("#bitterValue"),
  affinity: document.querySelector("#affinityMeter"), fear: document.querySelector("#fearMeter"),
  skill: document.querySelector("#skillMeter"), attack: document.querySelector("#attackMeter"),
  affinityValue: document.querySelector("#affinityValue"), fearValue: document.querySelector("#fearValue"),
  skillValue: document.querySelector("#skillValue"), attackValue: document.querySelector("#attackValue"),
  relationship: document.querySelector("#relationshipLabel"), learningExplanation: document.querySelector("#learningExplanation"),
  winChance: document.querySelector("#winChanceValue"), escapeChance: document.querySelector("#escapeChanceValue"),
  health: document.querySelector("#healthValue"), stamina: document.querySelector("#staminaValue"),
  decisionReason: document.querySelector("#decisionReason"), personality: document.querySelector("#personalitySelect"),
  motion: document.querySelector("#motionValue"), altitude: document.querySelector("#altitudeValue"), speed: document.querySelector("#speedValue"),
  target: document.querySelector("#targetValue"),
  scenarioDescription: document.querySelector("#scenarioDescription"),
};
const colors = { vision: "#ffb15c", smell: "#83f3c3", sweet: "#d7f879", bitter: "#b993ff", motor: "#ff7777", relay: "#6d9b95" };

let data, brain, rivalBrain, memory, biology, skillSystem, scene, sceneryGroup, openSourceSceneryGroup, skillEffectsGroup, camera, renderer, renderProfile, controls, floor, creatureMesh, ownerMesh, scentLine, visionLine, ownerLine, wingLeft, wingRight;
let creatureLegs = [];
let rivalMesh, rivalSkillSystem, duelPlayerMarker, duelRivalMarker;
let interactionScreen, cameraInteraction;
let enemyMeshes = new Map();
let activeSkillEffects = [];
let paused = false, accumulator = 0, elapsed = 0, manualStimulus = null, manualUntil = 0, lastMode = "";
let autoCombatCamera = true;
let cameraMode = "overview";
let playerWingStyle = "butterfly", rivalWingStyle = "mini";
let playerBodyType = "aerial", rivalBodyType = "aerial";
let collection, collectionView, legacyCollectionMigration = false;
const developerPreview = new DeveloperPreviewSession();
let developerMode = true, robotControlled = false;
const robotKeys = new Set(), robotButtons = new Set();
let showCollectionReaction = () => {};
let rivalSpeciesId = "cloud-bird-base";
const COLLECTION_STORAGE_KEY = "digitalFlySpiritCollectionV1";
const isGroundBodyType = (bodyType) => ["biped", "corgi", "cat"].includes(bodyType);
let lastTime = performance.now();
let lastBiologySave = 0;
let wanderTarget = { x: WORLD_W * 0.65, y: WORLD_H * 0.55 };
let wanderUntil = 0;
let lastDecision = { ownerAttraction: 0, attackDrive: 0, winChance: 0, escapeChance: 0, action: "explore", reason: "" };
let layout = new Map();
const world = {
  score: 0,
  creature: { ...CREATURE_START, radius: 36, angle: -0.4, altitude: 0, verticalSpeed: 0, flying: false, flightPhase: "grounded", flightCommand: "auto", speed: 0, hunger: 0.72, health: 0.9, stamina: 1, feedHold: 0, rejectCooldown: 0, attackCooldown: 0, forageState: "idle", foraging: {}, forageTarget: null, forageLockUntil: 0, rejectedFood: null, rejectedFoodUntil: 0 },
  foods: [], enemies: [], threat: { x: 1260, y: 200, strength: 0.5, hostility: 0.5, health: 100, maxHealth: 100, defense: 0.1, element: "neutral" },
  caves: [{ id: 0, x: 240, y: 250 }, { id: 1, x: WORLD_W - 240, y: WORLD_H - 250 }],
  owner: { ...OWNER_START, callUntil: 0 },
  robot: { ...ROBOT_START, radius: 115, altitude: 0, speed: 0 },
  interaction: { active: false, callUntil: 0, reaction: null, reactionUntil: 0, lastAffinityAt: 0, command: null, commandUntil: 0, walkTarget: null },
  tactics: { enemyStrength: 0.55, enemyHostility: 1, reward: 0.35, escapeRoom: 1, ownerCommand: "autonomous" },
  scenario: "garden",
  obstacles: [],
  duel: {
    active: false, result: "idle", playerHealth: 120, playerMaxHealth: 120, nextPlayerSkillAt: 0,
    pursuit: "adaptive", playerTactic: "approach", rivalTactic: "approach",
    playerAttackUntil: 0, rivalAttackUntil: 0, playerHitUntil: 0, rivalHitUntil: 0, playerHitStartedAt: 0, rivalHitStartedAt: 0, playerStunUntil: 0, rivalStunUntil: 0,
    playerKnockback: { x: 0, y: 0 }, rivalKnockback: { x: 0, y: 0 }, pendingAttacks: [],
    playerReaction: "none", rivalReaction: "none", playerDodgeUntil: 0, rivalDodgeUntil: 0,
    playerDodgeStartsAt: 0, rivalDodgeStartsAt: 0, playerDodgeAltitude: 95, rivalDodgeAltitude: 125,
    playerAltitudeTarget: 360, rivalAltitudeTarget: 720, nextManeuverAt: 0, playerOrbit: 1, rivalOrbit: -1, openingUntil: 0,
    playerMotor: { x: 1, y: 0, speed: 260, verticalTarget: 360, mode: "search", evasionMode: "lateral" },
    rivalMotor: { x: -1, y: 0, speed: 260, verticalTarget: 720, mode: "search", evasionMode: "lateral" },
    playerLastSeen: null, rivalLastSeen: null,
    playerLockedOn: false, rivalLockedOn: false, playerTrackingUntil: 0, rivalTrackingUntil: 0,
    contactCooldownUntil: 0, playerRammingUntil: 0, rivalRammingUntil: 0,
    rival: { name: "对战伙伴", x: WORLD_W / 2 + 300, y: WORLD_H / 2 + 360, angle: Math.PI, altitude: 0, radius: 36, element: "water", health: 125, maxHealth: 125, stamina: 1, defense: 0.14, speed: 0, nextSkillAt: 0 },
  },
};

const BATTLE_PROFILES = Object.freeze({
  neutral: { health: 280, defense: 0.12, speed: 112, power: 1 }, fire: { health: 255, defense: 0.08, speed: 124, power: 1.16 },
  electric: { health: 248, defense: 0.07, speed: 138, power: 1.12 }, wood: { health: 305, defense: 0.16, speed: 98, power: 1.02 },
  earth: { health: 350, defense: 0.25, speed: 82, power: 0.96 }, water: { health: 295, defense: 0.15, speed: 104, power: 1.04 },
  wind: { health: 245, defense: 0.06, speed: 148, power: 1.08 },
});

// 这是身体适配器技能，不声称原始果蝇连接组里存在现成的人形扑击回路。
// 大脑选择追击/规避时机，双足适配器把意图翻译为蓄力弹道攻击。
const GROUND_POUNCE_SKILL = Object.freeze({
  id: "groundPounce", name: "追猎跃击", type: "melee", element: "neutral", source: "paws",
});

const SCENARIOS = {
  garden: {
    description: "食物充足、视野开阔，岩石和池塘会阻挡地面路线，但可以从空中越过。",
    background: 0x8fc6d2, floor: 0x6f9567, fog: 0.00013,
    tactics: { enemyStrength: 0.25, enemyHostility: 0.55, reward: 0.35, escapeRoom: 1, ownerCommand: "autonomous" },
    foods: [["sweet", 205, 175], ["sweet", 755, 455], ["bitter", 250, 490], ["sweet", 610, 165]],
    obstacles: [["rock", 355, 205, 38, 34], ["rock", 650, 390, 46, 42], ["pond", 490, 500, 72, 2], ["plant", 790, 230, 32, 58]],
  },
  ruins: {
    description: "残墙形成狭窄通道，地面逃跑困难；起飞可以越过矮墙，但会持续消耗体力。",
    background: 0x8aa5a7, floor: 0x72786b, fog: 0.0002,
    tactics: { enemyStrength: 0.55, enemyHostility: 0.55, reward: 0.35, escapeRoom: 0.5, ownerCommand: "autonomous" },
    foods: [["sweet", 150, 490], ["bitter", 680, 170], ["sweet", 810, 500]],
    obstacles: [["wall", 330, 190, 85, 55], ["wall", 570, 315, 105, 62], ["wall", 310, 455, 90, 48], ["rock", 760, 330, 46, 48]],
  },
  night: {
    description: "夜间能见度低，稀有食物收益更高，但强壮捕食者会从暗处逼近。",
    background: 0x101b3a, floor: 0x1e3150, fog: 0.00036,
    tactics: { enemyStrength: 0.9, enemyHostility: 1, reward: 0.8, escapeRoom: 0.5, ownerCommand: "autonomous" },
    foods: [["sweet", 170, 155], ["sweet", 820, 470], ["bitter", 530, 170]],
    obstacles: [["mushroom", 310, 370, 38, 65], ["mushroom", 690, 250, 42, 72], ["rock", 465, 490, 50, 45], ["plant", 810, 170, 30, 62]],
  },
  nest: {
    description: "敌人正在接近主人，保护收益很高；环形巢壁限制地面移动，需要在战斗和撤退间权衡。",
    background: 0x40231e, floor: 0x5a372a, fog: 0.00026,
    tactics: { enemyStrength: 0.9, enemyHostility: 1, reward: 0.8, escapeRoom: 0.08, ownerCommand: "protect" },
    foods: [["sweet", 210, 320], ["sweet", 760, 320], ["bitter", 480, 520]],
    obstacles: [["wall", 260, 150, 82, 46], ["wall", 700, 150, 82, 46], ["wall", 260, 500, 82, 46], ["wall", 700, 500, 82, 46], ["plant", 480, 120, 35, 70]],
  },
};

const toScenePosition = (point, height = 0) => new THREE.Vector3(point.x - WORLD_W / 2, height, point.y - WORLD_H / 2);
const activeOwnerTarget = () => elapsed < (world.interaction?.callUntil || 0) ? INTERACTION_RECEPTION_POINT : world.owner;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fromDesign = (x, y) => ({ x: x * WORLD_W / DESIGN_W, y: y * WORLD_H / DESIGN_H });
function randomPoint(margin = 70) {
  return { x: margin + Math.random() * (WORLD_W - margin * 2), y: margin + Math.random() * (WORLD_H - margin * 2) };
}

function awareGroundRoute(actor, desiredAngle, requestedSpeed) {
  const activeAngle = actor.navigationRouteAngle;
  if (Number.isFinite(activeAngle) && elapsed < (actor.navigationRouteUntil || 0)) {
    const continuation = probeGroundPath(actor, activeAngle, Math.max(180, Math.min(420, requestedSpeed * 0.42)), world.obstacles, GROUND_BOUNDS);
    if (!continuation.blocked) {
      return { angle: activeAngle, speedFactor: actor.navigationSpeedFactor || 0.72, avoiding: true, blocker: actor.navigationBlocker || "obstacle" };
    }
  }
  const plan = planGroundRoute(actor, desiredAngle, requestedSpeed, world.obstacles, GROUND_BOUNDS, actor.navigationSide || 1);
  if (plan.blocked) {
    actor.navigationRouteAngle = plan.angle; actor.navigationSide = plan.side;
    actor.navigationSpeedFactor = plan.speedFactor; actor.navigationBlocker = plan.blocker;
    actor.navigationRouteUntil = elapsed + 0.72 + Math.min(0.42, requestedSpeed / 2600);
    return { angle: plan.angle, speedFactor: plan.speedFactor, avoiding: true, blocker: plan.blocker };
  }
  actor.navigationRouteAngle = null; actor.navigationRouteUntil = 0; actor.navigationSpeedFactor = 1; actor.navigationBlocker = null;
  return { angle: desiredAngle, speedFactor: 1, avoiding: false, blocker: null };
}

function chooseWanderTarget(creature) {
  const turnBias = (Math.random() - 0.5) * (creature.flying ? 2.3 : 2.7);
  const range = creature.flying ? 360 + Math.random() * 420 : 150 + Math.random() * 230;
  const heading = creature.angle + turnBias;
  wanderTarget = {
    x: THREE.MathUtils.clamp(creature.x + Math.cos(heading) * range, 80, WORLD_W - 80),
    y: THREE.MathUtils.clamp(creature.y + Math.sin(heading) * range, 80, WORLD_H - 80),
  };
  wanderUntil = elapsed + (creature.flying ? 1.25 + Math.random() * 1.35 : 2.2 + Math.random() * 2.1);
}

function autonomousSteering(creature) {
  if (elapsed >= wanderUntil || distance(creature, wanderTarget) < (creature.flying ? 110 : 55)) chooseWanderTarget(creature);
  const bearing = Math.atan2(wanderTarget.y - creature.y, wanderTarget.x - creature.x);
  const gain = creature.flying ? 1.45 : 2.35;
  const maximum = creature.flying ? 1.32 : 1.9;
  return THREE.MathUtils.clamp(angleDelta(bearing, creature.angle) * gain, -maximum, maximum);
}

function standardMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.02, ...options });
}

function cylinderBetween(a, b, radius, color) {
  const direction = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), standardMaterial(color));
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function updateBeamSegment(mesh, a, b) {
  const direction = b.clone().sub(a), length = Math.max(0.01, direction.length());
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.y = length;
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}

function createFoodMesh(kind) {
  const group = new THREE.Group();
  const fruitColor = kind === "sweet" ? 0xd7f879 : 0xb993ff;
  const fruit = new THREE.Mesh(new THREE.SphereGeometry(11, 20, 14), standardMaterial(fruitColor, { emissive: fruitColor, emissiveIntensity: 0.12 }));
  fruit.scale.set(1, 0.9, 1); fruit.position.y = 12; fruit.castShadow = true; group.add(fruit);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 8, 8), standardMaterial(0x405c37));
  stem.position.set(0, 23, 0); stem.rotation.z = -0.18; group.add(stem);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(4.3, 12, 7), standardMaterial(0x75bb72));
  leaf.scale.set(1.8, 0.25, 0.8); leaf.position.set(5, 25, 0); leaf.rotation.z = -0.3; group.add(leaf);
  const halo = new THREE.Mesh(new THREE.RingGeometry(16, 22, 40), new THREE.MeshBasicMaterial({ color: fruitColor, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 1; group.add(halo);
  return group;
}

function addFood(kind, position = randomPoint()) {
  const food = { ...position, kind, pulse: Math.random() * Math.PI * 2, mesh: null };
  if (scene) { food.mesh = createFoodMesh(kind); food.mesh.position.copy(toScenePosition(food)); scene.add(food.mesh); }
  world.foods.push(food);
}

function removeFood(food) {
  if (food.mesh) scene.remove(food.mesh);
  world.foods.splice(world.foods.indexOf(food), 1);
}

function createEnemyRoster() {
  const specs = [
    ["ember", "火翅侦察者", 0, "fire", 0.25, 0.35, 68, 0.04],
    ["moss", "苔甲采集者", 0, "wood", 0.42, 0.18, 96, 0.16],
    ["gale", "风行游猎者", 0, "wind", 0.55, 0.62, 82, 0.08],
    ["volt", "电弧守卫", 1, "electric", 0.66, 0.78, 118, 0.2],
    ["crag", "岩甲巨兽", 1, "earth", 0.9, 0.9, 175, 0.38],
    ["brook", "水雾潜行者", 1, "water", 0.48, 0.5, 105, 0.13],
  ];
  return specs.map(([id, name, caveId, element, strength, hostility, maxHealth, defense], index) => {
    const cave = world.caves[caveId], angle = index * 1.7;
    return {
      id, name, caveId, element, strength, hostility, maxHealth, health: maxHealth, defense,
      radius: 17 + strength * 15, altitude: 0,
      x: cave.x + Math.cos(angle) * 65, y: cave.y + Math.sin(angle) * 65, vx: 0, vy: 0,
      state: "patrol", stateUntil: elapsed + 9 + index * 2.4, patrolTarget: randomPoint(110), defeated: false, contactCooldown: 0,
    };
  });
}

function updateHud() {
  ui.score.textContent = String(world.score).padStart(2, "0");
  ui.hunger.textContent = `${Math.round(world.creature.hunger * 100)}%`;
  if (!memory) return;
  const values = { affinity: memory.affinity, fear: memory.fear, skill: memory.attackSkill, attack: lastDecision.attackDrive };
  Object.entries(values).forEach(([key, value]) => {
    ui[key].value = value;
    ui[`${key}Value`].textContent = `${Math.round(value * 100)}%`;
  });
  ui.relationship.textContent = memory.relationshipLabel();
  ui.winChance.textContent = `${Math.round(lastDecision.winChance * 100)}%`;
  ui.escapeChance.textContent = `${Math.round(lastDecision.escapeChance * 100)}%`;
  ui.health.textContent = `${Math.round(world.creature.health * 100)}%`;
  ui.stamina.textContent = `${Math.round(world.creature.stamina * 100)}%`;
  const motionLabels = { grounded: "地面疾行", "taking-off": "正在起飞", flying: "空中飞行", landing: "正在降落" };
  if (isGroundBodyType(playerBodyType)) {
    const clipLabels = { idle: "待机", walk: "前进走路", run: "前进跑步", backpedal: "后撤步", "strafe-left": "左侧步", "strafe-right": "右侧步", charge: "屈膝蓄力", jump: "跳跃收腿", dodge: "侧步闪避", pounce: "跳扑", attack: "技能动作", throw: "跨步投掷" };
    const tierLabels = { idle: "静止", walk: "步行", run: "跑动", "fast-run": "快跑", sprint: "冲刺", "dodge-burst": "瞬发闪避" };
    ui.motion.textContent = `自主速度·${tierLabels[world.creature.speedTier] || "连续调速"}·${clipLabels[world.creature.animationState] || "待机"}·膝${Math.round(creatureMesh?.userData?.minimumKneeFlex || 0)}–${Math.round(creatureMesh?.userData?.maximumKneeFlex || 0)}°`;
  } else ui.motion.textContent = motionLabels[world.creature.flightPhase];
  ui.altitude.textContent = `${Math.round(world.creature.altitude)}m`;
  ui.speed.textContent = `${Math.round(world.creature.actualSpeed ?? world.creature.speed)} u/s 实际位移`;
  if (world.duel.active) {
    const rival = world.duel.rival;
    ui.target.textContent = `对战：${ELEMENTS[rival.element].label}·${rival.name} HP ${Math.max(0, Math.round(rival.health / rival.maxHealth * 100))}%`;
  } else if (["searching", "tracking", "approaching", "sniffing", "tasting", "eating"].includes(world.creature.forageState)) {
    const forageLabels = { searching: "搜索食物气味", tracking: "循气味追踪食物", approaching: "减速接近食物", sniffing: "近距离嗅闻", tasting: "甜苦味判定", eating: "正在进食" };
    const targetKind = world.creature.forageTarget?.kind === "bitter" ? "未知气味果实" : "食物气味源";
    ui.target.textContent = `${forageLabels[world.creature.forageState]} · ${targetKind}`;
  } else if (world.threat?.name) {
    const hp = Math.round(world.threat.health / world.threat.maxHealth * 100);
    const states = { patrol: "巡逻", return: "返巢", rest: "洞穴休息" };
    ui.target.textContent = `${ELEMENTS[world.threat.element].label}·${world.threat.name} ${states[world.threat.state]} HP ${hp}%`;
    const enemySelect = document.querySelector("#enemyElement");
    if (enemySelect && document.activeElement !== enemySelect) enemySelect.value = world.threat.element;
  }
  const patrolCount = world.enemies.filter((enemy) => enemy.state === "patrol").length;
  const restCount = world.enemies.filter((enemy) => enemy.state === "rest").length;
  const summary = document.querySelector("#enemySummary");
  if (summary) summary.textContent = `${world.enemies.length}名敌人 · ${patrolCount}巡逻 · ${restCount}休息 · 2座洞穴`;
  const forageReasons = {
    searching: "饥饿提高食物优先级，正在扩大搜索范围等待左右嗅觉通道形成方向差。",
    tracking: "嗅觉通道已经锁定气味源，身体适配器持续绕障接近。",
    approaching: "已经接近气味源，主动降低速度，避免高速冲过食物。",
    sniffing: "抵达食物旁，先停步嗅闻；此时尚未把气味直接当成可食用结论。",
    tasting: "甜味与苦味回路正在竞争，MN9 达到阈值才会吞食。",
    eating: "甜味确认且进食输出持续超过阈值，正在完成吞食动作。",
  };
  ui.decisionReason.textContent = forageReasons[world.creature.forageState] || lastDecision.reason || "尚未发现需要判断的敌人。";
}

function saveMemory() {
  if (!developerPreview.active) try { localStorage.setItem("digitalFlyCompanionMemoryV2", JSON.stringify(memory.snapshot())); } catch {}
  saveCollection();
  updateHud();
}

function loadMemory() {
  try {
    return new CompanionLearning(collection?.active?.memory || (legacyCollectionMigration ? JSON.parse(localStorage.getItem("digitalFlyCompanionMemoryV2") || "{}") : { personality: collection?.species?.personality || "balanced" }));
  } catch {
    return new CompanionLearning();
  }
}

function saveBiology() {
  if (!developerPreview.active) try { localStorage.setItem("digitalFlyBiologyV1", JSON.stringify(biology.snapshot())); } catch {}
  saveCollection();
}

function loadBiology() {
  try {
    const saved = collection?.active?.biology || (legacyCollectionMigration ? JSON.parse(localStorage.getItem("digitalFlyBiologyV1") || "{}") : {});
    if ((saved.balanceVersion ?? 0) < 3) {
      saved.stamina = Math.max(0.8, saved.stamina ?? 1);
      saved.fatigue = Math.min(0.22, saved.fatigue ?? 0.12);
    }
    return new BiologicalState(saved);
  } catch {
    return new BiologicalState();
  }
}

function saveSkills() {
  if (!developerPreview.active) try { localStorage.setItem("digitalFlySkillsV1", JSON.stringify(skillSystem.snapshot())); } catch {}
  saveCollection();
}

function loadSkills() {
  try {
    return new SkillSystem(collection?.active?.skills || (legacyCollectionMigration ? JSON.parse(localStorage.getItem("digitalFlySkillsV1") || "{}") : {}));
  } catch {
    return new SkillSystem();
  }
}

function saveCollection() {
  if (!collection?.active || !biology || !memory || !skillSystem) return;
  Object.assign(collection.active, { biology: biology.snapshot(), memory: memory.snapshot(), skills: skillSystem.snapshot() });
  if (developerPreview.active) return;
  try { localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(collection.snapshot())); }
  catch (error) { console.warn("Collection save failed", error); collectionView?.notice("浏览器存储不可用；本次可继续玩，但刷新可能丢失进度。请检查隐私模式或存储空间。"); }
}

function loadCollection() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLECTION_STORAGE_KEY) || "null");
    legacyCollectionMigration = !saved;
    return new SpiritCollection(saved || {});
  } catch { legacyCollectionMigration = true; return new SpiritCollection(); }
}

function synchronizeSpeciesControls() {
  const species = collection.species;
  biology.element = species.element; playerBodyType = species.bodyType;
  for (const id of ["creatureElement", "duelPlayerElement"]) document.querySelector(`#${id}`).value = species.element;
  for (const id of ["playerBodyType", "worldBodyPreview"]) document.querySelector(`#${id}`).value = species.bodyType;
  document.querySelector("#playerWingStyle").disabled = isGroundBodyType(playerBodyType);
  ui.personality.value = memory.personality;
  document.querySelector("#duelPlayerPersonality").value = memory.personality;
}

function switchSpirit(id) {
  if (world.duel.active) return { ok: false, message: "当前对战结束后才能换伙伴。" };
  if (developerPreview.active) exitDeveloperPreview();
  saveCollection();
  const selected = collection.select(id); if (!selected.ok) return selected;
  legacyCollectionMigration = false;
  memory = loadMemory(); biology = loadBiology(); skillSystem = loadSkills();
  brain = new ConnectomeBrain(data, { seed: 73021 + collection.records.indexOf(collection.active) * 137 });
  applyAblations(); synchronizeSpeciesControls();
  Object.assign(world.interaction, { active: false, callUntil: 0, commandUntil: 0, command: null, walkTarget: null, reactionUntil: 0, pendingReaction: null });
  world.owner.callUntil = 0; world.tactics.ownerCommand = "autonomous";
  Object.assign(world.creature, { ...CREATURE_START, angle: -0.4, lookAngle: -0.4, moveAngle: -0.4, altitude: 0, verticalSpeed: 0, flying: false, flightPhase: "grounded", speed: 0, actualSpeed: 0, groundAction: "idle", groundActionUntil: 0, forageState: "idle", foraging: {}, forageTarget: null, navigationRouteUntil: 0, ragdollState: "active", ragdollDown: 0, ragdollControlLocked: false });
  world.duel.result = "idle"; world.duel.pendingAttacks = [];
  if (rivalMesh) rivalMesh.visible = false;
  if (duelPlayerMarker) duelPlayerMarker.visible = false;
  if (duelRivalMarker) duelRivalMarker.visible = false;
  refreshCreatureMesh(); saveCollection(); updateBiologyUI(); updateSkillUI(); updateDuelUI(); setCameraMode("follow", true);
  addLog(`现在陪伴你的是 ${collection.species.name}，Lv.${collection.active.level}。每只精灵使用独立的活动状态和后天记忆。`, "system");
  return selected;
}

function cultivateSpirit(kind) {
  if (developerPreview.active) return { ok: false, message: "这是临时开发预览；请先返回真实伙伴再培养。" };
  saveCollection();
  const result = collection.train(kind); if (!result.ok) return result;
  // Restore physiology changed by cultivation before saving it again.
  biology = new BiologicalState(collection.active.biology);
  if (["feed", "play"].includes(kind)) memory.interact(kind === "feed" ? "feed" : "pet");
  memory.affinity = Math.max(memory.affinity, collection.active.bond / 100 * 0.8);
  if (kind === "play") showCollectionReaction({ id: "celebrate", label: "陪玩训练", response: "它开心地回应你的陪伴", emoji: "✨", positive: false });
  if (kind === "feed") { world.creature.hunger = biology.hunger; showCollectionReaction({ id: "affection", label: "喂食培养", response: "饱饱的，又长大一点了", emoji: "🍎", positive: false }); }
  saveCollection(); updateBiologyUI(); updateDuelUI(); addLog(result.message, "feed"); return result;
}

function evolveSpirit() {
  if (developerPreview.active) return { ok: false, message: "开发预览可直接选任何阶段，无需进化；正式培养请返回真实伙伴。" };
  saveCollection();
  const result = collection.evolve(); if (!result.ok) return result;
  synchronizeSpeciesControls(); refreshCreatureMesh(); saveCollection(); updateSkillUI(); updateDuelUI();
  spawnSkillEffect({ id: "shell", skill: SKILLS.shell, damage: 0 }, world.creature, world.creature);
  showCollectionReaction({ id: "celebrate", label: "进化完成", response: result.message, emoji: "🌟", positive: false });
  addLog(result.message, "feed"); setCameraMode("follow", true); return result;
}

function setRivalSpecies(id) {
  const species = SPECIES_BY_ID[id]; if (!species || world.duel.active) return;
  rivalSpeciesId = id; rivalBodyType = species.bodyType; world.duel.rival.element = species.element; world.duel.rival.name = species.name;
  document.querySelector("#duelRivalElement").value = species.element;
  document.querySelector("#rivalBodyType").value = species.bodyType;
  document.querySelector("#duelRivalPersonality").value = species.personality;
  document.querySelector("#rivalWingStyle").disabled = isGroundBodyType(rivalBodyType);
  const profile = fighterProfile("rival");
  Object.assign(world.duel.rival, { health: profile.health, maxHealth: profile.health, defense: profile.defense, altitude: isGroundBodyType(rivalBodyType) ? 0 : 350 });
  refreshRivalMesh(); rivalMesh.visible = false; updateDuelUI();
}

function setupCollection() {
  collectionView = mountCollectionView(collection, {
    isBattling: () => world.duel.active, rivalId: () => rivalSpeciesId,
    onSelect: switchSpirit, onTrain: cultivateSpirit, onEvolve: evolveSpirit, onRival: setRivalSpecies,
    onPreview: previewSpirit,
    onDeveloperMode: (enabled) => { developerMode = enabled; if (!enabled && developerPreview.active) exitDeveloperPreview(); },
    onExitPreview: exitDeveloperPreview,
    onAdopt: (id) => { if (developerPreview.active) return { ok: false, message: "请先退出开发预览。" }; const result = collection.adopt(id); if (result.ok) { switchSpirit(result.record.id); saveCollection(); } return result; },
    onSave: saveCollection,
    onInteractionView: () => setCameraMode("video", true),
    onPreviewView: () => setCameraMode(developerPreview.active ? "inspect" : "follow", true),
    onBattleView: () => { if (world.duel.active) setCameraMode("combat"); },
  });
  window.addEventListener("beforeunload", saveCollection);
}

function loadActiveBody() {
  legacyCollectionMigration = false;
  memory = loadMemory(); biology = loadBiology(); skillSystem = loadSkills();
  brain = new ConnectomeBrain(data, { seed: 73021 + SPECIES.indexOf(collection.species) * 137 });
  applyAblations(); synchronizeSpeciesControls();
  Object.assign(world.interaction, { active: false, callUntil: 0, commandUntil: 0, command: null, walkTarget: null, reaction: null, reactionUntil: 0, pendingReaction: null });
  Object.assign(world.creature, { ...CREATURE_START, angle: -0.4, moveAngle: -0.4, lookAngle: -0.4, altitude: 0, verticalSpeed: 0, flying: false, flightPhase: "grounded", flightCommand: "auto", speed: 0, actualSpeed: 0, groundAction: "idle", groundActionUntil: 0, forageState: "idle", foraging: {}, forageTarget: null, ragdollState: "active", ragdollControlLocked: false, ragdollDown: 0 });
  refreshCreatureMesh(); updateBiologyUI(); updateSkillUI(); updateDuelUI(); setCameraMode("follow", true);
}

function previewSpirit(id) {
  if (!developerMode || !SPECIES_BY_ID[id]) return { ok: false, message: "请开启开发者模式后预览。" };
  if (world.duel.active) stopDuel();
  if (!developerPreview.active) saveCollection();
  developerPreview.begin(collection, createDeveloperPreviewRecord(id));
  loadActiveBody(); collectionView?.setPreview(id);
  setCameraMode("inspect", true);
  return { ok: true, message: `开发预览：${collection.species.name}。所有阶段自由查看，不解锁、不消耗资源、不写入正式存档。` };
}

function exitDeveloperPreview() {
  if (!developerPreview.active) return { ok: true, message: "当前使用真实伙伴。" };
  stopDuel(); developerPreview.end(collection); loadActiveBody(); collectionView?.setPreview(null); saveCollection();
  return { ok: true, message: "已返回真实伙伴，预览中的测试结果未写入养成存档。" };
}

function describeLearning(kind, delta) {
  const signed = (value) => `${value >= 0 ? "+" : ""}${Math.round(value * 100)}%`;
  const labels = {
    feed: `喂食产生正奖励：亲密 ${signed(delta.affinity)}，恐惧 ${signed(delta.fear)}。`,
    pet: `温和接触被记为安全经历：亲密 ${signed(delta.affinity)}，恐惧 ${signed(delta.fear)}。`,
    scare: `惊吓形成负面关联：亲密 ${signed(delta.affinity)}，恐惧 ${signed(delta.fear)}。`,
    train: `攻击动作得到训练奖励：熟练度 ${signed(delta.attackSkill)}，自信 ${signed(delta.confidence)}。`,
  };
  ui.learningExplanation.textContent = `${labels[kind]} 这些数值属于游戏扩展学习层，原始连接组没有被改写。`;
  addLog(labels[kind], kind === "scare" ? "bitter" : "stimulus");
}

const traitLabels = {
  size: "体型", strength: "力量", endurance: "耐力", metabolism: "代谢",
  vision: "视觉", smell: "嗅觉", groundSpeed: "步行速度", flightSpeed: "飞行速度",
  gluttony: "贪食倾向", patience: "耐心", sociability: "社交性",
};

function adaptedSkillSource(skill, bodyType = playerBodyType) {
  if (!isGroundBodyType(bodyType)) return skill.sourceLabel;
  if (bodyType === "cat") return ({ wing: "前爪", paws: "后足", body: "胸口核心", antenna: "耳朵与胡须感知区", mouth: "口部" })[skill.source] || skill.sourceLabel;
  return ({ wing: "手掌与前臂", paws: "双足", body: "胸口核心", antenna: "头部感知角", mouth: "口部" })[skill.source] || skill.sourceLabel;
}

function combatLoadout(element, bodyType = "aerial", key = "player") {
  const species = key === "rival" ? SPECIES_BY_ID[rivalSpeciesId] : collection?.species;
  if (species) return getSpeciesLoadout({ ...species, element }, { ground: isGroundBodyType(bodyType) });
  const registry = isGroundBodyType(bodyType) ? BIPED_ELEMENT_LOADOUTS : ELEMENT_LOADOUTS;
  return registry[element] || registry.neutral;
}

function buildSystemUI() {
  const traitGrid = document.querySelector("#traitGrid");
  traitGrid.innerHTML = Object.keys(traitLabels).map((key) => `<span>${traitLabels[key]}<b id="trait-${key}">0%</b></span>`).join("");
  const options = Object.entries(ELEMENTS).map(([id, element]) => `<option value="${id}">${element.label}</option>`).join("");
  document.querySelector("#creatureElement").innerHTML = options;
  document.querySelector("#enemyElement").innerHTML = options;
  document.querySelector("#duelPlayerElement").innerHTML = options;
  document.querySelector("#duelRivalElement").innerHTML = options;
  document.querySelector("#creatureElement").value = biology.element;
  document.querySelector("#enemyElement").value = world.threat.element;
  document.querySelector("#duelPlayerElement").value = biology.element;
  document.querySelector("#duelRivalElement").value = world.duel.rival.element;
  const typeLabels = { melee: "近战", projectile: "远程", cone: "锥形", chain: "连锁", area: "范围", buff: "防御", mark: "嗅觉追踪" };
  document.querySelector("#skillGrid").innerHTML = Object.entries(SKILLS).map(([id, skill]) => {
    const element = ELEMENTS[skill.element];
    const window = skillDistanceWindow(skill);
    const distanceLabel = skill.type === "buff" ? "自身" : window.min > 0 ? `${Math.round(window.min)}–${Math.round(window.max)}` : skill.type === "area" ? `半径 ${skill.radius}` : `0–${Math.round(window.max)}`;
    return `<article class="skill-card" data-skill-card="${id}" style="--skill-color:#${element.color.toString(16).padStart(6, "0")}">
      <header><h3>${skill.name}</h3><em style="color:var(--skill-color)">${element.label} · ${typeLabels[skill.type]}</em></header>
      <p>${skill.description}</p><small>发出部位：<span data-skill-source="${id}">${adaptedSkillSource(skill)}</span> · ${skill.requiresFacing ? "需面向目标" : "可侧向释放"} · 伤害 ${skill.damage} · 有效距离 ${distanceLabel} · 消耗 ${Math.round(skill.cost * 100)}% · 冷却 ${skill.cooldown}s · 等级 <b data-skill-level="${id}">1</b></small>
      <button type="button" data-use-skill="${id}">释放技能</button><i class="skill-cooldown" data-skill-cooldown="${id}"></i>
    </article>`;
  }).join("");
  const shortNames = { dash: "冲撞", venom: "毒液", flame: "火焰", fireBolt: "火球", starShot: "星屑", thunder: "雷弧", spark: "电针", spores: "孢子", shell: "岩壳", quake: "震荡", waterJet: "水弹", tide: "潮环", gust: "风刃", cyclone: "旋风", scentMark: "标记", palmPulse: "掌心脉冲", throwingDart: "回旋飞镖", risingStrike: "升空截击" };
  document.querySelector("#quickSkillBar").innerHTML = Object.entries(SKILLS).map(([id, skill]) => {
    const color = ELEMENTS[skill.element].color.toString(16).padStart(6, "0");
    return `<button type="button" class="quick-skill" data-use-skill="${id}" data-quick="true" data-label="${shortNames[id] || skill.name}" title="${skill.name}：${skill.description}" style="--skill-color:#${color}"><span data-quick-label>${shortNames[id] || skill.name}</span><i data-skill-cooldown="${id}"></i></button>`;
  }).join("");
  document.querySelector("#quickStopDuel").addEventListener("click", stopDuel);
  document.querySelectorAll("[data-use-skill]").forEach((button) => button.addEventListener("click", () => useSkill(button.dataset.useSkill)));
  updateBiologyUI(); updateSkillUI();
}

function updateBiologyUI() {
  if (!biology) return;
  const values = {
    Hunger: biology.hunger, Stamina: biology.stamina, Health: biology.health, Fatigue: biology.fatigue,
    Pain: biology.pain, Stress: biology.stress, Arousal: biology.arousal, Poison: biology.injuries.poison,
  };
  Object.entries(values).forEach(([key, value]) => {
    const meter = document.querySelector(`#bio${key}`), label = document.querySelector(`#bio${key}Value`);
    if (meter) meter.value = value; if (label) label.textContent = `${Math.round(value * 100)}%`;
  });
  Object.entries(biology.traits).forEach(([key, value]) => { const node = document.querySelector(`#trait-${key}`); if (node) node.textContent = `${Math.round(value * 100)}%`; });
  document.querySelector("#wingInjury").textContent = `${Math.round(biology.injuries.wing * 100)}%`;
  document.querySelector("#legInjury").textContent = `${Math.round(biology.injuries.leg * 100)}%`;
  document.querySelector("#flightCapability").textContent = biology.canFly() ? "可以正常飞行" : "飞行能力受限";
  const mods = biology.modifiers();
  document.querySelector("#biologyExplanation").textContent = isGroundBodyType(playerBodyType)
    ? `地面身体规则：大脑可在静止、步行、跑动、快跑与冲刺之间连续选速，普通移动不消耗体力；体力只解锁约 0.38 秒的瞬发闪避，疲劳、疼痛和腿伤逐渐降低可维持速度。头部可独立转向食物或敌人，不必先把全身转过去。当前疲劳 ${Math.round(biology.fatigue * 100)}%，体力 ${Math.round(biology.stamina * 100)}%，战斗倍率 ${mods.combat.toFixed(2)}。`
    : `当前影响：觅食优先级 ${Math.round(mods.foodPriority * 100)}%，嗅觉倍率 ${mods.smell.toFixed(2)}，地面运动倍率 ${mods.groundSpeed.toFixed(2)}，飞行倍率 ${mods.flightSpeed.toFixed(2)}，战斗倍率 ${mods.combat.toFixed(2)}。`;
}

function updateSkillUI() {
  if (!skillSystem) return;
  const loadout = combatLoadout(biology.element, playerBodyType);
  Object.entries(skillSystem.states).forEach(([id, state]) => {
    const skill = SKILLS[id], bars = document.querySelectorAll(`[data-skill-cooldown="${id}"]`), buttons = document.querySelectorAll(`[data-use-skill="${id}"]`), level = document.querySelector(`[data-skill-level="${id}"]`);
    document.querySelectorAll(`[data-skill-source="${id}"]`).forEach((node) => { node.textContent = adaptedSkillSource(skill); });
    document.querySelectorAll(`[data-skill-card="${id}"], [data-use-skill="${id}"][data-quick="true"]`).forEach((node) => { node.hidden = !loadout.includes(id); });
    bars.forEach((bar) => { bar.style.width = `${state.cooldown / skill.cooldown * 100}%`; });
    if (level) level.textContent = state.level;
    buttons.forEach((button) => {
      button.disabled = !loadout.includes(id) || state.cooldown > 0 || biology.stamina < skill.cost;
      const text = state.cooldown > 0 ? `${state.cooldown.toFixed(1)}s` : (button.dataset.quick ? button.dataset.label : "释放技能");
      if (button.dataset.quick) button.querySelector("[data-quick-label]").textContent = text;
      else button.textContent = text;
    });
  });
}

function combatTarget() {
  return world.duel.active ? world.duel.rival : world.threat;
}

const DUEL_SKILL_BEHAVIOR = Object.freeze({
  dash: { speed: 980, hitRadius: 108, reaction: "tumble" }, venom: { speed: 440, hitRadius: 150, reaction: "poison" },
  // 轻型弹丸应快于常规追逐速度，但仍留出反应时间；避免高速地面目标几乎永远跑出弹道。
  fireBolt: { speed: 1600, hitRadius: 175, reaction: "burn" }, starShot: { speed: 1500, hitRadius: 155, reaction: "recoil" },
  flame: { speed: 470, hitRadius: 185, reaction: "burn" }, thunder: { speed: 610, hitRadius: 195, reaction: "shock" },
  spark: { speed: 760, hitRadius: 132, reaction: "shock" }, spores: { speed: 700, hitRadius: 245, reaction: "poison" },
  quake: { speed: 650, hitRadius: 270, reaction: "launch" }, waterJet: { speed: 560, hitRadius: 150, reaction: "recoil" },
  tide: { speed: 650, hitRadius: 260, reaction: "launch" }, gust: { speed: 690, hitRadius: 140, reaction: "spin" },
  cyclone: { speed: 620, hitRadius: 290, reaction: "spin" }, scentMark: { speed: 820, hitRadius: 420, reaction: "marked" },
  palmPulse: { speed: 940, hitRadius: 138, reaction: "recoil" }, throwingDart: { speed: 1080, hitRadius: 122, reaction: "spin" }, risingStrike: { speed: 1050, hitRadius: 125, reaction: "launch" },
});

function distance3D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.altitude || 0) - (b.altitude || 0));
}

function baseCombatVisionRange(key) {
  if (key === "player") return 690 + (biology?.traits.vision || 0.6) * 480;
  const profile = profileFor(world.duel.rival.element);
  return 720 + Math.min(1, profile.speed / 150) * 260;
}

function combatVisionRange(key) {
  const trackingUntil = world.duel[`${key}TrackingUntil`] || 0;
  return trackingUntil > elapsed ? Math.hypot(WORLD_W, WORLD_H) : baseCombatVisionRange(key);
}

function visuallySeesTarget(key, actor, target) {
  if (distance3D(actor, target) > baseCombatVisionRange(key)) return false;
  const physicalHead = actor.angle + THREE.MathUtils.clamp(angleDelta(actor.lookAngle ?? actor.angle, actor.angle), -0.58, 0.58);
  const bearing = Math.atan2(target.y - actor.y, target.x - actor.x);
  // Compound eyes remain very wide; the articulated head mainly reduces the
  // narrow rear blind sector and stabilizes gaze during banked turns.
  return Math.abs(angleDelta(bearing, physicalHead)) < 2.7;
}

function combatSenseSeesTarget(key, actor, target) {
  return world.duel[`${key}TrackingUntil`] > elapsed || visuallySeesTarget(key, actor, target);
}

function preferredCombatRange(element, bodyType = "aerial", key = "player") {
  const offensive = combatLoadout(element, bodyType, key).map((id) => SKILLS[id]).filter((skill) => !["buff", "melee", "mark"].includes(skill.type));
  const longest = Math.max(0, ...offensive.map((skill) => skill.type === "area" ? skill.radius : skill.range));
  return THREE.MathUtils.clamp(longest * 0.86, 320, 760);
}

function pointToFlightPathDistance(point, start, end) {
  const ab = { x: end.x - start.x, y: end.y - start.y, z: (end.altitude || 0) - (start.altitude || 0) };
  const ap = { x: point.x - start.x, y: point.y - start.y, z: (point.altitude || 0) - (start.altitude || 0) };
  const lengthSquared = ab.x ** 2 + ab.y ** 2 + ab.z ** 2 || 1;
  const t = THREE.MathUtils.clamp((ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / lengthSquared, 0, 1);
  return Math.hypot(ap.x - ab.x * t, ap.y - ab.y * t, ap.z - ab.z * t);
}

function anatomicalSkillOrigin(actor, source = "body", skillId = "") {
  const visual = actor === world.creature ? creatureMesh : actor === world.duel.rival ? rivalMesh : null;
  if (visual?.userData.assetHeadBone && ["mouth", "antenna"].includes(source)) {
    visual.updateMatrixWorld(true);
    const point = visual.userData.assetHeadBone.getWorldPosition(new THREE.Vector3());
    const heading = actor.angle + THREE.MathUtils.clamp(angleDelta(actor.lookAngle ?? actor.angle, actor.angle), -0.58, 0.58);
    const reach = (visual.userData.artHeight || 100) * visual.scale.y * 0.13;
    point.x += Math.cos(heading) * reach; point.z += Math.sin(heading) * reach;
    if (source === "antenna") point.y += reach * 0.7;
    return point;
  }
  const side = (skillId.length + Math.floor(elapsed * 3)) % 2 ? 1 : -1;
  if (visual?.userData.assetVisual && ["wing", "paws", "body"].includes(source)) {
    const suffix = side > 0 ? "R" : "L";
    const boneNames = source === "wing"
      ? [`Middle1${suffix}`, `LowerArm${suffix}`, `Wing2${suffix}`, `FrontLowerLeg${suffix}`]
      : source === "paws" ? [`Foot${suffix}`, `FrontLowerLeg${suffix}`, `LowerLeg${suffix}`] : ["Torso", "Body"];
    const bone = boneNames.map((name) => visual.userData.assetVisual.getObjectByName(name)).find(Boolean);
    if (bone) { visual.updateMatrixWorld(true); return bone.getWorldPosition(new THREE.Vector3()); }
  }
  const aerialOffsets = {
    mouth: new THREE.Vector3(49, 30, 0), antenna: new THREE.Vector3(43, 61, side * 10),
    wing: new THREE.Vector3(-8, 44, side * 22), paws: new THREE.Vector3(10, 7, side * 13),
    body: new THREE.Vector3(0, 30, 0),
  };
  const bipedOffsets = {
    mouth: new THREE.Vector3(24, 112, 0), antenna: new THREE.Vector3(17, 126, side * 7),
    wing: new THREE.Vector3(40, 84, side * 8), paws: new THREE.Vector3(18, 7, side * 8),
    body: new THREE.Vector3(8, 77, 0),
  };
  const actorBodyType = actor === world.creature ? playerBodyType : actor === world.duel.rival ? rivalBodyType : "aerial";
  const corgiOffsets = {
    mouth: new THREE.Vector3(48, 98, 0), antenna: new THREE.Vector3(31, 119, side * 10),
    wing: new THREE.Vector3(18, 76, side * 18), paws: new THREE.Vector3(24, 60, side * 20),
    body: new THREE.Vector3(7, 60, 0),
  };
  const catOffsets = {
    mouth: new THREE.Vector3(63, 66, 0), antenna: new THREE.Vector3(54, 78, side * 13),
    wing: new THREE.Vector3(31, 25, side * 17), paws: new THREE.Vector3(-17, 13, side * 17),
    body: new THREE.Vector3(9, 45, 0),
  };
  const offsets = actorBodyType === "corgi" ? corgiOffsets : actorBodyType === "cat" ? catOffsets : isGroundBodyType(actorBodyType) ? bipedOffsets : aerialOffsets;
  const offset = (offsets[source] || offsets.body).clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -(actor.angle || 0));
  return toScenePosition(actor, actor.altitude || 0).add(offset);
}

function skillVisualHeight(entity) {
  const mesh = entity === world.creature ? creatureMesh : entity === world.duel.rival ? rivalMesh : null;
  const height = mesh?.userData.artHeight;
  return Number.isFinite(height) ? height * mesh.scale.y : entity.visualHeight || 48;
}

function skillTargetPoint(entity) {
  return toScenePosition(entity, (entity.altitude || 0) + skillVisualHeight(entity) * 0.55);
}

function spawnSkillEffect(result, actor = world.creature, target = combatTarget(), delay = 0) {
  const color = ELEMENTS[result.skill.element].color;
  const start = anatomicalSkillOrigin(actor, result.skill.source, result.id), end = skillTargetPoint(target);
  let mesh, mover = null, dynamicLine = null, continuousRays = null;
  if (["projectile", "mark"].includes(result.effectType)) {
    mesh = new THREE.Group();
    dynamicLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, start]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 })); mesh.add(dynamicLine);
    const projectileGeometry = result.id === "scentMark" ? new THREE.IcosahedronGeometry(10, 1)
      : ["spark", "starShot"].includes(result.id) ? new THREE.OctahedronGeometry(result.id === "starShot" ? 12 : 6, 0)
        : result.id === "throwingDart" ? new THREE.OctahedronGeometry(10, 0)
      : result.id === "gust" ? new THREE.TorusGeometry(9, 2.2, 8, 22, Math.PI * 1.25)
        : result.id === "waterJet" ? new THREE.CapsuleGeometry(4.5, 19, 6, 12)
          : new THREE.SphereGeometry(result.id === "fireBolt" ? 15 : result.id === "venom" ? 9 : 7, 18, 12);
    mover = new THREE.Mesh(projectileGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    if (result.id === "waterJet") mover.rotation.z = Math.PI / 2;
    if (result.id === "throwingDart") mover.scale.set(1.7, 0.28, 0.72);
    dynamicLine.visible = false; // Detached projectiles have short particle trails, not a tether to the caster.
    mover.position.copy(start); mesh.add(mover);
  } else if (result.effectType === "cone") {
    mesh = new THREE.Group();
    continuousRays = [];
    for (let i = -2; i <= 2; i += 1) {
      const offset = new THREE.Vector3(0, i * 7, i * 5), flameEnd = end.clone().add(offset);
      const radius = 3.5 + (2 - Math.abs(i)) * 1.8;
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 8), standardMaterial(i % 2 ? 0xffb14d : color));
      updateBeamSegment(ray, start, flameEnd);
      ray.material.transparent = true; ray.material.opacity = 0.55; mesh.add(ray);
      continuousRays.push({ mesh: ray, offset });
    }
  } else if (result.effectType === "chain") {
    const points = [];
    for (let i = 0; i <= 9; i += 1) {
      const t = i / 9, point = start.clone().lerp(end, t);
      if (i > 0 && i < 9) { point.y += (i % 2 ? 13 : -9); point.z += (i % 3 - 1) * 10; }
      points.push(point);
    }
    mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  } else if (result.effectType === "melee") {
    dynamicLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    mesh = dynamicLine;
  } else if (result.effectType === "area") {
    mesh = new THREE.Group();
    const ringCount = result.id === "cyclone" ? 4 : 3;
    for (let i = 0; i < ringCount; i += 1) {
      const outer = result.skill.radius * (0.48 + i * 0.18);
      const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(12, outer - 7), outer, 48), new THREE.MeshBasicMaterial({ color: i % 2 ? color : 0xffffff, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = result.id === "cyclone" ? Math.PI / 2 + i * 0.32 : -Math.PI / 2;
      ring.position.y = result.id === "cyclone" ? i * 18 : i * 3; mesh.add(ring);
    }
    mesh.position.copy(start);
  } else {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(43, 24, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.24, wireframe: true, depthWrite: false }));
    mesh.position.copy(start);
  }
  mesh.traverse((child) => { if (child.material) { child.material.transparent = true; child.material.opacity = child.material.opacity || 0.7; } });
  const durations = { melee: 1.3, projectile: 1.8, mark: 2, cone: 2.1, chain: 2.3, area: 2.6, buff: 3.5 };
  const duration = result.visualDuration || durations[result.effectType] || 2;
  mesh.visible = delay <= 0;
  const stage = actor === world.duel.rival ? SPECIES_BY_ID[rivalSpeciesId]?.stage || 0 : collection?.species?.stage || 0;
  const decorate = decorateSkillEffect(mesh, { mover, skillId: result.id, stage, lowQuality: renderProfile?.id === "software" });
  addActiveSkillEffect({ mesh, mover, dynamicLine, continuousRays, decorate, start, actor, target, source: result.skill.source, type: result.effectType, id: result.id, expires: elapsed + delay + duration, born: elapsed + delay });
}

function queueDuelAttack(attackerKey, result) {
  const duel = world.duel, defenderKey = attackerKey === "player" ? "rival" : "player";
  // A committed cast counts as active pressure even if it is later dodged.
  duel.lastPressureAt = elapsed;
  if (result.damage > 0) duel[`${attackerKey}LastDamageCastAt`] = elapsed;
  const attacker = attackerKey === "player" ? world.creature : duel.rival;
  const defender = defenderKey === "player" ? world.creature : duel.rival;
  const behavior = DUEL_SKILL_BEHAVIOR[result.id] || getSkillVisual(result.id);
  const combatState = duel[`${attackerKey}CombatState`];
  if (combatState) {
    combatState.shots += 1;
    if (result.skill.type !== "melee") combatState.repositionUntil = Math.max(combatState.repositionUntil, elapsed + 1.25 + Math.random() * 1.45);
  }
  const range = distance3D(attacker, defender);
  const travel = result.skill.type === "melee" ? 0.2 : result.skill.type === "area" ? 0.3 : Math.max(0.28, range / behavior.speed);
  const releaseDelay = result.skill.gesture === "throw" ? 0.42 : 0;
  const lead = ["projectile", "cone", "mark"].includes(result.skill.type) ? travel * 0.78 : 0;
  const moveAngle = defender.moveAngle ?? defender.angle;
  const aim = {
    x: THREE.MathUtils.clamp(defender.x + Math.cos(moveAngle) * (defender.speed || 0) * lead, 30, WORLD_W - 30),
    y: THREE.MathUtils.clamp(defender.y + Math.sin(moveAngle) * (defender.speed || 0) * lead, 30, WORLD_H - 30),
    altitude: THREE.MathUtils.clamp((defender.altitude || 0) + (defender.verticalSpeed || 0) * lead * 0.3, 50, MAX_FLIGHT_ALTITUDE),
    visualHeight: skillVisualHeight(defender),
  };
  result.visualDuration = travel;
  // 弹丸保留发射瞬间的轨迹；持续喷射类技能的两端则在存续期间跟随双方移动。
  const visualTarget = result.skill.type === "area" ? attacker : result.skill.type === "cone" ? defender : aim;
  spawnSkillEffect(result, attacker, visualTarget, releaseDelay);
  const origin = { x: attacker.x, y: attacker.y, altitude: attacker.altitude || 0 };
  duel.pendingAttacks.push({ attackerKey, defenderKey, result, behavior, origin, aim, resolvesAt: elapsed + releaseDelay + travel, launchedAt: elapsed + releaseDelay });
  const castingTime = result.skill.gesture === "throw" ? 0.92 : result.skill.type === "cone" ? Math.min(1.35, travel + 0.22)
    : result.skill.requiresFacing ? Math.min(0.8, travel + 0.18) : Math.min(0.55, travel + 0.12);
  duel[`${attackerKey}AttackUntil`] = elapsed + castingTime;
  duel[`${attackerKey}AttackStartedAt`] = elapsed;
  duel[`${attackerKey}ActiveSkillId`] = result.id;
  duel[`${attackerKey}PlannedSkillId`] = null;
  if (result.skill.type === "melee") duel[`${attackerKey}RammingUntil`] = elapsed + travel + 0.35;
  const attackerBodyType = attackerKey === "player" ? playerBodyType : rivalBodyType;
  const sourceLabel = adaptedSkillSource(result.skill, attackerBodyType);
  addLog(`${attackerKey === "player" ? "我方" : "对手"}用${sourceLabel}释放${result.skill.name}${result.skill.gesture === "throw" ? "，完成跨步、转髋、抬肘、甩臂与随挥" : result.skill.requiresFacing ? "，身体正在转向瞄准" : isGroundBodyType(attackerBodyType) ? "，跑动中保持手臂施法" : "，保持当前飞行姿态"}；对方会根据实时弹道闪避。`, attackerKey === "player" ? "stimulus" : "bitter");
}

function spawnScentAura(target, duration) {
  const mesh = new THREE.Group();
  for (let i = 0; i < 12; i += 1) {
    const mote = new THREE.Mesh(new THREE.SphereGeometry(2.5 + i % 3, 9, 7), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x9dff9a : 0xf4d96a, transparent: true, opacity: 0.62, depthWrite: false }));
    const angle = i / 12 * Math.PI * 2; mote.position.set(Math.cos(angle) * (32 + i % 4 * 6), (i % 5 - 2) * 9, Math.sin(angle) * (32 + i % 4 * 6)); mesh.add(mote);
  }
  addActiveSkillEffect({ mesh, actor: target, target, type: "scentAura", expires: elapsed + duration, born: elapsed });
}

function resolveDuelAttacks() {
  const duel = world.duel;
  duel.pendingAttacks = duel.pendingAttacks.filter((attack) => {
    if (elapsed < attack.resolvesAt) return true;
    if (!duel.active) return false;
    const attacker = attack.attackerKey === "player" ? world.creature : duel.rival;
    const defender = attack.defenderKey === "player" ? world.creature : duel.rival;
    const { result, behavior } = attack;
    let missDistance = ["projectile", "cone", "chain", "mark"].includes(result.skill.type)
      ? pointToFlightPathDistance(defender, attack.origin, attack.aim)
      : distance3D(defender, attack.aim);
    if (result.skill.type === "melee") missDistance = distance3D(attacker, defender) - result.skill.range;
    if (result.skill.type === "area") missDistance = distance3D(attacker, defender) - result.skill.radius;
    if (result.skill.type === "chain") missDistance *= 0.42;
    const hit = missDistance <= behavior.hitRadius;
    if (hit) {
      if (result.skill.type === "mark") {
        const smell = attack.attackerKey === "player" ? (biology.traits.smell || 0.6) : 0.66;
        const trackingDuration = result.skill.duration * (0.78 + smell * 0.42);
        duel[`${attack.attackerKey}TrackingUntil`] = elapsed + trackingDuration;
        duel[`${attack.attackerKey}LockedOn`] = true;
        const combatState = duel[`${attack.attackerKey}CombatState`];
        if (combatState) {
          combatState.hits += 1;
          combatState.withdrawUntil = elapsed + 2.2 + Math.random() * 1.8;
          combatState.nextWaypointAt = 0;
        }
        spawnScentAura(defender, trackingDuration);
        addLog(`${attack.attackerKey === "player" ? "我方" : "对手"}的气味标记命中；嗅觉将在 ${trackingDuration.toFixed(1)} 秒内跨越整张地图持续追踪。`, attack.attackerKey === "player" ? "stimulus" : "bitter");
        return false;
      }
      const system = attack.defenderKey === "player" ? skillSystem : rivalSkillSystem;
      const defense = Math.min(0.75, fighterProfile(attack.defenderKey).defense + (system?.shield > 0 ? 0.3 : 0));
      const dealt = result.damage * (1 - defense);
      const attackerState = duel[`${attack.attackerKey}CombatState`];
      if (attackerState) attackerState.hits += 1;
      if (attack.defenderKey === "player") duel.playerHealth -= dealt; else defender.health -= dealt;
      if (attack.defenderKey === "player" && ["projectile", "cone", "chain"].includes(result.skill.type)) {
        memory.reinforceEvasion(false, duel.playerMotor?.evasionMode || "lateral"); saveMemory();
      }
      registerDuelHit(attack.attackerKey, dealt, result.skill, behavior.reaction);
      addLog(`${result.skill.name}命中：${attack.defenderKey === "player" ? "我方" : "对手"}受到${behavior.reaction === "shock" ? "电击痉挛" : behavior.reaction === "launch" ? "掀飞" : behavior.reaction === "spin" ? "旋转失衡" : behavior.reaction === "burn" ? "灼烧退缩" : "冲击"}，损失 ${dealt.toFixed(1)} HP。`, attack.attackerKey === "player" ? "stimulus" : "bitter");
      if (duel.playerHealth <= 0) finishDuel("rival");
      else if (duel.rival.health <= 0) finishDuel("player");
    } else {
      const defenderState = duel[`${attack.defenderKey}CombatState`];
      if (defenderState) defenderState.evades += 1;
      const grazed = result.damage > 0 && result.skill.type !== "melee" && missDistance <= behavior.hitRadius * 2.05;
      if (grazed) {
        const system = attack.defenderKey === "player" ? skillSystem : rivalSkillSystem;
        const defense = Math.min(0.75, fighterProfile(attack.defenderKey).defense + (system?.shield > 0 ? 0.3 : 0));
        const dealt = result.damage * 0.22 * (1 - defense);
        if (attack.defenderKey === "player") duel.playerHealth -= dealt; else defender.health -= dealt;
        addLog(`${attack.defenderKey === "player" ? "我方" : "对手"}避开了${result.skill.name}核心，但被属性余波擦中，损失 ${dealt.toFixed(1)} HP。`, "bitter");
        if (duel.playerHealth <= 0) finishDuel("rival"); else if (duel.rival.health <= 0) finishDuel("player");
        return false;
      }
      if (attack.defenderKey === "player" && ["projectile", "cone", "chain"].includes(result.skill.type)) {
        memory.reinforceEvasion(true, duel.playerMotor?.evasionMode || "lateral"); saveMemory();
      }
      addLog(`${attack.defenderKey === "player" ? "我方" : "对手"}改变航线，闪过了${result.skill.name}（偏离 ${Math.max(0, missDistance).toFixed(0)}）。`, "feed");
    }
    return false;
  });
}

function prepareAimedSkill(key, id) {
  const duel = world.duel, skill = SKILLS[id];
  if (!duel.active || !skill?.requiresFacing) return true;
  const actor = key === "player" ? world.creature : duel.rival;
  const target = key === "player" ? duel.rival : world.creature;
  const targetAngle = Math.atan2(target.y - actor.y, target.x - actor.x);
  if (Math.abs(angleDelta(targetAngle, actor.angle)) <= 0.24) {
    duel[`${key}AimingSkillId`] = null;
    return true;
  }
  if (duel[`${key}AimingSkillId`] !== id) addLog(`${key === "player" ? "我方" : "对手"}准备从${key === "player" ? adaptedSkillSource(skill) : skill.sourceLabel}释放${skill.name}，先调整身体朝向。`, key === "player" ? "stimulus" : "bitter");
  if (duel[`${key}AimingSkillId`] !== id) duel[`${key}AttackStartedAt`] = elapsed;
  duel[`${key}AimingSkillId`] = id;
  duel[`${key}ActiveSkillId`] = id;
  duel[`${key}AttackUntil`] = elapsed + 0.32;
  return false;
}

function useSkill(id) {
  const target = combatTarget();
  if (!combatLoadout(biology.element, playerBodyType).includes(id)) { addLog(`${SKILLS[id].name}不属于当前${ELEMENTS[biology.element].label}属性技能组。`, "bitter"); return; }
  if (!prepareAimedSkill("player", id)) { world.duel.nextPlayerSkillAt = elapsed + 0.12; return; }
  const actor = { spendStamina: (amount) => biology.spendStamina(amount), modifiers: () => ({ ...biology.modifiers(), combat: biology.modifiers().combat * (collection?.stats().attack || 1) }) };
  const result = skillSystem.activate(id, { actor, distance: world.duel.active ? distance3D(world.creature, target) : distance(world.creature, target), targetElement: target.element });
  if (!result.ok) { addLog(`${SKILLS[id].name}未释放：${result.reason}。`, "bitter"); updateSkillUI(); return; }
  if (result.skill.type === "buff") {
    spawnSkillEffect(result, world.creature, world.creature);
    if (world.duel.active) { world.duel.playerAttackStartedAt = elapsed; world.duel.playerAttackUntil = elapsed + 0.5; world.duel.playerActiveSkillId = result.id; }
    addLog(`${result.skill.name}生效：我方进入防御姿态，没有让对手产生虚假的受击反应。`, "stimulus");
    saveBiology(biology); updateBiologyUI(); updateSkillUI(); updateDuelUI();
    return;
  }
  if (world.duel.active) {
    queueDuelAttack("player", result);
    saveBiology(); saveSkills(); updateBiologyUI(); updateSkillUI(); updateDuelUI();
    return;
  }
  spawnSkillEffect(result, world.creature, target);
  const shieldDefense = world.duel.active && rivalSkillSystem?.shield > 0 ? 0.3 : 0;
  const dealt = result.damage * (1 - Math.min(0.75, target.defense + shieldDefense));
  if (dealt > 0) target.health -= dealt;
  if (world.duel.active) registerDuelHit("player", dealt, result.skill);
  const multiplierText = result.multiplier > 1.05 ? "属性克制" : result.multiplier < 0.95 ? "属性抵抗" : "普通效果";
  addLog(`${result.skill.name}命中 ${target.name}，造成 ${dealt.toFixed(1)} 伤害（${multiplierText} ×${result.multiplier.toFixed(2)}）。`, "stimulus");
  document.querySelector("#elementHint").textContent = `${ELEMENTS[result.skill.element].label} 对 ${ELEMENTS[target.element].label}：×${result.multiplier.toFixed(2)}`;
  if (world.duel.active) {
    if (target.health <= 0) finishDuel("player");
  } else if (world.threat.health <= 0) {
    world.score += 3; world.threat.health = 1; world.threat.defeated = true; world.threat.state = "return";
    addLog(`${world.threat.name}失去战斗能力，正在撤回洞穴恢复，不会瞬间消失。`, "feed");
  }
  saveBiology(); saveSkills();
  updateBiologyUI(); updateSkillUI(); updateDuelUI();
}

function profileFor(element) {
  return BATTLE_PROFILES[element] || BATTLE_PROFILES.neutral;
}

function fighterProfile(key) {
  const species = key === "player" ? collection?.species : SPECIES_BY_ID[rivalSpeciesId];
  const element = key === "player" ? biology?.element : world.duel.rival.element;
  const fallback = profileFor(element);
  if (!species || !collection) return fallback;
  const record = key === "player" ? collection.active : { speciesId: species.id, level: Math.max(1, Math.min(30, collection.active.level + species.stage - collection.species.stage)), training: {} };
  const stats = collection.stats(record);
  return { health: stats.health, defense: stats.defense, speed: Math.min(155, stats.speed), power: stats.attack };
}

function skillNames(element, bodyType = "aerial", key = "player") {
  return combatLoadout(element, bodyType, key).map((id) => SKILLS[id].name).join(" · ");
}

function updateDuelUI() {
  const duel = world.duel, rival = duel.rival;
  const playerType = ELEMENTS[biology?.element || "neutral"], rivalType = ELEMENTS[rival.element];
  document.querySelector("#duelPlayerType").textContent = playerType.label;
  const fighterName = (bodyType, owner) => bodyType === "corgi" ? `${owner}软肚短腿小柯基` : bodyType === "cat" ? `${owner}四足软萌小猫` : bodyType === "biped" ? `${owner}瘦高关节迅影兽` : `${owner}飞行绒团萤翼兽`;
  document.querySelector("#duelPlayerName").textContent = collection ? `${collection.active.nickname || collection.species.name} · Lv.${collection.active.level}` : fighterName(playerBodyType, "我的");
  document.querySelector("#duelRivalName").textContent = SPECIES_BY_ID[rivalSpeciesId]?.name || fighterName(rivalBodyType, "对手");
  document.querySelector("#duelRivalType").textContent = rivalType.label;
  document.querySelector("#duelPlayerSkills").textContent = skillNames(biology?.element || "neutral", playerBodyType);
  document.querySelector("#duelRivalSkills").textContent = skillNames(rival.element, rivalBodyType, "rival");
  document.querySelector("#duelPlayerHealth").value = Math.max(0, duel.playerHealth / duel.playerMaxHealth);
  document.querySelector("#duelRivalHealth").value = Math.max(0, rival.health / rival.maxHealth);
  document.querySelector("#duelPlayerHealthText").textContent = `${Math.max(0, Math.ceil(duel.playerHealth))} / ${duel.playerMaxHealth}`;
  document.querySelector("#duelRivalHealthText").textContent = `${Math.max(0, Math.ceil(rival.health))} / ${rival.maxHealth}`;
  const tacticLabels = { search: "搜索最后目击位置", openingProbe: "开局保持警戒并试探", wideReposition: "全图换位寻找奇袭角度", scentKite: "凭气味拉开视觉外距离", adaptiveCounter: "识别冲锋并自适应反击", rangeControl: "实时维持射程并侧移", groundGuard: "正对目标侧移控距", angleExit: "攻击后斜向撤步", intercept: "缩短距离寻找进攻窗口", breakaway: "距离过近，主动脱离", routeAvoidance: "提前识别边界并沿障碍绕行", collisionAvoidance: "身体反射避免碰撞", reflexDodge: "视觉反射快速滑步闪避", flee: "失去战意，正在撤退", chase: "发现逃跑，预测追击", hold: "放弃追击，保持警戒", downedGuard: "对手倒地，移动警戒", stunned: "受击失衡" };
  const bodyAction = world.creature.groundAction;
  const playerTacticLabel = bodyAction === "charge" ? "双足适配器：压低重心蓄力" : bodyAction === "pounce" ? "双足适配器：追猎跃击" : tacticLabels[duel.playerTactic] || duel.playerTactic;
  const paceLabels = { idle: "静止", walk: "步行", run: "跑动", "fast-run": "快跑", sprint: "冲刺", "dodge-burst": "瞬发闪避" };
  document.querySelector("#duelPlayerTactic").textContent = `${playerTacticLabel} · ${paceLabels[world.creature.speedTier] || "连续调速"} · ${Math.round(world.creature.altitude || 0)}m · 实速 ${Math.round(world.creature.actualSpeed ?? world.creature.speed ?? 0)} / 指令 ${Math.round(world.creature.speed || 0)} · 体力 ${Math.round((biology?.stamina || 0) * 100)}% · 疲劳 ${Math.round((biology?.fatigue || 0) * 100)}%`;
  document.querySelector("#duelRivalTactic").textContent = `${tacticLabels[duel.rivalTactic] || duel.rivalTactic} · ${paceLabels[rival.speedTier] || "连续调速"} · ${Math.round(rival.altitude || 0)}m · 速度 ${Math.round(rival.speed || 0)} · 体力 ${Math.round((rival.stamina || 0) * 100)}% · 疲劳 ${Math.round((rival.fatigue || 0) * 100)}%`;
  const visionReadout = document.querySelector("#duelVisionReadout");
  if (visionReadout && biology) {
    const playerTracking = duel.playerTrackingUntil > elapsed, rivalTracking = duel.rivalTrackingUntil > elapsed;
    const phaseLabels = { opening: "开局试探", adapt: "观察后适应", finish: "寻找终结窗口", survive: "低血量求生" };
    visionReadout.textContent = `战斗阶段：${phaseLabels[duel.phase] || "等待"} · 当前距离 ${Math.round(distance3D(world.creature, rival))} · 纯视觉距离：我方约 ${Math.round(baseCombatVisionRange("player"))}，对手约 ${Math.round(baseCombatVisionRange("rival"))} 单位 · 目标锁定：我方${duel.playerLockedOn ? "已锁定" : "未发现"}，对手${duel.rivalLockedOn ? "已锁定" : "未发现"} · 气味追踪：${playerTracking ? `我方 ${Math.ceil(duel.playerTrackingUntil - elapsed)}s（可超出视觉）` : rivalTracking ? `对手 ${Math.ceil(duel.rivalTrackingUntil - elapsed)}s（可超出视觉）` : "未标记"} · 经验记忆：${memory.combatEncounters} 场，射程纪律 ${Math.round(memory.rangeDiscipline * 100)}%，试探耐心 ${Math.round(memory.probePatience * 100)}%，应对冲锋 ${Math.round(memory.counterRush * 100)}%。`;
  }
  const strategyReadout = document.querySelector("#duelStrategyReadout");
  if (strategyReadout) {
    const playerReason = duel.playerCombatState?.disposition?.reason || `${duel.playerCombatState?.personalityLabel || "稳健型"}：等待实时战力评估。`;
    const rivalReason = duel.rivalCombatState?.disposition?.reason || `${duel.rivalCombatState?.personalityLabel || "稳健型"}：等待实时战力评估。`;
    strategyReadout.textContent = `我方：${playerReason} 当前采用“${tacticLabels[duel.playerTactic] || duel.playerTactic}”。 对手：${rivalReason} 当前采用“${tacticLabels[duel.rivalTactic] || duel.rivalTactic}”。`;
  }
  const playerCard = document.querySelector("#duelPlayerCard"), rivalCard = document.querySelector("#duelRivalCard");
  playerCard.classList.toggle("hit", elapsed < duel.playerHitUntil); playerCard.classList.toggle("attacking", elapsed < duel.playerAttackUntil);
  rivalCard.classList.toggle("hit", elapsed < duel.rivalHitUntil); rivalCard.classList.toggle("attacking", elapsed < duel.rivalAttackUntil);
  const states = { idle: "选择属性后开始", cancelled: "对战已停止 · 可立即换精灵", fighting: "对战进行中", player: "我方获胜", rival: "对手获胜", rivalEscaped: "对手逃脱", playerEscaped: "我方撤离" };
  document.querySelector("#duelState").textContent = duel.active
    ? `对战进行中 · 剩余 ${Math.max(0, Math.ceil(90 - (elapsed - duel.startedAt)))} 秒`
    : duel.result === "draw" ? "限时平局" : states[duel.result] || states.idle;
  document.querySelector("#startDuel").textContent = duel.active ? "重新开始" : "开始对战";
  for (const id of ["stopDuel", "quickStopDuel"]) { const button = document.getElementById(id); if (button) button.disabled = !duel.active; }
}

function refreshRivalMesh() {
  if (rivalMesh) { scene.remove(rivalMesh); releaseSpeciesAppearance(rivalMesh); }
  rivalMesh = createRivalMesh(world.duel.rival.element); scene.add(rivalMesh);
  dressSpecies(rivalMesh, "rival");
}

function refreshCreatureMesh() {
  if (creatureMesh) { scene.remove(creatureMesh); releaseSpeciesAppearance(creatureMesh); }
  creatureMesh = createCreatureMesh(biology?.element || "neutral");
  scene.add(creatureMesh);
  dressSpecies(creatureMesh, "player");
}

function dressSpecies(mesh, key) {
  const species = key === "player" ? collection?.species : SPECIES_BY_ID[rivalSpeciesId];
  const bodyType = key === "player" ? playerBodyType : rivalBodyType;
  if (!species || species.bodyType !== bodyType) return;
  applySpeciesAppearance(mesh, species, { rival: key === "rival" });
  const actor = key === "player" ? world.creature : world.duel.rival;
  actor.radius = THREE.MathUtils.clamp((isGroundBodyType(bodyType) ? 48 : 45) * species.visualSize, 30, 72);
  attachSpeciesAsset(mesh, species, { rival: key === "rival" }).then((loaded) => {
    if (loaded && key === "player" && mesh === creatureMesh && collection.species.id === species.id) collectionView?.notice(`${species.name}的动画模型已加载。进化会改变造型、体型与战斗能力。`);
  }).catch((error) => console.warn("Spirit asset fallback", species.id, error));
}

function createDuelMarker(label, color) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(42, 49, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 1.5; group.add(ring);
  // Keep the ground ring on the floor, but mount all readable combat UI on a
  // separate node whose height can follow the selected creature body.
  const hud = new THREE.Group(); hud.userData.duelHud = true; group.add(hud);
  const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 64;
  const context = canvas.getContext("2d"); context.fillStyle = "rgba(4,18,18,.84)"; context.roundRect(2, 2, 252, 60, 18); context.fill();
  context.strokeStyle = `#${color.toString(16).padStart(6, "0")}`; context.lineWidth = 4; context.stroke();
  context.fillStyle = "#f4fff9"; context.font = "bold 28px Microsoft YaHei"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(label, 128, 33);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, opacity: 0.94, depthTest: false, depthWrite: false }));
  sprite.position.y = 18; sprite.scale.set(100, 25, 1); sprite.renderOrder = 100; hud.add(sprite);
  // Sprites billboard automatically, so the health bar remains readable from
  // front, rear and both sides instead of disappearing edge-on like a box.
  const back = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x071819, transparent: true, opacity: 0.52, depthTest: false, depthWrite: false }));
  back.scale.set(76, 8, 1); back.renderOrder = 101; hud.add(back);
  const health = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false }));
  health.position.z = 0.1; health.scale.set(70, 4.5, 1); health.renderOrder = 102; health.userData.duelHealthBar = true; hud.add(health);
  group.userData.hud = hud;
  group.visible = false; return group;
}

function duelHudHeight(mesh) {
  // Plush heads and ears are broader than the previous skins; retain clear
  // headroom so the billboard never cuts through the costume silhouette.
  return mesh?.userData?.bodyType === "corgi" ? 232 : mesh?.userData?.bodyType === "cat" ? 180 : mesh?.userData?.bodyType === "biped" ? 245 : 122;
}

function spawnImpactEffect(target, color = 0xffd58a, reaction = "recoil") {
  const geometries = {
    shock: () => new THREE.OctahedronGeometry(31, 1),
    burn: () => new THREE.SphereGeometry(29, 14, 9),
    poison: () => new THREE.DodecahedronGeometry(26, 0),
    launch: () => new THREE.TorusGeometry(29, 4, 8, 30),
    spin: () => new THREE.TorusKnotGeometry(21, 3.5, 38, 7),
    tumble: () => new THREE.IcosahedronGeometry(30, 1),
    recoil: () => new THREE.RingGeometry(12, 34, 32),
  };
  const mesh = new THREE.Mesh((geometries[reaction] || geometries.recoil)(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, wireframe: reaction !== "recoil", side: THREE.DoubleSide, depthWrite: false }));
  if (["recoil", "launch"].includes(reaction)) mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(skillTargetPoint(target));
  addActiveSkillEffect({ mesh, actor: target, target, type: "impact", expires: elapsed + 0.48, born: elapsed });
}

function registerDuelHit(attackerKey, damage, skill, reaction = "recoil") {
  const duel = world.duel, defenderKey = attackerKey === "player" ? "rival" : "player";
  duel.lastPressureAt = elapsed;
  duel.lastContactAt = elapsed;
  duel.contactEstablished = true;
  const attacker = attackerKey === "player" ? world.creature : duel.rival;
  const defender = defenderKey === "player" ? world.creature : duel.rival;
  // 命中只吸引视线，不再瞬间扭转整个身体。
  attacker.lookAngle = Math.atan2(defender.y - attacker.y, defender.x - attacker.x);
  defender.lookAngle = Math.atan2(attacker.y - defender.y, attacker.x - defender.x);
  duel[`${attackerKey}AttackUntil`] = elapsed + (skill.type === "melee" ? 0.62 : 0.44);
  duel[`${attackerKey}AttackStartedAt`] = elapsed;
  const defenderBodyType = defenderKey === "player" ? playerBodyType : rivalBodyType;
  const baseReactionDuration = { shock: 0.72, launch: 0.82, spin: 0.76, burn: 0.64, poison: 0.58, tumble: 0.86, recoil: 0.5 }[reaction] || 0.5;
  const impactStrength = THREE.MathUtils.clamp(damage / 38 + ({ tumble: 0.55, launch: 0.48, recoil: 0.22, spin: 0.3, burn: 0.16, poison: 0.08, shock: 0.1 }[reaction] || 0.18), 0.12, 1.35);
  const knockedDown = shouldKnockDown(defenderBodyType, impactStrength, reaction);
  const reactionDuration = knockedDown
    ? knockdownDuration(impactStrength, reaction, defenderBodyType)
    : baseReactionDuration * (defenderBodyType === "cat" ? 0.58 : 1);
  duel[`${defenderKey}Reaction`] = reaction;
  duel[`${defenderKey}HitStartedAt`] = elapsed;
  duel[`${defenderKey}HitUntil`] = elapsed + reactionDuration;
  const stunCap = defenderBodyType === "cat" ? 0.34 : 0.78;
  const damageStun = damage * (defenderBodyType === "cat" ? 0.005 : 0.01);
  duel[`${defenderKey}StunUntil`] = elapsed + Math.min(stunCap, reactionDuration * (defenderBodyType === "cat" ? 0.3 : 0.44) + damageStun);
  const pushAngle = Math.atan2(defender.y - attacker.y, defender.x - attacker.x);
  const impactAngle = angleDelta(pushAngle, defender.angle || 0);
  duel[`${defenderKey}ImpactAngle`] = impactAngle;
  const forwardComponent = Math.cos(impactAngle), sideComponent = Math.sin(impactAngle);
  duel[`${defenderKey}ImpactPose`] = Math.abs(forwardComponent) > Math.abs(sideComponent) * 1.15
    ? (forwardComponent > 0 ? "forward-fall" : "backward-fall")
    : (sideComponent > 0 ? "right-fall" : "left-fall");
  duel[`${defenderKey}ImpactStrength`] = impactStrength;
  duel[`${defenderKey}KnockedDown`] = knockedDown;
  if (knockedDown) {
    duel[`${defenderKey}DownStartedAt`] = elapsed;
    duel[`${defenderKey}DownUntil`] = elapsed + reactionDuration;
    defender.ragdollState = "falling";
    defender.ragdollDown = 0.15;
    defender.ragdollControlLocked = true;
    // Being knocked down cancels casts and melee lunges immediately. A body
    // lying on the floor cannot continue locomotion or release a queued skill.
    duel[`${defenderKey}AttackUntil`] = elapsed;
    duel[`${defenderKey}AimingSkillId`] = null;
    duel[`${defenderKey}PlannedSkillId`] = null;
    duel[`${defenderKey}RammingUntil`] = 0;
    duel.pendingAttacks = duel.pendingAttacks.filter((attack) => attack.attackerKey !== defenderKey);
  }
  const force = { tumble: 225, launch: 150, recoil: 145, spin: 105, burn: 110, poison: 80, shock: 55 }[reaction] || 120;
  duel[`${defenderKey}Knockback`] = { x: Math.cos(pushAngle) * force, y: Math.sin(pushAngle) * force };
  if (["launch", "tumble"].includes(reaction)) duel[`${defenderKey}AltitudeTarget`] = Math.min(MAX_FLIGHT_ALTITUDE, (defender.altitude || 0) + (reaction === "launch" ? 190 : 90));
  spawnImpactEffect(defender, ELEMENTS[skill.element].color, reaction);
}

function syncGroundKnockdownState(actor, key, bodyType) {
  if (!isGroundBodyType(bodyType) || bodyType === "corgi") return;
  const duel = world.duel;
  const startedAt = duel[`${key}DownStartedAt`] || 0;
  const downUntil = duel[`${key}DownUntil`] || 0;
  if (!duel[`${key}KnockedDown`] || elapsed >= downUntil) {
    actor.ragdollState = "active";
    actor.ragdollDown = 0;
    actor.ragdollControlLocked = false;
    duel[`${key}KnockedDown`] = false;
    return;
  }
  const state = timedKnockdownState(elapsed, startedAt, downUntil);
  actor.ragdollState = state.state;
  actor.ragdollDown = state.down;
  actor.ragdollControlLocked = state.locked;
}

function applyDuelKnockback(entity, key, dt) {
  const velocity = world.duel[`${key}Knockback`];
  if (!velocity) return;
  moveBody(entity, { x: velocity.x * dt, y: velocity.y * dt }, world.obstacles, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H });
  const decay = Math.pow(0.045, dt); velocity.x *= decay; velocity.y *= decay;
}

function handleDuelContact() {
  const duel = world.duel, player = world.creature, rival = duel.rival;
  const combinedRadius = player.radius + rival.radius;
  if (distance3D(player, rival) >= combinedRadius * 1.02) return;
  let dx = rival.x - player.x, dy = rival.y - player.y, horizontal = Math.hypot(dx, dy);
  if (horizontal < 0.01) { dx = Math.cos(player.angle); dy = Math.sin(player.angle); horizontal = 1; }
  const nx = dx / horizontal, ny = dy / horizontal;
  const overlap = Math.max(4, combinedRadius - horizontal + 3);
  player.x -= nx * overlap * 0.5; player.y -= ny * overlap * 0.5;
  rival.x += nx * overlap * 0.5; rival.y += ny * overlap * 0.5;
  moveBody(player, { x: 0, y: 0 }, world.obstacles, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H });
  moveBody(rival, { x: 0, y: 0 }, world.obstacles, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H });
  if (player.ragdollControlLocked || rival.ragdollControlLocked) {
    duel.contactCooldownUntil = Math.max(duel.contactCooldownUntil, elapsed + 0.35);
    return;
  }
  duel.playerAltitudeTarget = THREE.MathUtils.clamp(player.altitude + 90, 50, MAX_FLIGHT_ALTITUDE);
  duel.rivalAltitudeTarget = THREE.MathUtils.clamp(rival.altitude - 90, 50, MAX_FLIGHT_ALTITUDE);
  const ramming = duel.pendingAttacks.filter((attack) => attack.result.skill.type === "melee" && elapsed <= duel[`${attack.attackerKey}RammingUntil`]);
  if (ramming.length) {
    ramming.forEach((attack) => { attack.resolvesAt = elapsed; });
    duel.contactCooldownUntil = elapsed + 0.55;
    return;
  }
  if (elapsed < duel.contactCooldownUntil) return;
  duel.contactCooldownUntil = elapsed + 1.1;
  const playerDamage = 2.4 * (1 - fighterProfile("player").defense);
  const rivalDamage = 2.4 * (1 - fighterProfile("rival").defense);
  duel.playerHealth -= playerDamage; rival.health -= rivalDamage;
  duel.playerReaction = "recoil"; duel.rivalReaction = "recoil";
  duel.playerHitStartedAt = elapsed; duel.rivalHitStartedAt = elapsed;
  duel.playerHitUntil = elapsed + 0.32; duel.rivalHitUntil = elapsed + 0.32;
  duel.playerStunUntil = elapsed + 0.14; duel.rivalStunUntil = elapsed + 0.14;
  duel.playerKnockback = { x: -nx * 125, y: -ny * 125 }; duel.rivalKnockback = { x: nx * 125, y: ny * 125 };
  duel.playerImpactAngle = angleDelta(Math.atan2(-ny, -nx), player.angle || 0);
  duel.rivalImpactAngle = angleDelta(Math.atan2(ny, nx), rival.angle || 0);
  duel.playerImpactStrength = 0.28; duel.rivalImpactStrength = 0.28;
  duel.playerKnockedDown = false; duel.rivalKnockedDown = false;
  duel.playerOrbit *= -1; duel.rivalOrbit *= -1;
  spawnImpactEffect(player, 0xd9eee7, "recoil"); spawnImpactEffect(rival, 0xd9eee7, "recoil");
  addLog(`双方在空中意外相撞，各受到轻微碰撞伤害（我方 ${playerDamage.toFixed(1)}，对手 ${rivalDamage.toFixed(1)}），随后弹开并重新拉开距离。`, "bitter");
}

function setHitFlash(mesh, active, reaction = "recoil") {
  const reactionColors = { shock: 0xcff7ff, burn: 0xff672e, poison: 0x7de66c, launch: 0xffd083, spin: 0xa8ffe5, tumble: 0xffd7a3, recoil: 0xffffff };
  mesh.traverse((child) => {
    const material = child.material;
    if (!material?.emissive) return;
    if (material.userData.baseEmissive === undefined) {
      material.userData.baseEmissive = material.emissive.getHex();
      material.userData.baseEmissiveIntensity = material.emissiveIntensity;
    }
    material.emissive.setHex(active ? (reactionColors[reaction] || 0xffffff) : material.userData.baseEmissive);
    material.emissiveIntensity = active ? (reaction === "shock" ? 1.45 : 0.92) : material.userData.baseEmissiveIntensity;
  });
}

function renderCombatBody(mesh, entity, key) {
  const duel = world.duel, hit = elapsed < duel[`${key}HitUntil`], attackingNow = elapsed < duel[`${key}AttackUntil`];
  const activeSkill = SKILLS[duel[`${key}ActiveSkillId`]];
  const reaction = duel[`${key}Reaction`] || "recoil";
  const hitStart = duel[`${key}HitStartedAt`] || elapsed;
  const hitDuration = Math.max(0.01, duel[`${key}HitUntil`] - hitStart);
  const hitProgress = hit ? THREE.MathUtils.clamp((elapsed - hitStart) / hitDuration, 0, 1) : 1;
  const reactionEnvelope = hit ? Math.sin(Math.PI * hitProgress) : 0;
  const isCorgi = mesh.userData.bodyType === "corgi";
  const isCat = mesh.userData.bodyType === "cat";
  const activeRagdoll = isCorgi ? mesh.userData.corgiRig?.ragdoll : null;
  const impactAngle = duel[`${key}ImpactAngle`] || 0;
  const impactStrength = duel[`${key}ImpactStrength`] || 0.2;
  const knockedDown = isGroundBodyType(mesh.userData.bodyType) && duel[`${key}KnockedDown`];
  const plushGaitRoll = isCorgi ? (mesh.userData.plushGaitRoll || 0) : 0;
  const plushGaitPitch = isCorgi ? (mesh.userData.plushGaitPitch || 0) : 0;
  // Knockdowns have three readable phases: lose balance, stay down briefly,
  // then push back up.  Direction comes from the actual incoming impulse.
  const fallAmount = activeRagdoll || !hit || !knockedDown ? 0
    : hitProgress < 0.28 ? 1 - (1 - hitProgress / 0.28) ** 3
      : hitProgress < 0.7 ? 1
        : 1 - THREE.MathUtils.smoothstep(hitProgress, 0.7, 1);
  // 快速全身抖动只属于电击。其他受击动作都是一次性的位移、失衡或姿态变化。
  if (hit && reaction === "shock") {
    const shake = Math.sin(elapsed * 118) * 8 * reactionEnvelope;
    mesh.position.x += Math.cos(entity.angle + Math.PI / 2) * shake; mesh.position.z += Math.sin(entity.angle + Math.PI / 2) * shake;
  }
  if (hit && reaction === "launch") mesh.position.y += reactionEnvelope * 34;
  if (hit && reaction === "poison") mesh.position.y -= reactionEnvelope * 9;
  if (hit && ["recoil", "burn"].includes(reaction)) {
    const retreat = reactionEnvelope * (reaction === "recoil" ? 10 : 7);
    mesh.position.x -= Math.cos(entity.angle) * retreat; mesh.position.z -= Math.sin(entity.angle) * retreat;
  }
  if (attackingNow) { mesh.position.x += Math.cos(entity.angle) * 11; mesh.position.z += Math.sin(entity.angle) * 11; }
  if (fallAmount > 0 && !mesh.userData.assetHasDownClip) {
    // Root rotations pivot around the feet. Lifting the root by the body's
    // horizontal half-extent keeps shoulders, head and knees above the floor.
    mesh.position.y += knockdownGroundClearance(mesh.userData.bodyType, fallAmount, impactStrength, Math.abs(Math.sin(impactAngle)) > 0.7);
  }
  const combatScale = 1.48;
  const squash = hit && reaction === "recoil" ? 1 - 0.24 * reactionEnvelope
    : hit && reaction === "burn" ? 1 - 0.18 * reactionEnvelope
      : hit && reaction === "poison" ? 1 - 0.14 * reactionEnvelope
        : attackingNow ? 0.9 : 1;
  const stretch = attackingNow ? 1.16 : hit && reaction === "recoil" ? 1 + 0.1 * reactionEnvelope : 1;
  mesh.scale.set(stretch * combatScale, squash * combatScale, combatScale);
  mesh.rotation.x = hit && reaction === "spin" ? hitProgress * Math.PI * 2.2
    : hit && reaction === "shock" ? Math.sin(elapsed * 105) * 0.11 * reactionEnvelope : (entity.bankAngle || 0);
  const flightPitch = THREE.MathUtils.clamp(-(entity.verticalSpeed || 0) / 310, -0.32, 0.32);
  const bipedLean = isGroundBodyType(mesh.userData.bodyType) ? (entity.groundLean || 0) : 0;
  mesh.rotation.z = hit && reaction === "tumble" ? hitProgress * Math.PI * 1.7
    : hit && reaction === "recoil" ? -0.42 * reactionEnvelope
      : hit && reaction === "burn" ? -0.3 * reactionEnvelope
        : hit && reaction === "poison" ? 0.24 * reactionEnvelope
          : hit && reaction === "launch" ? -0.2 * reactionEnvelope
          : attackingNow ? -0.16 + bipedLean : flightPitch + bipedLean + plushGaitPitch;
  if (!hit) mesh.rotation.x += plushGaitRoll;
  if (isGroundBodyType(mesh.userData.bodyType) && hit && !activeRagdoll) {
    if (knockedDown) {
      if (isCat) {
        const pose = quadrupedKnockdownPose(impactAngle, impactStrength, fallAmount, key === "player" ? 1 : -1);
        // Keep the long spine close to horizontal. Side impacts roll the cat
        // onto a flank; frontal impacts make it dip/slide instead of standing up.
        mesh.rotation.z = pose.pitch;
        mesh.rotation.x = pose.roll;
      } else {
        const fallAngle = (0.82 + Math.min(0.55, impactStrength * 0.42)) * fallAmount;
        // Forward/back impulses pitch around local Z; side impacts roll around X.
        mesh.rotation.z = -Math.cos(impactAngle) * fallAngle;
        mesh.rotation.x = Math.sin(impactAngle) * fallAngle;
        if (reaction === "tumble") mesh.rotation.z += hitProgress * Math.PI * 0.85 * Math.sign(Math.cos(impactAngle) || 1);
      }
    } else if (reaction !== "shock") {
      mesh.rotation.z += -Math.cos(impactAngle) * reactionEnvelope * impactStrength * 0.42;
      mesh.rotation.x += Math.sin(impactAngle) * reactionEnvelope * impactStrength * 0.38;
    }
  }
  if (activeRagdoll) {
    mesh.position.y += activeRagdoll.verticalOffset;
    mesh.rotation.x = activeRagdoll.tiltX.value + (activeRagdoll.down < 0.15 ? plushGaitRoll : 0) + (hit && reaction === "shock" ? Math.sin(elapsed * 105) * 0.08 * reactionEnvelope : 0);
    mesh.rotation.y += activeRagdoll.tiltY.value;
    mesh.rotation.z = activeRagdoll.tiltZ.value + (activeRagdoll.down < 0.15 ? plushGaitPitch : 0) + (attackingNow && activeRagdoll.down < 0.15 ? -0.12 : 0);
  }
  if (knockedDown && mesh.userData.assetHasDownClip) {
    // The artist's skeletal fall already moves the joints into a prone pose.
    // Do not rotate that prone skeleton a second time around its feet.
    mesh.rotation.x = 0; mesh.rotation.z = 0;
  }
  const headRig = mesh.userData.headRig;
  if (headRig) headRig.rotation.z += ((attackingNow && activeSkill?.source === "mouth" ? -0.2 : 0) - headRig.rotation.z) * 0.28;
  if (attackingNow && activeSkill?.source === "wing" && !isGroundBodyType(mesh.userData.bodyType)) {
    (mesh.userData.wings || []).forEach((wing, index) => { wing.rotation.x = (index ? -1 : 1) * (0.7 + Math.sin(elapsed * 62) * 0.42); });
    (mesh.userData.arms || []).forEach((arm, index) => {
      const shoulderTarget = index === 0 ? -1.34 : -0.42;
      const elbowTarget = index === 0 ? -0.32 : -0.92;
      arm.group.rotation.z = THREE.MathUtils.lerp(arm.group.rotation.z, shoulderTarget, 0.38);
      arm.elbow.rotation.z = THREE.MathUtils.lerp(arm.elbow.rotation.z, elbowTarget, 0.42);
    });
  }
  if (attackingNow && activeSkill?.source === "paws") {
    (mesh.userData.legs || []).forEach((leg, index) => {
      const kick = index === 0 ? -0.92 : 0.3;
      leg.group.rotation.z = THREE.MathUtils.lerp(leg.group.rotation.z, kick, 0.4);
      leg.knee.rotation.z = THREE.MathUtils.lerp(leg.knee.rotation.z, index === 0 ? 0.24 : 0.88, 0.4);
    });
  }
  setHitFlash(mesh, hit, reaction);
}

const creatureFloorBounds = new THREE.Box3();
function keepCreatureAboveGround(mesh, entity) {
  if ((entity.altitude || 0) <= 1 && (mesh.userData.socialPose?.movementLocked || isGroundBodyType(mesh.userData.bodyType) && (entity.ragdollControlLocked || mesh.userData.assetAnimator))) {
    // Final geometry-based floor guard. Procedural ears, hands and knees have
    // different extents, so a fixed capsule estimate alone cannot guarantee
    // every impact pose stays above the terrain.
    mesh.position.y += groundClearance(refreshSkinnedBounds(mesh, creatureFloorBounds));
  }
}

const STICK_UP = new THREE.Vector3(0, 1, 0);
function placeStickBone(mesh, start, end) {
  const direction = end.clone().sub(start), length = Math.max(0.001, direction.length());
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(STICK_UP, direction.normalize());
  mesh.scale.set(1, length, 1);
}

function solveBipedKnee(hip, ankle, thighLength = 31, shinLength = 30) {
  let dx = ankle.x - hip.x, dy = ankle.y - hip.y;
  let rawDistance = Math.max(0.001, Math.hypot(dx, dy));
  const minimumReach = (thighLength + shinLength) * 0.38;
  // Keep the recovery leg compact without folding the shin through the thigh.
  // This caps the game rig near a readable sprinting knee angle (~135°).
  if (rawDistance < minimumReach) {
    const scale = minimumReach / rawDistance;
    ankle.x = hip.x + dx * scale; ankle.y = hip.y + dy * scale;
    dx = ankle.x - hip.x; dy = ankle.y - hip.y; rawDistance = minimumReach;
  }
  const ux = dx / rawDistance, uy = dy / rawDistance;
  const maximumReach = thighLength + shinLength - 0.12;
  // A foot target at or beyond the leg's reach is the heel-strike/mid-stance
  // pose.  The previous `sum - 1.5` clamp forced a permanent 23-27 degree
  // bend, so both legs looked locked in a squat even during stance.
  if (rawDistance >= maximumReach) {
    const naturalBend = 1.15;
    return new THREE.Vector3(
      hip.x + ux * thighLength - uy * naturalBend,
      hip.y + uy * thighLength + ux * naturalBend,
      hip.z,
    );
  }
  const distance = THREE.MathUtils.clamp(rawDistance, Math.abs(thighLength - shinLength) + 0.01, maximumReach);
  const along = (thighLength ** 2 - shinLength ** 2 + distance ** 2) / (2 * distance);
  const bend = Math.sqrt(Math.max(0, thighLength ** 2 - along ** 2));
  // The perpendicular points the knee forwards when the ankle is below the hip.
  return new THREE.Vector3(hip.x + ux * along - uy * bend, hip.y + uy * along + ux * bend, hip.z);
}

function springRagdollAxis(axis, target, stiffness, damping, dt) {
  axis.velocity += ((target - axis.value) * stiffness - axis.velocity * damping) * dt;
  axis.value += axis.velocity * dt;
  return axis.value;
}

function createCorgiActiveRagdoll() {
  const axis = () => ({ value: 0, velocity: 0 });
  return {
    tiltX: axis(), tiltY: axis(), tiltZ: axis(), headX: axis(), headZ: axis(), torsoX: axis(), torsoZ: axis(),
    arms: [{ x: axis(), z: axis(), elbowX: axis(), elbowZ: axis() }, { x: axis(), z: axis(), elbowX: axis(), elbowZ: axis() }],
    legs: [{ x: axis(), z: axis() }, { x: axis(), z: axis() }],
    lastHitStartedAt: -1, down: 0, verticalOffset: 0, state: "active",
    recoveryElapsed: 0, recoveryLimit: 1.1, impactPose: "backward-fall", impactStrength: 0,
  };
}

function corgiRagdollControlLocked(actor, bodyType) {
  return isGroundBodyType(bodyType) && Boolean(actor?.ragdollControlLocked);
}

function stepCorgiActiveRagdoll(rig, actorKey, dt, moving, cycle, sprint) {
  const rag = rig.ragdoll, duel = world.duel;
  if (!rag) return;
  const hit = duel.active && elapsed < (duel[`${actorKey}HitUntil`] || 0);
  const hitStartedAt = duel[`${actorKey}HitStartedAt`] || 0;
  const impactAngle = duel[`${actorKey}ImpactAngle`] || 0;
  const strength = THREE.MathUtils.clamp(duel[`${actorKey}ImpactStrength`] || 0.2, 0.12, 1.35);
  const reaction = duel[`${actorKey}Reaction`] || "recoil";
  const actor = actorKey === "player" ? world.creature : duel.rival;
  const impactPose = duel[`${actorKey}ImpactPose`] || "backward-fall";

  // A hit injects angular momentum once.  It is not a canned pose: every body
  // part receives a different impulse and is then integrated by its spring.
  if (hit && hitStartedAt > rag.lastHitStartedAt) {
    rag.lastHitStartedAt = hitStartedAt;
    rag.recoveryElapsed = 0;
    rag.impactPose = impactPose;
    rag.impactStrength = strength;
    const staminaAtImpact = THREE.MathUtils.clamp(actorKey === "player" ? (biology?.stamina ?? 1) : (actor.stamina ?? 1), 0, 1);
    const sideFall = impactPose === "left-fall" || impactPose === "right-fall";
    rag.recoveryLimit = THREE.MathUtils.clamp(0.72 + strength * 0.62 + (impactPose === "backward-fall" ? 0.16 : 0) - staminaAtImpact * 0.24 - (sideFall ? 0.08 : 0), 0.62, 1.55);
    // Keep the physical direction stable but vary momentum slightly with the
    // instant of contact, so repeated blows from the same side do not produce
    // an identical silhouette every time.
    const impactVariation = 0.9 + (Math.sin(hitStartedAt * 7.13 + (actorKey === "player" ? 0.4 : 2.1)) + 1) * 0.1;
    const fallImpulse = (reaction === "tumble" ? 5.3 : reaction === "launch" ? 4.4 : 2.4) * strength * impactVariation;
    rag.tiltZ.velocity += -Math.cos(impactAngle) * fallImpulse;
    rag.tiltX.velocity += Math.sin(impactAngle) * fallImpulse;
    rag.headZ.velocity += -Math.cos(impactAngle) * fallImpulse * 1.75;
    rag.headX.velocity += Math.sin(impactAngle) * fallImpulse * 1.55;
    rag.torsoZ.velocity += -Math.cos(impactAngle) * fallImpulse * 0.72;
    rag.torsoX.velocity += Math.sin(impactAngle) * fallImpulse * 0.68;
    rag.tiltY.velocity += Math.sin(impactAngle) * fallImpulse * (reaction === "tumble" ? 0.72 : 0.42);
    rag.arms.forEach((part, index) => {
      const side = index ? 1 : -1;
      part.z.velocity += (-Math.cos(impactAngle) * 3.6 + side * 2.1) * strength;
      part.x.velocity += (Math.sin(impactAngle) * 3.2 + side * 1.4) * strength;
      part.elbowZ.velocity += (side * 3.8 - Math.cos(impactAngle) * 2.3) * strength;
      part.elbowX.velocity += (side * 2.4 + Math.sin(impactAngle) * 2.1) * strength;
    });
    rag.legs.forEach((part, index) => {
      const side = index ? 1 : -1;
      part.z.velocity += (-Math.cos(impactAngle) * 2.4 - side * 1.25) * strength;
      part.x.velocity += (Math.sin(impactAngle) * 2.1 + side * 0.9) * strength;
    });
  }

  if (!hit && rag.state !== "active") rag.recoveryElapsed += dt;
  const tiltMagnitude = Math.hypot(rag.tiltX.value, rag.tiltZ.value);
  const losingBalance = hit && (strength > 0.58 || ["launch", "tumble", "spin"].includes(reaction));
  const recoveringBalance = !hit && tiltMagnitude > 0.18;
  const stamina = THREE.MathUtils.clamp(actorKey === "player" ? (biology?.stamina ?? 1) : (actor.stamina ?? 1), 0, 1);
  const recoveryUrgency = recoveringBalance ? THREE.MathUtils.smoothstep(rag.recoveryElapsed, rag.recoveryLimit * 0.45, rag.recoveryLimit) : 0;
  const recoveryRate = (0.88 + stamina * 0.34) * (1 + recoveryUrgency * 1.75);
  const rootStiffness = losingBalance ? 0.42 : hit ? 2.2 : recoveringBalance ? 3.15 * recoveryRate : 7.2;
  const rootDamping = losingBalance ? 0.85 : hit ? 2.1 : recoveringBalance ? 3.35 + recoveryUrgency * 0.75 : 3.8;
  springRagdollAxis(rag.tiltX, 0, rootStiffness, rootDamping, dt);
  springRagdollAxis(rag.tiltZ, 0, rootStiffness, rootDamping, dt);
  springRagdollAxis(rag.tiltY, 0, losingBalance ? 0.7 : recoveringBalance ? 3.8 * recoveryRate : 7.2, losingBalance ? 1.0 : 3.7, dt);
  rag.tiltX.value = THREE.MathUtils.clamp(rag.tiltX.value, -1.42, 1.42);
  rag.tiltZ.value = THREE.MathUtils.clamp(rag.tiltZ.value, -1.42, 1.42);
  const newTilt = Math.hypot(rag.tiltX.value, rag.tiltZ.value);
  rag.down += (THREE.MathUtils.smoothstep(newTilt, 0.55, 1.2) - rag.down) * Math.min(1, dt * (hit ? 9 : 3.2));
  // Combat presentation scales the corgi to 1.48x.  Clearance therefore has
  // to be measured from the enlarged head/torso silhouette, not the old
  // unscaled 39-unit capsule, otherwise side and backward falls sink through
  // the terrain.
  const sideFall = Math.abs(rag.tiltX.value) > Math.abs(rag.tiltZ.value);
  const groundClearance = knockdownGroundClearance("corgi", rag.down, rag.impactStrength, sideFall);
  rag.verticalOffset += (groundClearance - rag.verticalOffset) * Math.min(1, dt * 10);
  rag.state = rag.down > 0.68 ? "down" : rag.down > 0.18 ? (hit ? "falling" : "getting-up") : "active";
  actor.ragdollState = rag.state;
  actor.ragdollDown = rag.down;
  actor.ragdollControlLocked = losingBalance || rag.state !== "active";

  const bracingToStand = !hit && rag.down > 0.18;
  const limbStiffness = hit ? 1.15 : bracingToStand ? 3.4 : 8.5;
  const limbDamping = hit ? 1.05 : 4.1;
  springRagdollAxis(rag.headX, bracingToStand ? -rag.tiltX.value * 0.28 : 0, hit ? 1.4 : 7.5, hit ? 1.2 : 4.2, dt);
  springRagdollAxis(rag.headZ, bracingToStand ? -rag.tiltZ.value * 0.28 : 0, hit ? 1.4 : 7.5, hit ? 1.2 : 4.2, dt);
  springRagdollAxis(rag.torsoX, moving && !hit ? Math.sin(cycle - 0.7) * (0.035 + sprint * 0.055) : 0, hit ? 1.2 : 7, hit ? 1.15 : 4, dt);
  springRagdollAxis(rag.torsoZ, moving && !hit ? Math.sin(cycle - 0.42) * (0.018 + sprint * 0.038) : 0, hit ? 1.2 : 7, hit ? 1.15 : 4, dt);
  rag.arms.forEach((part, index) => {
    const side = index ? 1 : -1;
    const braceX = bracingToStand ? -rag.tiltX.value * 0.72 + side * 0.14 : 0;
    const braceZ = bracingToStand ? -rag.tiltZ.value * 0.64 + side * 0.18 : 0;
    springRagdollAxis(part.x, braceX, limbStiffness, limbDamping, dt);
    springRagdollAxis(part.z, braceZ, limbStiffness, limbDamping, dt);
    part.x.value = THREE.MathUtils.clamp(part.x.value, -1.25, 1.25);
    part.z.value = THREE.MathUtils.clamp(part.z.value, -1.45, 1.45);
    springRagdollAxis(part.elbowX, bracingToStand ? -braceX * 0.38 : 0, limbStiffness * 0.82, limbDamping * 0.9, dt);
    springRagdollAxis(part.elbowZ, bracingToStand ? 0.78 - Math.abs(braceZ) * 0.22 : 0, limbStiffness * 0.82, limbDamping * 0.9, dt);
    part.elbowX.value = THREE.MathUtils.clamp(part.elbowX.value, -1.2, 1.2);
    part.elbowZ.value = THREE.MathUtils.clamp(part.elbowZ.value, -1.35, 1.35);
  });
  rag.legs.forEach((part, index) => {
    const side = index ? 1 : -1;
    springRagdollAxis(part.x, bracingToStand ? side * 0.22 : 0, limbStiffness, limbDamping, dt);
    springRagdollAxis(part.z, bracingToStand ? -Math.sign(rag.tiltZ.value || 1) * 0.34 + side * 0.12 : 0, limbStiffness, limbDamping, dt);
    part.x.value = THREE.MathUtils.clamp(part.x.value, -1.25, 1.25);
    part.z.value = THREE.MathUtils.clamp(part.z.value, -1.45, 1.45);
  });
}

function animateCorgi(mesh, entity, dt = 1 / 60, actorKey = "player") {
  const rig = mesh.userData.corgiRig; if (!rig) return;
  const speed = entity.actualSpeed ?? entity.speed ?? 0;
  const movementSlip = angleDelta(entity.moveAngle ?? entity.angle ?? 0, entity.angle || 0);
  const gait = directionalGait(movementSlip, speed);
  const airborne = (entity.altitude || 0) > 1;
  const action = entity.groundAction || "run";
  const foragePose = ["sniff", "tasting", "eating"].includes(action) || ["sniffing", "tasting", "eating"].includes(entity.forageState);
  const duel = world.duel;
  const attacking = duel.active && elapsed < (duel[`${actorKey}AttackUntil`] || 0);
  const activeSkill = SKILLS[duel[`${actorKey}ActiveSkillId`]];
  const attackStart = duel[`${actorKey}AttackStartedAt`] || elapsed;
  const attackEnd = duel[`${actorKey}AttackUntil`] || elapsed;
  const attackProgress = attacking ? THREE.MathUtils.clamp((elapsed - attackStart) / Math.max(0.08, attackEnd - attackStart), 0, 1) : 0;
  const attackEnvelope = attacking ? Math.sin(attackProgress * Math.PI) : 0;
  const moving = speed > 45;
  const cadence = moving ? THREE.MathUtils.clamp(2.1 + speed / 360, 2.4, 6.2) : 0;
  entity.gaitPhase = ((entity.gaitPhase || 0) + dt * cadence) % 1;
  const phase = entity.gaitPhase || 0;
  const cycle = phase * Math.PI * 2;
  const sprint = THREE.MathUtils.clamp((speed - 180) / 620, 0, 1);
  stepCorgiActiveRagdoll(rig, actorKey, Math.min(dt, 1 / 30), moving, cycle, sprint);
  const rag = rig.ragdoll;
  const softMotion = rig.softMotion;
  const softWalking = moving && !airborne && (rag?.down || 0) < 0.16;
  const motionEnergy = softWalking ? 0.62 + sprint * 0.38 : 0;
  const stepWave = Math.sin(cycle), doubleStep = Math.cos(cycle * 2);
  // A plush costume should not have a rigid torso. These delayed springs pass
  // each footfall through the hips, belly, chest and head with progressively
  // more lag, producing a restrained soft "duang" instead of a zombie walk.
  if (softMotion) {
    // These springs must be fast enough to follow a 3–6 Hz running cadence.
    // The earlier 10–20 stiffness range filtered almost the whole gait away,
    // leaving valid internal values but an externally rigid silhouette.
    springRagdollAxis(softMotion.hipSway, stepWave * (4.4 + sprint * 5.2) * motionEnergy, 125, 18, dt);
    springRagdollAxis(softMotion.chestSway, -Math.sin(cycle - 0.42) * (3.1 + sprint * 3.5) * motionEnergy, 105, 17, dt);
    springRagdollAxis(softMotion.twist, Math.sin(cycle - 0.28) * (0.18 + sprint * 0.14) * motionEnergy, 120, 17, dt);
    springRagdollAxis(softMotion.roll, Math.sin(cycle + 0.18) * (0.13 + sprint * 0.1) * motionEnergy, 120, 18, dt);
    springRagdollAxis(softMotion.bounce, (0.5 - doubleStep * 0.5) * (2.25 + sprint * 2.1) * motionEnergy, 135, 20, dt);
    springRagdollAxis(softMotion.headLag, -Math.sin(cycle - 0.68) * (0.075 + sprint * 0.055) * motionEnergy, 92, 15, dt);
  }
  const swing = moving ? (0.34 + sprint * 0.48) : 0;
  const bob = softMotion?.bounce.value || 0;
  const tuck = airborne || action === "pounce" || action === "dodge";
  const animationState = action === "charge" ? "charge" : action === "pounce" ? "pounce" : action === "dodge" ? "dodge" : airborne ? "jump" : gait.state;
  entity.animationState = animationState; mesh.userData.animationState = animationState;

  const bodyWag = softMotion?.hipSway.value || 0;
  const chestWag = softMotion?.chestSway.value || 0;
  const bodyTwist = softMotion?.twist.value || 0;
  const bodyRoll = softMotion?.roll.value || 0;
  mesh.userData.plushGaitRoll = bodyRoll * 0.68;
  mesh.userData.plushGaitPitch = softWalking ? Math.sin(cycle * 2 - 0.35) * (0.018 + sprint * 0.022) : 0;
  if (!duel.active) {
    mesh.rotation.x += mesh.userData.plushGaitRoll;
    mesh.rotation.z += mesh.userData.plushGaitPitch;
  }
  const attackLean = attacking ? (activeSkill?.type === "melee" ? 8 : activeSkill?.gesture === "throw" ? 3 : 1.5) * attackEnvelope : 0;
  const forageLean = foragePose ? 8 : 0;
  const pelvis = new THREE.Vector3(action === "charge" ? -3 : 0, 43 - (action === "charge" ? 5 : 0) - bob * 0.7, bodyWag);
  const neck = new THREE.Vector3(pelvis.x + (moving ? 3 + sprint * 3 : 0) + attackLean + forageLean, pelvis.y + 39 + bob * 0.18 - forageLean * 0.55, chestWag - bodyWag * 0.28);
  const head = new THREE.Vector3(neck.x + 2 + forageLean * 1.15 + (activeSkill?.source === "mouth" ? attackEnvelope * 5 : 0), neck.y + 15 + bob * 0.24 - forageLean * 1.35, -chestWag * 0.28);
  rig.pelvis.position.copy(pelvis); rig.neck.position.copy(neck); rig.headRig.position.copy(head);
  rig.pelvis.rotation.set(bodyRoll * 0.72, -bodyTwist * 0.78, -sprint * 0.035);
  rig.neck.rotation.set(-bodyRoll * 0.32, bodyTwist * 0.42, 0);
  rig.torso.position.copy(pelvis).lerp(neck, 0.48);
  rig.torso.rotation.z = -Math.atan2(neck.x - pelvis.x, neck.y - pelvis.y) + (rag?.torsoZ.value || 0);
  rig.torso.rotation.x = bodyRoll + (rag?.torsoX.value || 0);
  rig.torso.rotation.y = bodyTwist;
  placeStickBone(rig.spine, pelvis, neck);

  // A plush suit deforms as one soft mass: breathing widens the belly and a
  // planted step briefly squashes the body instead of moving rigid spheres.
  const breath = Math.sin(elapsed * 2.15 + (actorKey === "rival" ? 0.8 : 0)) * 0.018;
  const stepSquash = softWalking ? Math.max(0, Math.sin(cycle) ** 4) * (0.032 + sprint * 0.038) : 0;
  const soft = rig.softness;
  if (soft) {
    rig.torso.scale.set(
      soft.torso.x * (1 + breath + stepSquash),
      soft.torso.y * (1 - breath * 0.35 - stepSquash * 0.72),
      soft.torso.z * (1 + breath * 0.65 + stepSquash * 0.9),
    );
    rig.pelvis.scale.set(
      soft.pelvis.x * (1 + stepSquash * 0.7),
      soft.pelvis.y * (1 - stepSquash * 0.8),
      soft.pelvis.z * (1 + stepSquash),
    );
    const headBounce = moving && !airborne ? Math.sin(cycle * 2) * 0.012 : 0;
    rig.headRig.scale.set(1 + stepSquash * 0.25, 1 - stepSquash * 0.3 + headBounce, 1 + stepSquash * 0.25);
  }

  rig.legs.forEach((leg, index) => {
    const side = index ? 1 : -1;
    const legCycle = cycle + index * Math.PI;
    const footLift = softWalking ? Math.max(0, Math.sin(legCycle)) * (2.2 + sprint * 3.1) : 0;
    const planted = softWalking ? Math.max(0, -Math.sin(legCycle)) : 0;
    leg.pivot.position.set(-2, pelvis.y - 10 + footLift, side * 12 + bodyWag * 0.18);
    // One rigid short leg swings from the hip. No knee solver and no separate
    // thigh/shin motion: this is the toy-like step requested for the corgi.
    const easedStep = Math.sin(legCycle) + Math.sin(legCycle * 2) * 0.14;
    leg.pivot.rotation.set(0, 0, tuck ? (index ? -0.75 : 0.75) : easedStep * swing);
    leg.paw.scale.set(1.28 * (1 + planted * 0.055), 0.6 * (1 - planted * 0.08), 1.08 * (1 + planted * 0.04));
    if (Math.abs(gait.lateral) > 0.48 && !tuck) leg.pivot.rotation.x = -Math.sin(legCycle) * swing * gait.lateralDirection * 0.65;
  });
  rig.arms.forEach((arm, index) => {
    const side = index ? 1 : -1;
    const armCycle = cycle + index * Math.PI;
    // Shoulder sockets live on the upper torso, not on the neck.  The longer
    // plush arms hang beside the belly and retain enough reach for gestures.
    arm.pivot.position.set(1, pelvis.y + 24 + bob * 0.12, side * 23 + chestWag * 0.24);
    // Arms deliberately swing as whole plush limbs, opposite the legs.
    const armDrag = Math.sin(armCycle - 0.3) + Math.sin(armCycle * 2 - 0.5) * 0.12;
    arm.pivot.rotation.set(bodyTwist * side * 0.35, 0, foragePose ? side * 0.12 : tuck ? (index ? 0.7 : -0.7) : -armDrag * (0.28 + sprint * 0.62));
    arm.elbow.rotation.set(0, 0, tuck ? 0.62 : 0.2 + Math.max(0, Math.sin(armCycle - 0.24)) * (0.2 + sprint * 0.09));
    if (Math.abs(gait.lateral) > 0.48 && !tuck) arm.pivot.rotation.x = Math.sin(armCycle) * 0.24 * gait.lateralDirection;
    if (attacking) {
      if (activeSkill?.gesture === "throw") {
        // One paw winds behind the ear, whips forward and follows through;
        // the other opens sideways to balance the round body.
        const throwingArm = index === (actorKey === "player" ? 0 : 1);
        arm.pivot.rotation.z = throwingArm
          ? THREE.MathUtils.lerp(1.05, -1.45, THREE.MathUtils.smoothstep(attackProgress, 0.18, 0.72))
          : 0.58 * attackEnvelope;
        arm.pivot.rotation.x = throwingArm ? -0.35 * attackEnvelope : 0.22 * attackEnvelope;
        arm.elbow.rotation.z = throwingArm
          ? THREE.MathUtils.lerp(1.05, -0.18, THREE.MathUtils.smoothstep(attackProgress, 0.24, 0.68))
          : 0.45 * attackEnvelope;
      } else if (activeSkill?.type === "melee" || activeSkill?.source === "paws") {
        arm.pivot.rotation.z = index ? -0.35 + attackEnvelope * 1.1 : 0.42 - attackEnvelope * 1.45;
        arm.pivot.rotation.x = (index ? 1 : -1) * attackEnvelope * 0.3;
        arm.elbow.rotation.z = 0.22 + attackEnvelope * (index ? 0.72 : -0.28);
      } else if (activeSkill?.source === "mouth") {
        arm.pivot.rotation.z += (index ? -1 : 1) * attackEnvelope * 0.22;
      }
    }
    if (rag) {
      arm.pivot.rotation.x += rag.arms[index].x.value;
      arm.pivot.rotation.z += rag.arms[index].z.value;
      arm.elbow.rotation.x += rag.arms[index].elbowX.value;
      arm.elbow.rotation.z += rag.arms[index].elbowZ.value;
    }
  });
  if (attacking && activeSkill?.type === "melee") {
    rig.legs.forEach((leg, index) => {
      leg.pivot.rotation.z += index === 0 ? -attackEnvelope * 0.78 : attackEnvelope * 0.18;
    });
  }
  if (rag) {
    rig.legs.forEach((leg, index) => {
      leg.pivot.rotation.x += rag.legs[index].x.value;
      leg.pivot.rotation.z += rag.legs[index].z.value;
    });
    rig.headRig.rotation.x = (softMotion?.headLag.value || 0) + rag.headX.value;
    rig.headRig.rotation.y = -bodyTwist * 0.48;
    rig.headRig.rotation.z = -bodyRoll * 0.42 + rag.headZ.value;
    entity.animationState = rag.state === "active" ? entity.animationState : `ragdoll-${rag.state}`;
    mesh.userData.animationState = entity.animationState;
  }
  rig.speedTrails.visible = speed > 700 && !["charge", "idle"].includes(animationState);
  if (actorKey === "player") {
    const selector = document.querySelector("#playerBodyType");
    selector.dataset.animation = mesh.userData.animationState;
    selector.dataset.ragdollState = rag?.state || "active";
    selector.dataset.controlLocked = String(Boolean(entity.ragdollControlLocked));
    selector.dataset.commandedSpeed = String(Math.round(entity.speed || 0));
    selector.dataset.kneeFlex = "0"; selector.dataset.kneeExtension = "0";
    selector.dataset.gaitForward = gait.forward.toFixed(2); selector.dataset.gaitBackward = gait.backward.toFixed(2);
    selector.dataset.gaitLateral = (gait.lateral * gait.lateralDirection).toFixed(2);
    selector.dataset.bodySway = bodyWag.toFixed(2);
    selector.dataset.bodyTwist = bodyTwist.toFixed(3);
    selector.dataset.bodyBounce = bob.toFixed(2);
  }
}

function animateCat(mesh, entity, dt = 1 / 60, actorKey = "player") {
  const rig = mesh.userData.catRig; if (!rig) return;
  const speed = entity.actualSpeed ?? entity.speed ?? 0;
  const action = entity.groundAction || "run";
  const airborne = (entity.altitude || 0) > 1;
  const knockedPose = ["falling", "down", "getting-up"].includes(action);
  const moving = speed > 38 && !knockedPose;
  const sprint = THREE.MathUtils.clamp((speed - 210) / 650, 0, 1);
  const cadence = moving ? THREE.MathUtils.clamp(1.8 + speed / 430, 2.1, 5.4) : 0;
  entity.gaitPhase = ((entity.gaitPhase || 0) + dt * cadence) % 1;
  const cycle = (entity.gaitPhase || 0) * Math.PI * 2;
  const duel = world.duel;
  const attacking = duel.active && elapsed < (duel[`${actorKey}AttackUntil`] || 0);
  const skill = SKILLS[duel[`${actorKey}ActiveSkillId`]];
  const attackStart = duel[`${actorKey}AttackStartedAt`] || elapsed;
  const attackEnd = duel[`${actorKey}AttackUntil`] || elapsed;
  const attackProgress = attacking ? THREE.MathUtils.clamp((elapsed - attackStart) / Math.max(0.08, attackEnd - attackStart), 0, 1) : 0;
  const attackEnvelope = Math.sin(attackProgress * Math.PI);
  const slip = angleDelta(entity.moveAngle ?? entity.angle ?? 0, entity.angle || 0);
  const gait = directionalGait(slip, speed);
  const bob = moving && !airborne ? Math.abs(Math.sin(cycle * 2)) * (1.1 + sprint * 1.5) : 0;
  const lateralShift = moving ? Math.sin(cycle) * (0.9 + sprint * 1.4) : 0;
  const bodyPitch = moving ? Math.sin(cycle * 2 + 0.35) * (0.025 + sprint * 0.035) : 0;
  const bodyRoll = moving ? Math.sin(cycle) * (0.035 + sprint * 0.045) : 0;
  const impactAngle = duel[`${actorKey}ImpactAngle`] || 0;
  const impactStrength = duel[`${actorKey}ImpactStrength`] || 0;
  const down = knockedPose ? (entity.ragdollDown || 0) : 0;
  const knockPose = quadrupedKnockdownPose(impactAngle, impactStrength, down, actorKey === "player" ? 1 : -1);
  const crouch = action === "charge" ? 6 : knockPose.crouch;

  rig.body.position.set(0, 42 - bob - crouch, lateralShift);
  rig.body.rotation.set(bodyRoll * (1 - down), 0, bodyPitch * (1 - down) - (action === "charge" ? 0.1 : 0));
  rig.chest.position.set(20, 44 - bob * 0.72 - crouch, lateralShift * -0.35);
  rig.chest.rotation.set(-bodyRoll * 0.6 * (1 - down), 0, -bodyPitch * 0.6 * (1 - down) + down * 0.12 * Math.cos(impactAngle));
  rig.headRig.position.set(39 + (attacking && skill?.source === "mouth" ? attackEnvelope * 8 : 0), 62 - bob * 0.42 - crouch * 0.55, -lateralShift * 0.42);
  rig.headRig.rotation.set(-bodyRoll * 0.35 * (1 - down), 0, -bodyPitch * 0.55 * (1 - down) + down * 0.18);

  const phaseOffsetsWalk = [0, 0.5, 0.75, 0.25];
  const phaseOffsetsTrot = [0, 0.5, 0.5, 0];
  rig.legs.forEach((leg, index) => {
    const phaseOffset = THREE.MathUtils.lerp(phaseOffsetsWalk[index], phaseOffsetsTrot[index], sprint);
    const legCycle = cycle + phaseOffset * Math.PI * 2;
    const swing = moving ? Math.sin(legCycle) * (0.32 + sprint * 0.4) : 0;
    const lift = moving ? Math.max(0, Math.sin(legCycle)) : 0;
    leg.pivot.position.set(leg.base.x, leg.base.y - bob * 0.45 - crouch, leg.base.z + lateralShift * 0.22);
    const flankTuck = knockedPose ? leg.side * Math.sign(knockPose.roll || leg.side) * down * 0.46 : 0;
    const collapse = index < 2 ? -0.58 - Math.max(0, Math.cos(impactAngle)) * 0.24 : 0.5 + Math.max(0, -Math.cos(impactAngle)) * 0.24;
    leg.pivot.rotation.set(flankTuck, 0, knockedPose ? collapse * down : airborne ? (index < 2 ? -0.5 : 0.58) : swing);
    leg.knee.rotation.z = knockedPose ? 0.32 + down * (0.72 + (index % 2) * 0.12) : airborne ? 0.86 : 0.26 + lift * (0.52 + sprint * 0.28);
    leg.paw.rotation.z = knockedPose ? -0.4 : -leg.knee.rotation.z * 0.52;
    leg.paw.scale.set(1.15 + (1 - lift) * 0.04, 0.72 - (1 - lift) * 0.04, 1.08);
    if (attacking && skill?.source === "wing" && index === (actorKey === "player" ? 0 : 1)) {
      leg.pivot.rotation.z -= attackEnvelope * 1.05;
      leg.knee.rotation.z = 0.18 + attackEnvelope * 0.25;
    }
    if (attacking && skill?.source === "paws" && index >= 2) leg.pivot.rotation.z += attackEnvelope * 0.72;
  });

  rig.tailSegments.forEach((segment, index) => {
    segment.rotation.y = Math.sin(elapsed * (moving ? 8 : 3.2) - index * 0.55) * (0.18 + sprint * 0.13);
    segment.rotation.z = 0.18 + Math.sin(elapsed * 2.4 - index * 0.7) * 0.12;
  });
  rig.speedTrails.visible = speed > 760 && !knockedPose;
  const animationState = knockedPose ? `ragdoll-${action}` : action === "dodge" ? "dodge" : action === "pounce" || airborne ? "pounce" : !moving ? "idle" : gait.state;
  entity.animationState = animationState; mesh.userData.animationState = animationState;
  entity.groundLean = action === "charge" ? 0.12 : action === "pounce" ? -0.2 : THREE.MathUtils.clamp(-(entity.speedDelta || 0) / 1900, -0.08, 0.12);
  {
    const selector = document.querySelector(actorKey === "player" ? "#playerBodyType" : "#rivalBodyType");
    selector.dataset.animation = animationState;
    selector.dataset.rig = "procedural-articulated-quadruped";
    selector.dataset.joints = "8";
    selector.dataset.actualSpeed = speed.toFixed(2);
    selector.dataset.gaitForward = gait.forward.toFixed(2);
    selector.dataset.gaitBackward = gait.backward.toFixed(2);
    selector.dataset.gaitLateral = (gait.lateral * gait.lateralDirection).toFixed(2);
    selector.dataset.ragdollState = entity.ragdollState || "active";
    selector.dataset.controlLocked = String(Boolean(entity.ragdollControlLocked));
    selector.dataset.patternMode = "surface-painted";
  }
}

function animateBiped(mesh, entity, dt = 1 / 60, actorKey = "player") {
  const rig = mesh.userData.stickRig; if (!rig) return;
  const commandedSpeed = entity.speed || 0;
  const speed = entity.actualSpeed ?? commandedSpeed;
  const airborne = (entity.altitude || 0) > 1, bodyAction = entity.groundAction || "run";
  const hit = world.duel.active && elapsed < (world.duel[`${actorKey}HitUntil`] || 0);
  const reaction = hit ? world.duel[`${actorKey}Reaction`] : "none";
  const impactAngle = world.duel[`${actorKey}ImpactAngle`] || 0;
  const activeSkillId = world.duel[`${actorKey}AimingSkillId`] || world.duel[`${actorKey}ActiveSkillId`];
  const activeSkill = SKILLS[activeSkillId];
  const attacking = world.duel.active && elapsed < (world.duel[`${actorKey}AttackUntil`] || 0);
  const movementSlip = angleDelta(entity.moveAngle ?? entity.angle, entity.angle || 0);
  const gaitDirection = directionalGait(movementSlip, speed);
  const { forward: forwardAmount, backward: backwardAmount, lateral: strafeAmount, lateralDirection: strafeDirection } = gaitDirection;
  const attackStart = world.duel[`${actorKey}AttackStartedAt`] || elapsed;
  const attackEnd = world.duel[`${actorKey}AttackUntil`] || elapsed;
  const attackProgress = attacking ? THREE.MathUtils.clamp((elapsed - attackStart) / Math.max(0.08, attackEnd - attackStart), 0, 1) : 0;
  const strikeEnvelope = attacking ? Math.sin(attackProgress * Math.PI) : 0;
  const throwing = attacking && activeSkill?.gesture === "throw";
  const foragePose = ["sniffing", "tasting", "eating"].includes(entity.forageState);
  const knockedPose = ["falling", "down", "getting-up"].includes(bodyAction);
  const animationState = knockedPose ? `ragdoll-${bodyAction}`
    : bodyAction === "charge" ? "charge"
    : bodyAction === "pounce" ? "pounce"
      : bodyAction === "dodge" ? "dodge"
        : airborne ? "jump"
          // Skill gestures are an upper-body overlay while moving.  The old
          // ordering replaced the whole running clip with a planted attack
          // pose every time a projectile was fired, which looked frozen.
          : attacking && speed < 90 ? (throwing ? "throw" : "attack")
            : gaitDirection.state;
  entity.animationState = animationState;
  mesh.userData.animationState = animationState;

  // Fixed animation clips: the brain selects a state; this layer owns joint motion.
  const sideStepping = animationState === "strafe-left" || animationState === "strafe-right";
  const locomoting = ["walk", "run", "backpedal", "strafe-left", "strafe-right"].includes(animationState);
  const cycleHz = animationState === "run" ? THREE.MathUtils.clamp(1.8 + speed / 620, 2.15, 4.65)
    : animationState === "backpedal" ? THREE.MathUtils.clamp(1.25 + speed / 850, 1.45, 3.05)
    : sideStepping ? THREE.MathUtils.clamp(1.4 + speed / 790, 1.58, 3.2)
    : animationState === "walk" ? THREE.MathUtils.clamp(0.75 + speed / 520, 0.82, 1.55) : 0;
  entity.gaitPhase = ((entity.gaitPhase || 0) + dt * cycleHz) % 1;
  const phase = entity.gaitPhase || 0;
  const leapPhase = THREE.MathUtils.clamp(0.5 - (entity.verticalSpeed || 0) / 1450, 0.05, 0.95);
  const crouch = animationState === "charge" ? 15 : animationState === "dodge" ? 7 : 0;
  const runFlightPhase = animationState === "run" && ((phase >= 0.38 && phase < 0.5) || phase >= 0.88);
  const bobAmount = animationState === "run" ? 2.8 : animationState === "backpedal" ? 1.1 : sideStepping ? 1.35 : animationState === "walk" ? 1.8 : 0;
  const bob = airborne ? 0 : Math.abs(Math.sin(phase * Math.PI * 2)) * bobAmount;
  // Walking needs enough hip height for the stance knee to approach extension.
  // The old fixed height of 58 forced both 61-unit legs into a permanent squat.
  // Corgi-like plush proportions: a low pelvis and genuinely short legs.  This
  // is a skeleton change, not merely a wider skin around the old tall rig.
  const standingHeight = ["idle", "walk", "backpedal"].includes(animationState) ? 68 : animationState === "run" ? 66 : sideStepping ? 66 : 62;
  const lateralWeightShift = sideStepping ? -strafeDirection * Math.sin(phase * Math.PI * 2) * 2.7 : 0;
  const pelvis = new THREE.Vector3(animationState === "charge" ? -6 : 0, standingHeight - crouch - bob + (runFlightPhase ? 5.8 : 0), lateralWeightShift);
  const speedLean = THREE.MathUtils.clamp((speed - 300) / 130, 0, 7);
  const lean = reaction === "recoil" ? -15 : animationState === "pounce" ? 22 : animationState === "dodge" ? 14 : animationState === "run" ? 9 + speedLean : animationState === "backpedal" ? 2 : sideStepping ? 4 : animationState === "walk" ? 3 : 0;
  const throwingSide = actorKey === "player" ? -1 : 1;
  const torsoCoil = throwing ? Math.sin(attackProgress * Math.PI) * 8 * throwingSide : 0;
  const lateralTorsoLean = sideStepping ? -strafeDirection * 2.3 : 0;
  const neck = new THREE.Vector3(pelvis.x + lean + (foragePose ? 7 : 0), pelvis.y + 43 - (foragePose ? 5 : 0), torsoCoil + lateralTorsoLean);
  const head = new THREE.Vector3(neck.x + (animationState === "pounce" ? 6 : foragePose ? 13 : 2), neck.y + 19 - (foragePose ? 14 : 0), torsoCoil * 0.55 + lateralTorsoLean * 1.25);

  rig.pelvis.position.copy(pelvis); rig.neck.position.copy(neck); rig.headRig.position.copy(head);
  rig.torso.position.copy(pelvis).lerp(neck, 0.52); rig.torso.rotation.z = -Math.atan2(neck.x - pelvis.x, neck.y - pelvis.y);
  placeStickBone(rig.spine, pelvis, neck);

  let maximumKneeFlex = 0, minimumKneeFlex = 180;
  rig.legs.forEach((leg, index) => {
    const side = index ? 1 : -1;
    const hip = pelvis.clone().add(new THREE.Vector3(-1, -1, side * 8));
    let ankle = new THREE.Vector3(hip.x + (index ? -3 : 3), 5, side * 8);
    let knee;
    if (knockedPose) {
      // The articulated fighter keeps its own hit character: the legs lose
      // their running cycle, separate according to impact direction, then
      // draw back underneath the pelvis during the get-up phase.
      const downness = THREE.MathUtils.clamp(entity.ragdollDown || 0, 0, 1);
      const sideSpread = 12 + downness * 17;
      const frontSpread = (index ? -1 : 1) * (18 + downness * 23);
      ankle.set(hip.x + frontSpread, Math.max(4, hip.y - 20 - downness * 12), side * sideSpread + Math.sin(impactAngle) * 8);
      if (bodyAction === "getting-up") ankle.x = THREE.MathUtils.lerp(ankle.x, hip.x + (index ? -15 : 21), 0.58);
      knee = solveBipedKnee(hip, ankle, 32, 31);
      knee.z += side * 5 * downness;
    } else if (locomoting) {
      const legPhase = (phase + index * 0.5) % 1;
      const forwardRun = animationState === "run";
      const speedStride = THREE.MathUtils.clamp((speed - 280) / 1250, 0, 1);

      // Forward gait: long rearward push and a high, flexed recovery swing.
      const forwardStanceEnd = forwardRun ? 0.39 : 0.62;
      const forwardFront = forwardRun ? 38 + speedStride * 18 : 25;
      const forwardBack = forwardRun ? -42 - speedStride * 18 : -23;
      let forwardX, forwardLift;
      if (legPhase < forwardStanceEnd) {
        const t = legPhase / forwardStanceEnd;
        forwardX = THREE.MathUtils.lerp(forwardFront, forwardBack, t);
        forwardLift = forwardRun ? Math.pow(t, 4) * 9 : Math.sin(t * Math.PI) * 0.6;
      } else {
        let t = (legPhase - forwardStanceEnd) / (1 - forwardStanceEnd); t = t * t * (3 - 2 * t);
        forwardX = THREE.MathUtils.lerp(forwardBack, forwardFront, t);
        forwardLift = Math.sin(t * Math.PI) * (forwardRun ? 36 + speedStride * 23 : 16)
          + (forwardRun ? Math.sin(Math.min(1, t * 1.8) * Math.PI) * 7 : 0);
      }

      // Backward gait is not a reversed forward run.  It uses a shorter step,
      // lower toe clearance and less hip/knee excursion, with the foot reaching
      // behind the body during swing before accepting weight.
      const backwardStanceEnd = 0.58;
      let backwardX, backwardLift;
      if (legPhase < backwardStanceEnd) {
        const t = legPhase / backwardStanceEnd;
        backwardX = THREE.MathUtils.lerp(-24 - speedStride * 5, 20 + speedStride * 4, t);
        backwardLift = Math.sin(t * Math.PI) * 0.45;
      } else {
        let t = (legPhase - backwardStanceEnd) / (1 - backwardStanceEnd); t = t * t * (3 - 2 * t);
        backwardX = THREE.MathUtils.lerp(20 + speedStride * 4, -24 - speedStride * 5, t);
        backwardLift = Math.sin(t * Math.PI) * (18 + speedStride * 7);
      }

      // Side step: first shift weight to the stance leg, then let the leading
      // foot widen the base while the trailing foot follows.  This avoids the
      // old illusion of a forward-running clip sliding sideways.
      const leadingLeg = side === strafeDirection;
      const sideStanceEnd = 0.56;
      let lateralZ, lateralLift;
      if (legPhase < sideStanceEnd) {
        const t = legPhase / sideStanceEnd;
        lateralZ = THREE.MathUtils.lerp(leadingLeg ? 25 : 12, leadingLeg ? -10 : -20, t);
        lateralLift = Math.sin(t * Math.PI) * 0.5;
      } else {
        let t = (legPhase - sideStanceEnd) / (1 - sideStanceEnd); t = t * t * (3 - 2 * t);
        lateralZ = THREE.MathUtils.lerp(leadingLeg ? -10 : -20, leadingLeg ? 25 : 12, t);
        lateralLift = Math.sin(t * Math.PI) * (leadingLeg ? 22 : 16);
      }

      const sagittalX = forwardX * forwardAmount + backwardX * backwardAmount;
      const neutralX = (index ? -4 : 4) + Math.sin(legPhase * Math.PI * 2) * strafeAmount * 2;
      ankle.x = hip.x + sagittalX + neutralX * strafeAmount;
      ankle.z = hip.z + lateralZ * strafeDirection * strafeAmount;
      ankle.y = 5 + Math.max(forwardLift * forwardAmount, backwardLift * backwardAmount, lateralLift * strafeAmount);
      const longStride = forwardRun && forwardAmount > 0.45;
      knee = solveBipedKnee(hip, ankle, longStride ? 33 : 31.5, longStride ? 32 : 30.5);
      knee.z = THREE.MathUtils.lerp(hip.z, ankle.z, sideStepping ? 0.5 : 0.22) + side * (sideStepping ? 2.4 : 0.8);
    } else if (animationState === "charge") {
      ankle.set(hip.x + (index ? -31 : 32), 5, side * 8); knee = solveBipedKnee(hip, ankle, 33, 31);
    } else if (animationState === "pounce") {
      // Run-up momentum moves the root; the limbs now pass through take-off,
      // airborne drive and landing preparation instead of freezing in one pose.
      const lead = index === 0;
      const drive = Math.sin(leapPhase * Math.PI);
      ankle.set(
        hip.x + (lead ? THREE.MathUtils.lerp(18, 57, leapPhase) : THREE.MathUtils.lerp(-48, -17, leapPhase)),
        hip.y + (lead ? -18 + drive * 23 : -30 + drive * 10),
        side * 8,
      );
      knee = solveBipedKnee(hip, ankle, 32, 31);
    } else if (["jump", "dodge"].includes(animationState)) {
      const lead = index === 0;
      ankle.set(hip.x + (lead ? 24 + leapPhase * 18 : -35 + leapPhase * 15), hip.y - 19 + Math.sin(leapPhase * Math.PI) * (lead ? 20 : 10), side * 8);
      knee = solveBipedKnee(hip, ankle, 32, 31);
    } else {
      // Idle knees retain a small natural bend instead of locking perfectly straight.
      ankle.set(hip.x + (index ? -7 : 7), 5, side * 8); knee = solveBipedKnee(hip, ankle, 31, 30);
    }
    if (throwing && !airborne) {
      const plant = THREE.MathUtils.smoothstep(attackProgress, 0.05, 0.42);
      ankle.x += (index === 1 ? 15 : -9) * plant;
      knee = solveBipedKnee(hip, ankle, 33, 32);
    }
    if (attacking && activeSkill?.source === "paws") {
      if (index === 0) { ankle.set(hip.x + 58, hip.y + 2, side * 8); knee = solveBipedKnee(hip, ankle, 32, 31); }
      else { ankle.set(hip.x - 25, 5, side * 8); knee = solveBipedKnee(hip, ankle, 32, 31); }
    }
    if (["launch", "tumble"].includes(reaction)) {
      ankle.set(hip.x + (index ? -35 : 35), hip.y + 1, side * 8); knee = solveBipedKnee(hip, ankle, 32, 31);
    }
    const toe = ankle.clone().add(new THREE.Vector3(animationState === "run" ? 16 : 13, animationState === "jump" ? -2 : -1, 0));
    const upperDirection = hip.clone().sub(knee).normalize(), lowerDirection = ankle.clone().sub(knee).normalize();
    const kneeFlex = 180 - THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(upperDirection.dot(lowerDirection), -1, 1)));
    maximumKneeFlex = Math.max(maximumKneeFlex, kneeFlex); minimumKneeFlex = Math.min(minimumKneeFlex, kneeFlex);
    leg.hip.position.copy(hip); leg.knee.position.copy(knee); leg.ankle.position.copy(ankle); leg.toe.position.copy(toe);
    placeStickBone(leg.thigh, hip, knee); placeStickBone(leg.shin, knee, ankle); placeStickBone(leg.foot, ankle, toe);
  });
  mesh.userData.maximumKneeFlex = maximumKneeFlex; mesh.userData.minimumKneeFlex = minimumKneeFlex;
  if (actorKey === "player") {
    const bodySelector = document.querySelector("#playerBodyType");
    bodySelector.dataset.animation = animationState; bodySelector.dataset.kneeFlex = maximumKneeFlex.toFixed(1); bodySelector.dataset.kneeExtension = minimumKneeFlex.toFixed(1);
    bodySelector.dataset.gaitForward = forwardAmount.toFixed(2);
    bodySelector.dataset.gaitBackward = backwardAmount.toFixed(2);
    bodySelector.dataset.gaitLateral = (strafeAmount * strafeDirection).toFixed(2);
    bodySelector.dataset.activeGesture = throwing ? "throw" : "";
    bodySelector.dataset.attackProgress = attacking ? attackProgress.toFixed(2) : "0";
    bodySelector.dataset.ragdollState = entity.ragdollState || "active";
    bodySelector.dataset.controlLocked = String(Boolean(entity.ragdollControlLocked));
  }

  rig.arms.forEach((arm, index) => {
    const side = index ? 1 : -1;
    const limbPhase = phase * Math.PI * 2 + index * Math.PI;
    const armSwing = ["walk", "run"].includes(animationState) ? -Math.sin(limbPhase) * (animationState === "run" ? 1 : 0.48) : 0;
    const shoulder = neck.clone().add(new THREE.Vector3(-2, -7, side * 14));
    // Natural running arm carriage: the elbow remains bent and the hand
    // travels from the lower chest to the hip.  It counterbalances the
    // opposite leg instead of repeatedly extending like a punch.
    let elbow = animationState === "run"
      ? new THREE.Vector3(shoulder.x + armSwing * 10, shoulder.y - 18, side * 15)
      : new THREE.Vector3(shoulder.x + armSwing * 12 + 5, shoulder.y - 21, side * 15);
    let wrist = animationState === "run"
      ? new THREE.Vector3(shoulder.x + armSwing * 22, shoulder.y - 15 + armSwing * 5, side * 12)
      : new THREE.Vector3(elbow.x + armSwing * 8 + 7, elbow.y - 13, side * 13);
    if (knockedPose) {
      const downness = THREE.MathUtils.clamp(entity.ragdollDown || 0, 0, 1);
      const impactSide = Math.sign(Math.sin(impactAngle) || 1);
      if (bodyAction === "getting-up") {
        // One forearm braces under the chest while the opposite arm protects
        // the head; this reads as an actual recovery instead of standing up by
        // rotating the whole model as one rigid plank.
        const bracing = side === impactSide;
        elbow.set(shoulder.x + (bracing ? 18 : 5), shoulder.y - (bracing ? 24 : 14), side * (bracing ? 19 : 12));
        wrist.set(shoulder.x + (bracing ? 31 : 15), shoulder.y - (bracing ? 37 : 5), side * (bracing ? 23 : 7));
      } else {
        const thrownSide = side === impactSide ? 1 : -1;
        elbow.set(shoulder.x - 7 + thrownSide * 9 * downness, shoulder.y - 15 + thrownSide * 8, side * (18 + 8 * downness));
        wrist.set(shoulder.x - 15 + thrownSide * 18 * downness, shoulder.y - 25 + thrownSide * 12, side * (22 + 13 * downness));
      }
    }
    if (animationState === "backpedal") {
      // A backward fighter keeps the hands protecting the head; the compact
      // alternating pulse balances short retreating steps without looking as
      // though the forward-running animation is simply playing in reverse.
      const guardPulse = Math.sin(limbPhase) * 2.5;
      elbow.set(shoulder.x + 4 + guardPulse, shoulder.y - 17, side * 17);
      wrist.set(neck.x + 13 + guardPulse, neck.y - 13 + index * 3, side * 8);
    }
    if (sideStepping) {
      // Mirror the guard with travel direction: the leading-side hand probes
      // forward while the trailing-side hand stays nearer the face.
      const leadingArm = side === strafeDirection;
      const guardPulse = Math.sin(limbPhase) * 2.2;
      elbow.set(shoulder.x + (leadingArm ? 11 : 4) + guardPulse, shoulder.y - (leadingArm ? 15 : 18), side * 17);
      wrist.set(neck.x + (leadingArm ? 21 : 12) + guardPulse, neck.y - (leadingArm ? 18 : 10), side * (leadingArm ? 10 : 7));
    }
    if (animationState === "charge") { elbow.set(shoulder.x - 18, shoulder.y - 10, side * 17); wrist.set(shoulder.x - 31, shoulder.y + 4, side * 13); }
    if (animationState === "pounce") {
      if (index === 0) {
        const reach = THREE.MathUtils.smoothstep(leapPhase, 0.22, 0.72);
        elbow.set(shoulder.x + THREE.MathUtils.lerp(-12, 28, reach), shoulder.y + THREE.MathUtils.lerp(-17, 1, reach), side * 13);
        wrist.set(shoulder.x + THREE.MathUtils.lerp(-22, 57, reach), shoulder.y + THREE.MathUtils.lerp(-5, 3, reach), side * 9);
      } else {
        elbow.set(shoulder.x + 3, shoulder.y - 18, side * 18);
        wrist.set(neck.x + 15, neck.y - 16, side * 9);
      }
    }
    if (animationState === "dodge") { elbow.set(shoulder.x + 12, shoulder.y - 15, side * 17); wrist.set(neck.x + 19, neck.y - 18, side * 7); }
    if (throwing) {
      const throwingArm = actorKey === "player" ? 0 : 1;
      if (index === throwingArm) {
        const pose = (from, to, value) => from.clone().lerp(to, THREE.MathUtils.smoothstep(value, 0, 1));
        const baseElbow = elbow.clone(), baseWrist = wrist.clone();
        const windElbow = new THREE.Vector3(shoulder.x - 17, shoulder.y + 3, side * 21);
        const windWrist = new THREE.Vector3(shoulder.x - 31, shoulder.y + 15, side * 14);
        const cockElbow = new THREE.Vector3(shoulder.x + 18, shoulder.y + 5, side * 20);
        const cockWrist = new THREE.Vector3(shoulder.x - 2, shoulder.y + 20, side * 13);
        const releaseElbow = new THREE.Vector3(shoulder.x + 34, shoulder.y - 1, side * 12);
        const releaseWrist = new THREE.Vector3(shoulder.x + 64, shoulder.y + 2, side * 7);
        const followElbow = new THREE.Vector3(shoulder.x + 27, shoulder.y - 13, -side * 4);
        const followWrist = new THREE.Vector3(shoulder.x + 43, shoulder.y - 25, -side * 11);
        if (attackProgress < 0.26) {
          elbow.copy(pose(baseElbow, windElbow, attackProgress / 0.26)); wrist.copy(pose(baseWrist, windWrist, attackProgress / 0.26));
        } else if (attackProgress < 0.5) {
          elbow.copy(pose(windElbow, cockElbow, (attackProgress - 0.26) / 0.24)); wrist.copy(pose(windWrist, cockWrist, (attackProgress - 0.26) / 0.24));
        } else if (attackProgress < 0.68) {
          elbow.copy(pose(cockElbow, releaseElbow, (attackProgress - 0.5) / 0.18)); wrist.copy(pose(cockWrist, releaseWrist, (attackProgress - 0.5) / 0.18));
        } else {
          elbow.copy(pose(releaseElbow, followElbow, (attackProgress - 0.68) / 0.32)); wrist.copy(pose(releaseWrist, followWrist, (attackProgress - 0.68) / 0.32));
        }
      } else {
        elbow.set(shoulder.x + 6, shoulder.y - 17, side * 17);
        wrist.set(neck.x + 15, neck.y - 16, side * 8);
      }
    } else if (attacking && activeSkill?.source === "wing") {
      // One arm performs the cast while the opposite arm protects the face.
      // Extending both arms made every projectile look like a stiff two-handed
      // shove, especially when the character was airborne.
      const strikingArm = actorKey === "player" ? 0 : 1;
      if (index === strikingArm) {
        elbow.lerp(new THREE.Vector3(shoulder.x + 29, shoulder.y - 7, side * 11), strikeEnvelope);
        wrist.lerp(new THREE.Vector3(shoulder.x + 57, shoulder.y - 2, side * 7), strikeEnvelope);
      } else {
        elbow.lerp(new THREE.Vector3(shoulder.x + 8, shoulder.y - 18, side * 16), strikeEnvelope);
        wrist.lerp(new THREE.Vector3(neck.x + 17, neck.y - 17, side * 7), strikeEnvelope);
      }
    }
    if (attacking && activeSkill?.source === "paws") {
      const strikingArm = actorKey === "player" ? 0 : 1;
      if (index === strikingArm) {
        elbow.lerp(new THREE.Vector3(shoulder.x + 24, shoulder.y + 2, side * 11), strikeEnvelope);
        wrist.lerp(new THREE.Vector3(shoulder.x + 49, shoulder.y + 13, side * 8), strikeEnvelope);
      } else {
        elbow.lerp(new THREE.Vector3(shoulder.x + 3, shoulder.y - 17, side * 17), strikeEnvelope);
        wrist.lerp(new THREE.Vector3(neck.x + 15, neck.y - 15, side * 8), strikeEnvelope);
      }
    }
    if (!knockedPose && ["recoil", "burn"].includes(reaction)) { elbow.set(shoulder.x - 19, shoulder.y + (index ? -12 : 5), side * 18); wrist.set(shoulder.x - 31, shoulder.y + (index ? 4 : -21), side * 12); }
    arm.shoulder.position.copy(shoulder); arm.elbow.position.copy(elbow); arm.wrist.position.copy(wrist); arm.palm.position.copy(wrist).add(new THREE.Vector3(4, 0, 0));
    placeStickBone(arm.upper, shoulder, elbow); placeStickBone(arm.forearm, elbow, wrist);
  });

  const showTrails = speed > 760 && !["charge", "idle"].includes(animationState);
  rig.speedTrails.visible = showTrails;
  if (showTrails) rig.speedTrails.children.forEach((trail, index) => {
    trail.position.x = pelvis.x - 48 - index * 14; trail.position.y = pelvis.y + 2 + index * 18;
    trail.material.opacity = 0.2 + (Math.sin(elapsed * 18 + index * 1.7) + 1) * 0.15;
    trail.scale.y = 0.9 + Math.min(1.3, speed / 900);
  });
  entity.groundLean = animationState === "charge" ? 0.16 : animationState === "pounce" ? -0.22 : THREE.MathUtils.clamp(-(entity.speedDelta || 0) / 1700, -0.1, 0.14);
}

function startDuel() {
  clearSkillEffects();
  Object.assign(world.interaction, { reaction: null, pendingReaction: null, reactionUntil: 0, callUntil: 0, commandUntil: 0 });
  const playerElement = document.querySelector("#duelPlayerElement").value;
  const rivalElement = document.querySelector("#duelRivalElement").value;
  biology.element = playerElement; document.querySelector("#creatureElement").value = playerElement; refreshCreatureMesh();
  world.duel.rival.element = rivalElement;
  const playerProfile = fighterProfile("player"), rivalProfile = fighterProfile("rival"), rival = world.duel.rival;
  Object.assign(world.creature, { ragdollState: "active", ragdollDown: 0, ragdollControlLocked: false });
  Object.assign(rival, { ragdollState: "active", ragdollDown: 0, ragdollControlLocked: false });
  world.duel.active = true; world.duel.result = "fighting"; world.duel.pursuit = document.querySelector("#duelPursuit").value;
  world.duel.playerMaxHealth = playerProfile.health; world.duel.playerHealth = playerProfile.health; world.duel.nextPlayerSkillAt = elapsed + 1.8;
  rivalBrain?.reset();
  Object.assign(world.duel, { startedAt: elapsed, phase: "opening", playerTactic: "search", rivalTactic: "search", playerMotor: { x: 1, y: 0, speed: 260, verticalTarget: 360, mode: "search", evasionMode: "lateral" }, rivalMotor: { x: -1, y: 0, speed: 260, verticalTarget: 720, mode: "search", evasionMode: "lateral" }, playerAttackStartedAt: 0, rivalAttackStartedAt: 0, playerAttackUntil: 0, rivalAttackUntil: 0, playerActiveSkillId: null, rivalActiveSkillId: null, playerHitUntil: 0, rivalHitUntil: 0, playerHitStartedAt: 0, rivalHitStartedAt: 0, playerStunUntil: 0, rivalStunUntil: 0, playerKnockback: { x: 0, y: 0 }, rivalKnockback: { x: 0, y: 0 }, pendingAttacks: [], playerReaction: "none", rivalReaction: "none", playerDodgeUntil: 0, rivalDodgeUntil: 0, playerDodgeStartsAt: 0, rivalDodgeStartsAt: 0, playerDodgeAltitude: 360, rivalDodgeAltitude: 720, playerAltitudeTarget: 360, rivalAltitudeTarget: 720, playerOrbit: Math.random() < 0.5 ? -1 : 1, rivalOrbit: Math.random() < 0.5 ? -1 : 1, playerLockedOn: false, rivalLockedOn: false, playerLastSeen: null, rivalLastSeen: null, playerLostSightAt: 0, rivalLostSightAt: 0, playerTrackingUntil: 0, rivalTrackingUntil: 0, contactEstablished: false, lastContactAt: elapsed, lastPressureAt: elapsed, reengageLogAt: 0, contactCooldownUntil: 0, playerRammingUntil: 0, rivalRammingUntil: 0 });
  world.duel.playerAimingSkillId = null; world.duel.rivalAimingSkillId = null;
  world.duel.playerLastDamageCastAt = elapsed; world.duel.rivalLastDamageCastAt = elapsed;
  world.duel.playerPlannedSkillId = null; world.duel.rivalPlannedSkillId = null;
  world.duel.playerSkillPlanUntil = 0; world.duel.rivalSkillPlanUntil = 0;
  world.duel.playerKnockedDown = false; world.duel.rivalKnockedDown = false;
  world.duel.playerDownStartedAt = 0; world.duel.rivalDownStartedAt = 0;
  world.duel.playerDownUntil = 0; world.duel.rivalDownUntil = 0;
  world.duel.playerNextLeapAt = elapsed + (isGroundBodyType(playerBodyType) ? 1.7 + Math.random() * 0.5 : 3.5 + Math.random() * 2.5);
  world.duel.playerNextDodgeJumpAt = 0;
  world.duel.playerPounceUntil = 0; world.duel.playerPounceHit = false;
  Object.assign(rival, { x: WORLD_W / 2 + 400, y: WORLD_H / 2 + 620, angle: Math.PI, lookAngle: Math.PI, moveAngle: Math.PI, altitude: isGroundBodyType(rivalBodyType) ? 0 : isGroundBodyType(playerBodyType) ? 360 : 650, verticalSpeed: 0, element: rivalElement, health: rivalProfile.health, maxHealth: rivalProfile.health, defense: rivalProfile.defense, stamina: 1, fatigue: 0.08, speed: 0, actualSpeed: 0, nextSkillAt: elapsed + 2.0, groundAction: "run", nextLeapAt: elapsed + 2.2 + Math.random() * 1.8 });
  world.creature.x = WORLD_W / 2 - 400; world.creature.y = WORLD_H / 2 + 620; world.creature.angle = 0; world.creature.lookAngle = 0; world.creature.moveAngle = 0;
  world.creature.altitude = isGroundBodyType(playerBodyType) ? 0 : 350; world.creature.verticalSpeed = 0; world.creature.flying = !isGroundBodyType(playerBodyType); world.creature.flightCommand = "auto";
  const playerPersonality = document.querySelector("#duelPlayerPersonality").value;
  const rivalPersonality = document.querySelector("#duelRivalPersonality").value;
  world.duel.playerCombatState = createCombatState(world.creature, memory.rememberedPressure, playerPersonality);
  world.duel.rivalCombatState = createCombatState(rival, 0.5 + Math.random() * 0.2, rivalPersonality);
  // A duel camera must frame both combatants. The side camera is useful for
  // inspecting one gait, but it hides a fast opponent once the arena opens up.
  setCameraMode("combat", true);
  window.scrollTo({ top: 0, behavior: "smooth" });
  rivalSkillSystem = new SkillSystem(); refreshRivalMesh(); duelPlayerMarker.visible = true; duelRivalMarker.visible = true; updateSkillUI(); updateDuelUI(); saveBiology();
  const battleKind = isGroundBodyType(playerBodyType) && isGroundBodyType(rivalBodyType) ? "地面生物高速战"
    : playerBodyType === "aerial" && rivalBodyType === "aerial" ? "三维空战" : "地空混合战";
  addLog(`${battleKind}开始：${collection.species.name} 对 ${SPECIES_BY_ID[rivalSpeciesId].name}。双方使用独立连接组状态；身体决定动作能力，性格与实时实力差决定战斗倾向。练习赛限时90秒，未分胜负时按剩余生命比例判定。`, "system");
  collectionView?.render();
}

function bodyTypeLabel(element, bodyType) {
  return `${ELEMENTS[element].label}属性${bodyType === "corgi" ? "软肚短腿小柯基" : bodyType === "cat" ? "四足软萌小猫" : bodyType === "biped" ? "关节迅影兽" : "绒团萤翼兽"}`;
}

function skillOpportunity(id, range, attacker, target) {
  const skill = SKILLS[id], behavior = DUEL_SKILL_BEHAVIOR[id] || getSkillVisual(id);
  if (!skillInRange(skill, range)) return { viable: false, confidence: 0, window: skillDistanceWindow(skill) };
  const lineAngle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
  const targetMoveAngle = target.moveAngle ?? target.angle ?? lineAngle;
  return estimateShotOpportunity({
    skill, distance: range, projectileSpeed: behavior.speed, hitRadius: behavior.hitRadius,
    targetSpeed: target.speed || 0, targetHeadingOffset: angleDelta(targetMoveAngle, lineAngle),
  });
}

function availableDuelSkill(system, element, range, healthRatio, bodyType = "aerial", attacker, target, disposition = null) {
  const ids = combatLoadout(element, bodyType, attacker === world.duel.rival ? "rival" : "player");
  const aggression = disposition?.attackTendency ?? 0.5;
  const caution = disposition?.dodgeTendency ?? 0.5;
  const usable = ids.filter((id) => {
    const skill = SKILLS[id], state = system.states[id];
    if (state.cooldown > 0) return false;
    if (skill.type === "buff") return healthRatio < 0.62 + caution * 0.2;
    return skillOpportunity(id, range, attacker, target).viable;
  });
  return usable.sort((a, b) => {
    const skillA = SKILLS[a], skillB = SKILLS[b];
    const utility = (id, skill) => {
      const opportunity = skillOpportunity(id, range, attacker, target);
      const window = opportunity.window || skillDistanceWindow(skill);
      const idealError = Number.isFinite(window.ideal) ? Math.abs(range - window.ideal) / Math.max(1, window.max - window.min) : 0;
      return skill.damage * (0.78 + aggression * 0.44) + opportunity.confidence * 15 - idealError * 9
        + (range > 360 && skill.type === "projectile" ? 13 + caution * 10 : 0)
        + (range < 180 && skill.type === "melee" ? 10 + aggression * 16 : 0)
        + (skill.type === "buff" ? caution * 14 : 0);
    };
    return utility(b, skillB) - utility(a, skillA);
  })[0];
}

function chooseDuelSkill(system, element, range, healthRatio, attackerKey, attacker, target) {
  const duel = world.duel;
  const reserved = duel[`${attackerKey}PlannedSkillId`];
  if (reserved && elapsed < (duel[`${attackerKey}SkillPlanUntil`] || 0)) {
    const state = system.states[reserved];
    if (state?.cooldown <= 0 && skillOpportunity(reserved, range, attacker, target).viable) return reserved;
  }
  const mark = SKILLS.scentMark, markState = system.states.scentMark;
  if ((duel[`${attackerKey}TrackingUntil`] || 0) <= elapsed && markState.cooldown <= 0 && skillOpportunity("scentMark", range, attacker, target).viable) {
    duel[`${attackerKey}PlannedSkillId`] = "scentMark"; duel[`${attackerKey}SkillPlanUntil`] = elapsed + 1.15;
    return "scentMark";
  }
  const bodyType = attackerKey === "player" ? playerBodyType : rivalBodyType;
  const disposition = duel[`${attackerKey}CombatState`]?.disposition;
  const selected = availableDuelSkill(system, element, range, healthRatio, bodyType, attacker, target, disposition);
  if (!selected || duel[`${attackerKey}AimingSkillId`] !== selected) duel[`${attackerKey}AimingSkillId`] = null;
  duel[`${attackerKey}PlannedSkillId`] = selected || null;
  duel[`${attackerKey}SkillPlanUntil`] = selected ? elapsed + 0.9 : elapsed + 0.38;
  return selected;
}

function finishDuel(winner) {
  if (!world.duel.active) return;
  world.duel.active = false; world.duel.result = winner;
  const learned = world.duel.playerCombatState;
  if (learned) {
    const attempts = Math.max(1, learned.shots), duration = Math.max(1, elapsed - world.duel.startedAt);
    memory.learnCombatOutcome({
      won: winner === "player" || winner === "rivalEscaped",
      opponentPressure: learned.pressure,
      hitRate: learned.hits / attempts,
      safeRangeSuccess: THREE.MathUtils.clamp(learned.safeSeconds / duration, 0, 1),
    });
    saveMemory();
  }
  const messages = { player: `对战结束：${collection?.species.name || "你的伙伴"}获胜。`, rival: "对战结束：对手获胜，可以培养伙伴后重新挑战。", rivalEscaped: "对手成功逃脱，追击结束。", playerEscaped: "我方脱离战斗，保存了剩余体力。", draw: "练习赛限时平局，双方都积累了经验。" };
  addLog(messages[winner] || "对战结束。", ["player", "rivalEscaped"].includes(winner) ? "feed" : "bitter");
  if (collection) {
    const reward = collection.awardBattle(winner === "player" || winner === "rivalEscaped");
    saveCollection(); collectionView?.notice(reward.message); collectionView?.render(); addLog(reward.message, "feed");
  }
  updateDuelUI();
}

function disposeSkillEffect(effect) {
  skillEffectsGroup?.remove(effect.mesh);
  const geometries = new Set(), materials = new Set();
  effect.mesh.traverse((child) => { if (child.geometry) geometries.add(child.geometry); if (child.material) for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material); });
  geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose());
}

function addActiveSkillEffect(effect) {
  if (activeSkillEffects.length >= 32) disposeSkillEffect(activeSkillEffects.shift());
  skillEffectsGroup.add(effect.mesh); activeSkillEffects.push(effect);
}

function clearSkillEffects() {
  activeSkillEffects.forEach(disposeSkillEffect);
  activeSkillEffects = [];
}

function stopDuel() {
  const duel = world.duel;
  const wasActive = duel.active;
  duel.active = false; if (wasActive) duel.result = "cancelled";
  duel.pendingAttacks = []; clearSkillEffects();
  for (const key of ["player", "rival"]) {
    for (const field of ["AttackUntil", "HitUntil", "StunUntil", "DodgeUntil", "PounceUntil", "RammingUntil", "AimingUntil", "SkillPlanUntil", "TrackingUntil", "DownUntil", "DownStartedAt"]) duel[`${key}${field}`] = 0;
    duel[`${key}KnockedDown`] = false; duel[`${key}Knockback`] = { x: 0, y: 0 };
    duel[`${key}ActiveSkillId`] = null; duel[`${key}AimingSkillId`] = null; duel[`${key}PlannedSkillId`] = null;
  }
  for (const actor of [world.creature, duel.rival]) Object.assign(actor, { speed: 0, actualSpeed: 0, groundAction: "idle", groundActionUntil: 0, jumpIntent: false, ragdollState: "active", ragdollControlLocked: false, ragdollDown: 0 });
  if (rivalMesh) rivalMesh.visible = false;
  if (duelPlayerMarker) duelPlayerMarker.visible = false;
  if (duelRivalMarker) duelRivalMarker.visible = false;
  if (wasActive) { addLog("练习对战已取消，未记为胜负、未发放奖励；可以立即换精灵。", "system"); setCameraMode("follow"); }
  updateDuelUI(); collectionView?.render();
}

function normalized2(x, y, fallbackAngle = 0) {
  const length = Math.hypot(x, y);
  return length > 0.0001 ? { x: x / length, y: y / length } : { x: Math.cos(fallbackAngle), y: Math.sin(fallbackAngle) };
}

function incomingAttackThreat(key, actor) {
  let strongest = null;
  world.duel.pendingAttacks.forEach((attack) => {
    if (attack.defenderKey !== key || !["projectile", "cone", "chain", "mark"].includes(attack.result.skill.type)) return;
    if (elapsed < attack.launchedAt) return;
    const duration = Math.max(0.01, attack.resolvesAt - attack.launchedAt);
    const progress = THREE.MathUtils.clamp((elapsed - attack.launchedAt) / duration, 0, 1);
    const current = {
      x: THREE.MathUtils.lerp(attack.origin.x, attack.aim.x, progress),
      y: THREE.MathUtils.lerp(attack.origin.y, attack.aim.y, progress),
      altitude: THREE.MathUtils.lerp(attack.origin.altitude || 0, attack.aim.altitude || 0, progress),
    };
    const remaining = Math.max(0, attack.resolvesAt - elapsed);
    const pathDistance = pointToFlightPathDistance(actor, current, attack.aim);
    const projectileDistance = distance3D(actor, current);
    if (projectileDistance > combatVisionRange(key) || pathDistance > attack.behavior.hitRadius + 180) return;
    const timeUrgency = THREE.MathUtils.clamp(1.14 - remaining / 1.25, 0.1, 1);
    const pathUrgency = THREE.MathUtils.clamp(1 - pathDistance / (attack.behavior.hitRadius + 180), 0, 1);
    // 气味雾标记不是高伤害弹丸；它较难从视觉上读出，也不应触发和火球相同的全力闪避。
    const severity = timeUrgency * pathUrgency * (attack.result.skill.type === "mark" ? 0.24 : 1);
    if (strongest && strongest.severity >= severity) return;
    const path = normalized2(attack.aim.x - current.x, attack.aim.y - current.y, actor.angle);
    const cross = path.x * (actor.y - current.y) - path.y * (actor.x - current.x);
    const side = Math.abs(cross) < 0.01 ? world.duel[`${key}Orbit`] : Math.sign(cross);
    strongest = {
      severity, remaining,
      lateral: { x: -path.y * side, y: path.x * side },
      verticalSign: (actor.altitude || 0) >= (current.altitude || 0) ? 1 : -1,
      bearing: angleDelta(Math.atan2(current.y - actor.y, current.x - actor.x), actor.angle),
    };
  });
  return strongest;
}

function createCombatState(actor, learnedPressure = 0.5, personality = "balanced") {
  const species = actor === world.creature ? collection?.species : SPECIES_BY_ID[rivalSpeciesId];
  const temperament = species?.personality === personality ? species.temperament : null;
  const baseline = COMBAT_PERSONALITIES[personality] || COMBAT_PERSONALITIES.balanced;
  return {
    waypoint: { ...randomPoint(360) }, waypointAltitude: 80 + Math.random() * (MAX_FLIGHT_ALTITUDE - 150),
    nextWaypointAt: 0, nextNoiseAt: 0, noiseX: 0, noiseY: 0,
    withdrawUntil: 0, repositionUntil: 0, wideUntil: 0, nextWideAt: elapsed + 10 + Math.random() * 7,
    shots: 0, hits: 0, evades: 0, safeSeconds: 0,
    pressure: learnedPressure, lastSeparation: Infinity, phase: "opening",
    personality, personalityLabel: temperament?.label || ({ balanced: "稳健型", brave: "勇猛型", cautious: "谨慎型", curious: "好奇型" })[personality] || "稳健型",
    temperament: temperament ? { label: temperament.label, aggressionOffset: temperament.attackBias - baseline.attackBias, evasionOffset: temperament.dodgeBias - baseline.dodgeBias, patienceOffset: temperament.patience - baseline.patience } : null,
    disposition: null,
    spawn: { x: actor.x, y: actor.y, altitude: actor.altitude || 0 },
  };
}

function chooseCombatWaypoint(key, actor, target, state, strategy) {
  const escaping = strategy.mode === "flee";
  const wide = ["scentKite", "wideReposition", "flee"].includes(strategy.mode);
  let point;
  if (wide && Math.random() < 0.36) {
    // 全地图航点让战斗真正离开出生区，而不是永远绕着对手画圆。
    point = randomPoint(320);
  } else if (target) {
    const angle = Math.random() * Math.PI * 2;
    // Tactical separation must still leave both fighters inside the same
    // engagement pocket. Only a committed escape may choose a remote point.
    const minRange = escaping ? 1550 : wide ? 820 : strategy.mode === "openingProbe" ? 640 : 480;
    const maxRange = escaping ? 2450 : wide ? 1550 : strategy.mode === "openingProbe" ? 1250 : 1500;
    const radius = minRange + Math.random() * (maxRange - minRange);
    point = {
      x: THREE.MathUtils.clamp(target.x + Math.cos(angle) * radius, 180, WORLD_W - 180),
      y: THREE.MathUtils.clamp(target.y + Math.sin(angle) * radius, 180, WORLD_H - 180),
    };
  } else point = randomPoint(320);
  state.waypoint = point;
  const layerRoll = Math.random();
  state.waypointAltitude = layerRoll < 0.2 ? 70 + Math.random() * 220
    : layerRoll > 0.78 ? MAX_FLIGHT_ALTITUDE - 300 + Math.random() * 240
      : 260 + Math.random() * (MAX_FLIGHT_ALTITUDE - 500);
  state.nextWaypointAt = elapsed + (wide ? 3.8 + Math.random() * 4.8 : 2.1 + Math.random() * 3.2);
  if (Math.random() < 0.38) world.duel[`${key}Orbit`] *= -1;
}

function combatStrategy(key, ownRatio, targetRatio, state, ideal) {
  const duel = world.duel, isPlayer = key === "player";
  const battleAge = elapsed - duel.startedAt;
  const disposition = state.disposition || evaluateCombatDisposition({ personality: state.personality });
  const learnedPatience = isPlayer ? memory.probePatience : 0.55;
  const patience = THREE.MathUtils.clamp(disposition.probeTendency * 0.72 + learnedPatience * 0.28, 0.2, 0.95);
  const learnedCounter = isPlayer ? memory.counterRush : 0.5;
  const counterRush = THREE.MathUtils.clamp(disposition.attackTendency * 0.68 + learnedCounter * 0.32, 0, 1);
  const tracking = duel[`${key}TrackingUntil`] > elapsed;
  if (shouldRetreatFromDuel(disposition, ownRatio, targetRatio)) return { mode: "flee", desiredRange: 2400, waypointWeight: 1.7 };
  if (battleAge < 4 + patience * 5 && ownRatio > 0.68 && targetRatio > 0.62) {
    state.phase = "opening";
    return { mode: "openingProbe", desiredRange: THREE.MathUtils.clamp(ideal + 120 + patience * 55, 500, 840), waypointWeight: 0.38 };
  }
  if (tracking && elapsed < state.withdrawUntil) {
    state.phase = "adapt";
    return { mode: "scentKite", desiredRange: 1050 + (isPlayer ? memory.rangeDiscipline : 0.55) * 520, waypointWeight: 1.18 };
  }
  if (elapsed < state.repositionUntil || elapsed < state.wideUntil) {
    state.phase = "adapt";
    return { mode: "wideReposition", desiredRange: tracking ? 980 : 710, waypointWeight: 1.25 };
  }
  if (targetRatio < 0.3 && ownRatio > targetRatio + 0.12 && disposition.pursuitTendency > 0.44) {
    state.phase = "finish";
    return { mode: "intercept", desiredRange: 360, waypointWeight: 0.35 };
  }
  state.phase = "adapt";
  if (state.pressure > 0.61) {
    return counterRush > 0.53
      ? { mode: "adaptiveCounter", desiredRange: 400, waypointWeight: 0.42 }
      : { mode: "wideReposition", desiredRange: tracking ? 1080 : 720, waypointWeight: 1.05 };
  }
  return { mode: "rangeControl", desiredRange: ideal * disposition.preferredRangeScale * (0.92 + (isPlayer ? memory.rangeDiscipline : 0.52) * 0.12), waypointWeight: 0.62 };
}

function continuousCombatMotor(key, actor, target, intent, ideal, profile, dt, neuralOutput = {}, strategy = null) {
  const duel = world.duel, previous = duel[`${key}Motor`] || { x: Math.cos(actor.angle), y: Math.sin(actor.angle), speed: 250, verticalTarget: actor.altitude || 120 };
  const state = duel[`${key}CombatState`];
  strategy ||= { mode: intent, desiredRange: ideal, waypointWeight: 0.4 };
  const element = key === "player" ? biology.element : world.duel.rival.element;
  const reach = combatDamageReach(combatLoadout(element, "aerial", key), SKILLS);
  const attackRange = attackFlightEnvelope({ reach, desiredRange: strategy.desiredRange || ideal, requestedAltitude: actor.altitude || 0, targetAltitude: target?.altitude || 0 });
  if (state && (elapsed >= state.nextWaypointAt || distance(actor, state.waypoint) < 130)) chooseCombatWaypoint(key, actor, target, state, strategy);
  if (state && elapsed >= state.nextNoiseAt) {
    state.noiseX = (Math.random() - 0.5) * 1.35; state.noiseY = (Math.random() - 0.5) * 1.35;
    state.nextNoiseAt = elapsed + 0.42 + Math.random() * 1.15;
  }
  const orbit = duel[`${key}Orbit`] || 1;
  const targetAngle = target ? Math.atan2(target.y - actor.y, target.x - actor.x) : actor.angle;
  const targetMotion = target ? normalized2(Math.cos(target.moveAngle ?? target.angle ?? targetAngle), Math.sin(target.moveAngle ?? target.angle ?? targetAngle), targetAngle) : { x: 0, y: 0 };
  const leadSeconds = target ? THREE.MathUtils.clamp(distance3D(actor, target) / 900, 0.18, 0.72) : 0;
  const aimX = target ? target.x + targetMotion.x * (target.speed || 0) * leadSeconds : actor.x + Math.cos(actor.angle) * 200;
  const aimY = target ? target.y + targetMotion.y * (target.speed || 0) * leadSeconds : actor.y + Math.sin(actor.angle) * 200;
  const toTarget = normalized2(aimX - actor.x, aimY - actor.y, actor.angle);
  const toWaypoint = state ? normalized2(state.waypoint.x - actor.x, state.waypoint.y - actor.y, actor.angle) : toTarget;
  const separation = target ? distance3D(actor, target) : Infinity;
  let desiredX = toWaypoint.x, desiredY = toWaypoint.y, speed = 260, verticalTarget = state?.waypointAltitude ?? previous.verticalTarget ?? actor.altitude, mode = "search";
  let evasionMode = previous.evasionMode || "lateral";

  if (intent === "stunned" || intent === "hold") {
    speed = 0; mode = intent;
  } else if (intent === "downedGuard") {
    desiredX = -toTarget.y * orbit - toTarget.x * (separation < ideal * 0.72 ? 0.38 : 0.05);
    desiredY = toTarget.x * orbit - toTarget.y * (separation < ideal * 0.72 ? 0.38 : 0.05);
    speed = 165; mode = "downedGuard";
  } else if (intent === "search") {
    // 没有实时目标时只飞向最后目击方向，不读取对手的隐藏坐标。
    desiredX = toTarget.x * 0.88 + toWaypoint.x * 0.34 + (state?.noiseX || 0) * 0.14;
    desiredY = toTarget.y * 0.88 + toWaypoint.y * 0.34 + (state?.noiseY || 0) * 0.14;
    speed = 335; mode = "search";
  } else if (intent === "flee") {
    desiredX = -toTarget.x + -toTarget.y * orbit * 0.18;
    desiredY = -toTarget.y + toTarget.x * orbit * 0.18;
    speed = 545; verticalTarget = THREE.MathUtils.clamp((actor.altitude || 0) + orbit * 220, 50, MAX_FLIGHT_ALTITUDE); mode = "flee";
  } else if (intent === "chase") {
    desiredX = toTarget.x + targetMotion.x * 0.42;
    desiredY = toTarget.y + targetMotion.y * 0.42;
    speed = 485; verticalTarget = target?.altitude ?? verticalTarget; mode = "chase";
  } else {
    const desiredRange = attackRange.desiredRange || ideal;
    const rangeError = THREE.MathUtils.clamp((separation - desiredRange) / Math.max(desiredRange, 1), -1.6, 1.6);
    const tangentWeight = 0.2 + (1 - Math.min(1, Math.abs(rangeError))) * 0.36;
    const waypointWeight = strategy.waypointWeight || 0;
    desiredX = toTarget.x * rangeError + -toTarget.y * orbit * tangentWeight + targetMotion.x * 0.2 + toWaypoint.x * waypointWeight + (state?.noiseX || 0) * 0.15;
    desiredY = toTarget.y * rangeError + toTarget.x * orbit * tangentWeight + targetMotion.y * 0.2 + toWaypoint.y * waypointWeight + (state?.noiseY || 0) * 0.15;
    speed = 305 + profile.speed * 0.55 + Math.abs(rangeError) * 105 + (strategy.mode === "wideReposition" ? 82 : 0);
    mode = strategy.mode || (separation < desiredRange * 0.68 ? "breakaway" : separation > desiredRange * 1.32 ? "intercept" : "rangeControl");
    if (target && separation < actor.radius + target.radius + 145) {
      desiredX -= toTarget.x * 2.2; desiredY -= toTarget.y * 2.2;
      verticalTarget = THREE.MathUtils.clamp((actor.altitude || 0) + ((actor.altitude || 0) >= (target.altitude || 0) ? 280 : -280), 50, MAX_FLIGHT_ALTITUDE);
      speed = 525; mode = "collisionAvoidance";
    }
  }

  const threat = intent !== "flee" && intent !== "stunned" ? incomingAttackThreat(key, actor) : null;
  const dodgeTendency = state?.disposition?.dodgeTendency ?? 0.55;
  const emergencyDodge = Boolean(threat && threat.severity > (state?.disposition?.dodgeThreshold ?? 0.14));
  if (emergencyDodge) {
    const lateralPreference = key === "player" ? memory.dodgeLateral : 0.55;
    const verticalPreference = key === "player" ? memory.dodgeVertical : 0.45;
    const neuralGain = 0.72 + (neuralOutput.escape || 0) * 0.9;
    desiredX += threat.lateral.x * (1.1 + lateralPreference * 1.5 + dodgeTendency * 0.5) * threat.severity * neuralGain;
    desiredY += threat.lateral.y * (1.1 + lateralPreference * 1.5 + dodgeTendency * 0.5) * threat.severity * neuralGain;
    verticalTarget = THREE.MathUtils.clamp((actor.altitude || 0) + threat.verticalSign * (140 + verticalPreference * 340) * threat.severity * neuralGain, 50, MAX_FLIGHT_ALTITUDE);
    speed = 520 + threat.severity * 145 * neuralGain;
    evasionMode = verticalPreference > lateralPreference + 0.08 ? "vertical" : "lateral";
    mode = "reflexDodge";
  }

  if (Math.abs(neuralOutput.turn || 0) > 0.015) {
    const bodySide = { x: -Math.sin(actor.angle), y: Math.cos(actor.angle) };
    desiredX += bodySide.x * neuralOutput.turn * 0.85;
    desiredY += bodySide.y * neuralOutput.turn * 0.85;
  }

  const desired = normalized2(desiredX, desiredY, actor.angle);
  speed *= 0.64 + Math.sqrt(Math.max(0, actor.stamina ?? 1)) * 0.4;
  // Wide/high flight remains available for escaping and evading. Attacking
  // must actually bring the target inside a damaging skill's 3D envelope.
  const allowRoam = ["flee", "reflexDodge", "collisionAvoidance", "search", "hold", "stunned", "downedGuard", "wideReposition"].includes(mode);
  if (target && reach > 0) verticalTarget = attackFlightEnvelope({ reach, desiredRange: attackRange.desiredRange, requestedAltitude: verticalTarget, targetAltitude: target.altitude || 0, allowRoam }).altitude;
  verticalTarget = THREE.MathUtils.clamp(verticalTarget, 50, MAX_FLIGHT_ALTITUDE - 20);
  const response = 1 - Math.exp(-dt * (mode === "reflexDodge" ? 8.5 : 3.4));
  const smooth = normalized2(THREE.MathUtils.lerp(previous.x, desired.x, response), THREE.MathUtils.lerp(previous.y, desired.y, response), actor.angle);
  return { x: smooth.x, y: smooth.y, speed, verticalTarget, mode, evasionMode, facing: Math.atan2(smooth.y, smooth.x), lookFacing: target ? targetAngle : Math.atan2(smooth.y, smooth.x), hasTarget: Boolean(target) };
}

/**
 * Ground fighters use opponent-relative footwork instead of the aerial global
 * waypoint system. They stay in a readable engagement pocket, face the target,
 * step to an angle, enter briefly to attack, then recover their distance.
 */
function continuousGroundCombatMotor(key, actor, target, intent, ideal, profile, dt, neuralOutput = {}, strategy = null) {
  const duel = world.duel;
  const previous = duel[`${key}Motor`] || { x: Math.cos(actor.angle), y: Math.sin(actor.angle), speed: 180, evasionMode: "lateral" };
  const state = duel[`${key}CombatState`];
  strategy ||= { mode: intent, desiredRange: ideal };
  const targetAngle = target ? Math.atan2(target.y - actor.y, target.x - actor.x) : actor.angle;
  const toTarget = target ? normalized2(target.x - actor.x, target.y - actor.y, actor.angle) : { x: Math.cos(actor.angle), y: Math.sin(actor.angle) };
  const horizontalRange = target ? distance(actor, target) : Infinity;
  const airborneTarget = (target?.altitude || 0) > 120;
  const tacticalRange = airborneTarget
    ? THREE.MathUtils.clamp(ideal, 560, 820)
    : THREE.MathUtils.clamp(strategy.desiredRange || ideal, 310, 690);
  let orbit = duel[`${key}Orbit`] || 1;
  if (state && elapsed >= (state.nextGroundStepAt || 0)) {
    // Change the angle of attack occasionally, not every simulation tick.
    if (Math.random() < 0.34) { orbit *= -1; duel[`${key}Orbit`] = orbit; }
    state.groundStepBias = (Math.random() - 0.5) * 0.32;
    state.nextGroundStepAt = elapsed + 1.5 + Math.random() * 2.1;
  }
  const tangent = { x: -toTarget.y * orbit, y: toTarget.x * orbit };
  let desiredX = 0, desiredY = 0, speed = 190, mode = "rangeControl", evasionMode = previous.evasionMode || "lateral";

  if (intent === "stunned" || intent === "hold") {
    mode = intent; speed = 0;
  } else if (intent === "downedGuard") {
    // Stay visibly alive while respecting a downed opponent: circle slowly,
    // keep visual contact, and do not cast until it has recovered.
    desiredX = tangent.x * 0.82 - toTarget.x * (horizontalRange < tacticalRange * 0.75 ? 0.42 : 0.06);
    desiredY = tangent.y * 0.82 - toTarget.y * (horizontalRange < tacticalRange * 0.75 ? 0.42 : 0.06);
    speed = 145; mode = "downedGuard";
  } else if (intent === "search") {
    desiredX = toTarget.x; desiredY = toTarget.y; speed = horizontalRange < 130 ? 0 : 245; mode = "search";
  } else if (intent === "flee") {
    desiredX = -toTarget.x + tangent.x * 0.22; desiredY = -toTarget.y + tangent.y * 0.22; speed = 520; mode = "flee";
  } else if (intent === "chase") {
    desiredX = toTarget.x + tangent.x * 0.08; desiredY = toTarget.y + tangent.y * 0.08; speed = 455; mode = "chase";
  } else {
    const rangeError = (horizontalRange - tacticalRange) / Math.max(1, tacticalRange);
    const tooFar = rangeError > 0.28, tooClose = rangeError < -0.3;
    const postAttackExit = ["wideReposition", "scentKite"].includes(strategy.mode);
    if (tooFar) {
      desiredX = toTarget.x + tangent.x * 0.12; desiredY = toTarget.y + tangent.y * 0.12;
      speed = 380; mode = strategy.mode === "openingProbe" ? "openingProbe" : "intercept";
    } else if (tooClose || postAttackExit) {
      // Recover one or two steps on a diagonal while keeping the opponent in view.
      desiredX = -toTarget.x * (tooClose ? 0.88 : 0.42) + tangent.x * 0.68;
      desiredY = -toTarget.y * (tooClose ? 0.88 : 0.42) + tangent.y * 0.68;
      speed = tooClose ? 410 : 305; mode = tooClose ? "breakaway" : "angleExit";
    } else {
      // Guarded lateral footwork around the effective range, with a small
      // radial correction rather than a full-map random destination.
      const correction = THREE.MathUtils.clamp(rangeError * 0.75, -0.34, 0.34);
      desiredX = tangent.x * 0.82 + toTarget.x * (correction + (state?.groundStepBias || 0));
      desiredY = tangent.y * 0.82 + toTarget.y * (correction + (state?.groundStepBias || 0));
      speed = strategy.mode === "adaptiveCounter" ? 310 : 245;
      mode = strategy.mode === "openingProbe" ? "openingProbe" : strategy.mode === "adaptiveCounter" ? "adaptiveCounter" : "groundGuard";
    }
  }

  const threat = intent !== "flee" && intent !== "stunned" ? incomingAttackThreat(key, actor) : null;
  const dodgeTendency = state?.disposition?.dodgeTendency ?? 0.58;
  const emergencyDodge = Boolean(threat && threat.severity > (state?.disposition?.dodgeThreshold ?? 0.14));
  if (emergencyDodge) {
    const lateralPreference = key === "player" ? memory.dodgeLateral : 0.58;
    const verticalPreference = key === "player" ? memory.dodgeVertical : 0.36;
    desiredX = threat.lateral.x; desiredY = threat.lateral.y;
    speed = 520 + dodgeTendency * 80 + threat.severity * 120;
    evasionMode = verticalPreference > lateralPreference + 0.12 ? "vertical" : "lateral";
    mode = "reflexDodge";
  }
  if (Math.abs(neuralOutput.turn || 0) > 0.02 && mode !== "flee") {
    desiredX += tangent.x * neuralOutput.turn * 0.22;
    desiredY += tangent.y * neuralOutput.turn * 0.22;
  }
  const proposed = normalized2(desiredX, desiredY, actor.angle);
  let desired = proposed, bodyFacing = targetAngle;
  if (state) {
    const hardIntent = ["stunned", "flee", "hold", "search"].includes(mode);
    const currentPlan = state.groundDecision;
    const mustReplace = !currentPlan || elapsed >= (state.groundDecisionUntil || 0)
      || emergencyDodge || (hardIntent && currentPlan.mode !== mode);
    if (mustReplace) {
      const commitment = emergencyDodge ? 0.34
        : ["intercept", "breakaway", "angleExit"].includes(mode) ? 0.78
          : mode === "groundGuard" ? 1.15 : 0.92;
      state.groundDecision = { x: proposed.x, y: proposed.y, speed, mode, evasionMode, bodyFacing: targetAngle };
      state.groundDecisionUntil = elapsed + commitment;
    }
    // Execute one readable footwork decision before asking for another. The
    // head may continue tracking the opponent, but the hips and root do not
    // reverse direction every simulation tick.
    desired = normalized2(state.groundDecision.x, state.groundDecision.y, actor.angle);
    speed = state.groundDecision.speed; mode = state.groundDecision.mode;
    evasionMode = state.groundDecision.evasionMode; bodyFacing = state.groundDecision.bodyFacing;
  }
  const response = 1 - Math.exp(-dt * (mode === "reflexDodge" ? 10 : 3.6));
  const smooth = normalized2(THREE.MathUtils.lerp(previous.x, desired.x, response), THREE.MathUtils.lerp(previous.y, desired.y, response), actor.angle);
  return {
    x: smooth.x, y: smooth.y, speed, verticalTarget: 0, mode, evasionMode,
    facing: Math.atan2(smooth.y, smooth.x), bodyFacing, lookFacing: targetAngle, hasTarget: Boolean(target), groundLocked: true,
  };
}

function buildDuelBrainSensors(key, actor, target) {
  const sensors = { odorLeft: 0, odorRight: 0, loomLeft: 0, loomRight: 0, sweet: 0, bitter: 0, touch: 0 };
  const range = baseCombatVisionRange(key), separation = distance3D(actor, target);
  if (visuallySeesTarget(key, actor, target)) {
    const bearing = angleDelta(Math.atan2(target.y - actor.y, target.x - actor.x), actor.angle);
    const loom = Math.pow(Math.max(0, 1 - separation / range), 1.3) * 0.78;
    if (bearing < 0) sensors.loomLeft = loom; else sensors.loomRight = loom;
  }
  if ((world.duel[`${key}TrackingUntil`] || 0) > elapsed) {
    const bearing = angleDelta(Math.atan2(target.y - actor.y, target.x - actor.x), actor.angle);
    const odor = Math.max(0.18, 1 - separation / Math.hypot(WORLD_W, WORLD_H));
    sensors.odorLeft = odor * (bearing < 0 ? 1 : 0.45); sensors.odorRight = odor * (bearing >= 0 ? 1 : 0.45);
  }
  const threat = incomingAttackThreat(key, actor);
  if (threat) {
    const amount = THREE.MathUtils.clamp(threat.severity, 0, 1);
    if (threat.bearing < 0) sensors.loomLeft = Math.max(sensors.loomLeft, amount); else sensors.loomRight = Math.max(sensors.loomRight, amount);
  }
  sensors.touch = separation < (actor.radius || 36) + (target.radius || 36) + 8 ? 1 : 0;
  return sensors;
}

function updateDuel(dt, neuralOutput = {}) {
  const duel = world.duel, rival = duel.rival;
  if (!duel.active) return;
  if (elapsed - duel.startedAt >= 90) {
    const gap = duel.playerHealth / Math.max(1, duel.playerMaxHealth) - rival.health / Math.max(1, rival.maxHealth);
    addLog("练习赛90秒到时：按双方剩余生命比例结算，结束追逐并发放一次培养奖励。", "system");
    finishDuel(Math.abs(gap) < 0.025 ? "draw" : gap > 0 ? "player" : "rival"); return;
  }
  rivalSkillSystem.tick(dt); rival.stamina = Math.min(1, rival.stamina + dt * 0.006);
  rival.fatigue = THREE.MathUtils.clamp((rival.fatigue ?? 0.08) - dt * 0.0045, 0, 1);
  const playerRatio = duel.playerHealth / duel.playerMaxHealth, rivalRatio = rival.health / rival.maxHealth;
  const playerProfile = fighterProfile("player"), rivalProfile = fighterProfile("rival");
  const playerState = duel.playerCombatState, rivalState = duel.rivalCombatState;
  const rivalTemperamentDefaults = {
    brave: { confidence: 0.72, fear: 0.18 }, cautious: { confidence: 0.42, fear: 0.48 },
    curious: { confidence: 0.52, fear: 0.3 }, balanced: { confidence: 0.55, fear: 0.28 },
  }[rivalState?.personality || "balanced"];
  const playerPower = combatPowerIndex({ profile: playerProfile, healthRatio: playerRatio, stamina: biology.stamina, fatigue: biology.fatigue, confidence: memory.confidence, bodyType: playerBodyType });
  const rivalPower = combatPowerIndex({ profile: rivalProfile, healthRatio: rivalRatio, stamina: rival.stamina, fatigue: rival.fatigue, confidence: rivalTemperamentDefaults.confidence, bodyType: rivalBodyType });
  playerState.disposition = evaluateCombatDisposition({ personality: playerState.personality, traits: playerState.temperament, ownPower: playerPower, targetPower: rivalPower, ownHealth: playerRatio, targetHealth: rivalRatio, stamina: biology.stamina, fatigue: biology.fatigue, confidence: memory.confidence, fear: memory.fear });
  rivalState.disposition = evaluateCombatDisposition({ personality: rivalState.personality, traits: rivalState.temperament, ownPower: rivalPower, targetPower: playerPower, ownHealth: rivalRatio, targetHealth: playerRatio, stamina: rival.stamina, fatigue: rival.fatigue, confidence: rivalTemperamentDefaults.confidence, fear: rivalTemperamentDefaults.fear });
  const separationNow = distance3D(rival, world.creature);
  const playerIdeal = preferredCombatRange(biology.element, playerBodyType), rivalIdeal = preferredCombatRange(rival.element, rivalBodyType, "rival");
  const playerSees = combatSenseSeesTarget("player", world.creature, rival), rivalSees = combatSenseSeesTarget("rival", rival, world.creature);
  if (playerSees) {
    if (!duel.playerLastSeen) addLog("我方视觉首次捕捉到对手，开始规划交叉、佯动和奇袭航线。", "stimulus");
    duel.playerLastSeen = { x: rival.x, y: rival.y, altitude: rival.altitude };
    duel.playerLostSightAt = 0;
  }
  if (rivalSees) {
    if (!duel.rivalLastSeen) addLog("对手发现了我方，开始利用三维空间寻找攻击角度。", "bitter");
    duel.rivalLastSeen = { x: world.creature.x, y: world.creature.y, altitude: world.creature.altitude };
    duel.rivalLostSightAt = 0;
  }
  if (playerSees || rivalSees) {
    duel.contactEstablished = true;
    duel.lastContactAt = elapsed;
  }
  if (!playerSees && duel.contactEstablished && !duel.playerLostSightAt) duel.playerLostSightAt = elapsed;
  if (!rivalSees && duel.contactEstablished && !duel.rivalLostSightAt) duel.rivalLostSightAt = elapsed;
  duel.playerLockedOn = playerSees || duel.playerTrackingUntil > elapsed;
  duel.rivalLockedOn = rivalSees || duel.rivalTrackingUntil > elapsed;
  const aimHeadAt = (actor, target, locked) => {
    if (!target) return;
    const horizontal = Math.max(35, distance(actor, target));
    actor.lookPitch = Math.atan2((target.altitude || 0) - (actor.altitude || 0), horizontal);
    actor.gazeUrgent = locked || distance3D(actor, target) < 520;
  };
  aimHeadAt(world.creature, playerSees ? rival : duel.playerLastSeen, playerSees);
  aimHeadAt(rival, rivalSees ? world.creature : duel.rivalLastSeen, rivalSees);
  const updateObservation = (key, actor, target, ideal) => {
    const state = duel[`${key}CombatState`]; if (!state) return;
    const towardActor = normalized2(actor.x - target.x, actor.y - target.y, target.angle);
    const targetHeading = target.moveAngle ?? target.angle ?? 0;
    const approachSpeed = Math.cos(targetHeading) * towardActor.x * (target.speed || 0) + Math.sin(targetHeading) * towardActor.y * (target.speed || 0);
    const pressureSample = THREE.MathUtils.clamp(0.5 + approachSpeed / 460, 0, 1);
    state.pressure = THREE.MathUtils.lerp(state.pressure, pressureSample, Math.min(1, dt * 0.72));
    if (separationNow > ideal * 1.22 && elapsed >= duel[`${key}HitUntil`]) state.safeSeconds += dt;
    state.lastSeparation = separationNow;
    if (elapsed >= state.nextWideAt && elapsed > duel.startedAt + 10) {
      state.wideUntil = elapsed + 2.4 + Math.random() * 2.8;
      state.nextWideAt = elapsed + 12 + Math.random() * 10;
      state.nextWaypointAt = 0;
    }
  };
  updateObservation("player", world.creature, rival, playerIdeal);
  updateObservation("rival", rival, world.creature, rivalIdeal);
  let playerFlee = shouldRetreatFromDuel(playerState.disposition, playerRatio, rivalRatio);
  let rivalFlee = shouldRetreatFromDuel(rivalState.disposition, rivalRatio, playerRatio);
  // Two frightened controllers used to flee in opposite directions forever.
  // The more endangered fighter escapes; the other remains the pursuer.
  if (playerFlee && rivalFlee) {
    const playerDistress = (1 - playerRatio) + Math.max(0, 1 - playerState.disposition.powerRatio);
    const rivalDistress = (1 - rivalRatio) + Math.max(0, 1 - rivalState.disposition.powerRatio);
    if (playerDistress >= rivalDistress) rivalFlee = false; else playerFlee = false;
  }
  const playerPursues = () => {
    if (duel.pursuit === "always") return true;
    if (duel.pursuit === "never") return false;
    return playerState.disposition.pursuitTendency > 0.18 && biology.stamina > 0.08;
  };
  const rivalPursues = rivalState.disposition.pursuitTendency > 0.18 && rival.stamina > 0.08;
  let playerIntent = playerSees ? "engage" : "search";
  let rivalIntent = rivalSees ? "engage" : "search";
  if (playerFlee) {
    playerIntent = "flee"; rivalIntent = rivalPursues ? "chase" : "hold";
  } else if (rivalFlee) {
    rivalIntent = "flee"; playerIntent = playerPursues() ? "chase" : "hold";
  }
  const playerLostFor = duel.playerLostSightAt ? elapsed - duel.playerLostSightAt : 0;
  const rivalLostFor = duel.rivalLostSightAt ? elapsed - duel.rivalLostSightAt : 0;
  const stalePressure = duel.contactEstablished && elapsed - duel.lastPressureAt > 7.5;
  const stretchedFight = duel.contactEstablished && separationNow > 1750;
  const forceReengage = !playerFlee && !rivalFlee && (stalePressure || stretchedFight);
  if (forceReengage) {
    playerIntent = "chase";
    rivalIntent = "chase";
    playerState.nextWaypointAt = 0;
    rivalState.nextWaypointAt = 0;
    if (elapsed - duel.reengageLogAt > 6) {
      addLog("双方拉开过远或过久没有形成攻击压力，战斗记忆触发重新接敌：停止无意义后退，改为搜索、截击并恢复交火。", "system");
      duel.reengageLogAt = elapsed;
    }
  } else if (!playerFlee && !rivalFlee && duel.contactEstablished) {
    // Search honestly around the last sighting first, then let persistent
    // combat memory reacquire the live target so the duel cannot freeze.
    if (!playerSees && playerLostFor > 2.4) playerIntent = "chase";
    if (!rivalSees && rivalLostFor > 2.4) rivalIntent = "chase";
  }
  if (elapsed < duel.playerStunUntil) playerIntent = "stunned";
  if (elapsed < duel.rivalStunUntil) rivalIntent = "stunned";
  syncGroundKnockdownState(world.creature, "player", playerBodyType);
  syncGroundKnockdownState(rival, "rival", rivalBodyType);
  const playerRagdollLocked = corgiRagdollControlLocked(world.creature, playerBodyType);
  const rivalRagdollLocked = corgiRagdollControlLocked(rival, rivalBodyType);
  if (playerRagdollLocked) playerIntent = "stunned";
  if (rivalRagdollLocked) rivalIntent = "stunned";
  // A conscious fighter guards and repositions while the opponent is down.
  // It does not repeatedly cast into an incapacitated body on the floor.
  if (rivalRagdollLocked && !playerRagdollLocked) playerIntent = "downedGuard";
  if (playerRagdollLocked && !rivalRagdollLocked) rivalIntent = "downedGuard";
  const interruptKnockedDownActor = (key) => {
    const activeId = duel[`${key}ActiveSkillId`];
    duel[`${key}AttackUntil`] = Math.min(duel[`${key}AttackUntil`] || elapsed, elapsed);
    duel[`${key}AimingSkillId`] = null; duel[`${key}PlannedSkillId`] = null; duel[`${key}RammingUntil`] = 0;
    if (SKILLS[activeId]?.type === "melee") duel.pendingAttacks = duel.pendingAttacks.filter((attack) => attack.attackerKey !== key);
  };
  if (playerRagdollLocked) interruptKnockedDownActor("player");
  if (rivalRagdollLocked) interruptKnockedDownActor("rival");

  const playerSearchTarget = playerSees || playerIntent === "chase" ? rival : duel.playerLastSeen;
  const rivalSearchTarget = rivalSees || rivalIntent === "chase" ? world.creature : duel.rivalLastSeen;
  const playerStrategy = combatStrategy("player", playerRatio, rivalRatio, duel.playerCombatState, playerIdeal);
  const rivalStrategy = combatStrategy("rival", rivalRatio, playerRatio, duel.rivalCombatState, rivalIdeal);
  // An opponent's casts must not conceal this fighter's inability to attack.
  for (const [key, strategy, fleeing, intent] of [["player", playerStrategy, playerFlee, playerIntent], ["rival", rivalStrategy, rivalFlee, rivalIntent]]) {
    if (!fleeing && !["stunned", "hold", "downedGuard"].includes(intent) && duel.contactEstablished && elapsed - (duel[`${key}LastDamageCastAt`] ?? duel.startedAt) > 8) {
      const bodyType = key === "player" ? playerBodyType : rivalBodyType;
      const element = key === "player" ? biology.element : rival.element;
      const reach = combatDamageReach(combatLoadout(element, bodyType, key), SKILLS);
      Object.assign(strategy, { mode: "intercept", desiredRange: Math.min(strategy.desiredRange, reach * 0.6), waypointWeight: 0.1 });
    }
  }
  if (!playerFlee && playerStrategy.mode === "flee") Object.assign(playerStrategy, { mode: "intercept", desiredRange: 430, waypointWeight: 0.25 });
  if (!rivalFlee && rivalStrategy.mode === "flee") Object.assign(rivalStrategy, { mode: "intercept", desiredRange: 430, waypointWeight: 0.25 });
  if (playerIntent === "engage") playerIntent = playerStrategy.mode;
  if (rivalIntent === "engage") rivalIntent = rivalStrategy.mode;
  duel.phase = [playerStrategy, rivalStrategy].some((strategy) => strategy.mode === "flee") ? "survive"
    : [playerStrategy, rivalStrategy].some((strategy) => strategy.mode === "openingProbe") ? "opening"
      : [playerStrategy, rivalStrategy].some((strategy) => strategy.mode === "intercept") ? "finish" : "adapt";
  const rivalNeuralOutput = rivalBrain?.step(buildDuelBrainSensors("rival", rival, world.creature), dt) || {};
  duel.playerMotor = isGroundBodyType(playerBodyType)
    ? continuousGroundCombatMotor("player", world.creature, playerSearchTarget, playerIntent, playerIdeal, playerProfile, dt, neuralOutput, playerStrategy)
    : continuousCombatMotor("player", world.creature, playerSearchTarget, playerIntent, playerIdeal, playerProfile, dt, neuralOutput, playerStrategy);
  duel.rivalMotor = isGroundBodyType(rivalBodyType)
    ? continuousGroundCombatMotor("rival", rival, rivalSearchTarget, rivalIntent, rivalIdeal, rivalProfile, dt, rivalNeuralOutput, rivalStrategy)
    : continuousCombatMotor("rival", rival, rivalSearchTarget, rivalIntent, rivalIdeal, rivalProfile, dt, rivalNeuralOutput, rivalStrategy);
  duel.playerTactic = duel.playerMotor.mode; duel.rivalTactic = duel.rivalMotor.mode;
  duel.playerAltitudeTarget = duel.playerMotor.verticalTarget;
  applyDuelKnockback(world.creature, "player", dt); applyDuelKnockback(rival, "rival", dt);
  const separation = distance3D(rival, world.creature);
  let desiredMoveAngle = Math.atan2(duel.rivalMotor.y, duel.rivalMotor.x); const desiredMotion = duel.rivalMotor.speed;
  if (duel.rivalTactic !== "stunned" && !rivalRagdollLocked) {
    const airborneBodyAngle = rival.angle;
    const orientation = updateCombatOrientation({
      bodyAngle: rival.angle, lookAngle: rival.lookAngle ?? rival.angle, movementAngle: desiredMoveAngle,
      targetAngle: duel.rivalAimingSkillId ? duel.rivalMotor.lookFacing : (duel.rivalMotor.bodyFacing ?? duel.rivalMotor.lookFacing),
      lookTargetAngle: duel.rivalMotor.lookFacing, hasTarget: duel.rivalMotor.hasTarget,
      attacking: elapsed < duel.rivalAttackUntil || Boolean(duel.rivalAimingSkillId), requiresFacing: SKILLS[duel.rivalAimingSkillId || duel.rivalActiveSkillId]?.requiresFacing,
      mode: duel.rivalTactic, dt,
    });
    rival.angle = isGroundBodyType(rivalBodyType) && (rival.altitude || 0) > 0.01 ? airborneBodyAngle : orientation.bodyAngle;
    rival.lookAngle = orientation.lookAngle;
  }
  let motion;
  if (isGroundBodyType(rivalBodyType)) {
    if (rivalRagdollLocked) {
      // The knockback integrator above is the only allowed translation while
      // down.  Locomotion, dodge and jump controllers remain disconnected
      // until the active ragdoll has physically recovered its balance.
      rival.speed = THREE.MathUtils.lerp(rival.speed || 0, 0, Math.min(1, dt * 12));
      rival.actualSpeed = THREE.MathUtils.lerp(rival.actualSpeed || 0, 0, Math.min(1, dt * 12));
      if ((rival.altitude || 0) > 0.01) {
        rival.verticalSpeed = (rival.verticalSpeed || 0) - 1040 * dt;
        rival.altitude = Math.max(0, rival.altitude + rival.verticalSpeed * dt);
      } else { rival.verticalSpeed = 0; rival.altitude = 0; }
      rival.bankAngle = 0;
      rival.groundAction = rival.ragdollState;
      duel.rivalDodgeUntil = 0; duel.rivalRammingUntil = 0;
      motion = 0;
    } else {
    const rivalDodgeRequested = ["reflexDodge", "collisionAvoidance"].includes(duel.rivalTactic);
    if (rivalDodgeRequested && elapsed >= (rival.nextDodgeAt || 0)) {
      duel.rivalDodgeUntil = elapsed + 0.38;
      rival.dodgeMode = duel.rivalMotor.evasionMode || "lateral";
      rival.nextDodgeAt = elapsed + 0.86;
    }
    const rivalDodging = elapsed < (duel.rivalDodgeUntil || 0);
    const rivalVerticalDodge = rivalDodging && rival.dodgeMode === "vertical" && (rival.altitude || 0) <= 0.01;
    const jumpWindow = elapsed >= (rival.nextLeapAt || 0) && separation < 1650 && (world.creature.altitude || 0) > 75 && (rival.altitude || 0) <= 0.01;
    const rivalPace = selectGroundCombatPace({
      mode: duel.rivalTactic, stamina: rival.stamina, fatigue: rival.fatigue,
      neuralDrive: rivalNeuralOutput.forward || 0, dodging: rivalDodging,
    });
    const rivalNormalLimit = 1176 * rivalPace.condition;
    const rivalSpeedLimit = rivalPace.maxSpeed;
    const rivalRequestedSpeed = Math.max(rivalPace.desiredSpeed, desiredMotion * 0.9);
    const rivalNavigation = awareGroundRoute(rival, desiredMoveAngle, rivalRequestedSpeed);
    desiredMoveAngle = rivalNavigation.angle;
    if (rivalNavigation.avoiding && !rivalDodging) duel.rivalTactic = "routeAvoidance";
    const rivalSlip = Math.abs(Math.sin(angleDelta(desiredMoveAngle, duel.rivalMotor.lookFacing ?? rival.angle)));
    const rivalStrafeFactor = rivalDodging ? 1 : THREE.MathUtils.lerp(1, 0.68, rivalSlip);
    const ground = updateGroundLocomotion(rival, {
      desiredSpeed: rivalRequestedSpeed * rivalStrafeFactor * rivalNavigation.speedFactor, desiredAngle: desiredMoveAngle, maxSpeed: rivalSpeedLimit,
      facingAngle: !["flee", "search"].includes(duel.rivalTactic) ? duel.rivalMotor.lookFacing : undefined, combatStrafe: !["flee", "search", "chase"].includes(duel.rivalTactic),
      dodge: rivalDodging, jump: jumpWindow || rivalVerticalDodge,
      jumpSpeed: rivalVerticalDodge ? 485 : THREE.MathUtils.clamp(590 + (world.creature.altitude || 0) * 0.64, 590, 920),
      impulseSpeed: rivalVerticalDodge ? rivalSpeedLimit : jumpWindow ? rivalNormalLimit : 0, stamina: rival.stamina,
    }, dt);
    Object.assign(rival, ground); motion = ground.speed; rival.bankAngle = 0;
    rival.speedTier = rivalPace.tier;
    rival.groundAction = rivalDodging ? "dodge" : ground.jumped || !ground.grounded ? "pounce" : ground.speed < 35 ? "idle" : ground.speed < 300 ? "walk" : ground.speed > 760 ? "sprint" : "run";
    if (ground.jumped) rival.nextLeapAt = elapsed + 4.4 + Math.random() * 2.8;
    // Cruising and ordinary repositioning are free. Only the final burst band
    // drains stamina, so a full bar enables a short extra gear rather than
    // multiplying the whole motor speed.
    const rivalBurst = THREE.MathUtils.clamp((motion - rivalNormalLimit) / Math.max(1, rivalSpeedLimit - rivalNormalLimit), 0, 1);
    if (rivalBurst > 0) {
      rival.stamina = Math.max(0.08, rival.stamina - dt * (0.012 + rivalBurst * rivalBurst * 0.075));
      rival.fatigue = Math.min(1, rival.fatigue + dt * (0.012 + rivalBurst * 0.02));
    }
    }
  } else {
    duel.rivalAltitudeTarget = duel.rivalMotor.verticalTarget;
    const previousAltitude = rival.altitude;
    rival.altitude += THREE.MathUtils.clamp(duel.rivalAltitudeTarget - rival.altitude, -250 * dt, 250 * dt);
    rival.verticalSpeed = (rival.altitude - previousAltitude) / Math.max(dt, 0.001);
    const rivalAcceleration = duel.rivalTactic === "reflexDodge" ? 980 : desiredMotion > rival.speed ? 410 : 590;
    motion = rival.speed + THREE.MathUtils.clamp(desiredMotion - rival.speed, -rivalAcceleration * dt, rivalAcceleration * dt);
    const rivalBurst = Math.max(0, (motion - 350) / 300);
    if (rivalBurst > 0) rival.stamina = Math.max(0.04, rival.stamina - dt * (0.006 + rivalBurst * rivalBurst * 0.035));
    else if (elapsed >= duel.rivalAttackUntil) rival.stamina = Math.min(1, rival.stamina + dt * 0.018);
    const rivalFlight = resolveFlightDirection({ bodyAngle: rival.angle, desiredMovementAngle: desiredMoveAngle, previousMovementAngle: rival.moveAngle ?? rival.angle, mode: duel.rivalTactic, dt });
    rival.moveAngle = rivalFlight.movementAngle;
    rival.bankAngle = THREE.MathUtils.lerp(rival.bankAngle || 0, rivalFlight.bankTarget, Math.min(1, dt * 6.5));
    rival.speed = motion;
  }
  const rivalBeforeMoveX = rival.x, rivalBeforeMoveY = rival.y;
  const rivalCollided = moveBody(rival, { x: Math.cos(rival.moveAngle) * motion * dt, y: Math.sin(rival.moveAngle) * motion * dt }, world.obstacles, GROUND_BOUNDS);
  // Rival animation must follow measured root displacement, just like the
  // player. Previously actualSpeed was set to zero during a knockdown but was
  // never refreshed afterwards, so the body resumed moving with frozen legs.
  const rivalActualSample = Math.min(Math.max(0, motion) * 1.2 + 1, Math.hypot(rival.x - rivalBeforeMoveX, rival.y - rivalBeforeMoveY) / Math.max(dt, 0.001));
  rival.actualSpeed = THREE.MathUtils.lerp(rival.actualSpeed ?? rivalActualSample, rivalActualSample, Math.min(1, dt * 12));
  if (rivalCollided && isGroundBodyType(rivalBodyType)) { rival.speed *= 0.58; motion *= 0.72; rival.navigationRouteUntil = Math.max(rival.navigationRouteUntil || 0, elapsed + 0.45); }
  if (isGroundBodyType(playerBodyType) && elapsed < (duel.playerPounceUntil || 0) && !duel.playerPounceHit) {
    const player = world.creature;
    const horizontalGap = distance(player, rival), verticalGap = Math.abs((player.altitude || 0) - (rival.altitude || 0));
    if (horizontalGap < player.radius + rival.radius + 105 && verticalGap < 235) {
      const damage = 34 * biology.modifiers().combat * (1 - rival.defense);
      rival.health -= damage; duel.playerPounceHit = true; duel.contactCooldownUntil = elapsed + 0.65;
      registerDuelHit("player", damage, GROUND_POUNCE_SKILL, "launch");
      addLog(`双足身体完成追猎跃击，前臂护住头部、主攻臂前探，命中造成 ${damage.toFixed(1)} 伤害并击退目标。`, "feed");
    }
  }
  handleDuelContact();

  if (elapsed >= rival.nextSkillAt && !rivalRagdollLocked && !["flee", "hold", "downedGuard", "stunned", "search"].includes(duel.rivalTactic)) {
    const id = chooseDuelSkill(rivalSkillSystem, rival.element, separation, rival.health / rival.maxHealth, "rival", rival, world.creature);
    const waitingToAim = id && !prepareAimedSkill("rival", id);
    if (id && !waitingToAim) {
      const actor = { spendStamina: (amount) => { if (rival.stamina < amount) return false; rival.stamina -= amount; return true; }, modifiers: () => ({ combat: rivalProfile.power }) };
      const result = rivalSkillSystem.activate(id, { actor, distance: separation, targetElement: biology.element });
      if (result.ok) {
        if (result.skill.type === "buff") {
          spawnSkillEffect(result, rival, rival);
          duel.rivalAttackStartedAt = elapsed; duel.rivalAttackUntil = elapsed + 0.5; duel.rivalActiveSkillId = result.id;
          addLog(`对手使用${result.skill.name}，进入防御姿态。`, "bitter");
        } else {
          queueDuelAttack("rival", result);
        }
      }
    }
    // 没有射击窗口时快速重新判断，避免高速盘旋中错过短暂的有效距离。
    const attackTempo = duel.rivalCombatState?.disposition?.attackIntervalScale ?? 1;
    rival.nextSkillAt = elapsed + (waitingToAim ? 0.12 : id ? (0.82 + Math.random() * 0.85) * attackTempo : 0.18 * attackTempo);
  }
  if (duel.active && elapsed >= duel.nextPlayerSkillAt && !playerRagdollLocked && !["flee", "hold", "downedGuard", "stunned", "search"].includes(duel.playerTactic)) {
    const id = chooseDuelSkill(skillSystem, biology.element, separation, duel.playerHealth / duel.playerMaxHealth, "player", world.creature, rival);
    const waitingToAim = id && !prepareAimedSkill("player", id);
    if (id && !waitingToAim) useSkill(id);
    const attackTempo = duel.playerCombatState?.disposition?.attackIntervalScale ?? 1;
    duel.nextPlayerSkillAt = elapsed + (waitingToAim ? 0.12 : id ? (0.72 + Math.random() * 0.78) * attackTempo : 0.18 * attackTempo);
  }
  resolveDuelAttacks();
  const finalSeparation = distance3D(rival, world.creature);
  // A real retreat now has an explicit outcome instead of leaving an active
  // duel parked at opposite ends of the map.
  if (finalSeparation > 2200 && duel.rivalTactic === "flee") finishDuel("rivalEscaped");
  else if (finalSeparation > 2200 && duel.playerTactic === "flee") finishDuel("playerEscaped");
  updateDuelUI();
}

function resetWorld() {
  stopDuel();
  world.foods.forEach((food) => food.mesh && scene.remove(food.mesh));
  world.score = 0;
  // A world reset is also a usable test reset.  Preserve individual traits,
  // but do not respawn an effectively dead, fully crippled body that can only
  // crawl at a fraction of the configured locomotion speed.
  if (biology.health < 0.15 || biology.fatigue > 0.92 || biology.injuries.leg > 0.82) {
    biology.health = 0.9; biology.stamina = 1; biology.fatigue = 0.12; biology.pain = 0;
    biology.injuries.leg = 0; biology.injuries.wing = Math.min(biology.injuries.wing, 0.2);
    saveBiology(); updateBiologyUI();
  }
  world.creature = { ...CREATURE_START, radius: 36, angle: -0.4, altitude: 0, verticalSpeed: 0, flying: false, flightPhase: "grounded", flightCommand: "auto", speed: 0, hunger: 0.72, health: 0.9, stamina: 1, feedHold: 0, rejectCooldown: 0, attackCooldown: 0, forageState: "idle", foraging: {}, forageTarget: null, forageLockUntil: 0, rejectedFood: null, rejectedFoodUntil: 0 };
  world.creature.radius = THREE.MathUtils.clamp((isGroundBodyType(playerBodyType) ? 48 : 45) * (collection?.species?.visualSize || 1), 30, 72);
  world.owner = { ...OWNER_START, callUntil: 0 };
  Object.assign(world.robot, { ...ROBOT_START, speed: 0 }); syncRobotPosition();
  world.interaction.callUntil = 0; world.interaction.command = null; world.interaction.commandUntil = 0; world.interaction.walkTarget = null; world.interaction.reaction = null; world.interaction.reactionUntil = 0; world.interaction.pendingReaction = null;
  world.duel.active = false; world.duel.result = "idle"; if (rivalMesh) rivalMesh.visible = false; if (duelPlayerMarker) duelPlayerMarker.visible = false; if (duelRivalMarker) duelRivalMarker.visible = false;
  wanderUntil = 0; wanderTarget = { x: WORLD_W * 0.65, y: WORLD_H * 0.55 };
  document.querySelectorAll("[data-flight]").forEach((button) => button.classList.toggle("active", button.dataset.flight === "auto"));
  world.foods = [];
  world.creature.health = biology.health; world.creature.stamina = biology.stamina; world.creature.hunger = biology.hunger;
  SCENARIOS[world.scenario].foods.forEach(([kind, x, y]) => addFood(kind, fromDesign(x, y)));
  for (let i = 0; i < 5; i += 1) addFood("sweet", randomPoint(95));
  for (let i = 0; i < 3; i += 1) addFood("bitter", randomPoint(95));
  world.enemies = createEnemyRoster(); world.threat = world.enemies[0]; syncEnemyMeshes();
  brain?.reset(); updateHud(); updateDuelUI(); addLog("世界已重置，大脑状态清零。", "system");
}

function addLog(message, tone = "") {
  const item = document.createElement("li");
  if (tone) item.dataset.tone = tone;
  const timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  item.innerHTML = `<time>${timestamp}</time>${message}`; ui.log.prepend(item);
  while (ui.log.children.length > 6) ui.log.lastElementChild.remove();
}

function angleDelta(a, b) {
  let value = a - b;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function closestFood(excluded = null) {
  return world.foods.reduce((best, food) => {
    if (food === excluded) return best;
    const d = distance(world.creature, food);
    return !best || d < best.distance ? { food, distance: d } : best;
  }, null);
}

function buildSensors() {
  const c = world.creature;
  const body = biology?.modifiers() || { smell: 1, vision: 1 };
  const sensors = { odorLeft: 0, odorRight: 0, loomLeft: 0, loomRight: 0, sweet: 0, bitter: 0, touch: 0 };
  const excluded = elapsed < (c.rejectedFoodUntil || 0) ? c.rejectedFood : null;
  const targetFood = c.forageTarget && world.foods.includes(c.forageTarget) && c.forageTarget !== excluded ? c.forageTarget : null;
  const nearest = targetFood ? { food: targetFood, distance: distance(c, targetFood) } : closestFood(excluded);
  if (nearest) {
    const bearing = angleDelta(Math.atan2(nearest.food.y - c.y, nearest.food.x - c.x), c.angle);
    const scentRange = foodScentRange({ smell: body.smell, hunger: c.hunger });
    const odor = Math.pow(Math.max(0, 1 - nearest.distance / scentRange), 1.25) * body.smell;
    sensors.odorLeft = odor * (bearing < 0 ? 1 : 0.58); sensors.odorRight = odor * (bearing >= 0 ? 1 : 0.58);
    if (nearest.distance < 42 && c.altitude < 18) { sensors.sweet = 1; sensors.bitter = nearest.food.kind === "bitter" ? 1 : 0; }
  }
  if (world.duel.active) {
    const rival = world.duel.rival, rivalDistance = distance3D(c, rival), vision = baseCombatVisionRange("player");
    if (visuallySeesTarget("player", c, rival)) {
      const bearing = angleDelta(Math.atan2(rival.y - c.y, rival.x - c.x), c.angle);
      const loom = Math.pow(Math.max(0, 1 - rivalDistance / vision), 1.35) * body.vision * 0.72;
      if (bearing < 0) sensors.loomLeft = Math.max(sensors.loomLeft, loom); else sensors.loomRight = Math.max(sensors.loomRight, loom);
    }
    const attackThreat = incomingAttackThreat("player", c);
    if (attackThreat) {
      const loom = THREE.MathUtils.clamp(attackThreat.severity * body.vision, 0, 1);
      if (attackThreat.bearing < 0) sensors.loomLeft = Math.max(sensors.loomLeft, loom); else sensors.loomRight = Math.max(sensors.loomRight, loom);
    }
  }
  const threatDistance = distance(c, world.threat);
  if (!world.duel.active && world.threat.state !== "rest" && !world.threat.defeated && threatDistance < 260) {
    const bearing = angleDelta(Math.atan2(world.threat.y - c.y, world.threat.x - c.x), c.angle);
    const loom = Math.pow(1 - threatDistance / 260, 0.7) * body.vision;
    if (bearing < 0) sensors.loomLeft = loom; else sensors.loomRight = loom;
    if (c.altitude <= 42 && threatDistance < c.radius + world.threat.radius) sensors.touch = 1;
  }
  if (manualStimulus && elapsed < manualUntil) Object.assign(sensors, manualStimulus);
  return sensors;
}

function enemyPatrolTarget(enemy) {
  const cave = world.caves[enemy.caveId];
  const radius = 180 + Math.random() * 520, angle = Math.random() * Math.PI * 2;
  return {
    x: THREE.MathUtils.clamp(cave.x + Math.cos(angle) * radius, 70, WORLD_W - 70),
    y: THREE.MathUtils.clamp(cave.y + Math.sin(angle) * radius, 70, WORLD_H - 70),
  };
}

function moveEnemyToward(enemy, target, speed, dt) {
  const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
  enemy.vx = Math.cos(angle) * speed; enemy.vy = Math.sin(angle) * speed;
  const collided = moveBody(enemy, { x: enemy.vx * dt, y: enemy.vy * dt }, world.obstacles, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H });
  if (collided && enemy.state === "patrol") enemy.patrolTarget = enemyPatrolTarget(enemy);
}

function updateEnemies(dt) {
  const c = world.creature;
  world.enemies.forEach((enemy, index) => {
    enemy.contactCooldown = Math.max(0, enemy.contactCooldown - dt);
    const cave = world.caves[enemy.caveId];
    if (enemy.state === "rest") {
      enemy.health = Math.min(enemy.maxHealth, enemy.health + enemy.maxHealth * dt * 0.09);
      enemy.x = cave.x + (index % 3 - 1) * 22; enemy.y = cave.y + 64 + (index % 2) * 16;
      if (elapsed >= enemy.stateUntil && enemy.health >= enemy.maxHealth * 0.72) {
        enemy.state = "patrol"; enemy.defeated = false; enemy.stateUntil = elapsed + 12 + Math.random() * 18; enemy.patrolTarget = enemyPatrolTarget(enemy);
      }
      return;
    }
    if (enemy.defeated || enemy.state === "return" || elapsed >= enemy.stateUntil) {
      enemy.state = "return";
      const caveEntrance = { x: cave.x, y: cave.y + 64 };
      moveEnemyToward(enemy, caveEntrance, 38 + enemy.strength * 22, dt);
      if (distance(enemy, caveEntrance) < 34) { enemy.state = "rest"; enemy.stateUntil = elapsed + 5 + Math.random() * 8; }
      return;
    }
    enemy.state = "patrol";
    const creatureDistance = distance(enemy, c);
    const pursuing = enemy.hostility > 0.52 && creatureDistance < 310;
    const target = pursuing ? c : enemy.patrolTarget;
    moveEnemyToward(enemy, target, 22 + enemy.strength * 34, dt);
    if (!pursuing && distance(enemy, target) < 35) enemy.patrolTarget = enemyPatrolTarget(enemy);
  });
  const mobile = world.enemies.filter((enemy) => enemy.state !== "rest");
  for (let i = 0; i < mobile.length; i += 1) {
    for (let j = i + 1; j < mobile.length; j += 1) separateBodies(mobile[i], mobile[j]);
    moveBody(mobile[i], { x: 0, y: 0 }, world.obstacles, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H });
  }
  const active = world.enemies.filter((enemy) => enemy.state !== "rest" && !enemy.defeated);
  world.threat = (active.length ? active : world.enemies).reduce((nearest, enemy) => distance(enemy, c) < distance(nearest, c) ? enemy : nearest);
}

function updateReadouts(output) {
  [["escape", output.escape], ["feed", output.feed], ["odor", output.odor], ["bitter", output.bitter]].forEach(([key, value]) => {
    ui[key].value = value; ui[`${key}Value`].textContent = `${Math.round(value * 100)}%`;
  });
}

function updateWorld(dt) {
  elapsed += dt;
  updateOwnerRobot(dt);
  if (world.interaction.pendingReaction?.id === "rub" && elapsed >= world.interaction.callUntil) {
    world.interaction.pendingReaction = null;
    collectionView?.notice("伙伴暂时无法抵达接待区，请把机器人移到空旷处后再呼唤。", true);
  }
  if (world.interaction.pendingReaction && world.creature.altitude < 2 && !world.duel.active && (world.interaction.pendingReaction.id !== "rub" || distance(world.creature, INTERACTION_RECEPTION_POINT) < 75)) {
    const pending = world.interaction.pendingReaction; world.interaction.pendingReaction = null; showCollectionReaction(pending);
  }
  const duelMode = world.duel.active;
  if (!duelMode) updateEnemies(dt);
  const sensors = buildSensors(), output = brain.step(sensors, dt), c = world.creature;
  skillSystem.tick(dt);
  c.health = biology.health; c.stamina = biology.stamina; c.hunger = biology.hunger;
  const bodyModifiers = biology.modifiers();
  const rejectedFood = elapsed < (c.rejectedFoodUntil || 0) ? c.rejectedFood : null;
  const nearest = closestFood(rejectedFood), threatDistance = distance(c, world.threat);
  const ownerTarget = activeOwnerTarget();
  const ownerDistance = distance(c, ownerTarget);
  const ownerCall = elapsed < world.owner.callUntil ? 1 : 0;
  const interactionCall = elapsed < (world.interaction.callUntil || 0);
  const interactionCommand = elapsed < (world.interaction.commandUntil || 0) ? world.interaction.command : null;
  const interactionWalk = interactionCommand === "walk" && world.interaction.walkTarget;
  const interactionStay = interactionCommand === "stay";
  const interactionMovement = interactionCall || interactionWalk || interactionStay;
  const flightEscapeBonus = c.stamina > 0.15 ? 0.18 : 0;
  lastDecision = memory.decide({
    ownerDistance, enemyDistance: threatDistance, neuralEscape: output.escape, ownerCall,
    health: c.health, stamina: c.stamina, ...world.tactics,
    enemyStrength: world.threat.strength, enemyHostility: world.threat.state === "patrol" ? world.threat.hostility : 0,
    escapeRoom: Math.min(1, world.tactics.escapeRoom + flightEscapeBonus),
  });
  // Non-combat foraging is shared by every skin. The connectome supplies odor
  // steering and sweet/bitter feeding signals; this transparent state machine
  // turns those signals into a persistent game-world task without teaching the
  // fly circuit fictional human limb coordinates.
  if (!c.forageTarget || !world.foods.includes(c.forageTarget) || elapsed >= (c.forageLockUntil || 0)) {
    c.forageTarget = nearest?.food || null;
    c.forageLockUntil = elapsed + 3.5;
  }
  const forageTarget = c.forageTarget && world.foods.includes(c.forageTarget) ? c.forageTarget : nearest?.food;
  const forageDistance = forageTarget ? distance(c, forageTarget) : Infinity;
  c.foraging = updateForagingState(c.foraging, {
    now: elapsed, hunger: c.hunger, foodPriority: bodyModifiers.foodPriority, smell: bodyModifiers.smell,
    foodDistance: forageDistance, hasFood: Boolean(forageTarget), danger: lastDecision.danger,
    ownerUrgency: ownerCall * Math.max(0.6, lastDecision.ownerAttraction), duel: duelMode || c.flightCommand === "takeoff",
  });
  c.forageState = c.foraging.stage;
  c.forageDistance = forageDistance;
  const groundBody = isGroundBodyType(playerBodyType);
  const duelFlight = duelMode && !groundBody;
  const forageWantsFlight = c.foraging.active && ["searching", "tracking"].includes(c.forageState) && forageDistance > 125;
  const autoWantsFlight = !groundBody && (duelFlight || forageWantsFlight || ["attack", "escape"].includes(lastDecision.action) || (lastDecision.ownerAttraction > 0.16 && ownerDistance > 220));
  if (!groundBody) {
    const effectiveFlightCommand = interactionCall || interactionStay || world.interaction.pendingReaction ? "land" : biology.canFly() ? c.flightCommand : "land";
    const flight = updateFlightState(c, { dt, command: effectiveFlightCommand, autoWantsFlight, stamina: c.stamina });
    c.altitude = flight.altitude; c.verticalSpeed = flight.verticalSpeed; c.flying = flight.flying; c.flightPhase = flight.phase;
  } else {
    c.flying = false; c.flightPhase = c.altitude > 1 ? "jumping" : "grounded";
  }
  if (duelFlight) {
    const previousAltitude = c.altitude;
    c.altitude += THREE.MathUtils.clamp(world.duel.playerAltitudeTarget - c.altitude, -265 * dt, 265 * dt);
    c.altitude = THREE.MathUtils.clamp(c.altitude, 50, MAX_FLIGHT_ALTITUDE);
    c.verticalSpeed = (c.altitude - previousAltitude) / Math.max(dt, 0.001);
    c.flying = true; c.flightPhase = Math.abs(c.verticalSpeed) > 12 ? (c.verticalSpeed > 0 ? "taking-off" : "landing") : "flying";
  }
  let speed = movementSpeed({ flying: c.flying, action: "explore", stamina: c.stamina, skill: memory.attackSkill });
  let turn = Math.sin(elapsed * 0.53) * 0.12 + output.odorTurn * 1.7 + output.turn, mode = c.flying ? "自主飞行探索" : "地面快速探索";
  let attacking = false, duelTactic = "";
  const socialLocked = !duelMode && ["roll", "settle", "rub"].includes(world.interaction.reaction) && elapsed < world.interaction.reactionUntil;
  if (socialLocked) {
    speed = 0; turn = 0; mode = "撒娇互动：原地打滚，暂停主动行走";
  } else if (duelMode) {
    const motor = world.duel.playerMotor || { x: Math.cos(c.angle), y: Math.sin(c.angle), speed: 250, facing: c.angle, mode: "search" };
    let desiredMove = Math.atan2(motor.y, motor.x); const tactic = motor.mode; duelTactic = tactic;
    const playerRagdollLocked = corgiRagdollControlLocked(c, playerBodyType);
    if (!playerRagdollLocked) {
      const airborneBodyAngle = c.angle;
      const orientation = updateCombatOrientation({
        bodyAngle: c.angle, lookAngle: c.lookAngle ?? c.angle, movementAngle: desiredMove,
        targetAngle: world.duel.playerAimingSkillId ? (motor.lookFacing ?? desiredMove) : (motor.bodyFacing ?? motor.lookFacing ?? desiredMove),
        lookTargetAngle: motor.lookFacing ?? desiredMove, hasTarget: motor.hasTarget,
        attacking: elapsed < world.duel.playerAttackUntil || Boolean(world.duel.playerAimingSkillId), requiresFacing: SKILLS[world.duel.playerAimingSkillId || world.duel.playerActiveSkillId]?.requiresFacing,
        mode: tactic, dt,
      });
      c.angle = groundBody && (c.altitude || 0) > 0.01 ? airborneBodyAngle : orientation.bodyAngle;
      c.lookAngle = orientation.lookAngle;
    }
    if (groundBody) {
      if (playerRagdollLocked) {
        c.speed = THREE.MathUtils.lerp(c.speed || 0, 0, Math.min(1, dt * 12));
        c.actualSpeed = THREE.MathUtils.lerp(c.actualSpeed || 0, 0, Math.min(1, dt * 12));
        if ((c.altitude || 0) > 0.01) {
          c.verticalSpeed = (c.verticalSpeed || 0) - 1040 * dt;
          c.altitude = Math.max(0, c.altitude + c.verticalSpeed * dt);
        } else { c.altitude = 0; c.verticalSpeed = 0; }
        c.flightPhase = c.altitude > 0 ? "falling" : "grounded"; c.bankAngle = 0;
        c.groundAction = c.ragdollState;
        c.leapChargeUntil = 0;
        world.duel.playerDodgeUntil = 0; world.duel.playerPounceUntil = 0; world.duel.playerRammingUntil = 0;
        c.motorChannels = { forward: 0, turn: 0, rootTarget: 0, limbAdapter: "ragdoll-control-locked" };
        turn = 0; speed = 0; duelTactic = `ragdoll-${c.ragdollState}`;
      } else {
      const separation = distance3D(c, world.duel.rival);
      const dodgeRequested = ["reflexDodge", "collisionAvoidance"].includes(tactic);
      if (dodgeRequested && elapsed >= (world.duel.playerNextDodgeJumpAt || 0)) {
        world.duel.playerDodgeUntil = elapsed + 0.38;
        world.duel.playerDodgeMode = motor.evasionMode || "lateral";
        world.duel.playerNextDodgeJumpAt = elapsed + 0.86;
      }
      const dodgeActive = elapsed < (world.duel.playerDodgeUntil || 0);
      const emergencyJump = dodgeActive && world.duel.playerDodgeMode === "vertical" && (c.altitude || 0) <= 0.01;
      const battleAge = elapsed - world.duel.startedAt;
      const pouncePhaseAllowed = !["search", "hold", "stunned"].includes(tactic) && (tactic !== "openingProbe" || battleAge > 1.35);
      const mayPounce = elapsed >= (world.duel.playerNextLeapAt || 0) && pouncePhaseAllowed && separation > 180 && separation < 1700;
      if (mayPounce && !c.leapChargeUntil && (c.altitude || 0) <= 0.01) {
        c.leapChargeUntil = elapsed + 0.48;
        c.leapDirection = Math.atan2(world.duel.rival.y - c.y, world.duel.rival.x - c.x);
        world.duel.playerNextLeapAt = elapsed + 5.2 + Math.random() * 3.2;
      }
      const charging = (c.leapChargeUntil || 0) > elapsed;
      const releasePounce = Boolean(c.leapChargeUntil) && elapsed >= c.leapChargeUntil && (c.altitude || 0) <= 0.01;
      const wantsJump = emergencyJump || releasePounce;
      const pounceJumpSpeed = THREE.MathUtils.clamp(610 + (world.duel.rival.altitude || 0) * 0.68, 610, 900);
      // The fly connectome subset exposes descending intent, not human knee muscles.
      // DNp09/DNg100 therefore modulate the body-adapter's forward drive while the
      // adapter expands that command into alternating hips, knees and ankles.
      const neuralForwardDrive = THREE.MathUtils.clamp((output.forward || 0) * 6 + (output.escape || 0) * 0.35, 0, 1);
      // The brain chooses an intent and a continuous urgency value. The body
      // adapter turns that into 0..max root speed; fatigue, pain and leg injury
      // lower the sustainable range, while stamina only unlocks a brief dodge
      // band. This replaces the old fixed sprint floor that forced every plan
      // to look equally frantic.
      const dodgeCommand = dodgeActive && c.stamina > 0.04;
      const groundPace = selectGroundCombatPace({
        mode: tactic, stamina: c.stamina, fatigue: biology.fatigue, pain: biology.pain,
        legInjury: biology.injuries.leg, neuralDrive: neuralForwardDrive, dodging: dodgeCommand,
      });
      const normalLimit = 1176 * groundPace.condition;
      const speedLimit = groundPace.maxSpeed;
      const movementSlip = Math.abs(Math.sin(angleDelta(desiredMove, motor.lookFacing ?? c.angle)));
      const strafeFactor = dodgeCommand ? 1 : THREE.MathUtils.lerp(1, 0.68, movementSlip);
      let requestedGroundSpeed = ["hold", "stunned"].includes(tactic)
        ? 0
        : Math.max(groundPace.desiredSpeed, motor.speed * 0.9) * strafeFactor;
      const navigation = awareGroundRoute(c, charging || releasePounce ? (c.leapDirection ?? desiredMove) : desiredMove, requestedGroundSpeed);
      desiredMove = navigation.angle; requestedGroundSpeed *= navigation.speedFactor;
      if (navigation.avoiding && !dodgeActive) { duelTactic = "routeAvoidance"; world.duel.playerTactic = "routeAvoidance"; }
      c.motorChannels = { forward: neuralForwardDrive, turn: output.turn || 0, rootTarget: requestedGroundSpeed, limbAdapter: "hips-knees-ankles" };
      const previousSpeed = c.speed || 0;
      const ground = updateGroundLocomotion(c, {
        // A jump wind-up lowers the body but does not freeze horizontal motion.
        // Retaining a controlled run-up avoids the repeated 0-90 u/s zombie shuffle.
        desiredSpeed: charging ? Math.max(320 * groundPace.condition, requestedGroundSpeed * 0.55) : requestedGroundSpeed,
        desiredAngle: desiredMove,
        facingAngle: !["flee", "search"].includes(tactic) ? motor.lookFacing : undefined, combatStrafe: !["flee", "search", "chase"].includes(tactic),
        maxSpeed: speedLimit, dodge: dodgeCommand, jump: wantsJump && (c.altitude || 0) <= 0.01,
        jumpSpeed: releasePounce ? pounceJumpSpeed : 485, impulseSpeed: releasePounce ? normalLimit : emergencyJump ? speedLimit : 0, stamina: c.stamina,
      }, dt);
      Object.assign(c, ground); c.speedDelta = (ground.speed - previousSpeed) / Math.max(dt, 0.001); c.flightPhase = ground.grounded ? "grounded" : "jumping";
      if (ground.jumped) {
        biology.spendStamina(releasePounce ? 0.055 : 0.024);
        if (releasePounce) {
          world.duel.playerPounceUntil = elapsed + Math.max(1.35, pounceJumpSpeed * 1.85 / 1040); world.duel.playerPounceHit = false;
          world.duel.playerAttackStartedAt = elapsed; world.duel.playerAttackUntil = world.duel.playerPounceUntil; world.duel.playerActiveSkillId = null;
        }
        c.leapChargeUntil = 0;
      }
      c.speedTier = groundPace.tier;
      c.groundAction = charging ? "charge" : (world.duel.playerPounceUntil || 0) > elapsed ? "pounce" : dodgeCommand ? "dodge" : ground.speed < 35 ? "idle" : ground.speed < 300 ? "walk" : ground.speed > 760 ? "sprint" : "run";
      const burstRatio = THREE.MathUtils.clamp((ground.speed - normalLimit) / Math.max(1, speedLimit - normalLimit), 0, 1);
      if (groundPace.burst && burstRatio > 0) biology.spendStamina(dt * (0.018 + burstRatio * burstRatio * 0.1));
      c.bankAngle = 0; turn = 0; speed = ground.speed;
      }
    } else {
      const playerFlight = resolveFlightDirection({ bodyAngle: c.angle, desiredMovementAngle: desiredMove, previousMovementAngle: c.moveAngle ?? c.angle, mode: tactic, dt });
      c.moveAngle = playerFlight.movementAngle; c.bankAngle = THREE.MathUtils.lerp(c.bankAngle || 0, playerFlight.bankTarget, Math.min(1, dt * 6.5)); turn = 0; speed = motor.speed;
    }
    const battleModes = { flee: groundBody ? "地面战：高速撤退" : "三维空战：高速撤退", chase: groundBody ? "地面战：直线追击" : "三维空战：预测追击", hold: "战斗：放弃追击", downedGuard: "战斗：对手倒地，移动警戒", stunned: "战斗：受击失衡", search: "战斗：搜索最后目击位置", openingProbe: groundBody ? "地面步法：保持警戒并试探" : "战斗学习：远距试探并观察", wideReposition: "战术运动：全图换位", scentKite: "嗅觉追踪：视觉外拉扯", adaptiveCounter: "战斗学习：识别冲锋并反击", rangeControl: "闭环控制：维持射程并侧移", groundGuard: "地面步法：正对目标侧移控距", angleExit: "地面步法：攻击后斜向撤步", intercept: groundBody ? "地面步法：缩短距离寻找进攻窗口" : "闭环控制：预测目标运动截击", breakaway: "闭环控制：距离过近主动脱离", routeAvoidance: "路径意识：提前识别边界并沿障碍绕行", collisionAvoidance: groundBody ? "身体反射：急停侧跳" : "身体反射：避免近距碰撞", reflexDodge: groundBody ? "视觉反射：快速滑步或纵向闪避" : "视觉反射：连续躲避来袭弹道" };
    mode = groundBody && c.groundAction === "charge" ? "双足战术：锁定目标并蓄力" : groundBody && c.groundAction === "pounce" ? "双足战术：高速追猎跃击" : battleModes[tactic] || "连接组辅助的连续身体控制";
  } else if (lastDecision.action === "attack" && threatDistance < 260 && c.attackCooldown <= 0) {
    const towardEnemy = Math.atan2(world.threat.y - c.y, world.threat.x - c.x);
    c.angle += angleDelta(towardEnemy, c.angle) * Math.min(1, dt * 11);
    speed = movementSpeed({ flying: c.flying, action: "attack", stamina: c.stamina, skill: memory.attackSkill }); turn = 0; attacking = true; mode = c.flying ? "空中技能：俯冲攻击" : "地面技能：冲刺攻击";
    biology.spendStamina(dt * 0.045); c.stamina = biology.stamina;
  } else if (lastDecision.action === "escape" && threatDistance < 290) {
    const away = Math.atan2(c.y - world.threat.y, c.x - world.threat.x);
    c.angle += angleDelta(away, c.angle) * Math.min(1, dt * 8); speed = movementSpeed({ flying: c.flying, action: "escape", stamina: c.stamina }); turn = 0; mode = c.flying ? "综合判断：起飞撤退" : "综合判断：地面撤退";
    biology.spendStamina(dt * 0.032); c.stamina = biology.stamina;
  } else if (interactionCall) {
    const towardReception = Math.atan2(ownerTarget.y - c.y, ownerTarget.x - c.x);
    const faceScreen = Math.atan2(INTERACTION_SCREEN_POINT.y - c.y, INTERACTION_SCREEN_POINT.x - c.x);
    c.angle += angleDelta(ownerDistance > 65 ? towardReception : faceScreen, c.angle) * Math.min(1, dt * 5.8);
    c.lookAngle = faceScreen; c.lookPitch = 0.12; c.gazeUrgent = true;
    speed = ownerDistance > 65 ? THREE.MathUtils.clamp((ownerDistance - 45) * 1.15, 35, c.flying ? 465 : 390) : 0;
    mode = ownerDistance > 65 ? "视频互动：从正面前往机器人接待区" : "视频互动：面对屏幕观察主人";
  } else if (interactionWalk) {
    const walkTarget = world.interaction.walkTarget;
    const walkDistance = distance(c, walkTarget);
    const walkBearing = Math.atan2(walkTarget.y - c.y, walkTarget.x - c.x);
    c.angle += angleDelta(walkBearing, c.angle) * Math.min(1, dt * 4.2);
    c.lookAngle = c.angle; c.lookPitch = 0; c.gazeUrgent = false;
    speed = walkDistance > 75 ? THREE.MathUtils.clamp(walkDistance * 0.62, 110, c.flying ? 430 : 360) : 0;
    if (walkDistance <= 75) { world.interaction.commandUntil = 0; world.interaction.command = null; world.interaction.walkTarget = null; }
    mode = walkDistance > 75 ? "视频指令：散步到目标点" : "视频指令：完成散步并回头等待";
  } else if (interactionStay) {
    speed = 0; turn = 0; c.lookAngle = Math.atan2(INTERACTION_SCREEN_POINT.y - c.y, INTERACTION_SCREEN_POINT.x - c.x); c.lookPitch = 0.08; c.gazeUrgent = false;
    mode = "视频指令：停下等待";
  } else if (c.foraging.active && forageTarget && ["sniffing", "tasting"].includes(c.forageState)) {
    const foodBearing = Math.atan2(forageTarget.y - c.y, forageTarget.x - c.x);
    c.angle += angleDelta(foodBearing, c.angle) * Math.min(1, dt * 5.5);
    speed = 0;
    if (c.forageState === "sniffing") {
      mode = "觅食：停步嗅闻气味源";
      c.feedHold = Math.max(0, c.feedHold - dt);
    } else if (forageTarget.kind === "bitter" && output.bitter > 0.18 && output.feed < 0.2) {
      mode = "觅食：苦味拒食并后撤";
      c.angle += Math.PI * 0.72;
      c.rejectCooldown = 2.5;
      c.rejectedFood = forageTarget; c.rejectedFoodUntil = elapsed + 12;
      c.foraging = finishForaging(c.foraging, { now: elapsed, rejected: true });
      c.forageState = c.foraging.stage; c.forageTarget = null; c.feedHold = 0;
      addLog("觅食完成到味觉检查：苦味激活 GNG087，MN9 被抑制，生物拒食并记住短暂回避。", "bitter");
    } else {
      mode = "觅食：MN9 进食判定";
      c.forageState = "eating";
      c.feedHold = output.feed > 0.14 ? c.feedHold + dt : Math.max(0, c.feedHold - dt * 1.2);
      if (c.feedHold > 0.38 && forageTarget.kind === "sweet") {
        removeFood(forageTarget); world.score += 1; biology.eat(0.28); c.hunger = biology.hunger;
        if (collection) {
          collection.gainExperience(8); collection.active.bond = Math.min(100, collection.active.bond + 1);
          collection.resources.coins = Math.min(999999, collection.resources.coins + 6);
          collection.resources.food = Math.min(9999, collection.resources.food + 1);
          saveCollection(); collectionView?.render();
        }
        c.foraging = finishForaging(c.foraging, { now: elapsed });
        c.forageState = c.foraging.stage; c.forageTarget = null; c.feedHold = 0;
        addLog(`完成“闻到→接近→嗅闻→甜味确认→吞食”闭环。MN9 输出超过阈值，实验得分 ${world.score}。`, "feed");
        addFood("sweet");
      }
    }
  } else if (c.foraging.active && forageTarget && ["tracking", "approaching"].includes(c.forageState)) {
    const foodBearing = Math.atan2(forageTarget.y - c.y, forageTarget.x - c.x);
    c.angle += angleDelta(foodBearing, c.angle) * Math.min(1, dt * (c.forageState === "approaching" ? 6.4 : 3.6));
    speed = c.flying && c.flightCommand === "takeoff"
      ? Math.max(c.foraging.speed, movementSpeed({ flying: true, action: "explore", stamina: c.stamina }))
      : c.foraging.speed;
    mode = c.forageState === "approaching" ? "觅食：减速对准并接近" : "觅食：循左右气味追踪";
  } else if (c.foraging.active && c.forageState === "searching") {
    turn += autonomousSteering(c) * 0.72;
    speed = c.foraging.speed;
    mode = "觅食：扩大范围搜索气味";
  } else if (lastDecision.action === "observe" && threatDistance < 290) {
    const faceEnemy = Math.atan2(world.threat.y - c.y, world.threat.x - c.x);
    turn += angleDelta(faceEnemy + 0.55, c.angle) * 1.8; speed = movementSpeed({ flying: c.flying, action: "observe", stamina: c.stamina }); mode = "综合判断：保持观察";
  } else if (lastDecision.action === "ignore" && threatDistance < 290) {
    turn += autonomousSteering(c); mode = "综合判断：无视目标";
  } else {
    c.feedHold = Math.max(0, c.feedHold - dt);
    if (lastDecision.action === "follow" || lastDecision.ownerAttraction > 0.1) {
      const towardOwner = Math.atan2(ownerTarget.y - c.y, ownerTarget.x - c.x);
      turn += angleDelta(towardOwner, c.angle) * lastDecision.ownerAttraction * 4.2;
      speed = movementSpeed({ flying: c.flying, action: "follow", stamina: c.stamina }) + lastDecision.ownerAttraction * 24;
      mode = "后天记忆：靠近主人";
    } else {
      turn += autonomousSteering(c);
      mode = c.flying ? "自主曲线飞行" : groundBody ? "自主高速跑动" : "自主四足巡游";
    }
  }
  if (!duelMode) {
    if (interactionCall) {
      c.lookAngle = Math.atan2(INTERACTION_SCREEN_POINT.y - c.y, INTERACTION_SCREEN_POINT.x - c.x);
      c.lookPitch = 0.12; c.gazeUrgent = true;
    } else if (interactionWalk || interactionStay) {
      c.lookAngle = interactionWalk ? c.angle : Math.atan2(INTERACTION_SCREEN_POINT.y - c.y, INTERACTION_SCREEN_POINT.x - c.x);
      c.lookPitch = 0.06; c.gazeUrgent = false;
    } else if (c.foraging.active && forageTarget) {
      c.lookAngle = Math.atan2(forageTarget.y - c.y, forageTarget.x - c.x);
      c.lookPitch = c.altitude > 8 ? -Math.atan2(c.altitude, Math.max(35, forageDistance)) : c.forageState === "sniffing" ? -0.32 : -0.08;
      c.gazeUrgent = ["approaching", "sniffing", "tasting"].includes(c.forageState);
    } else if (["observe", "attack"].includes(lastDecision.action) && threatDistance < 360) {
      c.lookAngle = Math.atan2(world.threat.y - c.y, world.threat.x - c.x);
      c.lookPitch = 0; c.gazeUrgent = true;
    } else if (lastDecision.action === "follow" || lastDecision.ownerAttraction > 0.1) {
      c.lookAngle = Math.atan2(ownerTarget.y - c.y, ownerTarget.x - c.x);
      c.lookPitch = 0; c.gazeUrgent = false;
    } else {
      // Independent head scanning lets the creature inspect its surroundings
      // before committing its hips to a new path.
      c.lookAngle = c.angle + Math.sin(elapsed * 0.72 + Math.sin(elapsed * 0.19)) * 0.68;
      c.lookPitch = Math.sin(elapsed * 0.43) * 0.08; c.gazeUrgent = false;
    }
  }
  if (groundBody && !duelMode) {
    const previousSpeed = c.speed || 0;
    const neuralForwardDrive = THREE.MathUtils.clamp((output.forward || 0) * 6 + (output.escape || 0) * 0.3, 0, 1);
    const urgentGroundAction = ["attack", "escape"].includes(lastDecision.action);
    const groundCondition = THREE.MathUtils.clamp(1 - biology.fatigue * 0.28 - biology.pain * 0.16 - biology.injuries.leg * 0.58, 0.42, 1);
    const preciseForaging = !interactionMovement && c.foraging.active && ["tracking", "approaching", "sniffing", "tasting"].includes(c.forageState);
    const stationaryForaging = !interactionMovement && c.foraging.active && ["sniffing", "tasting", "eating"].includes(c.forageState);
    const groundTarget = interactionMovement ? speed : preciseForaging
      ? c.foraging.speed * groundCondition
      : (urgentGroundAction ? Math.max(1650, speed * 9.2)
        : lastDecision.action === "follow" ? Math.max(1080, speed * 7.2)
          : c.forageState === "searching" ? 360
            : Math.max(760, speed * 6.2)) * (0.96 + neuralForwardDrive * 0.12) * groundCondition;
    c.motorChannels = { forward: neuralForwardDrive, turn: output.turn || 0, rootTarget: groundTarget, limbAdapter: "hips-knees-ankles" };
    const navigation = awareGroundRoute(c, c.angle + turn * dt, interactionMovement || preciseForaging ? groundTarget : groundTarget * 0.56);
    if (navigation.avoiding) mode = `路径意识：提前绕开${navigation.blocker === "boundary" ? "地图边界" : "障碍物"}`;
    const ground = updateGroundLocomotion(c, {
      desiredSpeed: groundTarget * (interactionMovement || preciseForaging ? 1 : 0.56) * navigation.speedFactor, desiredAngle: navigation.angle, maxSpeed: (interactionMovement || preciseForaging ? 520 : 1008) * groundCondition,
      jump: c.flightCommand === "takeoff" && (c.altitude || 0) <= 0.01, stamina: c.stamina,
    }, dt);
    if (stationaryForaging || socialLocked) { ground.speed = 0; ground.actualSpeed = 0; }
    Object.assign(c, ground); c.speedDelta = (ground.speed - previousSpeed) / Math.max(dt, 0.001); speed = ground.speed; turn = 0;
    if (interactionMovement) c.groundAction = ground.speed < 35 ? "idle" : ground.speed < 210 ? "walk" : "run";
    else if (preciseForaging) c.groundAction = ["sniffing", "tasting", "eating"].includes(c.forageState) ? "sniff" : ground.speed < 210 ? "walk" : "run";
    else c.groundAction = ground.speed < 35 ? "idle" : ground.speed < 240 ? "walk" : "run";
    const normalRatio = ground.speed / Math.max(1, 1008 * groundCondition);
    c.speedTier = ground.speed < 35 ? "idle" : normalRatio < 0.3 ? "walk" : normalRatio < 0.62 ? "run" : normalRatio < 0.84 ? "fast-run" : "sprint";
    if (ground.jumped) { biology.spendStamina(0.02); c.flightCommand = "auto"; addLog("双足身体把起飞指令重映射为一次带惯性的跳跃。", "stimulus"); }
    // Exploration pace is free; only near-maximum sprinting consumes stamina.
    if (speed > 1500) biology.spendStamina(dt * (0.018 + 0.06 * Math.pow((speed - 1500) / 300, 2)));
  }
  if (c.flying) biology.spendStamina(dt * (duelMode ? 0.0035 : 0.009));
  // The articulated biped controller already applied its condition and hard
  // speed cap. Applying groundSpeed again here fed the result back next frame
  // and caused the full-stamina runaway/teleport bug.
  if (c.flying) speed *= bodyModifiers.flightSpeed;
  else if (!groundBody) speed *= bodyModifiers.groundSpeed;
  if (!world.duel.active && collection) speed *= collection.stats().speedMultiplier;
  if (!Number.isFinite(speed)) speed = 0;
  if (groundBody) speed = THREE.MathUtils.clamp(speed, 0, 1470);
  if (duelMode && !groundBody) {
    const acceleration = duelTactic === "reflexDodge" ? 980 : speed > c.speed ? 410 : 590;
    speed = c.speed + THREE.MathUtils.clamp(speed - c.speed, -acceleration * dt, acceleration * dt);
    const burst = Math.max(0, (speed - 350) / 300);
    if (burst > 0) biology.spendStamina(dt * (0.006 + burst * burst * 0.035));
    else if (elapsed >= world.duel.playerAttackUntil) biology.recoverStamina(dt * 0.018);
  }
  c.stamina = biology.stamina;
  if (socialLocked) { speed = 0; turn = 0; c.actualSpeed = 0; c.groundAction = "idle"; }
  c.speed = speed;
  c.rejectCooldown -= dt; c.attackCooldown -= dt; c.angle += turn * dt;
  const movementAngle = duelMode ? (c.moveAngle ?? c.angle) : c.angle;
  const beforeMoveX = c.x, beforeMoveY = c.y;
  const collided = moveBody(c, { x: Math.cos(movementAngle) * speed * dt, y: Math.sin(movementAngle) * speed * dt }, world.obstacles, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H });
  const actualTravel = Math.hypot(c.x - beforeMoveX, c.y - beforeMoveY);
  const actualSpeedSample = Math.min(speed * 1.2 + 1, actualTravel / Math.max(dt, 0.001));
  c.actualSpeed = THREE.MathUtils.lerp(c.actualSpeed ?? actualSpeedSample, actualSpeedSample, Math.min(1, dt * 10));
  if (collided) {
    const expectedTravel = Math.max(1, speed * dt);
    if (groundBody && actualTravel < expectedTravel * 0.58) {
      // Collision is now only the final safety net. Navigation should already
      // have chosen a tangent route, so do not inject a random 90–130° body
      // turn here; simply bleed speed and let the committed route continue.
      c.speed *= 0.58; c.actualSpeed *= 0.72; c.navigationRouteUntil = Math.max(c.navigationRouteUntil || 0, elapsed + 0.45);
    }
  }
  let bodyContact = false;
  world.enemies.filter((enemy) => enemy.state !== "rest").forEach((enemy) => {
    if (c.altitude <= 42 && distance(c, enemy) < c.radius + enemy.radius) {
      bodyContact = true;
      separateBodies(c, enemy);
      moveBody(c, { x: 0, y: 0 }, world.obstacles, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H });
      moveBody(enemy, { x: 0, y: 0 }, world.obstacles, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H });
    }
  });
  if (duelMode) updateDuel(dt, output);
  const contactDistance = distance(c, world.threat);
  if (!duelMode && attacking && (bodyContact || contactDistance < c.radius + world.threat.radius + 4) && world.threat.contactCooldown <= 0) {
    const success = lastDecision.winChance >= 0.42;
    memory.reinforceAttack(success); saveMemory(); c.attackCooldown = 2.8; world.threat.contactCooldown = 1.2;
    if (success) {
      const dealt = 22 * biology.modifiers().combat * (1 - world.threat.defense);
      world.threat.health -= dealt; world.score += 2;
      const push = Math.atan2(world.threat.y - c.y, world.threat.x - c.x); world.threat.x += Math.cos(push) * 38; world.threat.y += Math.sin(push) * 38;
      moveBody(world.threat, { x: 0, y: 0 }, world.obstacles, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H });
      if (world.threat.health <= 0) { world.threat.health = 1; world.threat.defeated = true; world.threat.state = "return"; }
      addLog(`冲刺命中${world.threat.name}，造成 ${dealt.toFixed(1)} 伤害；熟练度升至 ${Math.round(memory.attackSkill * 100)}%。`, "feed");
      ui.learningExplanation.textContent = "命中作为奖励，增强“局势合适 → 冲刺攻击”的可塑权重；原始 MaleCNS 突触不变。";
    } else {
      biology.takeDamage(world.threat.strength * 0.18, { wing: c.flying ? 0.06 : 0, leg: c.flying ? 0 : 0.04 }); c.health = biology.health;
      addLog("攻击失败并受到反击：自信降低，恐惧提高，下次会重新估算胜算。", "bitter");
    }
  } else if (!duelMode && !attacking && bodyContact && world.threat.hostility > 0.35 && world.threat.contactCooldown <= 0) {
    memory.experienceThreat(); biology.takeDamage(world.threat.strength * 0.12, { leg: 0.025 }); c.health = biology.health; saveMemory(); c.attackCooldown = 1.5; world.threat.contactCooldown = 1.5;
    const push = Math.atan2(world.threat.y - c.y, world.threat.x - c.x); world.threat.x += Math.cos(push) * 45; world.threat.y += Math.sin(push) * 45;
    moveBody(world.threat, { x: 0, y: 0 }, world.obstacles, { minX: 0, minY: 0, maxX: WORLD_W, maxY: WORLD_H });
    addLog(`${world.threat.name}撞到生物：恐惧记忆增强，但双方仍留在地图中。`, "bitter");
  }
  biology.update(dt, { moving: speed > 5, flying: c.flying, threat: lastDecision.danger, resting: speed < 8 });
  c.health = biology.health; c.stamina = biology.stamina; c.hunger = biology.hunger;
  if (elapsed - lastBiologySave > 4) { saveBiology(); saveSkills(); lastBiologySave = elapsed; }
  if (mode !== lastMode && !mode.includes("自主")) {
    if (duelMode) { /* 连续运动状态已显示在对战面板，避免刷掉技能命中日志。 */ }
    else if (mode.includes("撤退")) addLog(`决定撤退：${lastDecision.reason}`);
    else if (mode.includes("攻击")) addLog(`攻击学习层胜出，身体开始${c.flying ? "空中俯冲" : "地面冲刺"}。`, "stimulus");
    else if (mode === "综合判断：无视目标") addLog(lastDecision.reason);
    else if (mode === "综合判断：保持观察") addLog(lastDecision.reason);
    else if (mode === "后天记忆：靠近主人") addLog("识别到主人呼唤，亲密记忆正在提高接近倾向。", "feed");
    else addLog("接触到食物，正在观察甜/苦味竞争结果。");
  }
  lastMode = mode; ui.status.textContent = mode; updateReadouts(output); updateHud(); updateBiologyUI(); updateSkillUI();
}

const DRAGON_PALETTES = Object.freeze({
  neutral: { main: 0xc8e9df, secondary: 0xf3ffe8, accent: 0x60bda6, membrane: 0xdffff7, pattern: 0x769c92 },
  fire: { main: 0xff8062, secondary: 0xffe4ad, accent: 0xffcf4f, membrane: 0xffb079, pattern: 0xb93432 },
  electric: { main: 0xffdf57, secondary: 0xfff7bd, accent: 0x745dff, membrane: 0xe8ddff, pattern: 0x3f3a88 },
  wood: { main: 0x74d777, secondary: 0xe3f2a5, accent: 0xffc766, membrane: 0xb9ed96, pattern: 0x327855 },
  earth: { main: 0xb98b63, secondary: 0xf0d3a0, accent: 0x58c7b0, membrane: 0xd9b887, pattern: 0x6b4938 },
  water: { main: 0x5bbcf6, secondary: 0xe4f8ff, accent: 0x65e0d1, membrane: 0xa9e2ff, pattern: 0x2967b2 },
  wind: { main: 0xaedfd4, secondary: 0xf5f0ff, accent: 0xb58cff, membrane: 0xded2ff, pattern: 0x5f8fac },
});

function dragonPalette(element) { return DRAGON_PALETTES[element] || DRAGON_PALETTES.neutral; }

function createDragonWing(side, palette, style = "butterfly") {
  // 翼根固定在颈后上背（肩胛区），翅面再向后展开；避免看起来从腰或臀部长出。
  const wing = new THREE.Group(); wing.position.set(10, 49, side * 14); wing.userData.style = style;
  const membraneMaterial = new THREE.MeshPhysicalMaterial({
    color: palette.membrane, transparent: true, opacity: 0.88, roughness: 0.72,
    side: THREE.DoubleSide, depthWrite: false, clearcoat: 0.06,
  });
  const accentMaterial = standardMaterial(palette.accent, { roughness: 0.46, emissive: palette.pattern, emissiveIntensity: 0.12 });
  const patternMaterial = standardMaterial(palette.pattern, { roughness: 0.5, emissive: palette.accent, emissiveIntensity: 0.12 });
  const addLobe = (x, y, z, sx, sy, sz, rotationZ = 0) => {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(15, 22, 14), membraneMaterial);
    lobe.position.set(x, y, side * z); lobe.scale.set(sx, sy, sz); lobe.rotation.z = rotationZ; wing.add(lobe);
    return lobe;
  };
  const addSpot = (x, y, z, radius, colorMaterial = accentMaterial) => {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 10), colorMaterial);
    spot.position.set(x, y, side * z); spot.scale.set(0.22, 1, 1); wing.add(spot);
  };

  if (style === "mini") {
    addLobe(-7, 11, 22, 0.22, 1.08, 1.55, -0.22);
    addLobe(-13, -7, 20, 0.2, 0.72, 1.18, 0.3);
    addSpot(-10, 9, 32, 3.8);
  } else if (style === "petal") {
    addLobe(-8, 24, 30, 0.2, 1.45, 1.18, -0.28);
    addLobe(-17, 5, 38, 0.2, 1.14, 1.52, 0.08);
    addLobe(-14, -14, 29, 0.2, 0.9, 1.35, 0.36);
    addSpot(-17, 7, 48, 4.6);
    addSpot(-12, -15, 37, 3.4, patternMaterial);
  } else {
    // 宽圆蝶翼：上下两片相互重叠，轮廓饱满，避免旧版细长三角翼。
    addLobe(-12, 22, 39, 0.2, 1.82, 2.25, -0.2);
    addLobe(-20, -13, 35, 0.2, 1.22, 1.88, 0.3);
    addSpot(-16, 27, 57, 6.2);
    addSpot(-22, -15, 48, 4.8, patternMaterial);
  }

  const tipZ = style === "mini" ? 34 : style === "petal" ? 53 : 62;
  wing.add(cylinderBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-9, 18, side * tipZ), style === "mini" ? 1.8 : 2.3, palette.accent));
  wing.add(cylinderBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-15, -8, side * (tipZ * 0.78)), 1.5, palette.pattern));
  return wing;
}

function addDragonPatterns(group, palette) {
  [-18, -5, 9].forEach((x, index) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(15.5 - index * 0.6, 1.8, 7, 26), standardMaterial(index === 1 ? palette.accent : palette.pattern, { emissive: palette.pattern, emissiveIntensity: 0.15 }));
    band.position.set(x, 29, 0); band.rotation.y = Math.PI / 2; band.scale.y = 0.74; group.add(band);
  });
}

// Preserved tall articulated body from the earlier prototype.  It intentionally
// remains a separate selectable creature instead of being overwritten by the
// short-legged corgi skin.
function createTallBipedCreatureMesh(element = "neutral", { rival = false } = {}) {
  const group = new THREE.Group(), palette = dragonPalette(element);
  const main = standardMaterial(palette.main, { roughness: 0.5, emissive: palette.pattern, emissiveIntensity: 0.12 });
  const dark = standardMaterial(palette.pattern, { roughness: 0.68 });
  const light = standardMaterial(palette.secondary, { roughness: 0.72 });
  const accent = standardMaterial(palette.accent, { roughness: 0.4, emissive: palette.accent, emissiveIntensity: 0.22 });
  const jointMaterial = standardMaterial(palette.accent, { roughness: 0.26, emissive: palette.accent, emissiveIntensity: 0.34 });
  const makeJoint = (radius, material = jointMaterial) => {
    const joint = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material); joint.castShadow = true; group.add(joint); return joint;
  };
  const makeBone = (radius, material = main) => {
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.88, radius, 1, 12), material); bone.castShadow = true; group.add(bone); return bone;
  };
  const pelvis = makeJoint(9, dark), neck = makeJoint(6.5), spine = makeBone(5.2, main);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(18, 24, 16), main); torso.scale.set(0.58, 1.16, 0.58); torso.castShadow = true; group.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(11, 20, 14), light); chest.scale.set(0.38, 0.86, 0.62); chest.position.set(7, 13, 0); torso.add(chest);
  const headRig = new THREE.Group(); group.add(headRig);
  const head = new THREE.Mesh(new THREE.SphereGeometry(17, 26, 18), main); head.scale.set(0.95, 1.08, 0.92); headRig.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(9, 18, 12), light); muzzle.position.set(15, -5, 0); muzzle.scale.set(1.1, 0.62, 0.82); headRig.add(muzzle);
  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(7, 28, 12), dark); ear.position.set(-2, 22, side * 9); ear.scale.set(0.65, 1.15, 0.55); ear.rotation.z = -0.13; headRig.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(4.3, 16, 10), standardMaterial(0x11242a, { roughness: 0.18 })); eye.position.set(13, 4, side * 10); eye.scale.set(0.5, 1, 0.72); headRig.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(1.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); glint.position.set(15.4, 5.2, side * 11.3); headRig.add(glint);
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.8, 12, 8), dark); nose.position.set(23, -5, 0); headRig.add(nose);
  const crest = new THREE.Mesh(new THREE.ConeGeometry(6, 25, 12), accent); crest.position.set(-12, 11, 0); crest.rotation.z = -0.78; headRig.add(crest);
  const legs = [];
  [-1, 1].forEach((side, index) => {
    const hip = makeJoint(6.6), knee = makeJoint(6.2), ankle = makeJoint(5.2), toe = makeJoint(4.4, dark);
    const thigh = makeBone(5.4, main), shin = makeBone(4.6, dark), foot = makeBone(4.2, dark);
    legs.push({ group: hip, hip, knee, ankle, toe, thigh, shin, foot, side, phase: index });
  });
  const arms = [];
  [-1, 1].forEach((side, index) => {
    const shoulder = makeJoint(6.1), elbow = makeJoint(5.6), wrist = makeJoint(4.8), palm = makeJoint(6.3, accent);
    palm.scale.set(1.2, 0.88, 0.8);
    const upper = makeBone(4.8, main), forearm = makeBone(4.1, dark);
    arms.push({ group: shoulder, shoulder, elbow, wrist, palm, upper, forearm, side, phase: index });
  });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(6, 1), accent); torso.add(core); core.position.set(15, 3, 0);
  const speedTrails = new THREE.Group();
  [34, 55, 78].forEach((height, index) => {
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.6, 42 + index * 13, 7), new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.3, depthWrite: false }));
    trail.rotation.z = Math.PI / 2; trail.position.set(-42 - index * 12, height, (index - 1) * 7); speedTrails.add(trail);
  });
  speedTrails.visible = false; group.add(speedTrails);
  if (!rival) { creatureLegs = legs; wingLeft = null; wingRight = null; }
  const fallbackObjects = [...group.children];
  group.userData = { skinName: "分段关节迅影兽", bodyType: "biped", headRig, legs, arms, torso, hips: pelvis, core, speedTrails, wings: [], fallbackObjects, stickRig: { pelvis, neck, spine, torso, headRig, legs, arms, speedTrails } };
  animateBiped(group, { speed: 0, altitude: 0, groundAction: "run", gaitPhase: 0, speedDelta: 0 }, 1 / 60, rival ? "rival" : "player");
  if (!rival) {
    const bodySelector = document.querySelector("#playerBodyType"); bodySelector.dataset.rig = "procedural-articulated-biped"; bodySelector.dataset.joints = "4";
  }
  return group;
}

function createCorgiCreatureMesh(element = "neutral", { rival = false } = {}) {
  const group = new THREE.Group(), palette = dragonPalette(element);
  const plushMaterial = (color, options = {}) => new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.88,
    metalness: 0,
    sheen: 1,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.28),
    sheenRoughness: 0.82,
    clearcoat: 0.025,
    clearcoatRoughness: 1,
    ...options,
  });
  const orange = plushMaterial(rival ? 0xd27b43 : 0xe99959);
  const cream = plushMaterial(0xfff1d7, { roughness: 0.93 });
  const brown = plushMaterial(0x493129, { roughness: 0.78 });
  const pink = plushMaterial(0xf2aaa4, { roughness: 0.9 });
  const accent = plushMaterial(palette.accent, { roughness: 0.78, emissive: palette.accent, emissiveIntensity: 0.055 });
  const collarMaterial = plushMaterial(0xc94f48, { roughness: 0.82 });
  const addPaintedBelly = (material) => {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCorgiLocalPosition;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCorgiLocalPosition = position;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCorgiLocalPosition;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          float corgiOval = 1.0 - smoothstep(0.72, 1.0,
            pow(vCorgiLocalPosition.z / 22.5, 2.0) +
            pow((vCorgiLocalPosition.y + 7.0) / 30.0, 2.0));
          float corgiBib = 1.0 - smoothstep(0.68, 1.0,
            pow(vCorgiLocalPosition.z / 24.0, 2.0) +
            pow((vCorgiLocalPosition.y - 22.0) / 17.0, 2.0));
          float corgiFront = smoothstep(8.0, 22.0, vCorgiLocalPosition.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.945, 0.843), max(corgiOval, corgiBib) * corgiFront);`);
    };
    material.customProgramCacheKey = () => "corgi-painted-belly-v1";
    material.needsUpdate = true;
  };
  const addPaintedFaceBlaze = (material) => {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCorgiHeadPosition;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCorgiHeadPosition = position;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCorgiHeadPosition;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          float blazeWidth = 4.6 + max(0.0, 13.0 - vCorgiHeadPosition.y) * 0.16;
          float blazeStripe = 1.0 - smoothstep(blazeWidth, blazeWidth + 2.8, abs(vCorgiHeadPosition.z));
          float blazeHeight = smoothstep(-10.0, -3.0, vCorgiHeadPosition.y) *
            (1.0 - smoothstep(25.0, 32.0, vCorgiHeadPosition.y));
          float blazeFront = smoothstep(9.0, 24.0, vCorgiHeadPosition.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.945, 0.843), blazeStripe * blazeHeight * blazeFront);`);
    };
    material.customProgramCacheKey = () => "corgi-painted-face-blaze-v1";
    material.needsUpdate = true;
  };

  // A new corgi suit rig: pear-shaped body covers the hips so only a very
  // short section of each leg remains visible below the costume.
  // The animation still needs hip/neck/spine controls, but they are no longer
  // visible balls.  One continuous lathed surface now owns the whole torso.
  const pelvis = new THREE.Object3D(), neck = new THREE.Object3D(), spine = new THREE.Object3D();
  group.add(pelvis, neck, spine);
  // LatheGeometry expects the profile from bottom to top.  Reversing this
  // order points the normals outward; the previous top-to-bottom order made
  // the front faces disappear and exposed the tail through the torso.
  const pearProfile = [
    new THREE.Vector2(0, -33), new THREE.Vector2(8, -34), new THREE.Vector2(15, -36),
    new THREE.Vector2(24, -32), new THREE.Vector2(29.5, -22), new THREE.Vector2(31, -8),
    new THREE.Vector2(27.5, 9), new THREE.Vector2(23, 22), new THREE.Vector2(18, 31),
    new THREE.Vector2(11, 35), new THREE.Vector2(0, 34),
  ];
  const torsoMaterial = plushMaterial(rival ? 0xd27b43 : 0xe99959);
  addPaintedBelly(torsoMaterial);
  const torso = new THREE.Mesh(new THREE.LatheGeometry(pearProfile, 48), torsoMaterial);
  torso.scale.set(1, 1.04, 0.95); torso.castShadow = true; group.add(torso);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(13.5, 2.8, 10, 30), collarMaterial);
  collar.rotation.x = Math.PI / 2; collar.scale.z = 0.82; neck.add(collar);
  const medal = new THREE.Mesh(new THREE.SphereGeometry(4.8, 16, 10), standardMaterial(0xf4c74f, { roughness: 0.45 }));
  medal.scale.set(0.45, 1, 1); medal.position.set(12.5, -5, 0); neck.add(medal);

  const headRig = new THREE.Group(); group.add(headRig);
  const headMaterial = plushMaterial(rival ? 0xd27b43 : 0xe99959);
  addPaintedFaceBlaze(headMaterial);
  const head = new THREE.Mesh(new THREE.SphereGeometry(33, 42, 32), headMaterial);
  head.scale.set(1, 0.97, 0.92); head.castShadow = true; headRig.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(17, 30, 24), cream);
  muzzle.position.set(27, -10, 0); muzzle.scale.set(0.94, 0.65, 0.9); headRig.add(muzzle);
  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(13, 28, 22), orange);
    ear.position.set(-3, 27, side * 17); ear.rotation.z = side * -0.05; ear.scale.set(0.7, 1.45, 0.58); headRig.add(ear);
    const innerEar = new THREE.Mesh(new THREE.SphereGeometry(8.5, 24, 18), pink);
    innerEar.position.set(4, 28, side * 21); innerEar.rotation.z = side * -0.05; innerEar.scale.set(0.5, 1.15, 0.25); headRig.add(innerEar);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(7.2, 24, 18), brown);
    eye.position.set(24.5, 5, side * 15); eye.scale.set(0.6, 1, 0.76); headRig.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(2.05, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(28.2, 7.5, side * 17.4); headRig.add(glint);
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(5.2, 18, 12), brown);
  nose.position.set(39, -9, 0); nose.scale.set(0.78, 0.7, 1); headRig.add(nose);

  const legs = [];
  [-1, 1].forEach((side, index) => {
    const pivot = new THREE.Group(); group.add(pivot);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(7.7, 2.5, 10, 18), orange);
    limb.position.y = -5.5; limb.castShadow = true; pivot.add(limb);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(9.4, 26, 20), cream);
    paw.scale.set(1.28, 0.6, 1.08); paw.position.set(4, -12.5, 0); paw.castShadow = true; pivot.add(paw);
    // Compatibility pivot for combat overlays; it has no visible knee mesh.
    const knee = new THREE.Object3D(); pivot.add(knee);
    legs.push({ group: pivot, pivot, limb, paw, knee, side, phase: index });
  });

  const arms = [];
  [-1, 1].forEach((side, index) => {
    const pivot = new THREE.Group(); group.add(pivot);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(7.2, 7, 10, 18), orange);
    upper.position.y = -7.5; upper.castShadow = true; pivot.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -14; pivot.add(elbow);
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(6.8, 8, 10, 18), orange);
    lower.position.y = -7.5; lower.castShadow = true; elbow.add(lower);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(8.7, 24, 18), cream);
    palm.scale.set(1.12, 0.78, 0.92); palm.position.set(2, -16, 0); elbow.add(palm);
    arms.push({ group: pivot, pivot, limb: upper, upper, lower, palm, elbow, side, phase: index });
  });
  const tail = new THREE.Mesh(new THREE.SphereGeometry(10, 18, 12), orange);
  tail.scale.set(1.35, 0.72, 0.9); tail.position.set(-18, 2, 0); pelvis.add(tail);
  const core = medal;
  const speedTrails = new THREE.Group();
  [24, 39, 55].forEach((height, index) => {
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.5, 35 + index * 10, 7), new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.28, depthWrite: false }));
    trail.rotation.z = Math.PI / 2; trail.position.set(-37 - index * 10, height, (index - 1) * 7); speedTrails.add(trail);
  });
  speedTrails.visible = false; group.add(speedTrails);
  if (!rival) { creatureLegs = legs; wingLeft = null; wingRight = null; }
  const fallbackObjects = [...group.children];
  const softness = { pelvis: pelvis.scale.clone(), torso: torso.scale.clone() };
  const softAxis = () => ({ value: 0, velocity: 0 });
  const softMotion = { hipSway: softAxis(), chestSway: softAxis(), twist: softAxis(), roll: softAxis(), bounce: softAxis(), headLag: softAxis() };
  const ragdoll = createCorgiActiveRagdoll();
  group.userData = { skinName: "软肚短腿小柯基", bodyType: "corgi", headRig, legs, arms, torso, hips: pelvis, core, speedTrails, wings: [], fallbackObjects, corgiRig: { pelvis, neck, spine, torso, headRig, legs, arms, speedTrails, softness, softMotion, ragdoll } };
  animateCorgi(group, { speed: 0, altitude: 0, groundAction: "run", gaitPhase: 0, angle: 0, moveAngle: 0 }, 1 / 60, rival ? "rival" : "player");
  if (!rival) {
    const bodySelector = document.querySelector("#playerBodyType");
    bodySelector.dataset.rig = "procedural-rigid-corgi";
    bodySelector.dataset.joints = "0";
    bodySelector.dataset.physics = "active-ragdoll";
    bodySelector.dataset.ragdollParts = "6";
  }
  return group;
}

function createCatCreatureMesh(element = "neutral", { rival = false } = {}) {
  const group = new THREE.Group(), palette = dragonPalette(element);
  const plush = (color, options = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.91, metalness: 0, sheen: 1, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.22), sheenRoughness: 0.86, clearcoat: 0.018, clearcoatRoughness: 1, ...options });
  const baseColor = rival ? new THREE.Color(palette.main).lerp(new THREE.Color(0x6f7785), 0.18).getHex() : palette.main;
  const stripe = new THREE.Color(palette.pattern), creamPaint = new THREE.Color(palette.secondary);
  const paintedMaterial = (region) => {
    const material = plush(baseColor);
    const stripeLiteral = `vec3(${stripe.r.toFixed(4)},${stripe.g.toFixed(4)},${stripe.b.toFixed(4)})`;
    const creamLiteral = `vec3(${creamPaint.r.toFixed(4)},${creamPaint.g.toFixed(4)},${creamPaint.b.toFixed(4)})`;
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vCatLocal;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvCatLocal=position;");
      const paint = region === "head"
        ? `float cap=smoothstep(2.0,15.0,vCatLocal.y)*smoothstep(3.0,16.0,vCatLocal.x); float bands=smoothstep(0.28,0.72,sin(vCatLocal.y*0.43+abs(vCatLocal.z)*0.22)); float blaze=(1.0-smoothstep(4.4,9.5,abs(vCatLocal.z)))*smoothstep(-8.0,8.0,vCatLocal.y)*smoothstep(10.0,22.0,vCatLocal.x); float muzzle=(1.0-smoothstep(10.0,17.0,length(vec2(vCatLocal.y+8.0,vCatLocal.z))))*smoothstep(12.0,22.0,vCatLocal.x); diffuseColor.rgb=mix(diffuseColor.rgb,${stripeLiteral},cap*bands*0.82); diffuseColor.rgb=mix(diffuseColor.rgb,${creamLiteral},max(blaze,muzzle));`
        : `float top=smoothstep(1.0,13.0,vCatLocal.y); float side=smoothstep(8.0,19.0,abs(vCatLocal.z)); float bands=smoothstep(0.18,0.76,sin(vCatLocal.x*0.42+abs(vCatLocal.z)*0.16)); float belly=(1.0-smoothstep(4.0,17.0,abs(vCatLocal.z)))*(1.0-smoothstep(-9.0,5.0,vCatLocal.y)); diffuseColor.rgb=mix(diffuseColor.rgb,${stripeLiteral},bands*max(top,side)*0.78); diffuseColor.rgb=mix(diffuseColor.rgb,${creamLiteral},belly*0.9);`;
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vCatLocal;").replace("#include <color_fragment>", `#include <color_fragment>\n${paint}`);
    };
    material.customProgramCacheKey = () => `cat-surface-painted-${region}-v1`;
    return material;
  };
  const bodyMaterial = paintedMaterial("body"), headMaterial = paintedMaterial("head");
  const pawMaterial = plush(palette.secondary), dark = plush(0x3a2b32), pink = plush(0xe8a6ad);
  const body = new THREE.Mesh(new THREE.SphereGeometry(29, 38, 28), bodyMaterial); body.scale.set(1.42, 0.77, 0.86); body.castShadow = true; group.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(23, 34, 25), bodyMaterial); chest.scale.set(0.92, 0.92, 0.95); chest.castShadow = true; group.add(chest);
  const headRig = new THREE.Group(); group.add(headRig);
  const head = new THREE.Mesh(new THREE.SphereGeometry(27, 40, 30), headMaterial); head.scale.set(1.02, 0.96, 0.94); head.castShadow = true; headRig.add(head);
  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(10.5, 27, 18), bodyMaterial); ear.position.set(-2, 24, side * 15); ear.rotation.z = -0.06; ear.scale.set(0.78, 1, 0.63); ear.castShadow = true; headRig.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(6.1, 17, 16), pink); inner.position.set(2.5, 25, side * 18.5); inner.rotation.z = -0.06; inner.scale.set(0.64, 0.84, 0.3); headRig.add(inner);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(6.2, 22, 16), dark); eye.scale.set(0.5, 0.92, 0.76); eye.position.set(22, 5, side * 13.5); headRig.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); glint.position.set(25.3, 7, side * 15.4); headRig.add(glint);
    [-1, 0, 1].forEach((row) => headRig.add(cylinderBetween(new THREE.Vector3(24, -7 + row * 3.5, side * 10), new THREE.Vector3(38, -6 + row * 5, side * (19 + Math.abs(row) * 2)), 0.45, 0x5b4a4b)));
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(4.1, 18, 12), dark); nose.scale.set(0.68, 0.62, 1); nose.position.set(29, -7, 0); headRig.add(nose);
  const legs = [];
  [[22, -1], [22, 1], [-23, -1], [-23, 1]].forEach(([x, side], index) => {
    const pivot = new THREE.Group(); group.add(pivot);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(6.4, 7.5, 9, 16), bodyMaterial); upper.position.y = -9; upper.castShadow = true; pivot.add(upper);
    const knee = new THREE.Group(); knee.position.y = -17; pivot.add(knee);
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(5.7, 8, 9, 16), bodyMaterial); lower.position.y = -8.5; lower.castShadow = true; knee.add(lower);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(7.8, 22, 16), pawMaterial); paw.scale.set(1.15, 0.72, 1.08); paw.position.set(3.5, -18, 0); paw.castShadow = true; knee.add(paw);
    legs.push({ group: pivot, pivot, upper, knee, lower, paw, base: new THREE.Vector3(x, 34, side * 18), side, phase: index });
  });
  const tailRoot = new THREE.Group(); tailRoot.position.set(-38, 48, 0); group.add(tailRoot);
  const tailSegments = []; let parent = tailRoot;
  for (let index = 0; index < 4; index += 1) {
    const joint = new THREE.Group(); joint.position.set(index ? -12 : 0, index ? 5 : 0, 0); parent.add(joint);
    const segment = new THREE.Mesh(new THREE.CapsuleGeometry(5.2 - index * 0.35, 9, 8, 14), bodyMaterial); segment.rotation.z = Math.PI / 2; segment.position.set(-7, 2, 0); segment.castShadow = true; joint.add(segment);
    tailSegments.push(joint); parent = joint;
  }
  const core = new THREE.Object3D(); core.position.set(5, 44, 0); group.add(core);
  const speedTrails = new THREE.Group();
  [27, 40, 54].forEach((height, index) => { const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.25, 32 + index * 9, 7), new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.25, depthWrite: false })); trail.rotation.z = Math.PI / 2; trail.position.set(-49 - index * 10, height, (index - 1) * 7); speedTrails.add(trail); });
  speedTrails.visible = false; group.add(speedTrails);
  if (!rival) { creatureLegs = legs; wingLeft = null; wingRight = null; }
  group.userData = { skinName: "四足软萌小猫", bodyType: "cat", headRig, legs, arms: [], torso: body, hips: body, core, speedTrails, wings: [], catRig: { body, chest, headRig, legs, tailSegments, speedTrails } };
  animateCat(group, { speed: 0, altitude: 0, groundAction: "idle", gaitPhase: 0, angle: 0, moveAngle: 0 }, 1 / 60, rival ? "rival" : "player");
  return group;
}

function createPlushAerialMesh(element = "neutral", { rival = false, wingStyle = "butterfly" } = {}) {
  const group = new THREE.Group(), palette = dragonPalette(element);
  const fur = standardMaterial(palette.main, { roughness: 0.93, emissive: palette.pattern, emissiveIntensity: 0.035 });
  const bellyMaterial = standardMaterial(palette.secondary, { roughness: 0.98 });
  const pawMaterial = standardMaterial(palette.pattern, { roughness: 0.95 });
  const accentMaterial = standardMaterial(palette.accent, { roughness: 0.82, emissive: palette.accent, emissiveIntensity: 0.06 });

  // Compact bean-shaped torso rather than a long dragon body.
  const body = new THREE.Mesh(new THREE.SphereGeometry(27, 30, 22), fur);
  body.scale.set(1.08, 0.98, 0.96); body.position.set(-4, 31, 0); body.castShadow = true; group.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(18, 24, 18), bellyMaterial);
  belly.scale.set(0.55, 0.72, 0.82); belly.position.set(20, 26, 0); group.add(belly);

  const headRig = new THREE.Group(); headRig.position.set(24, 43, 0); group.add(headRig);
  const head = new THREE.Mesh(new THREE.SphereGeometry(24, 30, 22), fur); head.scale.set(1.02, 0.98, 0.98); head.castShadow = true; headRig.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(12, 22, 16), bellyMaterial);
  muzzle.position.set(19, -7, 0); muzzle.scale.set(0.92, 0.58, 0.84); headRig.add(muzzle);
  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 14), accentMaterial);
    ear.position.set(-6, 19, side * 14); ear.scale.set(0.72, 1.05, 0.58); ear.rotation.z = side * 0.1; headRig.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(6.4, 20, 14), standardMaterial(0x142727, { roughness: 0.22 }));
    eye.scale.set(0.58, 1, 0.76); eye.position.set(12, 5, side * 15); headRig.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(1.65, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(15.6, 7.2, side * 17); headRig.add(glint);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(3.6, 12, 8), accentMaterial);
    cheek.scale.set(0.48, 0.7, 1); cheek.position.set(17, -3, side * 14.8); headRig.add(cheek);
    const antenna = cylinderBetween(new THREE.Vector3(0, 16, side * 5), new THREE.Vector3(10, 29, side * 12), 1.15, palette.pattern);
    headRig.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), accentMaterial);
    antennaTip.position.set(10, 29, side * 12); headRig.add(antennaTip);
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(3.8, 14, 10), pawMaterial);
  nose.position.set(29, -7, 0); nose.scale.set(0.82, 0.72, 1); headRig.add(nose);

  const legs = [];
  [[13, -1, 0], [13, 1, 1], [-18, -1, 1], [-18, 1, 0]].forEach(([x, side, phase]) => {
    const leg = new THREE.Group(); leg.position.set(x, 20, side * 18);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 7.2, 15, 14), fur); upper.position.y = -6; upper.castShadow = true; leg.add(upper);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(8.2, 18, 12), pawMaterial); paw.scale.set(1.3, 0.68, 1); paw.position.set(5, -15, 0); paw.castShadow = true; leg.add(paw);
    leg.rotation.x = side * 0.1; group.add(leg); legs.push({ group: leg, phase, side });
  });

  const wings = [-1, 1].map((side) => { const wing = createDragonWing(side, palette, wingStyle); group.add(wing); return wing; });
  const tail = new THREE.Mesh(new THREE.SphereGeometry(12, 20, 14), pawMaterial);
  tail.scale.set(1.35, 0.8, 0.9); tail.position.set(-32, 35, 0); group.add(tail);
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(6.2, 16, 10), accentMaterial);
  tailTip.position.set(-43, 43, 0); group.add(tailTip);
  [-13, 1, 14].forEach((x, index) => {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(5.2 - index * 0.5, 14, 10), accentMaterial);
    spot.scale.set(0.3, 0.9, 1); spot.position.set(x, 43 - Math.abs(index - 1) * 3, -25.3); group.add(spot);
  });

  if (!rival) { creatureLegs = legs; wingLeft = wings[0]; wingRight = wings[1]; }
  group.userData = { skinName: "绒团萤翼兽", bodyType: "aerial", wingStyle, element, headRig, legs, wings };
  return group;
}

function createCreatureMesh(element = "neutral") {
  if (playerBodyType === "biped") return createTallBipedCreatureMesh(element);
  if (playerBodyType === "corgi") return createCorgiCreatureMesh(element);
  if (playerBodyType === "cat") return createCatCreatureMesh(element);
  return createPlushAerialMesh(element, { wingStyle: playerWingStyle });
  /* Legacy procedural skin retained below temporarily for save compatibility.
     It is unreachable; the plush skin above owns current rendering. */
  const group = new THREE.Group();
  const headRig = new THREE.Group(), headParts = []; headRig.position.set(18, 34, 0); group.add(headRig);
  creatureLegs = [];
  const palette = dragonPalette(element);
  const mint = standardMaterial(palette.main, { roughness: 0.65, emissive: palette.pattern, emissiveIntensity: 0.2 });
  const mintDark = standardMaterial(palette.pattern, { roughness: 0.76 });
  const cream = standardMaterial(palette.secondary, { roughness: 0.8 });
  const coral = standardMaterial(palette.accent, { roughness: 0.58 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(22, 30, 20), mint);
  body.scale.set(1.38, 0.9, 0.92); body.position.set(-5, 29, 0); body.castShadow = true; group.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(15, 24, 16), cream);
  belly.scale.set(1.12, 0.5, 0.78); belly.position.set(2, 20, 0); belly.rotation.z = 0.12; group.add(belly);
  const head = new THREE.Mesh(new THREE.SphereGeometry(19.5, 28, 20), standardMaterial(palette.main, { emissive: palette.pattern, emissiveIntensity: 0.22 }));
  head.scale.set(1.05, 1, 0.98); head.position.set(29, 34, 0); head.castShadow = true; group.add(head); headParts.push(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(8.5, 20, 14), cream);
  muzzle.scale.set(0.9, 0.68, 1.05); muzzle.position.set(44, 29, 0); group.add(muzzle); headParts.push(muzzle);
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(6.4, 20, 14), standardMaterial(0x172d2d, { roughness: 0.22 }));
    eye.scale.set(0.62, 1, 0.82); eye.position.set(40, 39, side * 10.5); group.add(eye); headParts.push(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(43.7, 41.3, side * 12.3); group.add(glint); headParts.push(glint);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(3.1, 12, 8), coral);
    cheek.scale.set(0.45, 0.72, 1); cheek.position.set(44.2, 30, side * 10.6); group.add(cheek); headParts.push(cheek);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(7.5, 23, 12), standardMaterial(palette.accent));
    ear.scale.set(0.62, 1.65, 0.45); ear.position.set(24, 54, side * 11); ear.rotation.z = side * 0.18; group.add(ear); headParts.push(ear);
    const antenna = cylinderBetween(new THREE.Vector3(34, 50, side * 6), new THREE.Vector3(45, 63, side * 12), 0.9, 0x65c9a0); group.add(antenna); headParts.push(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(2.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xd7f879 }));
    antennaTip.position.set(45, 63, side * 12); group.add(antennaTip); headParts.push(antennaTip);
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.8, 14, 10), standardMaterial(0x284a43));
  nose.position.set(51.2, 30, 0); group.add(nose); headParts.push(nose);
  group.updateMatrixWorld(true); headParts.forEach((part) => headRig.attach(part));

  [[14, -1, 0], [14, 1, 1], [-19, -1, 1], [-19, 1, 0]].forEach(([x, side, phase]) => {
    const leg = new THREE.Group(); leg.position.set(x, 19, side * 16);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.4, 14, 12), mintDark); upper.position.y = -6; upper.castShadow = true; leg.add(upper);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 10), standardMaterial(0x315f55)); paw.scale.set(1.35, 0.55, 1); paw.position.set(4, -14, 0); paw.castShadow = true; leg.add(paw);
    leg.rotation.x = side * 0.12; group.add(leg); creatureLegs.push({ group: leg, phase, side });
  });

  wingLeft = createDragonWing(-1, palette, playerWingStyle); wingRight = createDragonWing(1, palette, playerWingStyle); group.add(wingLeft, wingRight);
  const tail = new THREE.Mesh(new THREE.TorusGeometry(13, 3.4, 10, 28, Math.PI * 1.35), mintDark);
  tail.position.set(-30, 34, 0); tail.rotation.set(Math.PI / 2, 0.25, -0.35); group.add(tail);
  const tailGlow = new THREE.Mesh(new THREE.SphereGeometry(5.2, 16, 10), new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.88 }));
  tailGlow.position.set(-42, 45, 0); group.add(tailGlow);
  const glow = new THREE.PointLight(palette.accent, 0.65, 90); glow.position.copy(tailGlow.position); group.add(glow);
  addDragonPatterns(group, palette);
  group.userData.skinName = "四足萤翼龙"; group.userData.bodyType = "aerial"; group.userData.wingStyle = playerWingStyle; group.userData.headRig = headRig; group.userData.legs = creatureLegs; group.userData.wings = [wingLeft, wingRight];
  return group;
}

function createRivalMesh(element = "water") {
  if (isGroundBodyType(rivalBodyType)) {
    const biped = rivalBodyType === "corgi"
      ? createCorgiCreatureMesh(element, { rival: true })
      : rivalBodyType === "cat"
        ? createCatCreatureMesh(element, { rival: true })
        : createTallBipedCreatureMesh(element, { rival: true });
    biped.userData.element = element; return biped;
  }
  return createPlushAerialMesh(element, { rival: true, wingStyle: rivalWingStyle });
  /* Legacy rival skin retained below temporarily for save compatibility. */
  const group = new THREE.Group(), palette = dragonPalette(element), color = palette.main;
  const headRig = new THREE.Group(), headParts = []; headRig.position.set(18, 34, 0); group.add(headRig);
  const bodyMaterial = standardMaterial(color, { roughness: 0.66, emissive: color, emissiveIntensity: 0.16 });
  const dark = standardMaterial(palette.pattern, { roughness: 0.82 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(22, 28, 18), bodyMaterial);
  body.scale.set(1.38, 0.9, 0.92); body.position.set(-5, 29, 0); body.castShadow = true; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(18, 26, 18), bodyMaterial); head.position.set(29, 34, 0); head.castShadow = true; group.add(head); headParts.push(head);
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(6, 18, 12), standardMaterial(0x152524)); eye.scale.x = 0.62; eye.position.set(40, 39, side * 10); group.add(eye); headParts.push(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); glint.position.set(43.5, 41, side * 12); group.add(glint); headParts.push(glint);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(6.5, 22, 10), standardMaterial(palette.accent)); horn.position.set(23, 54, side * 10); horn.rotation.z = side * 0.16; group.add(horn); headParts.push(horn);
  });
  const snout = new THREE.Mesh(new THREE.SphereGeometry(9, 18, 12), standardMaterial(palette.secondary)); snout.scale.set(1.2, 0.64, 0.9); snout.position.set(45, 29, 0); group.add(snout); headParts.push(snout);
  const legs = [];
  [[14, -1, 0], [14, 1, 1], [-19, -1, 1], [-19, 1, 0]].forEach(([x, side, phase]) => {
    const leg = new THREE.Group(); leg.position.set(x, 19, side * 16);
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.2, 14, 12), dark); limb.position.y = -6; leg.add(limb);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(5.8, 14, 9), dark); paw.scale.set(1.3, 0.55, 1); paw.position.set(4, -14, 0); leg.add(paw);
    group.add(leg); legs.push({ group: leg, phase, side });
  });
  const wings = [-1, 1].map((side) => { const wing = createDragonWing(side, palette, rivalWingStyle); group.add(wing); return wing; });
  const crest = new THREE.Mesh(new THREE.ConeGeometry(7, 20, 10), bodyMaterial); crest.position.set(22, 56, 0); crest.rotation.z = -0.2; group.add(crest);
  headParts.push(crest); group.updateMatrixWorld(true); headParts.forEach((part) => headRig.attach(part));
  addDragonPatterns(group, palette);
  group.userData = { legs, wings, element, headRig, wingStyle: rivalWingStyle };
  return group;
}

function createEnemyMesh(enemy) {
  const group = new THREE.Group();
  const color = ELEMENTS[enemy.element].color;
  group.add(new THREE.Mesh(new THREE.SphereGeometry(25, 20, 14), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false })));
  const core = new THREE.Mesh(new THREE.SphereGeometry(11, 20, 14), standardMaterial(color, { emissive: color, emissiveIntensity: 0.4 }));
  core.castShadow = true; group.add(core);
  for (let i = 0; i < 8; i += 1) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(2.8, 13, 6), standardMaterial(color, { emissive: color, emissiveIntensity: 0.2 }));
    const angle = i / 8 * Math.PI * 2; spike.position.set(Math.cos(angle) * 13, 0, Math.sin(angle) * 13); spike.rotation.z = Math.PI / 2; spike.rotation.y = -angle; group.add(spike);
  }
  const healthBack = new THREE.Mesh(new THREE.BoxGeometry(34, 3, 2), new THREE.MeshBasicMaterial({ color: 0x240c0c })); healthBack.position.y = 37; group.add(healthBack);
  const healthBar = new THREE.Mesh(new THREE.BoxGeometry(32, 2, 2.5), new THREE.MeshBasicMaterial({ color: 0x7ff0a6 })); healthBar.position.set(0, 37, 1); healthBar.userData.healthBar = true; group.add(healthBar);
  group.userData.enemyId = enemy.id;
  return group;
}

function syncEnemyMeshes() {
  enemyMeshes.forEach((mesh) => scene.remove(mesh)); enemyMeshes = new Map();
  world.enemies.forEach((enemy) => { const mesh = createEnemyMesh(enemy); enemyMeshes.set(enemy.id, mesh); scene.add(mesh); });
}

function createOwnerMesh() {
  const group = new THREE.Group();
  const blue = standardMaterial(0x68b9ff, { emissive: 0x1e6ca8, emissiveIntensity: 0.18 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(9, 14, 32, 18), blue); body.position.y = 22; body.castShadow = true; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(11, 20, 14), standardMaterial(0xbfe6ff)); head.position.y = 47; head.castShadow = true; group.add(head);
  const beacon = new THREE.Mesh(new THREE.RingGeometry(19, 23, 36), new THREE.MeshBasicMaterial({ color: 0x68b9ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  beacon.rotation.x = -Math.PI / 2; beacon.position.y = 1; group.add(beacon);
  return group;
}

function createInteractionScreen(video) {
  const group = createTVRobot(video);
  group.name = "owner-tv-robot";
  group.position.copy(toScenePosition(INTERACTION_SCREEN_POINT));
  group.rotation.y = Math.PI / 2 - world.robot.angle;
  return group;
}

function createObstacle(type, radius, height) {
  const group = new THREE.Group();
  if (type === "rock") {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), standardMaterial(0x42524d, { roughness: 0.95 }));
    rock.scale.set(1.15, height / radius, 0.9); rock.position.y = height * 0.52; rock.castShadow = true; rock.receiveShadow = true; group.add(rock);
  } else if (type === "wall") {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(radius * 2, height, 25), standardMaterial(0x4a514c, { roughness: 0.98 }));
    wall.position.y = height / 2; wall.castShadow = true; wall.receiveShadow = true; group.add(wall);
    for (let x = -radius + 14; x < radius; x += 28) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(1.2, height * 0.92, 26), new THREE.MeshBasicMaterial({ color: 0x252f2d })); seam.position.set(x, height / 2, 0); group.add(seam);
    }
  } else if (type === "pond") {
    const pond = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), new THREE.MeshPhysicalMaterial({ color: 0x247080, transparent: true, opacity: 0.58, roughness: 0.1, metalness: 0.15 }));
    pond.rotation.x = -Math.PI / 2; pond.scale.z = 0.6; pond.position.y = 0.8; group.add(pond);
    const rim = new THREE.Mesh(new THREE.RingGeometry(radius * 0.94, radius * 1.08, 40), new THREE.MeshBasicMaterial({ color: 0x35584c, side: THREE.DoubleSide })); rim.rotation.x = -Math.PI / 2; rim.scale.z = 0.6; rim.position.y = 0.45; group.add(rim);
  } else if (type === "mushroom") {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.18, radius * 0.28, height * 0.72, 14), standardMaterial(0xbcc4a9)); stem.position.y = height * 0.36; stem.castShadow = true; group.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.72, 22, 12), standardMaterial(0x8957c6, { emissive: 0x4d2674, emissiveIntensity: 0.45 })); cap.scale.y = 0.38; cap.position.y = height * 0.76; cap.castShadow = true; group.add(cap);
    const glow = new THREE.PointLight(0x9b78ff, 0.75, 150); glow.position.y = height * 0.72; group.add(glow);
  } else {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(4, 7, height * 0.66, 12), standardMaterial(0x385b3e)); stem.position.y = height * 0.33; stem.castShadow = true; group.add(stem);
    for (let i = 0; i < 5; i += 1) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.42, 14, 8), standardMaterial(0x4f9960));
      const angle = i / 5 * Math.PI * 2; leaf.scale.set(1.4, 0.45, 0.62); leaf.position.set(Math.cos(angle) * radius * 0.45, height * (0.55 + (i % 2) * 0.12), Math.sin(angle) * radius * 0.45); leaf.rotation.y = -angle; group.add(leaf);
    }
  }
  return group;
}

function createCave(caveId) {
  const group = new THREE.Group();
  const rockMaterial = standardMaterial(caveId === 0 ? 0x3e5047 : 0x55433b, { roughness: 1 });
  for (let i = 0; i < 9; i += 1) {
    const angle = Math.PI * (0.05 + i / 9 * 0.9);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(22 + (i % 3) * 5, 1), rockMaterial);
    rock.position.set(Math.cos(angle) * 56, 20 + Math.sin(angle) * 45, 0); rock.scale.z = 1.45; rock.castShadow = true; group.add(rock);
  }
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(50, 32), new THREE.MeshBasicMaterial({ color: 0x020506, side: THREE.DoubleSide }));
  mouth.position.set(0, 42, 3); group.add(mouth);
  const glow = new THREE.PointLight(caveId === 0 ? 0x65d7a1 : 0xff805d, 1.1, 180); glow.position.set(0, 35, 18); group.add(glow);
  return group;
}

function createTerrainTexture() {
  const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 684;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 1024, 684);
  gradient.addColorStop(0, "#b9c9b8"); gradient.addColorStop(0.48, "#819a83"); gradient.addColorStop(1, "#536d62");
  context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 170; i += 1) {
    const x = (i * 173) % canvas.width, y = (i * 97 + Math.sin(i * 2.4) * 80 + 684) % 684;
    const radius = 12 + (i % 9) * 7;
    context.fillStyle = i % 4 === 0 ? "rgba(219,226,183,.08)" : "rgba(31,70,57,.09)";
    context.beginPath(); context.ellipse(x, y, radius * 1.8, radius, i * 0.37, 0, Math.PI * 2); context.fill();
  }
  context.strokeStyle = "rgba(230,222,174,.16)"; context.lineWidth = 9; context.lineCap = "round";
  context.beginPath(); context.moveTo(80, 560); context.bezierCurveTo(270, 390, 390, 470, 525, 315); context.bezierCurveTo(660, 155, 820, 280, 955, 90); context.stroke();
  context.strokeStyle = "rgba(22,67,80,.22)"; context.lineWidth = 18;
  context.beginPath(); context.moveTo(-30, 185); context.bezierCurveTo(230, 95, 325, 320, 540, 245); context.bezierCurveTo(735, 175, 810, 420, 1060, 365); context.stroke();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
}

function createMountain(radius, height, palette, peak = false) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 9, 4), standardMaterial(palette[0], { roughness: 0.96, flatShading: true }));
  base.position.y = height / 2; base.scale.z = 0.82; base.castShadow = true; base.receiveShadow = true; group.add(base);
  const shoulder = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.62, height * 0.72, 8, 3), standardMaterial(palette[1], { roughness: 0.94, flatShading: true }));
  shoulder.position.set(radius * 0.22, height * 0.49, -radius * 0.12); shoulder.rotation.y = 0.6; shoulder.castShadow = true; group.add(shoulder);
  if (peak) {
    const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.24, height * 0.24, 8), standardMaterial(0xd7e5dc, { roughness: 0.88, flatShading: true }));
    cap.position.y = height * 0.9; group.add(cap);
  }
  return group;
}

function createMesa(radius, height, color) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius, height, 10, 3), standardMaterial(color, { roughness: 0.98, flatShading: true }));
  core.position.y = height / 2; core.castShadow = true; core.receiveShadow = true; group.add(core);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.74, radius * 0.74, 12, 10), standardMaterial(0x758066, { roughness: 0.9 }));
  top.position.y = height + 4; top.receiveShadow = true; group.add(top);
  for (let i = 0; i < 6; i += 1) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(13, 55 + i % 3 * 22, 13), standardMaterial(0x8b806d));
    const angle = i / 6 * Math.PI * 2; pillar.position.set(Math.cos(angle) * radius * 0.42, height + 30, Math.sin(angle) * radius * 0.42); pillar.rotation.y = angle; pillar.castShadow = true; group.add(pillar);
  }
  return group;
}

function addGrandTerrain() {
  const night = world.scenario === "night", ruins = world.scenario === "ruins", nest = world.scenario === "nest";
  const mountainPalette = night ? [0x243344, 0x3c5060] : nest ? [0x5b4035, 0x7b5941] : [0x40564d, 0x647562];
  const mountains = [
    [0.1, 0.18, 300, 760, true], [0.18, 0.82, 360, 980, true], [0.82, 0.16, 330, 890, true], [0.91, 0.76, 390, 1100, true],
    [0.34, 0.1, 220, 560, false], [0.68, 0.9, 260, 690, false], [0.06, 0.55, 250, 640, false], [0.94, 0.42, 280, 720, false],
  ];
  mountains.forEach(([fx, fy, radius, height]) => {
    const point = { x: WORLD_W * fx, y: WORLD_H * fy };
    world.obstacles.push({ type: "mountain", shape: "circle", x: point.x, y: point.y, radius: radius * 0.72, height });
  });

  const mesas = [[0.28, 0.69, 175, 330], [0.72, 0.35, 205, 430], [0.5, 0.84, 150, 280]];
  mesas.forEach(([fx, fy, radius, height]) => {
    const point = { x: WORLD_W * fx, y: WORLD_H * fy };
    world.obstacles.push({ type: "mesa", shape: "circle", x: point.x, y: point.y, radius: radius * 0.86, height });
  });

  const waterMaterial = new THREE.MeshPhysicalMaterial({ color: night ? 0x31558f : 0x2c91a3, emissive: night ? 0x162b61 : 0x0a3c48, emissiveIntensity: 0.22, transparent: true, opacity: 0.72, roughness: 0.08, metalness: 0.12, side: THREE.DoubleSide });
  const riverPoints = Array.from({ length: 19 }, (_, index) => {
    const ratio = index / 18;
    return new THREE.Vector3(-WORLD_W * 0.46 + WORLD_W * 0.92 * ratio, 0, -WORLD_H * 0.16 + Math.sin(index * 0.72) * WORLD_H * 0.075);
  });
  const riverGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(riverPoints), 92, 132, 10, false);
  const riverPositions = riverGeometry.attributes.position;
  for (let index = 0; index < riverPositions.count; index += 1) riverPositions.setY(index, riverPositions.getY(index) * 0.025 + 2.2);
  riverPositions.needsUpdate = true; riverGeometry.computeVertexNormals();
  const river = new THREE.Mesh(riverGeometry, waterMaterial); river.receiveShadow = true; sceneryGroup.add(river);

  // Trees, bushes, rocks and ground details now come from audited CC0 packs.
  // Keeping them outside this scenario group lets a scene switch preserve the
  // downloaded art instead of rebuilding hundreds of meshes.

  // 高空导航环让观众能直观看出空域不再是一层薄平面。
  [0.34, 0.52, 0.7].forEach((ratio, index) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(95 + index * 24, 5, 10, 56), new THREE.MeshBasicMaterial({ color: index === 1 ? 0xffd778 : 0x7de9d0, transparent: true, opacity: 0.38 }));
    ring.position.copy(toScenePosition({ x: WORLD_W * (0.38 + index * 0.12), y: WORLD_H * (0.2 + index * 0.29) }, MAX_FLIGHT_ALTITUDE * ratio));
    ring.rotation.y = index * 0.7; sceneryGroup.add(ring);
  });
}

function buildScenery(config) {
  sceneryGroup.clear(); world.obstacles = [];
  config.obstacles.forEach(([type, x, y, radius, height], index) => {
    const p = fromDesign(x, y), scaledRadius = radius * 1.55;
    const mesh = createObstacle(type, scaledRadius, height); mesh.position.copy(toScenePosition(p));
    const rotation = type === "wall" && index % 2 ? Math.PI / 2 : 0;
    if (type === "wall") mesh.rotation.y = rotation;
    sceneryGroup.add(mesh);
    world.obstacles.push(type === "wall"
      ? { type, shape: "box", x: p.x, y: p.y, halfWidth: scaledRadius, halfHeight: 15, rotation, height }
      : { type, shape: "circle", x: p.x, y: p.y, radius: type === "pond" ? scaledRadius * 0.82 : scaledRadius, height });
  });
  world.caves.forEach((cave) => {
    const mesh = createCave(cave.id); mesh.position.copy(toScenePosition(cave)); sceneryGroup.add(mesh);
    // The visible arch is a single solid rock mass. Enemies stop at the entrance
    // and switch to the rest state instead of physically passing through it.
    world.obstacles.push({ type: "cave", shape: "box", x: cave.x, y: cave.y, halfWidth: 84, halfHeight: 24, rotation: 0, height: 112 });
  });
  world.obstacles.push({ type: "interaction-screen", shape: "circle", x: world.robot.x, y: world.robot.y, radius: world.robot.radius, height: 240 });
  addGrandTerrain();
}

function syncScenarioControls() {
  const mappings = { enemyStrengthSelect: "enemyStrength", enemyHostilitySelect: "enemyHostility", attackRewardSelect: "reward", escapeRoomSelect: "escapeRoom" };
  Object.entries(mappings).forEach(([id, key]) => { document.querySelector(`#${id}`).value = String(world.tactics[key]); });
  document.querySelectorAll("[data-command]").forEach((button) => button.classList.toggle("active", button.dataset.command === world.tactics.ownerCommand));
}

function applyScenario(name) {
  const config = SCENARIOS[name]; if (!config) return;
  world.scenario = name; world.tactics = { ...config.tactics };
  scene.background.setHex(config.background); scene.fog.color.setHex(config.background); scene.fog.density = config.fog; floor.material.color.setHex(config.floor);
  const sky = scene.getObjectByName("world-sky");
  if (sky) {
    const skyColors = name === "night" ? [0x172b61, 0x080e25] : name === "nest" ? [0xd78265, 0x54312d] : name === "ruins" ? [0xa7c5ca, 0x667d78] : [0x79c5e6, 0xaad7c2];
    sky.material.uniforms.topColor.value.setHex(skyColors[0]); sky.material.uniforms.bottomColor.value.setHex(skyColors[1]);
  }
  resetWorld(); buildScenery(config); syncScenarioControls();
  document.querySelectorAll("[data-scenario]").forEach((button) => button.classList.toggle("active", button.dataset.scenario === name));
  ui.scenarioDescription.textContent = config.description;
  addLog(`场景切换为“${document.querySelector(`[data-scenario="${name}"] strong`).textContent}”：环境、收益和风险参数已更新。`, "system");
}

function makeSignalLine(color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.5, dashSize: 9, gapSize: 7 }));
  scene.add(line); return line;
}

function setCameraMode(mode, immediate = false) {
  cameraMode = mode;
  autoCombatCamera = mode === "combat";
  const button = document.querySelector("#combatCameraToggle");
  if (button) {
    const labels = { overview: "镜头：全景", follow: "镜头：角色后方", inspect: "镜头：开发形态近景", side: "镜头：角色侧面", top: "镜头：俯视", combat: "镜头：战斗跟随", video: "镜头：机器人视频第一视角", robot: "镜头：主人机器人跟随", free: "镜头：自由观战" };
    button.textContent = labels[mode] || labels.free;
    button.classList.toggle("free", mode === "free");
    button.setAttribute("aria-pressed", String(mode === "combat"));
  }
  if (controls) controls.minDistance = mode === "video" ? 45 : 340;
  document.querySelectorAll("[data-camera]").forEach((item) => item.classList.toggle("active", item.dataset.camera === mode));
  if (immediate && camera && controls) updateCameraView(1);
}

function setCombatCameraMode(following) {
  setCameraMode(following ? "combat" : "free");
}

function updateCameraView(strength = 0.065) {
  if (!camera || !controls || cameraMode === "free") return;
  const c = world.creature;
  const bipedCamera = isGroundBodyType(creatureMesh?.userData?.bodyType);
  const creatureFocus = toScenePosition(c, (bipedCamera ? 78 : 48) + (c.altitude || 0));
  const forward = new THREE.Vector3(Math.cos(c.angle), 0, Math.sin(c.angle));
  const side = new THREE.Vector3(-forward.z, 0, forward.x);
  let target = creatureFocus.clone(), desiredPosition;
  if (cameraMode === "overview") {
    target.set(0, 260, 0); desiredPosition = new THREE.Vector3(0, 3500, 3950);
  } else if (cameraMode === "top") {
    desiredPosition = creatureFocus.clone().add(new THREE.Vector3(12, 2250, 18));
  } else if (cameraMode === "inspect") {
    // Show the face and silhouette of freely-previewed forms at a useful
    // scale. Orbiting remains available and switches back to free viewing.
    const height = creatureMesh?.userData.artHeight || 110;
    target = toScenePosition(c, height * 0.58 + (c.altitude || 0));
    const range = Math.max(380, height * 3.5);
    desiredPosition = target.clone().add(forward.multiplyScalar(range)).add(side.multiplyScalar(range * 0.44)).add(new THREE.Vector3(0, height * 0.72, 0));
  } else if (cameraMode === "side") {
    desiredPosition = creatureFocus.clone().add(side.multiplyScalar(bipedCamera ? 455 : 1180)).add(new THREE.Vector3(0, bipedCamera ? 185 : 390, 0));
  } else if (cameraMode === "combat" && world.duel.active) {
    const rival = world.duel.rival;
    target = toScenePosition({ x: (c.x + rival.x) * 0.5, y: (c.y + rival.y) * 0.5 }, 90 + ((c.altitude || 0) + (rival.altitude || 0)) * 0.5);
    const rivalPoint = toScenePosition(rival, 48 + (rival.altitude || 0));
    const battleAxis = rivalPoint.clone().sub(creatureFocus); battleAxis.y = 0;
    if (battleAxis.lengthSq() < 1) battleAxis.set(1, 0, 0); else battleAxis.normalize();
    const battleSide = new THREE.Vector3(-battleAxis.z, 0, battleAxis.x);
    const separation = distance3D(c, rival);
    desiredPosition = target.clone().add(battleSide.multiplyScalar(THREE.MathUtils.clamp(920 + separation * 0.55, 1100, 2700))).add(new THREE.Vector3(0, THREE.MathUtils.clamp(520 + separation * 0.22, 620, 1250), 0));
  } else if (cameraMode === "video") {
    // Place the viewer just in front of the television glass and look outward
    // at the creature's face. This is the user's half of the video call.
    const screenEye = toScenePosition(INTERACTION_SCREEN_POINT, 126);
    screenEye.x += Math.cos(world.robot.angle) * 52;
    screenEye.z += Math.sin(world.robot.angle) * 52;
    desiredPosition = screenEye;
    target = creatureFocus.clone();
  } else if (cameraMode === "robot") {
    target = toScenePosition(world.robot, 120);
    desiredPosition = target.clone().add(new THREE.Vector3(-Math.cos(world.robot.angle) * 700, 380, -Math.sin(world.robot.angle) * 700));
  } else {
    desiredPosition = creatureFocus.clone().add(forward.multiplyScalar(bipedCamera ? -650 : -980)).add(new THREE.Vector3(0, bipedCamera ? 285 : 420, 0));
  }
  const blend = THREE.MathUtils.clamp(strength, 0, 1);
  controls.target.lerp(target, blend);
  camera.position.lerp(desiredPosition, blend);
}

function initThree() {
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x173d38); scene.fog = new THREE.FogExp2(0x173d38, 0.0002);
  camera = new THREE.PerspectiveCamera(48, 1, 1, 12500); camera.position.set(80, 1850, 2450);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderProfile = selectGraphicsProfile({ rendererName: readRendererName(renderer), devicePixelRatio: window.devicePixelRatio });
  renderer.setPixelRatio(renderProfile.pixelRatio); renderer.shadowMap.enabled = renderProfile.shadows !== false; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.domElement.dataset.testid = "arena-webgl"; arenaHost.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = true; controls.minDistance = 340; controls.maxDistance = 7600; controls.maxPolarAngle = Math.PI * 0.49; controls.minPolarAngle = Math.PI * 0.12;
  controls.addEventListener("start", () => setCameraMode("free"));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, renderProfile.id === "software" ? 20 : 64, renderProfile.id === "software" ? 12 : 40), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { topColor: { value: new THREE.Color(0x5c94a2) }, bottomColor: { value: new THREE.Color(0x132e31) } },
    vertexShader: "varying float vHeight; void main(){ vHeight=normalize(position).y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "uniform vec3 topColor; uniform vec3 bottomColor; varying float vHeight; void main(){ float h=smoothstep(-0.72,0.92,vHeight); gl_FragColor=vec4(mix(bottomColor,topColor,h),1.0); }",
  })); sky.name = "world-sky"; scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xe5fff6, 0x29423e, 2.6));
  scene.add(new THREE.AmbientLight(0xcff3e7, 0.75));
  const sun = new THREE.DirectionalLight(0xfff1d4, 2.8); sun.position.set(-1100, 2300, 950); sun.castShadow = renderProfile.shadows !== false; sun.shadow.mapSize.set(renderProfile.shadowSize, renderProfile.shadowSize); sun.shadow.camera.left = -2400; sun.shadow.camera.right = 2400; sun.shadow.camera.top = 1800; sun.shadow.camera.bottom = -1800; scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fcfff, 1.1); fill.position.set(850, 520, -700); scene.add(fill);
  floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), new THREE.MeshStandardMaterial({ color: 0x0c2424, map: createTerrainTexture(), roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  sceneryGroup = new THREE.Group(); scene.add(sceneryGroup);
  openSourceSceneryGroup = new THREE.Group(); scene.add(openSourceSceneryGroup);
  skillEffectsGroup = new THREE.Group(); scene.add(skillEffectsGroup);
  const grid = new THREE.GridHelper(WORLD_W, 48, 0x6ea093, 0x355c54); grid.scale.z = WORLD_H / WORLD_W; grid.position.y = 0.35; grid.material.transparent = true; grid.material.opacity = 0.09; scene.add(grid);
  const boundary = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(WORLD_W, 20, WORLD_H)), new THREE.LineBasicMaterial({ color: 0x5f9f91, transparent: true, opacity: 0.25 })); boundary.position.y = 10; scene.add(boundary);
  creatureMesh = createCreatureMesh(biology.element); ownerMesh = createOwnerMesh();
  interactionScreen = createInteractionScreen(document.querySelector("#interactionVideo"));
  scene.add(creatureMesh, ownerMesh, interactionScreen);
  rivalMesh = createRivalMesh(world.duel.rival.element); rivalMesh.visible = false; scene.add(rivalMesh);
  duelPlayerMarker = createDuelMarker("我方", 0x62f2c2); duelRivalMarker = createDuelMarker("对手", 0xff746e); scene.add(duelPlayerMarker, duelRivalMarker);
  scentLine = makeSignalLine(0x83f3c3); visionLine = makeSignalLine(0xffb15c); ownerLine = makeSignalLine(0x68b9ff);
  const resize = () => { const rect = arenaHost.getBoundingClientRect(), width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height)); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(arenaHost); resize(); bindArenaPointer(); setCameraMode("overview", true);
  const artBadge = document.querySelector("#worldArtStatus");
  if (artBadge) artBadge.textContent = `正在加载 CC0 开源场景 · ${renderProfile.label}`;
  populateOpenSourceWorld(openSourceSceneryGroup, { worldWidth: WORLD_W, worldHeight: WORLD_H, profile: renderProfile })
    .then((stats) => {
      if (artBadge) artBadge.textContent = `Quaternius + Kenney CC0 · ${stats.instances} 个场景实例 · ${renderProfile.label}`;
      addLog(`已加载 ${stats.models} 个开源模型模板、${stats.instances} 个场景实例；当前显卡使用${renderProfile.label}。`, "system");
    })
    .catch((error) => {
      console.error("CC0 world loading failed", error);
      if (artBadge) artBadge.textContent = "CC0 场景加载失败 · 已保留基础地形";
    });
}

function setLine(line, start, end, visible, opacity) {
  line.visible = visible; if (!visible) return;
  const positions = line.geometry.attributes.position; positions.setXYZ(0, start.x, start.y, start.z); positions.setXYZ(1, end.x, end.y, end.z); positions.needsUpdate = true;
  line.geometry.computeBoundingSphere(); line.computeLineDistances(); line.material.opacity = opacity;
}

function clearHeadGaze(mesh) {
  const rig = mesh?.userData?.headRig, gaze = mesh?.userData?.gazeOverlay;
  if (!rig || !gaze) return;
  rig.rotation.y -= gaze.appliedYaw || 0;
  rig.rotation.z -= gaze.appliedPitch || 0;
  gaze.appliedYaw = 0; gaze.appliedPitch = 0;
}

function renderHeadGaze(mesh, entity, delta = 1 / 60) {
  const rig = mesh?.userData?.headRig; if (!rig) return;
  const bodyType = mesh.userData.bodyType;
  const yawLimit = bodyType === "cat" ? 1.02 : bodyType === "corgi" ? 0.9 : bodyType === "biped" ? 0.82 : 0.72;
  const desiredYaw = -THREE.MathUtils.clamp(angleDelta(entity.lookAngle ?? entity.angle, entity.angle), -yawLimit, yawLimit);
  const desiredPitch = THREE.MathUtils.clamp(entity.lookPitch || 0, -0.42, 0.48);
  const gaze = mesh.userData.gazeOverlay ||= { yaw: 0, pitch: 0, appliedYaw: 0, appliedPitch: 0 };
  const response = 1 - Math.exp(-Math.min(delta, 0.05) * (entity.gazeUrgent ? 15 : 8.5));
  gaze.yaw = THREE.MathUtils.lerp(gaze.yaw, desiredYaw, response);
  gaze.pitch = THREE.MathUtils.lerp(gaze.pitch, desiredPitch, response);
  rig.rotation.y += gaze.yaw; rig.rotation.z += gaze.pitch;
  gaze.appliedYaw = gaze.yaw; gaze.appliedPitch = gaze.pitch;
  if (mesh === creatureMesh) {
    const selector = document.querySelector("#playerBodyType");
    if (selector) {
      selector.dataset.headYaw = gaze.yaw.toFixed(3);
      selector.dataset.headPitch = gaze.pitch.toFixed(3);
    }
  }
}

function renderSocialReaction(mesh, entity) {
  if (!world.interaction.reaction || elapsed >= world.interaction.reactionUntil || world.duel.active) return;
  const id = world.interaction.reaction;
  const duration = Math.max(0.01, world.interaction.reactionUntil - world.interaction.reactionStartedAt);
  const progress = THREE.MathUtils.clamp((elapsed - world.interaction.reactionStartedAt) / duration, 0, 1);
  const envelope = Math.sin(Math.PI * progress);
  const beat = Math.sin(progress * Math.PI * (id === "greeting" ? 8 : 5));
  const forwardX = Math.cos(entity.angle), forwardZ = Math.sin(entity.angle);
  if (["happy", "affection", "greeting"].includes(id)) {
    mesh.rotation.x += beat * envelope * (id === "greeting" ? 0.22 : 0.12);
    mesh.position.y += Math.abs(beat) * envelope * 7;
  }
  if (id === "celebrate") {
    mesh.position.y += Math.abs(Math.sin(progress * Math.PI * 4)) * envelope * 34;
    mesh.rotation.z += Math.sin(progress * Math.PI * 4) * envelope * 0.18;
  } else if (id === "proud") {
    mesh.scale.set(1.06, 1.13, 1.06);
    mesh.rotation.z -= Math.sin(progress * Math.PI * 3) * envelope * 0.08;
  } else if (id === "curious") {
    mesh.rotation.z += 0.24 * envelope;
    mesh.rotation.x += Math.sin(progress * Math.PI * 2) * 0.08;
  } else if (id === "settle") {
    mesh.position.y -= envelope * 10;
    mesh.scale.set(1.04, 0.91 + (1 - envelope) * 0.09, 1.04);
  } else if (id === "seekFood") {
    mesh.rotation.z += Math.sin(progress * Math.PI * 5) * envelope * 0.13;
    mesh.position.y += Math.abs(beat) * envelope * 4;
  } else if (id === "startled" || id === "surprise") {
    mesh.position.x -= forwardX * envelope * 28;
    mesh.position.z -= forwardZ * envelope * 28;
    mesh.position.y += (id === "surprise" ? 26 : 10) * envelope;
    mesh.scale.set(1.08, 0.9 + envelope * 0.12, 1.08);
  } else if (id === "rub") {
    mesh.rotation.z += beat * envelope * 0.16;
    mesh.position.y += Math.abs(beat) * envelope * 3;
  }
  if (["greeting", "celebrate", "affection"].includes(id)) {
    (mesh.userData.wings || []).forEach((wing, index) => { wing.rotation.x += (index ? -1 : 1) * beat * envelope * 0.55; });
    (mesh.userData.arms || []).forEach((arm, index) => {
      const part = arm.group || arm;
      if (part?.rotation) part.rotation.z += (index ? -1 : 1) * (0.38 + beat * 0.38) * envelope;
    });
  }
}

function renderThree(delta = 1 / 60) {
  const c = world.creature;
  creatureMesh.position.copy(toScenePosition(c, 1.5 + c.altitude + Math.sin(elapsed * (c.flying ? 11 : 5)) * 1.1)); creatureMesh.rotation.y = -c.angle; creatureMesh.rotation.x = 0;
  creatureMesh.rotation.z = THREE.MathUtils.clamp(c.verticalSpeed / 320, -0.28, 0.28);
  if (!world.duel.active) creatureMesh.scale.setScalar(1);
  clearHeadGaze(creatureMesh);
  if (creatureMesh.userData.assetAnimator) {
    creatureMesh.userData.assetAnimator.update(delta, c, { attacking: elapsed < world.duel.playerAttackUntil ? SKILLS[world.duel.playerActiveSkillId] || true : false, hit: elapsed < world.duel.playerHitUntil, knockedDown: world.duel.playerKnockedDown, reaction: elapsed < world.interaction.reactionUntil ? world.interaction.reaction : null, eating: c.forageState === "eating" });
  } else if (creatureMesh.userData.bodyType === "biped") {
    if (creatureMesh.userData.robotAnimator) creatureMesh.userData.robotAnimator.update(delta, c);
    else animateBiped(creatureMesh, c, delta);
  }
  else if (creatureMesh.userData.bodyType === "corgi") animateCorgi(creatureMesh, c, delta);
  else if (creatureMesh.userData.bodyType === "cat") animateCat(creatureMesh, c, delta);
  else {
    const flapRate = c.flying ? 42 : 19, flapSize = c.flying ? 0.34 : 0.16;
    const flap = 0.18 + Math.sin(elapsed * flapRate) * flapSize; wingLeft.rotation.x = flap; wingRight.rotation.x = -flap;
    const strideRate = 5.5 + Math.min(13, c.speed * 0.055);
    creatureLegs.forEach((leg) => {
      const alternating = leg.phase ? Math.PI : 0;
      leg.group.rotation.z = c.flying ? (leg.phase ? -0.72 : 0.72) : Math.sin(elapsed * strideRate + alternating) * 0.48;
      leg.group.rotation.y = c.flying ? leg.side * 0.32 : Math.sin(elapsed * strideRate + alternating) * 0.08;
    });
  }
  renderHeadGaze(creatureMesh, c, delta);
  renderSocialReaction(creatureMesh, c);
  const socialReaction = !world.duel.active && elapsed < world.interaction.reactionUntil ? world.interaction.reaction : null;
  const socialProgress = socialReaction ? (elapsed - world.interaction.reactionStartedAt) / Math.max(0.01, world.interaction.reactionUntil - world.interaction.reactionStartedAt) : 0;
  applySocialExpression(creatureMesh, { reaction: socialReaction, progress: socialProgress, elapsed, delta });
  if (rivalMesh?.visible) {
    const rival = world.duel.rival;
    rivalMesh.position.copy(toScenePosition(rival, 1.5 + rival.altitude + Math.sin(elapsed * 5.3) * 1.1)); rivalMesh.rotation.y = -rival.angle; rivalMesh.rotation.x = 0;
    clearHeadGaze(rivalMesh);
    if (rivalMesh.userData.assetAnimator) rivalMesh.userData.assetAnimator.update(delta, rival, { attacking: elapsed < world.duel.rivalAttackUntil ? SKILLS[world.duel.rivalActiveSkillId] || true : false, hit: elapsed < world.duel.rivalHitUntil, knockedDown: world.duel.rivalKnockedDown });
    else if (rivalMesh.userData.bodyType === "biped") animateBiped(rivalMesh, rival, delta, "rival");
    else if (rivalMesh.userData.bodyType === "corgi") animateCorgi(rivalMesh, rival, delta, "rival");
    else if (rivalMesh.userData.bodyType === "cat") animateCat(rivalMesh, rival, delta, "rival");
    else {
      rivalMesh.userData.legs.forEach((leg) => {
        const phase = leg.phase ? Math.PI : 0;
        leg.group.rotation.z = rival.altitude > 5 ? (leg.phase ? -0.72 : 0.72) : Math.sin(elapsed * (7 + rival.speed * 0.04) + phase) * 0.45;
      });
      const rivalFlap = 0.18 + Math.sin(elapsed * (rival.altitude > 5 ? 40 : 18)) * (rival.altitude > 5 ? 0.34 : 0.14);
      rivalMesh.userData.wings[0].rotation.x = rivalFlap; rivalMesh.userData.wings[1].rotation.x = -rivalFlap;
    }
    renderHeadGaze(rivalMesh, rival, delta);
  }
  if (duelPlayerMarker?.visible) {
    const duel = world.duel, rival = duel.rival;
    duelPlayerMarker.position.copy(toScenePosition(c, c.altitude || 0)); duelRivalMarker.position.copy(toScenePosition(rival, rival.altitude || 0));
    [[duelPlayerMarker, duel.playerHealth / duel.playerMaxHealth, creatureMesh], [duelRivalMarker, rival.health / rival.maxHealth, rivalMesh]].forEach(([marker, rawRatio, fighterMesh]) => {
      const ratio = THREE.MathUtils.clamp(rawRatio, 0.01, 1), hud = marker.userData.hud;
      const bar = hud.children.find((child) => child.userData.duelHealthBar);
      hud.position.y = duelHudHeight(fighterMesh);
      bar.scale.x = 70 * ratio; bar.position.x = -(1 - ratio) * 35;
      marker.children[0].rotation.z = elapsed * 0.35;
    });
    if (duel.active) { renderCombatBody(creatureMesh, c, "player"); renderCombatBody(rivalMesh, rival, "rival"); }
    else { creatureMesh.scale.setScalar(1); rivalMesh.scale.setScalar(1); setHitFlash(creatureMesh, false); setHitFlash(rivalMesh, false); }
  }
  keepCreatureAboveGround(creatureMesh, c);
  if (rivalMesh?.visible) keepCreatureAboveGround(rivalMesh, world.duel.rival);
  world.enemies.forEach((enemy, index) => {
    const mesh = enemyMeshes.get(enemy.id); if (!mesh) return;
    mesh.position.copy(toScenePosition(enemy, 22 + Math.sin(elapsed * 4 + index) * 4)); mesh.rotation.y += 0.018 + enemy.strength * 0.015;
    const baseScale = (0.86 + enemy.strength * 1.02) * (enemy.state === "rest" ? 0.82 : 1);
    mesh.scale.setScalar(baseScale * (1 + Math.sin(elapsed * 5 + index) * 0.045));
    mesh.traverse((child) => { if (child.userData.healthBar) { const ratio = Math.max(0.02, enemy.health / enemy.maxHealth); child.scale.x = ratio; child.position.x = -(1 - ratio) * 16; } });
  });
  ownerMesh.visible = false;
  if (interactionScreen) {
    interactionScreen.position.copy(toScenePosition(world.robot)); interactionScreen.rotation.y = Math.PI / 2 - world.robot.angle;
    interactionScreen.userData.updateRobot({ time: elapsed, speed: world.robot.speed, social: elapsed < world.interaction.reactionUntil });
    const standby = interactionScreen.children.find((child) => child.userData.standby);
    if (standby) standby.visible = !cameraInteraction?.running;
    const glow = interactionScreen.children.find((child) => child.userData.glow);
    if (glow) glow.intensity = cameraInteraction?.running ? 2.2 + Math.sin(elapsed * 2.4) * 0.22 : 0.55;
  }
  world.foods.forEach((food) => { food.pulse += 0.025; if (food.mesh) { food.mesh.position.y = Math.sin(food.pulse) * 2; food.mesh.rotation.y += 0.007; } });
  const nearest = closestFood(), creaturePoint = toScenePosition(c, 29 + c.altitude);
  const scentRange = biology ? foodScentRange({ smell: biology.modifiers().smell, hunger: c.hunger }) : 360;
  if (nearest && nearest.distance <= scentRange) setLine(scentLine, creaturePoint, toScenePosition(nearest.food, 17), true, 0.16 + Math.max(0, 1 - nearest.distance / scentRange) * 0.52); else scentLine.visible = false;
  const td = distance(c, world.threat); setLine(visionLine, creaturePoint, toScenePosition(world.threat, 22), td < 260 && world.threat.state === "patrol" && !world.threat.defeated, 0.18 + (1 - td / 260) * 0.62);
  const called = elapsed < world.owner.callUntil;
  setLine(ownerLine, creaturePoint, toScenePosition(activeOwnerTarget(), 72), called, 0.28 + lastDecision.ownerAttraction * 0.62);
  activeSkillEffects = activeSkillEffects.filter((effect) => {
    if (elapsed < effect.born) { effect.mesh.visible = false; return true; }
    effect.mesh.visible = true;
    const duration = Math.max(0.01, effect.expires - effect.born);
    const progress = THREE.MathUtils.clamp((elapsed - effect.born) / duration, 0, 1);
    const life = 1 - progress;
    const effectActor = effect.actor || world.creature;
    const actorPoint = anatomicalSkillOrigin(effectActor, effect.source || "body", effect.id || "");
    const effectTarget = effect.target || world.threat;
    const targetPoint = skillTargetPoint(effectTarget);
    if (effect.mover) {
      effect.mover.position.lerpVectors(effect.start, targetPoint, Math.min(1, progress * 1.25));
      if (effect.id === "throwingDart") { effect.mover.rotation.x += 0.42; effect.mover.rotation.z += 0.28; }
    }
    if (effect.dynamicLine) {
      const positions = effect.dynamicLine.geometry.attributes.position;
      const traveling = ["projectile", "mark"].includes(effect.type);
      const lineStart = traveling ? effect.start : actorPoint;
      const lineEnd = traveling ? effect.mover.position : targetPoint;
      positions.setXYZ(0, lineStart.x, lineStart.y, lineStart.z); positions.setXYZ(1, lineEnd.x, lineEnd.y, lineEnd.z); positions.needsUpdate = true;
    }
    if (effect.type === "cone" && effect.continuousRays) {
      const liveStart = actorPoint;
      effect.continuousRays.forEach((ray) => updateBeamSegment(ray.mesh, liveStart, targetPoint.clone().add(ray.offset)));
    }
    if (effect.type === "area") { effect.mesh.position.copy(actorPoint); effect.mesh.rotation.y += 0.025; }
    if (effect.type === "buff") effect.mesh.position.copy(actorPoint);
    if (effect.type === "scentAura") { effect.mesh.position.copy(actorPoint); effect.mesh.rotation.y += 0.035; }
    if (["area", "buff"].includes(effect.type)) effect.mesh.scale.setScalar(0.72 + progress * 0.72);
    effect.mesh.traverse((child) => { if (child.material) child.material.opacity = Math.max(0, Math.sin(Math.PI * Math.min(progress, 0.98)) * 0.72 + life * 0.12); });
    effect.decorate?.(progress, delta);
    if (elapsed < effect.expires) return true;
    disposeSkillEffect(effect);
    return false;
  });
  const bipedTracking = isGroundBodyType(creatureMesh?.userData?.bodyType) && ["side", "follow"].includes(cameraMode);
  // A per-render blend lagged by hundreds of units on a slower GPU: physics
  // kept moving while the close-up camera advanced only 7.5% each frame.
  const cameraResponse = cameraMode === "inspect" ? 0.45 : cameraMode === "video" ? 0.2 : bipedTracking ? 0.34 : cameraMode === "combat" ? 0.055 : 0.075;
  const cameraBlend = 1 - Math.pow(1 - cameraResponse, THREE.MathUtils.clamp(delta, 0.001, 0.1) * 60);
  updateCameraView(cameraBlend);
  controls.update(); renderer.render(scene, camera);
}

function bindArenaPointer() {
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(); let pointerDown = null;
  renderer.domElement.addEventListener("pointerdown", (event) => { pointerDown = { x: event.clientX, y: event.clientY }; });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (event.button !== 0 || !pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObject(floor, false)[0]; if (!hit) return;
    addFood("sweet", { x: THREE.MathUtils.clamp(hit.point.x + WORLD_W / 2, 28, WORLD_W - 28), y: THREE.MathUtils.clamp(hit.point.z + WORLD_H / 2, 28, WORLD_H - 28) });
    addLog("在三维地面放置了一颗甜果。", "stimulus");
  });
}

function buildBrainLayout() {
  const groups = ["vision", "smell", "sweet", "bitter", "relay", "motor"], buckets = new Map(groups.map((group) => [group, []]));
  data.nodes.forEach((node) => buckets.get(node.group)?.push(node)); layout = new Map();
  groups.forEach((group, column) => {
    const nodes = buckets.get(group); nodes.sort((a, b) => a.id.localeCompare(b.id));
    nodes.forEach((node, row) => layout.set(node.id, { x: 74 + column * ((brainCanvas.width - 148) / (groups.length - 1)), y: 47 + (row + .5) * ((brainCanvas.height - 82) / Math.max(1, nodes.length)) }));
  });
}

function drawBrain() {
  bctx.fillStyle = "#081516"; bctx.fillRect(0, 0, brainCanvas.width, brainCanvas.height);
  [...data.edges].sort((a, b) => b.weight - a.weight).slice(0, 220).forEach((edge) => {
    const a = layout.get(edge.source), b = layout.get(edge.target); if (!a || !b) return;
    const alpha = .025 + Math.min(.12, Math.log10(edge.weight + 1) * .025); bctx.strokeStyle = edge.sign < 0 ? `rgba(185,147,255,${alpha})` : `rgba(102,176,157,${alpha})`; bctx.lineWidth = edge.weight > 500 ? 1.15 : .65;
    bctx.beginPath(); bctx.moveTo(a.x, a.y); bctx.bezierCurveTo((a.x + b.x) / 2, a.y, (a.x + b.x) / 2, b.y, b.x, b.y); bctx.stroke();
  });
  data.nodes.forEach((node, index) => {
    const p = layout.get(node.id); if (!p) return; const activity = brain.activity[index];
    if (activity > .08) { bctx.fillStyle = `rgba(215,248,121,${activity * .22})`; bctx.beginPath(); bctx.arc(p.x, p.y, 5 + activity * 10, 0, Math.PI * 2); bctx.fill(); }
    bctx.fillStyle = activity > .12 ? "#d7f879" : colors[node.group]; bctx.globalAlpha = .4 + activity * .6; bctx.beginPath(); bctx.arc(p.x, p.y, 2.3 + activity * 3.2, 0, Math.PI * 2); bctx.fill(); bctx.globalAlpha = 1;
    if (activity > .24 || ["LC4", "LPLC2", "GNG087", "DNp01", "MN9"].includes(node.type)) { bctx.fillStyle = activity > .2 ? "#edf8f2" : "#67827d"; bctx.font = "9px 'DM Mono', monospace"; bctx.fillText(node.id, p.x + 6, p.y + 3); }
  });
  [["逼近视觉", "#ffb15c"], ["食物气味", "#83f3c3"], ["甜味输入", "#d7f879"], ["苦味输入", "#b993ff"], ["中继神经", "#6d9b95"], ["动作输出", "#ff7777"]].forEach(([label, color], i) => { bctx.fillStyle = color; bctx.font = "500 10px 'Microsoft YaHei UI', sans-serif"; bctx.textAlign = "center"; bctx.fillText(label, 74 + i * ((brainCanvas.width - 148) / 5), 20); }); bctx.textAlign = "left";
}

function stimulate(kind) {
  const map = { sweet: { sweet: 1 }, bitter: { sweet: 1, bitter: 1 }, "loom-left": { loomLeft: 1 }, "loom-right": { loomRight: 1 } };
  manualStimulus = map[kind]; manualUntil = elapsed + 1.4;
  const labels = { sweet: "甜味 GRN", bitter: "甜味 + 苦味 GRN", "loom-left": "左侧 LC4/LPLC2", "loom-right": "右侧 LC4/LPLC2" };
  addLog(`实验员施加 ${labels[kind]} 刺激。`, "stimulus");
}

function applyAblations() {
  const escape = document.querySelector("#escapeAblation").checked, feed = document.querySelector("#feedAblation").checked;
  brain.setSilenced("DNp01", escape); brain.setSilenced("MN9", feed);
  if (escape || feed) addLog(`神经干预：${escape ? "DNp01 " : ""}${feed ? "MN9" : ""}已沉默。`, "ablation");
}

function setupCameraInteraction() {
  const video = document.querySelector("#interactionVideo");
  const canvas = document.querySelector("#interactionOverlay");
  const status = document.querySelector("#cameraInteractionStatus");
  const statusRow = status.closest(".camera-status-row");
  const placeholder = document.querySelector("#cameraPlaceholder");
  const reactionCard = document.querySelector("#cameraReaction");
  const toggle = document.querySelector("#toggleCamera");
  const commandLabels = { come: "来到机器人正面", walk: "散步", eat: "寻找甜果", stay: "停下等待", perform: "转圈表演", praise: "接受表扬" };
  const setStatus = (message, active = cameraInteraction?.running) => {
    status.textContent = message;
    statusRow.classList.toggle("active", Boolean(active));
  };
  const issueSocialCommand = (command, { fromCamera = true } = {}) => {
    if (world.duel.active) { collectionView?.notice("请先停止对战，再和伙伴互动。", true); return; }
    const c = world.creature;
    if (command === "come") {
      syncRobotPosition();
      if (world.robot.receptionBlocked) {
        world.interaction.pendingReaction = null;
        collectionView?.notice("机器人周围没有可站立的接待位置，请先移动到空旷处。", true);
        return;
      }
    }
    world.interaction.active = true;
    world.interaction.command = command;
    world.interaction.commandUntil = elapsed + 10;
    if (command === "come") {
      const callUntil = elapsed + socialCallDuration({ distance: distance(c, INTERACTION_RECEPTION_POINT), altitude: c.altitude || 0 });
      world.interaction.callUntil = callUntil;
      world.owner.callUntil = callUntil;
      world.interaction.commandUntil = callUntil;
    } else if (command === "walk") {
      world.interaction.callUntil = 0; world.owner.callUntil = 0;
      const heading = c.angle + (Math.random() - 0.5) * 1.25;
      const range = c.flying ? 620 : 420;
      world.interaction.walkTarget = {
        x: THREE.MathUtils.clamp(c.x + Math.cos(heading) * range, 120, WORLD_W - 120),
        y: THREE.MathUtils.clamp(c.y + Math.sin(heading) * range, 120, WORLD_H - 120),
      };
    } else if (command === "eat") {
      world.interaction.callUntil = 0; world.owner.callUntil = 0; world.interaction.commandUntil = 0;
      // Put a demonstrable sweet reward inside the current scent range. The
      // ensuing approach/taste/eat path still goes through the normal odor,
      // taste and MN9 feeding loop instead of teleporting food into the body.
      addFood("sweet", {
        x: THREE.MathUtils.clamp(c.x + Math.cos(c.angle) * 260, 60, WORLD_W - 60),
        y: THREE.MathUtils.clamp(c.y + Math.sin(c.angle) * 260, 60, WORLD_H - 60),
      });
      const target = world.foods[world.foods.length - 1];
      biology.hunger = Math.max(biology.hunger, 0.78); c.hunger = biology.hunger;
      c.forageTarget = target; c.forageLockUntil = elapsed + 15; c.foraging = { stage: "tracking", cooldownUntil: 0, sniffUntil: 0 };
    } else if (command === "stay") {
      world.interaction.callUntil = 0; world.owner.callUntil = 0; world.interaction.walkTarget = null;
      c.speed = Math.min(c.speed || 0, 60);
    } else {
      world.interaction.callUntil = Math.max(world.interaction.callUntil, elapsed + 6);
      world.owner.callUntil = Math.max(world.owner.callUntil, elapsed + 6);
      world.interaction.commandUntil = elapsed + 3;
    }
    addLog(`${fromCamera ? "视频动作" : "互动面板"}发出“${commandLabels[command] || command}”指令。`, "stimulus");
  };
  const showReaction = (reaction) => {
    if (!reaction) return;
    if (world.duel.active) { collectionView?.notice("请先停止对战，再和伙伴互动。", true); return; }
    world.interaction.pendingReaction = null;
    if ((["roll", "settle"].includes(reaction.id) && world.creature.altitude > 2) || (reaction.id === "rub" && (world.creature.altitude > 2 || distance(world.creature, INTERACTION_RECEPTION_POINT) >= 75))) {
      world.interaction.pendingReaction = reaction;
      world.creature.flightCommand = "land";
      issueSocialCommand(reaction.id === "rub" ? "come" : "stay", { fromCamera: reaction.source !== "manual" });
      reactionCard.innerHTML = `<b>${reaction.emoji}</b><div><strong>${reaction.label}</strong><span>${reaction.id === "rub" ? "先来到机器人正面，再撒娇蹭蹭" : "先落地，再做这个动作"}</span></div>`;
      return;
    }
    world.interaction.reaction = reaction.id;
    world.interaction.reactionStartedAt = elapsed;
    world.interaction.reactionUntil = elapsed + (reaction.duration || (reaction.id === "celebrate" ? 2.8 : 2.25));
    world.interaction.callUntil = Math.max(world.interaction.callUntil, elapsed + 4.5);
    world.owner.callUntil = Math.max(world.owner.callUntil, elapsed + 4.5);
    world.creature.socialReaction = reaction.id;
    reactionCard.innerHTML = `<b>${reaction.emoji}</b><div><strong>${reaction.label}</strong><span>${reaction.response}</span></div>`;
    reactionCard.classList.remove("pulse");
    requestAnimationFrame(() => reactionCard.classList.add("pulse"));
    if (reaction.positive && elapsed - world.interaction.lastAffinityAt > 9) {
      memory.affinity = THREE.MathUtils.clamp(memory.affinity + 0.012, 0, 1);
      memory.fear = THREE.MathUtils.clamp(memory.fear - 0.008, 0, 1);
      world.interaction.lastAffinityAt = elapsed;
      saveMemory();
    }
    if (reaction.command) issueSocialCommand(["roll", "rub"].includes(reaction.id) ? "stay" : reaction.command, { fromCamera: reaction.source !== "manual" });
    addLog(`视频互动识别到“${reaction.label}”；社交扩展层选择回应：${reaction.response}。`, "stimulus");
  };
  showCollectionReaction = showReaction;
  cameraInteraction = new CameraInteraction({
    video, canvas, onStatus: (message) => setStatus(message), onReaction: showReaction,
    onFrame: ({ faceDetected, gesture, gestureScore }) => {
      if (gesture !== "None" && gestureScore > 0.55) setStatus(`已看到你 · 手势置信度 ${Math.round(gestureScore * 100)}%`, true);
      else if (faceDetected) setStatus("已看到你的脸，正在观察表情", true);
      else setStatus("摄像头运行中 · 请靠近画面中央", true);
    },
  });
  toggle.addEventListener("click", async () => {
    if (cameraInteraction.running) {
      cameraInteraction.stop();
      toggle.textContent = "开启摄像头";
      placeholder.classList.remove("hidden");
      statusRow.classList.remove("active");
      world.interaction.active = false;
      return;
    }
    toggle.disabled = true;
    try {
      await cameraInteraction.start();
      toggle.textContent = "关闭摄像头";
      placeholder.classList.add("hidden");
      statusRow.classList.add("active");
      world.interaction.active = true;
      addLog("摄像头已开启：手势和表情在本机由 MediaPipe 处理，视频不会保存到游戏。", "system");
    } catch (error) {
      console.error("Camera interaction failed", error);
      setStatus(error.name === "NotAllowedError" ? "没有获得摄像头权限，可以再次点击重试" : `摄像头启动失败：${error.message}`, false);
      toggle.textContent = "重新尝试开启";
      placeholder.classList.remove("hidden");
    } finally {
      toggle.disabled = false;
    }
  });
  document.querySelector("#callToScreen").addEventListener("click", () => {
    issueSocialCommand("come", { fromCamera: false });
    setCameraMode("follow");
    addLog("你从主人机器人发出呼唤；精灵会中断普通觅食，来到机器人正面停下并看向你。", "stimulus");
  });
  document.querySelector("#videoCallView").addEventListener("click", () => {
    issueSocialCommand("come", { fromCamera: false });
    setCameraMode("video", true);
    document.querySelector("#arena3d")?.scrollIntoView({ behavior: "smooth", block: "center" });
    addLog("切换到电视第一视角：镜头位于屏幕正面，近距离观察精灵的表情和动作。", "system");
  });
  const manualReactions = {
    come: { id: "greeting", command: "come", label: "你呼唤它过来", response: "它来到电视正面向你招手", emoji: "👋", positive: true },
    walk: { id: "curious", command: "walk", label: "你让它去散步", response: "它确认方向后走一小段", emoji: "☝️", positive: false },
    eat: { id: "seekFood", command: "eat", label: "你让它去吃东西", response: "它开始循气味寻找甜果", emoji: "🍯", positive: false },
    stay: { id: "settle", command: "stay", label: "你让它停下", response: "它刹住脚步乖乖等待", emoji: "✊", positive: false },
    perform: { id: "celebrate", command: "perform", label: "你让它表演", response: "它蹦跳并转圈庆祝", emoji: "✌️", positive: true },
    praise: { id: "proud", command: "praise", label: "你表扬了它", response: "它挺胸点头，非常得意", emoji: "👍", positive: true },
  };
  document.querySelectorAll("[data-social-command]").forEach((button) => button.addEventListener("click", () => showReaction(manualReactions[button.dataset.socialCommand])));
  document.querySelectorAll("[data-social-action]").forEach((button) => button.addEventListener("click", () => showReaction(selectManualReaction(button.dataset.socialAction))));
  document.querySelector("#robotCallCompanion").addEventListener("click", () => issueSocialCommand("come", { fromCamera: false }));
  window.addEventListener("beforeunload", () => cameraInteraction?.stop(), { once: true });
}

function syncRobotPosition() {
  const robot = world.robot;
  Object.assign(INTERACTION_SCREEN_POINT, { x: robot.x, y: robot.y });
  const isRubbing = world.interaction.pendingReaction?.id === "rub" || world.interaction.reaction === "rub" && elapsed < world.interaction.reactionUntil;
  const reception = planRobotReception(robot, { distance: isRubbing ? robot.radius + world.creature.radius + 45 : 285, bounds: GROUND_BOUNDS, guestRadius: world.creature.radius, colliders: world.obstacles });
  robot.receptionBlocked = !reception;
  if (reception) {
    robot.angle = reception.angle;
    Object.assign(INTERACTION_RECEPTION_POINT, reception);
  } else if (elapsed < world.interaction.callUntil) {
    world.interaction.callUntil = 0; world.owner.callUntil = 0; world.interaction.commandUntil = 0; world.interaction.pendingReaction = null;
    collectionView?.notice("接待位置被挡住了，请将机器人移到空旷处后再呼唤。", true);
  }
  Object.assign(world.owner, { x: robot.x, y: robot.y });
  const collider = world.obstacles.find((entry) => entry.type === "interaction-screen");
  if (collider) Object.assign(collider, { x: robot.x, y: robot.y });
}

function updateOwnerRobot(dt) {
  const input = { x: 0, y: 0 };
  if (robotControlled) {
    const held = (direction, keys) => robotButtons.has(direction) || keys.some((key) => robotKeys.has(key));
    input.x = Number(held("right", ["d", "ArrowRight"])) - Number(held("left", ["a", "ArrowLeft"]));
    input.y = Number(held("backward", ["s", "ArrowDown"])) - Number(held("forward", ["w", "ArrowUp"]));
  }
  if (world.robot.homeTarget && !input.x && !input.y) {
    const delta = { x: ROBOT_START.x - world.robot.x, y: ROBOT_START.y - world.robot.y };
    if (Math.hypot(delta.x, delta.y) < 14) { world.robot.homeTarget = false; }
    else {
      const route = planGroundRoute(world.robot, Math.atan2(delta.y, delta.x), 330, world.obstacles.filter((entry) => entry.type !== "interaction-screen"), GROUND_BOUNDS, 1);
      input.x = Math.cos(route.angle); input.y = Math.sin(route.angle);
    }
  } else if (input.x || input.y) world.robot.homeTarget = false;
  const obstacles = [...world.obstacles];
  if (world.creature.altitude < 210) obstacles.push({ type: "companion", shape: "circle", x: world.creature.x, y: world.creature.y, radius: world.creature.radius, height: 240 });
  updateRobot(world.robot, input, dt, obstacles, GROUND_BOUNDS);
  syncRobotPosition();
}

function setupRobotControls() {
  const toggle = document.querySelector("#robotControlToggle");
  const status = document.querySelector("#robotControlStatus");
  toggle.addEventListener("change", () => {
    robotControlled = toggle.checked; robotKeys.clear(); robotButtons.clear();
    status.textContent = robotControlled ? "已接管 · W/A/S/D 或方向键移动，松开即停" : "未接管 · 伙伴保持自主行动";
  });
  const movementKeys = new Set(["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
  window.addEventListener("keydown", (event) => {
    const key = event.key.startsWith("Arrow") ? event.key : event.key.toLowerCase();
    if (!robotControlled || event.ctrlKey || event.metaKey || event.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable || !movementKeys.has(key)) return;
    robotKeys.add(key); event.preventDefault();
  });
  window.addEventListener("keyup", (event) => robotKeys.delete(event.key.startsWith("Arrow") ? event.key : event.key.toLowerCase()));
  window.addEventListener("blur", () => { robotKeys.clear(); robotButtons.clear(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { robotKeys.clear(); robotButtons.clear(); } });
  document.querySelectorAll("[data-robot-move]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      if (!robotControlled) { toggle.checked = true; toggle.dispatchEvent(new Event("change")); }
      button.setPointerCapture(event.pointerId); robotButtons.add(button.dataset.robotMove); event.preventDefault();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, () => robotButtons.delete(button.dataset.robotMove));
  });
  document.querySelector("#robotFollowCamera").addEventListener("click", () => setCameraMode("robot", true));
  document.querySelector("#robotHome").addEventListener("click", () => { robotKeys.clear(); robotButtons.clear(); world.robot.homeTarget = true; });
  window.addEventListener("keydown", (event) => { if (event.key === "Escape" && world.duel.active) stopDuel(); });
}

function bindControls() {
  setupRobotControls();
  document.querySelector("#stopDuel").addEventListener("click", stopDuel);
  document.querySelectorAll("[data-stimulus]").forEach((button) => button.addEventListener("click", () => stimulate(button.dataset.stimulus)));
  document.querySelector("#shuffleToggle").addEventListener("change", (event) => { brain = new ConnectomeBrain(data, { shuffle: event.target.checked, seed: 73021 }); applyAblations(); addLog(event.target.checked ? "已使用保留权重但打乱目标的对照网络。" : "已恢复真实 MaleCNS 连接。", "system"); });
  document.querySelector("#escapeAblation").addEventListener("change", applyAblations); document.querySelector("#feedAblation").addEventListener("change", applyAblations);
  document.querySelector("#addSugar").addEventListener("click", () => addFood("sweet")); document.querySelector("#addBitter").addEventListener("click", () => addFood("bitter"));
  document.querySelector("#resetWorld").addEventListener("click", resetWorld); ui.pause.addEventListener("click", () => { paused = !paused; ui.pause.textContent = paused ? "继续" : "暂停"; });
  document.querySelector("#callOwner").addEventListener("click", () => {
    world.owner.callUntil = elapsed + 6;
    world.interaction.callUntil = elapsed + 10;
    ui.learningExplanation.textContent = "主人呼唤提供身份线索；亲密度越高、恐惧越低，蓝色“主人 → 接近”通道越强。";
    addLog("主人发出呼唤，学习层开始计算亲近意愿。", "stimulus");
  });
  document.querySelector("#feedOwner").addEventListener("click", () => {
    const delta = memory.interact("feed"); world.creature.hunger = Math.max(0, world.creature.hunger - 0.14); world.owner.callUntil = elapsed + 5;
    describeLearning("feed", delta); saveMemory();
  });
  document.querySelector("#petOwner").addEventListener("click", () => { const delta = memory.interact("pet"); describeLearning("pet", delta); saveMemory(); });
  document.querySelector("#scareCreature").addEventListener("click", () => {
    const delta = memory.interact("scare"); manualStimulus = { loomLeft: 1, loomRight: 1 }; manualUntil = elapsed + 1.2;
    describeLearning("scare", delta); saveMemory();
  });
  document.querySelector("#trainAttack").addEventListener("click", () => {
    const delta = memory.interact("train");
    world.threat.state = "patrol"; world.threat.defeated = false; world.threat.stateUntil = elapsed + 12; world.threat.patrolTarget = { x: world.creature.x, y: world.creature.y };
    describeLearning("train", delta); saveMemory();
  });
  document.querySelector("#clearMemory").addEventListener("click", () => {
    memory.reset(); ui.personality.value = memory.personality; document.querySelector("#duelPlayerPersonality").value = memory.personality; saveMemory();
    ui.learningExplanation.textContent = "后天记忆已恢复初始值；真实 MaleCNS 连接和神经活动没有改变。";
    addLog("已清除亲密、恐惧和攻击技能记忆；原始连接组保持不变。", "system");
  });
  ui.personality.value = memory.personality;
  document.querySelector("#duelPlayerPersonality").value = memory.personality;
  ui.personality.addEventListener("change", (event) => {
    memory.setPersonality(event.target.value); saveMemory();
    document.querySelector("#duelPlayerPersonality").value = event.target.value;
    addLog(`性格切换为${event.target.selectedOptions[0].textContent}；攻击、谨慎和好奇权重已经改变。`, "system");
  });
  document.querySelector("#duelPlayerPersonality").addEventListener("change", (event) => {
    memory.setPersonality(event.target.value); ui.personality.value = event.target.value; saveMemory();
    addLog(`我方对战人格设为${event.target.selectedOptions[0].textContent}；下一场会重新计算进攻、闪避、试探、追击与撤退倾向。`, "system");
  });
  document.querySelector("#duelRivalPersonality").addEventListener("change", (event) => {
    addLog(`对手对战人格设为${event.target.selectedOptions[0].textContent}；它将使用独立于我方的风险偏好。`, "system");
  });
  const tacticalInputs = {
    enemyStrengthSelect: "enemyStrength", enemyHostilitySelect: "enemyHostility",
    attackRewardSelect: "reward", escapeRoomSelect: "escapeRoom",
  };
  Object.entries(tacticalInputs).forEach(([id, key]) => {
    document.querySelector(`#${id}`).addEventListener("change", (event) => {
      world.tactics[key] = Number(event.target.value);
      if (key === "enemyStrength") world.threat.strength = Number(event.target.value);
      if (key === "enemyHostility") world.threat.hostility = Number(event.target.value);
      addLog(`环境信息更新：${event.target.options[event.target.selectedIndex].textContent}，正在重新计算行动评分。`, "system");
    });
  });
  document.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => {
    world.tactics.ownerCommand = button.dataset.command;
    document.querySelectorAll("[data-command]").forEach((item) => item.classList.toggle("active", item === button));
    addLog(`收到主人指令“${button.textContent}”；指令会参与评分，但不会覆盖生存判断。`, "stimulus");
  }));
  document.querySelectorAll("[data-flight]").forEach((button) => button.addEventListener("click", () => {
    world.creature.flightCommand = button.dataset.flight;
    document.querySelectorAll("[data-flight]").forEach((item) => item.classList.toggle("active", item === button));
    const labels = { auto: "恢复自动飞行判断", takeoff: "收到立即起飞指令", land: "收到立即降落指令" };
    addLog(`${labels[button.dataset.flight]}；高度将真实影响速度和障碍碰撞。`, "stimulus");
  }));
  document.querySelectorAll("[data-scenario]").forEach((button) => button.addEventListener("click", () => applyScenario(button.dataset.scenario)));
  document.querySelector("#randomizeCreature").addEventListener("click", () => {
    biology.randomize(); saveBiology(); updateBiologyUI();
    addLog("生成了新的个体体质：耐力、代谢、力量、感官和速度均已重新组合。", "system");
  });
  document.querySelector("#healCreature").addEventListener("click", () => {
    biology.heal(0.22); biology.stamina = Math.min(1, biology.stamina + 0.3); biology.fatigue = Math.max(0, biology.fatigue - 0.25); saveBiology(); updateBiologyUI();
    addLog("休息治疗降低疼痛和伤势，并恢复体力。", "feed");
  });
  document.querySelector("#injureWing").addEventListener("click", () => {
    biology.takeDamage(0.08, { wing: 0.42 }); saveBiology(); updateBiologyUI();
    addLog("模拟翅膀受伤：飞行速度下降，严重时将无法起飞。", "bitter");
  });
  document.querySelector("#creatureElement").addEventListener("change", (event) => {
    biology.element = event.target.value; document.querySelector("#duelPlayerElement").value = event.target.value; refreshCreatureMesh(); saveBiology(); updateSkillUI(); updateDuelUI();
  });
  document.querySelector("#enemyElement").addEventListener("change", (event) => {
    world.threat.element = event.target.value; document.querySelector("#elementHint").textContent = "敌人属性已改变，下次技能将重新计算克制倍率。";
  });
  document.querySelector("#duelPlayerElement").addEventListener("change", (event) => {
    biology.element = event.target.value; document.querySelector("#creatureElement").value = event.target.value; refreshCreatureMesh(); saveBiology(); updateSkillUI(); updateDuelUI();
  });
  document.querySelector("#duelRivalElement").addEventListener("change", (event) => {
    world.duel.rival.element = event.target.value;
    const profile = profileFor(event.target.value); world.duel.rival.maxHealth = profile.health; world.duel.rival.health = profile.health; world.duel.rival.defense = profile.defense;
    refreshRivalMesh(); rivalMesh.visible = world.duel.result !== "idle"; updateDuelUI();
  });
  document.querySelector("#playerBodyType").value = playerBodyType;
  document.querySelector("#rivalBodyType").value = rivalBodyType;
  const worldBodyPreview = document.querySelector("#worldBodyPreview");
  worldBodyPreview.value = playerBodyType;
  document.querySelector("#playerWingStyle").disabled = isGroundBodyType(playerBodyType);
  document.querySelector("#rivalWingStyle").disabled = isGroundBodyType(rivalBodyType);
  document.querySelector("#playerBodyType").addEventListener("change", (event) => {
    playerBodyType = event.target.value;
    worldBodyPreview.value = playerBodyType;
    const ground = isGroundBodyType(playerBodyType);
    document.querySelector("#playerWingStyle").disabled = ground;
    world.creature.altitude = 0; world.creature.verticalSpeed = 0; world.creature.flying = false; world.creature.speed = 0;
    refreshCreatureMesh(); updateBiologyUI(); updateSkillUI(); updateDuelUI();
    addLog(playerBodyType === "corgi"
      ? "切换为短腿小柯基：没有可见膝关节，整条短腿和短手臂以玩偶式节奏交替摆动。"
      : playerBodyType === "cat"
        ? "切换为四足软萌小猫：四腿独立关节采用步行/小跑节律，头部可单独转向，脸纹、腹纹和条纹直接绘制在皮毛表面。"
        : ground ? "切换为瘦高关节迅影兽：恢复膝、肘分段关节以及跑跳格斗动作。" : "切换为飞行萤翼兽：恢复翅膀与三维飞行身体适配器。", "system");
  });
  worldBodyPreview.addEventListener("change", (event) => {
    const bodySelector = document.querySelector("#playerBodyType");
    bodySelector.value = event.target.value;
    bodySelector.dispatchEvent(new Event("change", { bubbles: true }));
    if (!world.duel.active) setCameraMode("follow");
  });
  document.querySelector("#focusCreaturePreview").addEventListener("click", () => {
    setCameraMode("follow");
    addLog("自由观察镜头已贴近当前精灵；无需开始对战也能旋转、缩放检查外形。", "system");
  });
  document.querySelector("#rivalBodyType").addEventListener("change", (event) => {
    rivalBodyType = event.target.value;
    const ground = isGroundBodyType(rivalBodyType);
    document.querySelector("#rivalWingStyle").disabled = ground;
    Object.assign(world.duel.rival, { altitude: ground ? 0 : 420, verticalSpeed: 0, speed: 0, groundAction: "run" });
    refreshRivalMesh(); rivalMesh.visible = world.duel.result !== "idle"; updateDuelUI();
    addLog(rivalBodyType === "corgi"
      ? "对手切换为短腿小柯基：使用整腿小碎步和短臂摆动。"
      : rivalBodyType === "cat"
        ? "对手切换为四足软萌小猫：使用四足小跑、独立转头、扑击和后足发力动作。"
        : ground ? "对手切换为瘦高关节迅影兽：恢复高速地面冲刺和分段关节动作。" : "对手切换为飞行萤翼兽：恢复三维飞行与空中技能。", "system");
  });
  document.querySelector("#playerWingStyle").value = playerWingStyle;
  document.querySelector("#rivalWingStyle").value = rivalWingStyle;
  document.querySelector("#playerWingStyle").addEventListener("change", (event) => {
    playerWingStyle = event.target.value; refreshCreatureMesh();
    addLog(`我方换成“${event.target.selectedOptions[0].textContent}”，飞行动画与技能动作保持不变。`, "system");
  });
  document.querySelector("#rivalWingStyle").addEventListener("change", (event) => {
    rivalWingStyle = event.target.value; refreshRivalMesh(); rivalMesh.visible = world.duel.result !== "idle";
    addLog(`对手换成“${event.target.selectedOptions[0].textContent}”。`, "system");
  });
  document.querySelector("#duelPursuit").addEventListener("change", (event) => {
    world.duel.pursuit = event.target.value; updateDuelUI();
    addLog(`追击策略切换为“${event.target.selectedOptions[0].textContent}”。`, "system");
  });
  document.querySelector("#startDuel").addEventListener("click", startDuel);
  document.querySelector("#combatCameraToggle").addEventListener("click", () => setCombatCameraMode(!autoCombatCamera));
  document.querySelectorAll("[data-camera]").forEach((button) => button.addEventListener("click", () => {
    setCameraMode(button.dataset.camera);
    addLog(`视角切换为“${button.textContent.replace(/^\d\s*/, "")}”。`, "system");
  }));
  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "")) return;
    const shortcuts = { "1": "overview", "2": "follow", "3": "side", "4": "top", "5": "combat", "6": "video" };
    const mode = shortcuts[event.key]; if (!mode) return;
    setCameraMode(mode); event.preventDefault();
  });
  setupCameraInteraction();
}

function frame(now) {
  // Fixed 30 Hz physics, with up to 250 ms catch-up. A slow GPU should not
  // make a 90-second match take six minutes; long stalls stay bounded.
  const delta = Math.max(0, Math.min(.25, (now - lastTime) / 1000)); lastTime = now;
  if (document.hidden) { accumulator = 0; requestAnimationFrame(frame); return; }
  if (!paused) { accumulator += delta; while (accumulator >= 1 / 30) { updateWorld(1 / 30); accumulator -= 1 / 30; } }
  renderThree(delta);
  if (document.querySelector(".shell").dataset.activeTab === "science") drawBrain();
  requestAnimationFrame(frame);
}

async function init() {
  collection = loadCollection();
  data = await fetch("/data/circuit.json").then((response) => response.json()); brain = new ConnectomeBrain(data, { seed: 73021 }); rivalBrain = new ConnectomeBrain(data, { seed: 98117 }); memory = loadMemory(); biology = loadBiology(); skillSystem = loadSkills(); rivalSkillSystem = new SkillSystem();
  playerBodyType = collection.species.bodyType; biology.element = collection.species.element;
  rivalBodyType = SPECIES_BY_ID[rivalSpeciesId].bodyType; world.duel.rival.element = SPECIES_BY_ID[rivalSpeciesId].element;
  const s = data.summary, p = data.provenance; ui.provenance.textContent = `${p.dataset} · ${s.biologicalNeuronsRepresented.toLocaleString()} 神经元 · ${s.biologicalSynapsesRepresented.toLocaleString()} 突触 · ${p.license}`;
  initThree(); buildBrainLayout(); buildSystemUI(); bindControls(); applyScenario("garden"); synchronizeSpeciesControls(); dressSpecies(creatureMesh, "player"); dressSpecies(rivalMesh, "rival"); setupCollection(); saveCollection(); updateHud(); updateDuelUI(); addLog(`${SPECIES.length}个精灵形态、独立培养与进化系统已加载。数字脑负责感知反应，收集进化属于游戏扩展层。`, "system"); requestAnimationFrame(frame);
  // Read-only diagnostics for repeatable visual/integration regression checks.
  window.spiritLabDiagnostics = () => {
    const describe = (mesh) => {
      let bones = 0, meshes = 0; mesh?.traverse((node) => { if (node.isBone) bones++; if (node.isMesh) meshes++; });
      return { animatedAsset: !!mesh?.userData.assetAnimator, assetName: mesh?.userData.assetName || "", bodyType: mesh?.userData.bodyType, silhouette: mesh?.userData.evolutionDetails?.userData.silhouette, maturity: mesh?.userData.evolutionProfile?.maturity, bones, meshes, dimensions: mesh ? new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).toArray() : [] };
    };
    return {
      collection: collection.snapshot(),
      developer: { enabled: developerMode, previewId: developerPreview.speciesId, speciesId: collection.species.id },
      robot: { ...world.robot, reception: { ...INTERACTION_RECEPTION_POINT }, controlled: robotControlled, cameraMode },
      social: { reaction: elapsed < world.interaction.reactionUntil ? world.interaction.reaction : null, pending: world.interaction.pendingReaction?.id || null, locked: !world.duel.active && ["roll", "settle", "rub"].includes(world.interaction.reaction) && elapsed < world.interaction.reactionUntil, pose: creatureMesh.userData.socialPose },
      brain: { realConnectome: !document.querySelector("#shuffleToggle").checked, nodeCount: data.nodes.length, separateRivalState: brain !== rivalBrain, simulatedPlasticity: false },
      camera: { position: camera.position.toArray(), target: controls.target.toArray(), aspect: camera.aspect, subject: new THREE.Box3().setFromObject(creatureMesh).getCenter(new THREE.Vector3()).project(camera).toArray(), origin: creatureMesh.position.toArray() },
      player: describe(creatureMesh), rival: describe(rivalMesh),
      battle: { elapsed, sinceStart: elapsed - (world.duel.startedAt || elapsed), active: world.duel.active, result: world.duel.result, playerHp: world.duel.playerHealth, rivalHp: world.duel.rival.health, playerProfile: fighterProfile("player"), rivalProfile: fighterProfile("rival"), speed: world.creature.actualSpeed, enemySpeed: world.duel.rival.actualSpeed, distance: distance3D(world.creature,world.duel.rival), pendingAttacks: world.duel.pendingAttacks.length, playerAltitude: world.creature.altitude, rivalAltitude: world.duel.rival.altitude, playerPosition: {x:world.creature.x,y:world.creature.y,angle:world.creature.angle}, rivalPosition: {x:world.duel.rival.x,y:world.duel.rival.y,angle:world.duel.rival.angle}, aiming: [world.duel.playerAimingSkillId,world.duel.rivalAimingSkillId], shots: [world.duel.playerCombatState?.shots,world.duel.rivalCombatState?.shots] },
      renderer: { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, calls: renderer.info.render.calls, activeEffects: activeSkillEffects.length, effects: activeSkillEffects.map(({ mesh, id, type }) => ({ id, type, visual: mesh.userData.skillVfx })) },
    };
  };
}

init().catch((error) => { console.error(error); ui.provenance.textContent = `加载失败：${error.message}`; });
