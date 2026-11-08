import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Original little TV avatar. The video stays on-device in a VideoTexture.
export function createTVRobot(video) {
  const group = new THREE.Group();
  const plastic = new THREE.MeshStandardMaterial({ color: 0x73d6db, roughness: 0.58 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xf39bbb, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x192d45, roughness: 0.65 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8fcf9, roughness: 0.9 });
  const box = new THREE.Mesh(new RoundedBoxGeometry(190, 136, 72, 3, 18), plastic);
  box.position.y = 127; group.add(box);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(162, 108, 12, 3, 12), dark);
  bezel.position.set(0, 127, 40); group.add(bezel);
  const texture = new THREE.VideoTexture(video); texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(143, 88), new THREE.MeshBasicMaterial({ map: texture }));
  screen.position.set(0, 127, 47); screen.scale.x = -1; group.add(screen);
  const faceCanvas = document.createElement("canvas"); faceCanvas.width = 384; faceCanvas.height = 240;
  const faceTexture = new THREE.CanvasTexture(faceCanvas); faceTexture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(143, 88), new THREE.MeshBasicMaterial({ map: faceTexture }));
  face.position.set(0, 127, 48); face.userData.standby = true; group.add(face);
  const limbs = [];
  function limb(x, y, arm) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
    const bone = new THREE.Mesh(new THREE.CapsuleGeometry(arm ? 11 : 14, arm ? 27 : 25, 4, 8), white);
    bone.position.y = -22; pivot.add(bone);
    const end = new THREE.Mesh(new THREE.SphereGeometry(arm ? 17 : 20, 12, 8), pink);
    end.position.set(0, -46, arm ? 4 : 12); end.scale.set(1, arm ? 1 : 0.6, arm ? 1 : 1.5); pivot.add(end);
    group.add(pivot); limbs.push({ pivot, arm, side: Math.sign(x) });
  }
  limb(-108, 135, true); limb(108, 135, true); limb(-49, 60, false); limb(49, 60, false);
  for (const side of [-1, 1]) {
    const stem = new THREE.Mesh(new THREE.CapsuleGeometry(4, 32, 3, 6), dark);
    stem.position.set(side * 36, 215, 0); stem.rotation.z = side * -0.45; group.add(stem);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 8), pink); bulb.position.set(side * 46, 235, 0); group.add(bulb);
  }
  const glow = new THREE.PointLight(0x6affdc, 0.25, 430); glow.position.set(0, 140, 80); glow.userData.glow = true; group.add(glow);
  group.traverse((child) => { if (child.isMesh) child.castShadow = true; });
  group.userData.videoTexture = texture;
  group.userData.updateRobot = ({ time, speed, social = false }) => {
    const intensity = Math.min(1, speed / 300);
    box.rotation.z = Math.sin(time * 9) * intensity * 0.045;
    limbs.forEach(({ pivot, arm, side }) => {
      pivot.rotation.x = Math.sin(time * 9 + (side > 0 ? Math.PI : 0) + (arm ? Math.PI : 0)) * intensity * (arm ? 0.45 : 0.65);
      pivot.rotation.z = arm ? side * (-0.2 - (social ? 0.18 : 0)) : 0;
    });
    const ctx = faceCanvas.getContext("2d"); ctx.fillStyle = "#173d55"; ctx.fillRect(0, 0, 384, 240);
    ctx.strokeStyle = "#b8fff1"; ctx.fillStyle = "#b8fff1"; ctx.lineWidth = 9; ctx.lineCap = "round";
    const blink = Math.sin(time * 0.9) > 0.996;
    for (const x of [120, 264]) {
      ctx.beginPath();
      if (blink) { ctx.moveTo(x - 19, 91); ctx.lineTo(x + 19, 91); ctx.stroke(); }
      else { ctx.ellipse(x, 88, 16, 27, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.beginPath(); ctx.arc(192, 122, 43, 0.18, Math.PI - 0.18); ctx.stroke();
    ctx.fillStyle = "#f598bf";
    for (const x of [75, 309]) { ctx.beginPath(); ctx.ellipse(x, 130, 23, 10, 0, 0, Math.PI * 2); ctx.fill(); }
    faceTexture.needsUpdate = true;
  };
  return group;
}
