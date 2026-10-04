import type { LogEntryView } from "@mesa/protocol";
import { naturalD20, type RolledTerm } from "@mesa/rules";
import clsx from "clsx";
import { EyeOff } from "lucide-react";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function LogItem({ entry, meId }: { entry: LogEntryView; meId: string }) {
  if (entry.kind === "SYSTEM") {
    return <li className="py-1.5 text-center text-xs text-faint italic">{entry.payload.text}</li>;
  }

  const mine = entry.authorId === meId;
  const head = (
    <div className="flex items-baseline gap-2 text-xs">
      <span className={clsx("font-medium", mine ? "text-accent" : "text-ink")}>
        {entry.authorName ?? "?"}
      </span>
      <time dateTime={entry.createdAt} className="text-faint">
        {time(entry.createdAt)}
      </time>
      {entry.visibility === "GM" && (
        <span className="flex items-center gap-1 text-gm">
          <EyeOff size={11} /> oculta
        </span>
      )}
    </div>
  );

  if (entry.kind === "CHAT") {
    return (
      <li className="rounded-md px-2 py-1.5 hover:bg-surface-2/60">
        {head}
        <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{entry.payload.text}</p>
      </li>
    );
  }

  if (entry.kind === "ATTACK") return <AttackItem entry={entry} head={head} />;

  const roll = entry.payload;
  const natural = naturalD20(roll);
  return (
    <li
      className={clsx(
        "my-1 rounded-lg border bg-bg/60 px-3 py-2",
        entry.visibility === "GM" ? "border-gm/30" : "border-line",
      )}
    >
      {head}
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {roll.label && <p className="truncate text-sm text-ink">{roll.label}</p>}
          <p className="font-mono text-xs text-muted">
            <span className="text-faint">{roll.expr} = </span>
            <Breakdown terms={roll.terms} />
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span
            data-testid="roll-total"
            className={clsx(
              "font-mono text-2xl leading-none font-semibold tabular-nums",
              natural === 20 ? "text-crit" : natural === 1 ? "text-fumble" : "text-ink",
            )}
          >
            {roll.total}
          </span>
          {natural && (
            <span
              className={clsx(
                "mt-1 text-[10px] uppercase",
                natural === 20 ? "text-crit" : "text-fumble",
              )}
            >
              {natural === 20 ? "20 natural" : "1 natural"}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function Breakdown({ terms }: { terms: RolledTerm[] }) {
  return (
    <>
      {terms.map((t, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: termos não mudam de ordem
        <span key={i}>
          {t.sign === -1 ? " − " : i === 0 ? "" : " + "}
          {t.kind === "const" ? t.value : <DiceRolls rolls={t.rolls} kept={t.kept} />}
        </span>
      ))}
    </>
  );
}

function DiceRolls({ rolls, kept }: { rolls: number[]; kept: boolean[] }) {
  return (
    <>
      [
      {rolls.map((r, j) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: dados não mudam de ordem
        <span key={j}>
          {j > 0 && ", "}
          <span className={clsx(!kept[j] && "text-faint line-through")}>{r}</span>
        </span>
      ))}
      ]
    </>
  );
}

function AttackItem({
  entry,
  head,
}: {
  entry: Extract<LogEntryView, { kind: "ATTACK" }>;
  head: React.ReactNode;
}) {
  const { attackerName, targetName, weapon, result, applied } = entry.payload;
  const verdict = result.critical ? "Crítico!" : result.hit ? "Acertou" : "Errou";
  return (
    <li
      className={clsx(
        "my-1 rounded-lg border bg-bg/60 px-3 py-2",
        result.critical ? "border-crit/50" : result.hit ? "border-line" : "border-line/60",
      )}
    >
      {head}
      <p className="mt-1 text-sm">
        <span className="font-medium">{attackerName}</span>
        <span className="text-muted"> ataca </span>
        <span className="font-medium">{targetName}</span>
        <span className="text-muted"> com {weapon}</span>
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0 font-mono text-xs text-muted">
          <p>
            <span className="text-faint">ataque </span>
            <span
              className={clsx(
                result.natural === 20 && "text-crit",
                result.natural === 1 && "text-fumble",
              )}
            >
              [{result.natural}]
            </span>{" "}
            = {result.total}
          </p>
          {result.confirm && (
            <p>
              <span className="text-faint">confirmação </span>[{result.confirm.natural}] ={" "}
              {result.confirm.total}
              {result.confirm.confirmed ? " ✓" : " ✗"}
            </p>
          )}
          {result.damageRolls.length > 0 && (
            <p>
              <span className="text-faint">dano </span>
              {result.damageRolls.map((d) => `${d.expr} (${d.total})`).join(" + ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span
            className={clsx(
              "text-xs font-medium uppercase",
              result.critical ? "text-crit" : result.hit ? "text-ink" : "text-faint",
            )}
          >
            {verdict}
          </span>
          {result.hit && (
            <span
              data-testid="attack-damage"
              className="font-mono text-2xl leading-none font-semibold text-fumble"
            >
              {result.damage}
            </span>
          )}
          {result.hit && !applied && <span className="text-[10px] text-faint">não aplicado</span>}
        </div>
      </div>
    </li>
  );
}
