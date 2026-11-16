import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getScenario } from "@/lib/scenarios";
import ScenarioPlayer from "./scenario-player";
import { OUTCOME_LABEL } from "./labels";

// The player reads the shared link from the query string. No router exists in jsdom,
// so hand it an empty query, which is what a visitor opening the page without a link gets.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const OUTCOME_PILL = new RegExp(`^(${Object.values(OUTCOME_LABEL).join("|")})$`);

function renderPlayer(slug: string) {
  const scenario = getScenario(slug);
  if (!scenario) throw new Error(`missing scenario ${slug}`);
  render(<ScenarioPlayer scenario={scenario} />);
  return userEvent.setup();
}

/** The sr-only announcement carries the total as plain text, e.g. "Simulación lista: 42 de 100 puntos." */
function announcedTotal(): number {
  const text = screen.getByText(/Simulación lista: \d+ de 100 puntos\./).textContent ?? "";
  const match = /Simulación lista: (\d+) de 100 puntos\./.exec(text);
  if (!match) throw new Error(`no total announced in "${text}"`);
  return Number(match[1]);
}

describe("ScenarioPlayer (ssh-expuesto)", () => {
  it("renders the controls with their labels", () => {
    renderPlayer("ssh-expuesto");
    // getBy* throws when the element is missing, so each call is also the assertion.
    screen.getByRole("heading", { name: "Configuración del servidor" });
    screen.getByRole("switch", { name: /Permitir contraseñas/ });
    screen.getByRole("switch", { name: /Exigir segundo factor/ });
    screen.getByRole("spinbutton", { name: "Intentos fallidos antes de bloquear la IP" });
  });

  it("shows outcome pills with text labels after pressing Simular", async () => {
    const user = userEvent.setup();
    renderPlayer("ssh-expuesto");
    expect(screen.queryByRole("heading", { name: "Resultado" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Simular" }));

    screen.getByRole("heading", { name: "Resultado" });
    expect(screen.getAllByText(OUTCOME_PILL).length).toBeGreaterThan(0);
  });

  it("changes the result when a control changes", async () => {
    const user = userEvent.setup();
    renderPlayer("ssh-expuesto");

    await user.click(screen.getByRole("button", { name: "Simular" }));
    const before = announcedTotal();

    await user.click(screen.getByRole("switch", { name: /Permitir contraseñas/ }));
    await user.click(screen.getByRole("button", { name: "Simular" }));
    const after = announcedTotal();

    expect(after).not.toBe(before);
  });
});

describe("ScenarioPlayer (dmarc-suplantacion)", () => {
  it("names the panel for the domain, never for the server", async () => {
    const user = userEvent.setup();
    renderPlayer("dmarc-suplantacion");

    screen.getByRole("heading", { name: "Configuración del dominio" });
    expect(screen.queryByText("Configuración del servidor")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Simular" }));
    screen.getByRole("heading", { name: "Resultado" });
    expect(screen.queryByText("Configuración del servidor")).toBeNull();
  });

  it("renders its controls and shows outcome pills after Simular", async () => {
    const user = userEvent.setup();
    renderPlayer("dmarc-suplantacion");

    screen.getByLabelText("Registro SPF");
    screen.getByRole("switch", { name: /Firmar con DKIM/ });
    screen.getByLabelText("Política DMARC");

    await user.click(screen.getByRole("button", { name: "Simular" }));
    expect(screen.getAllByText(OUTCOME_PILL).length).toBeGreaterThan(0);
  });

  it("changes the result when the DMARC policy changes", async () => {
    const user = userEvent.setup();
    renderPlayer("dmarc-suplantacion");

    await user.click(screen.getByRole("button", { name: "Simular" }));
    const before = announcedTotal();

    await user.selectOptions(screen.getByLabelText("Política DMARC"), "reject");
    await user.click(screen.getByRole("button", { name: "Simular" }));
    const after = announcedTotal();

    expect(after).not.toBe(before);
  });
});
