import assert from "node:assert/strict";
import test from "node:test";
import { COMBAT_PERSONALITIES, MAX_LEVEL, SPECIES, SPECIES_BY_ID, SpiritCollection, TEMPERAMENTS, createDeveloperPreviewRecord } from "../src/collection.js";
import { BIPED_ELEMENT_LOADOUTS, ELEMENTS, ELEMENT_CYCLE, ELEMENT_EDGE_OFFSETS, ELEMENT_LOADOUTS, ELEMENT_MATCHUPS, MATCHUPS, SKILLS, SkillSystem, elementMultiplier, getSkillVisual, getSpeciesLoadout, skillDistanceWindow } from "../src/skills.js";

test("18-element matrix has reciprocal balanced advantages without immunity", () => {
  const keys = Object.keys(ELEMENTS);
  assert.equal(keys.length, 18);
  assert.equal(ELEMENT_CYCLE.length, 17);
  assert.equal(MATCHUPS, ELEMENT_MATCHUPS);
  assert.equal(ELEMENT_EDGE_OFFSETS.length, 3);
  for (const attacker of keys) {
    assert.equal(ELEMENT_MATCHUPS[attacker][attacker], 0.8);
    const strengths = [], weaknesses = [];
    for (const defender of keys) {
      const value = elementMultiplier(attacker, defender);
      assert.ok([0.8, 1, 1.5, 2 / 3].includes(value), `${attacker} → ${defender} has unsupported multiplier ${value}`);
      assert.ok(value > 0);
      if (value === 1.5) {
        strengths.push(defender);
        assert.equal(elementMultiplier(defender, attacker), 2 / 3);
      }
      if (value === 2 / 3) weaknesses.push(defender);
    }
    assert.equal(strengths.length, attacker === "neutral" ? 0 : 3);
    assert.equal(weaknesses.length, attacker === "neutral" ? 0 : 3);
    assert.deepEqual(ELEMENTS[attacker].strengths, strengths);
    assert.deepEqual(ELEMENTS[attacker].weaknesses, weaknesses);
  }
  assert.equal(elementMultiplier("fire", "wood"), 1.5);
  assert.equal(elementMultiplier("wood", "earth"), 1.5);
  assert.equal(elementMultiplier("earth", "electric"), 1.5);
  assert.equal(elementMultiplier("electric", "water"), 1.5);
  assert.equal(elementMultiplier("water", "fire"), 1.5);
  assert.equal(elementMultiplier("missing", "fire"), 1);
  assert.ok(Number.isFinite(elementMultiplier("fire", "wood", { fire: "invalid" })));
});

test("every element and every body has cheap ranged, close and tracking options", () => {
  for (const element of Object.keys(ELEMENTS)) {
    for (const loadout of [ELEMENT_LOADOUTS[element], BIPED_ELEMENT_LOADOUTS[element]]) {
      assert.ok(Array.isArray(loadout));
      assert.ok(loadout.every((id) => SKILLS[id]), `${element} contains a missing skill`);
      assert.ok(loadout.some((id) => SKILLS[id].type === "projectile" && SKILLS[id].range >= 700 && SKILLS[id].cost <= 0.015), `${element} lacks a usable cheap projectile`);
      assert.ok(loadout.some((id) => ["melee", "area", "cone"].includes(SKILLS[id].type)), `${element} lacks close combat`);
      assert.ok(loadout.includes("scentMark"));
      assert.ok(loadout.every((id) => SKILLS[id].element === "neutral" || SKILLS[id].element === element));
    }
  }
  for (const species of SPECIES) {
    const loadout = getSpeciesLoadout(species);
    assert.equal(new Set(loadout).size, loadout.length);
    assert.ok(species.signatureSkills.length >= 2);
    assert.ok(species.signatureSkills.every((id) => loadout.includes(id)));
    assert.ok(loadout.some((id) => SKILLS[id].type === "projectile"));
    assert.ok(loadout.some((id) => ["melee", "area", "cone"].includes(SKILLS[id].type)));
  }
  assert.deepEqual(getSpeciesLoadout(null, { ground: false }), ELEMENT_LOADOUTS.neutral);
});

