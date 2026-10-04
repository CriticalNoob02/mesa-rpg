"use client";

import { checkPrerequisites, isWeaponProficient, type PrereqContext } from "@mesa/rules";
import { ABILITIES, type Feat, ptName, SRD } from "@mesa/srd";
import clsx from "clsx";
import { Check, CircleHelp, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { FEAT_TYPE_PT } from "@/lib/format";
import { byPt, matches } from "@/lib/search";
import { SCHOOLS_PT } from "@/lib/srd";
import { Section, Select } from "../kit";
import type { StepProps } from "../types";

const SLOT_PT = {
  general: "gerais",
  fighter: "de guerreiro",
  wizard: "de mago",
  monk: "de monge",
} as const;

/** Tipo de escolha que o talento pede, pelo texto do SRD. */
function choiceKind(feat: Feat): "weapon" | "skill" | "school" | "text" | null {
  if (!feat.choice) return null;
  if (/weapon|crossbow/i.test(feat.choice)) return "weapon";
  if (/skill/i.test(feat.choice)) return "skill";
  if (/school/i.test(feat.choice)) return "school";
  return "text";
}

export function FeatsStep({ base, update, derived }: StepProps) {
  const [query, setQuery] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [choices, setChoices] = useState<Record<string, string>>({});

  const ctx = useMemo<PrereqContext | null>(() => {
    if (!derived) return null;
    const classIds = derived.classLevels.map((c) => c.classId);
    return {
      abilities: Object.fromEntries(
        ABILITIES.map((a) => [a, derived.abilities[a].score.total]),
      ) as PrereqContext["abilities"],
      bab: derived.bab,
      totalLevel: derived.totalLevel,
      classLevels: Object.fromEntries(derived.classLevels.map((c) => [c.classId, c.level])),
      casterLevel: Math.max(0, ...derived.spellcasting.map((s) => s.casterLevel)),
      skillRanks: base.skills,
      feats: base.feats,
      isProficient: (id) => {
        const w = SRD.weapons.find((x) => x.id === id);
        return !!w && isWeaponProficient(w, { classIds, raceId: base.raceId, feats: base.feats });
      },
    };
  }, [derived, base.skills, base.feats, base.raceId]);

  if (!derived || !ctx || derived.totalLevel === 0) {
    return (
      <Section title="Talentos">
        <p className="text-sm text-faint">Escolha a classe primeiro.</p>
      </Section>
    );
  }

  const slots = Object.entries(derived.feats.slots).filter(([, n]) => n > 0) as [
    keyof typeof SLOT_PT,
    number,
  ][];
  const totalSlots = slots.reduce((s, [, n]) => s + n, 0);
  const status = (feat: Feat, choice?: string) => {
    const r = checkPrerequisites(feat, choice, ctx, SRD);
    if (r.some((x) => x.ok === false)) return false;
    if (r.some((x) => x.ok === null)) return null;
    return true;
  };
  const taken = (feat: Feat) => !feat.multiple && base.feats.some((f) => f.id === feat.id);
  const list = SRD.feats
    .filter((f) => !f.types.includes("Epic"))
    .filter((f) => matches(query, f.namePt, f.name))
    .filter((f) => !taken(f))
    .filter((f) => !onlyAvailable || status(f, choices[f.id]) !== false)
    .sort(byPt(ptName));

  function add(feat: Feat) {
    const choice = choices[feat.id];
    if (feat.choice && !choice) return;
    update((d) => ({ ...d, feats: [...d.feats, { id: feat.id, ...(choice ? { choice } : {}) }] }));
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Talentos escolhidos"
        aside={`${base.feats.length} de ${totalSlots} · ${slots.map(([k, n]) => `${n} ${SLOT_PT[k]}`).join(", ")}`}
      >
        {derived.feats.granted.length > 0 && (
          <p className="mb-2 text-xs text-muted">
            Da classe (grátis):{" "}
            {derived.feats.granted
              .map((id) => SRD.feats.find((f) => f.id === id)?.name ?? id)
              .join(", ")}
          </p>
        )}
        {base.feats.length === 0 && <p className="text-sm text-faint">Nenhum ainda.</p>}
        <ul className="flex flex-col">
          {base.feats.map((f, i) => {
            const feat = SRD.feats.find((x) => x.id === f.id);
            const ok = feat ? status(feat, f.choice) : false;
            const overflow = derived.feats.overflow.includes(i);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: o mesmo talento pode repetir
              <li key={i} className="flex items-center gap-2 border-t border-line py-2 text-sm">
                <StatusIcon ok={overflow ? false : ok} />
                <span>
                  {feat ? ptName(feat) : f.id}
                  {f.choice && <span className="text-muted"> ({choiceLabel(f.choice)})</span>}
                </span>
                {overflow && <span className="text-xs text-fumble">sem espaço</span>}
                <button
                  type="button"
                  aria-label={`Remover ${feat?.name ?? f.id}`}
                  title="Remover"
                  onClick={() =>
                    update((d) => ({ ...d, feats: d.feats.filter((_, j) => j !== i) }))
                  }
                  className="ml-auto text-faint hover:text-fumble"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Adicionar">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar talento (português ou inglês)"
            aria-label="Buscar talento"
            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-bg px-3 text-sm focus:border-accent focus:outline-none"
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
            />
            Só os que posso pegar
          </label>
        </div>
        <ul className="flex max-h-[60vh] flex-col overflow-y-auto">
          {list.map((feat) => {
            const kind = choiceKind(feat);
            const choice = choices[feat.id];
            const ok = status(feat, choice);
            return (
              <li key={feat.id} className="border-t border-line py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusIcon ok={ok} />
                  <span className="font-medium">{ptName(feat)}</span>
                  {feat.types
                    .filter((t) => t !== "General")
                    .map((t) => (
                      <span
                        key={t}
                        className="rounded bg-surface-2 px-1.5 text-[10px] text-muted uppercase"
                      >
                        {FEAT_TYPE_PT[t] ?? t}
                      </span>
                    ))}
                  <span className="ml-auto flex items-center gap-2">
                    {kind && (
                      <ChoiceInput
                        kind={kind}
                        value={choice ?? ""}
                        onChange={(v) => setChoices((c) => ({ ...c, [feat.id]: v }))}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => add(feat)}
                      disabled={!!kind && !choice}
                      aria-label={`Adicionar ${ptName(feat)}`}
                      title="Adicionar"
                      className="flex size-8 items-center justify-center rounded-md border border-line hover:border-accent hover:text-accent disabled:opacity-30"
                    >
                      <Plus size={14} />
                    </button>
                  </span>
                </div>
                {feat.prerequisite && (
                  <p className="mt-1 pl-6 text-xs text-faint">
                    Requer: {feat.prerequisitePt ?? feat.prerequisite}
                  </p>
                )}
                <p className="mt-1 pl-6 text-xs text-muted">{feat.benefitPt ?? feat.benefit}</p>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

function choiceLabel(choice: string) {
  return (
    (() => {
      const w = SRD.weapons.find((x) => x.id === choice);
      return w ? ptName(w) : undefined;
    })() ??
    SRD.skills.find((s) => s.id === choice)?.namePt ??
    SCHOOLS_PT[choice[0]!.toUpperCase() + choice.slice(1)] ??
    choice
  );
}

function ChoiceInput({
  kind,
  value,
  onChange,
}: {
  kind: "weapon" | "skill" | "school" | "text";
  value: string;
  onChange: (v: string) => void;
}) {
  if (kind === "text") {
    return (
      <input
        aria-label="Escolha do talento"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escolha"
        className="h-8 w-36 rounded-md border border-line bg-bg px-2 text-xs focus:border-accent focus:outline-none"
      />
    );
  }
  return (
    <Select
      label="Escolha do talento"
      value={value}
      onChange={onChange}
      className="h-8 max-w-48 text-xs"
    >
      <option value="">Escolha…</option>
      {kind === "weapon" &&
        [...SRD.weapons].sort(byPt(ptName)).map((w) => (
          <option key={w.id} value={w.id}>
            {ptName(w)}
          </option>
        ))}
      {kind === "skill" &&
        SRD.skills.map((s) => (
          <option key={s.id} value={s.id}>
            {s.namePt}
          </option>
        ))}
      {kind === "school" &&
        Object.entries(SCHOOLS_PT)
          .filter(([k]) => k !== "Universal")
          .map(([k, pt]) => (
            <option key={k} value={k.toLowerCase()}>
              {pt}
            </option>
          ))}
    </Select>
  );
}

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === true)
    return <Check size={15} className="shrink-0 text-crit" aria-label="Pré-requisitos ok" />;
  if (ok === false)
    return <X size={15} className="shrink-0 text-fumble" aria-label="Falta pré-requisito" />;
  return (
    <CircleHelp
      size={15}
      className={clsx("shrink-0 text-accent")}
      aria-label="Confira com o mestre"
    />
  );
}
