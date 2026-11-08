const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function shouldKnockDown(bodyType, impactStrength, reaction) {
  if (!["biped", "corgi", "cat"].includes(bodyType)) return false;
  if (bodyType === "cat") {
    if (["launch", "tumble"].includes(reaction)) return impactStrength >= 0.48;
    if (reaction === "spin") return impactStrength > 0.78;
    return impactStrength >= 0.82;
  }
  const threshold = bodyType === "corgi" ? 0.72 : bodyType === "cat" ? 0.78 : 0.88;
  return impactStrength > threshold
    || ["launch", "tumble"].includes(reaction)
    || (reaction === "spin" && impactStrength > 0.7);
}

export function knockdownDuration(impactStrength, reaction, bodyType = "biped") {
  if (bodyType === "cat") {
    return clamp(0.34 + impactStrength * 0.48 + (reaction === "tumble" ? 0.1 : 0), 0.5, 1.12);
  }
  return clamp(0.92 + impactStrength * 0.55 + (reaction === "tumble" ? 0.16 : 0), 1.05, 1.75);
}

export function timedKnockdownState(now, startedAt, downUntil) {
  if (!downUntil || now >= downUntil) return { state: "active", down: 0, locked: false };
  const progress = clamp((now - startedAt) / Math.max(0.01, downUntil - startedAt), 0, 1);
  if (progress < 0.25) return { state: "falling", down: clamp(progress / 0.25, 0, 1) ** 2 * (3 - 2 * clamp(progress / 0.25, 0, 1)), locked: true };
  if (progress < 0.72) return { state: "down", down: 1, locked: true };
  const rise = clamp((progress - 0.72) / 0.28, 0, 1);
  return { state: "getting-up", down: 1 - rise * rise * (3 - 2 * rise), locked: true };
}

export function knockdownGroundClearance(bodyType, down, impactStrength = 0, sideFall = false) {
  if (bodyType === "corgi") return down * (66 + (sideFall ? 12 : 0) + Math.min(10, impactStrength * 7));
  if (bodyType === "cat") return down * (49 + (sideFall ? 9 : 0) + Math.min(9, impactStrength * 7));
  if (bodyType === "biped") return down * (62 + Math.min(10, impactStrength * 8));
  return 0;
}

// A quadruped cannot reuse a biped's near-90-degree forward/back fall: its
// long spine would rotate upright like a plank. Frontal impacts therefore
// produce a limited nose/haunch dip, while stronger or lateral impacts spill
// the body onto one flank.
export function quadrupedKnockdownPose(impactAngle, impactStrength, down, fallbackSide = 1) {
  const amount = clamp(down, 0, 1);
  const strength = clamp(impactStrength, 0, 1.5);
  const forward = Math.cos(impactAngle);
  const lateral = Math.sin(impactAngle);
  const lateralWeight = Math.abs(lateral);
  const side = lateralWeight > 0.08 ? Math.sign(lateral) : Math.sign(fallbackSide || 1);
  const pitchLimit = 0.25 + Math.min(0.2, strength * 0.16);
  const pitch = -forward * pitchLimit * (1 - lateralWeight * 0.48) * amount;
  const frontalSpill = Math.max(0, strength - 0.62) * 0.58;
  const roll = side * Math.min(1.28, lateralWeight * (0.78 + strength * 0.28) + frontalSpill) * amount;
  return { pitch, roll, crouch: amount * (8 + Math.min(8, strength * 6)) };
}
