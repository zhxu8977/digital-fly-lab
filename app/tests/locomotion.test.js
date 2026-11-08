import assert from "node:assert/strict";
import test from "node:test";
import { canClearObstacle, movementSpeed, updateFlightState } from "../src/locomotion.js";
import { selectGroundCombatPace, updateGroundLocomotion } from "../src/ground-locomotion.js";

test("takeoff raises real altitude and flight is faster than walking", () => {
  let state = { altitude: 0 };
  for (let i = 0; i < 30; i += 1) state = updateFlightState(state, { dt: 1 / 30, command: "takeoff", stamina: 1 });
  assert.ok(state.altitude > 60);
  assert.equal(state.flying, true);
  assert.ok(movementSpeed({ flying: true, action: "explore" }) > movementSpeed({ flying: false, action: "explore" }) * 6);
  assert.ok(movementSpeed({ flying: false, action: "explore" }) >= 90);
  assert.ok(movementSpeed({ flying: true, action: "explore" }) <= 650);
});

test("exhaustion forces landing", () => {
  const next = updateFlightState({ altitude: 50 }, { dt: 0.5, command: "takeoff", stamina: 0.02 });
  assert.ok(next.altitude < 50);
  assert.equal(next.phase, "landing");
});

test("altitude determines whether an obstacle can be crossed", () => {
  assert.equal(canClearObstacle(20, 30), false);
  assert.equal(canClearObstacle(55, 30), true);
});

test("ground fighter autonomously selects a continuous pace from intent and condition", () => {
  const guard = selectGroundCombatPace({ mode: "groundGuard", stamina: 0.8, neuralDrive: 0.45 });
  const chase = selectGroundCombatPace({ mode: "chase", stamina: 0.8, neuralDrive: 0.45 });
  const tiredChase = selectGroundCombatPace({ mode: "chase", stamina: 0.22, fatigue: 0.82, pain: 0.35, legInjury: 0.25, neuralDrive: 0.45 });
  const hold = selectGroundCombatPace({ mode: "hold", stamina: 1 });
  assert.ok(guard.desiredSpeed > 0 && guard.desiredSpeed < chase.desiredSpeed);
  assert.ok(tiredChase.desiredSpeed < chase.desiredSpeed);
  assert.ok(tiredChase.maxSpeed < chase.maxSpeed);
  assert.equal(hold.desiredSpeed, 0);
  assert.equal(hold.tier, "idle");
});

test("dodge is a short higher-speed tier with near-instant acceleration", () => {
  const normal = selectGroundCombatPace({ mode: "reflexDodge", stamina: 0.9, dodging: false });
  const burst = selectGroundCombatPace({ mode: "reflexDodge", stamina: 0.9, dodging: true });
  assert.equal(burst.tier, "dodge-burst");
  assert.ok(burst.maxSpeed > normal.maxSpeed);
  assert.ok(burst.desiredSpeed > normal.desiredSpeed);

  const state = { speed: 300, angle: 0, moveAngle: 0, altitude: 0, verticalSpeed: 0 };
  const ordinary = updateGroundLocomotion(state, { desiredSpeed: 1100, maxSpeed: 1200, desiredAngle: 0 }, 1 / 30);
  const dodging = updateGroundLocomotion(state, { desiredSpeed: 1100, maxSpeed: 1400, desiredAngle: 0, dodge: true }, 1 / 30);
  assert.ok(dodging.speed - state.speed > (ordinary.speed - state.speed) * 2.5);
});
