import type { ChatInput, RollInput } from "@mesa/protocol";

export type Command =
  | { type: "chat"; input: ChatInput }
  | { type: "roll"; input: RollInput }
  | { type: "error"; message: string };

const ROLL_RE = /^\/(r|roll|gr|gmroll)(?:\s+(.*))?$/is;

/**
 * Caixa única da mesa: texto vira chat; `/r 1d20+5 ataque` rola (o resto vira
 * rótulo); `/gr` rola oculto para o mestre.
 */
export function parseCommand(raw: string): Command | null {
  const text = raw.trim();
  if (!text) return null;
  const m = ROLL_RE.exec(text);
  if (!m) {
    if (text.startsWith("/")) {
      return { type: "error", message: "Comando desconhecido. Use /r ou /gr." };
    }
    return { type: "chat", input: { text } };
  }
  const hidden = m[1]!.toLowerCase().startsWith("g");
  const rest = (m[2] ?? "").trim();
  if (!rest) return { type: "error", message: "Informe os dados, ex.: /r 1d20+5" };
  // Palavras do início que parecem dados (começam com dígito, operador ou dN) são a
  // expressão; o resto é rótulo. "1d20 + 5 ataque" → expr "1d20+5", rótulo "ataque".
  const words = rest.split(/\s+/);
  const firstLabel = words.findIndex((w) => !/^([\d+-]|d[\d%])/i.test(w));
  const split = firstLabel === -1 ? words.length : firstLabel;
  const expr = words.slice(0, split).join("");
  const label = words.slice(split).join(" ");
  if (!expr) return { type: "error", message: "Informe os dados, ex.: /r 1d20+5" };
  return {
    type: "roll",
    input: { expr, ...(label ? { label } : {}), ...(hidden ? { hidden: true } : {}) },
  };
}
