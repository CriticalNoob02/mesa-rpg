"use client";

import { useEffect, useState } from "react";
import { SERVER_URL } from "./api";

const cache = new Map<string, Promise<HTMLImageElement>>();

/**
 * Baixa a imagem com o token no header (o server confere a campanha) e devolve
 * um <img> pronto para o canvas. Cacheado por id durante a sessão.
 */
export function loadAsset(assetId: string, token: string): Promise<HTMLImageElement> {
  let p = cache.get(assetId);
  if (!p) {
    p = fetch(`${SERVER_URL}/api/assets/${encodeURIComponent(assetId)}`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(
        (blob) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("imagem inválida"));
            img.src = URL.createObjectURL(blob);
          }),
      );
    p.catch(() => cache.delete(assetId));
    cache.set(assetId, p);
  }
  return p;
}

export function useAsset(assetId: string | null, token: string) {
  const [state, setState] = useState<
    { id: string; img: HTMLImageElement } | { id: string; error: true } | null
  >(null);
  useEffect(() => {
    if (!assetId || !token) return;
    let alive = true;
    loadAsset(assetId, token).then(
      (img) => alive && setState({ id: assetId, img }),
      () => alive && setState({ id: assetId, error: true }),
    );
    return () => {
      alive = false;
    };
  }, [assetId, token]);
  if (!assetId || state?.id !== assetId) return { img: null, error: false };
  return "img" in state ? { img: state.img, error: false } : { img: null, error: true };
}
