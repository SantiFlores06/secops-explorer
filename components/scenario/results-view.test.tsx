import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { compareWithOptimal } from "@/lib/engine/compare";
import { defaultConfig } from "@/lib/engine/config";
import { summarizeEvents } from "@/lib/engine/summary";
import { getScenario } from "@/lib/scenarios";
import ResultsView from "./results-view";

afterEach(cleanup);

function renderResults(slug: string, seed: number) {
  const scenario = getScenario(slug);
  if (!scenario) throw new Error(`missing scenario ${slug}`);
  const comparison = compareWithOptimal(scenario, defaultConfig(scenario), seed);
  const rows = summarizeEvents(comparison.yours.events);
  // The event table lives in the summary, the step after the last event.
  render(<ResultsView scenario={scenario} comparison={comparison} step={rows.length + 1} />);
  return { rows };
}

describe("ResultsView event table", () => {
  it("renders the header row with the four columns", () => {
    renderResults("ssh-expuesto", 2026);
    const table = screen.getByRole("table", { name: /eventos de la simulación/i });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "N.º",
      "Tiempo",
      "Actor y origen",
      "Resultado",
    ]);
  });

  it("renders one tbody per timeline row, after the header", () => {
    const { rows } = renderResults("ssh-expuesto", 2026);
    const table = screen.getByRole("table", { name: /eventos de la simulación/i });
    const groups = within(table).getAllByRole("rowgroup");
    // The first rowgroup is the thead; every other one is a tbody holding one event.
    expect(groups).toHaveLength(rows.length + 1);
    expect(groups[0].tagName).toBe("THEAD");
    for (const group of groups.slice(1)) {
      expect(group.tagName).toBe("TBODY");
    }
  });

  it("numbers the events in order", () => {
    renderResults("dmarc-suplantacion", 2026);
    const table = screen.getByRole("table", { name: /eventos de la simulación/i });
    const numbers = within(table)
      .getAllByRole("rowgroup")
      .slice(1)
      .map((group) => group.querySelector("td")?.textContent);
    expect(numbers[0]).toBe("01");
    expect(numbers.at(-1)).toBe(String(numbers.length).padStart(2, "0"));
  });
});

describe("ResultsView step navigation", () => {
  it("moves with the buttons and arrow keys, but not while typing in a field", async () => {
    const user = userEvent.setup();
    const scenario = getScenario("ssh-expuesto");
    if (!scenario) throw new Error("missing scenario ssh-expuesto");
    const comparison = compareWithOptimal(scenario, defaultConfig(scenario), 2026);
    const total = summarizeEvents(comparison.yours.events).length;

    render(
      <>
        <input aria-label="Dato de prueba" />
        <ResultsView scenario={scenario} comparison={comparison} />
      </>,
    );

    screen.getByText(`Paso 1 / ${total}`);
    await user.click(screen.getByRole("button", { name: /^Siguiente/ }));
    screen.getByText(`Paso 2 / ${total}`);
    await user.click(screen.getByRole("button", { name: /Atrás/ }));
    screen.getByText(`Paso 1 / ${total}`);

    await user.keyboard("{ArrowRight}");
    screen.getByText(`Paso 2 / ${total}`);
    await user.keyboard("{ArrowLeft}");
    screen.getByText(`Paso 1 / ${total}`);

    await user.click(screen.getByRole("textbox", { name: "Dato de prueba" }));
    await user.keyboard("{ArrowRight}");
    screen.getByText(`Paso 1 / ${total}`);
  });
});
