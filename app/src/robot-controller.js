import { moveBody, resolveCollider } from "./physics.js";

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function robotReceptionPoint(robot, distance = 285) {
  return { x: robot.x + Math.cos(robot.angle) * distance, y: robot.y + Math.sin(robot.angle) * distance };
}

function receptionCorridorBlocked(start, end, radius, collider) {
  if (collider.shape !== "box") {
    const dx = end.x - start.x, dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const progress = lengthSquared ? clamp(((collider.x - start.x) * dx + (collider.y - start.y) * dy) / lengthSquared, 0, 1) : 0;
    return Math.hypot(start.x + dx * progress - collider.x, start.y + dy * progress - collider.y) < radius + collider.radius;
  }
  // A segment against the guest-expanded, rotated box is conservative at the
  // corners and exact along its sides. Unlike point sampling it cannot miss a
  // brief grazing overlap with a thin or rotated wall.
  const rotation = collider.rotation || 0, cosine = Math.cos(-rotation), sine = Math.sin(-rotation);
  const local = (point) => ({ x: (point.x - collider.x) * cosine - (point.y - collider.y) * sine, y: (point.x - collider.x) * sine + (point.y - collider.y) * cosine });
  const a = local(start), b = local(end);
  let enter = 0, exit = 1;
  for (const [axis, extent] of [["x", collider.halfWidth + radius], ["y", collider.halfHeight + radius]]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 0.000001) { if (Math.abs(a[axis]) > extent) return false; }
    else {
      const first = (-extent - a[axis]) / delta, second = (extent - a[axis]) / delta;
      enter = Math.max(enter, Math.min(first, second)); exit = Math.min(exit, Math.max(first, second));
      if (enter > exit) return false;
    }
  }
  return enter <= exit;
}

/**
 * Find a physically usable point in front of the screen, without mutating the
 * robot. The caller must adopt the returned angle as well as the position.
 * A fully blocked/too-small space returns null rather than a fake clipped point.
 */
export function planRobotReception(robot, { distance = 285, bounds, guestRadius = 50, colliders = [] } = {}) {
  const origin = { x: finite(robot?.x), y: finite(robot?.y) };
  const heading = finite(robot?.angle);
  const robotRadius = clamp(finite(robot?.radius, 115), 1, 500);
  const radius = clamp(finite(guestRadius, 50), 1, 500);
  const minimumDistance = robotRadius + radius + 12;
  const requestedDistance = clamp(finite(distance, 285), minimumDistance, 10000);
  const limit = (key, fallback) => typeof bounds?.[key] === "number" && !Number.isNaN(bounds[key]) ? bounds[key] : fallback;
  const region = { minX: limit("minX", -Infinity), minY: limit("minY", -Infinity), maxX: limit("maxX", Infinity), maxY: limit("maxY", Infinity) };
  if (region.maxX - region.minX < radius * 2 || region.maxY - region.minY < radius * 2) return null;
  // The robot has an explicit circular envelope below. Its world proxy must
  // not be mistaken for an unrelated building along the reception corridor.
  const obstacles = colliders.filter((collider) => collider && collider !== robot && !["interaction-screen", "owner"].includes(collider.type));
  const clear = (point) => {
    if (point.x < region.minX + radius || point.x > region.maxX - radius || point.y < region.minY + radius || point.y > region.maxY - radius) return false;
    return !obstacles.some((collider) => resolveCollider({ ...point, radius, altitude: 0 }, collider));
  };
  const angles = [0];
  for (let step = 1; step < 12; step++) angles.push(step * Math.PI / 12, -step * Math.PI / 12);
  angles.push(Math.PI);
  const radii = [...new Set([requestedDistance, Math.max(minimumDistance, requestedDistance * 0.82), Math.max(minimumDistance, requestedDistance * 0.64), minimumDistance])];
  for (const spacing of radii) {
    for (const offset of angles) {
      const angle = Math.atan2(Math.sin(heading + offset), Math.cos(heading + offset));
      const point = { x: origin.x + Math.cos(angle) * spacing, y: origin.y + Math.sin(angle) * spacing };
      if (!clear(point) || Math.hypot(point.x - origin.x, point.y - origin.y) < robotRadius + radius) continue;
      // An endpoint beyond a thin wall is not a useful screen-front location.
      if (!obstacles.some((collider) => receptionCorridorBlocked(origin, point, radius, collider))) return { ...point, angle };
    }
  }
  return null;
}

/** Enough time for long walks, high-altitude landing and a modest detour. */
export function socialCallDuration({ distance = 0, altitude = 0 } = {}) {
  return clamp(Math.max(0, finite(distance)) / 220 + Math.max(0, finite(altitude)) / 72 + 15, 20, 120);
}

export function updateRobot(robot, input, delta, colliders, bounds) {
  const dt = Math.min(0.08, Math.max(0, delta));
  const magnitude = Math.hypot(input.x || 0, input.y || 0);
  const speed = magnitude ? 330 : 0;
  const dx = magnitude ? input.x / magnitude : 0, dy = magnitude ? input.y / magnitude : 0;
  if (magnitude) {
    const desired = Math.atan2(dy, dx);
    const difference = Math.atan2(Math.sin(desired - robot.angle), Math.cos(desired - robot.angle));
    robot.angle += Math.max(-3.8 * dt, Math.min(3.8 * dt, difference));
  }
  const previous = { x: robot.x, y: robot.y };
  const collided = moveBody(robot, { x: dx * speed * dt, y: dy * speed * dt }, colliders.filter((c) => c.type !== "interaction-screen" && c.type !== "owner"), bounds);
  robot.speed = dt ? Math.hypot(robot.x - previous.x, robot.y - previous.y) / dt : 0;
  robot.moving = robot.speed > 1;
  return { collided, reception: robotReceptionPoint(robot) };
}
