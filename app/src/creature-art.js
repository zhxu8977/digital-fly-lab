import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { evolutionVisualProfile, evolutionSilhouetteSignature, socialExpressionPose } from "./creature-growth.js";

// The behaviour/physics wrapper survives visual swaps. Imported meshes never
// own simulation position, health, flight capability, or connectome state.
const templates = new Map();
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const sphere = new THREE.SphereGeometry(1, 24, 16);
const crownGem = new THREE.OctahedronGeometry(1, 1);
const horn = new THREE.ConeGeometry(1, 1, 12);
const portraits = new Map();
const ASSET_ROOT = "/models/creature-monsters/";
const ANIMAL_ROOT = "/models/creature-animals/";
const clamp = THREE.MathUtils.clamp;
const stageOf = (species) => clamp(Number(species?.stage) || 0, 0, 2);
const silhouetteOf = (species) => typeof species?.assetHint === "string" ? species.assetHint : species?.assetHint?.silhouette || species?.features?.[0] || "dragon";
const colorOf = (species, part, fallback) => new THREE.Color(species?.colors?.[part] || fallback);

function assetDefinition(species) {
  const stage = stageOf(species), type = silhouetteOf(species);
  const monster = (file, portrait = file, extras = {}) => ({ url: `${ASSET_ROOT}${encodeURIComponent(file)}.glb`, portrait, ...extras });
  const animal = (file, extras = {}) => ({ url: `${ANIMAL_ROOT}${encodeURIComponent(file)}.glb`, portrait: file, quadruped: true, ...extras });
  switch (type) {
    case "dragon": return monster(stage ? "Dragon Evolved" : "Dragon");
    case "rabbit": return monster("Bunny");
    case "bird": return monster("Hywirl");
    case "moth": return monster(stage ? "Armabee Evolved" : "Armabee");
    case "sheep": return monster(stage ? "Alpaking Evolved" : "Alpaking");
    case "shroom": return monster(stage === 2 ? "Mushroom King" : stage ? "Mushnub Evolved" : "Mushnub");
    case "golem": return monster(stage ? "Goleling Evolved" : "Goleling", stage ? "Goleling Evolved" : "Goleling", { hovering: true });
    case "fox": return animal("Fox");
    case "deer": return animal(stage ? "Stag" : "Deer", stage ? { materialAliases: { "Material.011": "Eyes" } } : {});
    case "bat": return { url: "/models/creature-pack/Bat.fbx", texture: "/models/creature-pack/Bat_Texture.png", portrait: "Ghost", fbx: true };
    case "penguin": return { url: "/models/creature-pack/Penguin.fbx", texture: "/models/creature-pack/Penguin_Texture.png", portrait: "Birb", fbx: true, wobble: true };
    // Preserve the short-legged plush and true quadruped rigs: the monster
    // pack's Cat is upright and would regress the existing four-foot gait.
    default: return null;
  }
}

export function speciesAssetUrl(species) { return assetDefinition(species)?.url || null; }

export function getSpeciesPortrait(species) {
  // The old pack only has two portraits for most three-stage families. Reusing
  // that evolved portrait made the final form look unlocked but unchanged.
  // These original dex illustrations use the same stage silhouette contract
  // as the model; the live preview remains the actual animated 3D creature.
  const key = `${species?.id}|${evolutionSilhouetteSignature(species)}|${JSON.stringify(species?.colors)}`;
  if (!portraits.has(key)) portraits.set(key, paintedPortrait(species));
  return portraits.get(key);
}

