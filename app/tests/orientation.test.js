import assert from "node:assert/strict";
import test from "node:test";
import { resolveFlightDirection, updateCombatOrientation, wrappedAngleDelta } from "../src/orientation.js";

test("combat body turn is rate limited even when target jumps across it", () => {
  const dt = 1 / 30;
  const result = updateCombatOrientation({ bodyAngle: 0, lookAngle: 0, movementAngle: 0.2, targetAngle: Math.PI - 0.01, hasTarget: true, attacking: false, dt });
  assert.ok(Math.abs(wrappedAngleDelta(result.bodyAngle, 0)) <= 1.85 * dt + 1e-9);
});

test("body follows flight direction while head can acquire a target faster", () => {
  const dt = 0.1;
  const result = updateCombatOrientation({ bodyAngle: 0, lookAngle: 0, movementAngle: 0.5, targetAngle: 1.4, hasTarget: true, attacking: false, dt });
  assert.ok(Math.abs(wrappedAngleDelta(result.bodyAngle, 0.5)) < Math.abs(wrappedAngleDelta(result.bodyAngle, 1.4)));
  assert.ok(result.lookAngle > result.bodyAngle);
});

test("committed body heading can stay stable while the head tracks a moving target", () => {
  const result = updateCombatOrientation({ bodyAngle: 0, lookAngle: 0, movementAngle: 0.1, targetAngle: 0.12, lookTargetAngle: 1.2, hasTarget: true, attacking: false, dt: 0.1 });
  assert.ok(Math.abs(result.bodyAngle) <= 0.11);
  assert.ok(result.lookAngle > result.bodyAngle + 0.2);
});

test("evasion does not twist the body back toward the enemy", () => {
  const result = updateCombatOrientation({ bodyAngle: 0, lookAngle: 0, movementAngle: -0.8, targetAngle: 1.2, hasTarget: true, attacking: true, mode: "reflexDodge", dt: 0.1 });
  assert.ok(result.bodyAngle < 0);
});

test("a mouth-fired aimed skill turns the body toward its target", () => {
  const result = updateCombatOrientation({ bodyAngle: 0, lookAngle: 0, movementAngle: -0.4, targetAngle: 0.9, hasTarget: true, attacking: true, requiresFacing: true, mode: "rangeControl", dt: 0.1 });
  assert.ok(result.bodyAngle > 0);
});

test("a visible enemy near the rear edge makes the body recover visual contact", () => {
  const result = updateCombatOrientation({ bodyAngle: 0, lookAngle: 0, movementAngle: 0, targetAngle: 2.35, hasTarget: true, attacking: false, mode: "rangeControl", dt: 0.1 });
  assert.ok(result.bodyAngle > 0.12);
  assert.ok(result.lookAngle > result.bodyAngle);
});

test("intentional flight escape remains free to turn away from the enemy", () => {
  const result = updateCombatOrientation({ bodyAngle: 0, lookAngle: 0, movementAngle: -0.9, targetAngle: 1.5, hasTarget: true, attacking: false, mode: "flee", dt: 0.1 });
  assert.ok(result.bodyAngle < 0);
});

test("ordinary flight cannot translate backward like a six-axis NPC", () => {
  const result = resolveFlightDirection({ bodyAngle: 0, desiredMovementAngle: Math.PI, previousMovementAngle: 0, mode: "rangeControl", dt: 0.2 });
  assert.ok(Math.abs(result.sideslip) <= 0.5 + 1e-9);
});

test("escape permits a brief larger sideslip and visible bank", () => {
  const result = resolveFlightDirection({ bodyAngle: 0, desiredMovementAngle: Math.PI / 2, previousMovementAngle: 0, mode: "reflexDodge", dt: 0.2 });
  assert.ok(Math.abs(result.sideslip) > 0.5);
  assert.ok(Math.abs(result.bankTarget) > 0.3);
});

