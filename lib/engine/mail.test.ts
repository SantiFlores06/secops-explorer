import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR, getScenario } from "../scenarios";
import { defaultConfig } from "./config";
import { isDocumentationIp } from "./ips";
import { parseScenario, ScenarioValidationError } from "./schema";
import { decodeShare } from "./share";
import { simulate } from "./simulate";
import type { Config, Scenario } from "./types";

const found = getScenario("dmarc-suplantacion");
if (!found) throw new Error("dmarc-suplantacion scenario is missing");
const scenario: Scenario = found;

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const defaults = defaultConfig(scenario);
const withConfig = (overrides: Config): Config => ({ ...defaults, ...overrides });

const SCAMMER = "suplantacion_gerente";
const NEWSLETTER = "newsletter";
const EMPLOYEES = "correo_empresa";

const OPTIMAL: Config = { spf: "con_proveedor", dkim: true, dmarc: "reject", reportes: "buzon" };

/** Every combination of the four controls: the search space the optimum must beat. */
const SEARCH_SPACE: Config[] = ["none", "sin_proveedor", "con_proveedor"].flatMap((spf) =>
  [false, true].flatMap((dkim) =>
    ["none", "quarantine", "reject"].flatMap((dmarc) =>
      ["none", "buzon"].map((reportes) => ({ spf, dkim, dmarc, reportes })),
    ),
  ),
);

function eventsOf(config: Config, actorId: string, seed = 5) {
  return simulate(scenario, config, seed).events.filter((event) => event.actorId === actorId);
}

function outcomesOf(config: Config, actorId: string, seed = 5): string[] {
  return eventsOf(config, actorId, seed).map((event) => event.outcome);
}

function scammerStatus(config: Config, seed: number) {
  return simulate(scenario, config, seed).score.attackers.find((a) => a.actorId === SCAMMER)?.status;
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
    expect(shape(defaults)).toEqual(shape(withConfig({ dmarc: "reject", spf: "none" })));
  });
});

describe("the company's own mail", () => {
  it("passes SPF whenever the record exists, even without DKIM", () => {
    for (const seed of SEEDS) {
      const events = eventsOf(withConfig({ spf: "sin_proveedor", dkim: false, dmarc: "reject" }), EMPLOYEES, seed);
      expect(events.every((e) => e.outcome === "permitido")).toBe(true);
      expect(events.every((e) => e.explanationKey === "correo_autenticado")).toBe(true);
    }
  });

  it("is blocked by reject when neither SPF nor DKIM covers it", () => {
    const outcomes = outcomesOf(withConfig({ spf: "none", dkim: false, dmarc: "reject" }), EMPLOYEES);
    expect(outcomes.every((outcome) => outcome === "bloqueado")).toBe(true);
  });

  it("is rescued by DKIM when there is no SPF record", () => {
    const events = eventsOf(withConfig({ spf: "none", dkim: true, dmarc: "reject" }), EMPLOYEES);
    expect(events.every((e) => e.outcome === "permitido")).toBe(true);
    expect(events.every((e) => e.explanationKey === "correo_autenticado")).toBe(true);
  });

  it("is delivered with the policy none even when it fails, and reports show the failure", () => {
    const silent = eventsOf(withConfig({ spf: "none", dkim: false, dmarc: "none", reportes: "none" }), EMPLOYEES);
    expect(silent.every((e) => e.outcome === "permitido")).toBe(true);
    expect(silent.every((e) => e.explanationKey === "dmarc_fallo_tolerado")).toBe(true);

    const reported = eventsOf(withConfig({ spf: "none", dkim: false, dmarc: "none", reportes: "buzon" }), EMPLOYEES);
    expect(reported.every((e) => e.outcome === "permitido")).toBe(true);
    expect(reported.every((e) => e.explanationKey === "dmarc_fallo_reportado")).toBe(true);
  });
});

