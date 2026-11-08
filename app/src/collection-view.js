import { SPECIES, SPECIES_BY_ID, experienceForLevel, MAX_LEVEL, TRAINING_CAP } from "./collection.js";
import { ELEMENTS, elementMultiplier } from "./skills.js";
import { getSpeciesPortrait } from "./creature-art.js";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const bodies = { aerial: "飞行伙伴", biped: "双足斗士", corgi: "短腿玩偶", cat: "四足伙伴" };

/** One registry drives the dex, experimental selectors and complete chart. */
export function populateElementSelectors() {
  const options = Object.entries(ELEMENTS).map(([id, element]) => `<option value="${escapeHtml(id)}">${escapeHtml(element.label)}</option>`).join("");
  for (const id of ["collectionElementFilter", "creatureElement", "enemyElement", "duelPlayerElement", "duelRivalElement"]) {
    const selector = document.getElementById(id); if (!selector) continue;
    const previous = selector.value;
    selector.innerHTML = `${id === "collectionElementFilter" ? '<option value="all">全部属性</option>' : ""}${options}`;
    selector.value = previous === "all" && id === "collectionElementFilter" || Object.hasOwn(ELEMENTS, previous) ? previous : id === "collectionElementFilter" ? "all" : "neutral";
  }
}

export function attributeChartHtml() {
  const entries = Object.entries(ELEMENTS);
  const heads = entries.map(([, element]) => `<th scope="col">${escapeHtml(element.label)}</th>`).join("");
  const rows = entries.map(([attack, element]) => `<tr><th scope="row">${escapeHtml(element.label)}</th>${entries.map(([defense, target]) => {
    const value = elementMultiplier(attack, defense);
    const band = value > 1.001 ? "strong" : value < 0.999 ? "weak" : "normal";
    const label = `${Number(value.toFixed(2))}×`;
    return `<td class="${band}" title="${escapeHtml(element.label)}攻击${escapeHtml(target.label)}：${label}">${label}</td>`;
  }).join("")}</tr>`).join("");
  return `<table class="attribute-chart"><caption>行：攻击属性；列：目标属性；${entries.length}种属性的实际技能伤害倍率</caption><thead><tr><th scope="col">攻击 ↓ / 防守 →</th>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
}

// This is the game progression interface, not a claim of connectome plasticity.
export function mountCollectionView(collection, callbacks) {
  const query = (id) => document.getElementById(id);
  const isBattling = () => Boolean(callbacks.isBattling?.());
  let developerEnabled = query("developerMode")?.checked ?? true;
  let previewSpeciesId = callbacks.previewId?.() || null;
  let lastNotice = "每只伙伴分别保存体质、性格和记忆。选择一只，去花园观察或开始对战。";
  const notice = (message) => { lastNotice = message; query("collectionMessage").textContent = message; };
  const recordsFor = (speciesId) => collection.records.filter((record) => SPECIES_BY_ID[record.speciesId].familyId === SPECIES_BY_ID[speciesId].familyId);
  function render() {
    const active = collection.active, species = collection.species;
    const preview = SPECIES_BY_ID[previewSpeciesId];
    document.querySelector(".shell").dataset.developerMode = String(developerEnabled);
    if (query("developerMode")) { query("developerMode").checked = developerEnabled; query("developerMode").disabled = isBattling(); }
    if (query("exitDeveloperPreview")) query("exitDeveloperPreview").disabled = !preview || isBattling();
    if (query("developerPreviewStatus")) query("developerPreviewStatus").textContent = preview ? `正在开发预览：${preview.name} · 不写入真实培养存档` : developerEnabled ? "真实伙伴出场；图鉴中任意形态可单独开发预览。" : "正常培养模式 · 形态需要按条件进化解锁。";
    if (query("collectionScope")) query("collectionScope").textContent = `图鉴包含${new Set(SPECIES.map((item) => item.familyId)).size}个原创家族，共${SPECIES.length}个成长形态，覆盖${Object.keys(ELEMENTS).length}种属性。`;
    query("collectionCount").textContent = `${collection.unlocked.length} / ${SPECIES.length}`;
    query("collectionCoins").textContent = collection.resources.coins;
    query("collectionFood").textContent = collection.resources.food;
    query("collectionCrystals").textContent = collection.resources.materials.evolutionShard;
    const search = query("collectionSearch").value.trim().toLowerCase();
    const element = query("collectionElementFilter").value, stage = query("collectionStageFilter").value;
    const visible = SPECIES.filter((item) => (!search || `${item.name}${item.role}${item.description}${bodies[item.bodyType]}`.toLowerCase().includes(search))
      && (element === "all" || element === item.element) && (stage === "all" || (stage === "base" ? item.stage === 0 : item.stage > 0)));
    query("collectionGrid").innerHTML = visible.map((item) => {
      const owned = recordsFor(item.id), discovered = collection.unlocked.includes(item.id), chosen = active?.speciesId === item.id;
      const futureShape = owned.length ? item.stage > SPECIES_BY_ID[owned[0].speciesId].stage : item.stage > 0;
      const label = chosen ? "正在陪伴" : futureShape ? "通过进化解锁" : owned.length ? item.id === owned[0].speciesId ? "选择伙伴" : "选择此家族" : "领养 · 85 星币";
      return `<article class="species-card ${chosen ? "selected" : ""} ${previewSpeciesId === item.id ? "previewing" : ""} ${discovered ? "owned" : "locked"}" style="--species-color:${item.colors.accent}">
        <div class="spirit-art"><img src="${getSpeciesPortrait(item)}" alt="${escapeHtml(item.name)}" loading="lazy" /></div>
        <div class="species-meta"><span class="element-badge">${ELEMENTS[item.element].label}</span><span>${item.stage === 0 ? "初始形态" : item.stage === 1 ? "进阶形态" : "最终形态"}</span></div>
        <h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.role)} · ${bodies[item.bodyType]}</p>
        <small>${escapeHtml(item.description)}</small>
        <button type="button" data-collection-species="${item.id}" ${futureShape || chosen || preview || isBattling() ? "disabled" : ""}>${label}</button>
        ${developerEnabled ? `<button class="developer-preview-button" type="button" data-preview-species="${item.id}" ${isBattling() || !callbacks.onPreview ? "disabled" : ""}>${previewSpeciesId === item.id ? "正在开发预览" : "开发预览"}</button>` : ""}
      </article>`;
    }).join("") || '<p class="empty-state">没有符合筛选的精灵，试试其他属性或名字。</p>';
    query("activeSpiritName").textContent = active.nickname || species.name;
    query("activeSpiritSubtitle").textContent = `${species.name} · ${ELEMENTS[species.element].label} · ${bodies[species.bodyType]} · ${species.role}`;
    query("activeSpiritPortrait").innerHTML = `<img src="${getSpeciesPortrait(species)}" alt="${escapeHtml(species.name)}" />`;
    query("activeSpiritLevel").textContent = `Lv.${active.level}`;
    const needed = experienceForLevel(Math.min(MAX_LEVEL, active.level + 1)) - experienceForLevel(active.level);
    const currentXp = active.xp - experienceForLevel(active.level);
    query("activeSpiritXp").max = needed || 1; query("activeSpiritXp").value = active.level >= MAX_LEVEL ? 1 : currentXp;
    query("activeSpiritXpText").textContent = active.level >= MAX_LEVEL ? "已达等级上限" : `${currentXp} / ${needed} 经验`;
    query("activeSpiritBond").max = 100; query("activeSpiritBond").value = active.bond;
    const stats = collection.stats();
    const personality = { brave: "勇敢", curious: "好奇", cautious: "谨慎", balanced: "稳健" };
    query("activeSpiritStats").innerHTML = `<span>生命<b>${Math.round(stats.health)}</b></span><span>攻击<b>${stats.attack.toFixed(2)}×</b></span><span>防御<b>${Math.round(stats.defense * 100)}%</b></span><span>速度潜力<b>${Math.round(stats.speed)}</b></span><span>亲密度<b>${Math.round(active.bond)} / 100</b></span><span>训练负荷<b>${active.trainingLoad}%</b></span><span>性格<b>${personality[active.memory?.personality || species.personality] || "稳健"}</b></span>`;
    const t = active.training;
    query("activeSpiritTraining").innerHTML = [ ["power", "力量"], ["endurance", "耐力"], ["agility", "敏捷"] ].map(([key,label]) => `<span>${label}<b>${t[key]} / ${TRAINING_CAP}</b><progress max="${TRAINING_CAP}" value="${t[key]}"></progress></span>`).join("");
    const line = SPECIES.filter((item) => item.familyId === species.familyId).sort((a,b) => a.stage-b.stage);
    query("activeSpiritEvolution").innerHTML = line.map((item) => `<div class="evolution-step ${item.stage === species.stage ? "current" : ""}"><img src="${getSpeciesPortrait(item)}" alt="${escapeHtml(item.name)}" /><b>${escapeHtml(item.name)}</b><span>${item.stage < species.stage ? "已进化" : item.stage === species.stage ? "当前形态" : "待成长"}</span></div>`).join('<span class="evolution-arrow">→</span>');
    const evolution = collection.canEvolve();
    query("evolutionRequirement").textContent = evolution.next ? evolution.ready ? `条件满足，可以进化为 ${evolution.next.name}。` : evolution.reasons.join(" · ") : "这是最终形态。继续培养仍能提升战斗表现。";
    query("evolveSpirit").disabled = !evolution.ready || isBattling() || Boolean(preview);
    query("evolveSpirit").textContent = evolution.next ? `进化为 ${evolution.next.name}` : "已到最终形态";
    query("collectionMessage").textContent = lastNotice;
    query("collectStarter").disabled = isBattling() || Boolean(preview) || !SPECIES.some((item) => item.stage === 0 && !recordsFor(item.id).length);
    const nickname = query("renameSpirit"); if (nickname) { nickname.disabled = isBattling() || Boolean(preview); if (document.activeElement !== nickname) nickname.value = active.nickname || ""; }
    document.querySelectorAll("[data-cultivate]").forEach((button) => { button.disabled = isBattling() || Boolean(preview); });
    const ownedOptions = collection.records.filter((record) => !record.developerPreview).map((record) => {
      const item = SPECIES_BY_ID[record.speciesId];
      return `<option value="${record.id}">${escapeHtml(record.nickname || item.name)} · Lv.${record.level} · ${ELEMENTS[item.element].label}</option>`;
    }).join("");
    for (const id of ["worldSpeciesSelect", "playerSpeciesSelect"]) {
      const selector = query(id); if (!selector) continue;
      const previewOption = preview && active.developerPreview ? `<option value="${escapeHtml(active.id)}">开发预览 · ${escapeHtml(preview.name)} · 不存档</option>` : "";
      selector.innerHTML = ownedOptions + previewOption; selector.value = active.id; selector.disabled = isBattling();
    }
    const opponent = query("rivalSpeciesSelect");
    if (opponent && document.activeElement !== opponent) {
      const chosenRival = callbacks.rivalId();
      opponent.innerHTML = SPECIES.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${ELEMENTS[item.element].label} · ${item.stage === 0 ? "初始" : item.stage === 1 ? "进阶" : "最终"}</option>`).join("");
      opponent.value = chosenRival; opponent.disabled = isBattling();
    }
  }
  function action(callback) {
    if (isBattling()) { notice("先完成或停止当前对战，再切换伙伴、培养或进化，避免战斗中改变属性。"); return; }
    if (previewSpeciesId) { notice("正在开发预览。先返回真实伙伴，再培养、领养或进化；预览不会修改你的培养存档。"); return; }
    const result = callback();
    notice(result?.message || "伙伴状态已更新。"); render();
  }
  query("collectionGrid").addEventListener("click", (event) => {
    const previewButton = event.target.closest("[data-preview-species]");
    if (previewButton) {
      if (!developerEnabled || isBattling()) { notice("请先停止对战，并开启开发模式，再预览其他形态。"); return; }
      const id = previewButton.dataset.previewSpecies;
      if (!SPECIES_BY_ID[id] || !callbacks.onPreview) return;
      const result = callbacks.onPreview(id);
      if (result?.ok !== false) previewSpeciesId = id;
      notice(result?.message || `开发预览${SPECIES_BY_ID[id].name}：不消耗资源，不解锁或覆盖真实存档。`); render(); return;
    }
    const button = event.target.closest("[data-collection-species]"); if (!button) return;
    const id = button.dataset.collectionSpecies, owned = recordsFor(id);
    const candidate = SPECIES_BY_ID[id];
    if (!candidate || candidate.stage > (owned.length ? SPECIES_BY_ID[owned[0].speciesId].stage : 0)) { notice("这是成长形态，请培养并进化；开发预览不会解锁它。"); return; }
    action(() => owned.length ? callbacks.onSelect(owned[0].id) : callbacks.onAdopt(id));
  });
  for (const id of ["collectionSearch", "collectionElementFilter", "collectionStageFilter"]) query(id).addEventListener(id === "collectionSearch" ? "input" : "change", render);
  document.querySelectorAll("[data-cultivate]").forEach((button) => button.addEventListener("click", () => action(() => callbacks.onTrain(button.dataset.cultivate))));
  query("evolveSpirit").addEventListener("click", () => action(callbacks.onEvolve));
  query("collectStarter").addEventListener("click", () => action(() => {
    const choices = SPECIES.filter((item) => item.stage === 0 && !recordsFor(item.id).length);
    return choices.length ? callbacks.onAdopt(choices[Math.floor(Math.random() * choices.length)].id) : { message: "全部家族的初始伙伴都已领养。" };
  }));
  for (const id of ["worldSpeciesSelect", "playerSpeciesSelect"]) query(id)?.addEventListener("change", (event) => action(() => callbacks.onSelect(event.target.value)));
  query("rivalSpeciesSelect")?.addEventListener("change", (event) => { if (!isBattling()) callbacks.onRival(event.target.value); render(); });
  query("renameSpirit")?.addEventListener("change", (event) => {
    action(() => { collection.active.nickname = event.target.value.trim().slice(0, 16); callbacks.onSave(); return { message: "伙伴昵称已保存。" }; });
  });
  query("developerMode")?.addEventListener("change", (event) => {
    if (isBattling()) { render(); notice("先停止对战，再切换开发模式。"); return; }
    developerEnabled = event.target.checked;
    callbacks.onDeveloperMode?.(developerEnabled);
    if (!developerEnabled && previewSpeciesId) { callbacks.onExitPreview?.(); previewSpeciesId = null; }
    notice(developerEnabled ? "开发模式已开启：所有形态可以临时预览，真实进化条件保持不变。" : "已回到正常培养模式，继续原有伙伴的成长。" ); render();
  });
  query("exitDeveloperPreview")?.addEventListener("click", () => {
    if (isBattling()) { notice("先停止当前对战，再返回真实伙伴。"); return; }
    const result = callbacks.onExitPreview?.();
    if (result?.ok !== false) previewSpeciesId = null;
    notice(result?.message || "已返回真实伙伴，临时预览没有改变培养存档。" ); render();
  });
  function navigate(tab) {
    const button = document.querySelector(`[data-workspace-tab="${tab}"]`);
    document.querySelector(".shell").dataset.activeTab = tab;
    document.querySelectorAll("[data-workspace-tab]").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", item === button ? "true" : "false"); });
    document.querySelectorAll("[data-workspace-section]").forEach((section) => { section.hidden = section.dataset.workspaceSection !== tab; });
    // The previous body/element widgets are an experimental rig adapter, not
    // normal species editing. Keep the collection's identity consistent.
    for (const id of ["worldBodyPreview", "creatureElement", "playerBodyType", "rivalBodyType", "duelPlayerElement", "duelRivalElement", "playerWingStyle", "rivalWingStyle"]) {
      const control = query(id); if (control) control.disabled = tab !== "science" || isBattling();
    }
    if (tab === "collection") { render(); callbacks.onPreviewView?.(); }
    if (tab === "interaction") callbacks.onInteractionView?.();
    if (tab === "duel") callbacks.onBattleView?.();
    // Keep the live world in view. Scrolling to the settings below it made
    // starting a match immediately hide the very battle being controlled.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.querySelectorAll("[data-workspace-tab]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.workspaceTab)));
  populateElementSelectors();
  if (query("attributeChart")) query("attributeChart").innerHTML = attributeChartHtml();
  callbacks.onDeveloperMode?.(developerEnabled);
  render();
  navigate("arena");
  return { render, notice, isDeveloperMode: () => developerEnabled, previewId: () => previewSpeciesId, setPreview(id) { previewSpeciesId = SPECIES_BY_ID[id] ? id : null; render(); } };
}