function paintedPortrait(species) {
  const type = silhouetteOf(species), stage = stageOf(species);
  const profile = evolutionVisualProfile(species);
  const body = colorOf(species, "body", "#d5bba6").getStyle(), accent = colorOf(species, "accent", "#ad83ce").getStyle(), belly = colorOf(species, "belly", "#fff3df").getStyle();
  const round = ["bear", "hamster", "otter"].includes(type);
  let ears = round ? `<circle cx="74" cy="49" r="20" fill="${body}"/><circle cx="166" cy="49" r="20" fill="${body}"/><circle cx="74" cy="49" r="11" fill="${accent}"/><circle cx="166" cy="49" r="11" fill="${accent}"/>` : `<path d="M58 73 Q41 7 83 35 L103 71 M138 71 L158 35 Q201 7 183 75" fill="${body}"/>`;
  if (type === "penguin") ears = `<path d="M75 94 Q25 110 60 172 M168 94 Q216 110 180 172" fill="${accent}"/>`;
  if (type === "bat") ears += `<path d="M79 86 Q22 65 12 126 Q46 111 52 156 L85 144 M161 86 Q218 65 228 126 Q194 111 188 156 L155 144" fill="${accent}"/>`;
  if (type === "turtle") ears = `<ellipse cx="120" cy="135" rx="78" ry="63" fill="${accent}"/><path d="M58 111 L92 89 143 90 181 114 M52 136 L88 125 151 125 187 140" stroke="${body}" stroke-width="5" fill="none"/>`;
  const mane = type === "lion" ? `<circle cx="120" cy="92" r="73" fill="${accent}"/>` : "";
  const crest = stage === 0 ? "" : stage === 1 ? `<path d="M96 50 Q76 17 106 29 L121 8 135 30 Q159 18 145 52" fill="${accent}" stroke="${belly}" stroke-width="2"/>` : `<path d="M81 57 L66 15 102 32 120 2 140 31 176 15 161 59Z" fill="${accent}" stroke="${belly}" stroke-width="3"/><circle cx="120" cy="28" r="7" fill="${belly}"/>`;
  const winged = ["dragon", "bird", "moth", "bat", "sheep", "golem"].includes(type);
  const wings = winged ? `<path d="M92 133 Q${stage === 2 ? 8 : 27} ${stage === 2 ? 9 : 43} ${stage === 2 ? 5 : 20} 117 Q33 132 42 158 L77 170 M148 133 Q${stage === 2 ? 232 : 213} ${stage === 2 ? 9 : 43} ${stage === 2 ? 235 : 220} 117 Q207 132 198 158 L163 170" fill="${accent}" stroke="${belly}" stroke-width="3"/>` : "";
  const shoulders = stage ? `<path d="M74 118 L${stage === 2 ? 35 : 50} 108 57 143 86 157 M166 118 L${stage === 2 ? 205 : 190} 108 183 143 154 157" fill="${accent}" stroke="${belly}" stroke-width="2"/>` : "";
  const bodyWidth = [45, 48, 56][stage], bodyY = [145, 147, 144][stage], headWidth = [63, 54, 49][stage], headHeight = [53, 48, 45][stage];
  const brows = stage ? `<path d="M87 80 L106 84 M134 84 L153 80" stroke="${accent}" stroke-width="${stage === 2 ? 5 : 3}" stroke-linecap="round"/>` : "";
  const antlers = type === "deer" ? `<path d="M83 70 L73 25 M77 41 L56 30 M76 43 L90 22 M157 70 L167 25 M163 41 L184 30 M164 43 L150 22 ${stage === 2 ? 'M72 29 L64 9 M168 29 L176 9' : ''}" stroke="${accent}" stroke-width="${stage + 5}" stroke-linecap="round" fill="none"/>` : "";
  const cap = type === "shroom" ? `<path d="M45 75 Q45 ${30 - stage * 12} 120 ${24 - stage * 6} Q199 ${30 - stage * 12} 195 76 Z" fill="${accent}"/><ellipse cx="83" cy="55" rx="10" ry="6" fill="${belly}"/><ellipse cx="140" cy="45" rx="13" ry="8" fill="${belly}"/><ellipse cx="170" cy="61" rx="8" ry="5" fill="${belly}"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 220" data-form="${profile.maturity}"><defs><radialGradient id="bg"><stop stop-color="${belly}"/><stop offset="1" stop-color="${body}" stop-opacity=".15"/></radialGradient><linearGradient id="fur" x2=".5" y2="1"><stop stop-color="${body}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="240" height="220" rx="32" fill="url(#bg)"/><ellipse cx="120" cy="202" rx="66" ry="9" fill="${accent}" opacity=".15"/>${wings}${shoulders}${ears}${mane}${antlers}<ellipse cx="120" cy="${bodyY}" rx="${bodyWidth}" ry="${[54, 59, 65][stage]}" fill="url(#fur)"/><ellipse cx="120" cy="151" rx="${[31, 29, 31][stage]}" ry="${[37, 41, 44][stage]}" fill="${belly}"/><ellipse cx="120" cy="91" rx="${headWidth}" ry="${headHeight}" fill="${body}"/><ellipse cx="120" cy="113" rx="${[35, 31, 28][stage]}" ry="${[24, 21, 19][stage]}" fill="${belly}"/>${cap}${crest}${brows}<ellipse cx="96" cy="90" rx="${stage === 0 ? 9 : 8}" ry="${stage === 0 ? 13 : 10}" fill="#253439"/><ellipse cx="144" cy="90" rx="${stage === 0 ? 9 : 8}" ry="${stage === 0 ? 13 : 10}" fill="#253439"/><circle cx="98" cy="86" r="3" fill="#fff"/><circle cx="146" cy="86" r="3" fill="#fff"/><ellipse cx="120" cy="106" rx="10" ry="7" fill="#34424a"/><path d="M111 119 Q120 130 130 119" stroke="#34424a" stroke-width="3" stroke-linecap="round" fill="none"/><ellipse cx="82" cy="111" rx="10" ry="5" fill="#efa3b6" opacity="${stage === 0 ? 0.6 : 0.25}"/><ellipse cx="158" cy="111" rx="10" ry="5" fill="#efa3b6" opacity="${stage === 0 ? 0.6 : 0.25}"/><ellipse cx="90" cy="195" rx="${stage === 2 ? 23 : 20}" ry="12" fill="${belly}"/><ellipse cx="150" cy="195" rx="${stage === 2 ? 23 : 20}" ry="12" fill="${belly}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function materialFor(color) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.86, metalness: 0, sheen: 0.75, sheenColor: color, sheenRoughness: 0.8 });
}

function addBlob(parent, material, at, scale) {
  const mesh = new THREE.Mesh(sphere, material); mesh.position.set(...at); mesh.scale.set(...scale); mesh.castShadow = true; parent.add(mesh); return mesh;
}

function addHorn(parent, material, at, scale, rotationZ = 0) {
  const mesh = new THREE.Mesh(horn, material); mesh.position.set(...at); mesh.scale.set(...scale); mesh.rotation.z = rotationZ; mesh.castShadow = true; parent.add(mesh); return mesh;
}

function makeEvolutionDetails(species, materials, height) {
  const profile = evolutionVisualProfile(species), type = silhouetteOf(species);
  const details = new THREE.Group(); details.name = `EvolutionSilhouette-${profile.maturity}`;
  const head = new THREE.Group(); head.name = "HeadGrowth"; details.add(head);
  const body = new THREE.Group(); body.name = "BodyGrowth"; details.add(body);
  const [main, accent, cream] = materials;
  const s = height / 110;
  if (profile.stage === 0) {
    // A very small rounded forelock, not the same adult crown scaled down.
    addBlob(head, main, [-5 * s, 22 * s, 0], [5 * s, 4 * s, 7 * s]);
  } else {
    const crestHeight = (profile.stage === 2 ? 19 : 11) * s;
    const creatureWithHorns = ["dragon", "deer", "sheep", "golem", "turtle"].includes(type);
    for (let index = 0; index < profile.plumeCount; index++) {
      const offset = index - (profile.plumeCount - 1) / 2;
      if (creatureWithHorns) {
        addHorn(head, accent, [-7 * s, 22 * s + crestHeight * 0.28, offset * 9 * s], [5 * s, crestHeight * (1 - Math.abs(offset) * 0.13), 4 * s], -0.32);
      } else {
        const feather = addBlob(head, accent, [-10 * s - Math.abs(offset) * 3 * s, 20 * s + crestHeight * 0.35, offset * 8 * s], [6 * s, crestHeight * 0.56, 4 * s]);
        feather.rotation.z = -0.5; feather.rotation.x = offset * 0.18;
      }
    }
    // A real ruff/shoulder silhouette, anchored on the chest rather than a
    // disc placed on the belly. These are wearable/physical growth features;
    // skin stripes remain shader-painted directly into the body material.
    for (const side of [-1, 1]) {
      for (let layer = 0; layer < profile.shoulderLayers; layer++) {
        const upright = ["biped", "corgi"].includes(species.bodyType);
        const x = upright ? 0 : height * 0.19;
        const y = height * (upright ? 0.62 : 0.43) - layer * 4 * s;
        const lobe = addBlob(body, layer ? cream : accent, [x - layer * 6 * s, y, side * (19 + layer * 5) * s], [(13 + layer * 2) * s, 9 * s, (8 + layer * 3) * s]);
        lobe.rotation.x = side * 0.35;
      }
    }
    for (let i = 0; i < profile.tailFanCount; i++) {
      const side = i - (profile.tailFanCount - 1) / 2;
      const feather = addBlob(body, i % 2 ? cream : accent, [-height * 0.27 - Math.abs(side) * 4 * s, height * 0.24 + Math.abs(side) * 3 * s, side * 11 * s], [18 * s, 6 * s, 5 * s]);
      feather.rotation.y = side * 0.28; feather.rotation.z = -0.25;
    }
    if (profile.stage === 2) {
      const winged = species.bodyType === "aerial";
      for (const side of [-1, 1]) {
        for (let layer = 0; layer < 3; layer++) {
          const plume = addBlob(body, layer === 1 ? cream : accent, [-height * 0.07 - layer * 5 * s, height * (winged ? 0.54 : 0.48) + layer * 6 * s, side * (26 + layer * 8) * s], [(winged ? 23 : 14) * s, 5 * s, 7 * s]);
          plume.rotation.x = side * (0.48 + layer * 0.12); plume.rotation.y = side * -0.25;
        }
      }
      // Rear mantle ridge makes the final outline unmistakable from behind.
      for (let i = 0; i < 3; i++) addHorn(body, accent, [-height * 0.12 - i * 12 * s, height * (species.bodyType === "cat" ? 0.52 : 0.59) - i * 4 * s, 0], [6 * s, (18 - i * 3) * s, 6 * s], -0.6);
    }
  }
  details.userData = { head, body, profile, silhouette: evolutionSilhouetteSignature(species), height };
  return details;
}

function updateEvolutionDetails(wrapper) {
  const details = wrapper.userData.evolutionDetails;
  if (!details) return;
  const source = wrapper.userData.assetHeadBone || wrapper.userData.headRig;
  if (!source) return;
  const p = new THREE.Vector3(); source.getWorldPosition(p); wrapper.worldToLocal(p);
  details.userData.head.position.copy(p);
  const sourceQuaternion = new THREE.Quaternion(); source.getWorldQuaternion(sourceQuaternion);
  const wrapperQuaternion = new THREE.Quaternion(); wrapper.getWorldQuaternion(wrapperQuaternion);
  details.userData.headBindOrientation ||= sourceQuaternion.clone().invert().multiply(wrapperQuaternion);
  sourceQuaternion.multiply(details.userData.headBindOrientation);
  details.userData.head.quaternion.copy(wrapperQuaternion.invert().multiply(sourceQuaternion));
}

function makeVisualContainer(wrapper) {
  const visual = new THREE.Group(); visual.name = "OriginalSpeciesVisual";
  // Animation code holds references to the joints, so grouping does not alter
  // those joint coordinates. Species size is outside the animated hierarchy.
  for (const child of [...wrapper.children]) {
    if (!child.userData.duelHud) visual.add(child);
  }
  wrapper.add(visual); wrapper.userData.fallbackVisual = visual;
  return visual;
}

function eyeLandmarks(wrapper, head, scene) {
  const points = [], materials = new Set(), eyeCenters = new Map(), glints = [];
  if (scene) {
    wrapper.updateMatrixWorld(true);
    scene.traverse((node) => {
      if (!node.isMesh) return;
      const list = Array.isArray(node.material) ? node.material : [node.material];
      const up = new THREE.Vector3(0, 1, 0), wrapperQ = new THREE.Quaternion(), inverseNodeQ = new THREE.Quaternion();
      wrapper.getWorldQuaternion(wrapperQ); node.getWorldQuaternion(inverseNodeQ);
      up.applyQuaternion(wrapperQ).applyQuaternion(inverseNodeQ.invert()).normalize();
      const groups = node.geometry.groups.length ? node.geometry.groups : [{ start: 0, count: node.geometry.index?.count || node.geometry.attributes.position.count, materialIndex: 0 }];
      for (const group of groups) {
        const material = list[group.materialIndex];
        if (!/eye[_ ]?(white|black)|^eyes$/i.test(material?.name || "")) continue;
        materials.add(material);
        let minY = Infinity, maxY = -Infinity;
        const stride = Math.max(1, Math.floor(group.count / 80));
        for (let index = group.start; index < group.start + group.count; index += stride) {
          const vertex = node.geometry.index ? node.geometry.index.getX(index) : index;
          const bindPosition = new THREE.Vector3().fromBufferAttribute(node.geometry.attributes.position, vertex);
          const bindY = bindPosition.dot(up); minY = Math.min(minY, bindY); maxY = Math.max(maxY, bindY);
          const p = new THREE.Vector3(); node.getVertexPosition(vertex, p); p.applyMatrix4(node.matrixWorld); wrapper.worldToLocal(p); points.push(p);
        }
        if (Number.isFinite(minY)) eyeCenters.set(material, { center: (minY + maxY) / 2, axis: up });
      }
    });
  } else if (head) {
    for (const child of head.children) {
      if (!child.isMesh || child.geometry?.type !== "SphereGeometry" || child.position.y < 0 || child.position.x < 8 || Math.abs(child.position.z) < 7) continue;
      const hsl = {}; child.material?.color?.getHSL(hsl);
      if (hsl.l > 0.85 && (child.geometry.parameters?.radius || 0) < 3) { glints.push(child); continue; }
      if (!(hsl.l < 0.25) || (child.geometry.parameters?.radius || 0) < 3) continue;
      // Eyes sometimes share a material with the nose; isolate only the eyes
      // so an eyelid does not recolour the entire face or whiskers.
      child.material = child.material.clone(); wrapper.userData.speciesMaterials.push(child.material); materials.add(child.material); eyeCenters.set(child.material, { center: 0, axis: new THREE.Vector3(0, 1, 0) });
      const p = new THREE.Vector3(); child.getWorldPosition(p); wrapper.worldToLocal(p); points.push(p);
    }
  }
  if (!points.length) return null;
  const bounds = new THREE.Box3().setFromPoints(points), center = bounds.getCenter(new THREE.Vector3());
  center.x = bounds.max.x + 0.7;
  return { center, width: Math.max(12, bounds.max.z - bounds.min.z), materials: [...materials], eyeCenters, glints };
}

function addEyeBlinkShader(material, { center = 0, axis = new THREE.Vector3(0, 1, 0) } = {}) {
  const before = material.onBeforeCompile, beforeKey = material.customProgramCacheKey.bind(material), key = beforeKey();
  const uniform = { value: 0 };
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.socialEyeBlink = uniform;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float socialEyeBlink;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvec3 socialEyeUp = vec3(${axis.toArray().map((value) => value.toFixed(6)).join(",")});\ntransformed -= socialEyeUp * (dot(transformed, socialEyeUp) - ${Number(center).toFixed(6)}) * socialEyeBlink * 0.96;`);
  };
  material.customProgramCacheKey = () => `${key}|social-eyelid-${center.toFixed(3)}-${axis.toArray().join(",")}`;
  material.userData.eyeBlinkUniform = uniform; material.needsUpdate = true;
  uniform.restore = () => {
    material.onBeforeCompile = before; material.customProgramCacheKey = beforeKey;
    delete material.userData.eyeBlinkUniform; material.needsUpdate = true;
  };
  return uniform;
}

