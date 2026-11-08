import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { SPECIES, SPECIES_BY_ID } from "../src/collection.js";
import { ELEMENTS } from "../src/skills.js";

// Read-only diagnostics plus real UI actions, in a fresh isolated context.
// No camera permissions, storage injection, source rewriting or forced wins.
const url = process.env.SPIRIT_TEST_URL || "http://127.0.0.1:4173/";
const storageKey = "digitalFlySpiritCollectionV1";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [], results = [];
const deadline = Date.now() + 110000;
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
const read = () => page.evaluate(() => window.spiritLabDiagnostics());
const stored = () => page.evaluate((key) => localStorage.getItem(key), storageKey);
const storedObject = async () => JSON.parse(await stored());
const active = (collection) => collection.records.find((record) => record.id === collection.activeId);
const nav = async (tab) => {
  assert(Date.now() < deadline, "Smoke wall-time budget exceeded");
  await page.click(`[data-workspace-tab="${tab}"]`);
};
const progress = (saved) => ({
  activeId: saved.activeId, unlocked: saved.unlocked, resources: saved.resources,
  records: saved.records.map(({ id, speciesId, xp, level, bond, training, trainingLoad, battles, wins, nickname }) => ({ id, speciesId, xp, level, bond, training, trainingLoad, battles, wins, nickname })),
});

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 25000 });
  await page.waitForFunction(() => typeof window.spiritLabDiagnostics === "function", null, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll(".species-card").length > 0);
  const initial = await read();
  assert.equal(initial.developer.enabled, true);
  assert.equal(initial.developer.previewId, null);
  assert(await page.locator("#developerMode").isChecked());
  assert.equal(await page.locator("#quickStopDuel").count(), 1, "Quick stop must not have duplicate IDs");
  assert.equal(await page.locator(".species-card").count(), SPECIES.length);
  assert.equal(Object.keys(ELEMENTS).length, 18);
  for (const id of ["creatureElement", "enemyElement", "duelPlayerElement", "duelRivalElement"]) assert.equal(await page.locator(`#${id} option`).count(), 18);
  assert.equal(await page.locator("#collectionElementFilter option").count(), 19);
  assert.equal(await page.locator("#attributeChart tbody td").count(), 18 * 18);
  results.push({ check: "default-developer-mode-and-dynamic-attributes", forms: SPECIES.length, elements: 18 });

  await nav("collection");
  const original = await storedObject();
  const originalActive = active(original);
  assert(originalActive && !originalActive.developerPreview);
  const family = SPECIES_BY_ID[originalActive.speciesId].familyId;
  const line = SPECIES.filter((species) => species.familyId === family).sort((a, b) => a.stage - b.stage);
  assert.equal(line.length, 3);
  let frozenStorage;
  for (const species of line) {
    await page.click(`[data-preview-species="${species.id}"]`);
    await page.waitForFunction((id) => window.spiritLabDiagnostics().developer.previewId === id, species.id);
    const state = await read();
    assert.equal(state.player.bodyType, species.bodyType);
    assert(state.player.dimensions.every(Number.isFinite));
    assert.match(await page.locator("#developerPreviewStatus").textContent(), /不写入|不存档/);
    assert(await page.locator('[data-cultivate="feed"]').isDisabled());
    assert(await page.locator("#evolveSpirit").isDisabled());
    assert.match(await page.locator("#worldSpeciesSelect option:checked").textContent(), /开发预览/);
    const actualStorage = await stored();
    frozenStorage ??= actualStorage;
    assert.equal(actualStorage, frozenStorage, "Preview must not overwrite real biology, memory, resources or progression");
    assert.deepEqual(progress(JSON.parse(actualStorage)), progress(original));
    assert(!JSON.parse(actualStorage).records.some((record) => record.developerPreview));
    results.push({ check: "transient-preview", species: species.id, stage: species.stage });
  }
  const unowned = SPECIES.find((species) => species.stage === 2 && !original.records.some((record) => SPECIES_BY_ID[record.speciesId].familyId === species.familyId));
  assert(unowned);
  await page.click(`[data-preview-species="${unowned.id}"]`);
  await page.waitForFunction((id) => window.spiritLabDiagnostics().developer.previewId === id, unowned.id);
  assert.equal(await stored(), frozenStorage, "An unowned final form must remain a disposable preview");
  await page.click("#exitDeveloperPreview");
  await page.waitForFunction(() => window.spiritLabDiagnostics().developer.previewId === null);
  assert.deepEqual(progress(await storedObject()), progress(original));
  assert.equal(active((await read()).collection).id, originalActive.id);
  await page.uncheck("#developerMode");
  assert.equal((await read()).developer.enabled, false);
  assert.equal(await page.locator("[data-preview-species]").count(), 0);
  const lockedFuture = line.find((species) => species.stage > SPECIES_BY_ID[originalActive.speciesId].stage);
  if (lockedFuture) assert(await page.locator(`[data-collection-species="${lockedFuture.id}"]`).isDisabled(), "Normal evolution guard remains intact");
  await page.check("#developerMode");
  results.push({ check: "preview-exit-and-regular-progression-guards", unlockedUnowned: false });

  await nav("duel");
  const beforeBattle = progress(await storedObject());
  await page.selectOption("#rivalSpeciesSelect", "storm-rabbit-base");
  await page.click("#startDuel");
  await page.waitForFunction(() => window.spiritLabDiagnostics().battle.active);
  assert(await page.locator("#stopDuel").isEnabled());
  assert(await page.locator("#quickStopDuel").isEnabled());
  // Cancellation need not wait for damage; it must remove existing projectiles
  // and aiming state regardless of when the player changes their mind.
  await page.waitForTimeout(600);
  await page.click("#stopDuel");
  await page.waitForFunction(() => !window.spiritLabDiagnostics().battle.active);
  const cancelled = await read();
  assert.equal(cancelled.battle.result, "cancelled");
  assert.equal(cancelled.battle.pendingAttacks, 0);
  assert.deepEqual(cancelled.battle.aiming, [null, null]);
  assert.equal(cancelled.renderer.activeEffects, 0);
  assert.deepEqual(progress(await storedObject()), beforeBattle, "Cancel must not award XP, wins, materials or currency");
  assert(await page.locator("#quickStopDuel").isDisabled());
  assert(await page.locator("#playerSpeciesSelect").isEnabled());
  const another = cancelled.collection.records.find((record) => record.id !== cancelled.collection.activeId && !record.developerPreview);
  assert(another);
  await page.selectOption("#playerSpeciesSelect", another.id);
  assert.equal(active((await read()).collection).id, another.id);
  await page.click("#startDuel");
  await page.waitForFunction(() => window.spiritLabDiagnostics().battle.active);
  await page.click("#quickStopDuel");
  assert.equal((await read()).battle.result, "cancelled");
  assert.equal((await read()).battle.pendingAttacks, 0);
  results.push({ check: "both-stop-controls-cancel-without-reward", switchedTo: another.id });

  await nav("interaction");
  assert(await page.locator("#cameraPlaceholder").isVisible());
  for (const [action, id] of [["roll", "roll"], ["tilt", "curious"], ["blink", "blinkBack"]]) {
    await page.click(`[data-social-action="${action}"]`);
    await page.waitForFunction((reaction) => window.spiritLabDiagnostics().social.reaction === reaction, id);
    const state = await read();
    if (action === "roll") assert.equal(state.social.locked, true, "Rolling must prevent normal locomotion");
    assert(state.player.dimensions.every(Number.isFinite));
    assert.equal(await page.locator("#interactionVideo").evaluate((video) => video.srcObject), null, "Manual reactions must not request a camera");
    results.push({ check: "manual-social-without-camera", action, reaction: id });
  }

  await nav("arena");
  await page.check("#robotControlToggle");
  await page.click("#robotHome");
  await page.waitForFunction(() => !window.spiritLabDiagnostics().robot.homeTarget, null, { timeout: 8000 });
  const robotStart = (await read()).robot;
  await page.keyboard.press("Escape");
  await page.locator("#arena3d").click({ position: { x: 40, y: 180 } });
  for (const key of ["w", "d"]) {
    const before = (await read()).robot;
    await page.keyboard.down(key);
    try {
      await page.waitForFunction((previous) => {
        const robot = window.spiritLabDiagnostics().robot;
        return Math.hypot(robot.x - previous.x, robot.y - previous.y) > 8;
      }, before, { timeout: 3500 });
    } finally { await page.keyboard.up(key); }
  }
  await page.waitForFunction(() => window.spiritLabDiagnostics().robot.speed < 1, null, { timeout: 2500 });
  const robotAfter = (await read()).robot;
  assert(Math.hypot(robotAfter.x - robotStart.x, robotAfter.y - robotStart.y) > 8);
  assert([robotAfter.x, robotAfter.y, robotAfter.angle, robotAfter.speed, robotAfter.reception.x, robotAfter.reception.y].every(Number.isFinite));
  assert.equal(robotAfter.speed, 0);
  await page.click("#robotCallCompanion");
  await page.click("#robotFollowCamera");
  await page.click("#robotHome");
  await page.waitForFunction((start) => {
    const robot = window.spiritLabDiagnostics().robot;
    return !robot.homeTarget && Math.hypot(robot.x - start.x, robot.y - start.y) < 20;
  }, robotStart, { timeout: 8000 });
  const home = (await read()).robot;
  assert(Math.hypot(home.x - robotStart.x, home.y - robotStart.y) < 20);
  results.push({ check: "robot-keyboard-stop-follow-call-home", start: robotStart, moved: robotAfter, home });

  for (const width of [1280, 820, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(120);
    const layout = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
    assert(layout.document <= width + 2, `Horizontal overflow at ${width}: ${layout.document}`);
  }
  assert(Date.now() < deadline, "Smoke wall-time budget exceeded");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ url, softwareGpu: true, forms: SPECIES.length, elements: Object.keys(ELEMENTS).length, results, errors }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, errors, diagnostics: await read().catch(() => null), log: await page.locator("#eventLog").textContent().catch(() => "") }));
  await page.screenshot({ path: "../artifacts/v4-ui-failure.png", fullPage: false }).catch(() => {});
  throw error;
} finally {
  for (const key of ["w", "a", "s", "d"]) await page.keyboard.up(key).catch(() => {});
  await context.close();
  await browser.close();
}
