import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => localStorage.clear());
await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("#provenance")?.textContent.includes("male-cns:v1.0"));

await page.selectOption("#worldBodyPreview", "cat");
await page.click('[data-camera="side"]');
await page.click('[data-stimulus="sweet"]');
let maxHeadYaw = 0;
let observedMotion = false;
for (let frame = 0; frame < 18; frame += 1) {
  await page.waitForTimeout(120);
  const state = await page.locator("#playerBodyType").evaluate((element) => ({
    animation: element.dataset.animation || "",
    headYaw: Number(element.dataset.headYaw || 0),
    gaitForward: Number(element.dataset.gaitForward || 0),
    gaitLateral: Number(element.dataset.gaitLateral || 0),
  }));
  maxHeadYaw = Math.max(maxHeadYaw, Math.abs(state.headYaw));
  observedMotion ||= state.animation !== "idle" || Math.abs(state.gaitForward) > 0.05 || Math.abs(state.gaitLateral) > 0.05;
}

const catState = await page.locator("#playerBodyType").evaluate((element) => ({
  value: element.value,
  label: element.selectedOptions[0]?.textContent || "",
  rig: element.dataset.rig,
  joints: Number(element.dataset.joints || 0),
  patternMode: element.dataset.patternMode,
  controlLocked: element.dataset.controlLocked,
}));
await page.locator("#arena3d").screenshot({ path: "../artifacts/digital-fly-cat-preview.png" });

if (catState.value !== "cat" || !catState.label.includes("小猫")) throw new Error(`Cat preview did not activate: ${JSON.stringify(catState)}`);
if (catState.rig !== "procedural-articulated-quadruped" || catState.joints !== 8) throw new Error(`Four-leg rig was not initialized: ${JSON.stringify(catState)}`);
if (catState.patternMode !== "surface-painted") throw new Error(`Cat markings are not surface-painted: ${catState.patternMode}`);
if (catState.controlLocked !== "false") throw new Error(`Cat spawned with locomotion locked: ${catState.controlLocked}`);
if (!observedMotion) throw new Error("Cat did not enter a four-leg locomotion state");
if (maxHeadYaw < 0.02) throw new Error(`Independent cat head did not track a stimulus: ${maxHeadYaw}`);

await page.selectOption("#playerBodyType", "cat");
await page.selectOption("#rivalBodyType", "cat");
await page.selectOption("#duelPlayerPersonality", "brave");
await page.selectOption("#duelRivalPersonality", "cautious");
await page.click("#startDuel");
let rivalMovingFrames = 0;
let rivalFrozenLegFrames = 0;
for (let frame = 0; frame < 32; frame += 1) {
  await page.waitForTimeout(140);
  const rivalMotion = await page.locator("#rivalBodyType").evaluate((element) => ({
    speed: Number(element.dataset.actualSpeed || 0),
    animation: element.dataset.animation || "",
    locked: element.dataset.controlLocked === "true",
  }));
  if (rivalMotion.speed > 45 && !rivalMotion.locked) {
    rivalMovingFrames += 1;
    if (["idle", "ragdoll-down", "ragdoll-falling"].includes(rivalMotion.animation)) rivalFrozenLegFrames += 1;
  }
}
const duelNames = await Promise.all([
  page.locator("#duelPlayerName").textContent(),
  page.locator("#duelRivalName").textContent(),
]);
const strategyReadout = await page.locator("#duelStrategyReadout").textContent();
await page.locator("#arena3d").screenshot({ path: "../artifacts/digital-fly-cat-duel.png" });
if (!duelNames.every((name) => name.includes("四足软萌小猫"))) throw new Error(`Cat duel mesh did not activate for both fighters: ${duelNames.join(" / ")}`);
if (!strategyReadout.includes("勇猛型") || !strategyReadout.includes("谨慎型") || !strategyReadout.includes("战力比")) throw new Error(`Independent combat personalities were not explained: ${strategyReadout}`);
if (rivalMovingFrames < 2) throw new Error("Rival cat never produced measurable root movement");
if (rivalFrozenLegFrames > 0) throw new Error(`Rival cat moved with frozen legs for ${rivalFrozenLegFrames} sampled frames`);
if (errors.length) throw new Error(errors.join(" | "));

console.log(JSON.stringify({ catState, maxHeadYaw, observedMotion, duelNames, strategyReadout, rivalMovingFrames, rivalFrozenLegFrames, errors }));
await browser.close();
