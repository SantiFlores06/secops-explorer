import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The engine's promise is: same scenario + config + seed, same result.
 * That breaks the moment something reads the clock or global randomness, so
 * this test scans the engine sources and fails if either shows up.
 */

const ENGINE_DIR = path.join(process.cwd(), "lib", "engine");

const sources = readdirSync(ENGINE_DIR)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => ({
    name,
    code: readFileSync(path.join(ENGINE_DIR, name), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, ""),
  }));

const FORBIDDEN: [string, RegExp][] = [
  ["Math.random", /Math\s*\.\s*random/],
  ["Date.now", /Date\s*\.\s*now/],
  ["new Date", /new\s+Date\b/],
  ["performance.now", /performance\s*\.\s*now/],
  ["crypto random", /crypto\s*\.\s*(getRandomValues|randomUUID)/],
];

describe("engine purity", () => {
  it("scans the engine sources", () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  for (const [label, pattern] of FORBIDDEN) {
    it(`never uses ${label}`, () => {
      const offenders = sources.filter(({ code }) => pattern.test(code)).map(({ name }) => name);
      expect(offenders).toEqual([]);
    });
  }

  it("never imports React, Next.js or Node built-ins", () => {
    const offenders = sources
      .filter(({ code }) => /from\s+["'](react|next|node:)/.test(code))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});
