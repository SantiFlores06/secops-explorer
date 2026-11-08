import type { Config, ControlDef, ControlValue, Scenario } from "./types";

export function defaultConfig(scenario: Scenario): Config {
  const config: Config = {};
  for (const control of scenario.controls) {
    config[control.id] = control.defaultValue;
  }
  return config;
}

function normalizeControl(control: ControlDef, raw: unknown): ControlValue {
  if (control.kind === "toggle") {
    return typeof raw === "boolean" ? raw : control.defaultValue;
  }
  if (control.kind === "enum") {
    return typeof raw === "string" && control.options.some((option) => option.value === raw)
      ? raw
      : control.defaultValue;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return control.defaultValue;
  }
  return Math.min(control.max, Math.max(control.min, Math.round(raw)));
}

/**
 * Fills missing controls with their defaults, clamps numbers to their range
 * and drops unknown keys, so the engine always works with a complete config.
 */
export function normalizeConfig(
  scenario: Scenario,
  partial: Record<string, unknown> = {},
): Config {
  const config: Config = {};
  for (const control of scenario.controls) {
    config[control.id] = normalizeControl(control, partial[control.id]);
  }
  return config;
}
