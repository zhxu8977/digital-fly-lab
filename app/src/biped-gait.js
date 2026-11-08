const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function directionalGait(movementSlip, speed) {
  const forward = clamp(Math.cos(movementSlip), 0, 1);
  const backward = clamp(-Math.cos(movementSlip), 0, 1);
  const lateralSigned = Math.sin(movementSlip);
  const lateral = Math.abs(lateralSigned);
  const lateralDirection = Math.sign(lateralSigned) || 1;
  let state = "idle";
  if (speed > 45) {
    if (backward >= 0.5 && backward >= lateral * 0.78) state = "backpedal";
    else if (lateral > 0.48) state = lateralDirection > 0 ? "strafe-right" : "strafe-left";
    else state = speed > 300 ? "run" : "walk";
  }
  return { state, forward, backward, lateral, lateralDirection };
}