function makeFaceExpression(wrapper, head, scene, species) {
  if (!head) return null;
  wrapper.updateMatrixWorld(true);
  const eyes = eyeLandmarks(wrapper, head, scene);
  if (!eyes) return null;
  const root = new THREE.Group(); root.name = "SocialFaceOverlay";
  const color = colorOf(species, "body", "#d5bba6");
  const eyeMaterials = eyes.materials.map((material) => ({ material, color: material.color.clone(), blink: addEyeBlinkShader(material, eyes.eyeCenters.get(material)) }));
  const bindPoint = wrapper.localToWorld(eyes.center.clone()); head.worldToLocal(bindPoint);
  const headQuaternion = new THREE.Quaternion(); head.getWorldQuaternion(headQuaternion);
  const wrapperQuaternion = new THREE.Quaternion(); wrapper.getWorldQuaternion(wrapperQuaternion);
  const bindOrientation = headQuaternion.invert().multiply(wrapperQuaternion);
  const radius = eyes.width * 0.015;
  const smilePoints = [-1, -0.5, 0, 0.5, 1].map((v) => new THREE.Vector3(0, -eyes.width * 0.26 - Math.cos(v * Math.PI / 2) * eyes.width * 0.12, v * eyes.width * 0.19));
  const smile = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smilePoints), 16, Math.max(0.4, radius), 6, false), new THREE.MeshBasicMaterial({ color: 0x35404a, transparent: true, opacity: 0, depthWrite: false }));
  root.add(smile);
  const cheeks = [];
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0xee92ab, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    cheek.rotation.y = Math.PI / 2; cheek.position.set(0, -eyes.width * 0.15, side * eyes.width * 0.53); cheek.scale.set(eyes.width * 0.1, eyes.width * 0.06, 1); root.add(cheek); cheeks.push(cheek);
  }
  wrapper.add(root);
  return {
    root, head, bindPoint, bindOrientation, eyeMaterials, bodyColor: color, smile, cheeks,
    update(pose) {
      // Flatten the eye surfaces before skinning, so closing the eyes follows
      // the animated head. Do not fake a blink by recolouring the entire face.
      for (const eye of eyeMaterials) eye.blink.value = pose.blink;
      eyes.glints.forEach((glint) => { glint.visible = pose.blink < 0.65; });
      smile.material.opacity = pose.smile * 0.9;
      cheeks.forEach((cheek) => { cheek.material.opacity = pose.blush * 0.45; });
      const point = head.localToWorld(bindPoint.clone()); wrapper.worldToLocal(point); root.position.copy(point);
      const q = new THREE.Quaternion(); head.getWorldQuaternion(q); q.multiply(bindOrientation);
      const inverse = new THREE.Quaternion(); wrapper.getWorldQuaternion(inverse); root.quaternion.copy(inverse.invert().multiply(q));
      root.visible = pose.smile > 0.01 || pose.blush > 0.01;
    },
    dispose() { eyeMaterials.forEach((eye) => eye.blink.restore()); eyes.glints.forEach((glint) => { glint.visible = true; }); },
  };
}

