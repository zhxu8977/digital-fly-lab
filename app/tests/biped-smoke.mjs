import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => localStorage.clear());
await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("#provenance")?.textContent.includes("male-cns:v1.0"));
await page.selectOption("#playerBodyType", "biped");
const walkSamples = [];
for (let i = 0; i < 30; i += 1) {
  await page.waitForTimeout(55);
  walkSamples.push({
    animation: await page.locator("#playerBodyType").getAttribute("data-animation"),
    gaitBackward: Number(await page.locator("#playerBodyType").getAttribute("data-gait-backward")),
    gaitLateral: Number(await page.locator("#playerBodyType").getAttribute("data-gait-lateral")),
    flex: Number(await page.locator("#playerBodyType").getAttribute("data-knee-flex")),
    extension: Number(await page.locator("#playerBodyType").getAttribute("data-knee-extension")),
  });
}
await page.locator('[data-flight="takeoff"]').click();
await page.waitForTimeout(550);
const manualJumpAltitude = Number((await page.locator("#altitudeValue").textContent()).match(/\d+/)?.[0] || 0);
await page.selectOption("#duelPlayerElement", "electric");
await page.selectOption("#duelRivalElement", "water");
await page.click("#startDuel");
await page.locator('[data-use-skill="throwingDart"]').first().click();
await page.waitForFunction(() => document.querySelector("#playerBodyType")?.dataset.activeGesture === "throw");
const throwingProgress = Number(await page.locator("#playerBodyType").getAttribute("data-attack-progress"));
await page.screenshot({ path: "../artifacts/digital-fly-throwing-dart.png", fullPage: false });
const samples = [];
for (let i = 0; i < 12; i += 1) {
  await page.waitForTimeout(650);
  const tactic = await page.locator("#duelPlayerTactic").textContent();
  // Read animation and direction from one rendered frame. Separate awaited DOM
  // reads can straddle a combat decision and falsely pair the old clip with the
  // new movement vector.
  const gaitFrame = await page.locator("#playerBodyType").evaluate((element) => ({
    animation: element.dataset.animation,
    gaitBackward: Number(element.dataset.gaitBackward),
    gaitLateral: Number(element.dataset.gaitLateral),
    kneeFlex: Number(element.dataset.kneeFlex),
  }));
  samples.push({
    altitude: Number(tactic.match(/·\s*(\d+)m/)?.[1] || 0),
    speed: Number(tactic.match(/实速\s*(\d+)/)?.[1] || 0),
    ...gaitFrame,
    attacking: await page.locator("#duelPlayerCard").evaluate((card) => card.classList.contains("attacking")),
    tactic,
  });
}
await page.screenshot({ path: "../artifacts/digital-fly-biped.png", fullPage: true });
const name = await page.locator("#duelPlayerName").textContent();
const body = await page.locator("#playerBodyType").inputValue();
const loadedRig = await page.locator("#playerBodyType").getAttribute("data-rig");
const loadedJoints = Number(await page.locator("#playerBodyType").getAttribute("data-joints"));
if (errors.length) throw new Error(errors.join(" | "));
if (body !== "biped" || !name.includes("关节迅影兽")) throw new Error(`Biped body did not activate: ${body}, ${name}`);
if (loadedRig !== "procedural-articulated-biped") throw new Error(`Articulated stick rig did not load: ${loadedRig}`);
if (loadedJoints !== 4) throw new Error(`Expected left/right elbow and knee pivots, received ${loadedJoints}`);
if (!walkSamples.some((sample) => sample.animation === "walk")) throw new Error(`Exploration never selected the walk clip: ${JSON.stringify(walkSamples)}`);
if (Math.min(...walkSamples.map((sample) => sample.extension)) > 12) throw new Error(`Walking stance leg never approached extension: ${JSON.stringify(walkSamples)}`);
if (Math.max(...walkSamples.map((sample) => sample.flex)) < 55) throw new Error(`Walking swing leg never flexed for toe clearance: ${JSON.stringify(walkSamples)}`);
if (manualJumpAltitude <= 0) throw new Error(`Manual jump did not leave the ground: ${manualJumpAltitude}`);
if (!(throwingProgress >= 0 && throwingProgress < 1)) throw new Error(`Throwing gesture did not enter its wind-up/release cycle: ${throwingProgress}`);
// Normal combat speed was deliberately reduced after the old 900+ u/s motion
// caused full-screen flashes and instability.  The locomotion smoke check now
// verifies a committed run without requiring the removed runaway speed.
if (Math.max(...samples.map((sample) => sample.speed)) < 500) throw new Error(`Biped never reached a committed combat run: ${JSON.stringify(samples)}`);
const mobileAttackSamples = samples.filter((sample) => sample.attacking && sample.speed > 300);
if (mobileAttackSamples.some((sample) => sample.animation === "attack" || sample.animation === "idle")) throw new Error(`Attacking froze the running legs: ${JSON.stringify(mobileAttackSamples)}`);
if (Math.max(...samples.map((sample) => sample.altitude)) < 70) throw new Error(`Biped never executed a substantial jump: ${JSON.stringify(samples)}`);
if (Math.max(...samples.map((sample) => sample.kneeFlex)) < 24) throw new Error(`Knees remained visually locked: ${JSON.stringify(samples)}`);
const retreatSamples = samples.filter((sample) => sample.gaitBackward > 0.55 && ["run", "walk", "backpedal"].includes(sample.animation));
if (retreatSamples.some((sample) => sample.animation !== "backpedal")) throw new Error(`Backward travel reused a forward gait: ${JSON.stringify(retreatSamples)}`);
const sideSamples = samples.filter((sample) => Math.abs(sample.gaitLateral) > 0.55 && ["run", "walk", "strafe-left", "strafe-right"].includes(sample.animation));
if (sideSamples.some((sample) => !sample.animation.startsWith("strafe-"))) throw new Error(`Lateral travel reused a forward gait: ${JSON.stringify(sideSamples)}`);
if (samples.some((sample) => sample.tactic.includes("全图换位"))) throw new Error(`Ground fighter incorrectly reused aerial roaming tactics: ${JSON.stringify(samples)}`);
await page.selectOption("#rivalBodyType", "biped");
await page.click("#startDuel");
await page.waitForTimeout(2600);
const rivalName = await page.locator("#duelRivalName").textContent();
const rivalTactic = await page.locator("#duelRivalTactic").textContent();
const rivalSpeed = Number(rivalTactic.match(/速度\s*(\d+)/)?.[1] || 0);
const rivalAltitude = Number(rivalTactic.match(/·\s*(\d+)m/)?.[1] || 0);
const rivalSkills = await page.locator("#duelRivalSkills").textContent();
if (!rivalName.includes("关节迅影兽")) throw new Error(`Rival biped body did not activate: ${rivalName}`);
if (rivalSpeed < 350) throw new Error(`Rival biped did not reach combat speed: ${rivalTactic}`);
if (!rivalSkills.includes("掌心脉冲") || !rivalSkills.includes("升空截击")) throw new Error(`Rival biped lacks mixed-range loadout: ${rivalSkills}`);
await page.click('[data-camera="side"]');
await page.waitForTimeout(450);
await page.locator("#arena3d").screenshot({ path: "../artifacts/digital-fly-biped-hud-side.png" });
await page.screenshot({ path: "../artifacts/digital-fly-biped-vs-biped.png", fullPage: true });
console.log(JSON.stringify({ body, name, loadedJoints, throwingProgress, walkExtensionMin: Math.min(...walkSamples.map((sample) => sample.extension)), walkFlexMax: Math.max(...walkSamples.map((sample) => sample.flex)), manualJumpAltitude, altitudeMax: Math.max(...samples.map((sample) => sample.altitude)), speedMin: Math.min(...samples.map((sample) => sample.speed)), speedMax: Math.max(...samples.map((sample) => sample.speed)), kneeFlexMax: Math.max(...samples.map((sample) => sample.kneeFlex)), animations: [...new Set(samples.map((sample) => sample.animation))], tactics: [...new Set(samples.map((sample) => sample.tactic.split(" · ")[0]))], rivalName, rivalSpeed, rivalAltitude, rivalSkills, errors }));
await browser.close();
