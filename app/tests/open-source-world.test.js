import test from "node:test";
import assert from "node:assert/strict";
import { selectGraphicsProfile } from "../src/open-source-world.js";

test("Intel Iris Xe receives an integrated-GPU rendering profile", () => {
  const profile = selectGraphicsProfile({ rendererName: "ANGLE (Intel(R) Iris(R) Xe Graphics)", devicePixelRatio: 2 });
  assert.equal(profile.id, "integrated");
  assert.equal(profile.pixelRatio, 1.2);
  assert.equal(profile.shadowSize, 1024);
  assert.equal(profile.shadows, true);
  assert.ok(profile.treeCount <= 42);
});

test("discrete GPUs retain a balanced but bounded pixel ratio", () => {
  const profile = selectGraphicsProfile({ rendererName: "NVIDIA GeForce RTX", devicePixelRatio: 2.5 });
  assert.equal(profile.id, "balanced");
  assert.equal(profile.pixelRatio, 1.6);
  assert.equal(profile.shadowSize, 2048);
  assert.equal(profile.shadows, true);
});

test("CPU WebGL fallbacks use a lightweight profile without shadows", () => {
  const fallbackRenderers = [
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
    "Software Rasterizer",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "Mesa Softpipe",
    "Microsoft Basic Render Driver",
    "Microsoft Basic Display Adapter",
    "ANGLE (Microsoft, Direct3D11 WARP)",
    "GDI Generic",
    "ANGLE (Intel(R) Iris(R) Xe Graphics, fallback SwiftShader)",
  ];
  const hardware = selectGraphicsProfile({ rendererName: "Intel Iris Xe", devicePixelRatio: 2 });
  for (const rendererName of fallbackRenderers) {
    const profile = selectGraphicsProfile({ rendererName, devicePixelRatio: 2 });
    assert.equal(profile.id, "software", rendererName);
    assert.ok(profile.pixelRatio <= 0.75, rendererName);
    assert.equal(profile.shadows, false, rendererName);
    assert.equal(profile.castShadowTrees, 0, rendererName);
    assert.ok(profile.treeCount < hardware.treeCount, rendererName);
    assert.ok(profile.detailCount < hardware.detailCount, rendererName);
    assert.ok(profile.landformCount < hardware.landformCount, rendererName);
    assert.equal(profile.decorativePlants, false, rendererName);
  }
});

test("software rendering never increases a smaller requested resolution", () => {
  const profile = selectGraphicsProfile({ rendererName: "SwiftShader", devicePixelRatio: 0.5 });
  assert.equal(profile.pixelRatio, 0.5);
});
