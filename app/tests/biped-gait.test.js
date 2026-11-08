import assert from "node:assert/strict";
import test from "node:test";
import { directionalGait } from "../src/biped-gait.js";

test("directional gait distinguishes forward, backward, left and right", () => {
  assert.equal(directionalGait(0, 700).state, "run");
  assert.equal(directionalGait(Math.PI, 700).state, "backpedal");
  assert.equal(directionalGait(Math.PI / 2, 700).state, "strafe-right");
  assert.equal(directionalGait(-Math.PI / 2, 700).state, "strafe-left");
});

test("diagonal travel retains both sagittal and lateral gait weights", () => {
  const forwardRight = directionalGait(Math.PI / 4, 700);
  const backwardLeft = directionalGait(-Math.PI * 0.75, 700);
  assert.ok(forwardRight.forward > 0.65 && forwardRight.lateral > 0.65);
  assert.ok(backwardLeft.backward > 0.65 && backwardLeft.lateral > 0.65);
  assert.equal(backwardLeft.lateralDirection, -1);
});

test("low speed movement still preserves its travel direction", () => {
  assert.equal(directionalGait(0, 180).state, "walk");
  assert.equal(directionalGait(Math.PI, 180).state, "backpedal");
  assert.equal(directionalGait(-Math.PI / 2, 180).state, "strafe-left");
});
