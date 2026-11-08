import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { ConnectomeBrain } from "../src/brain.js";

const data = JSON.parse(fs.readFileSync(new URL("../public/data/circuit.json", import.meta.url), "utf8"));
const count = 50, frames = 300;
const brains = Array.from({ length: count }, (_, index) => new ConnectomeBrain(data, { seed: 73021 + index * 97 }));
const started = performance.now();
for (let frame = 0; frame < frames; frame += 1) {
  brains.forEach((brain, index) => brain.step({
    loomLeft: frame % (31 + index % 7) === 0 ? 1 : 0,
    loomRight: frame % (37 + index % 5) === 0 ? 0.8 : 0,
    odorLeft: (index % 5) / 5,
    odorRight: ((index + 2) % 5) / 5,
  }, 1 / 30));
}
const elapsedMs = performance.now() - started;
console.log(JSON.stringify({ brains: count, simulatedSeconds: frames / 30, steps: count * frames, elapsedMs: Number(elapsedMs.toFixed(1)), stepsPerSecond: Math.round(count * frames / (elapsedMs / 1000)), realtimeHeadroom: Number(((frames / 30) / (elapsedMs / 1000)).toFixed(1)) }));
