import test from "node:test";
import assert from "node:assert/strict";
import { finishForaging, foodScentRange, updateForagingState } from "../src/foraging.js";

test("hunger and smell enlarge the food scent search radius", () => {
  assert.ok(foodScentRange({ smell: 1.2, hunger: 0.9 }) > foodScentRange({ smell: 0.6, hunger: 0.2 }));
});

test("foraging approaches, brakes, sniffs and tastes instead of overshooting", () => {
  const common = { hunger: 0.78, foodPriority: 0.76, smell: 1.05, hasFood: true };
  const tracking = updateForagingState({}, { ...common, now: 1, foodDistance: 620 });
  const approach = updateForagingState(tracking, { ...common, now: 2, foodDistance: 70 });
  const sniff = updateForagingState(approach, { ...common, now: 3, foodDistance: 18 });
  const taste = updateForagingState(sniff, { ...common, now: 3.7, foodDistance: 18 });
  assert.equal(tracking.stage, "tracking");
  assert.equal(approach.stage, "approaching");
  assert.ok(approach.speed < tracking.speed);
  assert.equal(sniff.stage, "sniffing");
  assert.equal(sniff.speed, 0);
  assert.equal(taste.stage, "tasting");
});

test("danger interrupts feeding and satiation creates a short cooldown", () => {
  const interrupted = updateForagingState({ stage: "tracking" }, { hunger: 0.9, foodPriority: 0.9, hasFood: true, foodDistance: 50, danger: 0.8 });
  assert.equal(interrupted.stage, "suspended");
  assert.equal(interrupted.active, false);
  const sated = finishForaging({ stage: "eating" }, { now: 5 });
  const cooldown = updateForagingState(sated, { now: 6, hunger: 0.7, foodPriority: 0.7, hasFood: true, foodDistance: 20 });
  assert.equal(cooldown.stage, "sated");
  assert.equal(cooldown.active, false);
});
