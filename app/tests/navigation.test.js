import assert from "node:assert/strict";
import test from "node:test";
import { planGroundRoute, probeGroundPath } from "../src/navigation.js";

const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 700 };

test("ground navigation sees the map boundary before physical contact", () => {
  const body = { x: 850, y: 350, radius: 30, altitude: 0 };
  const probe = probeGroundPath(body, 0, 300, [], bounds);
  assert.equal(probe.blocked, true);
  assert.equal(probe.blocker, "boundary");
  assert.ok(probe.freeDistance < 150);
});

test("ground navigation chooses and keeps a tangent route around a building", () => {
  const body = { x: 220, y: 350, radius: 28, altitude: 0 };
  const building = { type: "building", shape: "box", x: 500, y: 350, halfWidth: 80, halfHeight: 120, rotation: 0, height: 180 };
  const first = planGroundRoute(body, 0, 700, [building], bounds, 1);
  const second = planGroundRoute(body, 0, 700, [building], bounds, first.side);
  assert.equal(first.blocked, true);
  assert.ok(Math.abs(first.angle) > 0.3);
  assert.equal(Math.sign(first.angle), Math.sign(second.angle));
  assert.ok(first.speedFactor < 1);
});

test("ground navigation ignores an obstacle that is physically below the body", () => {
  const body = { x: 220, y: 350, radius: 28, altitude: 140, clearance: 12 };
  const lowRock = { type: "rock", shape: "circle", x: 500, y: 350, radius: 90, height: 50 };
  assert.equal(probeGroundPath(body, 0, 500, [lowRock], bounds).blocked, false);
});
