import assert from "node:assert/strict";
import test from "node:test";
import { moveBody, separateBodies } from "../src/physics.js";

const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };

test("high-speed movement cannot tunnel through a thin wall", () => {
  const body = { x: 100, y: 500, radius: 20, altitude: 0 };
  const wall = { shape: "box", x: 500, y: 500, halfWidth: 8, halfHeight: 180, rotation: 0, height: 90 };
  assert.equal(moveBody(body, { x: 800, y: 0 }, [wall], bounds), true);
  assert.ok(body.x <= 472, `body crossed wall: ${body.x}`);
});

test("flight clears a low object but collides with a tall one", () => {
  const lowFlight = { x: 100, y: 300, radius: 18, altitude: 80 };
  const tallFlight = { x: 100, y: 700, radius: 18, altitude: 80 };
  const low = { shape: "circle", x: 500, y: 300, radius: 50, height: 40 };
  const tall = { shape: "circle", x: 500, y: 700, radius: 50, height: 100 };
  moveBody(lowFlight, { x: 800, y: 0 }, [low], bounds);
  moveBody(tallFlight, { x: 800, y: 0 }, [tall], bounds);
  assert.ok(lowFlight.x > 800);
  assert.ok(tallFlight.x < 500);
});

test("two biological bodies are separated by their physical radii", () => {
  const first = { x: 100, y: 100, radius: 25 };
  const second = { x: 110, y: 100, radius: 20 };
  assert.equal(separateBodies(first, second), true);
  assert.ok(Math.hypot(first.x - second.x, first.y - second.y) >= 44.999);
});

test("map bounds retain the entire body even at extreme speed", () => {
  const body = { x: 500, y: 500, radius: 30, altitude: 0 };
  assert.equal(moveBody(body, { x: -4000, y: 3000 }, [], bounds), true);
  assert.equal(body.x, 30);
  assert.equal(body.y, 970);
});

test("maximum flight altitude cannot pass through tall owner or cave volumes", () => {
  const flyer = { x: 100, y: 500, radius: 26, altitude: 82 };
  const cave = { shape: "box", x: 500, y: 500, halfWidth: 84, halfHeight: 24, height: 112 };
  moveBody(flyer, { x: 800, y: 0 }, [cave], bounds);
  assert.ok(flyer.x <= 390, `flyer crossed tall cave volume: ${flyer.x}`);

  const secondFlyer = { x: 100, y: 250, radius: 26, altitude: 82 };
  const owner = { shape: "circle", x: 500, y: 250, radius: 25, height: 120 };
  moveBody(secondFlyer, { x: 800, y: 0 }, [owner], bounds);
  assert.ok(secondFlyer.x <= 450, `flyer crossed owner volume: ${secondFlyer.x}`);
});
