const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function resolveCircle(body, collider) {
  const dx = body.x - collider.x;
  const dy = body.y - collider.y;
  const distance = Math.hypot(dx, dy);
  const minimum = body.radius + collider.radius;
  if (distance >= minimum) return false;
  const nx = distance > 0.0001 ? dx / distance : 1;
  const ny = distance > 0.0001 ? dy / distance : 0;
  body.x = collider.x + nx * minimum;
  body.y = collider.y + ny * minimum;
  return true;
}

function resolveBox(body, collider) {
  const rotation = collider.rotation || 0;
  const cosine = Math.cos(-rotation), sine = Math.sin(-rotation);
  const dx = body.x - collider.x, dy = body.y - collider.y;
  let localX = dx * cosine - dy * sine;
  let localY = dx * sine + dy * cosine;
  const nearestX = clamp(localX, -collider.halfWidth, collider.halfWidth);
  const nearestY = clamp(localY, -collider.halfHeight, collider.halfHeight);
  let offsetX = localX - nearestX, offsetY = localY - nearestY;
  const distance = Math.hypot(offsetX, offsetY);
  if (distance >= body.radius) return false;

  if (distance > 0.0001) {
    localX = nearestX + offsetX / distance * body.radius;
    localY = nearestY + offsetY / distance * body.radius;
  } else {
    const left = Math.abs(localX + collider.halfWidth);
    const right = Math.abs(collider.halfWidth - localX);
    const top = Math.abs(localY + collider.halfHeight);
    const bottom = Math.abs(collider.halfHeight - localY);
    const smallest = Math.min(left, right, top, bottom);
    if (smallest === left) localX = -collider.halfWidth - body.radius;
    else if (smallest === right) localX = collider.halfWidth + body.radius;
    else if (smallest === top) localY = -collider.halfHeight - body.radius;
    else localY = collider.halfHeight + body.radius;
  }

  const worldCos = Math.cos(rotation), worldSin = Math.sin(rotation);
  body.x = collider.x + localX * worldCos - localY * worldSin;
  body.y = collider.y + localX * worldSin + localY * worldCos;
  return true;
}

export function resolveCollider(body, collider) {
  if (body.altitude > collider.height + (body.clearance || 12)) return false;
  return collider.shape === "box" ? resolveBox(body, collider) : resolveCircle(body, collider);
}

export function moveBody(body, movement, colliders, bounds) {
  const distance = Math.hypot(movement.x, movement.y);
  const safeStep = Math.max(4, body.radius * 0.42);
  const steps = Math.max(1, Math.ceil(distance / safeStep));
  let collided = false;
  for (let step = 0; step < steps; step += 1) {
    body.x += movement.x / steps;
    body.y += movement.y / steps;
    // A corner can touch more than one collider. A few solver passes prevent one
    // correction from pushing the body back into the neighbouring object.
    for (let pass = 0; pass < 3; pass += 1) {
      let passCollision = false;
      colliders.forEach((collider) => {
        if (resolveCollider(body, collider)) { collided = true; passCollision = true; }
      });
      if (!passCollision) break;
    }
    const nextX = clamp(body.x, bounds.minX + body.radius, bounds.maxX - body.radius);
    const nextY = clamp(body.y, bounds.minY + body.radius, bounds.maxY - body.radius);
    if (nextX !== body.x || nextY !== body.y) collided = true;
    body.x = nextX; body.y = nextY;
  }
  return collided;
}

export function separateBodies(first, second) {
  const dx = second.x - first.x, dy = second.y - first.y;
  const distance = Math.hypot(dx, dy);
  const minimum = first.radius + second.radius;
  if (distance >= minimum) return false;
  const nx = distance > 0.0001 ? dx / distance : 1;
  const ny = distance > 0.0001 ? dy / distance : 0;
  const overlap = minimum - distance;
  const firstShare = second.immovable ? 1 : 0.5;
  const secondShare = first.immovable ? 1 : 0.5;
  first.x -= nx * overlap * firstShare; first.y -= ny * overlap * firstShare;
  second.x += nx * overlap * secondShare; second.y += ny * overlap * secondShare;
  return true;
}
