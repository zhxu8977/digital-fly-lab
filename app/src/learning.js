const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export const DEFAULT_MEMORY = Object.freeze({
  affinity: 0.18,
  fear: 0.28,
  attackSkill: 0.12,
  confidence: 0.35,
  attackAttempts: 0,
  attackHits: 0,
  dodgeLateral: 0.56,
  dodgeVertical: 0.44,
  dodgeAttempts: 0,
  dodgeSuccesses: 0,
  combatEncounters: 0,
  rangeDiscipline: 0.52,
  counterRush: 0.46,
  probePatience: 0.58,
  rememberedPressure: 0.5,
  personality: "balanced",
});

export const PERSONALITIES = Object.freeze({
  balanced: { aggression: 0.46, caution: 0.58, loyalty: 0.62, curiosity: 0.46, label: "稳健型" },
  brave: { aggression: 0.82, caution: 0.3, loyalty: 0.68, curiosity: 0.42, label: "勇猛型" },
  cautious: { aggression: 0.24, caution: 0.88, loyalty: 0.55, curiosity: 0.28, label: "谨慎型" },
  curious: { aggression: 0.38, caution: 0.45, loyalty: 0.48, curiosity: 0.9, label: "好奇型" },
});

/**
 * A deliberately small, inspectable plastic layer. It does not rewrite the
 * MaleCNS graph; it stores associations that a game needs but the connectome
 * dataset does not provide (owner identity and a fictional dash skill).
 */
export class CompanionLearning {
  constructor(saved = {}) {
    this.reset(saved);
  }

  reset(saved = {}) {
    Object.assign(this, DEFAULT_MEMORY, saved);
    this.affinity = clamp(this.affinity);
    this.fear = clamp(this.fear);
    this.attackSkill = clamp(this.attackSkill);
    this.confidence = clamp(this.confidence);
    this.dodgeLateral = clamp(this.dodgeLateral);
    this.dodgeVertical = clamp(this.dodgeVertical);
    this.rangeDiscipline = clamp(this.rangeDiscipline);
    this.counterRush = clamp(this.counterRush);
    this.probePatience = clamp(this.probePatience);
    this.rememberedPressure = clamp(this.rememberedPressure);
    this.setPersonality(PERSONALITIES[this.personality] ? this.personality : "balanced");
  }

  setPersonality(name) {
    this.personality = PERSONALITIES[name] ? name : "balanced";
    Object.assign(this, PERSONALITIES[this.personality]);
  }

  interact(kind) {
    const before = this.snapshot();
    if (kind === "feed") {
      this.affinity = clamp(this.affinity + 0.12);
      this.fear = clamp(this.fear - 0.04);
      this.confidence = clamp(this.confidence + 0.02);
    } else if (kind === "pet") {
      this.affinity = clamp(this.affinity + 0.07);
      this.fear = clamp(this.fear - 0.09);
    } else if (kind === "scare") {
      this.affinity = clamp(this.affinity - 0.05);
      this.fear = clamp(this.fear + 0.2);
      this.confidence = clamp(this.confidence - 0.07);
    } else if (kind === "train") {
      this.attackSkill = clamp(this.attackSkill + 0.14);
      this.confidence = clamp(this.confidence + 0.1);
      this.fear = clamp(this.fear - 0.015);
    }
    return this.delta(before);
  }

  decide({
    ownerDistance = Infinity, enemyDistance = Infinity, escape = 0, neuralEscape = escape, ownerCall = 0,
    health = 1, stamina = 1, enemyStrength = 0.55, enemyHostility = 1, reward = 0.35,
    escapeRoom = 1, ownerCommand = "autonomous",
  }) {
    const ownerNear = clamp(1 - ownerDistance / 330);
    const enemyNear = clamp(1 - enemyDistance / 290);
    const ownerAttraction = clamp((ownerCall * 0.82 + ownerNear * 0.18) * this.affinity * (1 - this.fear * 0.82));
    const combatPower = 0.16 + this.attackSkill * 0.48 + this.confidence * 0.22 + health * 0.14;
    const winChance = clamp(combatPower / (0.15 + enemyStrength * 0.85));
    const escapeChance = clamp(escapeRoom * 0.55 + stamina * 0.3 + health * 0.15 - enemyStrength * 0.16);
    const danger = enemyNear * enemyHostility * (0.25 + enemyStrength * 0.75) * (0.35 + Math.max(neuralEscape, 0.12) * 0.65);
    let benefit = clamp(reward + enemyHostility * 0.2);
    if (ownerCommand === "protect") benefit = clamp(benefit + this.loyalty * 0.45);

    let attackScore = enemyNear * winChance * (0.2 + this.aggression * 0.5 + this.attackSkill * 0.3) * benefit * (1 - this.fear * 0.34);
    let escapeScore = danger * (1 - winChance * 0.55) * (0.4 + this.caution * 0.75) * escapeChance * (0.65 + this.fear * 0.55);
    let ignoreScore = enemyNear * ((1 - enemyHostility) * (0.75 + (1 - reward) * 0.2) + (1 - enemyStrength) * 0.15);
    let observeScore = enemyNear * this.curiosity * (0.3 + Math.min(winChance, 1 - winChance)) * (1 - enemyHostility * 0.55);

    if (ownerCommand === "attack") attackScore += this.loyalty * 0.48 * winChance;
    if (ownerCommand === "retreat") escapeScore += this.caution * 0.5 * escapeChance;
    if (ownerCommand === "protect") attackScore += this.loyalty * 0.42 * enemyHostility * winChance;
    if (escapeRoom < 0.2 && enemyHostility > 0.7) attackScore += (1 - escapeChance) * (0.18 + this.aggression * 0.2) * Math.max(0.25, winChance);
    if (enemyNear < 0.06) attackScore = escapeScore = ignoreScore = observeScore = 0;

    const scores = { attack: clamp(attackScore), escape: clamp(escapeScore), ignore: clamp(ignoreScore), observe: clamp(observeScore) };
    let action = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
    if (scores[action] < 0.055) action = ownerAttraction > 0.1 ? "follow" : "explore";
    const pct = (value) => `${Math.round(value * 100)}%`;
    const reasons = {
      attack: `选择攻击：估计胜算 ${pct(winChance)}，攻击收益 ${pct(benefit)}，${PERSONALITIES[this.personality].label}的攻击评分最高。`,
      escape: `选择撤退：敌方强度 ${pct(enemyStrength)}、神经危险信号 ${pct(neuralEscape)}；当前成功逃脱概率 ${pct(escapeChance)}。`,
      ignore: `选择无视：敌意仅 ${pct(enemyHostility)}，攻击收益 ${pct(reward)}，没有必要为弱小或无害目标承担代价。`,
      observe: `选择观察：局势不明确，好奇心促使它保持距离收集信息。`,
      follow: `没有紧迫威胁，主人呼唤和亲密记忆占优势。`,
      explore: `没有任何行动评分超过阈值，继续自主探索。`,
    };
    return { ownerAttraction, attackDrive: scores.attack, enemyNear, winChance, escapeChance, danger, scores, action, reason: reasons[action] };
  }

