import type {
  ApiError,
  AssetResponse,
  CreateCampaignRequest,
  InviteInfoResponse,
  JoinRequest,
  SessionResponse,
  WhoAmIResponse,
} from "@mesa/protocol";

export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/api${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiRequestError("Sem conexão com o servidor.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as T | ApiError;
  if (!res.ok) {
    const msg = (body as ApiError).error ?? `Erro ${res.status}.`;
    throw new ApiRequestError(msg, res.status);
  }
  return body as T;
}

export const api = {
  createCampaign: (body: CreateCampaignRequest) =>
    call<SessionResponse>("/campaigns", { method: "POST", body: JSON.stringify(body) }),
  invite: (code: string) => call<InviteInfoResponse>(`/invites/${encodeURIComponent(code)}`),
  join: (code: string, body: JoinRequest) =>
    call<SessionResponse>(`/invites/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** Envia a imagem crua (o server detecta o formato pelos bytes). */
  uploadAsset: (token: string, file: Blob) =>
    call<AssetResponse>("/assets", {
      method: "POST",
      body: file,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": file.type || "application/octet-stream",
      },
    }),
  whoAmI: (token: string) =>
    call<WhoAmIResponse>("/session", { headers: { authorization: `Bearer ${token}` } }),
};