function clearLocalSocialTransform(wrapper) {
  const state = wrapper.userData.socialTransform;
  if (!state) return;
  for (const entry of state) {
    entry.visual.position.copy(entry.position); entry.visual.quaternion.copy(entry.quaternion); entry.visual.scale.copy(entry.scale);
  }
  delete wrapper.userData.socialTransform;
}

/** Called once after animation/gaze, before the final floor guard. */
export function applySocialExpression(wrapper, context = {}) {
  if (!wrapper?.userData) return socialExpressionPose(context);
  clearLocalSocialTransform(wrapper);
  const pose = socialExpressionPose(context);
  const visual = wrapper.userData.assetVisual || wrapper.userData.fallbackVisual;
  const head = wrapper.userData.headRig;
  if (wrapper.userData.assetGaze) {
    head.userData.socialRoll = pose.headTilt; head.userData.socialPitch = pose.headNod;
    wrapper.userData.assetGaze.apply();
  } else if (head) {
    const previous = wrapper.userData.socialHeadPose;
    // Procedural gait usually replaces the head rotation. Only undo our prior
    // offset if no new joint animation has replaced it in the meantime.
    if (previous && Math.abs(head.quaternion.dot(previous.output)) > 0.999999) head.quaternion.copy(previous.input);
    const input = head.quaternion.clone();
    head.rotation.x += pose.headTilt; head.rotation.z += pose.headNod;
    wrapper.userData.socialHeadPose = { input, output: head.quaternion.clone() };
    const previousScale = wrapper.userData.speciesHeadScale;
    if (previousScale && head.scale.distanceToSquared(previousScale.output) < 1e-12) head.scale.copy(previousScale.input);
    const scaleInput = head.scale.clone(); head.scale.multiplyScalar(wrapper.userData.evolutionProfile?.headScale || 1);
    wrapper.userData.speciesHeadScale = { input: scaleInput, output: head.scale.clone() };
  }
  if (visual && pose.reaction) {
    const visuals = [visual, wrapper.userData.evolutionDetails?.userData.body].filter(Boolean);
    wrapper.userData.socialTransform = visuals.map((part) => ({ visual: part, position: part.position.clone(), quaternion: part.quaternion.clone(), scale: part.scale.clone() }));
    const h = wrapper.userData.artHeight || 110;
    const pivot = new THREE.Vector3(0, h * 0.4, 0);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.bodyRoll, 0, pose.bodyLean));
    for (const part of visuals) {
      part.quaternion.premultiply(rotation);
      part.position.add(pivot).sub(pivot.clone().applyQuaternion(rotation));
      part.position.y += h * pose.bounce;
      part.scale.multiply(new THREE.Vector3(1 + pose.squash, 1 - pose.squash, 1 + pose.squash * 0.65));
    }
  }
  wrapper.userData.socialPose = pose;
  wrapper.userData.faceExpression?.update(pose);
  updateEvolutionDetails(wrapper);
  return pose;
}

