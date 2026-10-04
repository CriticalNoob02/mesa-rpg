import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { Composer } from "./Composer";

function fakeSocket(reply: unknown = { ok: true }) {
  const emitWithAck = vi.fn(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return { socket: { connected: true, timeout: () => ({ emitWithAck }) } as any, emitWithAck };
}

function render(ui: ReactElement, socket: unknown) {
  return rtlRender(
    <MesaSocketContext.Provider value={socket as any}>{ui}</MesaSocketContext.Provider>,
  );
}

const me = { id: "p1", nickname: "Ana", role: "PLAYER" as const };

describe("Composer", () => {
  it("botão de dado rola 1dN", async () => {
    const { socket, emitWithAck } = fakeSocket();
    render(<Composer me={me} disabled={false} />, socket);
    await userEvent.click(screen.getByRole("button", { name: "d20" }));
    expect(emitWithAck).toHaveBeenCalledWith("roll", { expr: "1d20" });
  });

  it("modo oculta vale para botão e /r", async () => {
    const { socket, emitWithAck } = fakeSocket();
    render(<Composer me={me} disabled={false} />, socket);
    await userEvent.click(screen.getByRole("button", { name: /Oculta/ }));
    await userEvent.click(screen.getByRole("button", { name: "d6" }));
    expect(emitWithAck).toHaveBeenLastCalledWith("roll", { expr: "1d6", hidden: true });
    await userEvent.type(screen.getByLabelText("Mensagem ou rolagem"), "/r 1d8 dano{enter}");
    expect(emitWithAck).toHaveBeenLastCalledWith("roll", {
      expr: "1d8",
      label: "dano",
      hidden: true,
    });
  });

  it("envia chat e limpa a caixa", async () => {
    const { socket, emitWithAck } = fakeSocket();
    render(<Composer me={me} disabled={false} />, socket);
    const box = screen.getByLabelText("Mensagem ou rolagem");
    await userEvent.type(box, "olá mesa{enter}");
    expect(emitWithAck).toHaveBeenCalledWith("chat:send", { text: "olá mesa" });
    await waitFor(() => expect(box).toHaveValue(""));
  });

  it("mostra erro do servidor e mantém o texto", async () => {
    const { socket } = fakeSocket({ ok: false, error: "Dado deve ter de 2 a 1000 faces." });
    render(<Composer me={me} disabled={false} />, socket);
    const box = screen.getByLabelText("Mensagem ou rolagem");
    await userEvent.type(box, "/r 1d1{enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("faces");
    expect(box).toHaveValue("/r 1d1");
  });

  it("mostra erro local de comando sem chamar o servidor", async () => {
    const { socket, emitWithAck } = fakeSocket();
    render(<Composer me={me} disabled={false} />, socket);
    await userEvent.type(screen.getByLabelText("Mensagem ou rolagem"), "/x{enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Comando desconhecido");
    expect(emitWithAck).not.toHaveBeenCalled();
  });

  it("avisa quando o servidor não responde", async () => {
    const { socket } = fakeSocket(new Error("timeout"));
    render(<Composer me={me} disabled={false} />, socket);
    await userEvent.click(screen.getByRole("button", { name: "d4" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("não respondeu");
  });

  it("desliga tudo quando desconectado", () => {
    const { socket } = fakeSocket();
    render(<Composer me={me} disabled />, socket);
    expect(screen.getByRole("button", { name: "d20" })).toBeDisabled();
    expect(screen.getByLabelText("Mensagem ou rolagem")).toBeDisabled();
  });
});
