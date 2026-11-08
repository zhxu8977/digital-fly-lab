import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(() => localStorage.clear());
await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("#provenance")?.textContent.includes("male-cns:v1.0"));
await page.selectOption("#playerBodyType", "biped");
await page.click("#startDuel");
await page.waitForTimeout(1200);
const result = await page.evaluate(() => new Promise((resolve) => {
  const canvas = document.querySelector("#arena3d canvas");
  const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
  const debug = gl?.getExtension("WEBGL_debug_renderer_info");
  const rendererName = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unknown";
  const samples = [], started = performance.now(); let previous = started;
  const tick = (now) => {
    samples.push(now - previous); previous = now;
    if (now - started < 5000) requestAnimationFrame(tick);
    else {
      const valid = samples.slice(4).sort((a, b) => a - b);
      const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length;
      resolve({ frames: valid.length, fps: 1000 / mean, p95FrameMs: valid[Math.floor(valid.length * 0.95)], rendererName });
    }
  };
  requestAnimationFrame(tick);
}));
console.log(JSON.stringify({ fps: Number(result.fps.toFixed(1)), p95FrameMs: Number(result.p95FrameMs.toFixed(1)), frames: result.frames, renderer: result.rendererName }));
await browser.close();
