"use client";

import { LIMITS, type SceneUpdateInput, type TableState } from "@mesa/protocol";
import clsx from "clsx";
import { Eye, ImagePlus, Pause, Play, Plus, Trash2, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { firstFreeCell } from "@/components/map/geometry";
import { api } from "@/lib/api";
import { useMesaAction } from "@/lib/MesaContext";
import { getSession } from "@/lib/sessions";

/** Aba do mestre: cenas, imagem do mapa, grid, névoa e tokens de NPC. */
export function ScenesPanel({ table }: { table: TableState }) {
  const send = useMesaAction();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scene = table.scene;

  async function run(p: Promise<{ ok: boolean; error?: string }>) {
    const res = await p;
    setError(res.ok ? null : (res.error ?? "Erro."));
    return res.ok;
  }

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
      <form
        className="mb-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim() && (await run(send("scene:create", { name })))) setName("");
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Nova cena (ex.: Caverna do ogro)"
          aria-label="Nome da nova cena"
          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-bg px-3 focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Criar cena"
          title="Criar cena"
          disabled={!name.trim()}
          className="flex size-9 items-center justify-center rounded-md border border-line hover:border-accent hover:text-accent disabled:opacity-30"
        >
          <Plus size={15} />
        </button>
      </form>

      <ul className="mb-4 flex flex-col">
        {table.scenes.map((s) => {
          const active = s.id === table.activeSceneId;
          const viewing = s.id === scene?.id;
          return (
            <li
              key={s.id}
              className={clsx(
                "flex items-center gap-2 rounded-md px-2 py-1.5",
                viewing && "bg-surface-2",
              )}
            >
              <button
                type="button"
                onClick={() => run(send("scene:view", { id: s.id }))}
                className="min-w-0 flex-1 truncate text-left hover:text-accent"
                title="Ver esta cena (só você)"
              >
                {s.name}
              </button>
              {active ? (
                <span className="text-xs text-crit">ativa</span>
              ) : (
                <button
                  type="button"
                  onClick={() => run(send("scene:activate", { id: s.id }))}
                  title="Mostrar para todos"
                  aria-label={`Ativar ${s.name}`}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:text-accent"
                >
                  <Play size={12} /> ativar
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {scene && <SceneEditor key={scene.id} table={table} run={run} />}
      {error && (
        <p role="alert" className="mt-2 text-xs text-fumble">
          {error}
        </p>
      )}
    </div>
  );
}

function SceneEditor({
  table,
  run,
}: {
  table: TableState;
  run: (p: Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;
}) {
  const scene = table.scene!;
  const send = useMesaAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [grid, setGrid] = useState({
    gridSize: scene.gridSize,
    offsetX: scene.offsetX,
    offsetY: scene.offsetY,
    cols: scene.cols,
    rows: scene.rows,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Mantém os campos em dia quando a cena muda por fora.
  useEffect(() => {
    setGrid({
      gridSize: scene.gridSize,
      offsetX: scene.offsetX,
      offsetY: scene.offsetY,
      cols: scene.cols,
      rows: scene.rows,
    });
  }, [scene.gridSize, scene.offsetX, scene.offsetY, scene.cols, scene.rows]);

  // Grid ajustado ao vivo, com espera curta para não inundar o servidor.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Junta tudo o que mudou até o envio (dois campos seguidos não podem se perder).
  const dirty = useRef<{ calib: boolean; size: boolean }>({ calib: false, size: false });
  function setField(k: keyof typeof grid, v: number) {
    const next = { ...grid, [k]: v };
    setGrid(next);
    if (k === "cols" || k === "rows") dirty.current.size = true;
    else dirty.current.calib = true;
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      const patch: SceneUpdateInput = { id: scene.id };
      if (dirty.current.calib) {
        Object.assign(patch, {
          gridSize: next.gridSize,
          offsetX: next.offsetX,
          offsetY: next.offsetY,
        });
      }
      if (dirty.current.size) Object.assign(patch, { cols: next.cols, rows: next.rows });
      dirty.current = { calib: false, size: false };
      run(send("scene:update", patch));
    }, 350);
  }

  async function upload(file: File) {
    if (file.size > LIMITS.assetMaxBytes)
      return run(Promise.resolve({ ok: false, error: "Imagem maior que 15 MB." }));
    setUploading(true);
    try {
      const token = getSession(table.campaign.id)?.token ?? "";
      const asset = await api.uploadAsset(token, file);
      await run(send("scene:update", { id: scene.id, assetId: asset.id }));
    } catch (e) {
      await run(
        Promise.resolve({ ok: false, error: e instanceof Error ? e.message : "Falha no envio." }),
      );
    } finally {
      setUploading(false);
    }
  }

  const placed = new Set(scene.tokens.map((t) => t.characterId).filter(Boolean));
  const firstFree = () => firstFreeCell(scene);

  return (
    <div className="flex flex-col gap-4 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <input
          key={scene.name}
          defaultValue={scene.name}
          aria-label="Nome da cena"
          maxLength={60}
          onBlur={(e) =>
            e.target.value.trim() &&
            e.target.value !== scene.name &&
            run(send("scene:update", { id: scene.id, name: e.target.value }))
          }
          className="h-8 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 font-display text-lg hover:border-line focus:border-accent focus:outline-none"
        />
        {confirmDelete ? (
          <span className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => run(send("scene:delete", { id: scene.id }))}
              className="rounded bg-fumble/20 px-2 py-1 text-fumble"
            >
              Apagar cena
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-1 text-muted"
            >
              Cancelar
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Apagar cena"
            title="Apagar cena"
            className="text-faint hover:text-fumble"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <section>
        <h3 className="mb-2 text-xs tracking-wide text-faint uppercase">Mapa</h3>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <ImagePlus size={15} />{" "}
            {uploading ? "Enviando…" : scene.assetId ? "Trocar imagem" : "Enviar imagem"}
          </button>
          {scene.assetId && (
            <button
              type="button"
              onClick={() => run(send("scene:update", { id: scene.id, assetId: null }))}
              className="h-9 rounded-md px-2 text-xs text-muted hover:text-fumble"
            >
              Remover
            </button>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs tracking-wide text-faint uppercase">
          Grid (1 quadrado = 1,5 m)
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Quadrado (px)"
            value={grid.gridSize}
            min={LIMITS.gridSizeMin}
            max={LIMITS.gridSizeMax}
            onChange={(v) => setField("gridSize", v)}
          />
          <NumberField
            label="Deslocar X"
            value={grid.offsetX}
            min={0}
            max={LIMITS.gridSizeMax}
            onChange={(v) => setField("offsetX", v)}
          />
          <NumberField
            label="Deslocar Y"
            value={grid.offsetY}
            min={0}
            max={LIMITS.gridSizeMax}
            onChange={(v) => setField("offsetY", v)}
          />
          <NumberField
            label="Colunas"
            value={grid.cols}
            min={1}
            max={LIMITS.gridMaxCells}
            onChange={(v) => setField("cols", v)}
          />
          <NumberField
            label="Linhas"
            value={grid.rows}
            min={1}
            max={LIMITS.gridMaxCells}
            onChange={(v) => setField("rows", v)}
          />
        </div>
        <p className="mt-1 text-xs text-faint">
          {scene.assetId
            ? "Ajuste o tamanho do quadrado até as linhas baterem com o desenho; colunas e linhas seguem a imagem."
            : "Sem imagem: escolha colunas e linhas."}{" "}
          Mudar o grid zera a névoa.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-xs tracking-wide text-faint uppercase">Névoa</h3>
        <label className="mb-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={scene.fogEnabled}
            onChange={(e) =>
              run(send("scene:update", { id: scene.id, fogEnabled: e.target.checked }))
            }
          />
          Usar névoa nesta cena
        </label>
        {scene.fogEnabled && (
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => run(send("scene:fog", { sceneId: scene.id, all: true, reveal: true }))}
              className="rounded border border-line px-2 py-1 hover:text-ink"
            >
              <Eye size={12} className="mr-1 inline" />
              Revelar tudo
            </button>
            <button
              type="button"
              onClick={() =>
                run(send("scene:fog", { sceneId: scene.id, all: true, reveal: false }))
              }
              className="rounded border border-line px-2 py-1 hover:text-ink"
            >
              Cobrir tudo
            </button>
            <span className="self-center text-faint">ou use o pincel no mapa</span>
          </div>
        )}
      </section>

      <AmbienceEditor table={table} run={run} />

      <section>
        <h3 className="mb-2 text-xs tracking-wide text-faint uppercase">Tokens</h3>
        <NpcForm
          onCreate={(npc) =>
            run(send("token:create", { sceneId: scene.id, ...firstFree(), ...npc }))
          }
        />
        {table.characters.filter((c) => !placed.has(c.id)).length > 0 && (
          <ul className="mt-2 flex flex-col">
            {table.characters
              .filter((c) => !placed.has(c.id))
              .map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="truncate">
                    {c.name} <span className="text-xs text-faint">· {c.ownerName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      run(
                        send("token:create", {
                          sceneId: scene.id,
                          characterId: c.id,
                          ...firstFree(),
                        }),
                      )
                    }
                    className="flex items-center gap-1 text-xs text-muted hover:text-accent"
                  >
                    <UserPlus size={12} /> pôr no mapa
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NpcForm({
  onCreate,
}: {
  onCreate: (npc: { name: string; size: number; hidden: boolean }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [size, setSize] = useState(1);
  const [hidden, setHidden] = useState(false);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (name.trim() && (await onCreate({ name, size, hidden }))) setName("");
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="NPC (ex.: Goblin 1)"
        aria-label="Nome do NPC"
        className="h-8 min-w-0 flex-1 rounded border border-line bg-bg px-2 focus:border-accent focus:outline-none"
      />
      <select
        value={size}
        onChange={(e) => setSize(Number(e.target.value))}
        aria-label="Tamanho do NPC"
        className="h-8 rounded border border-line bg-bg px-1 text-xs"
      >
        <option value={1}>1×1</option>
        <option value={2}>2×2</option>
        <option value={3}>3×3</option>
        <option value={4}>4×4</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-muted">
        <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />{" "}
        oculto
      </label>
      <button
        type="submit"
        disabled={!name.trim()}
        aria-label="Criar NPC"
        title="Criar NPC"
        className="flex size-8 items-center justify-center rounded border border-line hover:border-accent hover:text-accent disabled:opacity-30"
      >
        <Plus size={14} />
      </button>
    </form>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  // Texto local: deixa apagar e redigitar; só envia quando o número é válido.
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-faint">{label}</span>
      <input
        type="number"
        value={text}
        min={min}
        max={max}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== "" && Number.isInteger(v) && v >= min && v <= max) onChange(v);
        }}
        onBlur={() => setText(String(value))}
        className="h-8 rounded border border-line bg-bg px-2 font-mono text-sm focus:border-accent focus:outline-none"
      />
    </label>
  );
}

/** Narração (ler em voz alta), imagem de ambiente e áudio da cena. */
function AmbienceEditor({
  table,
  run,
}: {
  table: TableState;
  run: (p: Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;
}) {
  const scene = table.scene!;
  const send = useMesaAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState(scene.description);
  const [audioUrl, setAudioUrl] = useState(scene.audioUrl ?? "");
  useEffect(() => setDescription(scene.description), [scene.description]);
  useEffect(() => setAudioUrl(scene.audioUrl ?? ""), [scene.audioUrl]);
  const update = (patch: Omit<SceneUpdateInput, "id">) =>
    run(send("scene:update", { id: scene.id, ...patch }));

  async function upload(file: File) {
    if (file.size > LIMITS.assetMaxBytes)
      return run(Promise.resolve({ ok: false, error: "Imagem maior que 15 MB." }));
    setUploading(true);
    try {
      const asset = await api.uploadAsset(getSession(table.campaign.id)?.token ?? "", file);
      await update({ ambientAssetId: asset.id });
    } catch (e) {
      await run(
        Promise.resolve({ ok: false, error: e instanceof Error ? e.message : "Falha no envio." }),
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-xs tracking-wide text-faint uppercase">Ambientação</h3>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => description !== scene.description && update({ description })}
        maxLength={LIMITS.description}
        rows={4}
        placeholder="Texto para ler em voz alta (fica escondido até revelar)"
        aria-label="Narração da cena"
        className="w-full rounded-md border border-line bg-bg px-3 py-2 focus:border-accent focus:outline-none"
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        aria-label="Imagem de ambiente"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 rounded border border-line px-2 py-1 text-muted hover:text-ink disabled:opacity-50"
        >
          <ImagePlus size={12} />{" "}
          {uploading
            ? "Enviando…"
            : scene.ambientAssetId
              ? "Trocar imagem de ambiente"
              : "Imagem de ambiente"}
        </button>
        {scene.ambientAssetId && (
          <button
            type="button"
            onClick={() => update({ ambientAssetId: null })}
            className="text-muted hover:text-fumble"
          >
            tirar
          </button>
        )}
        <button
          type="button"
          aria-pressed={scene.narrationRevealed}
          disabled={!scene.narrationRevealed && !scene.description && !scene.ambientAssetId}
          onClick={() => update({ narrationRevealed: !scene.narrationRevealed })}
          className={clsx(
            "ml-auto rounded px-2 py-1 font-medium disabled:opacity-40",
            scene.narrationRevealed
              ? "border border-line text-muted hover:text-ink"
              : "bg-accent text-accent-ink hover:bg-[#e5b46d]",
          )}
        >
          {scene.narrationRevealed ? "Esconder narração" : "Revelar narração"}
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={audioUrl}
          onChange={(e) => setAudioUrl(e.target.value)}
          onBlur={() =>
            audioUrl !== (scene.audioUrl ?? "") &&
            update({
              audioUrl: audioUrl.trim() || null,
              ...(audioUrl.trim() ? {} : { audioPlaying: false }),
            })
          }
          maxLength={LIMITS.audioUrl}
          placeholder="Link de áudio (mp3/ogg) em loop"
          aria-label="Link do áudio ambiente"
          className="h-8 min-w-0 flex-1 rounded border border-line bg-bg px-2 text-xs focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          disabled={!scene.audioUrl}
          onClick={() => update({ audioPlaying: !scene.audioPlaying })}
          aria-label={scene.audioPlaying ? "Parar áudio" : "Tocar áudio"}
          title={
            scene.audioPlaying ? "Parar áudio para todos" : "Tocar para todos (só na cena ativa)"
          }
          className="flex h-8 items-center gap-1 rounded border border-line px-2 text-xs text-muted hover:text-ink disabled:opacity-40"
        >
          {scene.audioPlaying ? <Pause size={12} /> : <Play size={12} />}{" "}
          {scene.audioPlaying ? "Parar" : "Tocar"}
        </button>
      </div>
      <p className="mt-1 text-xs text-faint">
        Link direto para o arquivo de áudio (YouTube não funciona). Cada jogador ajusta o volume no
        topo.
      </p>
    </section>
  );
}
