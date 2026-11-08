import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { SKILLS, getSkillVisual } from "../src/skills.js";
import { createSkillProjectileGeometry, decorateSkillEffect } from "../src/skill-vfx.js";

const drawableCount = (root) => {
  let count = 0;
  root.traverse((child) => { if (child.isMesh || child.isPoints || child.isLine) count += 1; });
  return count;
};
const finiteGeometry = (root) => {
  root.traverse((child) => {
    const attribute = child.geometry?.attributes.position;
    if (attribute) assert.ok([...attribute.array].every(Number.isFinite));
    if (child.instanceMatrix) assert.ok([...child.instanceMatrix.array].every(Number.isFinite));
    assert.ok([child.position.x, child.position.y, child.position.z, child.scale.x, child.scale.y, child.scale.z].every(Number.isFinite));
  });
};
function projectile(skillId, options = {}) {
  const root = new THREE.Group();
  const mover = new THREE.Mesh(new THREE.SphereGeometry(9, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  mover.position.set(740, 230, -1100);
  root.add(mover);
  const initialCalls = drawableCount(root);
  const update = decorateSkillEffect(root, { mover, skillId, ...options });
  return { root, mover, update, initialCalls };
}

test("projectiles have distinct three-dimensional silhouettes, not only color swaps", () => {
  const styles = ["fireball", "ice", "needle", "leaf", "sound", "shadow", "cosmic", "metal", "water", "wind", "rock", "poison"];
  const signatures = new Set();
  for (const style of styles) {
    const geometry = createSkillProjectileGeometry(style);
    assert.ok(geometry.isBufferGeometry);
    assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
    geometry.computeBoundingBox();
    assert.ok(!geometry.boundingBox.isEmpty());
    signatures.add(`${geometry.attributes.position.count}:${geometry.boundingBox.min.toArray().join(",")}:${geometry.boundingBox.max.toArray().join(",")}`);
    geometry.dispose();
  }
  assert.equal(signatures.size, styles.length);
});

test("all projectile effects stay inside particle and additional draw-call budgets", () => {
  for (const [id, skill] of Object.entries(SKILLS)) {
    if (!["projectile", "mark"].includes(skill.type)) continue;
    for (const lowQuality of [false, true]) {
      const { root, update, initialCalls } = projectile(id, { stage: 2, lowQuality });
      update(0.15, 1 / 60);
      const metadata = root.userData.skillVfx;
      assert.equal(metadata.style, getSkillVisual(id).style);
      assert.ok(metadata.additionalDrawCalls <= 5, id);
      assert.equal(drawableCount(root) - initialCalls, metadata.additionalDrawCalls, id);
      assert.ok(metadata.totalInstances <= (lowQuality ? 10 : 24), id);
      assert.ok(!root.children.some((child) => child.isLight));
      root.traverse((child) => { if (child.userData.skillVfxPart && child.isMesh && child.material.side === THREE.DoubleSide) assert.equal(child.material.forceSinglePass, true); });
      finiteGeometry(root);
    }
  }
});

test("a travelling trail follows the projectile rather than flying toward the origin", () => {
  const { root, mover, update } = projectile("cosmicOrb", { stage: 2 });
  const trajectory = [new THREE.Vector3(740, 230, -1100), new THREE.Vector3(760, 232, -1110), new THREE.Vector3(785, 237, -1120)];
  for (let frame = 0; frame < trajectory.length; frame += 1) {
    mover.position.copy(trajectory[frame]);
    update(frame * 0.1, 1 / 60);
    assert.deepEqual(mover.position.toArray(), trajectory[frame].toArray());
    const trail = root.children.find((child) => child.isPoints);
    const positions = trail.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      assert.ok(positions.getX(index) >= 740 && positions.getX(index) <= 785);
      assert.ok(positions.getZ(index) < -1080, "trail must not return to world origin");
    }
  }
  const halo = mover.children.find((child) => child.isMesh && child.geometry.type === "SphereGeometry");
  for (let frame = 0; frame < 1200; frame += 1) update(frame / 1200, 1 / 60);
  assert.ok(halo.scale.x > 0.95 && halo.scale.x < 1.05, "halo animation may not compound scale");
  finiteGeometry(root);
});

test("trail coordinates respect a translated and scaled effect parent", () => {
  const { root, mover, update } = projectile("iceOrb", { lowQuality: true });
  root.position.set(1500, 40, 1700); root.scale.setScalar(1.4);
  update(0.1, 1 / 60);
  const trail = root.children.find((child) => child.isPoints);
  const position = trail.geometry.attributes.position;
  assert.ok(Math.abs(position.getX(0) - mover.position.x) < 0.001);
  assert.ok(Math.abs(position.getY(0) - mover.position.y) < 0.001);
  assert.ok(Math.abs(position.getZ(0) - mover.position.z) < 0.001);
});

test("all elemental area attacks add bounded instanced symbols and expanding sparks", () => {
  for (const [id, skill] of Object.entries(SKILLS)) {
    if (!["area", "buff"].includes(skill.type)) continue;
    for (const lowQuality of [false, true]) {
      const root = new THREE.Group(); root.position.set(900, 800, -300);
      const update = decorateSkillEffect(root, { skillId: id, lowQuality, stage: 2 });
      update(0.1, 1 / 60); update(0.5, 1 / 60); update(1, 1 / 60);
      assert.ok(root.userData.skillVfx.totalInstances <= (lowQuality ? 10 : 24), id);
      assert.ok(drawableCount(root) <= 5, id);
      assert.ok(root.children.some((child) => child.isInstancedMesh));
      assert.deepEqual(root.position.toArray(), [900, 800, -300]);
      assert.ok(root.children.filter((child) => child.material).every((child) => child.material.opacity <= 1));
      finiteGeometry(root);
    }
  }
});

test("continuous flame sparks inherit the live ray transform instead of a stale emitter", () => {
  const root = new THREE.Group();
  const ray = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 1, 8), new THREE.MeshBasicMaterial());
  ray.position.set(800, 100, -600); ray.scale.y = 450; root.add(ray);
  const update = decorateSkillEffect(root, { skillId: "flame", lowQuality: true });
  update(0.1, 1 / 60);
  const sparks = ray.children.find((child) => child.isPoints);
  assert.ok(sparks, "flame sparks must be attached to the dynamically updated ray");
  const oldWorld = sparks.getWorldPosition(new THREE.Vector3());
  ray.position.x += 300; ray.position.z -= 100;
  update(0.5, 1 / 60);
  const nextWorld = sparks.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(nextWorld.x - oldWorld.x - 300) < 0.001);
  assert.ok(Math.abs(nextWorld.z - oldWorld.z + 100) < 0.001);
  const positions = sparks.geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) assert.ok(Math.abs(positions.getY(index)) <= 0.5);
});

