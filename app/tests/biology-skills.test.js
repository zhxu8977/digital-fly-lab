import assert from "node:assert/strict";
import test from "node:test";
import { BiologicalState } from "../src/biology.js";
import { BIPED_ELEMENT_LOADOUTS, ELEMENT_LOADOUTS, SKILLS, elementMultiplier, estimateShotOpportunity, skillDistanceWindow, skillInRange, SkillSystem } from "../src/skills.js";

test("hunger amplifies food priority and smell while eating restores state", () => {
  const state = new BiologicalState({ hunger: 0.9, stamina: 0.4 });
  const hungry = state.modifiers();
  state.eat(0.4);
  const fed = state.modifiers();
  assert.ok(hungry.foodPriority > fed.foodPriority);
  assert.ok(state.stamina > 0.4);
});

test("wing and leg injuries affect different movement systems", () => {
  const state = new BiologicalState();
  const healthy = state.modifiers();
  state.takeDamage(0.1, { wing: 0.5, leg: 0.3 });
  const injured = state.modifiers();
  assert.ok(injured.flightSpeed < healthy.flightSpeed * 0.7);
  assert.ok(injured.groundSpeed < healthy.groundSpeed);
});

test("legacy exhausted prototype saves are restored to a usable body", () => {
  const state = new BiologicalState({
    balanceVersion: 2, health: 0, stamina: 0.2, fatigue: 1, pain: 1,
    injuries: { wing: 0.4, leg: 1, poison: 0.2 },
  });
  assert.equal(state.health, 0.9);
  assert.equal(state.fatigue, 0.12);
  assert.equal(state.injuries.leg, 0);
  assert.ok(state.modifiers().groundSpeed > 0.75);
});

test("element registry applies configurable strengths and resistances", () => {
  assert.ok(elementMultiplier("fire", "wood") > 1);
  assert.ok(elementMultiplier("electric", "earth") < 1);
  assert.equal(elementMultiplier("neutral", "fire"), 1);
});

test("skills share cooldown, stamina, range and leveling interfaces", () => {
  const actor = new BiologicalState({ stamina: 1 });
  const system = new SkillSystem();
  const hit = system.activate("venom", { actor, distance: 200, targetElement: "earth" });
  assert.equal(hit.ok, true);
  assert.ok(hit.damage > 0);
  assert.ok(actor.stamina < 1);
  assert.equal(system.activate("venom", { actor, distance: 200 }).ok, false);
});

test("every battle element has its own valid skill loadout", () => {
  for (const [element, ids] of Object.entries(ELEMENT_LOADOUTS)) {
    assert.ok(ids.length >= (element === "neutral" ? 1 : 2), `${element} needs a complete loadout`);
    ids.forEach((id) => {
      assert.ok(SKILLS[id], `missing skill ${id}`);
      assert.ok(SKILLS[id].element === element || SKILLS[id].element === "neutral", `${id} does not belong to ${element}`);
    });
  }
  assert.notDeepEqual(ELEMENT_LOADOUTS.fire, ELEMENT_LOADOUTS.water);
});

test("every biped element keeps both ranged and close-combat options", () => {
  for (const [element, ids] of Object.entries(BIPED_ELEMENT_LOADOUTS)) {
    assert.ok(ids.every((id) => SKILLS[id]), `${element} biped loadout contains an unknown skill`);
    assert.ok(ids.some((id) => SKILLS[id].range >= 700), `${element} biped needs an anti-air ranged skill`);
    assert.ok(ids.some((id) => SKILLS[id].type === "melee" || SKILLS[id].type === "area"), `${element} biped needs a close-combat skill`);
    assert.ok(ids.includes("throwingDart"), `${element} biped needs the dedicated throwing action`);
  }
});

test("melee and throwing skills enforce different distance windows", () => {
  assert.equal(skillInRange(SKILLS.risingStrike, 500), false);
  assert.equal(skillInRange(SKILLS.risingStrike, 120), true);
  assert.equal(skillInRange(SKILLS.throwingDart, 120), false);
  assert.equal(skillInRange(SKILLS.throwingDart, 860), true);
  assert.deepEqual(skillDistanceWindow(SKILLS.throwingDart), { min: 240, max: 1350, ideal: 860 });
});

test("projectile planning rejects a very late low-confidence crossing shot", () => {
  const clean = estimateShotOpportunity({ skill: SKILLS.throwingDart, distance: 760, projectileSpeed: 1080, hitRadius: 122, targetSpeed: 260, targetHeadingOffset: 0 });
  const crossing = estimateShotOpportunity({ skill: SKILLS.throwingDart, distance: 1300, projectileSpeed: 360, hitRadius: 30, targetSpeed: 1200, targetHeadingOffset: Math.PI / 2 });
  assert.equal(clean.viable, true);
  assert.equal(crossing.viable, false);
  assert.ok(clean.confidence > crossing.confidence);
});

test("every skill declares an anatomical source and aiming requirement", () => {
  Object.entries(SKILLS).forEach(([id, skill]) => {
    assert.ok(["mouth", "antenna", "wing", "paws", "body"].includes(skill.source), `${id} has no valid body source`);
    assert.equal(typeof skill.requiresFacing, "boolean", `${id} has no facing rule`);
    assert.ok(skill.sourceLabel, `${id} has no source label`);
  });
  assert.equal(SKILLS.flame.source, "mouth");
  assert.equal(SKILLS.flame.requiresFacing, true);
  assert.equal(SKILLS.gust.source, "wing");
  assert.equal(SKILLS.gust.requiresFacing, false);
});

test("basic aerial projectiles are cheap enough for sustained mobile combat", () => {
  assert.ok(SKILLS.spark.cost <= 0.01);
  assert.ok(SKILLS.gust.cost <= 0.01);
  assert.ok(SKILLS.waterJet.cost <= 0.015);
  assert.ok(SKILLS.spark.damage < SKILLS.dash.damage);
});

test("fire and neutral aerial partners can damage distant ground targets", () => {
  for (const element of ["fire", "neutral"]) {
    const ranged = ELEMENT_LOADOUTS[element].map((id) => SKILLS[id]).filter((skill) => skill.type === "projectile" && skill.damage > 0);
    assert.ok(ranged.some((skill) => skill.range >= 1000 && skill.cost <= 0.015));
  }
});

test("every element can use the low-cost olfactory tracking mark", () => {
  for (const ids of Object.values(ELEMENT_LOADOUTS)) assert.ok(ids.includes("scentMark"));
  assert.equal(SKILLS.scentMark.type, "mark");
  assert.ok(SKILLS.scentMark.range >= 700);
  assert.ok(SKILLS.scentMark.cost <= 0.01);
});

test("normal interaction no longer exhausts the creature immediately", () => {
  const flying = new BiologicalState({ stamina: 1, fatigue: 0 });
  for (let i = 0; i < 60 * 30; i += 1) {
    flying.spendStamina((1 / 30) * 0.009);
    flying.update(1 / 30, { moving: true, flying: true });
  }
  assert.ok(flying.stamina > 0.45, `one minute flight stamina=${flying.stamina}`);
  assert.ok(flying.fatigue < 0.35, `one minute flight fatigue=${flying.fatigue}`);

  const walking = new BiologicalState({ stamina: 0.3, fatigue: 0.2 });
  for (let i = 0; i < 15 * 30; i += 1) walking.update(1 / 30, { moving: true, flying: false });
  assert.ok(walking.stamina > 0.65, `walking recovery=${walking.stamina}`);
});
