import test from "node:test";
import assert from "node:assert/strict";
import { SpiritCollection, SPECIES } from "../src/collection.js";
import { DeveloperPreviewSession } from "../src/developer-preview.js";
import { updateRobot, robotReceptionPoint, planRobotReception, socialCallDuration } from "../src/robot-controller.js";
import { resolveCollider } from "../src/physics.js";

test("developer previews do not unlock forms or mutate the real collection", () => {
  const collection = new SpiritCollection(), session = new DeveloperPreviewSession();
  const original = collection.snapshot();
  for (const form of SPECIES.filter((s) => s.stage === 2).slice(0, 5)) {
    session.begin(collection, { ...original.records[0], id: `preview-${form.id}`, speciesId: form.id });
    collection.resources.coins = 99999; collection.active.wins = 100;
    assert.equal(collection.records.length, original.records.length + 1);
  }
  session.end(collection);
  assert.deepEqual(collection.snapshot(), original);
});
test("robot reception stays on the front and motion cannot pass walls or boundaries", () => {
  const robot = { x: 150, y: 100, angle: 0, radius: 20, altitude: 0 };
  assert.deepEqual(robotReceptionPoint(robot, 30), { x: 180, y: 100 });
  robot.angle = Math.PI / 2;
  assert.ok(Math.abs(robotReceptionPoint(robot, 30).y - 130) < 0.001);
  const wall = { type: "wall", shape: "box", x: 300, y: 150, halfWidth: 10, halfHeight: 150, height: 250 };
  const bounds = { minX: 0, minY: 0, maxX: 500, maxY: 500 };
  for (let i = 0; i < 90; i++) updateRobot(robot, { x: 1, y: 0 }, 1 / 30, [wall], bounds);
  assert.ok(robot.x <= 270.01);
  for (let i = 0; i < 90; i++) updateRobot(robot, { x: -1, y: -1 }, 1 / 30, [wall], bounds);
  assert.ok(robot.x >= 20 && robot.y >= 20);
  updateRobot(robot, { x: 0, y: 0 }, 1 / 30, [], bounds);
  assert.equal(robot.speed, 0);
});

const receptionBounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} must be close to ${expected}`);
function assertUsableReception(point, robot, guestRadius, colliders = [], bounds = receptionBounds) {
  assert.ok(point, "Reception planning must find a usable location");
  assert.ok([point.x, point.y, point.angle].every(Number.isFinite));
  assert.ok(point.x >= bounds.minX + guestRadius && point.x <= bounds.maxX - guestRadius);
  assert.ok(point.y >= bounds.minY + guestRadius && point.y <= bounds.maxY - guestRadius);
  const distance = Math.hypot(point.x - robot.x, point.y - robot.y);
  assert.ok(distance >= robot.radius + guestRadius);
  closeTo(Math.cos(point.angle), (point.x - robot.x) / distance);
  closeTo(Math.sin(point.angle), (point.y - robot.y) / distance);
  for (let step = 0; step <= 50; step++) {
    const position = { x: robot.x + (point.x - robot.x) * step / 50, y: robot.y + (point.y - robot.y) * step / 50 };
    for (const collider of colliders) assert.equal(resolveCollider({ ...position, radius: guestRadius, altitude: 0 }, collider), false, "The reception corridor must not pass through a building");
  }
}

test("planned reception preserves a valid current-facing location and never mutates inputs", () => {
  const robot = { x: 500, y: 500, angle: 0, radius: 115 };
  const input = { distance: 285, bounds: receptionBounds, guestRadius: 50, colliders: [] };
  const original = structuredClone({ robot, input });
  const point = planRobotReception(robot, input);
  assert.deepEqual(point, { x: 785, y: 500, angle: 0 });
  assertUsableReception(point, robot, input.guestRadius);
  assert.deepEqual({ robot, input }, original);
});

test("a boundary-facing robot turns toward its safe reception point, rather than clipping behind itself", () => {
  for (const robot of [
    { x: 885, y: 500, angle: 0, radius: 115 },
    { x: 115, y: 115, angle: -Math.PI * 3 / 4, radius: 115 },
  ]) {
    const point = planRobotReception(robot, { bounds: receptionBounds, guestRadius: 50 });
    assertUsableReception(point, robot, 50);
    assert.ok(Math.abs(Math.atan2(Math.sin(point.angle - robot.angle), Math.cos(point.angle - robot.angle))) > 0.1);
  }
});

test("reception beside a wall finds a clear front corridor even when the original endpoint is beyond the wall", () => {
  const robot = { x: 500, y: 500, angle: 0, radius: 115 };
  const wall = { type: "wall", shape: "box", x: 640, y: 500, halfWidth: 10, halfHeight: 250, height: 300 };
  const point = planRobotReception(robot, { bounds: receptionBounds, guestRadius: 50, colliders: [wall] });
  assertUsableReception(point, robot, 50, [wall]);
  assert.ok(Math.abs(point.angle) > 0.1);
});

test("rotated boxes and circular buildings are respected by reception planning", () => {
  const robot = { x: 300, y: 500, angle: 0, radius: 50 };
  const colliders = [
    { type: "wall", shape: "box", x: 460, y: 500, halfWidth: 15, halfHeight: 100, rotation: Math.PI / 4, height: 300 },
    { type: "rock", shape: "circle", x: 530, y: 390, radius: 55, height: 300 },
  ];
  assertUsableReception(planRobotReception(robot, { bounds: receptionBounds, guestRadius: 30, colliders }), robot, 30, colliders);
});

test("small spaces shorten reception spacing without overlapping the robot, and fully blocked spaces return null", () => {
  const robot = { x: 50, y: 50, angle: 0, radius: 15 };
  const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const point = planRobotReception(robot, { distance: 285, bounds, guestRadius: 10 });
  assertUsableReception(point, robot, 10, [], bounds);
  assert.ok(point.x < 100);
  assert.equal(planRobotReception(robot, { bounds: { ...bounds, maxX: 15 }, guestRadius: 10 }), null);
  assert.equal(planRobotReception(robot, { bounds, guestRadius: 10, colliders: [{ type: "wall", shape: "circle", x: 50, y: 50, radius: 400, height: 300 }] }), null);
});

test("social call duration accounts for high landing and whole-map journeys, with finite limits", () => {
  assert.equal(socialCallDuration(), 20);
  assert.ok(socialCallDuration({ altitude: 1600 }) > 1600 / 72);
  assert.ok(socialCallDuration({ distance: Math.hypot(7200, 4800) }) > 16);
  assert.equal(socialCallDuration({ distance: 1e99, altitude: 1e99 }), 120);
  for (const values of [{ distance: NaN, altitude: Infinity }, { distance: -10, altitude: -10 }]) {
    const duration = socialCallDuration(values);
    assert.ok(Number.isFinite(duration) && duration >= 20 && duration <= 120);
  }
});
