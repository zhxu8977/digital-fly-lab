import assert from "node:assert/strict";
import test from "node:test";
import { combatPowerIndex, evaluateCombatDisposition, shouldRetreatFromDuel } from "../src/combat-personality.js";

const profile = { health: 280, defense: 0.12, speed: 112, power: 1 };

test("brave and cautious creatures derive different attack and dodge tendencies", () => {
  const common = { ownPower: 1, targetPower: 1, ownHealth: 0.9, targetHealth: 0.9, stamina: 0.8, fatigue: 0.1, confidence: 0.5, fear: 0.25 };
  const brave = evaluateCombatDisposition({ ...common, personality: "brave" });
  const cautious = evaluateCombatDisposition({ ...common, personality: "cautious" });
  assert.ok(brave.attackTendency > cautious.attackTendency + 0.35);
  assert.ok(cautious.dodgeTendency > brave.dodgeTendency + 0.3);
  assert.ok(brave.pursuitTendency > cautious.pursuitTendency);
  assert.ok(cautious.dodgeThreshold < brave.dodgeThreshold);
});

test("real condition and power gap can override nominal bravery", () => {
  const braveOutmatched = evaluateCombatDisposition({ personality: "brave", ownPower: 0.45, targetPower: 1.4, ownHealth: 0.38, targetHealth: 0.9, stamina: 0.3, fatigue: 0.7, confidence: 0.4, fear: 0.5 });
  assert.equal(shouldRetreatFromDuel(braveOutmatched, 0.38, 0.9), true);
});

test("a cautious but healthy fighter repositions instead of abandoning the duel", () => {
  const cautious = evaluateCombatDisposition({ personality: "cautious", ownPower: 0.72, targetPower: 1, ownHealth: 0.82, targetHealth: 0.99, stamina: 0.65, fatigue: 0.2, confidence: 0.42, fear: 0.48 });
  assert.ok(cautious.retreatTendency > 0.74);
  assert.equal(shouldRetreatFromDuel(cautious, 0.82, 0.99), false);
});

test("power index responds to health stamina fatigue and profile strength", () => {
  const fresh = combatPowerIndex({ profile, healthRatio: 1, stamina: 1, fatigue: 0, confidence: 0.6, bodyType: "cat" });
  const tired = combatPowerIndex({ profile, healthRatio: 0.35, stamina: 0.2, fatigue: 0.8, confidence: 0.3, bodyType: "cat" });
  assert.ok(fresh > tired * 1.5);
});

test("species temperament offsets change real tactics without overriding body conditions", () => {
  const gentle = evaluateCombatDisposition({ personality: "balanced", traits: { label: "温柔", aggressionOffset: -0.06, evasionOffset: 0.04, patienceOffset: 0.08 } });
  const protective = evaluateCombatDisposition({ personality: "balanced", traits: { label: "护主", aggressionOffset: 0.07, evasionOffset: -0.03, patienceOffset: 0.04 } });
  assert.ok(gentle.attackTendency < protective.attackTendency);
  assert.ok(gentle.dodgeTendency > protective.dodgeTendency);
  assert.ok(gentle.probeTendency > protective.probeTendency);
  assert.match(gentle.reason, /温柔/);
  const corrupt = evaluateCombatDisposition({ traits: { aggressionOffset: Infinity, evasionOffset: NaN, patienceOffset: -1000 } });
  assert.ok(Number.isFinite(corrupt.attackTendency) && Number.isFinite(corrupt.dodgeTendency));
});