test("line sparks sample the current line's actual endpoints", () => {
  const root = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(800, 100, -600), new THREE.Vector3(1200, 150, -700)]), new THREE.LineBasicMaterial());
  const update = decorateSkillEffect(root, { skillId: "thunder", lowQuality: true });
  update(0.15, 1 / 60);
  const source = root.geometry.attributes.position;
  source.setXYZ(0, 1500, 200, -1700); source.setXYZ(1, 1900, 300, -1900); source.needsUpdate = true;
  update(0.5, 1 / 60);
  const sparks = root.children.find((child) => child.isPoints).geometry.attributes.position;
  for (let index = 0; index < sparks.count; index += 1) assert.ok(sparks.getX(index) >= 1500 && sparks.getX(index) <= 1900);
});

test("invalid progress and stage stay finite; all resources are reachable by traverse disposal", () => {
  const { root, update } = projectile("fireOrb", { stage: Infinity });
  update(NaN, Infinity); update(-999, -5); update(999, "invalid");
  finiteGeometry(root);
  let geometryCount = 0, disposedGeometry = 0, materialCount = 0, disposedMaterial = 0;
  root.traverse((child) => {
    if (child.geometry) { geometryCount += 1; child.geometry.addEventListener("dispose", () => { disposedGeometry += 1; }); }
    for (const material of child.material ? Array.isArray(child.material) ? child.material : [child.material] : []) {
      materialCount += 1; material.addEventListener("dispose", () => { disposedMaterial += 1; });
      assert.equal(material.map, null);
    }
  });
  root.traverse((child) => {
    child.geometry?.dispose();
    for (const material of child.material ? Array.isArray(child.material) ? child.material : [child.material] : []) material.dispose();
  });
  assert.equal(disposedGeometry, geometryCount);
  assert.equal(disposedMaterial, materialCount);
  assert.doesNotThrow(() => decorateSkillEffect(null)());
});
