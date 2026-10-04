"use client";

import type { SceneView } from "@mesa/protocol";
import { X } from "lucide-react";
import { useAsset } from "@/lib/assets";

/** Cartão "ler em voz alta" sobre o mapa: imagem de ambiente + texto da cena. */
export function NarrationCard({
  scene,
  authToken,
  preview,
  onClose,
}: {
  scene: SceneView;
  authToken: string;
  /** Mestre vendo antes de revelar. */
  preview: boolean;
  onClose: () => void;
}) {
  const { img } = useAsset(scene.ambientAssetId, authToken);
  return (
    <div
      role="dialog"
      aria-label={`Narração: ${scene.name}`}
      className="absolute inset-x-3 top-16 z-10 mx-auto max-h-[calc(100%-6rem)] max-w-xl overflow-y-auto rounded-xl border border-accent/40 bg-surface/97 shadow-2xl"
    >
      {/* biome-ignore lint/performance/noImgElement: blob baixado com token, sem otimização do Next */}
      {img && <img src={img.src} alt="" className="max-h-64 w-full rounded-t-xl object-cover" />}
      <div className="p-5">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl">{scene.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar narração"
            title="Fechar"
            className="text-faint hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        {preview && <p className="mb-2 text-xs text-gm">Prévia: os jogadores ainda não veem.</p>}
        {scene.description ? (
          <p className="font-display text-lg leading-relaxed whitespace-pre-line text-ink/90">
            {scene.description}
          </p>
        ) : (
          <p className="text-sm text-faint">Sem texto de narração.</p>
        )}
      </div>
    </div>
  );
}
