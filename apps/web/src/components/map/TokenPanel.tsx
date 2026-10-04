"use client";

import type { EffectApplyInput, TableState, TokenUpdateInput, TokenView } from "@mesa/protocol";
import {
  ABILITY_PT,
  damageExpr,
  deriveCharacter,
  deriveNpc,
  emptyNpcStats,
  hpState,
  moveBudgets,
  type NpcStats,
  squaresToMeters,
} from "@mesa/rules";
import { BONUS_TYPES, type BonusType, BUFFS, type Modifier, SRD, type StatKey } from "@mesa/srd";
import clsx from "clsx";
import { Eye, EyeOff, Minus, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { characterEffects, roundsLabel, tokenTargetEffects } from "@/lib/effects";
import { BONUS_PT } from "@/lib/format";
import { useMesaAction } from "@/lib/MesaContext";
import { signed } from "@/lib/srd";
import { tokenMovement } from "./geometry";

type Tab = "info" | "attack" | "effects" | "npc";

export function TokenPanel({
  token,
  table,
  onClose,
  onError,
}: {
  token: TokenView;
  table: TableState;
  onClose: () => void;
  onError: (e: string | null) => void;
}) {
  const isGm = table.me.role === "GM";
  const mine = token.ownerId === table.me.id;
  const control = isGm || mine;
  const [tab, setTab] = useState<Tab>("info");
  const tabs: [Tab, string][] = [
    ["info", "Geral"],
    ...(control ? ([["attack", "Atacar"]] as [Tab, string][]) : []),
    ["effects", "Efeitos"],
    ...(isGm && !token.characterId ? ([["npc", "Ficha"]] as [Tab, string][]) : []),
  ];

  return (
    <div className="absolute bottom-3 left-3 flex max-h-[calc(100%-5rem)] w-80 max-w-[calc(100%-1.5rem)] flex-col rounded-lg border border-line bg-surface/95 text-sm shadow-xl">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="size-3 shrink-0 rounded-full" style={{ background: token.color }} />
          <span className="truncate font-medium">{token.name}</span>
          {token.hidden && <span className="text-xs text-gm">oculto</span>}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
          className="text-faint hover:text-ink"
        >
          <X size={15} />
        </button>
      </div>
      <div role="tablist" className="flex gap-1 border-b border-line px-2 pt-2">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={clsx(
              "-mb-px border-b-2 px-2 py-1 text-xs",
              tab === k ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="scrollbar-thin min-h-0 overflow-y-auto p-3">
        {tab === "info" && (
          <InfoTab token={token} table={table} onClose={onClose} onError={onError} />
        )}
        {tab === "attack" && <AttackTab token={token} table={table} onError={onError} />}
        {tab === "effects" && <EffectsTab token={token} table={table} onError={onError} />}
        {tab === "npc" && <NpcTab token={token} onError={onError} />}
      </div>
    </div>
  );
}

function InfoTab({
  token,
  table,
  onClose,
  onError,
}: {
  token: TokenView;
  table: TableState;
  onClose: () => void;
  onError: (e: string | null) => void;
}) {
  const send = useMesaAction();
  const isGm = table.me.role === "GM";
  const mine = token.ownerId === table.me.id;
  const { speed, runMultiplier } = tokenMovement(token, table.characters, table.effects);
  const b = moveBudgets(speed, runMultiplier);
  const m = (sq: number) => `${squaresToMeters(sq).toLocaleString("pt-BR")} m`;
  const update = async (patch: Omit<TokenUpdateInput, "id">) => {
    const res = await send("token:update", { id: token.id, ...patch });
    onError(res.ok ? null : res.error);
  };
  const stats = token.stats;
  const adjustHp = async (delta: number) => {
    if (!stats) return;
    const res = await send("token:stats", {
      id: token.id,
      stats: { ...stats, hp: stats.hp + delta },
    });
    onError(res.ok ? null : res.error);
  };

  return (
    <div className="flex flex-col gap-2">
      {(isGm || mine) && (
        <p className="text-xs text-muted">
          Andou <span className="font-mono text-ink">{token.moveSpent} □</span> (
          {m(token.moveSpent)}) · desl. {m(b.move)} · dobro {m(b.double)} · corrida {m(b.run)}
        </p>
      )}
      {isGm && stats && (
        <div className="flex items-center justify-between">
          <span>
            PV <span className={clsx("font-mono", stats.hp <= 0 && "text-fumble")}>{stats.hp}</span>
            <span className="text-faint">/{stats.hpMax}</span>
            {hpState(stats.hp) !== "ok" && (
              <span className="ml-1.5 text-xs text-fumble">
                {
                  { disabled: "incapacitado", dying: "morrendo", dead: "morto" }[
                    hpState(stats.hp) as "disabled" | "dying" | "dead"
                  ]
                }
              </span>
            )}
          </span>
          <span className="flex gap-1">
            <button
              type="button"
              aria-label="Tirar 1 PV"
              title="Tirar 1 PV"
              onClick={() => adjustHp(-1)}
              className="flex size-7 items-center justify-center rounded border border-line hover:text-fumble"
            >
              <Minus size={12} />
            </button>
            <button
              type="button"
              aria-label="Curar 1 PV"
              title="Curar 1 PV"
              onClick={() => adjustHp(1)}
              className="flex size-7 items-center justify-center rounded border border-line hover:text-crit"
            >
              <Plus size={12} />
            </button>
          </span>
        </div>
      )}
      {(isGm || mine) && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted">
            Cor
            <input
              type="color"
              value={token.color}
              onChange={(e) => update({ color: e.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-line bg-transparent"
            />
          </label>
          {isGm && (
            <>
              <label className="flex items-center gap-1 text-xs text-muted">
                Tamanho
                <select
                  value={token.size}
                  onChange={(e) => update({ size: Number(e.target.value) })}
                  className="h-7 rounded border border-line bg-bg px-1 text-xs text-ink"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}×{n}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => update({ hidden: !token.hidden })}
                className="flex h-7 items-center gap-1 rounded border border-line px-2 text-xs hover:text-gm"
              >
                {token.hidden ? <Eye size={12} /> : <EyeOff size={12} />}{" "}
                {token.hidden ? "Mostrar" : "Esconder"}
              </button>
            </>
          )}
          <button
            type="button"
            title="Tirar do mapa"
            aria-label="Tirar do mapa"
            onClick={async () => {
              const res = await send("token:delete", { id: token.id });
              if (res.ok) onClose();
              else onError(res.error);
            }}
            className="ml-auto flex size-7 items-center justify-center rounded border border-line text-faint hover:border-fumble hover:text-fumble"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Ataques do token: da ficha (personagem, com efeitos) ou do bloco do NPC. */
function useAttacks(token: TokenView, table: TableState) {
  return useMemo(() => {
    const c = token.characterId
      ? table.characters.find((x) => x.id === token.characterId)
      : undefined;
    if (c?.base) {
      try {
        const d = deriveCharacter(c.base, characterEffects(table.effects, c.id), SRD);
        return d.attacks.map((a) => ({
          name: a.name,
          bonuses: a.bonuses,
          damage: damageExpr(a.damageDice, a.damage.total),
          critical: a.critical,
        }));
      } catch {
        return [];
      }
    }
    if (!token.stats) return [];
    const fx = table.effects.filter((e) => e.targetType === "token" && e.targetId === token.id);
    return deriveNpc(token.stats, fx).attacks.map((a) => ({
      name: a.name,
      bonuses: [a.bonus],
      damage: a.damageBonus
        ? `${a.damage}${a.damageBonus > 0 ? "+" : ""}${a.damageBonus}`
        : a.damage,
      critical: a.critical,
    }));
  }, [token, table.characters, table.effects]);
}

function AttackTab({
  token,
  table,
  onError,
}: {
  token: TokenView;
  table: TableState;
  onError: (e: string | null) => void;
}) {
  const send = useMesaAction();
  const attacks = useAttacks(token, table);
  const targets = (table.scene?.tokens ?? []).filter((t) => t.id !== token.id);
  const [attackIndex, setAttackIndex] = useState(0);
  const [iterative, setIterative] = useState(0);
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const [modifier, setModifier] = useState(0);
  const [apply, setApply] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const atk = attacks[attackIndex];

  if (!attacks.length) {
    return (
      <p className="text-xs text-faint">
        {token.characterId ? "A ficha não tem armas." : "Preencha os ataques na aba Ficha."}
      </p>
    );
  }

  async function attack() {
    const res = await send("attack", {
      attackerTokenId: token.id,
      targetTokenId: targetId,
      attackIndex,
      iterative,
      modifier,
      applyDamage: apply,
    });
    if (!res.ok) {
      onError(res.error);
      setResult(null);
      return;
    }
    onError(null);
    setResult(res.hit ? `Acertou: ${res.damage} de dano.` : "Errou.");
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Ataque
        <select
          value={attackIndex}
          onChange={(e) => {
            setAttackIndex(Number(e.target.value));
            setIterative(0);
          }}
          className="h-8 rounded border border-line bg-bg px-1 text-sm text-ink"
        >
          {attacks.map((a, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: índice é a referência enviada ao servidor
            <option key={i} value={i}>
              {a.name} ({a.bonuses.map(signed).join("/")}, {a.damage}, {a.critical})
            </option>
          ))}
        </select>
      </label>
      {atk && atk.bonuses.length > 1 && (
        <label className="flex items-center gap-2 text-xs text-muted">
          Golpe
          <select
            value={iterative}
            onChange={(e) => setIterative(Number(e.target.value))}
            className="h-7 rounded border border-line bg-bg px-1 text-ink"
          >
            {atk.bonuses.map((b, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: posição do ataque iterativo
              <option key={i} value={i}>
                {i + 1}º ({signed(b)})
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Alvo
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="h-8 rounded border border-line bg-bg px-1 text-sm text-ink"
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Mod. da situação
          <input
            type="number"
            value={modifier}
            onChange={(e) => setModifier(Number(e.target.value) || 0)}
            className="h-7 w-14 rounded border border-line bg-bg px-1.5 font-mono text-ink"
            aria-label="Modificador da situação"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />{" "}
          aplicar dano
        </label>
      </div>
      <button
        type="button"
        disabled={!targetId}
        onClick={attack}
        className="h-9 rounded-md bg-accent font-medium text-accent-ink hover:bg-[#e5b46d] disabled:opacity-40"
      >
        Atacar
      </button>
      {result && <p className="text-xs text-ink">{result} Detalhes no log.</p>}
    </div>
  );
}

const STAT_OPTIONS: [StatKey, string][] = [
  ["attack", "Ataque"],
  ["damage", "Dano"],
  ["ac", "CA"],
  ["save.all", "Resistências"],
  ["save.fort", "Fortitude"],
  ["save.ref", "Reflexos"],
  ["save.will", "Vontade"],
  ["init", "Iniciativa"],
  ["speed", "Deslocamento (pés)"],
  ["skill.all", "Perícias"],
  ...(["str", "dex", "con", "int", "wis", "cha"] as const).map(
    (a) => [a, ABILITY_PT[a].name] as [StatKey, string],
  ),
];

function EffectsTab({
  token,
  table,
  onError,
}: {
  token: TokenView;
  table: TableState;
  onError: (e: string | null) => void;
}) {
  const send = useMesaAction();
  const isGm = table.me.role === "GM";
  const effects = tokenTargetEffects(table, token);
  const [preset, setPreset] = useState("buff:bless");
  const [name, setName] = useState("");
  const [custom, setCustom] = useState<Modifier>({ stat: "attack", value: 1, type: "untyped" });
  const [rounds, setRounds] = useState("");
  const [caster, setCaster] = useState("");

  async function apply() {
    let input: Omit<EffectApplyInput, "targetType" | "targetId">;
    if (preset.startsWith("buff:")) {
      const b = BUFFS.find((x) => `buff:${x.key}` === preset)!;
      input = { sourceName: b.namePt, modifiers: b.modifiers };
    } else if (preset.startsWith("cond:")) {
      const c = SRD.conditions.find((x) => `cond:${x.key}` === preset)!;
      input = { sourceName: c.namePt, modifiers: c.modifiers, conditionKey: c.key };
    } else {
      input = { sourceName: name.trim() || "Efeito", modifiers: [custom] };
    }
    const n = Number(rounds);
    const res = await send("effect:apply", {
      targetType: token.characterId ? "character" : "token",
      targetId: token.characterId ?? token.id,
      ...input,
      rounds: rounds && Number.isInteger(n) && n > 0 ? n : null,
      casterTokenId: caster || null,
    });
    onError(res.ok ? null : res.error);
  }

  return (
    <div className="flex flex-col gap-3">
      {effects.length === 0 ? (
        <p className="text-xs text-faint">Nenhum efeito.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {effects.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="text-gm">{e.sourceName}</span>
                <span className="ml-1 text-xs text-faint">
                  {e.modifiers
                    .map(
                      (m) =>
                        `${signed(m.value)} ${STAT_OPTIONS.find(([k]) => k === m.stat)?.[1] ?? m.stat}`,
                    )
                    .join(", ")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-faint">
                {e.roundsLeft === null ? "∞" : roundsLabel(e.roundsLeft)}
                {isGm && (
                  <button
                    type="button"
                    aria-label={`Tirar ${e.sourceName}`}
                    title="Tirar efeito"
                    onClick={async () => {
                      const r = await send("effect:remove", { id: e.id });
                      onError(r.ok ? null : r.error);
                    }}
                    className="hover:text-fumble"
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {isGm && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <select
            aria-label="Efeito"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            className="h-8 rounded border border-line bg-bg px-1 text-sm"
          >
            <optgroup label="Magias">
              {BUFFS.map((b) => (
                <option key={b.key} value={`buff:${b.key}`}>
                  {b.namePt}
                </option>
              ))}
            </optgroup>
            <optgroup label="Condições">
              {SRD.conditions.map((c) => (
                <option key={c.key} value={`cond:${c.key}`}>
                  {c.namePt}
                </option>
              ))}
            </optgroup>
            <option value="custom">Personalizado…</option>
          </select>
          <p className="text-xs text-faint">
            {preset.startsWith("buff:") && BUFFS.find((b) => `buff:${b.key}` === preset)?.summaryPt}
            {preset.startsWith("cond:") &&
              SRD.conditions.find((c) => `cond:${c.key}` === preset)?.summaryPt}
          </p>
          {preset === "custom" && (
            <div className="flex flex-col gap-1.5">
              <input
                aria-label="Nome do efeito"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome (ex.: Benção do templo)"
                maxLength={60}
                className="h-8 rounded border border-line bg-bg px-2"
              />
              <div className="flex gap-1">
                <input
                  type="number"
                  aria-label="Valor"
                  value={custom.value}
                  onChange={(e) => setCustom({ ...custom, value: Number(e.target.value) || 0 })}
                  className="h-8 w-14 rounded border border-line bg-bg px-1.5 font-mono"
                />
                <select
                  aria-label="Em"
                  value={custom.stat}
                  onChange={(e) => setCustom({ ...custom, stat: e.target.value as StatKey })}
                  className="h-8 min-w-0 flex-1 rounded border border-line bg-bg px-1"
                >
                  {STAT_OPTIONS.map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Tipo de bônus"
                  value={custom.type}
                  onChange={(e) => setCustom({ ...custom, type: e.target.value as BonusType })}
                  className="h-8 w-24 rounded border border-line bg-bg px-1"
                >
                  {BONUS_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {BONUS_PT[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <label className="flex items-center gap-1 text-xs text-muted">
              Rodadas
              <input
                aria-label="Rodadas"
                type="number"
                min={1}
                value={rounds}
                onChange={(e) => setRounds(e.target.value)}
                placeholder="∞"
                className="h-7 w-14 rounded border border-line bg-bg px-1.5 font-mono text-ink"
              />
            </label>
            <label className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted">
              Conta no turno de
              <select
                aria-label="Quem lançou"
                value={caster}
                onChange={(e) => setCaster(e.target.value)}
                className="h-7 min-w-0 flex-1 rounded border border-line bg-bg px-1 text-ink"
              >
                <option value="">rodada nova</option>
                {(table.scene?.tokens ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={apply}
            className="h-8 rounded-md border border-gm/50 text-gm hover:bg-gm/10"
          >
            Aplicar em {token.name}
          </button>
        </div>
      )}
    </div>
  );
}

function NpcTab({ token, onError }: { token: TokenView; onError: (e: string | null) => void }) {
  const send = useMesaAction();
  const [stats, setStats] = useState<NpcStats>(token.stats ?? emptyNpcStats());
  const [saved, setSaved] = useState(false);
  const num = (k: keyof Omit<NpcStats, "attacks">, label: string) => (
    <label className="flex flex-col gap-0.5 text-[11px] text-faint">
      {label}
      <input
        type="number"
        aria-label={label}
        value={stats[k]}
        onChange={(e) => {
          setSaved(false);
          setStats({ ...stats, [k]: Number(e.target.value) || 0 });
        }}
        className="h-7 rounded border border-line bg-bg px-1.5 font-mono text-sm text-ink"
      />
    </label>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1.5">
        {num("hp", "PV")}
        {num("hpMax", "PV máx.")}
        {num("init", "Iniciativa")}
        {num("ac", "CA")}
        {num("touch", "Toque")}
        {num("flatFooted", "Surpreso")}
        {num("fort", "Fort")}
        {num("ref", "Ref")}
        {num("will", "Von")}
      </div>
      <p className="text-xs text-faint">Ataques</p>
      {stats.attacks.map((a, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: linhas posicionais
        <div key={i} className="flex gap-1">
          <input
            aria-label="Nome do ataque"
            value={a.name}
            placeholder="Nome"
            onChange={(e) =>
              setStats({
                ...stats,
                attacks: stats.attacks.map((x, j) =>
                  j === i ? { ...x, name: e.target.value } : x,
                ),
              })
            }
            className="h-7 min-w-0 flex-1 rounded border border-line bg-bg px-1.5 text-xs"
          />
          <input
            aria-label="Bônus"
            type="number"
            value={a.bonus}
            onChange={(e) =>
              setStats({
                ...stats,
                attacks: stats.attacks.map((x, j) =>
                  j === i ? { ...x, bonus: Number(e.target.value) || 0 } : x,
                ),
              })
            }
            className="h-7 w-11 rounded border border-line bg-bg px-1 font-mono text-xs"
          />
          <input
            aria-label="Dano"
            value={a.damage}
            placeholder="1d6+1"
            onChange={(e) =>
              setStats({
                ...stats,
                attacks: stats.attacks.map((x, j) =>
                  j === i ? { ...x, damage: e.target.value } : x,
                ),
              })
            }
            className="h-7 w-16 rounded border border-line bg-bg px-1 font-mono text-xs"
          />
          <input
            aria-label="Crítico"
            value={a.critical}
            placeholder="x2"
            onChange={(e) =>
              setStats({
                ...stats,
                attacks: stats.attacks.map((x, j) =>
                  j === i ? { ...x, critical: e.target.value } : x,
                ),
              })
            }
            className="h-7 w-16 rounded border border-line bg-bg px-1 font-mono text-xs"
          />
          <button
            type="button"
            aria-label="Tirar ataque"
            onClick={() => setStats({ ...stats, attacks: stats.attacks.filter((_, j) => j !== i) })}
            className="text-faint hover:text-fumble"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={stats.attacks.length >= 10}
        onClick={() =>
          setStats({
            ...stats,
            attacks: [...stats.attacks, { name: "", bonus: 0, damage: "1d6", critical: "x2" }],
          })
        }
        className="flex items-center gap-1 self-start text-xs text-muted hover:text-ink"
      >
        <Plus size={12} /> ataque
      </button>
      <button
        type="button"
        onClick={async () => {
          const res = await send("token:stats", { id: token.id, stats });
          onError(res.ok ? null : res.error);
          setSaved(res.ok);
        }}
        className="h-8 rounded-md bg-accent font-medium text-accent-ink hover:bg-[#e5b46d]"
      >
        {saved ? "Salvo" : "Salvar ficha do NPC"}
      </button>
    </div>
  );
}
