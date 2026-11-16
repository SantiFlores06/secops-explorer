import { cleanup, render, screen, within } from "@testing-library/react";
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
  render(<ResultsView scenario={scenario} comparison={comparison} />);
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
