const finiteNonnegative = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
};

/** Longest distance at which this loadout can cause actual damage. */
export function combatDamageReach(skillIds, skills) {
  if (!Array.isArray(skillIds) || !skills || typeof skills !== "object") return 0;
  let reach = 0;
  for (const id of skillIds) {
    const skill = skills[id];
    if (!skill || ["mark", "buff"].includes(skill.type) || finiteNonnegative(skill.damage) <= 0) continue;
    const distance = finiteNonnegative(skill.type === "area" ? skill.radius : skill.range);
    reach = Math.max(reach, distance);
  }
  return reach;
}

/**
 * Approach within a true three-dimensional firing window. Random cruise
 * altitudes belong to roaming/evasion; otherwise a short-range flyer can
 * spend a whole battle above an opponent it has no means of hitting.
 * The .75/.4 bands leave a margin: hypot(.75, .4) = .85 of skill reach.
 */
export function attackFlightEnvelope({ reach = 0, desiredRange = 0, requestedAltitude = 0, targetAltitude = 0, allowRoam = false } = {}) {
  const target = finiteNonnegative(targetAltitude);
  const altitude = finiteNonnegative(requestedAltitude, target);
  const range = finiteNonnegative(desiredRange);
  if (allowRoam) return { desiredRange: range, altitude };

  const effectiveReach = finiteNonnegative(reach);
  const horizontalLimit = effectiveReach * 0.75;
  const verticalLimit = effectiveReach * 0.4;
  // Compute the difference first so adding a large finite target to a large
  // reach cannot overflow. Normal game values are hundreds of world units.
  const altitudeDifference = altitude - target;
  const verticalOffset = Math.max(-verticalLimit, Math.min(verticalLimit, altitudeDifference));
  const limitedAltitude = target + verticalOffset;
  return {
    desiredRange: Math.min(range, horizontalLimit),
    altitude: Number.isFinite(limitedAltitude) ? Math.max(0, limitedAltitude) : target,
  };
}
