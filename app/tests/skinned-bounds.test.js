import assert from "node:assert/strict";
import test from "node:test";
import { Bone, BoxGeometry, Float32BufferAttribute, Group, MeshBasicMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute } from "three";
import { groundClearance, refreshSkinnedBounds } from "../src/skinned-bounds.js";

function rig() {
  const geometry = new BoxGeometry(2, 4, 2), count = geometry.attributes.position.count;
  const indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial()), bone = new Bone();
  mesh.add(bone); mesh.bind(new Skeleton([bone]));
  const wrapper = new Group(); wrapper.add(mesh);
  return { wrapper, bone };
}

test("posed skin bounds stay local in a translated and scaled game world", () => {
  const { wrapper, bone } = rig();
  wrapper.position.set(4200, 0, -3100); wrapper.scale.setScalar(1.48); bone.position.y = -2;
  const bounds = refreshSkinnedBounds(wrapper);
  assert.ok(Math.abs(bounds.min.x - (4200 - 1.48)) < 1e-6);
  assert.ok(Math.abs(bounds.max.z - (-3100 + 1.48)) < 1e-6);
  assert.ok(bounds.min.y < -5 && groundClearance(bounds) < 7);
});

test("repeated animated floor correction never compounds bind transforms", () => {
  const { wrapper, bone } = rig();
  for (let frame = 0; frame < 120; frame++) {
    wrapper.position.set(3500 + frame * 9, 0, -2300 + frame * 4);
    wrapper.rotation.y = frame * 0.05; bone.position.y = -3 + Math.sin(frame * 0.1);
    wrapper.position.y += groundClearance(refreshSkinnedBounds(wrapper));
    const bounds = refreshSkinnedBounds(wrapper);
    assert.ok(bounds.min.y >= 0.8 - 1e-5);
    assert.ok(wrapper.position.y < 8);
    assert.ok(bounds.max.x - bounds.min.x < 3);
  }
});

test("invalid and already clear floor bounds never create an impulse", () => {
  assert.equal(groundClearance({ min: { y: 10 } }), 0);
  assert.equal(groundClearance({ min: { y: NaN } }), 0);
});
