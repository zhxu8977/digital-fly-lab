const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export const BATTLE_TEMPERAMENTS = Object.freeze({
  balanced: { label: "稳健型", aggression: 0.52, caution: 0.55, evasion: 0.56, pursuit: 0.54, patience: 0.58 },
  brave: { label: "勇猛型", aggression: 0.86, caution: 0.27, evasion: 0.36, pursuit: 0.84, patience: 0.34 },
  cautious: { label: "谨慎型", aggression: 0.27, caution: 0.9, evasion: 0.86, pursuit: 0.25, patience: 0.8 },
  curious: { label: "好奇型", aggression: 0.4, caution: 0.5, evasion: 0.64, pursuit: 0.42, patience: 0.92 },
});

export function combatPowerIndex({ profile, healthRatio = 1, stamina = 1, fatigue = 0, confidence = 0.5, bodyType = "aerial" }) {
  const bodyFactor = { aerial: 1.03, biped: 1, corgi: 1.02, cat: 1.01 }[bodyType] || 1;
  const durability = Math.sqrt(Math.max(1, profile.health) / 280) * (1 + profile.defense * 0.75);
  const mobility = 0.72 + profile.speed / 390;
  const condition = 0.42 + clamp(healthRatio) * 0.38 + clamp(stamina) * 0.16 - clamp(fatigue) * 0.18 + clamp(confidence) * 0.1;
  return Math.max(0.05, profile.power * durability * mobility * bodyFactor * Math.max(0.25, condition));
}

export function evaluateCombatDisposition({
  personality = "balanced", ownPower = 1, targetPower = 1,
  ownHealth = 1, targetHealth = 1, stamina = 1, fatigue = 0,
  confidence = 0.5, fear = 0.3, traits = null,
} = {}) {
  const base = BATTLE_TEMPERAMENTS[personality] || BATTLE_TEMPERAMENTS.balanced;
  const safeOffset = (value) => Number.isFinite(value) ? clamp(value, -0.15, 0.15) : 0;
  const temperament = {
    ...base, label: traits?.label ? `${base.label}·${traits.label}` : base.label,
    aggression: clamp(base.aggression + safeOffset(traits?.aggressionOffset)),
    evasion: clamp(base.evasion + safeOffset(traits?.evasionOffset)),
    patience: clamp(base.patience + safeOffset(traits?.patienceOffset)),
  };
  const powerRatio = clamp(ownPower / Math.max(0.05, targetPower), 0.25, 2.5);
  const advantage = clamp((powerRatio - 1) / 0.85, -1, 1);
  const lowHealth = 1 - clamp(ownHealth);
  const weakenedTarget = 1 - clamp(targetHealth);
  const attackTendency = clamp(temperament.aggression + advantage * 0.3 + confidence * 0.12 + weakenedTarget * 0.16 - fear * 0.14 - lowHealth * 0.22);
  const dodgeTendency = clamp(temperament.evasion - advantage * 0.12 + fear * 0.13 + lowHealth * 0.18 + fatigue * 0.12);
  const retreatTendency = clamp(temperament.caution - advantage * 0.42 + lowHealth * 0.52 + fatigue * 0.2 + fear * 0.16 - temperament.aggression * 0.12);
  const pursuitTendency = clamp(temperament.pursuit + advantage * 0.3 + weakenedTarget * 0.25 + stamina * 0.08 - fatigue * 0.22);
  const probeTendency = clamp(temperament.patience + (1 - Math.abs(advantage)) * 0.12 - weakenedTarget * 0.18);
  const preferredRangeScale = clamp(1.18 + dodgeTendency * 0.22 + retreatTendency * 0.13 - attackTendency * 0.28, 0.78, 1.42);
  const dodgeThreshold = clamp(0.28 - dodgeTendency * 0.19, 0.08, 0.24);
  const attackIntervalScale = clamp(1.28 - attackTendency * 0.58 + dodgeTendency * 0.12, 0.7, 1.32);
  const pct = (value) => `${Math.round(value * 100)}%`;
  const relation = powerRatio > 1.18 ? "我方占优" : powerRatio < 0.82 ? "对手明显更强" : "双方接近";
  const reason = `${temperament.label}；战力比 ${powerRatio.toFixed(2)}（${relation}），进攻倾向 ${pct(attackTendency)}、闪避倾向 ${pct(dodgeTendency)}、撤退倾向 ${pct(retreatTendency)}、追击倾向 ${pct(pursuitTendency)}。`;
  return { personality, label: temperament.label, powerRatio, attackTendency, dodgeTendency, retreatTendency, pursuitTendency, probeTendency, preferredRangeScale, dodgeThreshold, attackIntervalScale, reason };
}

export function shouldRetreatFromDuel(disposition, ownHealth, targetHealth) {
  if (ownHealth < 0.13) return true;
  // Caution at high health means spacing, probing and dodging—not abandoning
  // the duel.  A committed escape is reserved for a damaged fighter or a
  // genuinely hopeless power gap.  The old rule allowed a cautious rival at
  // 80%+ HP to run simply because its nominal power ratio dipped below 0.82.
  if (disposition.powerRatio < 0.48 && ownHealth < 0.62) return true;
  if (disposition.retreatTendency <= 0.78) return false;
  return ownHealth < 0.38
    || (ownHealth < 0.56 && targetHealth > ownHealth + 0.2)
    || (ownHealth < 0.68 && disposition.powerRatio < 0.62);
}
