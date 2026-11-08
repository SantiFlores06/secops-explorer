import { normalizeConfig } from "./config";
import { evaluateTimeline } from "./evaluate";
import { normalizeSeed } from "./rng";
import { computeScore } from "./score";
import { buildTimeline } from "./timeline";
import type { Scenario, SimulationResult } from "./types";

/**
 * Runs one full simulation.
 *
 * Pure and deterministic: the same scenario, config and seed always return
 * the same result. There is no clock, no global randomness and no I/O here.
 */
export function simulate(
  scenario: Scenario,
  config: Record<string, unknown>,
  seed: number,
): SimulationResult {
  const normalizedSeed = normalizeSeed(seed);
  const normalizedConfig = normalizeConfig(scenario, config);
  const attempts = buildTimeline(scenario, normalizedSeed);
  const events = evaluateTimeline(scenario, normalizedConfig, attempts);
  const score = computeScore(scenario, normalizedConfig, events);

  return {
    scenarioId: scenario.id,
    seed: normalizedSeed,
    config: normalizedConfig,
    events,
    score,
  };
}
