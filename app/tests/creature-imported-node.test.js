import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { SPECIES } from "../src/collection.js";
import { attachSpeciesAsset, applySocialExpression, releaseSpeciesAppearance, speciesAssetUrl } from "../src/creature-art.js";
import { refreshSkinnedBounds, groundClearance } from "../src/skinned-bounds.js";

// Parse real local GLBs in Node: no browser, renderer, listening server, camera
// permission or user save file is needed for this skeleton/animation audit.
const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const NativeRequest = globalThis.Request;
globalThis.Request = class LocalAssetRequest extends NativeRequest {
  constructor(input, init) { super(typeof input === "string" && input.startsWith("/") ? `http://asset-audit.local${input}` : input, init); }
};
globalThis.ProgressEvent ||= class ProgressEvent extends Event { constructor(type, values) { super(type); Object.assign(this, values); } };
globalThis.fetch = async (request) => {
  const url = new URL(typeof request === "string" ? request : request.url);
  assert.equal(url.hostname, "asset-audit.local", "asset audit may only read local model files");
  const target = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
  assert(target.startsWith(`${publicRoot}${path.sep}`));
  const data = await readFile(target);
  return new Response(data, { status: 200, headers: { "Content-Length": `${data.length}` } });
};

test("all imported GLB forms retain real head bones, distinct growth and bounded poses", async () => {
  const forms = SPECIES.filter((species) => speciesAssetUrl(species)?.endsWith(".glb"));
  assert(forms.length >= 27);
  const familyShapes = new Map();
  for (const species of forms) {
    const wrapper = new THREE.Group();
    assert(await attachSpeciesAsset(wrapper, species), `${species.id}: ${wrapper.userData.artLoadError || "not loaded"}`);
    assert(wrapper.userData.assetHeadBone?.isBone, species.id);
    assert(wrapper.userData.faceExpression?.eyeMaterials.length > 0, `${species.id}: needs expressive eye surfaces`);
    let growthMeshes = 0; wrapper.userData.evolutionDetails.traverse((node) => { if (node.isMesh) growthMeshes += 1; });
    (familyShapes.get(species.familyId) || familyShapes.set(species.familyId, []).get(species.familyId)).push(growthMeshes);
    assert(wrapper.userData.artHeight > 50 && wrapper.userData.artHeight < 250);
    for (const phase of ["run", "hurt", "down", "roll", "rub", "curious", "blinkBack"]) {
      for (let frame = 0; frame < 8; frame++) {
        wrapper.position.set(1900 + frame * 4, species.bodyType === "aerial" ? 300 : 0, -2300);
        wrapper.rotation.set(0, frame * 0.05, 0); wrapper.scale.setScalar(1.4);
        wrapper.userData.assetAnimator.update(1 / 30, { speed: phase === "run" ? 480 : 0 }, { hit: phase === "hurt", knockedDown: phase === "down" });
        wrapper.userData.headRig.rotation.y = 0.3;
        const social = ["roll", "rub", "curious", "blinkBack"].includes(phase) ? phase : null;
        const pose = applySocialExpression(wrapper, { reaction: social, progress: frame / 7, elapsed: frame / 30 + 1 });
        const bounds = refreshSkinnedBounds(wrapper);
        if (species.bodyType !== "aerial") {
          const lift = groundClearance(bounds); assert(lift < 400, `${species.id}: floor lift ${lift}`);
          wrapper.position.y += lift; refreshSkinnedBounds(wrapper, bounds);
          assert(bounds.min.y > 0.7999, `${species.id}: submerged ${phase}`);
        }
        const size = bounds.getSize(new THREE.Vector3());
        assert(size.toArray().every(Number.isFinite), `${species.id}: invalid ${phase}`);
        assert(Math.max(...size.toArray()) < 1000, `${species.id}: inflated ${phase}`);
        assert.equal(pose.movementLocked, social === "roll");
      }
    }
    releaseSpeciesAppearance(wrapper);
  }
  for (const [family, counts] of familyShapes) {
    assert.equal(counts.length, 3, family);
    assert(counts[0] < counts[1] && counts[1] < counts[2], family);
  }
});
