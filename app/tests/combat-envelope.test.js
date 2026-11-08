import assert from "node:assert/strict";
import test from "node:test";
import { combatDamageReach, attackFlightEnvelope } from "../src/combat-envelope.js";
import { ELEMENT_LOADOUTS, SKILLS } from "../src/skills.js";

test("perception and protective skills cannot masquerade as damage reach", () => {
  const skills = {
    mark: { type: "mark", damage: 20, range: 9000 },
    shield: { type: "buff", damage: 40, range: Infinity },
    fake: { type: "projectile", damage: 0, range: 5000 },
    flame: { type: "cone", damage: 22, range: 480 },
    area: { type: "area", damage: 12, range: 9999, radius: 265 },
  };
  assert.equal(combatDamageReach(Object.keys(skills), skills), 480);
  assert.equal(combatDamageReach(["area"], skills), 265);
  assert.equal(combatDamageReach(["mark", "shield", "fake"], skills), 0);
});

test("a fire flyer enters its damaging three-dimensional attack window against a grounded target", () => {
  const reach = combatDamageReach(ELEMENT_LOADOUTS.fire, SKILLS);
  assert.ok(reach > 0);
  const result = attackFlightEnvelope({ reach, desiredRange: 840, requestedAltitude: 1293, targetAltitude: 0 });
  assert.ok(result.desiredRange <= reach * 0.75);
  assert.ok(result.altitude <= reach * 0.4);
  assert.ok(Math.hypot(result.desiredRange, result.altitude) < reach);
});

test("aerial targets and lower attacking flyers receive a relative altitude constraint", () => {
  const result = attackFlightEnvelope({ reach: 480, desiredRange: 800, requestedAltitude: 100, targetAltitude: 1100 });
  assert.equal(result.desiredRange, 360);
  assert.equal(result.altitude, 908);
  assert.ok(Math.hypot(result.desiredRange, result.altitude - 1100) < 480);
});

test("a valid close firing position is kept and retreat can use the entire airspace", () => {
  const existing = attackFlightEnvelope({ reach: 850, desiredRange: 320, requestedAltitude: 230, targetAltitude: 200 });
  assert.deepEqual(existing, { desiredRange: 320, altitude: 230 });
  const roam = attackFlightEnvelope({ reach: 480, desiredRange: 2200, requestedAltitude: 1590, targetAltitude: 0, allowRoam: true });
  assert.deepEqual(roam, { desiredRange: 2200, altitude: 1590 });
});

test("missing or invalid loadouts and no-damage attack requests remain finite", () => {
  assert.equal(combatDamageReach(null, SKILLS), 0);
  assert.equal(combatDamageReach(["missing"], SKILLS), 0);
  assert.equal(combatDamageReach(["bad"], { bad: { damage: "bad", range: Infinity } }), 0);
  assert.deepEqual(attackFlightEnvelope({ reach: 0, desiredRange: 1200, requestedAltitude: 1600, targetAltitude: 230 }), { desiredRange: 0, altitude: 230 });
  assert.deepEqual(attackFlightEnvelope({ reach: Infinity, desiredRange: Infinity, requestedAltitude: NaN, targetAltitude: -50 }), { desiredRange: 0, altitude: 0 });
  assert.deepEqual(attackFlightEnvelope({ desiredRange: -50, requestedAltitude: Infinity, targetAltitude: 240, allowRoam: true }), { desiredRange: 0, altitude: 240 });
});
