import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => localStorage.clear());
await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("#provenance")?.textContent.includes("male-cns:v1.0"));
await page.selectOption("#duelPlayerElement", "wind");
await page.selectOption("#duelRivalElement", "electric");
await page.click("#startDuel");

const samples = [];
for (let i = 0; i < 14; i += 1) {
  await page.waitForTimeout(1500);
  const player = await page.locator("#duelPlayerTactic").textContent();
  const rival = await page.locator("#duelRivalTactic").textContent();
  const readout = await page.locator("#duelVisionReadout").textContent();
  const altitude = (text) => Number(text.match(/·\s*(\d+)m/)?.[1] || 0);
  const speed = (text) => Number(text.match(/速度\s*(\d+)/)?.[1] || 0);
  const stamina = (text) => Number(text.match(/体力\s*(\d+)%/)?.[1] || 0);
  const distance = Number(readout.match(/当前距离\s*(\d+)/)?.[1] || 0);
  samples.push({ player: altitude(player), rival: altitude(rival), playerSpeed: speed(player), rivalSpeed: speed(rival), playerStamina: stamina(player), rivalStamina: stamina(rival), distance, readout, playerTactic: player, rivalTactic: rival });
}

const altitudes = samples.flatMap((sample) => [sample.player, sample.rival]);
const distances = samples.map((sample) => sample.distance);
const speeds = samples.flatMap((sample) => [sample.playerSpeed, sample.rivalSpeed]);
const tactics = samples.flatMap((sample) => [sample.playerTactic, sample.rivalTactic]);
const tracked = samples.some((sample) => !sample.readout.includes("气味追踪：未标记"));
const altitudeSpan = Math.max(...altitudes) - Math.min(...altitudes);
if (errors.length) throw new Error(errors.join(" | "));
if (altitudeSpan < 380) throw new Error(`Vertical battle remained too narrow: span=${altitudeSpan}`);
if (Math.max(...distances) < 850) throw new Error(`Battle never opened its spacing: max=${Math.max(...distances)}`);
if (!tactics.some((text) => /全图换位|凭气味|开局远距试探/.test(text))) throw new Error(`No staged or wide tactic observed: ${tactics.join(" | ")}`);
if (!tracked) throw new Error(`Scent mark never established an olfactory tracking window: ${await page.locator("#eventLog").textContent()}`);
if (Math.max(...speeds) - Math.min(...speeds) < 90) throw new Error(`Combat speed remained too constant: ${speeds.join(",")}`);
const playerHealth = Number(await page.locator("#duelPlayerHealth").getAttribute("value"));
const rivalHealth = Number(await page.locator("#duelRivalHealth").getAttribute("value"));
console.log(JSON.stringify({ altitudeMin: Math.min(...altitudes), altitudeMax: Math.max(...altitudes), altitudeSpan, distanceMin: Math.min(...distances), distanceMax: Math.max(...distances), speedMin: Math.min(...speeds), speedMax: Math.max(...speeds), finalStamina: [samples.at(-1).playerStamina, samples.at(-1).rivalStamina], health: [playerHealth, rivalHealth], tracked, tactics: [...new Set(tactics.map((text) => text.split(" · ")[0]))], final: samples.at(-1).readout }));
await browser.close();
