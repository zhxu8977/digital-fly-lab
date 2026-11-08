const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function rotatedLocal(point, collider) {
  const angle = -(collider.rotation || 0), dx = point.x - collider.x, dy = point.y - collider.y;
  return { x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle) };
}

export function groundClearanceAt(body, point, colliders, bounds) {
  let clearance = Math.min(
    point.x - bounds.minX - body.radius,
    bounds.maxX - point.x - body.radius,
    point.y - bounds.minY - body.radius,
    bounds.maxY - point.y - body.radius,
  );
  let kind = "boundary";
  for (const collider of colliders) {
    if ((body.altitude || 0) > collider.height + (body.clearance || 12)) continue;
    let distance;
    if (collider.shape === "box") {
      const local = rotatedLocal(point, collider);
      const dx = Math.abs(local.x) - (collider.halfWidth + body.radius);
      const dy = Math.abs(local.y) - (collider.halfHeight + body.radius);
      distance = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
    } else {
      distance = Math.hypot(point.x - collider.x, point.y - collider.y) - (body.radius + collider.radius);
    }
    if (distance < clearance) { clearance = distance; kind = collider.type || collider.shape || "obstacle"; }
  }
  return { clearance, kind };
}

export function probeGroundPath(body, angle, lookAhead, colliders, bounds) {
  const spacing = Math.max(14, body.radius * 0.55), samples = Math.max(3, Math.ceil(lookAhead / spacing));
  let minimumClearance = Infinity, freeDistance = lookAhead, blocker = null;
  for (let index = 1; index <= samples; index += 1) {
    const distance = lookAhead * index / samples;
    const point = { x: body.x + Math.cos(angle) * distance, y: body.y + Math.sin(angle) * distance };
    const result = groundClearanceAt(body, point, colliders, bounds);
    minimumClearance = Math.min(minimumClearance, result.clearance);
    if (result.clearance <= 0) { freeDistance = distance; blocker = result.kind; break; }
  }
  return { blocked: Boolean(blocker), blocker, freeDistance, minimumClearance };
}

export function planGroundRoute(body, desiredAngle, speed, colliders, bounds, preferredSide = 1) {
  const lookAhead = clamp(speed * 0.72 + body.radius * 4, 230, 760);
  const direct = probeGroundPath(body, desiredAngle, lookAhead, colliders, bounds);
  if (!direct.blocked && direct.minimumClearance > body.radius * 0.55) {
    return { angle: desiredAngle, blocked: false, blocker: null, speedFactor: 1, freeDistance: lookAhead, side: preferredSide || 1 };
  }
  const side = preferredSide || 1;
  const offsets = [0.38 * side, -0.38 * side, 0.68 * side, -0.68 * side, 1.02 * side, -1.02 * side, 1.34 * side, -1.34 * side];
  let best = null;
  for (const offset of offsets) {
    const angle = desiredAngle + offset;
    const probe = probeGroundPath(body, angle, lookAhead, colliders, bounds);
    const score = probe.freeDistance + Math.min(120, Math.max(-80, probe.minimumClearance)) - Math.abs(offset) * 72 + (Math.sign(offset) === side ? 18 : 0);
    if (!best || score > best.score) best = { angle, offset, probe, score };
  }
  const room = clamp((best?.probe.freeDistance || direct.freeDistance) / lookAhead, 0, 1);
  return {
    angle: best?.angle ?? desiredAngle, blocked: true, blocker: direct.blocker || best?.probe.blocker || "obstacle",
    speedFactor: clamp(0.42 + room * 0.42, 0.42, 0.84), freeDistance: direct.freeDistance,
    side: Math.sign(best?.offset || side) || side,
  };
}
