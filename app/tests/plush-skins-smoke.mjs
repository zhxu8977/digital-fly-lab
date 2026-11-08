import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => localStorage.clear());
await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("#provenance")?.textContent.includes("male-cns:v1.0"));
await page.selectOption("#playerBodyType", "aerial");
await page.selectOption("#rivalBodyType", "aerial");
await page.click("#startDuel");
await page.waitForTimeout(900);
await page.click('[data-camera="follow"]');
await page.waitForTimeout(350);
const playerName = await page.locator("#duelPlayerName").textContent();
const rivalName = await page.locator("#duelRivalName").textContent();
await page.locator("#arena3d").screenshot({ path: "../artifacts/digital-fly-plush-aerial.png" });
if (errors.length) throw new Error(errors.join(" | "));
if (!playerName.includes("绒团萤翼兽") || !rivalName.includes("绒团萤翼兽")) {
  throw new Error(`Plush aerial skin did not activate: ${playerName}, ${rivalName}`);
}
await page.reload({ waitUntil: "networkidle" });
await page.selectOption("#worldBodyPreview", "corgi");
await page.click('[data-camera="side"]');
let maxBodySway = 0, maxBodyTwist = 0, maxBodyBounce = 0, maxHeadYaw = 0;
for (let frame = 0; frame < 12; frame += 1) {
  await page.waitForTimeout(140);
  const motion = await page.locator("#playerBodyType").evaluate((element) => ({
    sway: Number(element.dataset.bodySway || 0),
    twist: Number(element.dataset.bodyTwist || 0),
    bounce: Number(element.dataset.bodyBounce || 0),
    headYaw: Number(element.dataset.headYaw || 0),
  }));
  maxBodySway = Math.max(maxBodySway, Math.abs(motion.sway));
  maxBodyTwist = Math.max(maxBodyTwist, Math.abs(motion.twist));
  maxBodyBounce = Math.max(maxBodyBounce, Math.abs(motion.bounce));
  maxHeadYaw = Math.max(maxHeadYaw, Math.abs(motion.headYaw));
}
await page.locator("#arena3d").screenshot({ path: "../artifacts/digital-fly-corgi-standing.png" });
const corgiOption = await page.locator("#playerBodyType option:checked").textContent();
const corgiRig = await page.locator("#playerBodyType").getAttribute("data-rig");
const corgiJoints = Number(await page.locator("#playerBodyType").getAttribute("data-joints"));
const corgiPhysics = await page.locator("#playerBodyType").getAttribute("data-physics");
const corgiRagdollParts = Number(await page.locator("#playerBodyType").getAttribute("data-ragdoll-parts"));
const corgiRagdollState = await page.locator("#playerBodyType").getAttribute("data-ragdoll-state");
const corgiControlLocked = await page.locator("#playerBodyType").getAttribute("data-control-locked");
const previewBody = await page.locator("#worldBodyPreview").inputValue();
if (!corgiOption.includes("小柯基")) throw new Error(`Corgi skin did not activate: ${corgiOption}`);
if (corgiRig !== "procedural-rigid-corgi" || corgiJoints !== 0) throw new Error(`Corgi incorrectly retained articulated knees: ${corgiRig}, ${corgiJoints}`);
if (corgiPhysics !== "active-ragdoll" || corgiRagdollParts !== 6) throw new Error(`Corgi active ragdoll did not initialize: ${corgiPhysics}, ${corgiRagdollParts}`);
if (corgiRagdollState !== "active" || corgiControlLocked !== "false") throw new Error(`Corgi spawned with locomotion incorrectly locked: ${corgiRagdollState}, ${corgiControlLocked}`);
if (previewBody !== "corgi" || await page.locator("#playerBodyType").inputValue() !== "corgi") throw new Error("Free-roam body preview did not synchronize with the duel selector");
if (maxBodySway < 0.15 || maxBodyTwist < 0.005 || maxBodyBounce < 0.08) throw new Error(`Corgi soft walk did not visibly propagate through the body: sway=${maxBodySway}, twist=${maxBodyTwist}, bounce=${maxBodyBounce}`);
if (maxHeadYaw < 0.02) throw new Error(`Independent head search did not move: yaw=${maxHeadYaw}`);
await page.selectOption("#rivalBodyType", "corgi");
await page.click("#startDuel");
await page.waitForTimeout(3200);
await page.locator("#arena3d").screenshot({ path: "../artifacts/digital-fly-corgi-duel.png" });
if (errors.length) throw new Error(errors.join(" | "));
console.log(JSON.stringify({ playerName, rivalName, previewBody, corgiOption, corgiRig, corgiJoints, corgiPhysics, corgiRagdollParts, corgiRagdollState, corgiControlLocked, maxBodySway, maxBodyTwist, maxBodyBounce, maxHeadYaw, errors }));
await browser.close();
