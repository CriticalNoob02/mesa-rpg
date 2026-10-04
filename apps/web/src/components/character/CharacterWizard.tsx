"use client";

import {
  type CharacterBase,
  deriveCharacter,
  emptyCharacter,
  validateCharacter,
} from "@mesa/rules";
import { type Spell, SRD } from "@mesa/srd";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMesaAction } from "@/lib/MesaContext";
import { useMesa } from "@/lib/store";
import { AbilitiesStep } from "./steps/AbilitiesStep";
import { ClassStep } from "./steps/ClassStep";
import { EquipmentStep } from "./steps/EquipmentStep";
import { FeatsStep } from "./steps/FeatsStep";
import { RaceStep } from "./steps/RaceStep";
import { ReviewStep } from "./steps/ReviewStep";
import { SkillsStep } from "./steps/SkillsStep";
import { SpellsStep } from "./steps/SpellsStep";
import { STEPS, type StepKey, stepOf } from "./types";

const draftKey = (campaignId: string) => `mesa:draft:${campaignId}`;

function loadDraft(campaignId: string): CharacterBase | null {
  try {
    const raw = localStorage.getItem(draftKey(campaignId));
    return raw ? { ...emptyCharacter(), ...(JSON.parse(raw) as CharacterBase) } : null;
  } catch {
    return null;
  }
}

function saveDraft(campaignId: string, base: CharacterBase | null) {
  try {
    if (base) localStorage.setItem(draftKey(campaignId), JSON.stringify(base));
    else localStorage.removeItem(draftKey(campaignId));
  } catch {
    // sem storage: o rascunho vive só nesta aba
  }
}

function safeMaxHp(base: CharacterBase) {
  try {
    return deriveCharacter(base, [], SRD).hp.total;
  } catch {
    return 0;
  }
}

/** Criação (sem `characterId`) ou edição/subida de nível de uma ficha. */
export function CharacterWizard({ characterId }: { characterId?: string }) {
  const table = useMesa((s) => s.table)!;
  const router = useRouter();
  const send = useMesaAction();
  const existing = characterId ? table.characters.find((c) => c.id === characterId) : undefined;
  const campaignId = table.campaign.id;
  const back = existing ? `/mesa/${campaignId}/personagem/${existing.id}` : `/mesa/${campaignId}`;

  const [base, setBase] = useState<CharacterBase>(() => existing?.base ?? emptyCharacter());
  const [step, setStep] = useState<StepKey>(existing ? "class" : "race");
  const [spells, setSpells] = useState<Spell[] | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Rascunho de ficha nova sobrevive a recarregar a página.
  useEffect(() => {
    if (!characterId) {
      const draft = loadDraft(campaignId);
      if (draft) setBase(draft);
    }
  }, [characterId, campaignId]);
  useEffect(() => {
    if (!characterId) saveDraft(campaignId, base);
  }, [base, characterId, campaignId]);

  // Magias pesam ~800 KB: só carregam se houver conjurador.
  const isCaster = base.levels.some((l) => SRD.classes.find((c) => c.id === l.classId)?.casting);
  useEffect(() => {
    if (isCaster && !spells) import("@mesa/srd/spells").then((m) => setSpells(m.SPELLS));
  }, [isCaster, spells]);

  const result = useMemo(() => validateCharacter(base, SRD, spells), [base, spells]);
  // Mesmo com erro de regra, mostra o que dá para calcular.
  const derived = useMemo(() => {
    try {
      return deriveCharacter(base, [], SRD);
    } catch {
      return null;
    }
  }, [base]);

  const steps = STEPS.filter((s) => s.key !== "spells" || isCaster);
  const index = steps.findIndex((s) => s.key === step);
  const errorsBy = (k: StepKey) => result.errors.filter((e) => stepOf(e) === k);

  if (characterId && !existing?.base) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="mb-4 text-muted">Ficha não encontrada ou sem permissão para editar.</p>
        <Link href={`/mesa/${campaignId}`} className="text-accent hover:underline">
          Voltar à mesa
        </Link>
      </main>
    );
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const max = result.derived?.hp.total ?? 0;
    // Subiu de nível: os PV ganhos entram nos atuais também.
    const before = existing?.base ? safeMaxHp(existing.base) : max;
    const hp = existing
      ? {
          ...base.hp,
          current: Math.min(base.hp.current + Math.max(0, max - before), max + base.hp.temp),
        }
      : { current: max, nonlethal: 0, temp: 0 };
    const res = await send("character:save", {
      ...(existing ? { id: existing.id } : {}),
      base: { ...base, hp },
    });
    setSaving(false);
    if (!res.ok) return setSaveError(res.error);
    if (!characterId) saveDraft(campaignId, null);
    router.push(`/mesa/${campaignId}/personagem/${res.id}`);
  }

  const props = {
    ...result,
    base,
    update: (fn: (d: CharacterBase) => CharacterBase) => setBase(fn),
    derived,
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link
            href={back}
            className="text-muted hover:text-ink"
            aria-label="Voltar"
            title="Voltar"
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg">
            {existing ? `Editar ${existing.name}` : "Novo personagem"}
            {base.name && !existing && <span className="text-muted"> · {base.name}</span>}
          </h1>
          <button
            type="button"
            onClick={save}
            disabled={saving || result.errors.length > 0}
            title={
              result.errors.length
                ? `${result.errors.length} problema(s) para resolver`
                : "Salvar ficha"
            }
            className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-ink hover:bg-[#e5b46d] disabled:opacity-40"
          >
            <Check size={15} /> {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
        <nav aria-label="Passos" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          {steps.map((s, i) => {
            const n = errorsBy(s.key).length;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(s.key)}
                aria-current={s.key === step ? "step" : undefined}
                className={clsx(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                  s.key === step
                    ? "border-accent text-ink"
                    : "border-line text-muted hover:text-ink",
                )}
              >
                <span className="font-mono text-faint">{i + 1}</span> {s.label}
                {n > 0 && (
                  <span className="rounded-full bg-fumble/20 px-1.5 text-[10px] text-fumble">
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {saveError && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-fumble/40 bg-fumble/10 px-3 py-2 text-sm text-fumble"
          >
            {saveError}
          </p>
        )}
        {step === "race" && <RaceStep {...props} />}
        {step === "abilities" && <AbilitiesStep {...props} />}
        {step === "class" && <ClassStep {...props} />}
        {step === "skills" && <SkillsStep {...props} />}
        {step === "feats" && <FeatsStep {...props} />}
        {step === "equipment" && <EquipmentStep {...props} />}
        {step === "spells" && <SpellsStep {...props} spells={spells} />}
        {step === "review" && <ReviewStep {...props} onSave={save} saving={saving} />}

        <div className="mt-6 flex justify-between">
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => setStep(steps[index - 1]!.key)}
            className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-muted hover:text-ink disabled:invisible"
          >
            <ArrowLeft size={14} /> {steps[index - 1]?.label}
          </button>
          <button
            type="button"
            disabled={index >= steps.length - 1}
            onClick={() => setStep(steps[index + 1]!.key)}
            className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-ink hover:border-accent disabled:invisible"
          >
            {steps[index + 1]?.label} <ArrowRight size={14} />
          </button>
        </div>
      </main>
    </div>
  );
}