describe("the third-party newsletter", () => {
  it("reject without authorizing the provider blocks the newsletter and lowers operations", () => {
    const config = withConfig({ spf: "sin_proveedor", dkim: true, dmarc: "reject", reportes: "buzon" });
    for (const seed of SEEDS) {
      const { score, events } = simulate(scenario, config, seed);
      const newsletter = events.filter((e) => e.actorId === NEWSLETTER);
      expect(newsletter.every((e) => e.outcome === "bloqueado")).toBe(true);
      expect(score.operations).toBeLessThan(100);
    }
  });

  it("DKIM never vouches for the provider, so it cannot hide a missing authorization", () => {
    const outcomes = eventsOf(withConfig({ spf: "sin_proveedor", dkim: true, dmarc: "reject" }), NEWSLETTER);
    expect(outcomes.every((e) => e.outcome === "bloqueado")).toBe(true);
    expect(outcomes.every((e) => e.explanationKey === "dmarc_rechazo_legitimo")).toBe(true);
  });

  it("reject with the provider authorized lets the newsletter through", () => {
    for (const seed of SEEDS) {
      const { score, events } = simulate(scenario, withConfig({ spf: "con_proveedor", dmarc: "reject" }), seed);
      const newsletter = events.filter((e) => e.actorId === NEWSLETTER);
      expect(newsletter.every((e) => e.outcome === "permitido")).toBe(true);
      expect(newsletter.every((e) => e.explanationKey === "correo_autenticado")).toBe(true);
      expect(score.operations).toBe(100);
    }
  });

  it("quarantine without authorization sends the newsletter to spam", () => {
    const outcomes = eventsOf(withConfig({ spf: "sin_proveedor", dmarc: "quarantine" }), NEWSLETTER);
    expect(outcomes.every((e) => e.outcome === "bloqueado")).toBe(true);
    expect(outcomes.every((e) => e.explanationKey === "dmarc_cuarentena_legitimo")).toBe(true);
  });

  it("policy none delivers the newsletter without authorization", () => {
    const outcomes = eventsOf(withConfig({ spf: "sin_proveedor", dmarc: "none" }), NEWSLETTER);
    expect(outcomes.every((e) => e.outcome === "permitido")).toBe(true);
  });
});

describe("the spoofer", () => {
  it("lets the spoofer through unnoticed with policy none and no reports", () => {
    for (const seed of SEEDS) {
      const { score, events } = simulate(scenario, withConfig({ dmarc: "none", reportes: "none" }), seed);
      const spoofed = events.filter((e) => e.actorId === SCAMMER);
      expect(spoofed.every((e) => e.outcome === "no_detectado")).toBe(true);
      expect(score.attackers.find((a) => a.actorId === SCAMMER)?.status).toBe("comprometido");
      expect(score.security).toBe(0);
    }
  });

  it("reports make the spoofer detected under policy none", () => {
    const outcomes = outcomesOf(withConfig({ dmarc: "none", reportes: "buzon" }), SCAMMER);
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes.every((outcome) => outcome === "detectado")).toBe(true);
    for (const seed of SEEDS) expect(scammerStatus(withConfig({ dmarc: "none", reportes: "buzon" }), seed)).toBe("detectado");
  });

  it("sends the spoofer to spam with policy quarantine", () => {
    const outcomes = outcomesOf(withConfig({ dmarc: "quarantine" }), SCAMMER);
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes.every((outcome) => outcome === "detectado")).toBe(true);
  });

  it("blocks the spoofer with policy reject", () => {
    for (const seed of SEEDS) {
      const { score, events } = simulate(scenario, withConfig({ dmarc: "reject" }), seed);
      expect(events.filter((e) => e.actorId === SCAMMER).every((e) => e.outcome === "bloqueado")).toBe(true);
      expect(score.attackers.find((a) => a.actorId === SCAMMER)?.status).toBe("detenido");
    }
  });

  it("never passes DMARC, whatever the configuration", () => {
    for (const config of SEARCH_SPACE) {
      for (const seed of [1, 2, 3]) {
        const events = eventsOf(config, SCAMMER, seed);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.outcome !== "permitido")).toBe(true);
        expect(events.every((e) => e.explanationKey !== "correo_autenticado")).toBe(true);
      }
    }
  });
});

