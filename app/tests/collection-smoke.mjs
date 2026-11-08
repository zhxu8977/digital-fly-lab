import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { SPECIES } from "../src/collection.js";

// This long-running progression regression deliberately adopts the original
// 18-family sample, not every future addition to the dex. Expanding the catalog
// must not silently spend more than the normal starter budget allows.
const PROGRESSION_SAMPLE_FAMILY_IDS = [
  "ember-dragon", "storm-rabbit", "amber-corgi", "mint-cat", "cloud-bird", "pearl-moth",
  "tide-turtle", "frost-penguin", "cinder-fox", "forest-deer", "moss-shroom", "stone-bear",
  "spark-hamster", "lagoon-otter", "dusk-bat", "sun-lion", "opal-golem", "breeze-sheep",
];
const shapeSample = SPECIES.filter((item) => item.stage === 0 && PROGRESSION_SAMPLE_FAMILY_IDS.includes(item.familyId));
assert.equal(shapeSample.length, PROGRESSION_SAMPLE_FAMILY_IDS.length, "Every named progression sample family must exist");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [], reports = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
const read = () => page.evaluate(() => window.spiritLabDiagnostics());
const active = (state) => state.collection.records.find((record) => record.id === state.collection.activeId);
const nav = (tab) => page.click(`[data-workspace-tab="${tab}"]`);
const train = (kind) => page.click(`[data-cultivate="${kind}"]`);
try {
  await page.goto(process.env.SPIRIT_TEST_URL || "http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.spiritLabDiagnostics === "function");
  await page.waitForFunction(() => window.spiritLabDiagnostics().player.animatedAsset);
  const initial = await read();
  assert.equal(initial.collection.records.length, 4);
  assert(initial.player.bones > 10, "A real skeletal model must be loaded, not just a painted fallback");
  assert(await page.locator("#collectionPanel").isHidden(), "Initial route should not show every page at once");
  await nav("collection");
  assert.equal(await page.locator(".species-card").count(), SPECIES.length);
  await page.selectOption("#collectionElementFilter", "water");
  assert.equal(await page.locator(".species-card").count(), SPECIES.filter((item) => item.element === "water").length);
  await page.selectOption("#collectionElementFilter", "all");
  await page.fill("#collectionSearch", "烛尾龙");
  assert.equal(await page.locator(".species-card").count(), 1);
  await page.fill("#collectionSearch", "");
  const firstId = initial.collection.activeId;
  const beforeStats = initial.battle.playerProfile;
  await train("play"); await train("play"); await train("play"); await train("feed");
  let current = await read();
  assert(active(current).level >= 3); assert(active(current).bond >= 35);
  assert(await page.locator("#evolveSpirit").isEnabled());
  const memoryBefore = active(current).memory;
  await page.click("#evolveSpirit");
  current = await read(); assert.equal(active(current).speciesId, "ember-dragon-grown");
  assert.equal(current.collection.activeId, firstId);
  assert.deepEqual(active(current).memory, memoryBefore, "Evolution must preserve learned memory");
  assert(current.battle.playerProfile.health > beforeStats.health);
  const beforeAdopt = current.collection.records.length;
  await page.click('[data-collection-species="ember-dragon-base"]');
  assert.equal((await read()).collection.records.length, beforeAdopt, "An evolved family must not be adopted again from its base card");
  for (let index = 0; index < 12; index++) { if (index % 3 === 0) await train("rest"); await train("power"); }
  current = await read(); assert(active(current).level >= 7);
  await page.click("#evolveSpirit");
  assert.equal(active(await read()).speciesId, "ember-dragon-crown");
  await page.waitForFunction(() => window.spiritLabDiagnostics().player.animatedAsset);
  await page.screenshot({ path: "../artifacts/spirit-collection-evolution.png", fullPage: false });
  const afterEvolution = await read();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.spiritLabDiagnostics === "function");
  assert.equal(active(await read()).speciesId, "ember-dragon-crown");
  assert.equal(active(await read()).xp, active(afterEvolution).xp);
  await nav("collection");
  const records = (await read()).collection.records;
  const cat = records.find((record) => record.speciesId === "mint-cat-base");
  await page.selectOption("#worldSpeciesSelect", cat.id);
  assert.equal(active(await read()).xp, 0, "Another individual must not inherit experience");
  assert.equal(active(await read()).training.power, 0);
  await train("feed"); assert.equal(active(await read()).xp, 24);
  await page.selectOption("#worldSpeciesSelect", firstId);
  assert.equal(active(await read()).xp, active(afterEvolution).xp);
  const beforeShapeSample = await read();
  const ownedFamilies = new Set(beforeShapeSample.collection.records.map((record) => SPECIES.find((item) => item.id === record.speciesId).familyId));
  const missingSampleFamilies = shapeSample.filter((species) => !ownedFamilies.has(species.familyId));
  const expectedOwnedAfterSample = beforeShapeSample.collection.records.length + missingSampleFamilies.length;
  assert(beforeShapeSample.collection.resources.coins >= missingSampleFamilies.length * 85,
    "The named 18-family progression sample must remain affordable without injecting currency");
  const shapeChecks = [];
  for (const species of shapeSample) {
    await page.click(`[data-collection-species="${species.id}"]`);
    await page.waitForTimeout(220);
    const sample = await read();
    assert.equal(SPECIES.find((item) => item.id === active(sample).speciesId).familyId, species.familyId);
    assert.equal(sample.player.bodyType, species.bodyType);
    assert(sample.player.dimensions.every(Number.isFinite));
    shapeChecks.push({ family: species.familyId, bodyType: sample.player.bodyType, animated: sample.player.animatedAsset, bones: sample.player.bones });
  }
  assert.equal((await read()).collection.records.length, expectedOwnedAfterSample);
  assert((await read()).collection.resources.coins >= 0);
  await page.selectOption("#worldSpeciesSelect", firstId);
  await nav("duel");
  await page.selectOption("#rivalSpeciesSelect", "storm-rabbit-base");
  await page.click("#startDuel");
  assert((await read()).battle.active);
  assert(await page.locator("#playerSpeciesSelect").isDisabled());
  await page.waitForFunction(() => {
    const state = window.spiritLabDiagnostics();
    return state.battle.playerHp < state.battle.playerProfile.health || state.battle.rivalHp < state.battle.rivalProfile.health;
  }, null, { timeout: 40000 });
  const fighting = await read();
  assert(Number.isFinite(fighting.battle.speed));
  assert(fighting.battle.speed < 1500 && fighting.battle.enemySpeed < 1500, "Progression must not create runaway movement");
  await page.screenshot({ path: "../artifacts/spirit-collection-battle.png", fullPage: false });
  // Watch the normal outcome rather than forcing a state transition.
  await page.waitForFunction(() => !window.spiritLabDiagnostics().battle.active, null, { timeout: 135000 });
  const completed = await read();
  assert(active(completed).battles >= 1);
  assert(active(completed).xp >= active(afterEvolution).xp);
  const rewards = active(completed).battles;
  await page.waitForTimeout(1500);
  assert.equal(active(await read()).battles, rewards, "Battle must be awarded exactly once");
  await nav("collection");
  await page.locator("#collectionGrid").evaluate((node) => { node.scrollTop = 0; });
  await page.screenshot({ path: "../artifacts/spirit-collection-desktop.png", fullPage: false });
  for (const width of [1055, 820, 430]) {
    await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(200);
    const layout = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
    assert(layout.document <= width + 2, `Horizontal overflow at ${width}: ${layout.document}`);
    reports.push({ viewport: width, document: layout.document });
  }
  await page.screenshot({ path: "../artifacts/spirit-collection-mobile.png", fullPage: false });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ cards: SPECIES.length, availableFamilies: new Set(SPECIES.map((item) => item.familyId)).size, sampledFamilies: PROGRESSION_SAMPLE_FAMILY_IDS, persistentEvolution: "ember-dragon-crown", battle: completed.battle.result, owned: completed.collection.records.length, shapeChecks, responsive: reports, errors }, null, 2));
} catch (error) {
  const diagnostics = await read().catch(() => null);
  console.error(JSON.stringify({ errors, active: diagnostics && active(diagnostics), battle: diagnostics?.battle, renderer: diagnostics?.renderer, log: await page.locator("#eventLog").textContent().catch(() => "") }));
  await page.screenshot({ path: "../artifacts/spirit-collection-failure.png", fullPage: false }).catch(() => {});
  throw error;
} finally { await browser.close(); }
