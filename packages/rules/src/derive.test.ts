import { SRD } from "@mesa/srd";
import { describe, expect, it } from "vitest";
import { type ActiveEffect, type CharacterBase, emptyCharacter } from "./character";
import { deriveCharacter, RulesError } from "./derive";

type ClassId = CharacterBase["levels"][number]["classId"];

function char(
  over: Partial<CharacterBase> & { classes?: [ClassId, number][] } = {},
): CharacterBase {
  const { classes = [["fighter", 1]], ...rest } = over;
  const levels = classes.flatMap(([classId, n]) =>
    Array.from({ length: n }, () => ({
      classId,
      hp: SRD.classes.find((c) => c.id === classId)!.hitDie,
    })),
  );
  return { ...emptyCharacter(), name: "Teste", levels, ...rest };
}
const abilities = (o: Partial<CharacterBase["abilities"]>) => ({
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
  ...o,
});
const derive = (c: CharacterBase, effects: ActiveEffect[] = []) => deriveCharacter(c, effects, SRD);
const condition = (key: string): ActiveEffect => {
  const c = SRD.conditions.find((x) => x.key === key)!;
  return { id: key, sourceName: c.namePt, modifiers: c.modifiers, conditionKey: key };
};

describe("classes e multiclasse", () => {
  it("guerreiro 5 / mago 2: BBA e resistências somam por classe", () => {
    const d = derive(
      char({
        classes: [
          ["fighter", 5],
          ["wizard", 2],
        ],
      }),
    );
    expect(d.totalLevel).toBe(7);
    expect(d.bab).toBe(6);
    expect(d.saves.fort.total).toBe(4);
    expect(d.saves.ref.total).toBe(1);
    expect(d.saves.will.total).toBe(4);
    expect(d.classLevels.map((c) => `${c.classId} ${c.level}`)).toEqual(["fighter 5", "wizard 2"]);
  });

  it("ataques iterativos a cada 5 de BBA (máx. 4)", () => {
    const attacks = (n: number) =>
      derive(
        char({
          classes: [["fighter", n]],
          equipment: { ...emptyCharacter().equipment, weapons: ["longsword"] },
        }),
      ).attacks[0]!.bonuses;
    expect(attacks(1)).toEqual([1]);
    expect(attacks(6)).toEqual([6, 1]);
    expect(attacks(11)).toEqual([11, 6, 1]);
    expect(attacks(20)).toEqual([20, 15, 10, 5]);
  });

  it("PV: dado por nível + Con (mínimo 1) + Vitalidade", () => {
    const d = derive(
      char({
        abilities: abilities({ con: 14 }),
        levels: [
          { classId: "fighter", hp: 10 },
          { classId: "fighter", hp: 4 },
        ],
        feats: [{ id: "toughness" }],
      }),
    );
    expect(d.hp.total).toBe(12 + 6 + 3);
    const weak = derive(
      char({ abilities: abilities({ con: 3 }), levels: [{ classId: "wizard", hp: 4 }] }),
    );
    expect(weak.hp.total).toBe(1);
  });

  it("erro claro para raça/classe/item desconhecidos", () => {
    expect(() => derive(char({ raceId: "orc" }))).toThrow(RulesError);
    expect(() => derive(char({ levels: [{ classId: "x" as ClassId, hp: 1 }] }))).toThrow(/Classe/);
    expect(() =>
      derive(char({ equipment: { ...emptyCharacter().equipment, armorId: "nada" } })),
    ).toThrow(/Armadura/);
    expect(() =>
      derive(char({ equipment: { ...emptyCharacter().equipment, weapons: ["nada"] } })),
    ).toThrow(/Arma/);
  });
});

