const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ConnectomeBrain {
  constructor(data, options = {}) {
    this.data = data;
    this.nodes = data.nodes;
    this.index = new Map(this.nodes.map((node, index) => [node.id, index]));
    this.activity = new Float32Array(this.nodes.length);
    this.buffer = new Float32Array(this.nodes.length);
    this.drive = new Float32Array(this.nodes.length);
    this.silenced = new Set();
    this.random = mulberry32(options.seed ?? 73021);
    this.shuffle = Boolean(options.shuffle);
    this.edges = this.buildEdges(data.edges, this.shuffle);
    this.time = 0;
  }

  buildEdges(sourceEdges, shuffled) {
    const edges = sourceEdges.map((edge) => ({
      source: this.index.get(edge.source),
      target: this.index.get(edge.target),
      weight: edge.weight,
      sign: edge.sign,
    })).filter((edge) => edge.source !== undefined && edge.target !== undefined);
    if (shuffled) {
      const targets = edges.map((edge) => edge.target);
      for (let i = targets.length - 1; i > 0; i -= 1) {
        const j = Math.floor(this.random() * (i + 1));
        [targets[i], targets[j]] = [targets[j], targets[i]];
      }
      edges.forEach((edge, index) => { edge.target = targets[index]; });
    }
    const incoming = new Float64Array(this.nodes.length);
    edges.forEach((edge) => { incoming[edge.target] += edge.weight; });
    edges.forEach((edge) => {
      edge.strength = Math.pow(edge.weight / Math.max(1, incoming[edge.target]), 0.72);
    });
    return edges;
  }

  reset() {
    this.activity.fill(0);
    this.buffer.fill(0);
    this.drive.fill(0);
    this.time = 0;
  }

  setSilenced(type, enabled) {
    if (enabled) this.silenced.add(type);
    else this.silenced.delete(type);
  }

  injectType(type, amount, side = "") {
    this.nodes.forEach((node, index) => {
      if (node.type === type && (!side || node.side === side)) {
        this.drive[index] = Math.max(this.drive[index], amount);
      }
    });
  }

  applySensors(sensor) {
    const looming = [
      ["L", sensor.loomLeft || 0],
      ["R", sensor.loomRight || 0],
    ];
    looming.forEach(([side, amount]) => {
      this.injectType("LC4", amount, side);
      this.injectType("LPLC2", amount * 0.92, side);
    });

    this.injectType("ORN_DM1", sensor.odorLeft || 0, "L");
    this.injectType("ORN_DM1", sensor.odorRight || 0, "R");
    this.injectType("ORN_VA2", (sensor.odorLeft || 0) * 0.65, "L");
    this.injectType("ORN_VA2", (sensor.odorRight || 0) * 0.65, "R");

    if (sensor.sweet) {
      [["LB3b", 0.9], ["LB3c", 1], ["LgLG3", 0.7], ["PhG1a", 0.72], ["PhG1b", 0.72], ["PhG1c", 0.72]]
        .forEach(([type, amount]) => this.injectType(type, amount));
    }
    if (sensor.bitter) {
      ["LB1a", "LB1b", "LB1c", "LB1d"].forEach((type) => this.injectType(type, 1));
    }
    if (sensor.touch) this.injectType("JO-B1_a", sensor.touch);
  }

  step(sensor = {}, dt = 1 / 30) {
    this.time += dt;
    this.drive.fill(0);
    this.applySensors(sensor);

    // Four micro-steps let activity traverse the short population graph within
    // one rendered frame while retaining temporal state and inhibition.
    for (let micro = 0; micro < 4; micro += 1) {
      this.buffer.fill(0);
      for (const edge of this.edges) {
        this.buffer[edge.target] += this.activity[edge.source] * edge.strength * edge.sign;
      }
      for (let i = 0; i < this.activity.length; i += 1) {
        const node = this.nodes[i];
        if (this.silenced.has(node.type)) {
          this.activity[i] = 0;
          continue;
        }
        const external = this.drive[i];
        // The selected graph contains recurrent loops.  Keep the population
        // approximation subcritical so an input produces a transient response
        // instead of an all-network seizure.  Negative sums remain inhibitory.
        const recurrent = Math.tanh(this.buffer[i]);
        const spontaneous = 0.00015 * this.random();
        this.activity[i] = clamp(this.activity[i] * 0.56 + external * 0.64 + recurrent * 0.22 + spontaneous);
      }
    }
    return this.outputs();
  }

  mean(type, side = "") {
    let sum = 0;
    let count = 0;
    this.nodes.forEach((node, index) => {
      if (node.type === type && (!side || node.side === side)) {
        sum += this.activity[index];
        count += 1;
      }
    });
    return count ? sum / count : 0;
  }

  outputs() {
    const odorLeft = Math.max(this.mean("DM1_lPN", "L"), this.mean("VA2_adPN", "L"));
    const odorRight = Math.max(this.mean("DM1_lPN", "R"), this.mean("VA2_adPN", "R"));
    return {
      // Population activities are decoded onto 0..1 body command channels.
      // Different gains reflect the very different population sizes/rates.
      escape: clamp(this.mean("DNp01") * 1.45),
      feed: clamp(this.mean("MN9") * 30),
      bitter: clamp(this.mean("GNG087") * 2.2),
      odor: clamp(Math.max(odorLeft, odorRight) * 4),
      odorTurn: clamp((odorRight - odorLeft) * 2.6, -1, 1),
      turn: clamp((this.mean("DNa02", "R") - this.mean("DNa02", "L")) * 2, -1, 1),
      forward: Math.max(this.mean("DNp09"), this.mean("DNg100")),
    };
  }
}

export function runProtocol(data, protocol, options = {}) {
  const brain = new ConnectomeBrain(data, options);
  if (options.silence) options.silence.forEach((type) => brain.setSilenced(type, true));
  let output;
  for (let i = 0; i < (options.steps ?? 40); i += 1) output = brain.step(protocol);
  return { brain, output };
}
