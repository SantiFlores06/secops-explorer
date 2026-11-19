import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR, getScenario } from "../scenarios";
import { defaultConfig } from "./config";
import { isDocumentationIp } from "./ips";
import { parseScenario, ScenarioValidationError } from "./schema";
import { simulate } from "./simulate";
import type { Config, Scenario } from "./types";

const found = getScenario("tienda-sin-headers");
if (!found) throw new Error("tienda-sin-headers scenario is missing");
const scenario: Scenario = found;

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const defaults = defaultConfig(scenario);
const withConfig = (overrides: Config): Config => ({ ...defaults, ...overrides });

const CUSTOMERS = "clientes";
const CHAT = "chat_soporte";
const XSS = "xss_comentarios";
const MITM = "mitm_wifi";
const CLICKJACKING = "clickjacking";

const OPTIMAL: Config = { csp: "estricta_con_proveedor", hsts: true, cookies: "secure_httponly_samesite", marcos: true };

/** Every combination of the four controls: the search space the optimum must beat. */
const SEARCH_SPACE: Config[] = ["none", "unsafe_inline", "estricta", "estricta_con_proveedor"].flatMap((csp) =>
  [false, true].flatMap((hsts) =>
    ["none", "secure_httponly", "secure_httponly_samesite"].flatMap((cookies) =>
      [false, true].map((marcos) => ({ csp, hsts, cookies, marcos })),
    ),
  ),
);

function eventsOf(config: Config, actorId: string, seed = 5) {
  return simulate(scenario, config, seed).events.filter((event) => event.actorId === actorId);
}

function outcomesOf(config: Config, actorId: string, seed = 5): string[] {
  return eventsOf(config, actorId, seed).map((event) => event.outcome);
}

function attackerStatus(config: Config, actorId: string, seed: number) {
  return simulate(scenario, config, seed).score.attackers.find((a) => a.actorId === actorId)?.status;
}

describe("determinism", () => {
  it("returns identical results for the same scenario, config and seed", () => {
    expect(simulate(scenario, OPTIMAL, 42)).toEqual(simulate(scenario, OPTIMAL, 42));
  });

  it("stays deterministic across many seeds and only uses documentation addresses", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const first = simulate(scenario, OPTIMAL, seed);
      expect(simulate(scenario, OPTIMAL, seed)).toEqual(first);
      for (const event of first.events) expect(isDocumentationIp(event.ip)).toBe(true);
    }
  });

  it("is deterministic for every configuration in the search space", () => {
    for (const config of SEARCH_SPACE) {
      for (let seed = 1; seed <= 10; seed++) {
        expect(simulate(scenario, config, seed)).toEqual(simulate(scenario, config, seed));
      }
    }
  });

  it("builds the same timeline whatever the configuration", () => {
    const shape = (config: Config) =>
      simulate(scenario, config, 9).events.map((e) => [e.t, e.actorId, e.ip, e.user]);
    expect(shape(defaults)).toEqual(shape(OPTIMAL));
    expect(shape(defaults)).toEqual(shape(withConfig({ csp: "estricta", hsts: false })));
  });
});

describe("the shop's customers", () => {
  it("always get through, whatever the configuration", () => {
    for (const config of SEARCH_SPACE) {
      for (const seed of [1, 2, 3]) {
        const events = eventsOf(config, CUSTOMERS, seed);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.outcome === "permitido")).toBe(true);
        expect(events.every((e) => e.explanationKey === "navegacion_legitima")).toBe(true);
      }
    }
  });
});

