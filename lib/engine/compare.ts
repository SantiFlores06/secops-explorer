import { simulate } from "./simulate";
import type { ControlValue, Scenario, SimulationResult } from "./types";

export interface ControlDifference {
  controlId: string;
  label: string;
  yours: ControlValue;
  optimal: ControlValue;
}

export interface Comparison {
  yours: SimulationResult;
  optimal: SimulationResult;
  differences: ControlDifference[];
  /** Points of total score below the optimal configuration (never negative). */
  gap: number;
}

/** Runs your configuration and the scenario's optimal one on the same seed. */
export function compareWithOptimal(
  scenario: Scenario,
  config: Record<string, unknown>,
  seed: number,
): Comparison {
  const yours = simulate(scenario, config, seed);
  const optimal = simulate(scenario, scenario.optimal, seed);

  const differences = scenario.controls
    .filter((control) => yours.config[control.id] !== optimal.config[control.id])
    .map((control) => ({
      controlId: control.id,
      label: control.label,
      yours: yours.config[control.id],
      optimal: optimal.config[control.id],
    }));

  return {
    yours,
    optimal,
    differences,
    gap: Math.max(0, optimal.score.total - yours.score.total),
  };
}
