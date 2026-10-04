import { createHash, randomBytes, randomInt } from "node:crypto";

/** Token de acesso do participante (vai no link do mestre e no localStorage). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Sem 0/O/1/I/L: código é ditado por voz na mesa.
const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_LENGTH = 8;

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_LENGTH; i++)
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return code;
}

export function normalizeInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Dado do servidor: inteiro uniforme em [1, sides]. */
export function cryptoDie(sides: number): number {
  return randomInt(1, sides + 1);
}
