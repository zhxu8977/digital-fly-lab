import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage(), errors = [], report = [];
page.setDefaultTimeout(12000);
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
const read = () => page.evaluate(() => window.spiritLabDiagnostics());
const nav = (tab) => page.click(`[data-workspace-tab="${tab}"]`);
const waitAsset = () => page.waitForFunction(() => window.spiritLabDiagnostics().player.animatedAsset);
try {
  await page.goto(process.env.SPIRIT_TEST_URL || "http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.spiritLabDiagnostics === "function");
  await nav("collection");
  const silhouettes = new Set();
  for (const stage of ["base", "grown", "crown"]) {
    await page.click(`[data-preview-species="ember-dragon-${stage}"]`);
    await waitAsset();
    await nav("arena");
    await page.click("#pauseButton");
    await page.waitForTimeout(180);
    const state = await read();
    assert(state.camera.subject.slice(0, 2).every((value) => Math.abs(value) < 0.6), `Developer preview must frame the model: ${JSON.stringify(state.camera)}`);
    assert(state.player.dimensions.every((value) => Number.isFinite(value) && value > 1));
    assert(state.player.silhouette, "The rendered model has stage geometry, not just a portrait");
    silhouettes.add(state.player.silhouette);
    await page.locator(".arena-stage").screenshot({ path: `../artifacts/v4-dragon-${stage}.png` });
    report.push({ stage, player: state.player });
    await page.click("#pauseButton");
    await nav("collection");
  }
  assert.equal(silhouettes.size, 3);
  await page.click('[data-preview-species="frost-lynx-grown"]');
  await page.waitForFunction(() => {
    const state = window.spiritLabDiagnostics();
    return state.developer.speciesId === "frost-lynx-grown" && state.player.silhouette;
  });
  await nav("duel");
  await page.selectOption("#rivalSpeciesSelect", "star-dragon-grown");
  await page.click("#startDuel");
  // Verify the actually-rendered new-element geometry, not a mocked renderer.
  await page.waitForFunction(() => window.spiritLabDiagnostics().renderer.effects.some((effect) => effect.id === "iceOrb" && effect.visual?.style === "ice"), null, { timeout: 22000 });
  const effects = (await read()).renderer.effects;
  for (const effect of effects) if (effect.visual) {
    assert(effect.visual.totalInstances <= 24);
    assert(effect.visual.additionalDrawCalls <= 4);
  }
  await page.locator(".arena-stage").screenshot({ path: "../artifacts/v4-element-battle.png" });
  await page.waitForFunction(() => window.spiritLabDiagnostics().battle.sinceStart > 13 || !window.spiritLabDiagnostics().battle.active, null, { timeout: 22000 });
  const battle = (await read()).battle;
  assert(battle.shots.every((count) => count > 0), "Both species must find a usable attack");
  assert([battle.playerHp, battle.rivalHp, battle.speed, battle.enemySpeed, battle.distance].every(Number.isFinite));
  assert(battle.speed < 1500 && battle.enemySpeed < 1500);
  report.push({ battle, effects });
  await page.click("#quickStopDuel");
  const stopped = await read();
  assert.equal(stopped.battle.pendingAttacks, 0);
  assert.equal(stopped.renderer.activeEffects, 0);
  await nav("arena");
  await page.click("#robotFollowCamera");
  await page.locator("#arena3d").scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  // Also inspect the original robot's screen/face, not only its solid back.
  const arenaBox = await page.locator("#arena3d").boundingBox();
  await page.mouse.move(arenaBox.x + arenaBox.width * 0.30, arenaBox.y + arenaBox.height * 0.56);
  await page.mouse.down();
  await page.mouse.move(arenaBox.x + arenaBox.width * 0.72, arenaBox.y + arenaBox.height * 0.56, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  assert.equal((await read()).robot.cameraMode, "free", "Orbit interaction must reach the actual canvas");
  await page.locator(".arena-stage").screenshot({ path: "../artifacts/v4-owner-robot.png" });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ report, errors }, null, 2));
} finally {
  await context.close(); await browser.close();
}
