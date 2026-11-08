import { chromium } from "@playwright/test";
import { SpiritCollection, experienceForLevel, SPECIES_BY_ID } from "../src/collection.js";

const url = process.env.SPIRIT_TEST_URL || "http://127.0.0.1:4173/";
const logicOnly = process.env.SPIRIT_LOGIC_ONLY === "1";
const duration = Math.min(60, Math.max(5, Number(process.env.SPIRIT_DIAG_SECONDS) || 30));
const cases = [
  ["fire-fly-vs-biped", "ember-dragon-base", "storm-rabbit-base"],
  ["neutral-fly-vs-biped", "pearl-moth-base", "storm-rabbit-base"],
  ["cat-vs-corgi", "mint-cat-base", "amber-corgi-base"],
  ["earth-ground-vs-wind-fly", "stone-bear-base", "cloud-bird-base"],
].filter(([name]) => !process.env.SPIRIT_DIAG_CASE || name === process.env.SPIRIT_DIAG_CASE);
if (!cases.length) throw new Error("Unknown SPIRIT_DIAG_CASE");

function preparedCollection(speciesId) {
  const collection = new SpiritCollection();
  if (!collection.select(speciesId).ok) { collection.adopt(speciesId); collection.select(speciesId); }
  if (collection.species.id !== speciesId) throw new Error(`Could not prepare ${speciesId}`);
  collection.gainExperience(experienceForLevel(7));
  collection.active.bond = 70;
  collection.evolve(); collection.evolve();
  return collection.snapshot();
}

