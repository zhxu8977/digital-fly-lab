import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const BASE = "/models/open-world";

const ASSETS = Object.freeze({
  trees: ["tree1.glb", "tree2.glb", "tree3.glb"].map((name) => `${BASE}/quaternius/${name}`),
  bush: `${BASE}/quaternius/bush.glb`,
  rocks: ["rock_largeA.glb", "rock_largeC.glb", "rock_tallB.glb", "rock_smallFlatB.glb"].map((name) => `${BASE}/kenney/${name}`),
  flowers: ["flower_purpleB.glb", "flower_redB.glb", "flower_yellowB.glb"].map((name) => `${BASE}/kenney/${name}`),
  grasses: ["grass_large.glb", "grass_leafsLarge.glb"].map((name) => `${BASE}/kenney/${name}`),
  mushrooms: ["mushroom_redGroup.glb", "mushroom_tanGroup.glb"].map((name) => `${BASE}/kenney/${name}`),
  cliffs: ["cliff_large_rock.glb", "cliff_cornerLarge_rock.glb", "cliff_top_rock.glb", "cliff_cave_rock.glb", "cliff_steps_rock.glb"].map((name) => `${BASE}/kenney/${name}`),
  bridge: `${BASE}/kenney/bridge_stoneRound.glb`,
  log: `${BASE}/kenney/log_large.glb`,
});

export function selectGraphicsProfile({ rendererName = "", devicePixelRatio = 1 } = {}) {
  // Headless Chromium and fallback drivers can expose a WebGL renderer while
  // actually rasterizing on the CPU. Check these before integrated hardware:
  // wrapper names may contain both an Intel GPU name and SwiftShader.
  const software = /swiftshader|software|llvmpipe|softpipe|swrast|microsoft\s+(?:basic\s+(?:render|display)|warp)|\bwarp\b|gdi\s+generic/i.test(rendererName);
  const integrated = /intel|iris|uhd|radeon\s*(?:graphics|vega)/i.test(rendererName);
  const requestedPixelRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const pixelRatio = Math.min(requestedPixelRatio, software ? 0.75 : integrated ? 1.2 : 1.6);
  return Object.freeze({
    id: software ? "software" : integrated ? "integrated" : "balanced",
    label: software ? "软件渲染轻量模式" : integrated ? "核显优化" : "平衡画质",
    rendererName: rendererName || "WebGL 显卡",
    pixelRatio,
    shadows: !software,
    shadowSize: software ? 256 : integrated ? 1024 : 2048,
    treeCount: software ? 14 : integrated ? 42 : 60,
    detailCount: software ? 18 : integrated ? 54 : 82,
    castShadowTrees: software ? 0 : integrated ? 10 : 22,
    landformCount: software ? 5 : 11,
    decorativePlants: !software,
  });
}

export function readRendererName(renderer) {
  const gl = renderer.getContext();
  const extension = gl.getExtension("WEBGL_debug_renderer_info");
  return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
}

function seededRandom(seed = 84721) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function loadTemplates(loader) {
  const urls = [...ASSETS.trees, ASSETS.bush, ...ASSETS.rocks, ...ASSETS.flowers, ...ASSETS.grasses, ...ASSETS.mushrooms, ...ASSETS.cliffs, ASSETS.bridge, ASSETS.log];
  return Promise.all(urls.map(async (url) => [url, (await loader.loadAsync(url)).scene])).then((entries) => new Map(entries));
}

function instantiate(template, targetSize, { shadow = false } = {}) {
  const object = template.clone(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 0.001);
  const scale = targetSize / largest;
  object.scale.multiplyScalar(scale);
  const scaledBounds = new THREE.Box3().setFromObject(object);
  object.position.y -= scaledBounds.min.y;
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = shadow;
    child.receiveShadow = true;
    if (child.material) {
      child.material = child.material.clone();
      child.material.roughness = Math.max(0.62, child.material.roughness ?? 0.8);
    }
  });
  return object;
}

function addAt(group, template, targetSize, x, z, rotation, options) {
  const object = instantiate(template, targetSize, options);
  object.position.x = x;
  object.position.z = z;
  object.rotation.y = rotation;
  group.add(object);
  return object;
}

