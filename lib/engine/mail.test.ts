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

const found = getScenario("dmarc-suplantacion");
if (!found) throw new Error("dmarc-suplantacion scenario is missing");
const scenario: Scenario = found;

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const defaults = defaultConfig(scenario);
const withConfig = (overrides: Config): Config => ({ ...defaults, ...overrides });

const SPOOFER = "suplantacion_gerente";
const LOOKALIKE = "dominio_parecido";
const NEWSLETTER = "newsletter";
const LEGIT_MAIL = "correo_empresa";

function outcomesOf(config: Config, actorId: string, seed = 5): string[] {
  return simulate(scenario, config, seed)
    .events.filter((event) => event.actorId === actorId)
    .map((event) => event.outcome);
}

describe("determinism", () => {
  it("returns identical results for the same scenario, config and seed", () => {
    const config = withConfig({ politica: "reject", dkim: true });
    expect(simulate(scenario, config, 42)).toEqual(simulate(scenario, config, 42));
  });

  it("stays deterministic across many seeds and only uses documentation addresses", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const first = simulate(scenario, scenario.optimal, seed);
      expect(simulate(scenario, scenario.optimal, seed)).toEqual(first);
      for (const event of first.events) expect(isDocumentationIp(event.ip)).toBe(true);
    }
  });

  it("builds the same timeline whatever the configuration", () => {
    const shape = (config: Config) =>
      simulate(scenario, config, 9).events.map((e) => [e.t, e.actorId, e.ip, e.user]);
    expect(shape(defaults)).toEqual(shape(scenario.optimal));
    expect(shape(defaults)).toEqual(shape(withConfig({ politica: "reject", pct: 0 })));
  });
});

describe("spoofing the company domain", () => {
  it("lets the spoofer through with policy none", () => {
    for (const seed of SEEDS) {
      const { score, events } = simulate(scenario, withConfig({ politica: "none" }), seed);
      const spoofed = events.filter((e) => e.actorId === SPOOFER);
      expect(spoofed.every((e) => e.outcome === "no_detectado")).toBe(true);
      expect(score.attackers.find((a) => a.actorId === SPOOFER)?.status).toBe("comprometido");
    }
  });

  it("blocks the spoofer with policy reject", () => {
    for (const seed of SEEDS) {
      const { score, events } = simulate(scenario, withConfig({ politica: "reject" }), seed);
      expect(events.filter((e) => e.actorId === SPOOFER).every((e) => e.outcome === "bloqueado")).toBe(
        true,
      );
      expect(score.attackers.find((a) => a.actorId === SPOOFER)?.status).toBe("detenido");
    }
  });

  it("sends the spoofer to spam with policy quarantine", () => {
    const outcomes = outcomesOf(withConfig({ politica: "quarantine" }), SPOOFER);
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes.every((outcome) => outcome === "detectado")).toBe(true);
  });

  it("applies no policy when pct is zero", () => {
    expect(outcomesOf(withConfig({ politica: "reject", pct: 0 }), SPOOFER).every((o) => o === "no_detectado")).toBe(
      true,
    );
  });

  it("stops the spoofer with a valid DMARC policy and keeps the company working", () => {
    const { score } = simulate(scenario, scenario.optimal, 6);
    expect(score.attackers.find((a) => a.actorId === SPOOFER)?.status).toBe("detenido");
    expect(score.operations).toBe(100);
  });
});

describe("alignment and the third-party newsletter", () => {
  const reject = { politica: "reject", dkim: true };

  it("strict alignment blocks the newsletter and operations drop", () => {
    const config = withConfig({ ...reject, alineacion: "strict" });
    for (const seed of SEEDS) {
      const { score, events } = simulate(scenario, config, seed);
      const newsletter = events.filter((e) => e.actorId === NEWSLETTER);
      expect(newsletter.every((e) => e.outcome === "bloqueado")).toBe(true);
      expect(score.operations).toBeLessThan(100);
    }
  });

  it("relaxed alignment lets the DKIM-signed newsletter through", () => {
    const config = withConfig({ ...reject, alineacion: "relaxed" });
    for (const seed of SEEDS) {
      const { score, events } = simulate(scenario, config, seed);
      expect(events.filter((e) => e.actorId === NEWSLETTER).every((e) => e.outcome === "permitido")).toBe(
        true,
      );
      expect(score.operations).toBe(100);
    }
  });

  it("reject without DKIM breaks the newsletter, which has no aligned signature", () => {
    const outcomes = outcomesOf(withConfig({ politica: "reject", dkim: false }), NEWSLETTER);
    expect(outcomes.every((outcome) => outcome === "bloqueado")).toBe(true);
  });

  it("the default policy (none) delivers the newsletter even without DKIM", () => {
    const outcomes = outcomesOf(defaults, NEWSLETTER);
    expect(outcomes.every((outcome) => outcome === "permitido")).toBe(true);
  });

  it("the company's own mail stays allowed under reject with DKIM", () => {
    const outcomes = outcomesOf(withConfig({ politica: "reject", dkim: true }), LEGIT_MAIL);
    expect(outcomes.every((outcome) => outcome === "permitido")).toBe(true);
  });
});

