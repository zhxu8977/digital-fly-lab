const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function foodScentRange({ smell = 1, hunger = 0.5 } = {}) {
  return 900 + clamp(smell, 0.4, 1.5) * 1300 + clamp(hunger) * 600;
}

export function updateForagingState(previous = {}, {
  now = 0,
  hunger = 0,
  foodPriority = 0,
  smell = 1,
  foodDistance = Infinity,
  hasFood = false,
  danger = 0,
  ownerUrgency = 0,
  duel = false,
} = {}) {
  const state = {
    stage: previous.stage || "idle",
    sniffUntil: previous.sniffUntil || 0,
    cooldownUntil: previous.cooldownUntil || 0,
  };
  if (duel || danger > 0.34 || ownerUrgency > 0.58) return { ...state, stage: "suspended", active: false, speed: 0 };
  if (now < state.cooldownUntil || hunger < 0.24 || foodPriority < 0.28) return { ...state, stage: "sated", active: false, speed: 0 };
  if (!hasFood || !Number.isFinite(foodDistance)) return { ...state, stage: foodPriority > 0.52 ? "searching" : "idle", active: foodPriority > 0.52, speed: 250 };

  const scentRange = foodScentRange({ smell, hunger });
  if (foodDistance > scentRange) return { ...state, stage: "searching", active: true, speed: 270, scentRange };
  if (foodDistance > 125) return { ...state, stage: "tracking", active: true, speed: 470, scentRange };
  const alreadyInspecting = ["sniffing", "tasting", "eating"].includes(state.stage);
  if (foodDistance > 30 && !(alreadyInspecting && foodDistance <= 48)) {
    const approach = clamp((foodDistance - 30) / 95);
    return { ...state, stage: "approaching", active: true, speed: 82 + approach * 230, scentRange };
  }
  if (!["sniffing", "tasting", "eating", "rejecting"].includes(state.stage)) {
    state.sniffUntil = now + 0.52;
  }
  state.stage = now < state.sniffUntil ? "sniffing" : "tasting";
  return { ...state, active: true, speed: 0, scentRange };
}

export function finishForaging(previous = {}, { now = 0, rejected = false } = {}) {
  return {
    ...previous,
    stage: rejected ? "rejecting" : "sated",
    cooldownUntil: now + (rejected ? 2.4 : 3.2),
    sniffUntil: 0,
    active: false,
    speed: 0,
  };
}