test("all skills declare bounded mechanics, source, gesture and render contracts", () => {
  assert.ok(Object.keys(SKILLS).length >= 50);
  const reactions = new Set(["burn", "shock", "poison", "launch", "spin", "recoil"]);
  const sources = new Set(["body", "mouth", "wing", "antenna", "paws"]);
  for (const [id, skill] of Object.entries(SKILLS)) {
    assert.ok(ELEMENTS[skill.element], id);
    assert.ok(sources.has(skill.source), id);
    assert.ok(skill.gesture && skill.vfxStyle && skill.sourceLabel && skill.description, id);
    assert.ok(reactions.has(skill.reaction), id);
    assert.ok(skill.cost >= 0 && skill.cost <= 0.05, id);
    assert.ok(skill.damage >= 0 && skill.damage <= 40, id);
    assert.ok(skill.cooldown >= 1 && skill.cooldown <= 10, id);
    const visual = getSkillVisual(id, { stage: 2 });
    assert.ok(visual.style && Number.isInteger(visual.color), id);
    assert.ok(visual.speed >= 1200 && visual.speed <= 1800, id);
    assert.ok(visual.hitRadius > 0 && visual.hitRadius <= 200, id);
    assert.ok(visual.particles <= 16 && reactions.has(visual.reaction), id);
    if (skill.damage > 0) assert.ok(skillDistanceWindow(skill).max > 0, id);
  }
  assert.ok(getSkillVisual("missing").style);
});

test("all 36 evolution lines change palettes, proportions and grown features", () => {
  const familyIds = new Set(SPECIES.map((species) => species.familyId));
  assert.equal(familyIds.size, 36);
  const elementsPresent = new Set(SPECIES.map((species) => species.element));
  assert.equal(elementsPresent.size, 18);
  for (const familyId of familyIds) {
    const forms = SPECIES.filter((species) => species.familyId === familyId);
    assert.equal(new Set(forms.map((species) => JSON.stringify(species.colors))).size, 3, familyId);
    assert.equal(new Set(forms.map((species) => JSON.stringify(species.stagePalette))).size, 3, familyId);
    assert.equal(new Set(forms.map((species) => species.visualSize)).size, 3, familyId);
    assert.equal(new Set(forms.map((species) => species.assetHint.formStyle)).size, 3, familyId);
    assert.ok(forms[0].evolutionVisual.headScale > forms[2].evolutionVisual.headScale, familyId);
    assert.ok(forms[0].evolutionVisual.crestScale < forms[2].evolutionVisual.crestScale, familyId);
    assert.ok(forms[0].visualSize < forms[2].visualSize, familyId);
    assert.ok(forms[2].features.includes("crown-crest"));
    for (const species of forms) {
      assert.ok(["aerial", "biped", "cat", "corgi"].includes(species.bodyType));
      assert.ok(species.visualSize >= 0.6 && species.visualSize <= 1.4, species.id);
      assert.ok(species.signatureSkills.every((id) => SKILLS[id]));
      assert.ok(Object.isFrozen(species.colors) && Object.isFrozen(species.evolutionVisual));
    }
  }
});

test("12 social temperaments remain mapped to the four compatible combat archetypes", () => {
  assert.equal(Object.keys(TEMPERAMENTS).length, 12);
  assert.equal(Object.keys(COMBAT_PERSONALITIES).length, 4);
  assert.ok(new Set(SPECIES.map((species) => species.temperamentId)).size >= 10);
  for (const species of SPECIES) {
    const temperament = TEMPERAMENTS[species.temperamentId];
    assert.equal(temperament, species.temperament);
    assert.equal(temperament.archetype, species.personality);
    assert.ok(temperament.label && temperament.description && temperament.social);
    assert.ok(["roll", "tilt", "nuzzle"].includes(temperament.preferredInteraction));
    for (const key of ["attackBias", "dodgeBias", "patience", "retreatHealth"]) assert.ok(temperament[key] > 0 && temperament[key] < 1);
  }
});

