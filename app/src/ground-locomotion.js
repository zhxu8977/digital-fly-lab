const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function wrappedDelta(target, current) {
  let value = target - current;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export function selectGroundCombatPace({
  mode = "groundGuard", stamina = 1, fatigue = 0, pain = 0, legInjury = 0,
  neuralDrive = 0.5, dodging = false,
} = {}) {
  const condition = clamp(1 - fatigue * 0.3 - pain * 0.18 - legInjury * 0.6, 0.42, 1);
  const availableEnergy = clamp(stamina * 0.78 + (1 - fatigue) * 0.22, 0, 1);
  const baseByMode = {
    stunned: 0, hold: 0, search: 210, openingProbe: 330, groundGuard: 410,
    rangeControl: 470, adaptiveCounter: 560, angleExit: 610, breakaway: 680,
    wideReposition: 760, scentKite: 730, intercept: 870, chase: 950, flee: 980,
    collisionAvoidance: 1120, reflexDodge: 1140,
  };
  const base = baseByMode[mode] ?? 430;
  if (base === 0) return { desiredSpeed: 0, maxSpeed: 1176 * condition, tier: "idle", burst: false };
  const sustainedScale = 0.68 + availableEnergy * 0.27 + clamp(neuralDrive, 0, 1) * 0.08;
  const normalLimit = 1176 * condition;
  const burst = dodging && stamina > 0.055;
  const maxSpeed = burst ? normalLimit * (1.08 + clamp(stamina, 0, 1) * 0.17) : normalLimit;
  const desiredSpeed = clamp(base * sustainedScale * condition * (burst ? 1.28 : 1), 0, maxSpeed);
  const ratio = desiredSpeed / Math.max(1, normalLimit);
  const tier = burst ? "dodge-burst" : ratio < 0.08 ? "idle" : ratio < 0.3 ? "walk" : ratio < 0.58 ? "run" : ratio < 0.82 ? "fast-run" : "sprint";
  return { desiredSpeed, maxSpeed, tier, burst, condition, availableEnergy };
}

/** Inertial biped controller: planted feet cannot instantly reverse a sprint. */
export function updateGroundLocomotion(state, command, dt) {
  const maxSpeed = Math.max(1, command.maxSpeed || 1040);
  const desiredSpeed = clamp(Number.isFinite(command.desiredSpeed) ? command.desiredSpeed : 0, 0, maxSpeed);
  const airborneBeforeStep = (state.altitude || 0) > 0.001;
  const accelerating = desiredSpeed > state.speed;
  const acceleration = airborneBeforeStep ? 280 : command.dodge ? (accelerating ? 9200 : 6400) : accelerating ? 2650 : 3100;
  // Clamp the incoming state as well as the command. A previous frame used to
  // multiply the stored speed by a biological modifier after this controller,
  // so a full stamina bar could feed an over-limit value back every frame and
  // grow into a screen-crossing teleport.
  const previousSpeed = clamp(Number.isFinite(state.speed) ? state.speed : 0, 0, maxSpeed);
  let speed = clamp(previousSpeed + clamp(desiredSpeed - previousSpeed, -acceleration * dt, acceleration * dt), 0, maxSpeed);
  const speedRatio = clamp(speed / maxSpeed, 0, 1);
  const turnRate = (6.8 - speedRatio * 3.7) * (command.dodge ? 1.42 : 1);
  const previousMoveAngle = Number.isFinite(state.moveAngle) ? state.moveAngle : state.angle;
  // A wingless body has no yaw authority once both feet leave the ground.
  // The take-off heading remains locked until landing; gaze may still move in
  // the presentation layer, and impacts can add a separate physical reaction.
  const moveAngle = airborneBeforeStep ? previousMoveAngle
    : previousMoveAngle + clamp(wrappedDelta(command.desiredAngle ?? previousMoveAngle, previousMoveAngle), -turnRate * dt, turnRate * dt);
  const requestedFacing = Number.isFinite(command.facingAngle) ? command.facingAngle : moveAngle;
  const facingRate = command.combatStrafe ? 5.4 : turnRate;
  const angle = airborneBeforeStep ? state.angle
    : state.angle + clamp(wrappedDelta(requestedFacing, state.angle), -facingRate * dt, facingRate * dt);

  let altitude = Math.max(0, state.altitude || 0);
  let verticalSpeed = state.verticalSpeed || 0;
  let jumped = false;
  if (altitude <= 0.001 && command.jump && (command.stamina ?? 1) > 0.08) {
    verticalSpeed = command.jumpSpeed || 470;
    // Root motion keeps the run-up. A combat leap may add an impulse, but a
    // jump can never delete horizontal momentum or exceed the motor cap.
    speed = clamp(Math.max(speed, command.impulseSpeed || speed), 0, maxSpeed);
    jumped = true;
  }
  if (altitude > 0 || verticalSpeed > 0) {
    verticalSpeed -= 1040 * dt;
    altitude += verticalSpeed * dt;
    if (altitude <= 0) { altitude = 0; verticalSpeed = 0; }
  }
  return { speed, angle, moveAngle, altitude, verticalSpeed, grounded: altitude <= 0.001, jumped };
}
