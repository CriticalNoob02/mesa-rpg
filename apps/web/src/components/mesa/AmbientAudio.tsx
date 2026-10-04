"use client";

import type { ActiveAudio } from "@mesa/protocol";
import clsx from "clsx";
import { Music, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const volumeKey = (campaignId: string) => `mesa:volume:${campaignId}`;

function readVolume(campaignId: string) {
  try {
    const v = Number(localStorage.getItem(volumeKey(campaignId)));
    return Number.isFinite(v) &&
      v >= 0 &&
      v <= 1 &&
      localStorage.getItem(volumeKey(campaignId)) !== null
      ? v
      : 0.5;
  } catch {
    return 0.5;
  }
}

/**
 * Áudio ambiente da cena ativa, em loop. Volume é de cada um (fica no
 * navegador). Se o navegador bloquear o autoplay, aparece "Ativar som".
 */
export function AmbientAudio({ audio, campaignId }: { audio: ActiveAudio; campaignId: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(0.5);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => setVolume(readVolume(campaignId)), [campaignId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !audio) return;
    setFailed(false);
    if (audio.playing) {
      el.play().then(
        () => setBlocked(false),
        (err: unknown) => {
          if (err instanceof DOMException && err.name === "NotAllowedError") setBlocked(true);
          else setFailed(true);
        },
      );
    } else el.pause();
  }, [audio]);

  if (!audio) return null;

  function changeVolume(v: number) {
    setVolume(v);
    try {
      localStorage.setItem(volumeKey(campaignId), String(v));
    } catch {
      // sem storage: vale só nesta aba
    }
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted">
      {/* biome-ignore lint/a11y/useMediaCaption: áudio ambiente, sem fala */}
      <audio ref={ref} src={audio.url} loop preload="auto" onError={() => setFailed(true)} />
      <Music
        size={13}
        className={clsx(audio.playing && !blocked && !failed ? "text-accent" : "text-faint")}
        aria-hidden
      />
      {blocked && audio.playing ? (
        <button
          type="button"
          onClick={() =>
            ref.current?.play().then(
              () => setBlocked(false),
              () => setFailed(true),
            )
          }
          className="rounded border border-accent/50 px-2 py-0.5 text-accent hover:bg-accent/10"
        >
          Ativar som
        </button>
      ) : failed ? (
        <span className="text-fumble" title={audio.url}>
          áudio indisponível
        </span>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Ligar som" : "Silenciar"}
            title={muted ? "Ligar som" : "Silenciar"}
            className="hover:text-ink"
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            aria-label="Volume do áudio ambiente"
            className="w-20 accent-[var(--color-accent)]"
          />
        </>
      )}
    </div>
  );
}
