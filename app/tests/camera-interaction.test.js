import assert from "node:assert/strict";
import test from "node:test";
import { CAMERA_GESTURES, SOCIAL_ACTIONS, ReactionDebouncer, selectCameraReaction, selectManualReaction } from "../src/camera-interaction.js";
import { readFileSync } from "node:fs";

test("stable recognized hand gestures map to distinct cute reactions", () => {
  assert.deepEqual(["greeting", "come"], [selectCameraReaction({ gesture: "Open_Palm", gestureScore: 0.9 })?.id, selectCameraReaction({ gesture: "Open_Palm", gestureScore: 0.9 })?.command]);
  assert.deepEqual(["proud", "praise"], [selectCameraReaction({ gesture: "Thumb_Up", gestureScore: 0.9 })?.id, selectCameraReaction({ gesture: "Thumb_Up", gestureScore: 0.9 })?.command]);
  assert.deepEqual(["celebrate", "perform"], [selectCameraReaction({ gesture: "Victory", gestureScore: 0.9 })?.id, selectCameraReaction({ gesture: "Victory", gestureScore: 0.9 })?.command]);
  assert.deepEqual(["settle", "stay"], [selectCameraReaction({ gesture: "Closed_Fist", gestureScore: 0.9 })?.id, selectCameraReaction({ gesture: "Closed_Fist", gestureScore: 0.9 })?.command]);
  assert.equal(selectCameraReaction({ gesture: "Pointing_Up", gestureScore: 0.9 })?.command, "walk");
  assert.equal(selectCameraReaction({ gesture: "Thumb_Down", gestureScore: 0.9 })?.command, "eat");
});

test("weak classifications do not trigger actions", () => {
  assert.equal(selectCameraReaction({ gesture: "Victory", gestureScore: 0.31 }), null);
});

test("face blendshapes distinguish smile blink and surprise", () => {
  const categories = (values) => Object.entries(values).map(([categoryName, score]) => ({ categoryName, score }));
  assert.equal(selectCameraReaction({ faceDetected: true, blendshapes: categories({ mouthSmileLeft: 0.8, mouthSmileRight: 0.7 }) })?.id, "happy");
  assert.equal(selectCameraReaction({ faceDetected: true, blendshapes: categories({ eyeBlinkLeft: 0.8, eyeBlinkRight: 0.75 }) })?.id, "blinkBack");
  assert.equal(selectCameraReaction({ faceDetected: true, blendshapes: categories({ jawOpen: 0.85, browInnerUp: 0.4 }) })?.id, "surprise");
});

test("the eight no-camera actions have safe, distinct expression contracts", () => {
  const expected = { greet: "greeting", roll: "roll", rub: "rub", tilt: "curious", blink: "blinkBack", smile: "happy", eat: "seekFood", rest: "settle" };
  assert.deepEqual(Object.keys(SOCIAL_ACTIONS).sort(), Object.keys(expected).sort());
  for (const [action, id] of Object.entries(expected)) {
    const reaction = selectManualReaction(action);
    assert.equal(reaction.id, id);
    assert.equal(reaction.source, "manual");
    assert.equal(reaction.confidence, 1);
    assert(reaction.duration >= 1.5 && reaction.duration <= 3);
    assert(reaction.label && reaction.response && reaction.emoji);
  }
  assert.equal(selectManualReaction("roll").movementLocked, true);
  assert.equal(selectManualReaction("rest").movementLocked, true);
  assert.equal(selectManualReaction("eat").command, "eat");
  assert.equal(selectManualReaction("blink").command, undefined, "A facial expression must not force walking");
  assert.equal(selectManualReaction("unknown"), null);
  assert.equal(selectManualReaction("toString"), null);
  const copy = selectManualReaction("smile"); copy.id = "invalid";
  assert.equal(selectManualReaction("smile").id, "happy");
});

test("camera mappings claim only the seven MediaPipe supported static gestures", () => {
  assert.deepEqual(Object.keys(CAMERA_GESTURES).sort(), ["Closed_Fist", "Open_Palm", "Pointing_Up", "Thumb_Down", "Thumb_Up", "Victory", "ILoveYou"].sort());
  for (const gesture of Object.keys(CAMERA_GESTURES)) {
    const reaction = selectCameraReaction({ gesture, gestureScore: 0.92 });
    assert.equal(reaction.source, "camera");
    assert.equal(reaction.confidence, 0.92);
  }
  assert.equal(selectCameraReaction({ gesture: "Wave", gestureScore: 1 }), null);
  assert.equal(selectCameraReaction({ gesture: "toString", gestureScore: 1 }), null);
  assert.equal(selectCameraReaction({ gesture: "Open_Palm", gestureScore: NaN }), null);
  assert.equal(selectCameraReaction({ faceDetected: true, blendshapes: [{ categoryName: "jawOpen", score: Infinity }] }), null);
});

test("blinking while smiling can still receive a blink response", () => {
  const values = { mouthSmileLeft: 0.9, mouthSmileRight: 0.8, eyeBlinkLeft: 0.8, eyeBlinkRight: 0.75 };
  assert.equal(selectCameraReaction({ faceDetected: true, blendshapes: Object.entries(values).map(([categoryName, score]) => ({ categoryName, score })) }).id, "blinkBack");
});

test("camera reactions require stability and do not repeat a continuously held pose", () => {
  const debounce = new ReactionDebouncer();
  const greeting = selectCameraReaction({ gesture: "Open_Palm", gestureScore: 0.9 });
  assert.equal(debounce.update(greeting, 0), null);
  assert.equal(debounce.update(greeting, 40), null);
  assert.equal(debounce.update(greeting, 80), greeting, "First recognition should not need a 2.4s startup delay");
  for (let time = 120; time < 7000; time += 40) assert.equal(debounce.update(greeting, time), null);
  for (let count = 0; count < 5; count++) assert.equal(debounce.update(null, 7100 + count * 40), null);
  assert.equal(debounce.update(greeting, 7340), null);
  assert.equal(debounce.update(greeting, 7380), null);
  assert.equal(debounce.update(greeting, 7420), greeting);
});

test("different camera poses respect shared cooldown and unstable input is rejected", () => {
  const debounce = new ReactionDebouncer();
  const first = { id: "greeting" }, second = { id: "proud" };
  for (const time of [0, 40]) assert.equal(debounce.update(first, time), null);
  assert.equal(debounce.update(first, 80), first);
  for (const time of [120, 160, 200, 400]) assert.equal(debounce.update(second, time), null);
  assert.equal(debounce.update(second, 2480), second);
  assert.equal(debounce.update(first, NaN), null);
  debounce.reset();
  for (let index = 0; index < 20; index++) assert.equal(debounce.update(index % 2 ? first : second, index * 40), null);
});

test("all V4 manual controls are present in the page without enabling a camera", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const action of Object.keys(SOCIAL_ACTIONS)) assert(html.includes(`data-social-action="${action}"`));
  for (const id of ["developerMode", "exitDeveloperPreview", "stopDuel", "quickStopDuel", "robotControlToggle", "robotCallCompanion", "robotFollowCamera", "robotHome", "attributeChart"]) {
    assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `Unique control ${id}`);
  }
  assert.match(html, /id="developerMode"[^>]*checked/);
  for (const direction of ["forward", "backward", "left", "right"]) assert(html.includes(`data-robot-move="${direction}"`));
  assert.match(html, /不是完整果蝇大脑/);
  assert.match(html, /本机人体识别/);
});
