import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = []; page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.route("**/art-audit", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Isolated creature asset audit</title>" }));
  await page.route("**/@vite/client", (route) => route.fulfill({ contentType: "application/javascript", body: "/* isolated audit */" }));
  await page.goto(`${process.env.SPIRIT_ART_TEST_URL || "http://127.0.0.1:4177"}/art-audit`);
  const report = await page.evaluate(async () => {
    const THREE = await import("/node_modules/.vite/deps/three.js");
    const { SPECIES } = await import("/src/collection.js");
    const { attachSpeciesAsset, releaseSpeciesAppearance } = await import("/src/creature-art.js");
    const { groundClearance, refreshSkinnedBounds } = await import("/src/skinned-bounds.js");
    const results = [];
    for (const species of SPECIES.filter((item) => item.stage === 0)) {
      const wrapper = new THREE.Group(); wrapper.userData.bodyType = species.bodyType;
      const loaded = await attachSpeciesAsset(wrapper, species);
      if (!loaded) { releaseSpeciesAppearance(wrapper); continue; }
      const animator = wrapper.userData.assetAnimator, head = wrapper.userData.assetHeadBone;
      const boneNames = []; wrapper.traverse((node) => { if (node.isBone) boneNames.push(node.name); });
      let maxFloorLift = 0, maxDimension = 0, finite = true;
      for (const phase of ["run", "hurt", "down", "idle"]) {
        for (let frame = 0; frame < 30; frame++) {
          wrapper.position.set(3600 + frame * 6, species.bodyType === "aerial" ? 500 : 0, -2400);
          wrapper.rotation.y = frame * 0.02; wrapper.scale.setScalar(1.48);
          animator.update(1 / 30, { speed: phase === "run" ? 420 : 0, altitude: species.bodyType === "aerial" ? 500 : 0 }, { hit: phase === "hurt", knockedDown: phase === "down" });
          wrapper.userData.headRig.rotation.y = 0.3; wrapper.userData.headRig.rotation.z = -0.12;
          const bounds = refreshSkinnedBounds(wrapper);
          if (species.bodyType !== "aerial") {
            const lift = groundClearance(bounds); maxFloorLift = Math.max(maxFloorLift, lift); wrapper.position.y += lift;
            refreshSkinnedBounds(wrapper, bounds);
            finite &&= bounds.min.y >= 0.8 - 1e-4;
          }
          const size = bounds.getSize(new THREE.Vector3());
          maxDimension = Math.max(maxDimension, size.x, size.y, size.z);
          finite &&= size.toArray().every(Number.isFinite) && maxDimension < 1000 && maxFloorLift < 400;
        }
      }
      results.push({ species: species.id, head: head?.name, bones: boneNames, finite, maxFloorLift: Math.round(maxFloorLift), maxDimension: Math.round(maxDimension), hurtRepeats: animator.mixer.existingActions?.length });
      releaseSpeciesAppearance(wrapper);
    }
    return results;
  });
  assert(report.length >= 11, "All available imported families should participate in the asset audit");
  assert(report.every((item) => item.head && item.finite), "Every imported asset needs a working head and bounded ground correction");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ importedFamilies: report.length, errors, report }, null, 2));
} finally { await browser.close(); }