describe("optimal configuration", () => {
  it("is the reject, provider-authorized, DKIM, reports configuration", () => {
    expect(scenario.optimal).toEqual(OPTIMAL);
  });

  it("stops the spoofer, keeps every legitimate message and reaches full security", () => {
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
    const result = simulate(scenario, { dmarc: "lo-que-sea", spf: 7 }, 1);
    expect(result.config.dmarc).toBe("none");
    expect(result.config.spf).toBe("sin_proveedor");
  });
});

describe("old share links", () => {
  it("decodes a link with removed controls and removed enum values without crashing", () => {
    const legacy = "semilla=77&politica=reject&pct=50&alineacion=strict&spf=hardfail&dmarc=softfail&dkim=1";
    const decoded = decodeShare(scenario, legacy);

    expect(decoded.shared).toBe(true);
    expect(decoded.seed).toBe(77);
    expect(Object.keys(decoded.config).sort()).toEqual(["dkim", "dmarc", "reportes", "spf"]);
    expect(decoded.config.spf).toBe("sin_proveedor");
    expect(decoded.config.dmarc).toBe("none");
    expect(decoded.config.dkim).toBe(true);

    const { score } = simulate(scenario, decoded.config, decoded.seed);
    for (const value of [score.security, score.operations, score.cost, score.total]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
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

  it("has exactly the four DMARC controls and the three actors of the concept", () => {
    const parsed = parseScenario(raw);
    expect(parsed.controls.map((control) => control.id).sort()).toEqual(["dkim", "dmarc", "reportes", "spf"]);
    expect(parsed.actors.map((actor) => actor.id).sort()).toEqual([EMPLOYEES, NEWSLETTER, SCAMMER].sort());
  });

  it("maps each actor to its mail server", () => {
    const parsed = parseScenario(raw);
    expect(parsed.protectedDomain).toBe("example.com");
    expect(parsed.actors.find((a) => a.id === EMPLOYEES)?.mail).toEqual({
      fromDomain: "example.com",
      server: "propio",
    });
    expect(parsed.actors.find((a) => a.id === NEWSLETTER)?.mail?.server).toBe("proveedor");
    expect(parsed.actors.find((a) => a.id === SCAMMER)?.mail?.server).toBe("ajeno");
  });

  it("rejects domains outside the RFC 2606 reserved names", () => {
    expectRejected((d) => (d.actores[0].correo.dominio = "example.co"), "RFC 2606");
  });

  it("rejects a mail server outside the model", () => {
    expectRejected((d) => (d.actores[1].correo.servidor = "tercero"), "actores.1.correo.servidor");
  });

  it("rejects an enum default that is not one of its options", () => {
    expectRejected((d) => (d.controles[0].default = "lo-que-sea"), "una de las opciones");
  });

  it("rejects an optimal enum value that is not one of its options", () => {
    expectRejected((d) => (d.optimo.dmarc = "bloquear"), "una de las opciones");
  });

  it("rejects an optimal value for a removed SPF option", () => {
    expectRejected((d) => (d.optimo.spf = "softfail"), "una de las opciones");
  });

  it("rejects an optimal value for a removed control", () => {
    expectRejected((d) => (d.optimo.pct = 100), "control inexistente: pct");
  });

  it("requires the optimal configuration to set every control", () => {
    expectRejected((d) => delete d.optimo.reportes, "falta el control en el óptimo: reportes");
  });

  it("requires the protected domain when actors send mail", () => {
    expectRejected((d) => delete d.dominio_protegido, "requieren dominio_protegido");
  });
});