describe("atributos e raça", () => {
  it("ajuste racial, aumentos por nível e buff de melhoria (o maior vale)", () => {
    const d = derive(
      char({ raceId: "half-orc", abilities: abilities({ str: 15 }), abilityIncreases: ["str"] }),
      [
        {
          id: "a",
          sourceName: "Força do Touro",
          modifiers: [{ stat: "str", value: 4, type: "enhancement" }],
        },
        {
          id: "b",
          sourceName: "Cinto +2",
          modifiers: [{ stat: "str", value: 2, type: "enhancement" }],
        },
      ],
    );
    expect(d.abilities.str.score.total).toBe(15 + 2 + 1 + 4);
    expect(d.abilities.str.mod).toBe(6);
    expect(d.abilities.int.score.total).toBe(8);
  });

  it("halfling pequeno: CA, ataque, Esconder-se, agarrar, resistências, deslocamento", () => {
    const d = derive(
      char({
        raceId: "halfling",
        abilities: abilities({ str: 10 }),
        equipment: { ...emptyCharacter().equipment, weapons: ["sword-short"] },
      }),
    );
    expect(d.ac.total.total).toBe(10 + 1 + 1); // Des 12 (+2 racial) +1 e tamanho +1
    expect(d.attacks[0]!.attack.total).toBe(1 + 0 - 1 + 1); // BBA +1, For 8 (−1), tamanho +1
    expect(d.attacks[0]!.damageDice).toBe("1d4");
    expect(d.skills.find((s) => s.id === "hide")!.total.total).toBe(1 + 4);
    expect(d.grapple.total).toBe(1 - 1 - 4);
    expect(d.saves.ref.total).toBe(0 + 1 + 1);
    expect(d.speed.total).toBe(20);
  });
});

describe("empilhamento de bônus na ficha", () => {
  it("dois bônus de moral no ataque não somam; esquiva soma na CA", () => {
    const d = derive(
      char({
        equipment: { ...emptyCharacter().equipment, weapons: ["longsword"] },
        feats: [{ id: "dodge" }],
        abilities: abilities({ dex: 13 }),
      }),
      [
        {
          id: "bless",
          sourceName: "Bênção",
          modifiers: [{ stat: "attack", value: 1, type: "morale" }],
        },
        {
          id: "hero",
          sourceName: "Heroísmo",
          modifiers: [{ stat: "attack", value: 2, type: "morale" }],
        },
        {
          id: "hst",
          sourceName: "Velocidade",
          modifiers: [{ stat: "ac", value: 1, type: "dodge" }],
        },
      ],
    );
    expect(d.attacks[0]!.attack.total).toBe(1 + 0 + 2);
    expect(d.attacks[0]!.attack.parts.find((p) => p.label === "Bênção")?.ignored).toBe(true);
    expect(d.ac.total.total).toBe(10 + 1 + 1 + 1);
  });

  it("armadura arcana não soma com cota de malha (ambos bônus de armadura)", () => {
    const d = derive(
      char({ equipment: { ...emptyCharacter().equipment, armorId: "chain-shirt" } }),
      [
        {
          id: "ma",
          sourceName: "Armadura Arcana",
          modifiers: [{ stat: "ac", value: 4, type: "armor" }],
        },
      ],
    );
    expect(d.ac.total.total).toBe(14);
  });
});