function paintMarkings(material, species) {
  if (!material.color || material.userData.speciesPainted) return;
  const originalCompiler = material.onBeforeCompile, originalKey = material.customProgramCacheKey.bind(material);
  const accent = colorOf(species, "accent", "#b69fd6"), style = silhouetteOf(species), stage = stageOf(species);
  material.userData.speciesPainted = true;
  material.onBeforeCompile = (shader, renderer) => {
    originalCompiler.call(material, shader, renderer);
    shader.uniforms.speciesAccent = { value: accent };
    shader.uniforms.speciesMarkIntensity = { value: stage > 0 ? 0.3 : 0.12 };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSpeciesPosition;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvSpeciesPosition = position;");
    const pattern = ["cat", "fox", "lion"].includes(style) ? "smoothstep(0.84, 0.96, sin(vSpeciesPosition.y * 0.17 + vSpeciesPosition.x * 0.075))" : "smoothstep(0.87, 0.98, sin(vSpeciesPosition.y * 0.16) * cos(vSpeciesPosition.z * 0.2))";
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vSpeciesPosition;\nuniform vec3 speciesAccent;\nuniform float speciesMarkIntensity;").replace("#include <color_fragment>", `#include <color_fragment>\nfloat speciesMark = ${pattern};\ndiffuseColor.rgb = mix(diffuseColor.rgb, speciesAccent, speciesMark * speciesMarkIntensity);`);
  };
  const priorKey = originalKey();
  material.customProgramCacheKey = () => `${priorKey}|spirit-coat-${style}-${stage}`;
  material.needsUpdate = true;
}

export function applySpeciesAppearance(mesh, species, { rival = false } = {}) {
  if (!mesh || !species) return mesh;
  releaseSpeciesAppearance(mesh, { disposeFallback: false });
  mesh.userData.artGeneration = (mesh.userData.artGeneration || 0) + 1;
  mesh.userData.speciesId = species.id;
  mesh.userData.speciesName = species.name;
  mesh.userData.skinName = species.name;
  mesh.userData.speciesStage = stageOf(species);
  mesh.userData.evolutionProfile = evolutionVisualProfile(species);
  mesh.userData.silhouetteSignature = evolutionSilhouetteSignature(species);
  mesh.userData.bodyType = species.bodyType;
  mesh.userData.artSource = "original-plush-rig";
  const body = colorOf(species, "body", "#d6b9aa"), accent = colorOf(species, "accent", "#ae89be"), belly = colorOf(species, "belly", "#fff1d8");
  const materials = new Map();
  mesh.traverse((child) => {
    if (!child.isMesh || child.userData.duelHud) return;
    const recolor = (source) => {
      if (!source?.color) return source;
      if (materials.has(source)) return materials.get(source);
      const copy = source.clone(), hsl = {}; source.color.getHSL(hsl);
      // Three material.clone intentionally omits custom shader callbacks.
      // Preserve existing painted corgi belly/face and cat coat shaders.
      copy.onBeforeCompile = source.onBeforeCompile;
      copy.customProgramCacheKey = source.customProgramCacheKey.bind(source);
      if (hsl.l > 0.16) {
        copy.color.copy(hsl.l > 0.82 && hsl.s < 0.5 ? belly : hsl.s > 0.13 ? body : accent);
        if (copy.sheenColor) copy.sheenColor.copy(copy.color);
        if (copy.emissive) { copy.emissive.copy(accent); copy.emissiveIntensity = Math.min(copy.emissiveIntensity || 0, 0.08); }
        if (!copy.transparent && child.geometry?.type !== "TorusGeometry") paintMarkings(copy, species);
      }
      materials.set(source, copy); return copy;
    };
    child.material = Array.isArray(child.material) ? child.material.map(recolor) : recolor(child.material);
  });
  for (const source of materials.keys()) source.dispose();
  mesh.userData.speciesMaterials = [...materials.values()];
  mesh.userData.artFallbackObjects = [...mesh.children];
  mesh.userData.artFallbackHeadRig = mesh.userData.headRig;
  const adornment = new THREE.Group(); adornment.name = "SpeciesSilhouette"; mesh.add(adornment);
  mesh.userData.speciesAdornment = adornment;
  const type = silhouetteOf(species), stage = stageOf(species);
  const matBody = materialFor(body), matAccent = materialFor(accent), matBelly = materialFor(belly);
  mesh.userData.speciesMaterials.push(matBody, matAccent, matBelly);
  const head = mesh.userData.headRig;
  if (["bear", "hamster", "otter"].includes(type) && head) {
    // Keep the plush joint hierarchy but replace tall dog ears with small
    // rounded ears and a distinct muzzle/face silhouette.
    head.children.filter((child) => child.isMesh && child.position.y > 20).forEach((child) => { child.visible = false; });
    const headDetails = new THREE.Group(); head.add(headDetails); adornment.userData.headDetails = headDetails;
    [-1, 1].forEach((side) => {
      addBlob(headDetails, matBody, [-5, 24, side * 25], [12, 13, 10]);
      addBlob(headDetails, matAccent, [1, 26, side * 26], [4, 7, 6]);
    });
    if (type === "hamster") [-1, 1].forEach((side) => addBlob(headDetails, matBody, [22, -8, side * 17], [13, 12, 14]));
    if (type === "otter") addBlob(adornment, matBody, [-27, 30, 0], [32, 10, 13]);
  }
  if (type === "turtle") {
    addBlob(adornment, matAccent, [-10, 36, 0], [40, 30, 30]);
    // Shell segmentation is painted into the actual shell material.
    paintMarkings(matAccent, { ...species, stage: 2 });
    if (head) head.children.filter((child) => child.isMesh && child.geometry?.type === "ConeGeometry").forEach((child) => { child.visible = false; });
  }
  if (type === "lion" && head) {
    const mane = new THREE.Group(); head.add(mane); adornment.userData.headDetails = mane;
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * Math.PI * 2;
      addBlob(mane, matAccent, [-10, Math.sin(angle) * 26, Math.cos(angle) * 25], [12, 13, 13]);
    }
  }
  const profile = mesh.userData.evolutionProfile;
  const nominalHeight = species.bodyType === "biped" ? 175 : species.bodyType === "corgi" ? 132 : species.bodyType === "cat" ? 102 : 106;
  const visual = makeVisualContainer(mesh); visual.scale.set(profile.size * profile.bodyScale, profile.size, profile.size * profile.bodyScale);
  mesh.userData.artFallbackObjects = [visual];
  mesh.userData.artHeight = nominalHeight * visual.scale.y;
  mesh.userData.bodyVisualHeight = mesh.userData.artHeight;
  mesh.userData.evolutionDetails = makeEvolutionDetails(species, [matBody, matAccent, matBelly], mesh.userData.artHeight);
  mesh.add(mesh.userData.evolutionDetails);
  mesh.userData.faceExpression = makeFaceExpression(mesh, head, null, species);
  updateEvolutionDetails(mesh);
  mesh.userData.speciesRival = rival;
  return mesh;
}

