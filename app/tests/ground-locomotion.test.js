import assert from "node:assert/strict";
import test from "node:test";
import { updateGroundLocomotion, wrappedDelta } from "../src/ground-locomotion.js";

test("biped sprint accelerates instead of snapping to maximum speed", () => {
  const next = updateGroundLocomotion({ speed: 0, angle: 0, altitude: 0, verticalSpeed: 0 }, { desiredSpeed: 460, desiredAngle: 0, maxSpeed: 470, stamina: 1 }, 0.1);
  assert.ok(next.speed > 240 && next.speed < 300);
});

test("high speed biped turns with inertia", () => {
  const next = updateGroundLocomotion({ speed: 450, angle: 0, altitude: 0, verticalSpeed: 0 }, { desiredSpeed: 450, desiredAngle: Math.PI, maxSpeed: 470, stamina: 1 }, 0.1);
  assert.ok(Math.abs(wrappedDelta(next.angle, 0)) < 0.35);
});

test("jump has a ballistic arc and returns to the floor", () => {
  let state = updateGroundLocomotion({ speed: 180, angle: 0, altitude: 0, verticalSpeed: 0 }, { desiredSpeed: 180, desiredAngle: 0, jump: true, stamina: 1 }, 1 / 30);
  assert.equal(state.jumped, true);
  assert.ok(state.altitude > 0);
  for (let i = 0; i < 90; i += 1) state = updateGroundLocomotion(state, { desiredSpeed: 180, desiredAngle: 0, stamina: 1 }, 1 / 30);
  assert.equal(state.altitude, 0);
  assert.equal(state.verticalSpeed, 0);
});

test("charged pounce preserves a fast forward impulse while airborne", () => {
  const launched = updateGroundLocomotion(
    { speed: 140, angle: 0, altitude: 0, verticalSpeed: 0 },
    { desiredSpeed: 35, desiredAngle: 0.25, jump: true, jumpSpeed: 575, impulseSpeed: 850, maxSpeed: 900, stamina: 1 },
    1 / 60,
  );
  assert.equal(launched.jumped, true);
  assert.ok(launched.speed >= 850);
  assert.ok(launched.altitude > 0);
  const airborne = updateGroundLocomotion(launched, { desiredSpeed: 820, desiredAngle: Math.PI, maxSpeed: 820, stamina: 1 }, 0.1);
  assert.equal(airborne.angle, launched.angle, "wingless airborne body must keep its take-off heading");
  assert.equal(airborne.moveAngle, launched.moveAngle, "airborne travel direction must remain locked");
});

test("wingless biped cannot steer or spin itself in mid-air", () => {
  const airborne = updateGroundLocomotion(
    { speed: 900, angle: 0.35, moveAngle: 0.35, altitude: 80, verticalSpeed: 120 },
    { desiredSpeed: 900, desiredAngle: -2.4, maxSpeed: 1000, dodge: true, stamina: 1 },
    0.2,
  );
  assert.equal(airborne.angle, 0.35);
  assert.equal(airborne.moveAngle, 0.35);
});

test("ordinary jump carries the current running momentum", () => {
  const launched = updateGroundLocomotion(
    { speed: 760, angle: 0.1, altitude: 0, verticalSpeed: 0 },
    { desiredSpeed: 760, desiredAngle: 0.1, jump: true, jumpSpeed: 500, maxSpeed: 1000, stamina: 0.7 },
    1 / 60,
  );
  assert.equal(launched.jumped, true);
  assert.ok(launched.speed >= 750, `run-up was lost: ${launched.speed}`);
  assert.ok(launched.altitude > 0);
});

test("corrupted or over-amplified speed is hard-clamped in one frame", () => {
  const next = updateGroundLocomotion(
    { speed: 120000, angle: 0, altitude: 0, verticalSpeed: 0 },
    { desiredSpeed: 1500, desiredAngle: 0, maxSpeed: 2100, stamina: 1 },
    1 / 60,
  );
  assert.ok(Number.isFinite(next.speed));
  assert.ok(next.speed <= 2100, `speed escaped hard cap: ${next.speed}`);
});
