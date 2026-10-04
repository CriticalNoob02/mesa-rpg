import { z } from "zod";

/** Troca caracteres de controle (exceto os de `keep`) por `replacement`. */
function stripControl(s: string, replacement: string, keep = ""): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    const isControl = code < 0x20 || code === 0x7f;
    out += isControl && !keep.includes(ch) ? replacement : ch;
  }
  return out;
}

/** Texto de uma linha: sem caracteres de controle, espaços colapsados. */
export const singleLine = (max: number) =>
  z
    .string()
    .transform((s) => stripControl(s, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Campo obrigatório.").max(max, `Máximo de ${max} caracteres.`));

/** Texto livre (chat): mantém quebras de linha, tira o resto do controle. */
export const multiLine = (max: number) =>
  z
    .string()
    .transform((s) => stripControl(s, "", "\n").trim())
    .pipe(z.string().min(1, "Mensagem vazia.").max(max, `Máximo de ${max} caracteres.`));
