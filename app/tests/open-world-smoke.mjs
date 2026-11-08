import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => localStorage.clear());
await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("#worldArtStatus")?.textContent.includes("Quaternius + Kenney"), null, { timeout: 20_000 });
const badge = await page.locator("#worldArtStatus").textContent();
const note = await page.locator(".arena-note").textContent();
const canvas = page.locator('[data-testid="arena-webgl"]');
await canvas.screenshot({ path: "../artifacts/open-source-world-arena.png" });
if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
if (!badge.includes("CC0") || !badge.includes("场景实例")) throw new Error(`Open-source assets did not finish loading: ${badge}`);
if (!note.includes("CC0 开源模型") || !note.includes("显卡自动限制")) throw new Error(`Open-source world explanation missing: ${note}`);
console.log(JSON.stringify({ badge, errors }));
await browser.close();