function loadTemplate(definition) {
  if (templates.has(definition.url)) return templates.get(definition.url);
  const promise = definition.fbx ? fbxLoader.loadAsync(definition.url).then((scene) => ({ scene, animations: scene.animations })) : gltfLoader.loadAsync(definition.url);
  const cached = promise.catch((error) => { templates.delete(definition.url); throw error; });
  templates.set(definition.url, cached); return cached;
}

function clipMatching(clips, names) {
  for (const name of names) {
    const exact = clips.find((clip) => clip.name.split("|").pop().toLowerCase() === name.toLowerCase());
    if (exact) return exact;
  }
  return null;
}

function makeAnimator(scene, clips, entityWrapper, definition) {
  const mixer = new THREE.AnimationMixer(scene);
  const idle = clipMatching(clips, ["Idle", "Flying_Idle", "Flying"]);
  const clipMap = {
    idle: idle || clips[0],
    walk: clipMatching(clips, ["Walk", "Flying_Idle", "Flying"]) || idle,
    run: clipMatching(clips, ["Run", "Gallop", "Fast_Flying", "Run2", "Walk", "Flying"]) || idle,
    jump: clipMatching(clips, ["Jump_Idle", "Gallop_Jump", "Jump", "Flying"]),
    attack: clipMatching(clips, ["Punch", "Attack", "Bite_Front", "Headbutt", "Attack_Headbutt"]),
    ranged: clipMatching(clips, ["Weapon", "Punch", "Bite_Front", "Attack", "Headbutt"]),
    hurt: clipMatching(clips, ["HitReact", "HitRecieve", "Idle_HitReact_Left"]),
    down: clipMatching(clips, ["Death"]),
    eating: clipMatching(clips, ["Eating", "Bite_InPlace", "Yes", "Idle"]),
    happy: clipMatching(clips, ["Dance", "Wave", "Yes", "Jump"]),
  };
  let current = null, currentKey = "", elapsed = 0, keyElapsed = 0, consumedHit = false;
  const actions = new Map();
  const jointScales = new Map();
  const visualProfile = entityWrapper.userData.evolutionProfile || evolutionVisualProfile();
  for (const name of ["Head", "Wing1.L", "Wing1.R"]) {
    const joint = scene.getObjectByName(name);
    if (joint) jointScales.set(joint, { scale: joint.scale.clone(), multiplier: name === "Head" ? visualProfile.headScale : visualProfile.wingScale });
  }
  function setClip(key) {
    const clip = clipMap[key] || clipMap.idle;
    if (!clip || currentKey === key) return;
    const action = actions.get(clip) || mixer.clipAction(clip); actions.set(clip, action);
    const oneShot = key === "down" || key === "hurt";
    action.enabled = true; action.clampWhenFinished = oneShot;
    action.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
    action.reset().setEffectiveWeight(1).play();
    if (current && current !== action) current.crossFadeTo(action, key === "hurt" ? 0.065 : 0.15, false);
    current = action; currentKey = key; keyElapsed = 0;
  }
  setClip("idle"); mixer.update(0.001);
  entityWrapper.userData.assetHasDownClip = !!clipMap.down;
  return {
    mixer,
    update(delta, entity = {}, context = {}) {
      clearLocalSocialTransform(entityWrapper);
      const dt = Math.min(0.06, Math.max(0, delta || 0)); elapsed += dt;
      const speed = Math.abs(entity.speed || 0), groundAction = entity.groundAction || "";
      const knocked = Boolean(context.knockedDown || entity.ragdollControlLocked || entity.knockedDown);
      const attacking = context.attacking || entity.attacking;
      const eating = context.eating || entity.forageState === "eating" || ["eat", "taste", "chew"].includes(entity.foragingPhase) || entity.animationState === "eat";
      const happy = ["celebrate", "happy", "greeting", "proud", "rub", "affection"].includes(context.reaction);
      if (!context.hit) consumedHit = false;
      if (currentKey === "hurt" && keyElapsed >= Math.min(clipMap.hurt?.duration || 0.4, 0.5)) consumedHit = true;
      let key = knocked ? "down" : context.hit && !consumedHit ? "hurt" : attacking ? (attacking?.type === "melee" ? "attack" : "ranged") : happy ? "happy" : eating ? "eating" : entity.altitude > 8 && entityWrapper.userData.bodyType !== "aerial" ? "jump" : speed > 75 || /run|sprint|dash|dodge/.test(groundAction) ? "run" : speed > 4 ? "walk" : "idle";
      setClip(key);
      keyElapsed += dt;
      if (current) current.setEffectiveTimeScale(key === "run" ? clamp(speed / 180, 0.95, 1.8) : key === "walk" ? clamp(speed / 80, 0.62, 1.25) : key === "down" ? 1.35 : 1);
      entityWrapper.userData.assetGaze?.restoreAnimationPose();
      for (const [joint, state] of jointScales) joint.scale.copy(state.scale);
      mixer.update(dt);
      for (const [joint, state] of jointScales) { state.scale.copy(joint.scale); joint.scale.multiplyScalar(state.multiplier); }
      entityWrapper.userData.assetGaze?.captureAnimationPose();
      if (definition.wobble && !knocked) {
        scene.rotation.z = Math.sin(elapsed * (speed > 75 ? 14 : 7)) * (speed > 4 ? 0.10 : 0.012);
        scene.position.y = Math.abs(Math.sin(elapsed * 7)) * (speed > 4 ? 0.05 : 0);
      }
      entityWrapper.userData.animationState = key;
      updateEvolutionDetails(entityWrapper);
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(scene); actions.clear(); },
  };
}

