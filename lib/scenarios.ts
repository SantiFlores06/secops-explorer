import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { parseScenario } from "./engine/schema";
import type { Scenario } from "./engine/types";

/**
 * Loads and validates every scenario in /content.
 *
 * This runs once, when the module is first imported, so with prerendering it
 * happens at build time. An invalid scenario fails the build.
 */

export const CONTENT_DIR = path.join(process.cwd(), "content");

export function loadScenarioFile(filePath: string): Scenario {
  const scenario = parseScenario(parse(readFileSync(filePath, "utf8")));
  const expectedName = path.basename(filePath).replace(/\.ya?ml$/, "");
  if (scenario.id !== expectedName) {
    throw new Error(
      `El id "${scenario.id}" debe coincidir con el nombre del archivo "${expectedName}"`,
    );
  }
  return scenario;
}

function loadAll(): Map<string, Scenario> {
  const scenarios = new Map<string, Scenario>();
  const files = readdirSync(CONTENT_DIR)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  for (const name of files) {
    const scenario = loadScenarioFile(path.join(CONTENT_DIR, name));
    scenarios.set(scenario.id, scenario);
  }
  return scenarios;
}

const SCENARIOS = loadAll();

export function listScenarios(): Scenario[] {
  return [...SCENARIOS.values()];
}

export function getScenario(slug: string): Scenario | undefined {
  return SCENARIOS.get(slug);
}
