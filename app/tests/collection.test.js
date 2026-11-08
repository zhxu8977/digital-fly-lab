import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LEVEL, SPECIES, SPECIES_BY_ID, STARTER_IDS, SpiritCollection, TRAINING_CAP, experienceForLevel, xpToNextLevel } from "../src/collection.js";

test("the catalog has 36 complete original families with reachable evolution paths", () => {
  assert.equal(SPECIES.length, 108);
  const families = new Set(SPECIES.map((species) => species.familyId));
  assert.equal(families.size, 36);
  for (const family of families) {
    const forms = SPECIES.filter((species) => species.familyId === family);
    assert.deepEqual(forms.map((species) => species.stage), [0, 1, 2]);
    assert.equal(forms[0].nextEvolutionId, forms[1].id);
    assert.equal(forms[1].nextEvolutionId, forms[2].id);
    assert.equal(forms[2].nextEvolutionId, null);
    assert.ok(forms.every((species) => species.name && species.features.length >= 4 && /^#[\da-f]{6}$/i.test(species.colors.body)));
  }
});

test("cumulative experience advances monotonically and stops at the level cap", () => {
  const collection = new SpiritCollection();
  assert.equal(collection.active.level, 1);
  let previous = 0;
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    const threshold = experienceForLevel(level);
    assert.ok(threshold >= previous);
    assert.ok(level === MAX_LEVEL ? xpToNextLevel(level) === 0 : xpToNextLevel(level) > 0);
    collection.gainExperience(threshold - collection.active.xp);
    assert.equal(collection.active.level, level);
    previous = threshold;
  }
  collection.gainExperience(Infinity);
  collection.gainExperience(-400);
  collection.gainExperience(999999);
  assert.equal(collection.active.level, MAX_LEVEL);
  assert.equal(collection.active.xp, experienceForLevel(MAX_LEVEL));
});

test("evolution preserves the individual's independent state and cannot duplicate a family", () => {
  const collection = new SpiritCollection();
  const individual = collection.active;
  const id = individual.id;
  const count = collection.records.length;
  individual.biology = { hunger: 0.63 };
  individual.memory = { places: ["orchard"] };
  individual.skills = { cooldowns: { pulse: 0.4 } };
  collection.gainExperience(experienceForLevel(3));
  individual.bond = 35;
  assert.equal(collection.canEvolve().ready, true);
  assert.equal(collection.evolve().ok, true);
  assert.equal(collection.active.id, id);
  assert.equal(collection.records.length, count);
  assert.equal(collection.species.stage, 1);
  assert.deepEqual(collection.active.memory.places, ["orchard"]);
  assert.equal(collection.active.biology.hunger, 0.63);
  assert.equal(collection.active.skills.cooldowns.pulse, 0.4);
  assert.equal(collection.adopt(STARTER_IDS[0]).ok, false);
  assert.equal(collection.adopt(collection.species.id).ok, false);
  assert.equal(collection.evolve().ok, false);
  collection.gainExperience(experienceForLevel(7));
  individual.bond = 60;
  assert.equal(collection.evolve().ok, true);
  assert.equal(collection.species.stage, 2);
  const resources = structuredClone(collection.resources);
  assert.equal(collection.evolve().ok, false);
  assert.deepEqual(collection.resources, resources);
});

test("selection and persistence do not share biology memory or skill cooldowns", () => {
  const collection = new SpiritCollection();
  const first = collection.active;
  const second = collection.records[1];
  first.biology = { hunger: 0.8 };
  first.memory = { visits: [1] };
  first.skills = { cooldowns: { fire: 1 } };
  first.training.power = 3;
  assert.equal(collection.select(second.id).ok, true);
  assert.equal(collection.active.biology, null);
  assert.equal(collection.active.training.power, 0);
  const snapshot = collection.snapshot();
  const restored = new SpiritCollection(snapshot);
  restored.records[0].memory.visits.push(2);
  restored.records[0].biology.hunger = 0.2;
  assert.deepEqual(first.memory.visits, [1]);
  assert.equal(first.biology.hunger, 0.8);
  assert.equal(snapshot.records[0].biology.hunger, 0.8);
  assert.equal(restored.active.id, second.id);
});

test("unaffordable adoption and training are atomic and do not award experience", () => {
  const collection = new SpiritCollection();
  collection.resources.coins = 0;
  collection.resources.food = 0;
  const snapshot = collection.snapshot();
  assert.equal(collection.adopt("cloud-bird-base").ok, false);
  assert.equal(collection.train("feed").ok, false);
  assert.equal(collection.train("power").ok, false);
  assert.equal(collection.train("unknown").ok, false);
  assert.deepEqual(collection.snapshot(), snapshot);
  assert.equal(collection.train("rest").ok, true);
  assert.equal(collection.active.bond, snapshot.records[0].bond);
});

test("training requires recovery and stat growth remains bounded", () => {
  const collection = new SpiritCollection();
  for (let i = 0; i < 4; i += 1) assert.equal(collection.train("power").ok, true);
  assert.equal(collection.train("power").ok, false);
  assert.equal(collection.train("rest").ok, true);
  assert.equal(collection.train("power").ok, true);
  collection.active.level = 100000;
  collection.active.training = { power: 100000, endurance: 100000, agility: Infinity };
  const stats = collection.stats();
  assert.ok(stats.health <= 900 && stats.attack <= 2.2 && stats.defense <= 0.38 && stats.speed <= 155);
  assert.ok(stats.healthMultiplier <= 1.65 && stats.attackMultiplier <= 1.6 && stats.speedMultiplier <= 1.14);
  collection.active.training.power = TRAINING_CAP;
  collection.active.trainingLoad = 0;
  const coins = collection.resources.coins;
  assert.equal(collection.train("power").ok, false);
  assert.equal(collection.resources.coins, coins);
});

test("battle participation always rewards progress and victory rewards evolution materials", () => {
  const collection = new SpiritCollection();
  const initial = collection.snapshot();
  const loss = collection.awardBattle(false);
  assert.equal(loss.ok, true);
  assert.ok(collection.active.xp > initial.records[0].xp);
  assert.equal(collection.active.battles, 1);
  assert.equal(collection.active.wins, 0);
  assert.equal(collection.resources.materials.evolutionShard, initial.resources.materials.evolutionShard);
  const win = collection.awardBattle(true);
  assert.equal(win.ok, true);
  assert.equal(collection.active.battles, 2);
  assert.equal(collection.active.wins, 1);
  assert.equal(collection.resources.materials.evolutionShard, initial.resources.materials.evolutionShard + 1);
  assert.equal(collection.resources.coins, initial.resources.coins + loss.coins + win.coins);
});

test("an exhausted collection can recover for free and earn enough resources to resume training", () => {
  const collection = new SpiritCollection();
  collection.resources = { coins: 0, food: 0, materials: { evolutionShard: 0 } };
  collection.active.trainingLoad = 100;
  collection.active.biology = { stamina: 0, fatigue: 1, health: 0.1, hunger: 0.9 };
  assert.equal(collection.train("feed").ok, false);
  assert.equal(collection.train("rest").ok, true);
  assert.equal(collection.active.biology.stamina, 1);
  assert.ok(collection.active.biology.health > 0.1);
  assert.ok(collection.active.biology.fatigue < 1);
  assert.equal(collection.train("power").ok, false);
  collection.awardBattle(false);
  assert.equal(collection.train("feed").ok, true);
  assert.equal(collection.train("power").ok, true);
  assert.ok(collection.resources.coins >= 0 && collection.resources.food >= 0);
  collection.awardBattle(true);
  assert.equal(collection.resources.materials.evolutionShard, 1);
  const restored = new SpiritCollection(collection.snapshot());
  assert.deepEqual(restored.resources, collection.resources);
});

test("corrupted and legacy saves are bounded and recover a playable starter roster", () => {
  const corrupted = new SpiritCollection({ resources: { coins: -Infinity, food: -23 }, records: [null, { speciesId: "does-not-exist" }, { speciesId: "constructor" }], unlocked: [null, "does-not-exist"], activeId: "missing" });
  assert.equal(corrupted.records.length, STARTER_IDS.length);
  assert.ok(corrupted.active);
  assert.ok(corrupted.resources.food >= 0);
  const speciesId = STARTER_IDS[0];
  const restored = new SpiritCollection({ records: [{ id: "same", speciesId, xp: -300, bond: 900, training: { endurance: -999, power: 1000 }, biology: { hunger: 0.5 } }, { id: "same", speciesId }, { id: "same", speciesId: STARTER_IDS[1], level: 999 }] });
  assert.equal(restored.records.length, 2);
  assert.notEqual(restored.records[0].id, restored.records[1].id);
  assert.equal(restored.records[0].xp, 0);
  assert.equal(restored.records[0].bond, 100);
  assert.equal(restored.records[0].training.power, TRAINING_CAP);
  assert.equal(restored.records[1].level, MAX_LEVEL);
  assert.equal(SPECIES_BY_ID[restored.species.id].id, restored.species.id);
  const invalidStates = new SpiritCollection({ records: [{ speciesId, biology: true, memory: 34, skills: "stale", battles: 2, wins: 20 }] });
  assert.equal(invalidStates.active.biology, null);
  assert.equal(invalidStates.active.memory, null);
  assert.equal(invalidStates.active.skills, null);
  assert.equal(invalidStates.active.wins, 2);
  assert.equal(invalidStates.train("feed").ok, true);
});

test("invalid persisted physiology and skill growth cannot inject NaN or extreme modifiers", () => {
  const collection = new SpiritCollection({ records: [{ speciesId: STARTER_IDS[0], biology: { health: "broken", stamina: 200, traits: { groundSpeed: 999, strength: "not-a-number" }, injuries: { leg: -4 } }, memory: { confidence: "invalid", affinity: 3, personality: "invented", places: ["garden"] }, skills: { states: { dash: { level: 100000, xp: -5, cooldown: "invalid" } } } }] });
  const { biology, memory, skills } = collection.active;
  assert.equal(biology.health, undefined);
  assert.equal(biology.stamina, 1);
  assert.equal(biology.traits.groundSpeed, 1);
  assert.equal(biology.traits.strength, undefined);
  assert.equal(biology.injuries.leg, 0);
  assert.equal(memory.confidence, undefined);
  assert.equal(memory.affinity, 1);
  assert.equal(memory.personality, collection.species.personality);
  assert.deepEqual(memory.places, ["garden"]);
  assert.equal(skills.states.dash.level, 30);
  assert.equal(skills.states.dash.xp, 0);
  assert.equal(skills.states.dash.cooldown, undefined);
});
