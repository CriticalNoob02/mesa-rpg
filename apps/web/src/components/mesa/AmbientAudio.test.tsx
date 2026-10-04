import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmbientAudio } from "./AmbientAudio";

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

beforeEach(() => {
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play as any);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause as any);
});
afterEach(() => vi.restoreAllMocks());

describe("AmbientAudio", () => {
  it("sem áudio não mostra nada", () => {
    const { container } = render(<AmbientAudio audio={null} campaignId="c1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("toca em loop quando o mestre manda e para quando ele para", async () => {
    const { rerender, container } = render(
      <AmbientAudio audio={{ url: "https://x/a.mp3", playing: true }} campaignId="c1" />,
    );
    await act(async () => {});
    expect(play).toHaveBeenCalled();
    expect(container.querySelector("audio")).toHaveAttribute("loop");
    rerender(<AmbientAudio audio={{ url: "https://x/a.mp3", playing: false }} campaignId="c1" />);
    expect(pause).toHaveBeenCalled();
  });

  it("autoplay bloqueado mostra 'Ativar som'", async () => {
    play.mockImplementationOnce(() =>
      Promise.reject(new DOMException("blocked", "NotAllowedError")),
    );
    render(<AmbientAudio audio={{ url: "https://x/a.mp3", playing: true }} campaignId="c1" />);
    const btn = await screen.findByRole("button", { name: "Ativar som" });
    await act(async () => fireEvent.click(btn));
    expect(play).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Volume do áudio ambiente")).toBeInTheDocument();
  });

  it("volume é de cada um e fica guardado", async () => {
    localStorage.setItem("mesa:volume:c1", "0.2");
    render(<AmbientAudio audio={{ url: "https://x/a.mp3", playing: false }} campaignId="c1" />);
    const slider = screen.getByLabelText("Volume do áudio ambiente") as HTMLInputElement;
    expect(slider.value).toBe("0.2");
    fireEvent.change(slider, { target: { value: "0.8" } });
    expect(localStorage.getItem("mesa:volume:c1")).toBe("0.8");
    fireEvent.click(screen.getByRole("button", { name: "Silenciar" }));
    expect(screen.getByRole("button", { name: "Ligar som" })).toBeInTheDocument();
  });
});
