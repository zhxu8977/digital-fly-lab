const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export const DEFAULT_TRAITS = Object.freeze({
  size: 0.5, strength: 0.48, endurance: 0.58, metabolism: 0.55,
  vision: 0.62, smell: 0.72, groundSpeed: 0.56, flightSpeed: 0.7,
  gluttony: 0.52, patience: 0.48, sociability: 0.6,
});

export class BiologicalState {
  constructor(saved = {}) {
    const migrateNonfunctionalPrototypeState = (saved.balanceVersion ?? 0) < 3
      && ((saved.health ?? 0.9) < 0.15 || (saved.injuries?.leg ?? 0) > 0.82 || (saved.fatigue ?? 0.12) > 0.92);
    this.traits = { ...DEFAULT_TRAITS, ...(saved.traits || {}) };
    this.health = clamp(migrateNonfunctionalPrototypeState ? 0.9 : (saved.health ?? 0.9));
    this.stamina = clamp(migrateNonfunctionalPrototypeState ? 1 : (saved.stamina ?? 1));
    this.hunger = clamp(saved.hunger ?? 0.72);
    this.fatigue = clamp(migrateNonfunctionalPrototypeState ? 0.12 : (saved.fatigue ?? 0.12));
    this.pain = clamp(migrateNonfunctionalPrototypeState ? 0 : (saved.pain ?? 0));
    this.stress = clamp(saved.stress ?? 0.16);
    this.arousal = clamp(saved.arousal ?? 0.28);
    this.temperature = clamp(saved.temperature ?? 0.5);
    this.injuries = migrateNonfunctionalPrototypeState
      ? { wing: 0, leg: 0, poison: 0 }
      : { wing: 0, leg: 0, poison: 0, ...(saved.injuries || {}) };
    this.element = saved.element || "neutral";
  }

  update(dt, { moving = false, flying = false, threat = 0, resting = false } = {}) {
    const t = this.traits;
    const activity = flying ? 1 : moving ? 0.45 : 0.12;
    this.hunger = clamp(this.hunger + dt * (0.0018 + t.metabolism * 0.0022) * (1 + activity * 0.7));
    this.fatigue = clamp(this.fatigue + dt * (flying ? 0.0045 : moving ? 0.0008 : -0.012 * t.endurance));
    if (resting) this.fatigue = clamp(this.fatigue - dt * 0.026 * t.endurance);
    this.stress = clamp(this.stress + dt * (threat * 0.08 - (threat < 0.1 ? 0.012 : 0)));
    this.arousal = clamp(this.arousal + dt * (threat * 0.11 + activity * 0.018 - 0.025));
    this.pain = clamp(this.pain - dt * 0.004 * (0.5 + t.endurance));
    this.injuries.poison = clamp(this.injuries.poison - dt * 0.0025 * t.endurance);
    if (this.injuries.poison > 0) {
      this.health = clamp(this.health - dt * this.injuries.poison * 0.005);
      this.stress = clamp(this.stress + dt * 0.008);
    }
    if (!flying) {
      const recovery = moving ? 0.022 + t.endurance * 0.026 : 0.075 + t.endurance * 0.065;
      this.stamina = clamp(this.stamina + dt * recovery * (1 - this.fatigue * 0.42));
    }
  }

  spendStamina(amount) {
    const adjusted = amount * (1.08 - this.traits.endurance * 0.28);
    if (this.stamina < adjusted) return false;
    this.stamina = clamp(this.stamina - adjusted);
    this.fatigue = clamp(this.fatigue + adjusted * 0.1);
    return true;
  }

  recoverStamina(amount) {
    this.stamina = clamp(this.stamina + amount * (0.72 + this.traits.endurance * 0.48));
    return this.stamina;
  }

  eat(nutrition = 0.25) {
    this.hunger = clamp(this.hunger - nutrition);
    this.stamina = clamp(this.stamina + nutrition * 0.22);
    this.stress = clamp(this.stress - nutrition * 0.08);
  }

  takeDamage(amount, { wing = 0, leg = 0, poison = 0 } = {}) {
    const actual = amount * (1.12 - this.traits.endurance * 0.25);
    this.health = clamp(this.health - actual);
    this.pain = clamp(this.pain + actual * 1.5);
    this.stress = clamp(this.stress + actual * 1.2);
    this.injuries.wing = clamp(this.injuries.wing + wing);
    this.injuries.leg = clamp(this.injuries.leg + leg);
    this.injuries.poison = clamp(this.injuries.poison + poison);
    return actual;
  }

  heal(amount = 0.1) {
    this.health = clamp(this.health + amount);
    this.pain = clamp(this.pain - amount * 0.8);
    this.injuries.wing = clamp(this.injuries.wing - amount * 0.45);
    this.injuries.leg = clamp(this.injuries.leg - amount * 0.55);
  }

  canFly() {
    return this.stamina > 0.055 && this.health > 0.12 && this.injuries.wing < 0.72;
  }

  modifiers() {
    const common = (1 - this.fatigue * 0.42) * (1 - this.pain * 0.33) * (0.58 + this.stamina * 0.42);
    return {
      groundSpeed: common * (0.65 + this.traits.groundSpeed * 0.7) * (1 - this.injuries.leg * 0.72),
      flightSpeed: common * (0.62 + this.traits.flightSpeed * 0.72) * (1 - this.injuries.wing * 0.78),
      smell: (0.62 + this.traits.smell * 0.62) * (0.72 + this.hunger * this.traits.gluttony * 0.7) * (1 - this.stress * 0.12),
      vision: (0.7 + this.traits.vision * 0.55) * (1 - this.fatigue * 0.22),
      combat: (0.5 + this.traits.strength * 0.72) * (1 - this.pain * 0.45) * (0.55 + this.stamina * 0.45),
      foodPriority: clamp(this.hunger * (0.65 + this.traits.gluttony * 0.7)),
    };
  }

  randomize(random = Math.random) {
    Object.keys(DEFAULT_TRAITS).forEach((key) => { this.traits[key] = clamp(0.25 + random() * 0.65); });
    this.health = 0.9; this.stamina = 1; this.hunger = 0.55 + random() * 0.25;
    this.fatigue = 0.08; this.pain = 0; this.stress = 0.12; this.arousal = 0.25;
    this.injuries = { wing: 0, leg: 0, poison: 0 };
  }

  snapshot() {
    return {
      balanceVersion: 3,
      traits: { ...this.traits }, health: this.health, stamina: this.stamina, hunger: this.hunger,
      fatigue: this.fatigue, pain: this.pain, stress: this.stress, arousal: this.arousal,
      temperature: this.temperature, injuries: { ...this.injuries }, element: this.element,
    };
  }
}
