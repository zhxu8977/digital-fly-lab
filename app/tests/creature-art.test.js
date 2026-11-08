import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SPECIES } from "../src/collection.js";
import { applySpeciesAppearance, applySocialExpression, releaseSpeciesAppearance, getSpeciesPortrait } from "../src/creature-art.js";

function simpleRig() {
  const wrapper = new THREE.Group(), head = new THREE.Group();
  head.position.y = 65;
  const fur = new THREE.MeshStandardMaterial({ color: 0xcc8855 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(25, 8, 6), fur); body.position.y = 30; wrapper.add(body, head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(23, 8, 6), fur));
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), new THREE.MeshStandardMaterial({ color: 0x17212a }));
    eye.position.set(20, 5, side * 13); head.add(eye);
  }
  wrapper.userData.headRig = head;
  return wrapper;
}

test("all families have three different portraits and geometric growth outlines", () => {
  const familyIds = new Set(SPECIES.map((s) => s.familyId));
  for (const familyId of familyIds) {
    const species = SPECIES.filter((s) => s.familyId === familyId);
    assert.equal(new Set(species.map(getSpeciesPortrait)).size, 3, familyId);
    const counts = [], signatures = [];
    for (const form of species) {
      const wrapper = simpleRig(); applySpeciesAppearance(wrapper, form);
      const details = wrapper.userData.evolutionDetails;
      let count = 0; details.traverse((node) => { if (node.isMesh) count += 1; });
      counts.push(count); signatures.push(wrapper.userData.silhouetteSignature);
      assert(wrapper.userData.artHeight > 50 && wrapper.userData.artHeight < 250);
      releaseSpeciesAppearance(wrapper);
    }
    assert.equal(new Set(signatures).size, 3, familyId);
    assert(counts[0] < counts[1] && counts[1] < counts[2], familyId);
  }
});

test("social rolls cannot change simulation position or accumulate scale", () => {
  const wrapper = simpleRig(); applySpeciesAppearance(wrapper, SPECIES.find((s) => s.familyId === "amber-corgi" && s.stage === 0));
  wrapper.position.set(1300, 0, -1200);
  const initialPosition = wrapper.position.clone(), initialScale = wrapper.userData.fallbackVisual.scale.clone();
  for (let frame = 0; frame < 500; frame++) {
    const pose = applySocialExpression(wrapper, { reaction: "roll", progress: (frame % 100) / 100, elapsed: frame / 60 });
    assert(pose.movementLocked);
    assert(wrapper.position.equals(initialPosition));
    const bounds = new THREE.Box3().setFromObject(wrapper);
    assert(bounds.min.toArray().every(Number.isFinite));
    assert(bounds.getSize(new THREE.Vector3()).length() < 450);
  }
  applySocialExpression(wrapper, { reaction: null, elapsed: 5 });
  assert(wrapper.userData.fallbackVisual.scale.equals(initialScale));
  assert(wrapper.userData.fallbackVisual.quaternion.angleTo(new THREE.Quaternion()) < 1e-6);
  assert(wrapper.userData.fallbackVisual.position.length() < 1e-6);
  releaseSpeciesAppearance(wrapper);
});

test("blink closes eye geometry without recolouring fur, and affection supplies a visible smile", () => {
  const wrapper = simpleRig(); applySpeciesAppearance(wrapper, SPECIES[0]);
  const face = wrapper.userData.faceExpression;
  assert(face && face.eyeMaterials.length === 2);
  const original = face.eyeMaterials[0].color.clone();
  applySocialExpression(wrapper, { reaction: "blinkBack", progress: 0.125, elapsed: 2 });
  assert(face.eyeMaterials[0].blink.value > 0.9);
  assert(face.eyeMaterials[0].material.color.equals(original));
  applySocialExpression(wrapper, { reaction: "rub", progress: 0.5, elapsed: 2 });
  assert(face.root.visible && face.smile.material.opacity > 0.8);
  applySocialExpression(wrapper, { reaction: null, elapsed: 2 });
  assert(face.eyeMaterials[0].material.color.toArray().every((value, index) => Math.abs(value - original.toArray()[index]) < 1e-6));
  assert.equal(face.root.visible, false);
  releaseSpeciesAppearance(wrapper);
});

test("reapplying appearance does not nest visual containers", () => {
  const wrapper = simpleRig();
  applySpeciesAppearance(wrapper, SPECIES[0]);
  applySpeciesAppearance(wrapper, { ...SPECIES[0], stage: 1, id: "reapply-test" });
  let count = 0; wrapper.traverse((node) => { if (node.name === "OriginalSpeciesVisual") count += 1; });
  assert.equal(count, 1);
  releaseSpeciesAppearance(wrapper);
});
