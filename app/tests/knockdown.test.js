import assert from "node:assert/strict";
import test from "node:test";
import { knockdownDuration, knockdownGroundClearance, quadrupedKnockdownPose, shouldKnockDown, timedKnockdownState } from "../src/knockdown.js";

test("all ground body types can be knocked down while aerial bodies cannot", () => {
  assert.equal(shouldKnockDown("corgi", 0.8, "recoil"), true);
  assert.equal(shouldKnockDown("biped", 0.95, "recoil"), true);
  assert.equal(shouldKnockDown("cat", 0.82, "recoil"), true);
  assert.equal(shouldKnockDown("biped", 0.4, "launch"), true);
  assert.equal(shouldKnockDown("aerial", 1.3, "launch"), false);
  assert.equal(shouldKnockDown("biped", 0.4, "burn"), false);
});

test("knockdown has falling, down, get-up and unlocked phases", () => {
  const duration = knockdownDuration(1, "tumble");
  assert.equal(timedKnockdownState(0.1, 0, duration).state, "falling");
  assert.equal(timedKnockdownState(duration * 0.5, 0, duration).state, "down");
  assert.equal(timedKnockdownState(duration * 0.85, 0, duration).state, "getting-up");
  assert.deepEqual(timedKnockdownState(duration, 0, duration), { state: "active", down: 0, locked: false });
});

test("a lightly knocked-down cat recovers much faster than a tall biped", () => {
  const catDuration = knockdownDuration(0.58, "launch", "cat");
  const bipedDuration = knockdownDuration(0.58, "launch", "biped");
  assert.ok(catDuration <= 0.75);
  assert.ok(catDuration < bipedDuration * 0.7);
  assert.equal(shouldKnockDown("cat", 0.4, "launch"), false);
});

test("scaled corgi, quadruped cat and tall biped receive enough floor clearance when down", () => {
  assert.ok(knockdownGroundClearance("corgi", 1, 1, true) >= 84);
  assert.ok(knockdownGroundClearance("cat", 1, 1, true) >= 64);
  assert.ok(knockdownGroundClearance("biped", 1, 1, false) >= 70);
  assert.equal(knockdownGroundClearance("aerial", 1, 1, false), 0);
});

test("quadruped impacts cannot rotate the long spine upright", () => {
  const frontal = quadrupedKnockdownPose(0, 1.3, 1, 1);
  const rear = quadrupedKnockdownPose(Math.PI, 1.3, 1, -1);
  const side = quadrupedKnockdownPose(Math.PI / 2, 1.1, 1, 1);
  assert.ok(Math.abs(frontal.pitch) < 0.5);
  assert.ok(Math.abs(rear.pitch) < 0.5);
  assert.ok(Math.abs(frontal.roll) > 0.2, "a strong frontal impact should spill onto a flank");
  assert.ok(Math.abs(side.roll) > Math.abs(side.pitch), "a side impact should roll rather than rear the cat upright");
  assert.ok(Math.abs(side.roll) < Math.PI / 2);
});