const browser = await chromium.launch({ headless: true });
const reports = [];
try {
  // Sequential contexts avoid measuring inter-tab CPU contention as a combat
  // issue. Each run has a finite wall-time cap independent of simulated time.
  for (const [name, speciesId, rivalId] of cases) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/@vite/client", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: `
      export function createHotContext() { return { data: {}, accept() {}, dispose() {}, prune() {}, on() {}, off() {}, send() {}, invalidate() {} }; }
      export function updateStyle(id, css) { const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style); }
      export function removeStyle() {}
      export function injectQuery(url) { return url; }
    ` }));
    // This response-only test patch skips the GPU draw, but keeps the original
    // requestAnimationFrame loop, body animation, sensing, physics and combat.
    if (logicOnly) await page.route("**/src/main.js*", async (route) => {
      const response = await route.fetch();
      const original = await response.text();
      const body = original.replace("renderer.render(scene, camera);", "/* isolated diagnostic: GPU draw skipped */");
      if (body === original) throw new Error("Logic-only render hook was not found");
      await route.fulfill({ response, body });
    });
    await page.addInitScript((saved) => {
      localStorage.clear();
      localStorage.setItem("digitalFlySpiritCollectionV1", JSON.stringify(saved));
    }, preparedCollection(speciesId));
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForFunction(() => typeof window.spiritLabDiagnostics === "function", null, { timeout: 15000 });
      await page.waitForFunction(() => document.querySelector("#rivalSpeciesSelect").options.length > 0);
      const selected = await page.evaluate(() => {
        const saved = window.spiritLabDiagnostics().collection;
        return saved.records.find((record) => record.id === saved.activeId).speciesId;
      });
      if (selected !== `${SPECIES_BY_ID[speciesId].familyId}-crown`) throw new Error(`Wrong active species: ${selected}`);
      await page.click('[data-workspace-tab="duel"]');
      await page.selectOption("#rivalSpeciesSelect", rivalId);
      await page.click("#startDuel");
      await page.evaluate(() => {
        const initial = window.spiritLabDiagnostics().battle;
        window.__combatDiag = {
          initialPlayerHp: initial.playerHp, initialRivalHp: initial.rivalHp,
          minPlayerHp: initial.playerHp, minRivalHp: initial.rivalHp,
          maxSpeed: 0, maxEnemySpeed: 0, maxAltitude: 0, maxEnemyAltitude: 0,
          maxSeparation: 0, invalid: [], samples: 0,
        };
        window.__combatDiagTimer = setInterval(() => {
          const battle = window.spiritLabDiagnostics().battle;
          const state = window.__combatDiag;
          state.samples++;
          state.minPlayerHp = Math.min(state.minPlayerHp, battle.playerHp);
          state.minRivalHp = Math.min(state.minRivalHp, battle.rivalHp);
          state.maxSpeed = Math.max(state.maxSpeed, battle.speed || 0);
          state.maxEnemySpeed = Math.max(state.maxEnemySpeed, battle.enemySpeed || 0);
          state.maxAltitude = Math.max(state.maxAltitude, battle.playerAltitude);
          state.maxEnemyAltitude = Math.max(state.maxEnemyAltitude, battle.rivalAltitude);
          state.maxSeparation = Math.max(state.maxSeparation, battle.distance);
          const checked = {
            playerHp: battle.playerHp, rivalHp: battle.rivalHp,
            speed: battle.speed ?? 0, enemySpeed: battle.enemySpeed ?? 0,
            playerAltitude: battle.playerAltitude, rivalAltitude: battle.rivalAltitude,
            distance: battle.distance,
            ...Object.fromEntries(Object.entries(battle.playerPosition).map(([key, value]) => [`player.${key}`, value])),
            ...Object.fromEntries(Object.entries(battle.rivalPosition).map(([key, value]) => [`rival.${key}`, value])),
          };
          for (const [key, value] of Object.entries(checked)) {
            if (!Number.isFinite(value) && !state.invalid.includes(key)) state.invalid.push(key);
          }
          if (battle.speed > 1500 && !state.invalid.includes("speed>1500")) state.invalid.push("speed>1500");
          if (battle.enemySpeed > 1500 && !state.invalid.includes("enemySpeed>1500")) state.invalid.push("enemySpeed>1500");
        }, 50);
      });
      const started = Date.now();
      let checkpoint = 5;
      while (Date.now() - started < 45000) {
        await page.waitForTimeout(500);
        const battle = await page.evaluate(() => window.spiritLabDiagnostics().battle);
        if (battle.sinceStart >= checkpoint) {
          console.log(JSON.stringify({ case: name, progress: Number(battle.sinceStart.toFixed(1)), playerHp: battle.playerHp, rivalHp: battle.rivalHp, shots: battle.shots }));
          checkpoint += 5;
        }
        if (battle.sinceStart >= duration || !battle.active) break;
      }
      const sample = await page.evaluate(() => {
        clearInterval(window.__combatDiagTimer);
        const diagnostics = window.spiritLabDiagnostics();
        delete diagnostics.collection;
        return {
          diagnostics, metrics: window.__combatDiag,
          tactics: [document.querySelector("#duelPlayerTactic").textContent, document.querySelector("#duelRivalTactic").textContent],
          vision: document.querySelector("#duelVisionReadout").textContent,
          log: document.querySelector("#eventLog").textContent,
        };
      });
      const playerDamage = sample.metrics.initialRivalHp - sample.metrics.minRivalHp;
      const rivalDamage = sample.metrics.initialPlayerHp - sample.metrics.minPlayerHp;
      const report = {
        case: name, playerSpecies: `${SPECIES_BY_ID[speciesId].familyId}-crown`, rivalSpecies: rivalId,
        logicOnly, gpuVerified: !logicOnly,
        wallSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        simulatedSeconds: sample.diagnostics.battle.sinceStart,
        playerDamage, rivalDamage, bothDamaged: playerDamage > 0 && rivalDamage > 0,
        finiteBounded: sample.metrics.invalid.length === 0,
        errors, ...sample,
      };
      reports.push(report);
      if (process.env.SPIRIT_DIAG_VERBOSE === "1") console.log(JSON.stringify({ report }));
    } catch (error) {
      const failure = { case: name, errors, failure: error.message, diagnostics: await page.evaluate(() => window.spiritLabDiagnostics?.()).catch(() => null) };
      reports.push(failure); console.log(JSON.stringify({ report: failure }));
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ summary: reports.map(({ case: name, simulatedSeconds, playerDamage, rivalDamage, bothDamaged, finiteBounded, errors, failure }) => ({ name, simulatedSeconds, playerDamage, rivalDamage, bothDamaged, finiteBounded, errors, failure })), logicOnly, gpuVerified: !logicOnly }));
if (reports.some((report) => report.failure || report.errors.length || !report.finiteBounded)) process.exitCode = 1;