function makeAssetGaze(wrapper, headBone) {
  if (!headBone) return null;
  // Existing game head controls use a +X-forward creature. Artist bone axes
  // vary between packs, so map those controls through the bone parent's basis.
  const proxy = new THREE.Object3D(), animatedPose = headBone.quaternion.clone();
  const inverseParent = new THREE.Quaternion(), bodyBasis = new THREE.Quaternion();
  const yawAxis = new THREE.Vector3(), pitchAxis = new THREE.Vector3(), rollAxis = new THREE.Vector3();
  const yaw = new THREE.Quaternion(), pitch = new THREE.Quaternion(), roll = new THREE.Quaternion();
  const apply = () => {
    if (!headBone.parent) return;
    wrapper.getWorldQuaternion(bodyBasis);
    headBone.parent.getWorldQuaternion(inverseParent); inverseParent.invert();
    yawAxis.set(0, 1, 0).applyQuaternion(bodyBasis).applyQuaternion(inverseParent).normalize();
    pitchAxis.set(0, 0, 1).applyQuaternion(bodyBasis).applyQuaternion(inverseParent).normalize();
    rollAxis.set(1, 0, 0).applyQuaternion(bodyBasis).applyQuaternion(inverseParent).normalize();
    yaw.setFromAxisAngle(yawAxis, clamp(proxy.rotation.y, -1.1, 1.1));
    pitch.setFromAxisAngle(pitchAxis, clamp(proxy.rotation.z + (proxy.userData.socialPitch || 0), -0.55, 0.55));
    roll.setFromAxisAngle(rollAxis, clamp(proxy.userData.socialRoll || 0, -0.4, 0.4));
    headBone.quaternion.copy(animatedPose).premultiply(pitch).premultiply(yaw).premultiply(roll);
    headBone.updateMatrixWorld(true);
  };
  proxy.rotation._onChange(apply);
  return {
    proxy,
    apply,
    restoreAnimationPose() { headBone.quaternion.copy(animatedPose); },
    captureAnimationPose() { animatedPose.copy(headBone.quaternion); apply(); },
  };
}