describe("armadura, carga e deslocamento", () => {
  const plate = (raceId = "human", dex = 16) =>
    derive(
      char({
        raceId,
        abilities: abilities({ dex, str: 18 }),
        equipment: {
          ...emptyCharacter().equipment,
          armorId: "full-plate",
          shieldId: "shield-heavy-steel",
        },
      }),
    );

  it("CA total, toque e surpreso com Des limitada pela armadura", () => {
    const d = plate();
    expect(d.ac.maxDex).toBe(1);
    expect(d.ac.total.total).toBe(10 + 8 + 2 + 1);
    expect(d.ac.touch).toBe(11);
    expect(d.ac.flatFooted).toBe(20);
    expect(d.armorCheckPenalty).toBe(-8);
    expect(d.arcaneSpellFailure).toBe(35 + 15);
  });

  it("armadura pesada reduz deslocamento e corrida ×3; anão ignora", () => {
    expect(plate().speed).toMatchObject({ total: 20, run: 60 });
    expect(plate("dwarf").speed).toMatchObject({ total: 20, run: 60 });
    expect(plate("gnome").speed.total).toBe(15);
  });

  it("penalidade de armadura entra nas perícias (Natação em dobro)", () => {
    const d = plate();
    expect(d.skills.find((s) => s.id === "climb")!.total.total).toBe(4 - 8);
    expect(d.skills.find((s) => s.id === "swim")!.total.total).toBe(4 - 16);
  });

  it("carga média limita Des e reduz deslocamento", () => {
    const d = derive(
      char({
        abilities: abilities({ str: 10, dex: 18 }),
        equipment: {
          ...emptyCharacter().equipment,
          gear: [{ name: "Pedras", qty: 1, weight: 50 }],
        },
      }),
    );
    expect(d.load).toMatchObject({ light: 33, medium: 66, heavy: 100, category: "medium" });
    expect(d.ac.total.total).toBe(13);
    expect(d.speed.total).toBe(20);
    expect(d.armorCheckPenalty).toBe(-3);
  });

  it("bárbaro +3 m sem armadura pesada", () => {
    expect(derive(char({ classes: [["barbarian", 1]] })).speed.total).toBe(40);
  });
});

describe("monge", () => {
  it("Sab e bônus de monge na CA, deslocamento e dano desarmado sem armadura", () => {
    const d = derive(
      char({
        classes: [["monk", 5]],
        alignment: "LN",
        abilities: abilities({ wis: 14 }),
        equipment: { ...emptyCharacter().equipment, weapons: ["unarmed-strike"] },
      }),
    );
    expect(d.ac.total.total).toBe(10 + 2 + 1);
    expect(d.speed.total).toBe(40);
    expect(d.attacks[0]!.damageDice).toBe("1d8");
    expect(d.feats.granted).toContain("improved-unarmed-strike");
  });

  it("perde os bônus de armadura", () => {
    const d = derive(
      char({
        classes: [["monk", 5]],
        abilities: abilities({ wis: 14 }),
        equipment: { ...emptyCharacter().equipment, armorId: "leather" },
      }),
    );
    expect(d.ac.total.total).toBe(12);
    expect(d.speed.total).toBe(30);
  });
});

describe("ataques com arma", () => {
  it("espada longa com Foco em Arma e Especialização", () => {
    const d = derive(
      char({
        classes: [["fighter", 4]],
        abilities: abilities({ str: 16 }),
        feats: [
          { id: "weapon-focus", choice: "longsword" },
          { id: "weapon-specialization", choice: "longsword" },
        ],
        equipment: { ...emptyCharacter().equipment, weapons: ["longsword"] },
      }),
    );
    const a = d.attacks[0]!;
    expect(a.attack.total).toBe(4 + 3 + 1);
    expect(a.damageDice).toBe("1d8");
    expect(a.damage.total).toBe(3 + 2);
    expect(a.critical).toBe("19-20/x2");
  });

  it("duas mãos soma 1,5× For; arco só a penalidade; arma sem proficiência −4", () => {
    const d = derive(
      char({
        classes: [["wizard", 1]],
        abilities: abilities({ str: 16 }),
        equipment: {
          ...emptyCharacter().equipment,
          weapons: ["greatsword", "longbow", "quarterstaff"],
        },
      }),
    );
    const [gs, bow, staff] = d.attacks;
    expect(gs!.damage.total).toBe(4);
    expect(gs!.proficient).toBe(false);
    expect(gs!.attack.total).toBe(0 + 3 - 4);
    expect(bow!.damage.total).toBe(0);
    expect(bow!.kind).toBe("ranged");
    expect(staff!.proficient).toBe(true);
    const weak = derive(
      char({
        abilities: abilities({ str: 8 }),
        equipment: { ...emptyCharacter().equipment, weapons: ["longbow"] },
      }),
    );
    expect(weak.attacks[0]!.damage.total).toBe(-1);
  });

  it("Acuidade com Arma usa Des em arma leve", () => {
    const d = derive(
      char({
        abilities: abilities({ str: 10, dex: 16 }),
        feats: [{ id: "weapon-finesse" }],
        equipment: { ...emptyCharacter().equipment, weapons: ["rapier", "longsword"] },
      }),
    );
    expect(d.attacks[0]!.attack.total).toBe(1 + 3);
    expect(d.attacks[1]!.attack.total).toBe(1 + 0);
  });

  it("anão trata machado de guerra anão como arma comum", () => {
    const axe = (raceId: string, classes: [ClassId, number][]) =>
      derive(
        char({
          raceId,
          classes,
          equipment: { ...emptyCharacter().equipment, weapons: ["waraxe-dwarven"] },
        }),
      ).attacks[0]!.proficient;
    expect(axe("dwarf", [["fighter", 1]])).toBe(true);
    expect(axe("human", [["fighter", 1]])).toBe(false);
    expect(axe("dwarf", [["wizard", 1]])).toBe(false);
  });

  it("elfo é proficiente com arco longo mesmo sendo mago", () => {
    const d = derive(
      char({
        raceId: "elf",
        classes: [["wizard", 1]],
        equipment: { ...emptyCharacter().equipment, weapons: ["longbow"] },
      }),
    );
    expect(d.attacks[0]!.proficient).toBe(true);
  });
});

