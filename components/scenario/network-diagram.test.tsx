import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "@/lib/engine/config";
import type { Scenario } from "@/lib/engine/types";
import { DEFAULT_SEED } from "@/lib/engine/share";
import { simulate } from "@/lib/engine/simulate";
import { summarizeEvents } from "@/lib/engine/summary";
import { getScenario } from "@/lib/scenarios";
import NetworkDiagram from "./network-diagram";
import ScenarioPlayer from "./scenario-player";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const SLUGS = ["ssh-expuesto", "dmarc-suplantacion"] as const;

function load(slug: string): Scenario {
  const scenario = getScenario(slug);
  if (!scenario) throw new Error(`missing scenario ${slug}`);
  return scenario;
}

/** The actor node that carries the highlight, or null when none is highlighted. */
function activeActorId(): string | null {
  return document
    .querySelector('[data-node="actor"][data-active="true"]')
    ?.getAttribute("data-actor-id") ?? null;
}

describe("NetworkDiagram", () => {
  for (const slug of SLUGS) {
    it(`draws one node per actor and the target label (${slug})`, () => {
      const scenario = load(slug);
      const { container } = render(
        <NetworkDiagram
          scenario={scenario}
          config={defaultConfig(scenario)}
          rows={null}
          step={0}
          onStepChange={() => {}}
        />,
      );

      const actorNodes = container.querySelectorAll('[data-node="actor"]');
      expect(actorNodes).toHaveLength(scenario.actors.length);
      const titles = [...actorNodes].map((node) => node.querySelector("title")?.textContent ?? "");
      for (const actor of scenario.actors) {
        expect(titles.some((title) => title.startsWith(actor.name))).toBe(true);
      }

      const target = container.querySelector('[data-node="target"] > title');
      expect(target?.textContent).toBe(scenario.wording.targetLabel);
      screen.getByText("Simulá para ver el tráfico");
    });
  }

  it("names the target for the DMARC scenario", () => {
    const scenario = load("dmarc-suplantacion");
    render(
      <NetworkDiagram
        scenario={scenario}
        config={defaultConfig(scenario)}
        rows={null}
        step={0}
        onStepChange={() => {}}
      />,
    );
    expect(document.querySelector('[data-node="target"] > title')?.textContent).toBe(
      "Buzones de la cooperativa",
    );
  });
});

describe("NetworkDiagram with the step panel", () => {
  it("highlights the actor of the current step as Siguiente moves through the steps", async () => {
    const user = userEvent.setup();
    const scenario = load("dmarc-suplantacion");
    const rows = summarizeEvents(simulate(scenario, defaultConfig(scenario), DEFAULT_SEED).events);
    const jump = rows.findIndex((row, index) => index > 0 && row.actorId !== rows[0].actorId);
    expect(jump).toBeGreaterThan(0);

    render(<ScenarioPlayer scenario={scenario} />);
    await user.click(screen.getByRole("button", { name: "Simular" }));
    expect(activeActorId()).toBe(rows[0].actorId);

    for (let step = 1; step <= jump; step += 1) {
      await user.click(screen.getByRole("button", { name: /^Siguiente/ }));
    }
    expect(activeActorId()).toBe(rows[jump].actorId);
    expect(screen.getByRole("img", { name: new RegExp(`Paso ${jump + 1} de`) })).toBeTruthy();
  });
});
