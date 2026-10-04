import type { Issue } from "@mesa/rules";

/** Erro de regra/permissão que volta para quem pediu (não é bug do server). */
export class ActionError extends Error {
  constructor(
    message: string,
    public issues?: Issue[],
  ) {
    super(message);
  }
}