describe("perícias", () => {
  it("pontos: (classe + Int) ×4 no 1º nível, humano +4/+1", () => {
    const rogue = derive(char({ classes: [["rogue", 2]], abilities: abilities({ int: 12 }) }));
    expect(rogue.skillPoints.total).toBe(9 * 4 + 4 + 9 + 1);
    const elfWizard = derive(
      char({ raceId: "elf", classes: [["wizard", 1]], abilities: abilities({ int: 6 }) }),
    );
    expect(elfWizard.skillPoints.total).toBe(4);
  });

  it("classe x fora de classe: custo, máximo e sinergia", () => {
    const d = derive(
      char({
        classes: [["rogue", 3]],
        skills: { tumble: 6, "knowledge.arcana": 3, jump: 5 },
        abilities: abilities({ dex: 14 }),
      }),
    );
    const tumble = d.skills.find((s) => s.id === "tumble")!;
    expect(tumble).toMatchObject({ classSkill: true, maxRanks: 6 });
    expect(tumble.total.total).toBe(6 + 2 + 2); // sinergia de Saltar 5
    const arcana = d.skills.find((s) => s.id === "knowledge.arcana")!;
    expect(arcana).toMatchObject({ classSkill: false, maxRanks: 3 });
    expect(d.skillPoints.spent).toBe(6 + 6 + 5);
    expect(d.skills.find((s) => s.id === "balance")!.total.total).toBe(2 + 2);
  });

  it("treinada sem graduação não é usável; talentos e raça somam", () => {
    const d = derive(
      char({ raceId: "elf", feats: [{ id: "alertness" }, { id: "skill-focus", choice: "spot" }] }),
    );
    expect(d.skills.find((s) => s.id === "open-lock")!.usable).toBe(false);
    expect(d.skills.find((s) => s.id === "spot")!.total.total).toBe(2 + 2 + 3);
    expect(d.skills.find((s) => s.id === "listen")!.total.total).toBe(4);
  });
});

describe("talentos", () => {
  it("espaços: geral a cada 3 níveis, humano +1, guerreiro, mago e monge", () => {
    expect(derive(char({ classes: [["fighter", 1]] })).feats.slots).toEqual({
      general: 2,
      fighter: 1,
      wizard: 0,
      monk: 0,
    });
    expect(
      derive(
        char({
          raceId: "dwarf",
          classes: [
            ["fighter", 4],
            ["wizard", 5],
            ["monk", 6],
          ],
        }),
      ).feats.slots,
    ).toEqual({ general: 6, fighter: 3, wizard: 1, monk: 3 });
  });

  it("encaixa talento de guerreiro no espaço de guerreiro e acusa excesso", () => {
    const ok = derive(
      char({ feats: [{ id: "toughness" }, { id: "power-attack" }, { id: "alertness" }] }),
    );
    expect(ok.feats.overflow).toEqual([]);
    const tooMany = derive(
      char({ feats: [{ id: "toughness" }, { id: "alertness" }, { id: "iron-will" }] }),
    );
    expect(tooMany.feats.overflow).toHaveLength(1);
  });
});

