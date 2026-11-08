const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function updateFlightState(state, { dt, command = "auto", autoWantsFlight = false, stamina = 1 }) {
  let target = 0;
  if (command === "takeoff") target = 82;
  else if (command !== "land" && autoWantsFlight && stamina > 0.1) target = 72;
  if (stamina < 0.06) target = 0;
  const difference = target - state.altitude;
  const rate = difference > 0 ? 105 : 72;
  const nextAltitude = Math.max(0, state.altitude + Math.sign(difference) * Math.min(Math.abs(difference), rate * dt));
  const verticalSpeed = (nextAltitude - state.altitude) / Math.max(dt, 0.0001);
  const flying = nextAltitude > 6;
  const phase = nextAltitude < 1 ? "grounded" : difference > 4 ? "taking-off" : difference < -4 ? "landing" : "flying";
  return { altitude: nextAltitude, verticalSpeed, flying, phase };
}

export function movementSpeed({ flying, action = "explore", stamina = 1, skill = 0 }) {
  // Flight remains much faster, but the biological ratio is compressed so the
  // player can visually follow curved autonomous movement across the arena.
  const base = flying ? 620 : 92;
  const byAction = {
    attack: flying ? 760 + skill * 90 : 190 + skill * 45,
    escape: flying ? 810 : 175,
    observe: flying ? 235 : 46,
    ignore: base,
    follow: flying ? 650 : 105,
    explore: base,
  };
  return byAction[action] * (0.55 + clamp(stamina) * 0.45);
}

export function canClearObstacle(altitude, obstacleHeight) {
  return altitude > obstacleHeight + 12;
}