function forestPosition(random, worldWidth, worldHeight, index) {
  const side = index % 2 === 0 ? -1 : 1;
  const edgeX = side * (worldWidth * (0.31 + random() * 0.17));
  const edgeZ = (random() - 0.5) * worldHeight * 0.88;
  // Every fifth tree forms a distant northern/southern tree line instead of
  // two obvious straight side walls.
  if (index % 5 === 0) return { x: (random() - 0.5) * worldWidth * 0.86, z: side * worldHeight * (0.37 + random() * 0.08) };
  return { x: edgeX + (random() - 0.5) * 310, z: edgeZ };
}

export async function populateOpenSourceWorld(group, { worldWidth, worldHeight, profile, seed = 84721 } = {}) {
  group.clear();
  group.name = "cc0-open-source-world";
  group.userData.sources = ["Quaternius Stylized Nature MegaKit (CC0)", "Kenney Nature Kit (CC0)"];
  const loader = new GLTFLoader();
  const templates = await loadTemplates(loader);
  const random = seededRandom(seed);

  for (let index = 0; index < profile.treeCount; index += 1) {
    const point = forestPosition(random, worldWidth, worldHeight, index);
    const url = ASSETS.trees[index % ASSETS.trees.length];
    addAt(group, templates.get(url), 170 + random() * 145, point.x, point.z, random() * Math.PI * 2, { shadow: profile.shadows !== false && index < profile.castShadowTrees });
    if (profile.decorativePlants !== false && index % 2 === 0) {
      addAt(group, templates.get(ASSETS.bush), 54 + random() * 38, point.x + (random() - 0.5) * 125, point.z + (random() - 0.5) * 125, random() * Math.PI * 2);
    }
  }

  for (let index = 0; index < profile.detailCount; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 1050 + random() * 2150;
    const x = Math.cos(angle) * radius * 1.25;
    const z = Math.sin(angle) * radius * 0.78;
    const rockUrl = ASSETS.rocks[index % ASSETS.rocks.length];
    addAt(group, templates.get(rockUrl), 25 + random() * 65, x, z, random() * Math.PI * 2, { shadow: profile.shadows !== false && index < 12 });
    if (profile.decorativePlants !== false && index % 2 === 0) {
      const plantUrls = index % 6 === 0 ? ASSETS.mushrooms : index % 4 === 0 ? ASSETS.flowers : ASSETS.grasses;
      const plantUrl = plantUrls[index % plantUrls.length];
      addAt(group, templates.get(plantUrl), 16 + random() * 24, x + (random() - 0.5) * 70, z + (random() - 0.5) * 70, random() * Math.PI * 2);
    }
  }

  const landforms = [
    [-0.40, -0.32, 320], [-0.32, 0.32, 380], [0.32, -0.34, 350], [0.41, 0.29, 400],
    [-0.16, -0.40, 260], [0.18, 0.40, 290], [-0.44, 0.04, 280], [0.44, -0.08, 300],
    [-0.22, 0.19, 230], [0.22, -0.15, 250], [0, 0.34, 220],
  ];
  landforms.slice(0, profile.landformCount ?? landforms.length).forEach(([fx, fz, size], index) => {
    const rockUrl = ASSETS.rocks[index % ASSETS.rocks.length];
    const x = fx * worldWidth, z = fz * worldHeight;
    addAt(group, templates.get(rockUrl), size, x, z, index * 0.73, { shadow: profile.shadows !== false && index < 5 });
    addAt(group, templates.get(ASSETS.rocks[(index + 1) % ASSETS.rocks.length]), size * 0.68, x + (index % 2 ? -1 : 1) * size * 0.34, z + (index % 3 - 1) * size * 0.2, index * 1.17, { shadow: profile.shadows !== false && index < 3 });
    if (index >= 8) addAt(group, templates.get(ASSETS.cliffs[index % ASSETS.cliffs.length]), size * 0.58, x - size * 0.22, z + size * 0.18, index * 0.91);
  });

  // The bridge sits over the existing curved water band without becoming a
  // new invisible collider. Existing movement/collision rules remain intact.
  const bridge = addAt(group, templates.get(ASSETS.bridge), 310, -340, -610, Math.PI * 0.5, { shadow: profile.shadows !== false });
  bridge.position.y = 4;
  addAt(group, templates.get(ASSETS.log), 105, 760, 620, -0.35, { shadow: profile.shadows !== false });

  return {
    models: templates.size,
    instances: group.children.length,
    sources: group.userData.sources,
  };
}

