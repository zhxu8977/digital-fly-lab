import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ConnectomeBrain, runProtocol } from "../src/brain.js";

const data = JSON.parse(await readFile(new URL("../public/data/circuit.json", import.meta.url), "utf8"));

test("extracted graph carries MaleCNS provenance and real edges", () => {
  assert.equal(data.provenance.dataset, "male-cns:v1.0");
  assert.ok(data.summary.biologicalNeuronsRepresented > 500);
  assert.ok(data.summary.biologicalSynapsesRepresented > 100_000);
  assert.ok(data.edges.some((edge) => edge.source.startsWith("LC4") && edge.target.startsWith("DNp01")));
});

test("looming activates the DNp01 escape output", () => {
  const control = runProtocol(data, {}, { steps: 28 }).output.escape;
  const loom = runProtocol(data, { loomLeft: 1 }, { steps: 28 }).output.escape;
  assert.ok(loom > control + 0.18, `loom=${loom}, control=${control}`);
});

test("silencing DNp01 removes escape output despite looming", () => {
  const result = runProtocol(data, { loomRight: 1 }, { steps: 28, silence: ["DNp01"] }).output;
  assert.equal(result.escape, 0);
});

test("sweet taste activates MN9 and bitter co-stimulation suppresses it", () => {
  const sweet = runProtocol(data, { sweet: 1 }, { steps: 45 }).output;
  const mixed = runProtocol(data, { sweet: 1, bitter: 1 }, { steps: 45 }).output;
  assert.ok(sweet.feed > 0.08, `sweet feed=${sweet.feed}`);
  assert.ok(mixed.bitter > sweet.bitter + 0.15, `mixed bitter=${mixed.bitter}, sweet bitter=${sweet.bitter}`);
  assert.ok(mixed.feed < sweet.feed, `mixed feed=${mixed.feed}, sweet feed=${sweet.feed}`);
});

test("shuffled control changes the causal response", () => {
  const real = runProtocol(data, { loomLeft: 1 }, { steps: 28 }).output.escape;
  const shuffled = runProtocol(data, { loomLeft: 1 }, { steps: 28, shuffle: true }).output.escape;
  assert.ok(Math.abs(real - shuffled) > 0.08, `real=${real}, shuffled=${shuffled}`);
});

test("two creatures share circuit data but keep neural activity isolated", () => {
  const first = new ConnectomeBrain(data, { seed: 11 });
  const second = new ConnectomeBrain(data, { seed: 22 });
  for (let i = 0; i < 24; i += 1) first.step({ loomLeft: 1 });
  for (let i = 0; i < 24; i += 1) second.step({ sweet: 1 });
  assert.notEqual(first.activity, second.activity);
  assert.ok(first.outputs().escape > second.outputs().escape + 0.1);
  first.reset();
  assert.ok(second.outputs().feed > 0.05, "resetting one brain must not erase the other");
});