describe("the support chat from the provider", () => {
  it("is blocked by a strict CSP that does not authorize the provider", () => {
    for (const seed of SEEDS) {
      const { score, events } = simulate(scenario, withConfig({ csp: "estricta" }), seed);
      const chat = events.filter((e) => e.actorId === CHAT);
      expect(chat.every((e) => e.outcome === "bloqueado")).toBe(true);
      expect(chat.every((e) => e.explanationKey === "chat_csp_bloqueado")).toBe(true);
      expect(score.operations).toBeLessThan(100);
    }
  });

  it("gets through with no CSP, unsafe-inline, or a strict CSP that authorizes the provider", () => {
    for (const csp of ["none", "unsafe_inline", "estricta_con_proveedor"]) {
      for (const seed of SEEDS) {
        const { score, events } = simulate(scenario, withConfig({ csp }), seed);
        const chat = events.filter((e) => e.actorId === CHAT);
        expect(chat.every((e) => e.outcome === "permitido")).toBe(true);
        expect(score.operations).toBe(100);
      }
    }
  });
});

describe("XSS that tries to steal the session cookie", () => {
  it("is blocked by a strict CSP, with or without the provider", () => {
    for (const csp of ["estricta", "estricta_con_proveedor"]) {
      for (const cookies of ["none", "secure_httponly", "secure_httponly_samesite"]) {
        const outcomes = outcomesOf(withConfig({ csp, cookies }), XSS);
        expect(outcomes.length).toBeGreaterThan(0);
        expect(outcomes.every((outcome) => outcome === "bloqueado")).toBe(true);
      }
    }
  });

  it("runs but cannot read the cookie when it is HttpOnly, so it is detected", () => {
    for (const csp of ["none", "unsafe_inline"]) {
      for (const cookies of ["secure_httponly", "secure_httponly_samesite"]) {
        const events = eventsOf(withConfig({ csp, cookies }), XSS);
        expect(events.every((e) => e.outcome === "detectado")).toBe(true);
        expect(events.every((e) => e.explanationKey === "xss_cookie_httponly")).toBe(true);
      }
    }
  });

  it("steals the session unnoticed without CSP and without HttpOnly", () => {
    for (const seed of SEEDS) {
      const events = eventsOf(withConfig({ csp: "none", cookies: "none" }), XSS, seed);
      expect(events.every((e) => e.outcome === "no_detectado")).toBe(true);
      expect(attackerStatus(withConfig({ csp: "none", cookies: "none" }), XSS, seed)).toBe("comprometido");
    }
  });
});

describe("MITM on public wifi stripping HTTPS", () => {
  it("is blocked when HSTS is on", () => {
    for (const seed of SEEDS) {
      const events = eventsOf(withConfig({ hsts: true }), MITM, seed);
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.outcome === "bloqueado")).toBe(true);
      expect(events.every((e) => e.explanationKey === "mitm_hsts")).toBe(true);
    }
  });

  it("goes unnoticed when HSTS is off", () => {
    const events = eventsOf(withConfig({ hsts: false }), MITM);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.outcome === "no_detectado")).toBe(true);
  });
});

describe("clickjacking that frames the checkout", () => {
  it("is blocked when framing is restricted", () => {
    for (const seed of SEEDS) {
      const events = eventsOf(withConfig({ marcos: true }), CLICKJACKING, seed);
      expect(events.every((e) => e.outcome === "bloqueado")).toBe(true);
      expect(events.every((e) => e.explanationKey === "clickjacking_marcos")).toBe(true);
    }
  });

  it("frames the checkout unnoticed when framing is not restricted", () => {
    const events = eventsOf(withConfig({ marcos: false }), CLICKJACKING);
    expect(events.every((e) => e.outcome === "no_detectado")).toBe(true);
  });
});