export async function attachSpeciesAsset(mesh, species, { rival = false } = {}) {
  if (!mesh || !species) return false;
  const definition = assetDefinition(species); if (!definition) return false;
  if (mesh.userData.speciesId !== species.id) applySpeciesAppearance(mesh, species, { rival });
  const generation = mesh.userData.artGeneration;
  try {
    const template = await loadTemplate(definition);
    if (generation !== mesh.userData.artGeneration || mesh.userData.speciesId !== species.id) return false;
    const scene = cloneSkeleton(template.scene);
    const base = new THREE.Group(); base.name = "CC0AnimatedCreature";
    const orientation = new THREE.Group(); orientation.rotation.y = Math.PI / 2;
    orientation.add(scene); base.add(orientation);
    const materials = [], body = colorOf(species, "body", "#d6b9aa"), accent = colorOf(species, "accent", "#ae89be"), belly = colorOf(species, "belly", "#fff1d8");
    scene.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true; child.receiveShadow = true; child.frustumCulled = false;
      child.userData.sharedSpeciesGeometry = true;
      const recolor = (source) => {
        const copy = source.clone(); copy.name = definition.materialAliases?.[copy.name] || copy.name;
        const name = copy.name.toLowerCase();
        if (/eye.*white/.test(name)) copy.color.set(0xfffcf3);
        else if (/eye.*black|nose|mouth|pupil/.test(name)) copy.color.set(0x192d35);
        else if (/main|body|fur|coat/.test(name)) copy.color.copy(body);
        else if (/secondary|horn|ear|wing/.test(name)) copy.color.copy(accent);
        else if (/belly|white|cream/.test(name)) copy.color.copy(belly);
        else if (copy.color && !copy.map) copy.color.lerp(body, 0.24);
        copy.metalness = 0; copy.roughness = 0.82;
        if (definition.fbx && definition.texture) {
          copy.map = new THREE.TextureLoader().load(definition.texture); copy.map.colorSpace = THREE.SRGBColorSpace; copy.color.set(0xffffff).lerp(body, 0.4);
          copy.userData.ownsSpeciesTexture = true;
        }
        copy.transparent = false; copy.opacity = 1; materials.push(copy); return copy;
      };
      child.material = Array.isArray(child.material) ? child.material.map(recolor) : recolor(child.material);
    });
    const animator = makeAnimator(scene, template.animations, mesh, definition);
    animator.update(0.001, { speed: 0, altitude: 0 });
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(orientation), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const stage = stageOf(species), profile = evolutionVisualProfile(species);
    const height = (species.bodyType === "aerial" ? 115 : species.bodyType === "biped" ? 155 : 105) * profile.size;
    const factor = height / Math.max(size.y, 0.01);
    base.scale.set(factor * profile.bodyScale, factor, factor * profile.bodyScale); orientation.position.set(-center.x, -bounds.min.y, -center.z);
    const fallback = mesh.userData.artFallbackObjects || mesh.children.filter((child) => child !== base);
    fallback.forEach((child) => { child.visible = false; });
    mesh.userData.speciesAdornment?.userData.headDetails?.removeFromParent();
    mesh.userData.speciesAdornment?.userData.crest?.removeFromParent();
    if (mesh.userData.speciesAdornment) mesh.userData.speciesAdornment.visible = false;
    // No hidden second rig is retained: its joints no longer drive visible
    // art, so release only its local render resources after a successful swap.
    for (const child of fallback) { disposeLocalResources(child); child.removeFromParent(); }
    mesh.userData.artFallbackObjects = [];
    mesh.userData.fallbackVisual = null;
    if (mesh.userData.evolutionDetails) { disposeLocalResources(mesh.userData.evolutionDetails); mesh.userData.evolutionDetails.removeFromParent(); }
    if (mesh.userData.faceExpression) { mesh.userData.faceExpression.dispose(); disposeLocalResources(mesh.userData.faceExpression.root); mesh.userData.faceExpression.root.removeFromParent(); }
    mesh.add(base);
    mesh.userData.assetVisual = base; mesh.userData.assetAnimator = animator; mesh.userData.assetMaterials = materials;
    mesh.userData.assetHeadBone = scene.getObjectByName("Head") || scene.getObjectByName("Neck");
    mesh.userData.assetGaze = makeAssetGaze(mesh, mesh.userData.assetHeadBone);
    mesh.userData.headRig = mesh.userData.assetGaze?.proxy || mesh.userData.headRig;
    mesh.userData.headPivot = mesh.userData.headRig;
    mesh.userData.gazeOverlay = null;
    mesh.userData.artSource = "Quaternius CC0 + original evolution silhouettes"; mesh.userData.artHeight = height;
    mesh.userData.bodyVisualHeight = height;
    mesh.userData.assetName = decodeURIComponent(definition.url.split("/").pop());
    const growthMaterials = [materialFor(body), materialFor(accent), materialFor(belly)];
    mesh.userData.assetMaterials.push(...growthMaterials);
    mesh.userData.evolutionDetails = makeEvolutionDetails(species, growthMaterials, height); mesh.add(mesh.userData.evolutionDetails);
    mesh.userData.faceExpression = makeFaceExpression(mesh, mesh.userData.assetHeadBone, scene, species);
    animator.update(0.001, { speed: 0, altitude: 0 });
    applySocialExpression(mesh, { elapsed: 1 });
    return true;
  } catch (error) {
    mesh.userData.artLoadError = String(error?.message || error); return false;
  }
}

function disposeLocalResources(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse((child) => {
    if (!child.isMesh && !child.isSprite) return;
    if (child.geometry && !child.userData.sharedSpeciesGeometry && child.geometry !== sphere && child.geometry !== crownGem && child.geometry !== horn) geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (!material || child.userData.sharedSpeciesGeometry) continue;
      materials.add(material);
      // Procedural rigs use local CanvasTextures. Imported art's textures are
      // cached templates and are released separately only when independently owned.
      for (const key of ["map", "normalMap", "roughnessMap", "emissiveMap"]) if (material[key]?.isCanvasTexture) textures.add(material[key]);
    }
  });
  geometries.forEach((geometry) => geometry.dispose()); textures.forEach((texture) => texture.dispose()); materials.forEach((material) => material.dispose());
}

export function releaseSpeciesAppearance(mesh, { disposeFallback = true } = {}) {
  if (!mesh?.userData) return;
  mesh.userData.artGeneration = (mesh.userData.artGeneration || 0) + 1;
  mesh.userData.assetAnimator?.dispose();
  clearLocalSocialTransform(mesh);
  if (mesh.userData.evolutionDetails) { disposeLocalResources(mesh.userData.evolutionDetails); mesh.userData.evolutionDetails.removeFromParent(); }
  if (mesh.userData.faceExpression) { mesh.userData.faceExpression.dispose(); disposeLocalResources(mesh.userData.faceExpression.root); mesh.userData.faceExpression.root.removeFromParent(); }
  mesh.userData.assetVisual?.removeFromParent(); mesh.userData.assetCrest?.removeFromParent();
  mesh.userData.speciesAdornment?.userData.headDetails?.removeFromParent();
  mesh.userData.speciesAdornment?.userData.crest?.removeFromParent();
  mesh.userData.speciesAdornment?.removeFromParent();
  for (const material of [...(mesh.userData.assetMaterials || []), ...(mesh.userData.speciesMaterials || [])]) {
    if (material.userData.ownsSpeciesTexture) material.map?.dispose(); material.dispose();
  }
  mesh.userData.artFallbackObjects?.forEach((child) => { child.visible = true; });
  if (!disposeFallback && mesh.userData.fallbackVisual) {
    for (const child of [...mesh.userData.fallbackVisual.children]) mesh.add(child);
    mesh.userData.fallbackVisual.removeFromParent();
  }
  if (mesh.userData.artFallbackHeadRig) mesh.userData.headRig = mesh.userData.artFallbackHeadRig;
  else if (mesh.userData.corgiRig?.headRig) mesh.userData.headRig = mesh.userData.corgiRig.headRig;
  else if (mesh.userData.catRig?.headRig) mesh.userData.headRig = mesh.userData.catRig.headRig;
  else if (mesh.userData.stickRig?.headRig) mesh.userData.headRig = mesh.userData.stickRig.headRig;
  for (const key of ["assetAnimator", "assetVisual", "assetCrest", "assetMaterials", "assetHeadBone", "assetGaze", "assetHasDownClip", "assetName", "speciesAdornment", "speciesMaterials", "fallbackVisual", "evolutionDetails", "faceExpression", "socialTransform", "socialHeadPose", "speciesHeadScale", "socialPose"]) delete mesh.userData[key];
  if (disposeFallback) { disposeLocalResources(mesh); mesh.userData.artFallbackObjects = []; }
}
