const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function wrappedAngleDelta(target, current) {
  let value = target - current;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export function turnTowardAngle(current, target, maxRate, dt) {
  return current + clamp(wrappedAngleDelta(target, current), -maxRate * dt, maxRate * dt);
}

/**
 * The body follows the velocity vector. Target gaze only biases the body while
 * actively aiming; the faster head channel keeps observing without snapping
 * the entire animal left and right.
 */
export function updateCombatOrientation({
  bodyAngle, lookAngle = bodyAngle, movementAngle, targetAngle = movementAngle,
  lookTargetAngle = targetAngle, hasTarget = false, attacking = false, requiresFacing = false, mode = "rangeControl", dt,
}) {
  const evasive = ["reflexDodge", "collisionAvoidance", "flee", "breakaway"].includes(mode);
  const mustAim = hasTarget && attacking && requiresFacing && !evasive;
  const targetFromBody = Math.abs(wrappedAngleDelta(targetAngle, bodyAngle));
  const targetNearVisionEdge = hasTarget && !evasive && targetFromBody > 1.92;
  const aimWeight = !hasTarget || evasive ? 0 : mode === "adaptiveCounter" ? 0.34 : 0.18;
  const targetOffset = clamp(wrappedAngleDelta(targetAngle, movementAngle), -0.72, 0.72);
  const desiredBody = mustAim
    ? targetAngle
    : targetNearVisionEdge
      ? bodyAngle + clamp(wrappedAngleDelta(targetAngle, bodyAngle), -1.12, 1.12) * 0.72
      : movementAngle + targetOffset * aimWeight;
  const bodyRate = evasive ? 2.75 : attacking ? 2.45 : 1.85;
  const nextBody = turnTowardAngle(bodyAngle, desiredBody, bodyRate, dt);
  const desiredLook = hasTarget ? lookTargetAngle : desiredBody;
  const nextLook = turnTowardAngle(lookAngle, desiredLook, hasTarget ? 4.6 : 2.2, dt);
  return { bodyAngle: nextBody, lookAngle: nextLook };
}

export function resolveFlightDirection({ bodyAngle, desiredMovementAngle, previousMovementAngle = bodyAngle, mode = "rangeControl", dt }) {
  const escape = ["reflexDodge", "collisionAvoidance", "flee", "breakaway"].includes(mode);
  const slowCorrection = ["openingProbe", "rangeControl", "search"].includes(mode);
  // Normal flight permits a modest sideslip. Large slips are a brief escape
  // response, not an equally efficient permanent sideways/backward gait.
  const maxSideslip = escape ? 1.05 : slowCorrection ? 0.5 : 0.68;
  const requestedSlip = wrappedAngleDelta(desiredMovementAngle, bodyAngle);
  const limitedDirection = bodyAngle + clamp(requestedSlip, -maxSideslip, maxSideslip);
  const movementRate = escape ? 5.8 : 3.4;
  const movementAngle = turnTowardAngle(previousMovementAngle, limitedDirection, movementRate, dt);
  const actualSlip = wrappedAngleDelta(movementAngle, bodyAngle);
  const bankTarget = clamp(-actualSlip * (escape ? 0.72 : 0.9), -0.68, 0.68);
  return { movementAngle, bankTarget, sideslip: actualSlip };
}