describe("magias por dia", () => {
  it("clérigo 5 com Sab 16: 5/4/3/2 + 1 de domínio", () => {
    const d = derive(char({ classes: [["cleric", 5]], abilities: abilities({ wis: 16 }) }));
    const c = d.spellcasting[0]!;
    expect(c.perDay.slice(0, 4)).toEqual([5, 4, 3, 2]);
    expect(c.perDay[4]).toBeNull();
    expect(c.domainPerDay.slice(0, 4)).toEqual([0, 1, 1, 1]);
    expect(c.casterLevel).toBe(5);
    expect(c.dc.slice(0, 4)).toEqual([13, 14, 15, 16]);
  });

  it("atributo baixo bloqueia níveis altos", () => {
    const c = derive(char({ classes: [["wizard", 5]], abilities: abilities({ int: 11 }) }))
      .spellcasting[0]!;
    expect(c.perDay.slice(0, 4)).toEqual([4, 3, 0, 0]);
    expect(c.maxLevelByAbility).toBe(1);
  });

  it("feiticeiro: magias conhecidas da tabela", () => {
    const c = derive(char({ classes: [["sorcerer", 1]], abilities: abilities({ cha: 16 }) }))
      .spellcasting[0]!;
    expect(c.perDay.slice(0, 2)).toEqual([5, 4]);
    expect(c.known!.slice(0, 2)).toEqual([4, 2]);
  });

  it("paladino: nível de conjurador = metade, só a partir do 4º", () => {
    const p3 = derive(
      char({ classes: [["paladin", 3]], alignment: "LG", abilities: abilities({ cha: 14 }) }),
    );
    expect(p3.spellcasting[0]!.casterLevel).toBe(0);
    const p4 = derive(
      char({ classes: [["paladin", 4]], alignment: "LG", abilities: abilities({ cha: 14 }) }),
    );
    expect(p4.spellcasting[0]).toMatchObject({ casterLevel: 2 });
    expect(p4.spellcasting[0]!.perDay[1]).toBe(1);
    expect(p4.saves.fort.total).toBe(4 + 2); // graça divina
  });
});

describe("condições", () => {
  it("fatigado: −2 For/Des, não corre", () => {
    const d = derive(char({ abilities: abilities({ str: 14, dex: 14 }) }), [condition("fatigued")]);
    expect(d.abilities.str.score.total).toBe(12);
    expect(d.speed.run).toBe(0);
  });

  it("desprevenido perde Des e esquiva; exausto anda metade", () => {
    const d = derive(char({ abilities: abilities({ dex: 16 }), feats: [{ id: "dodge" }] }), [
      condition("flat-footed"),
      condition("exhausted"),
    ]);
    expect(d.ac.total.total).toBe(10);
    expect(d.speed.total).toBe(15);
    expect(d.flags).toEqual(expect.arrayContaining(["loseDexToAc", "halfSpeed"]));
  });

  it("abalado: −2 ataque, resistências e perícias", () => {
    const d = derive(char({ equipment: { ...emptyCharacter().equipment, weapons: ["dagger"] } }), [
      condition("shaken"),
    ]);
    expect(d.attacks[0]!.attack.total).toBe(-1);
    expect(d.saves.will.total).toBe(-2);
    expect(d.skills.find((s) => s.id === "spot")!.total.total).toBe(-2);
  });

  it("paralisado: indefeso (Des −5), sem deslocamento", () => {
    const d = derive(char({ abilities: abilities({ dex: 14 }) }), [condition("paralyzed")]);
    expect(d.ac.total.total).toBe(5);
    expect(d.speed.total).toBe(0);
  });
});
