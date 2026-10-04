import { ABILITIES, ptName, type Spell, type SrdCore } from "@mesa/srd";
import { POINT_BUY_BUDGET, pointBuyCost } from "./abilities";
import { ALIGNMENTS, type CharacterBase } from "./character";
import { type Derived, deriveCharacter, RulesError } from "./derive";
import { checkPrerequisites, isMonkBonusFeat } from "./feats";
import { isWeaponProficient } from "./proficiency";

export type Issue = { path: string; message: string };
export type ValidationResult = { errors: Issue[]; warnings: Issue[]; derived: Derived | null };

// Restrições de tendência por classe (Livro do Jogador).
const ALIGNMENT_RULES: Partial<Record<string, (a: string) => boolean>> = {
  barbarian: (a) => !a.startsWith("L"),
  bard: (a) => !a.startsWith("L"),
  druid: (a) => a.includes("N"),
  monk: (a) => a.startsWith("L"),
  paladin: (a) => a === "LG",
};

/**
 * Confere a ficha contra as regras. `spells` é opcional (o núcleo do SRD não
 * carrega as magias); sem ele, as magias escolhidas não são conferidas.
 */
export function validateCharacter(
  base: CharacterBase,
  srd: SrdCore,
  spells?: Spell[],
): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });

  if (!base.name.trim()) err("name", "Dê um nome ao personagem.");
  if (!srd.races.some((r) => r.id === base.raceId)) err("raceId", "Raça inválida.");
  if (!(ALIGNMENTS as readonly string[]).includes(base.alignment))
    err("alignment", "Tendência inválida.");

  // ---- atributos
  for (const a of ABILITIES) {
    const v = base.abilities[a];
    if (!Number.isInteger(v) || v < 3 || v > 18)
      err(`abilities.${a}`, "Atributo base deve ser de 3 a 18.");
  }
  if (base.abilityMethod === "pointbuy") {
    const cost = pointBuyCost(base.abilities);
    if (cost === null) err("abilities", "No point-buy cada atributo vai de 8 a 18.");
    else if (cost > POINT_BUY_BUDGET)
      err("abilities", `Point-buy gastou ${cost} de ${POINT_BUY_BUDGET} pontos.`);
  }

  // ---- níveis
  if (base.levels.length < 1) err("levels", "Escolha ao menos um nível de classe.");
  if (base.levels.length > 20) err("levels", "Máximo de 20 níveis.");
  base.levels.forEach((l, i) => {
    const cls = srd.classes.find((c) => c.id === l.classId);
    if (!cls) {
      err(`levels.${i}`, `Classe inválida: ${l.classId}.`);
      return;
    }
    if (i === 0 && l.hp !== cls.hitDie)
      err(`levels.${i}.hp`, "No 1º nível os PV são o máximo do dado.");
    if (!Number.isInteger(l.hp) || l.hp < 1 || l.hp > cls.hitDie) {
      err(`levels.${i}.hp`, `PV do nível ${i + 1} deve ser de 1 a ${cls.hitDie}.`);
    }
    const rule = ALIGNMENT_RULES[cls.id];
    if (rule && !rule(base.alignment))
      err("alignment", `Tendência não permitida para ${cls.namePt}.`);
  });
  const increases = Math.floor(base.levels.length / 4);
  if (base.abilityIncreases.length !== increases) {
    err("abilityIncreases", `Escolha ${increases} aumento(s) de atributo (1 a cada 4 níveis).`);
  }

  if (errors.length) return { errors, warnings, derived: null };

  let derived: Derived;
  try {
    derived = deriveCharacter(base, [], srd);
  } catch (e) {
    if (e instanceof RulesError) {
      err("", e.message);
      return { errors, warnings, derived: null };
    }
    throw e;
  }

  // ---- perícias
  const skillIds = new Set(srd.skills.map((s) => s.id));
  for (const [id, ranks] of Object.entries(base.skills)) {
    if (!skillIds.has(id)) {
      err(`skills.${id}`, `Perícia desconhecida: ${id}.`);
      continue;
    }
    const d = derived.skills.find((s) => s.id === id)!;
    if (ranks < 0 || !Number.isInteger(ranks * 2)) err(`skills.${id}`, "Graduação inválida.");
    else if (d.classSkill && !Number.isInteger(ranks)) {
      err(`skills.${id}`, `${d.namePt}: perícia de classe não tem meia graduação.`);
    } else if (ranks > d.maxRanks)
      err(`skills.${id}`, `${d.namePt}: máximo de ${d.maxRanks} graduações.`);
  }
  if (derived.skillPoints.spent > derived.skillPoints.total) {
    err(
      "skills",
      `Pontos de perícia: ${derived.skillPoints.spent} de ${derived.skillPoints.total}.`,
    );
  }

  // ---- talentos
  const levelsByClass = Object.fromEntries(derived.classLevels.map((c) => [c.classId, c.level]));
  const ctx = {
    abilities: Object.fromEntries(
      ABILITIES.map((a) => [a, derived.abilities[a].score.total]),
    ) as Record<(typeof ABILITIES)[number], number>,
    bab: derived.bab,
    totalLevel: derived.totalLevel,
    classLevels: levelsByClass,
    casterLevel: Math.max(0, ...derived.spellcasting.map((s) => s.casterLevel)),
    skillRanks: base.skills,
    feats: base.feats,
    isProficient: (weaponId: string) => {
      const w = srd.weapons.find((x) => x.id === weaponId);
      return (
        !!w &&
        isWeaponProficient(w, {
          classIds: derived.classLevels.map((c) => c.classId),
          raceId: base.raceId,
          feats: base.feats,
        })
      );
    },
  };
  const seen = new Set<string>();
  base.feats.forEach((f, i) => {
    const feat = srd.feats.find((x) => x.id === f.id);
    if (!feat) {
      err(`feats.${i}`, `Talento desconhecido: ${f.id}.`);
      return;
    }
    if (feat.choice && !f.choice)
      err(
        `feats.${i}`,
        `${ptName(feat)}: escolha ${(feat.choicePt ?? feat.choice).toLowerCase()}.`,
      );
    const key = feat.multiple ? `${f.id}:${f.choice ?? ""}` : f.id;
    if (seen.has(key) && !feat.stack) err(`feats.${i}`, `${ptName(feat)} repetido.`);
    seen.add(key);
    if (derived.feats.granted.includes(f.id))
      warn(`feats.${i}`, `${ptName(feat)} já vem da classe.`);
    // Talento extra de monge ignora pré-requisito.
    if ((levelsByClass.monk ?? 0) > 0 && isMonkBonusFeat(f.id)) return;
    for (const r of checkPrerequisites(feat, f.choice, ctx, srd)) {
      if (r.ok === false) err(`feats.${i}`, `${ptName(feat)}: falta "${r.textPt}".`);
      else if (r.ok === null)
        warn(`feats.${i}`, `${ptName(feat)}: confira "${r.textPt}" com o mestre.`);
    }
  });
  if (derived.feats.overflow.length) {
    const names = derived.feats.overflow.map((i) => base.feats[i]!.id).join(", ");
    err("feats", `Talentos além dos espaços disponíveis: ${names}.`);
  }

  // ---- equipamento
  const { armorId, shieldId, weapons, gear } = base.equipment;
  if (armorId && srd.armor.find((a) => a.id === armorId)?.kind === "shield") {
    err("equipment.armorId", "Escudo não vai no lugar da armadura.");
  }
  if (shieldId && srd.armor.find((a) => a.id === shieldId)?.kind !== "shield") {
    err("equipment.shieldId", "Escolha um escudo.");
  }
  for (const w of weapons) {
    const weapon = srd.weapons.find((x) => x.id === w);
    if (weapon && !isWeaponProficient(weapon, ctx_who())) {
      warn("equipment.weapons", `Sem proficiência com ${ptName(weapon)}: −4 no ataque.`);
    }
  }
  gear.forEach((g, i) => {
    if (!g.name.trim()) err(`equipment.gear.${i}`, "Item sem nome.");
    if (!Number.isInteger(g.qty) || g.qty < 1) err(`equipment.gear.${i}`, "Quantidade inválida.");
    if (!(g.weight >= 0)) err(`equipment.gear.${i}`, "Peso inválido.");
  });
  if (derived.load.category === "overloaded") err("equipment", "Peso acima da carga máxima.");

  // ---- domínios
  const clericLevel = levelsByClass.cleric ?? 0;
  if (clericLevel > 0) {
    if (base.domains.length !== 2 || new Set(base.domains).size !== 2)
      err("domains", "Clérigo escolhe 2 domínios.");
    for (const d of base.domains) {
      if (!srd.domains.some((x) => x.id === d)) err("domains", `Domínio desconhecido: ${d}.`);
    }
  } else if (base.domains.length) err("domains", "Só clérigo tem domínios.");

  // ---- magias
  for (const [classId, chosen] of Object.entries(base.spells)) {
    const casting = derived.spellcasting.find((s) => s.classId === classId);
    if (!casting) {
      if (chosen && (chosen.known.length || chosen.prepared.some((l) => l.length))) {
        err(`spells.${classId}`, "Classe sem magias neste nível.");
      }
      continue;
    }
    if (!chosen || !spells) continue;
    const levelOf = (id: string) => {
      const sp = spells.find((x) => x.id === id);
      return sp ? sp.levels[casting.list] : undefined;
    };
    const domainSpellIds = new Set(
      base.domains.flatMap(
        (d) => srd.domains.find((x) => x.id === d)?.spells.map((s) => s.id) ?? [],
      ),
    );
    const knownByLevel: number[] = Array(10).fill(0);
    for (const id of chosen.known) {
      const lvl = levelOf(id);
      if (lvl === undefined) err(`spells.${classId}`, `Magia fora da lista: ${id}.`);
      else if (casting.perDay[lvl] == null)
        err(`spells.${classId}`, `Magia de nível ${lvl} ainda não disponível: ${id}.`);
      else knownByLevel[lvl]!++;
    }
    if (casting.style === "spontaneous" && casting.known) {
      knownByLevel.forEach((n, lvl) => {
        const max = casting.known![lvl] ?? 0;
        if (n > max) err(`spells.${classId}`, `Magias conhecidas de nível ${lvl}: ${n} de ${max}.`);
      });
    }
    if (casting.style === "prepared") {
      chosen.prepared.forEach((list, lvl) => {
        const max = (casting.perDay[lvl] ?? 0) + (casting.domainPerDay[lvl] ?? 0);
        if (list.length > max)
          err(`spells.${classId}`, `Preparadas de nível ${lvl}: ${list.length} de ${max}.`);
        for (const id of list) {
          const okLevel =
            levelOf(id) === lvl || (domainSpellIds.has(id) && spellDomainLevel(id) === lvl);
          if (!okLevel) err(`spells.${classId}`, `${id} não é magia de nível ${lvl} da lista.`);
          if (classId === "wizard" && !chosen.known.includes(id)) {
            err(`spells.${classId}`, `${id} não está no grimório.`);
          }
        }
      });
    }

    function spellDomainLevel(id: string) {
      for (const d of base.domains) {
        const idx = srd.domains.find((x) => x.id === d)?.spells.findIndex((s) => s.id === id) ?? -1;
        if (idx >= 0) return idx + 1;
      }
      return -1;
    }
  }

  // ---- PV atuais
  const maxHp = derived.hp.total;
  if (base.hp.current > maxHp + base.hp.temp)
    err("hp.current", `PV atuais acima do máximo (${maxHp}).`);
  if (base.hp.current < -10) err("hp.current", "PV atuais abaixo de −10.");
  if (base.hp.nonlethal < 0 || base.hp.temp < 0)
    err("hp", "Dano não letal e PV temporários não podem ser negativos.");

  return { errors, warnings, derived };

  function ctx_who() {
    return {
      classIds: derived.classLevels.map((c) => c.classId),
      raceId: base.raceId,
      feats: base.feats,
    };
  }
}
