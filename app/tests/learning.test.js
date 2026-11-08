import assert from "node:assert/strict";
import test from "node:test";
import { CompanionLearning, DEFAULT_MEMORY } from "../src/learning.js";

test("feeding and petting build affinity while reducing fear", () => {
  const memory = new CompanionLearning();
  memory.interact("feed");
  memory.interact("pet");
  assert.ok(memory.affinity > DEFAULT_MEMORY.affinity);
  assert.ok(memory.fear < DEFAULT_MEMORY.fear);
});

test("scaring weakens the relationship and raises fear", () => {
  const memory = new CompanionLearning({ affinity: 0.5, fear: 0.2 });
  memory.interact("scare");
  assert.ok(memory.affinity < 0.5);
  assert.ok(memory.fear > 0.2);
});

test("training raises attack drive without changing connectome inputs", () => {
  const memory = new CompanionLearning();
  const before = memory.decide({ enemyDistance: 70, escape: 0.05 }).attackDrive;
  memory.interact("train"); memory.interact("train"); memory.interact("train");
  const after = memory.decide({ enemyDistance: 70, escape: 0.05 }).attackDrive;
  assert.ok(after > before + 0.08, `before=${before}, after=${after}`);
});

test("real escape activity raises the retreat score", () => {
  const memory = new CompanionLearning({ fear: 0.5 });
  const safe = memory.decide({ enemyDistance: 50, neuralEscape: 0, enemyStrength: 0.8, enemyHostility: 1 });
  const danger = memory.decide({ enemyDistance: 50, neuralEscape: 1, enemyStrength: 0.8, enemyHostility: 1 });
  assert.ok(danger.scores.escape > safe.scores.escape + 0.15, `safe=${safe.scores.escape}, danger=${danger.scores.escape}`);
});

test("a weak harmless target with no reward is ignored", () => {
  const decision = new CompanionLearning().decide({ enemyDistance: 60, enemyStrength: 0.2, enemyHostility: 0.05, reward: 0, neuralEscape: 0.25 });
  assert.equal(decision.action, "ignore");
});

test("a clearly stronger hostile target is escaped when a route exists", () => {
  const decision = new CompanionLearning().decide({ enemyDistance: 60, enemyStrength: 0.95, enemyHostility: 1, reward: 0.2, neuralEscape: 0.8, escapeRoom: 1 });
  assert.equal(decision.action, "escape");
});

test("being trapped can force defensive attack instead of impossible escape", () => {
  const memory = new CompanionLearning({ attackSkill: 0.45, confidence: 0.55 });
  const decision = memory.decide({ enemyDistance: 60, enemyStrength: 0.8, enemyHostility: 1, reward: 0.2, neuralEscape: 0.75, escapeRoom: 0.08 });
  assert.notEqual(decision.action, "escape");
});

test("an attack command is advisory and does not override hopeless odds", () => {
  const decision = new CompanionLearning().decide({ enemyDistance: 60, enemyStrength: 1, enemyHostility: 1, reward: 0.1, neuralEscape: 0.8, ownerCommand: "attack", escapeRoom: 1 });
  assert.equal(decision.action, "escape");
});

test("successful and failed evasions adapt continuous motor preferences", () => {
  const memory = new CompanionLearning();
  const lateralBefore = memory.dodgeLateral;
  memory.reinforceEvasion(true, "lateral");
  assert.ok(memory.dodgeLateral > lateralBefore);
  const verticalBefore = memory.dodgeVertical;
  memory.reinforceEvasion(false, "vertical");
  assert.ok(memory.dodgeVertical < verticalBefore);
  assert.equal(memory.dodgeAttempts, 2);
  assert.equal(memory.dodgeSuccesses, 1);
  const restored = new CompanionLearning(memory.snapshot());
  assert.equal(restored.dodgeLateral, memory.dodgeLateral);
  assert.equal(restored.dodgeVertical, memory.dodgeVertical);
});

test("duel outcomes persist range, probing and rush-response experience", () => {
  const memory = new CompanionLearning();
  const rangeBefore = memory.rangeDiscipline;
  memory.learnCombatOutcome({ won: true, opponentPressure: 0.82, hitRate: 0.64, safeRangeSuccess: 0.76 });
  assert.equal(memory.combatEncounters, 1);
  assert.ok(memory.rangeDiscipline > rangeBefore);
  assert.ok(memory.rememberedPressure > DEFAULT_MEMORY.rememberedPressure);
  assert.ok(memory.counterRush > DEFAULT_MEMORY.counterRush);
  const restored = new CompanionLearning(memory.snapshot());
  assert.equal(restored.combatEncounters, 1);
  assert.equal(restored.rangeDiscipline, memory.rangeDiscipline);
});
