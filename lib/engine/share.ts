import { normalizeConfig } from "./config";
import { normalizeSeed } from "./rng";
import type { Config, Scenario } from "./types";

/**
 * Sharing without a backend: the whole game fits in the query string.
 * Values are parsed strictly into booleans and numbers; nothing is evaluated.
 */

export const SEED_PARAM = "semilla";
export const DEFAULT_SEED = 2026;

/** A deterministic "another game" seed, so no global randomness is needed. */
export function nextSeed(seed: number): number {
  return normalizeSeed(Math.imul(normalizeSeed(seed), 1664525) + 1013904223);
}

export function encodeShare(scenario: Scenario, config: Config, seed: number): string {
  const normalized = normalizeConfig(scenario, config);
  const params = new URLSearchParams();
  params.set(SEED_PARAM, String(normalizeSeed(seed)));
  for (const control of scenario.controls) {
    const value = normalized[control.id];
    params.set(control.id, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  return params.toString();
}

export interface DecodedShare {
  config: Config;
  seed: number;
  /** True when the link carried a seed, i.e. it points at a specific game. */
  shared: boolean;
}

export function decodeShare(
  scenario: Scenario,
  query: string | URLSearchParams,
): DecodedShare {
  const params = typeof query === "string" ? new URLSearchParams(query) : query;

  const partial: Record<string, unknown> = {};
  for (const control of scenario.controls) {
    const raw = params.get(control.id);
    if (raw === null) continue;
    if (control.kind === "toggle") {
      if (raw === "1") partial[control.id] = true;
      else if (raw === "0") partial[control.id] = false;
    } else if (raw.trim() !== "") {
      const value = Number(raw);
      if (Number.isFinite(value)) partial[control.id] = value;
    }
  }

  const rawSeed = params.get(SEED_PARAM);
  const parsedSeed = rawSeed !== null && rawSeed.trim() !== "" ? Number(rawSeed) : NaN;
  const hasSeed = Number.isFinite(parsedSeed);

  return {
    config: normalizeConfig(scenario, partial),
    seed: hasSeed ? normalizeSeed(parsedSeed) : DEFAULT_SEED,
    shared: hasSeed,
  };
}
