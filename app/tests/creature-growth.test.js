import test from "node:test";
import assert from "node:assert/strict";
import { evolutionVisualProfile, evolutionSilhouetteSignature, socialExpressionPose } from "../src/creature-growth.js";

test("every evolution changes silhouette topology and proportions", () => {
  for (const silhouette of ["dragon", "rabbit", "dog", "cat", "bird", "moth", "turtle", "penguin", "fox", "deer", "shroom", "bear", "hamster", "otter", "bat", "lion", "golem", "sheep"]) {
    const stages = [0, 1, 2].map((stage) => ({ stage, assetHint: { silhouette } }));
    assert.equal(new Set(stages.map(evolutionSilhouetteSignature)).size, 3);
    const [cub, grown, final] = stages.map(evolutionVisualProfile);
    assert(cub.headScale > grown.headScale && grown.headScale > final.headScale);
    assert(cub.plumeCount < grown.plumeCount && grown.plumeCount < final.plumeCount);
    assert(grown.tailFanCount < final.tailFanCount);
  }
});

test("malformed visual settings cannot inflate a creature without bounds", () => {
  const p = evolutionVisualProfile({ stage: 99, visualSize: Infinity, evolutionVisual: { headScale: 1000, crestScale: -4, wingScale: Infinity } });
  assert.equal(p.stage, 2);
  assert.equal(p.size, 1);
  assert.equal(p.headScale, 1.23);
  assert.equal(p.crestScale, 0.08);
  assert(p.wingScale <= 1.3);
});

test("rolling locks locomotion while the visual pose is bounded and returns upright", () => {
  assert(socialExpressionPose({ reaction: "roll", progress: 0.5 }).movementLocked);
  for (const progress of [0, 1]) {
    const pose = socialExpressionPose({ reaction: "roll", progress });
    assert(Math.abs(pose.bodyRoll) < 1e-12);
    assert(Math.abs(pose.squash) < 1e-12);
  }
  for (let frame = 0; frame <= 100; frame++) {
    const pose = socialExpressionPose({ reaction: "roll", progress: frame / 100 });
    assert(Math.abs(pose.bodyRoll) <= Math.PI * 2);
  }
});

test("curiosity, affection and blink have different expressive channels", () => {
  assert(socialExpressionPose({ reaction: "curious", progress: 0.5 }).headTilt > 0.3);
  assert(socialExpressionPose({ reaction: "rub", progress: 0.5 }).smile > 0.9);
  assert(socialExpressionPose({ reaction: "rub", progress: 0.5 }).blush > 0.5);
  assert(socialExpressionPose({ reaction: "blinkBack", progress: 0.125 }).blink > 0.9);
  assert.equal(socialExpressionPose({ reaction: null }).movementLocked, false);
});
