// Visual maturity is deliberately independent of level, locomotion and the
// connectome. A form has a stable silhouette even in developer preview mode.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function evolutionVisualProfile(species = {}) {
  const stage = Math.round(clamp(number(species.stage, 0), 0, 2));
  const visual = species.evolutionVisual || {};
  return Object.freeze({
    stage,
    maturity: ["round-cub", "athletic", "regal"][stage],
    size: clamp(number(species.visualSize, 1), 0.65, 1.4),
    headScale: clamp(number(visual.headScale, [1.16, 1, 0.91][stage]), 0.84, 1.23),
    bodyScale: clamp(number(visual.bodyScale, [0.98, 1.06, 1.16][stage]), 0.9, 1.22),
    limbScale: clamp(number(visual.limbScale, [0.92, 1.04, 1.11][stage]), 0.9, 1.15),
    crestScale: clamp(number(visual.crestScale, [0.14, 0.64, 1.12][stage]), 0.08, 1.5),
    wingScale: clamp(number(visual.wingScale, [0.88, 1.06, 1.23][stage]), 0.82, 1.3),
    // Each stage changes both topology/count and proportions, not just tint.
    plumeCount: [1, 3, 5][stage],
    tailFanCount: [0, 2, 4][stage],
    shoulderLayers: [0, 1, 2][stage],
  });
}

export function evolutionSilhouetteSignature(species = {}) {
  const p = evolutionVisualProfile(species);
  const type = typeof species.assetHint === "string" ? species.assetHint : species.assetHint?.silhouette || species.features?.[0] || "dragon";
  return [type, p.maturity, p.headScale, p.bodyScale, p.plumeCount, p.tailFanCount, p.shoulderLayers].join(":");
}

// Expressions are bounded and sampled from progress rather than accumulated.
// No expression can advance the simulation's position or give a ground pet flight.
export function socialExpressionPose({ reaction = null, progress = 0, elapsed = 0 } = {}) {
  const p = clamp(number(progress, 0), 0, 1);
  const time = number(elapsed, 0);
  const envelope = reaction ? Math.sin(Math.PI * p) : 0;
  const affectionate = ["rub", "affection", "happy", "greeting", "celebrate", "proud"].includes(reaction);
  const curious = ["curious", "tilt"].includes(reaction);
  const roll = reaction === "roll";
  const blinkReaction = reaction === "blinkBack";
  const blinkWave = blinkReaction ? Math.pow(Math.max(0, Math.sin(p * Math.PI * 4)), 5) : 0;
  const idleBlink = Math.pow(Math.max(0, Math.cos((time % 5.1) * 1.232)), 70);
  return Object.freeze({
    reaction,
    progress: p,
    movementLocked: roll || reaction === "settle",
    envelope,
    headTilt: curious ? envelope * 0.32 : affectionate ? Math.sin(p * Math.PI * 3) * envelope * 0.12 : 0,
    headNod: affectionate ? Math.sin(p * Math.PI * 4) * envelope * 0.11 : reaction === "seekFood" ? envelope * 0.18 : 0,
    blink: clamp(Math.max(blinkWave, reaction === "settle" ? envelope * 0.85 : idleBlink), 0, 1),
    smile: affectionate ? envelope : curious ? envelope * 0.28 : 0,
    blush: affectionate ? envelope * 0.75 : 0,
    bodyRoll: roll ? (p >= 1 ? 0 : -(p * p * (3 - 2 * p)) * Math.PI * 2) : reaction === "rub" ? Math.sin(p * Math.PI * 4) * envelope * 0.22 : 0,
    bodyLean: reaction === "rub" ? envelope * -0.15 : reaction === "settle" ? envelope * 0.22 : 0,
    bounce: ["happy", "greeting", "celebrate"].includes(reaction) ? Math.abs(Math.sin(p * Math.PI * 5)) * envelope * 0.07 : 0,
    squash: reaction === "rub" ? envelope * 0.05 : roll ? envelope * 0.08 : 0,
  });
}
