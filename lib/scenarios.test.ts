import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR, listScenarios, loadScenarioFile } from "./scenarios";
import { simulate } from "./engine/simulate";
import type { Config, ControlDef, ControlValue, Scenario } from "./engine/types";

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

const contentFiles = readdirSync(CONTENT_DIR)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => path.join(CONTENT_DIR, name));

/** Every value a control can take that is worth checking: booleans, every enum option, numbers at min/default/max. */
function valuesOf(control: ControlDef): ControlValue[] {
  if (control.kind === "toggle") return [true, false];
  if (control.kind === "enum") return control.options.map((option) => option.value);
  return [...new Set([control.min, control.defaultValue, control.max])];
}

/** Cartesian product of every control's values. */
function allConfigs(controls: ControlDef[]): Config[] {
  let configs: Config[] = [{}];
  for (const control of controls) {
    const next: Config[] = [];
    for (const partial of configs) {
      for (const value of valuesOf(control)) {
        next.push({ ...partial, [control.id]: value });
      }
    }
    configs = next;
  }
  return configs;
}

describe("content/*.yaml contract", () => {
  it("finds at least one scenario file", () => {
    expect(contentFiles.length).toBeGreaterThan(0);
  });

  it.each(contentFiles.map((file) => [path.basename(file), file]))(
    "%s loads and validates",
    (_name, file) => {
      expect(() => loadScenarioFile(file)).not.toThrow();
    },
  );

  it("has unique scenario ids", () => {
    const ids = contentFiles.map((file) => loadScenarioFile(file).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("registers every file (none lost to a duplicate id)", () => {
    expect(listScenarios()).toHaveLength(contentFiles.length);
  });

  it.each(listScenarios().map((scenario) => [scenario.id, scenario] as const))(
    "%s has at least one legit actor and one attacker",
    (_id, scenario) => {
      const roles = new Set(scenario.actors.map((actor) => actor.role));
      expect(roles.has("legitimo")).toBe(true);
      expect(roles.has("atacante")).toBe(true);
    },
  );
});

describe.each(listScenarios().map((scenario) => [scenario.id, scenario] as const))(
  "%s engine contract",
  (_id, scenario: Scenario) => {
    // Built once: the same combinations are checked for every seed.
    const configs = allConfigs(scenario.controls);

    it(
      "optimal config is never beaten, and score axes stay within 0..100, for seeds 1..20",
      () => {
        // Violations are collected and asserted once at the end: a per-combination
        // expect() costs far more than the simulation itself on this many runs.
        const outOfRange: string[] = [];
        const beaten: string[] = [];

        for (const seed of SEEDS) {
          const optimal = simulate(scenario, scenario.optimal, seed).score.total;
          let best = -Infinity;

          for (const config of configs) {
            const score = simulate(scenario, config, seed).score;
            best = Math.max(best, score.total);
            for (const [axis, value] of Object.entries({
              security: score.security,
              operations: score.operations,
              cost: score.cost,
              total: score.total,
            })) {
              if (value < 0 || value > 100) {
                outOfRange.push(`seed ${seed} ${axis}=${value} config=${JSON.stringify(config)}`);
              }
            }
          }

          if (optimal < best) beaten.push(`seed ${seed}: optimal ${optimal} < best ${best}`);
        }

        expect(outOfRange).toEqual([]);
        expect(beaten).toEqual([]);
      },
      600_000,
    );

    it("returns identical results for the same config and seed", () => {
      for (const seed of [1, 7, 2026]) {
        expect(simulate(scenario, scenario.optimal, seed)).toEqual(
          simulate(scenario, scenario.optimal, seed),
        );
      }
    });
  },
);