  reinforceAttack(success) {
    this.attackAttempts += 1;
    if (success) {
      this.attackHits += 1;
      this.attackSkill = clamp(this.attackSkill + 0.055);
      this.confidence = clamp(this.confidence + 0.075);
      this.fear = clamp(this.fear - 0.025);
    } else {
      this.confidence = clamp(this.confidence - 0.045);
      this.fear = clamp(this.fear + 0.035);
    }
  }

  reinforceEvasion(success, mode = "lateral") {
    this.dodgeAttempts += 1;
    if (success) this.dodgeSuccesses += 1;
    const key = mode === "vertical" ? "dodgeVertical" : "dodgeLateral";
    const other = key === "dodgeVertical" ? "dodgeLateral" : "dodgeVertical";
    this[key] = clamp(this[key] + (success ? 0.035 : -0.022), 0.18, 0.82);
    // 两种反射保留竞争关系，避免永远只学会单一方向。
    this[other] = clamp(this[other] + (success ? -0.008 : 0.012), 0.18, 0.82);
  }

  /**
   * Stores a tiny, explainable summary after a duel. This is deliberately not
   * a replacement connectome: it is the game-side plastic memory that lets the
   * same creature change its next opening after experiencing an opponent.
   */
  learnCombatOutcome({ won = false, opponentPressure = 0.5, hitRate = 0.5, safeRangeSuccess = 0.5 } = {}) {
    this.combatEncounters += 1;
    this.rememberedPressure = clamp(this.rememberedPressure * 0.78 + opponentPressure * 0.22);
    this.rangeDiscipline = clamp(this.rangeDiscipline + (safeRangeSuccess - 0.5) * 0.09, 0.2, 0.85);
    this.probePatience = clamp(this.probePatience + ((hitRate > 0.42 ? 1 : 0) - 0.5) * 0.045, 0.2, 0.86);
    const counterEvidence = opponentPressure > 0.62 ? (won ? 1 : 0) : 0.5;
    this.counterRush = clamp(this.counterRush + (counterEvidence - 0.5) * 0.075, 0.18, 0.82);
    this.confidence = clamp(this.confidence + (won ? 0.025 : -0.018));
  }

  experienceThreat() {
    this.fear = clamp(this.fear + 0.065);
    this.confidence = clamp(this.confidence - 0.04);
  }

  snapshot() {
    return {
      affinity: this.affinity, fear: this.fear, attackSkill: this.attackSkill, confidence: this.confidence,
      attackAttempts: this.attackAttempts, attackHits: this.attackHits,
      dodgeLateral: this.dodgeLateral, dodgeVertical: this.dodgeVertical,
      dodgeAttempts: this.dodgeAttempts, dodgeSuccesses: this.dodgeSuccesses,
      combatEncounters: this.combatEncounters, rangeDiscipline: this.rangeDiscipline,
      counterRush: this.counterRush, probePatience: this.probePatience,
      rememberedPressure: this.rememberedPressure, personality: this.personality,
    };
  }

  delta(before) {
    return {
      affinity: this.affinity - before.affinity,
      fear: this.fear - before.fear,
      attackSkill: this.attackSkill - before.attackSkill,
      confidence: this.confidence - before.confidence,
    };
  }

  relationshipLabel() {
    if (this.fear > 0.7) return "非常害怕";
    if (this.affinity > 0.75 && this.fear < 0.3) return "亲密伙伴";
    if (this.affinity > 0.48 && this.fear < 0.48) return "开始信任";
    if (this.affinity < 0.16) return "保持距离";
    return "保持警惕";
  }
}
