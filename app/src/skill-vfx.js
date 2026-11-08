import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SKILLS, getSkillVisual } from "./skills.js";

const TAU = Math.PI * 2;
const FORWARD = new THREE.Vector3(1, 0, 0);
const finite = (number, fallback = 0) => Number.isFinite(Number(number)) ? Number(number) : fallback;
const bounded = (number, min, max, fallback = min) => Math.max(min, Math.min(max, finite(number, fallback)));

function basic(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
}

function merged(parts) {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return geometry;
}

function leafGeometry(metal = false, lowQuality = false) {
  const shape = new THREE.Shape();
  shape.moveTo(-22, 0);
  shape.bezierCurveTo(-5, metal ? 4 : 18, 15, metal ? 4 : 14, 27, 0);
  shape.bezierCurveTo(10, metal ? -8 : -14, -11, metal ? -4 : -11, -22, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: metal ? 2.8 : 2.1, bevelEnabled: true, bevelSegments: lowQuality ? 1 : 2, steps: 1, bevelSize: metal ? 1.4 : 1.1, bevelThickness: 0.8, curveSegments: lowQuality ? 5 : 9 });
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function starGeometry(lowQuality = false) {
  const shape = new THREE.Shape();
  for (let index = 0; index <= 10; index += 1) {
    const angle = index * Math.PI / 5 - Math.PI / 2;
    const radius = index % 2 ? 9 : 21;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 4, steps: 1, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: lowQuality ? 1 : 2, curveSegments: 1 });
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

function teardropGeometry(lowQuality = false, pointed = false) {
  const geometry = new THREE.SphereGeometry(13, lowQuality ? 10 : 16, lowQuality ? 6 : 10);
  const attribute = geometry.attributes.position;
  for (let index = 0; index < attribute.count; index += 1) {
    const x = attribute.getX(index), y = attribute.getY(index), z = attribute.getZ(index);
    const radial = 0.55 + (x / 13 + 1) * 0.3;
    attribute.setXYZ(index, x * (pointed ? 1.9 : 1.55), y * radial, z * radial);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Different elements change geometry, not just the material color. +X is the
 * travelling direction; no object is animated toward a global origin. */
export function createSkillProjectileGeometry(style, { lowQuality = false } = {}) {
  const sides = lowQuality ? 8 : 14;
  if (["star", "cosmic"].includes(style)) return starGeometry(lowQuality);
  if (style === "fireball" || style === "spirit") return teardropGeometry(lowQuality, true);
  if (style === "water") return teardropGeometry(lowQuality);
  if (style === "leaf" || style === "metal") return leafGeometry(style === "metal", lowQuality);
  if (style === "needle") {
    const geometry = new THREE.ConeGeometry(5, 48, lowQuality ? 4 : 6);
    geometry.rotateZ(-Math.PI / 2);
    return geometry;
  }
  if (style === "ice") {
    const geometry = new THREE.OctahedronGeometry(16, 0);
    geometry.scale(1.7, 0.63, 0.63);
    return geometry;
  }
  if (style === "wind" || style === "fighting") {
    return merged([0, 1].map((index) => {
      const arc = new THREE.TorusGeometry(17 + index * 7, style === "wind" ? 1.7 : 2.8, 4, sides, Math.PI * 1.35);
      arc.rotateY(Math.PI / 2); arc.rotateX(index * Math.PI);
      arc.translate(index * -8, 0, 0);
      return arc;
    }));
  }
  if (style === "sound" || style === "mind") {
    return merged([0, 1, 2].map((index) => {
      const ring = new THREE.TorusGeometry(9 + index * 6, 1.6, 4, sides);
      ring.rotateY(Math.PI / 2 + (style === "mind" ? index * 0.4 : 0));
      ring.translate(-index * 9, 0, 0);
      return ring;
    }));
  }
  if (style === "poison" || style === "mark") {
    return merged([0, 1, 2].map((index) => {
      const bubble = new THREE.SphereGeometry(12 - index * 3, sides, 7);
      bubble.translate(-index * 12, index === 1 ? 7 : 0, index === 2 ? -5 : 0);
      return bubble;
    }));
  }
  if (style === "stone" || style === "rock") {
    const geometry = new THREE.DodecahedronGeometry(style === "rock" ? 17 : 14, 0);
    geometry.scale(1.15, 0.88, 1.02);
    return geometry;
  }
  if (style === "light") return new THREE.OctahedronGeometry(16, 1);
  if (style === "shadow") return new THREE.IcosahedronGeometry(15, 0);
  return new THREE.IcosahedronGeometry(13, 0);
}

function accentGeometry(style, lowQuality) {
  if (style === "leaf") {
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-17, 2.7, 0), new THREE.Vector3(21, 2.7, 0),
      new THREE.Vector3(0, 2.7, 0), new THREE.Vector3(10, 2.7, 9),
      new THREE.Vector3(-8, 2.7, 0), new THREE.Vector3(1, 2.7, -8),
    ]);
  }
  if (style === "needle") {
    const points = [];
    for (let index = 0; index < 7; index += 1) points.push(new THREE.Vector3(index * 8 - 26, index % 2 ? 8 : -5, 0));
    return new THREE.BufferGeometry().setFromPoints(points);
  }
  const geometry = new THREE.TorusGeometry(["cosmic", "mind", "shadow"].includes(style) ? 23 : 19, lowQuality ? 1.5 : 2.2, 4, lowQuality ? 14 : 24, style === "wind" ? Math.PI * 1.5 : TAU);
  geometry.rotateY(Math.PI / 2 + (["cosmic", "mind", "shadow"].includes(style) ? 0.7 : 0));
  return geometry;
}

