import { SRD } from "@mesa/srd";
import { SPELLS } from "@mesa/srd/spells";
import { describe, expect, it } from "vitest";
import { pointBuyCost } from "./abilities";
import { type CharacterBase, emptyCharacter } from "./character";
import { validateCharacter } from "./validate";

const valid = (): CharacterBase => ({
  ...emptyCharacter(),
  name: "Tordek",
  raceId: "dwarf",
  alignment: "LN",
  abilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
  levels: [{ classId: "fighter", hp: 10 }],
  skills: { climb: 2, jump: 2 },
  feats: [{ id: "power-attack" }, { id: "cleave" }],
  equipment: {
    armorId: "scale-mail",
    shieldId: "shield-heavy-wooden",
    weapons: ["waraxe-dwarven"],
    gear: [],
  },
  hp: { current: 12, nonlethal: 0, temp: 0 },
});
const check = (c: CharacterBase) => validateCharacter(c, SRD, SPELLS);
const messages = (c: CharacterBase) => check(c).errors.map((e) => e.message);

describe("validateCharacter", () => {
  it("aceita uma ficha válida e devolve os derivados", () => {
    const r = check(valid());
    expect(r.errors).toEqual([]);
    expect(r.derived?.hp.total).toBe(13); // Con 14 + 2 de anão
  });

  it("point-buy: custo e faixa", () => {
    expect(pointBuyCost(valid().abilities)).toBe(25);
    expect(
      messages({ ...valid(), abilities: { ...valid().abilities, str: 18, dex: 18 } }),
    ).toContain("Point-buy gastou 44 de 25 pontos.");
    expect(messages({ ...valid(), abilities: { ...valid().abilities, cha: 7 } })[0]).toMatch(
      /8 a 18/,
    );
    expect(
      messages({
        ...valid(),
        abilityMethod: "rolled",
        abilities: { ...valid().abilities, str: 18, dex: 18 },
      }),
    ).toEqual([]);
  });

  it("dados de vida, tendência e aumentos", () => {
    expect(messages({ ...valid(), levels: [{ classId: "fighter", hp: 6 }] })).toContain(
      "No 1º nível os PV são o máximo do dado.",
    );
    expect(messages({ ...valid(), levels: [{ classId: "paladin", hp: 10 }] })).toContain(
      "Tendência não permitida para Paladino.",
    );
    const four = {
      ...valid(),
      levels: Array.from({ length: 4 }, () => ({ classId: "fighter" as const, hp: 10 })),
    };
    expect(messages(four)).toContain("Escolha 1 aumento(s) de atributo (1 a cada 4 níveis).");
    expect(messages({ ...valid(), levels: [] })).toContain("Escolha ao menos um nível de classe.");
  });

  it("perícias: máximo, meia graduação e pontos", () => {
    expect(messages({ ...valid(), skills: { climb: 5 } })).toContain(
      "Escalar: máximo de 4 graduações.",
    );
    expect(messages({ ...valid(), skills: { climb: 1.5 } })[0]).toMatch(/meia graduação/);
    expect(messages({ ...valid(), skills: { hide: 1.5 } })).toEqual([]);
    expect(messages({ ...valid(), skills: { climb: 4, jump: 4, swim: 4 } })).toContain(
      "Pontos de perícia: 12 de 8.",
    );
    expect(messages({ ...valid(), skills: { voar: 1 } })).toContain("Perícia desconhecida: voar.");
  });

  it("talentos: pré-requisitos, escolha, repetição e espaços", () => {
    expect(messages({ ...valid(), feats: [{ id: "cleave" }, { id: "toughness" }] })).toContain(
      'Cleave: falta "Power Attack".',
    );
    expect(
      messages({
        ...valid(),
        abilities: { ...valid().abilities, str: 12 },
        feats: [{ id: "power-attack" }],
      }),
    ).toContain('Power Attack: falta "Str 13".');
    expect(messages({ ...valid(), feats: [{ id: "weapon-focus" }] })[0]).toMatch(
      /Weapon Focus: escolha/,
    );
    expect(messages({ ...valid(), feats: [{ id: "alertness" }, { id: "alertness" }] })).toContain(
      "Alertness repetido.",
    );
    expect(
      messages({ ...valid(), feats: [{ id: "toughness" }, { id: "toughness" }] }).some((m) =>
        m.includes("repetido"),
      ),
    ).toBe(false);
    expect(messages({ ...valid(), feats: [{ id: "alertness" }, { id: "iron-will" }] })[0]).toMatch(
      /além dos espaços/,
    );
  });

  it("Foco em Arma exige BBA e proficiência; Especialização exige o Foco na mesma arma", () => {
    const fighter4 = {
      ...valid(),
      levels: Array.from({ length: 4 }, () => ({ classId: "fighter" as const, hp: 10 })),
      abilityIncreases: ["str" as const],
      skills: {},
    };
    expect(
      messages({
        ...fighter4,
        feats: [
          { id: "weapon-focus", choice: "longsword" },
          { id: "weapon-specialization", choice: "waraxe-dwarven" },
        ],
      }),
    ).toContain('Weapon Specialization: falta "Weapon Focus with selected weapon".');
    expect(
      messages({
        ...fighter4,
        raceId: "human",
        feats: [{ id: "weapon-focus", choice: "chain-spiked" }],
      }),
    ).toContain('Weapon Focus: falta "Proficiency with selected weapon".');
  });

  it("monge ignora pré-requisito do talento extra", () => {
    const monk = {
      ...valid(),
      raceId: "human",
      alignment: "LN",
      levels: [{ classId: "monk" as const, hp: 8 }],
      equipment: { armorId: null, shieldId: null, weapons: [], gear: [] },
      feats: [{ id: "stunning-fist" }, { id: "dodge" }],
      skills: {},
      hp: { current: 8, nonlethal: 0, temp: 0 },
    };
    expect(messages(monk)).toEqual([]);
  });

  it("equipamento: escudo no lugar certo e carga", () => {
    expect(
      messages({
        ...valid(),
        equipment: { ...valid().equipment, armorId: "buckler", shieldId: null },
      }),
    ).toContain("Escudo não vai no lugar da armadura.");
    expect(
      messages({ ...valid(), equipment: { ...valid().equipment, shieldId: "full-plate" } }),
    ).toContain("Escolha um escudo.");
    expect(
      messages({
        ...valid(),
        equipment: { ...valid().equipment, gear: [{ name: "Bigorna", qty: 1, weight: 500 }] },
      }),
    ).toContain("Peso acima da carga máxima.");
    expect(
      check({ ...valid(), equipment: { ...valid().equipment, weapons: ["chain-spiked"] } })
        .warnings[0]!.message,
    ).toMatch(/Sem proficiência/);
  });

  it("clérigo escolhe 2 domínios; magias preparadas conferidas", () => {
    const cleric: CharacterBase = {
      ...valid(),
      name: "Jozan",
      raceId: "human",
      alignment: "NG",
      abilities: { str: 12, dex: 10, con: 12, int: 10, wis: 16, cha: 10 },
      levels: [{ classId: "cleric", hp: 8 }],
      skills: { concentration: 4 },
      feats: [{ id: "toughness" }, { id: "iron-will" }],
      equipment: { armorId: "scale-mail", shieldId: null, weapons: ["mace-heavy"], gear: [] },
      domains: ["good", "healing"],
      spells: {
        cleric: {
          known: [],
          prepared: [
            ["guidance", "light", "resistance"],
            ["bless", "cure-light-wounds"],
          ],
        },
      },
      hp: { current: 9, nonlethal: 0, temp: 0 },
    };
    expect(messages(cleric)).toEqual([]);
    expect(messages({ ...cleric, domains: ["good"] })).toContain("Clérigo escolhe 2 domínios.");
    expect(
      messages({
        ...cleric,
        spells: { cleric: { known: [], prepared: [[], ["bless", "bless", "bless", "bless"]] } },
      }),
    ).toContain("Preparadas de nível 1: 4 de 3.");
    expect(
      messages({ ...cleric, spells: { cleric: { known: [], prepared: [[], ["fireball"]] } } }),
    ).toContain("fireball não é magia de nível 1 da lista.");
  });

  it("feiticeiro: conhecidas por nível e lista certa; mago prepara do grimório", () => {
    const sorc: CharacterBase = {
      ...valid(),
      name: "Hennet",
      raceId: "human",
      alignment: "CN",
      abilities: { str: 10, dex: 13, con: 12, int: 10, wis: 10, cha: 16 },
      levels: [{ classId: "sorcerer", hp: 4 }],
      skills: {},
      feats: [{ id: "toughness" }, { id: "alertness" }],
      equipment: { armorId: null, shieldId: null, weapons: ["dagger"], gear: [] },
      spells: {
        sorcerer: {
          known: ["light", "mage-hand", "ray-of-frost", "detect-magic", "magic-missile", "sleep"],
          prepared: [],
        },
      },
      hp: { current: 5, nonlethal: 0, temp: 0 },
    };
    expect(messages(sorc)).toEqual([]);
    expect(
      messages({
        ...sorc,
        spells: { sorcerer: { known: ["magic-missile", "sleep", "shield"], prepared: [] } },
      }),
    ).toContain("Magias conhecidas de nível 1: 3 de 2.");
    expect(
      messages({ ...sorc, spells: { sorcerer: { known: ["fireball"], prepared: [] } } }),
    ).toContain("Magia de nível 3 ainda não disponível: fireball.");
    expect(
      messages({ ...sorc, spells: { sorcerer: { known: ["cure-light-wounds"], prepared: [] } } }),
    ).toContain("Magia fora da lista: cure-light-wounds.");
    const wiz: CharacterBase = {
      ...sorc,
      abilities: { ...sorc.abilities, int: 16, cha: 10 },
      levels: [{ classId: "wizard", hp: 4 }],
      spells: { wizard: { known: ["magic-missile"], prepared: [[], ["magic-missile", "sleep"]] } },
    };
    expect(messages(wiz)).toContain("sleep não está no grimório.");
    expect(
      messages({ ...wiz, spells: { sorcerer: { known: ["light"], prepared: [] } } }),
    ).toContain("Classe sem magias neste nível.");
  });

  it("PV atuais e nome", () => {
    expect(messages({ ...valid(), hp: { current: 99, nonlethal: 0, temp: 0 } })).toContain(
      "PV atuais acima do máximo (13).",
    );
    expect(messages({ ...valid(), name: "  " })).toContain("Dê um nome ao personagem.");
  });
});