describe("optimal configuration", () => {
  it("is the strict CSP with provider, HSTS, HttpOnly + SameSite cookies and frame restriction", () => {
    expect(scenario.optimal).toEqual(OPTIMAL);
  });

  it("stops every attacker, keeps every legitimate request and reaches full security", () => {
    for (const seed of SEEDS) {
      const { score, events } = simulate(scenario, scenario.optimal, seed);
      expect(score.security).toBe(100);
      expect(score.operations).toBe(100);
      expect(events.filter((e) => e.role === "legitimo").every((e) => e.outcome === "permitido")).toBe(true);
    }
  });

  it("is the best one in the search space", () => {
    for (const seed of [42, 7]) {
      const optimalTotal = simulate(scenario, scenario.optimal, seed).score.total;
      for (const config of SEARCH_SPACE) {
        expect(optimalTotal).toBeGreaterThanOrEqual(simulate(scenario, config, seed).score.total);
      }
    }
  });

  it("beats a strict CSP that does not authorize the provider on every seed", () => {
    for (const seed of SEEDS) {
      expect(simulate(scenario, scenario.optimal, seed).score.total).toBeGreaterThan(
        simulate(scenario, { ...OPTIMAL, csp: "estricta" }, seed).score.total,
      );
    }
  });

  it("beats the defaults on every seed", () => {
    for (const seed of SEEDS) {
      expect(simulate(scenario, scenario.optimal, seed).score.total).toBeGreaterThan(
        simulate(scenario, defaults, seed).score.total,
      );
    }
  });

  it("keeps every axis between 0 and 100 across the search space", () => {
    for (const config of SEARCH_SPACE) {
      const { score } = simulate(scenario, config, 3);
      for (const value of [score.security, score.operations, score.cost, score.total]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("normalizes unknown enum values back to the default", () => {
    const result = simulate(scenario, { csp: "lo-que-sea", cookies: 7 }, 1);
    expect(result.config.csp).toBe("none");
    expect(result.config.cookies).toBe("none");
  });
});

describe("schema", () => {
  const raw: unknown = parse(readFileSync(path.join(CONTENT_DIR, "tienda-sin-headers.yaml"), "utf8"));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Draft = Record<string, any>;

  function expectRejected(mutate: (draft: Draft) => void, message: string) {
    const draft = structuredClone(raw) as Draft;
    mutate(draft);
    let error: unknown;
    try {
      parseScenario(draft);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ScenarioValidationError);
    expect((error as ScenarioValidationError).message).toContain(message);
  }

  it("has exactly the four web controls and the five actors of the concept", () => {
    const parsed = parseScenario(raw);
    expect(parsed.controls.map((control) => control.id).sort()).toEqual(["cookies", "csp", "hsts", "marcos"]);
    expect(parsed.actors.map((actor) => actor.id).sort()).toEqual(
      [CUSTOMERS, CHAT, XSS, MITM, CLICKJACKING].sort(),
    );
  });

  it("maps each actor to its web vector", () => {
    const parsed = parseScenario(raw);
    expect(parsed.actors.find((a) => a.id === CUSTOMERS)?.web).toEqual({ vector: "navegacion" });
    expect(parsed.actors.find((a) => a.id === CHAT)?.web).toEqual({ vector: "chat_proveedor" });
    expect(parsed.actors.find((a) => a.id === XSS)?.web).toEqual({ vector: "xss" });
    expect(parsed.actors.find((a) => a.id === MITM)?.web).toEqual({ vector: "mitm" });
    expect(parsed.actors.find((a) => a.id === CLICKJACKING)?.web).toEqual({ vector: "clickjacking" });
  });

  it("rejects an IP outside the RFC 5737 reserved ranges", () => {
    expectRejected((d) => (d.actores[2].ips.valor = "8.8.8.8"), "RFC 5737");
  });

  it("rejects a web vector outside the model", () => {
    expectRejected((d) => (d.actores[0].web.vector = "sql"), "actores.0.web.vector");
  });

  it("rejects a CSP default that is not one of its options", () => {
    expectRejected((d) => (d.controles[0].default = "lo-que-sea"), "una de las opciones");
  });

  it("rejects an optimal value for a removed CSP option", () => {
    expectRejected((d) => (d.optimo.csp = "report_only"), "una de las opciones");
  });

  it("requires the optimal configuration to set every control", () => {
    expectRejected((d) => delete d.optimo.marcos, "falta el control en el óptimo: marcos");
  });
});