describe("lookalike domain", () => {
  const configs: Config[] = [
    defaults,
    scenario.optimal,
    withConfig({ politica: "reject", dkim: true, alineacion: "strict" }),
    withConfig({ politica: "reject", pct: 0 }),
  ];

  it("is never caught by DMARC, whatever the configuration", () => {
    for (const config of configs) {
      for (const seed of SEEDS) {
        const events = simulate(scenario, config, seed).events.filter((e) => e.actorId === LOOKALIKE);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.outcome === "no_detectado")).toBe(true);
        expect(events.every((e) => e.explanationKey === "dominio_ajeno")).toBe(true);
      }
    }
  });
});

describe("optimal configuration", () => {
  it("is the best one in the search space", () => {
    const politicas = ["none", "quarantine", "reject"];
    const pcts = [0, 50, 100];
    const spfs = ["off", "softfail", "hardfail"];
    const alineaciones = ["relaxed", "strict"];

    for (const seed of [42, 7]) {
      const optimalTotal = simulate(scenario, scenario.optimal, seed).score.total;
      let best = -1;
      for (const politica of politicas) {
        for (const pct of pcts) {
          for (const spf of spfs) {
            for (const dkim of [false, true]) {
              for (const alineacion of alineaciones) {
                const config = withConfig({ politica, pct, spf, dkim, alineacion });
                best = Math.max(best, simulate(scenario, config, seed).score.total);
              }
            }
          }
        }
      }
      expect(optimalTotal).toBeGreaterThanOrEqual(best);
    }
  });

  it("beats the defaults on every seed", () => {
    for (const seed of SEEDS) {
      expect(simulate(scenario, scenario.optimal, seed).score.total).toBeGreaterThan(
        simulate(scenario, defaults, seed).score.total,
      );
    }
  });

  it("keeps every axis between 0 and 100", () => {
    for (const seed of SEEDS) {
      const { score } = simulate(scenario, defaults, seed);
      for (const value of [score.security, score.operations, score.cost, score.total]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("normalizes unknown enum values back to the default", () => {
    const result = simulate(scenario, { politica: "lo-que-sea", spf: 7 }, 1);
    expect(result.config.politica).toBe("none");
    expect(result.config.spf).toBe("softfail");
  });
});

describe("schema", () => {
  const raw: unknown = parse(readFileSync(path.join(CONTENT_DIR, "dmarc-suplantacion.yaml"), "utf8"));

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

  it("accepts the DMARC scenario and maps mail profiles", () => {
    const parsed = parseScenario(raw);
    const legit = parsed.actors.find((a) => a.id === LEGIT_MAIL);
    expect(parsed.protectedDomain).toBe("example.com");
    expect(legit?.mail).toEqual({
      fromDomain: "example.com",
      spf: "propio",
      signing: "propia",
      signingDomain: "example.com",
    });
  });

  it("rejects domains outside the RFC 2606 reserved names", () => {
    expectRejected((d) => (d.actores[0].correo.dominio = "example.co"), "RFC 2606");
    expectRejected((d) => (d.actores[1].correo.dominio_firma = "news.gmail.com"), "RFC 2606");
  });

  it("rejects an enum default that is not one of its options", () => {
    expectRejected((d) => (d.controles[0].default = "lo-que-sea"), "una de las opciones");
  });

  it("rejects an optimal enum value that is not one of its options", () => {
    expectRejected((d) => (d.optimo.politica = "bloquear"), "una de las opciones");
  });

  it("requires a delegated signature to name its signing domain", () => {
    expectRejected((d) => delete d.actores[1].correo.dominio_firma, "requiere dominio_firma");
  });

  it("requires the protected domain when actors send mail", () => {
    expectRejected((d) => delete d.dominio_protegido, "requieren dominio_protegido");
  });
});