test("developer specimens access every form without unlocking or spending real resources", () => {
  const collection = new SpiritCollection();
  const saved = collection.snapshot();
  for (const species of SPECIES) {
    const preview = createDeveloperPreviewRecord(species.id);
    assert.equal(preview.speciesId, species.id);
    assert.equal(preview.developerPreview, true);
    assert.equal(preview.level, 7);
    assert.equal(preview.biology.stamina, 1);
    assert.ok(collection.stats(preview).health <= 900);
  }
  assert.deepEqual(collection.snapshot(), saved);
  assert.equal(createDeveloperPreviewRecord("not-a-species"), null);
  const preview = createDeveloperPreviewRecord("star-dragon-crown", { level: Infinity });
  collection.records.push(preview);
  collection.activeId = preview.id;
  assert.equal(collection.train("power").ok, false);
  assert.equal(collection.evolve().ok, false);
  assert.equal(collection.gainExperience(1000).amount, 0);
  assert.equal(collection.awardBattle(true).coins, 0);
  assert.deepEqual(collection.resources, saved.resources);
  assert.deepEqual(collection.snapshot(), saved);
  const second = createDeveloperPreviewRecord("star-dragon-crown");
  second.biology.stamina = 0;
  second.memory.confidence = 0;
  second.skills.states.dash.cooldown = 9;
  assert.equal(preview.biology.stamina, 1);
  assert.equal(preview.memory.confidence, 0.55);
  assert.equal(preview.skills.states.dash.cooldown, 0);
});

test("V3 saves preserve individual identity and all expanded families can persist", () => {
  const legacy = {
    version: 1, activeId: "spirit-91", resources: { coins: 915, food: 3, materials: { evolutionShard: 2 } },
    records: [{ id: "spirit-91", speciesId: "ember-dragon-crown", xp: 1200, bond: 81, nickname: "小焰", memory: { fear: 0.2, places: ["orchard"] }, biology: { hunger: 0.4 }, skills: { states: { fireBolt: { level: 4, xp: 2, cooldown: 1 } } } }],
  };
  const restored = new SpiritCollection(legacy);
  assert.equal(restored.active.id, "spirit-91");
  assert.equal(restored.active.nickname, "小焰");
  assert.equal(restored.active.speciesId, "ember-dragon-crown");
  assert.deepEqual(restored.active.memory.places, ["orchard"]);
  assert.equal(restored.resources.coins, 915);
  assert.equal(restored.active.skills.states.fireBolt.level, 4);
  const collection = new SpiritCollection();
  collection.resources.coins = 10000;
  for (const species of SPECIES.filter((entry) => entry.stage === 0)) {
    if (!collection.records.some((record) => SPECIES_BY_ID[record.speciesId].familyId === species.familyId)) assert.equal(collection.adopt(species.id).ok, true);
  }
  assert.equal(collection.records.length, 36);
  assert.equal(new SpiritCollection(collection.snapshot()).records.length, 36);
  const injected = new SpiritCollection({ ...legacy, records: [createDeveloperPreviewRecord("iron-pup-crown")] });
  assert.equal(injected.records.length, 4);
  assert.ok(injected.records.every((record) => !record.id.startsWith("preview-")));
});

test("expanded final-form growth and corrupt skill saves remain bounded", () => {
  const collection = new SpiritCollection();
  for (const species of SPECIES) {
    const specimen = createDeveloperPreviewRecord(species.id, { level: MAX_LEVEL });
    specimen.training = { power: 999999, endurance: 999999, agility: 999999 };
    const stats = collection.stats(specimen);
    assert.ok(stats.health <= 900 && stats.attack <= 2.2 && stats.defense <= 0.38 && stats.speed <= 155);
    assert.ok(stats.speedMultiplier <= 1.14 && stats.attackMultiplier <= 1.6);
  }
  const system = new SkillSystem({ states: { iceOrb: { level: 999999, cooldown: "bad", xp: Infinity }, cosmicBurst: { level: -99, cooldown: 999999, xp: -23 } } });
  assert.equal(system.states.iceOrb.level, 30);
  assert.equal(system.states.iceOrb.cooldown, 0);
  assert.equal(system.states.iceOrb.xp, 0);
  assert.equal(system.states.cosmicBurst.level, 1);
  assert.equal(system.states.cosmicBurst.cooldown, 60);
  system.tick(NaN);
  assert.equal(system.states.cosmicBurst.cooldown, 60);
  const actor = { spendStamina: () => true, modifiers: () => ({ combat: NaN }) };
  const result = system.activate("iceOrb", { actor, distance: 800 });
  assert.equal(result.ok, true);
  assert.ok(Number.isFinite(result.damage));
  assert.equal(system.states.iceOrb.level, 30);
});
