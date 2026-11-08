import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const bodyType = process.env.BODY_TYPE || "corgi";
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => localStorage.clear());
await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("#provenance")?.textContent.includes("male-cns:v1.0"));
await page.selectOption("#worldBodyPreview", bodyType);

const observed = new Set();
let maxFeed = 0, maxBitter = 0, maxOdor = 0;
const initialScore = Number(await page.locator("#scoreValue").textContent());
for (let index = 0; index < 32; index += 1) {
  await page.waitForTimeout(500);
  observed.add(await page.locator("#worldStatus").textContent());
  maxFeed = Math.max(maxFeed, Number(await page.locator("#feedMeter").getAttribute("value")));
  maxBitter = Math.max(maxBitter, Number(await page.locator("#bitterMeter").getAttribute("value")));
  maxOdor = Math.max(maxOdor, Number(await page.locator("#odorMeter").getAttribute("value")));
  if (Number(await page.locator("#scoreValue").textContent()) > initialScore) break;
}
const finalScore = Number(await page.locator("#scoreValue").textContent());
const decision = await page.locator("#decisionReason").textContent();
if (errors.length) throw new Error(errors.join(" | "));
if (![...observed].some((text) => text.includes("觅食"))) throw new Error(`${bodyType} never entered foraging: ${JSON.stringify([...observed])}`);
if (finalScore <= initialScore) throw new Error(`${bodyType} did not complete autonomous feeding: ${initialScore} -> ${finalScore}; feed=${maxFeed}, bitter=${maxBitter}, odor=${maxOdor}; ${JSON.stringify([...observed])}; ${decision}`);
console.log(JSON.stringify({ bodyType, initialScore, finalScore, maxFeed, maxBitter, maxOdor, observed: [...observed], decision, errors }));
await browser.close();