function makePoints(count, color, lowQuality, size = 5) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(color), light = new THREE.Color(0xffffff), mixed = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    mixed.copy(base).lerp(light, 0.1 + (1 - index / Math.max(1, count - 1)) * 0.48);
    mixed.toArray(colors, index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ color: 0xffffff, vertexColors: true, size: lowQuality ? size * 0.85 : size, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material);
  // A moving trail may reach outside its first-frame bounding sphere.
  points.frustumCulled = false;
  return points;
}

function safeOpacity(object, value) {
  if (!object?.material) return;
  for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.opacity = bounded(value, 0, 1);
}

/** Decorates an existing effect with at most four additional draw calls.
 * The returned update is called AFTER the caller's blanket opacity update.
 * It never changes mover.position or effect-root position/scale. Every added
 * geometry/material is attached below mesh and disposable via mesh.traverse. */
export function decorateSkillEffect(mesh, { mover = null, skillId, stage = 0, lowQuality = false } = {}) {
  if (!mesh?.isObject3D) return () => {};
  const skill = SKILLS[skillId] || SKILLS.starShot;
  const visual = getSkillVisual(skillId, { stage });
  const stageIndex = Math.round(bounded(stage, 0, 2));
  const color = new THREE.Color(visual.color), white = color.clone().lerp(new THREE.Color(0xffffff), 0.65);
  const added = [], fade = [], animated = [];
  let particleCount = 0, glyphCount = 0;
  const attach = (parent, child, opacity) => {
    child.userData.skillVfxPart = true;
    child.renderOrder = 2;
    parent.add(child); added.push(child);
    fade.push({ child, opacity });
    return child;
  };

  if (mover?.isMesh && ["projectile", "mark"].includes(skill.type)) {
    // Old models used the same sphere for most attributes. Replace only that
    // owned base geometry; the travelling position remains controlled by main.
    const previousGeometry = mover.geometry;
    mover.geometry = createSkillProjectileGeometry(visual.style, { lowQuality });
    previousGeometry?.dispose();
    mover.rotation.set(0, 0, 0);
    if (!Array.isArray(mover.material) && mover.material?.color) mover.material.color.copy(color);
    const core = attach(mover, new THREE.Mesh(new THREE.IcosahedronGeometry(visual.style === "needle" ? 3 : 7, 0), basic(white, 0.92)), 0.92);
    core.scale.set(visual.style === "needle" ? 3 : 1, 1, 1);
    const halo = attach(mover, new THREE.Mesh(new THREE.SphereGeometry(23 + stageIndex * 2, lowQuality ? 8 : 12, lowQuality ? 5 : 8), basic(color, 0.17)), 0.17);
    halo.scale.set(visual.style === "needle" || visual.style === "ice" ? 1.35 : 1, 1, 1);
    animated.push({ object: halo, kind: "halo" });
    if (!lowQuality) {
      const geometry = accentGeometry(visual.style, lowQuality);
      const accent = visual.style === "leaf" ? new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: white, transparent: true, opacity: 0.9 }))
        : visual.style === "needle" ? new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: white, transparent: true, opacity: 0.9 }))
          : new THREE.Mesh(geometry, basic(white, visual.style === "shadow" ? 0.3 : 0.65));
      attach(mover, accent, visual.style === "shadow" ? 0.3 : 0.65);
      animated.push({ object: accent, kind: ["leaf", "needle"].includes(visual.style) ? "still" : "orbit" });
    }
    particleCount = lowQuality ? 10 : Math.min(24, 16 + stageIndex * 4);
    const trail = attach(mesh, makePoints(particleCount, visual.color, lowQuality, visual.style === "sound" ? 3.5 : visual.style === "fireball" ? 7 : 5), 0.82);
    const points = trail.geometry.attributes.position;
    const history = Array.from({ length: particleCount }, () => new THREE.Vector3());
    const point = new THREE.Vector3(), current = new THREE.Vector3(), previous = new THREE.Vector3();
    const direction = new THREE.Vector3(), rotation = new THREE.Quaternion(), inverse = new THREE.Matrix4();
    let initialized = false, cursor = 0, time = 0;
    mesh.userData.skillVfx = { style: visual.style, lowQuality: Boolean(lowQuality), particleCount, glyphCount: 0, totalInstances: particleCount, additionalDrawCalls: added.length, sourceBound: true };
    return (progress = 0, delta = 1 / 60) => {
      const p = bounded(progress, 0, 1), dt = bounded(delta, 0, 0.1, 1 / 60);
      time += dt;
      mesh.updateWorldMatrix(true, true);
      mover.getWorldPosition(current);
      if (![current.x, current.y, current.z].every(Number.isFinite)) return;
      if (!initialized) {
        for (const entry of history) entry.copy(current);
        previous.copy(current); initialized = true;
      }
      direction.copy(current).sub(previous);
      if (direction.lengthSq() > 0.01) {
        rotation.setFromUnitVectors(FORWARD, direction.normalize());
        // Rotations belong to the visual projectile, not the casting creature.
        mover.quaternion.slerp(rotation, Math.min(1, 12 * dt));
      }
      previous.copy(current);
      cursor = (cursor + 1) % particleCount;
      history[cursor].copy(current);
      inverse.copy(mesh.matrixWorld).invert();
      for (let index = 0; index < particleCount; index += 1) {
        const age = index / particleCount;
        point.copy(history[(cursor - index + particleCount) % particleCount]);
        const wobble = Math.sin(time * 12 + index * 2.3) * age * (["fireball", "poison", "shadow"].includes(visual.style) ? 7 : 3);
        point.y += wobble;
        point.z += Math.cos(time * 9 + index * 1.7) * age * 4;
        point.applyMatrix4(inverse);
        points.setXYZ(index, point.x, point.y, point.z);
      }
      points.needsUpdate = true;
      for (const { child, opacity } of fade) safeOpacity(child, opacity * (1 - p * p));
      for (const { object, kind } of animated) {
        if (kind === "halo") object.scale.multiplyScalar((1 + Math.sin(time * 12) * 0.015) / (1 + Math.sin((time - dt) * 12) * 0.015));
        if (kind === "orbit") object.rotation.x = time * (visual.style === "cosmic" ? 4.1 : 2.4);
      }
      safeOpacity(mover, 0.95 * (1 - p * p * 0.7));
    };
  }

  if (skill.type === "area" || skill.type === "buff") {
    const radius = bounded(skill.radius || 60, 45, 350);
    glyphCount = lowQuality ? 6 : 12;
    particleCount = lowQuality ? 4 : 12;
    const symbolGeometry = ["fire", "ice", "light", "cosmic"].includes(skill.element) ? new THREE.OctahedronGeometry(10, 0)
      : ["earth", "rock", "metal"].includes(skill.element) ? new THREE.DodecahedronGeometry(9, 0)
        : ["wood", "wind"].includes(skill.element) ? leafGeometry(false, true)
          : new THREE.TorusGeometry(8, 1.8, 4, lowQuality ? 8 : 12);
    const symbols = attach(mesh, new THREE.InstancedMesh(symbolGeometry, basic(color, 0.8), glyphCount), 0.8);
    symbols.frustumCulled = false;
    const dust = attach(mesh, makePoints(particleCount, visual.color, lowQuality, 6), 0.75);
    const attribute = dust.geometry.attributes.position;
    let rim = null;
    if (!lowQuality) {
      const geometry = new THREE.TorusGeometry(radius * 0.54, 2.5, 4, 40, ["wind", "shadow"].includes(skill.element) ? Math.PI * 1.8 : TAU);
      geometry.rotateX(Math.PI / 2);
      rim = attach(mesh, new THREE.Mesh(geometry, basic(white, 0.5)), 0.5);
    }
    const transform = new THREE.Object3D();
    let time = 0;
    mesh.userData.skillVfx = { style: `ring-${skill.element}`, lowQuality: Boolean(lowQuality), particleCount, glyphCount, totalInstances: particleCount + glyphCount, additionalDrawCalls: added.length, sourceBound: true };
    return (progress = 0, delta = 1 / 60) => {
      const p = bounded(progress, 0, 1), dt = bounded(delta, 0, 0.1, 1 / 60);
      time += dt;
      const expansion = 0.5 + p * 0.52;
      for (let index = 0; index < glyphCount; index += 1) {
        const angle = index / glyphCount * TAU + time * (skill.element === "wind" ? 1.8 : 0.38);
        const reach = radius * expansion * (index % 2 ? 0.74 : 0.96);
        transform.position.set(Math.cos(angle) * reach, 8 + Math.sin(angle * 3 + time * 4) * 6 + (skill.type === "buff" ? 24 : 0), Math.sin(angle) * reach);
        transform.rotation.set(skill.element === "ice" ? Math.PI / 4 : time * 0.7, angle, skill.element === "wood" ? Math.sin(time * 3 + index) * 0.4 : 0);
        transform.scale.setScalar((0.6 + Math.sin(Math.PI * p) * 0.6) * (["wood", "wind"].includes(skill.element) ? 0.55 : 1));
        transform.updateMatrix(); symbols.setMatrixAt(index, transform.matrix);
      }
      symbols.instanceMatrix.needsUpdate = true;
      for (let index = 0; index < particleCount; index += 1) {
        const angle = index / particleCount * TAU + time * 0.75;
        const reach = radius * expansion * (0.55 + index % 3 * 0.12);
        attribute.setXYZ(index, Math.cos(angle) * reach, 12 + Math.sin(angle * 2 + time * 5) * 9, Math.sin(angle) * reach);
      }
      attribute.needsUpdate = true;
      if (rim) { rim.scale.setScalar(0.7 + p * 0.5); rim.rotation.y = -time * 0.4; }
      for (const { child, opacity } of fade) safeOpacity(child, opacity * Math.sin(Math.PI * Math.min(0.995, p + 0.015)));
    };
  }

  // Beam endpoints continue to be updated by the caller. These small sparks
  // stay in the existing beam's local space and cannot create a stale origin.
  particleCount = lowQuality ? 6 : 14;
  const beamAnchor = mesh.geometry ? mesh : mesh.children.find((child) => child.isMesh && !child.userData.skillVfxPart) || mesh;
  const sparks = attach(beamAnchor, makePoints(particleCount, visual.color, lowQuality, skill.type === "chain" ? 5 : 4), 0.75);
  const position = sparks.geometry.attributes.position;
  const box = new THREE.Box3(), center = new THREE.Vector3(), size = new THREE.Vector3();
  mesh.updateMatrixWorld(true);
  // Geometry-local beam coordinates may already be world-space; reading the
  // existing primitive rather than assuming (0,0,0) preserves that convention.
  if (beamAnchor.geometry) {
    beamAnchor.geometry.computeBoundingBox(); box.copy(beamAnchor.geometry.boundingBox);
  } else {
    const ray = mesh.children.find((child) => child !== sparks && child.isMesh);
    if (ray) {
      ray.geometry.computeBoundingBox(); box.copy(ray.geometry.boundingBox).applyMatrix4(ray.matrix);
    } else box.set(new THREE.Vector3(-12, -12, -12), new THREE.Vector3(12, 12, 12));
  }
  box.getCenter(center); box.getSize(size);
  size.clamp(new THREE.Vector3(12, 12, 12), new THREE.Vector3(1600, 800, 1600));
  let time = 0;
  mesh.userData.skillVfx = { style: visual.style, lowQuality: Boolean(lowQuality), particleCount, glyphCount: 0, totalInstances: particleCount, additionalDrawCalls: added.length, sourceBound: true };
  return (progress = 0, delta = 1 / 60) => {
    const p = bounded(progress, 0, 1); time += bounded(delta, 0, 0.1, 1 / 60);
    // Refresh endpoints for line-style continuous attacks. This is deliberately
    // local geometry, so a line whose coordinates are world-space is respected.
    if (beamAnchor.geometry) {
      beamAnchor.geometry.computeBoundingBox(); box.copy(beamAnchor.geometry.boundingBox);
      box.getCenter(center); box.getSize(size);
      size.clamp(new THREE.Vector3(12, 12, 12), new THREE.Vector3(1600, 800, 1600));
    }
    for (let index = 0; index < particleCount; index += 1) {
      const phase = (index / particleCount + time * 0.7) % 1;
      const sourcePositions = beamAnchor.geometry?.attributes.position;
      if (beamAnchor.isLine && sourcePositions?.count >= 2) {
        const offset = phase * (sourcePositions.count - 1), first = Math.floor(offset), next = Math.min(sourcePositions.count - 1, first + 1), blend = offset - first;
        position.setXYZ(index,
          THREE.MathUtils.lerp(sourcePositions.getX(first), sourcePositions.getX(next), blend),
          THREE.MathUtils.lerp(sourcePositions.getY(first), sourcePositions.getY(next), blend) + Math.sin(time * 20 + index) * 3,
          THREE.MathUtils.lerp(sourcePositions.getZ(first), sourcePositions.getZ(next), blend) + Math.cos(time * 16 + index) * 3);
      } else if (beamAnchor.geometry?.type === "CylinderGeometry") {
        // main scales the unit cylinder along Y to the live beam length. The
        // attached points inherit that transform without any frozen world origin.
        const height = beamAnchor.geometry.parameters.height || 1;
        position.setXYZ(index, Math.sin(time * 20 + index) * 2.5, (phase - 0.5) * height, Math.cos(time * 16 + index) * 2.5);
      } else position.setXYZ(index, center.x + size.x * (phase - 0.5), center.y + Math.sin(time * 20 + index) * Math.min(size.y * 0.35, 20), center.z + Math.cos(time * 16 + index) * Math.min(size.z * 0.35, 20));
    }
    position.needsUpdate = true;
    safeOpacity(sparks, 0.75 * (1 - p * p));
  };
}
