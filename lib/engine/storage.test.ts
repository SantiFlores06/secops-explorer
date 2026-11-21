import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR, getScenario } from "../scenarios";
import { defaultConfig } from "./config";
import { isDocumentationIp } from "./ips";
import { parseScenario } from "./schema";
import { simulate } from "./simulate";
import { storageFacts } from "./storage";
import type { Config, Scenario } from "./types";

const found = getScenario("bucket-publico");
if (!found) throw new Error("bucket-publico scenario is missing");
const scenario: Scenario = found;

const ACCESS = ["publico", "privado", "privado_cdn"] as const;
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const OPTIMAL: Config = { acceso: "privado_cdn", urls_firmadas: true, registro: true };

/** Every combination of the three controls: the search space the optimum must beat. */
const SEARCH_SPACE: Config[] = ACCESS.flatMap((acceso) =>
  [false, true].flatMap((urls_firmadas) =>
    [false, true].map((registro) => ({ acceso, urls_firmadas, registro })),
  ),
);

const VISITANTES = "visitantes_tienda";
const SOCIO = "socio_reportes";
const BOTS = "bots_escaneo";

function simulateTotal(config: Config, seed: number): number {
  return simulate(scenario, config, seed).score.total;
}
const ENLACE = "enlace_viejo";

const defaults = defaultConfig(scenario);
const withConfig = (overrides: Config): Config => ({ ...defaults, ...overrides });

function eventsOf(config: Config, actorId: string, seed = 5) {
  return simulate(scenario, config, seed).events.filter((event) => event.actorId === actorId);
}

function attackerStatus(config: Config, actorId: string, seed: number) {
  return simulate(scenario, config, seed).score.attackers.find((a) => a.actorId === actorId)?.status;
}

function bestTotal(configs: Config[], seed: number): number {
  return Math.max(...configs.map((config) => simulate(scenario, config, seed).score.total));
}

describe("storage facts", () => {
  const facts = (acceso: string, urls_firmadas = false) =>
    storageFacts({ acceso, urls_firmadas, registro: false }, { vector: "descarga_socio" });

  it("marks only the public option as public", () => {
    expect(facts("publico")).toMatchObject({ acceso_publico: true, acceso_privado: false });
    expect(facts("privado")).toMatchObject({ acceso_publico: false, acceso_privado: true });
    expect(facts("privado_cdn")).toMatchObject({ acceso_publico: false, acceso_privado: false });
  });

  it("allows downloads on a public bucket or with signed URLs", () => {
    expect(facts("publico", false).descarga_permitida).toBe(true);
    expect(facts("privado", true).descarga_permitida).toBe(true);
    expect(facts("privado_cdn", true).descarga_permitida).toBe(true);
    expect(facts("privado", false).descarga_permitida).toBe(false);
    expect(facts("privado_cdn", false).descarga_permitida).toBe(false);
  });

  it("passes the actor's vector through", () => {
    expect(
      storageFacts({ acceso: "publico", urls_firmadas: false, registro: false }, { vector: "escaneo" }).vector,
    ).toBe("escaneo");
  });
});

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
  });
});

describe("the shop's visitors loading product images", () => {
  it("load images with public access or behind a CDN, whatever the other controls", () => {
    for (const config of SEARCH_SPACE.filter((c) => c.acceso !== "privado")) {
      for (const seed of SEEDS) {
        const events = eventsOf(config, VISITANTES, seed);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.outcome === "permitido")).toBe(true);
      }
    }
  });

  it("are blocked with a private bucket and no CDN", () => {
    for (const urls_firmadas of [false, true]) {
      for (const seed of SEEDS) {
        const events = eventsOf(withConfig({ acceso: "privado", urls_firmadas }), VISITANTES, seed);
        expect(events.every((e) => e.outcome === "bloqueado")).toBe(true);
        expect(events.every((e) => e.explanationKey === "imagen_bloqueada")).toBe(true);
      }
    }
  });
});

describe("the partner who downloads monthly reports", () => {
  it("downloads on a public bucket or with signed URLs, and is blocked otherwise", () => {
    for (const config of SEARCH_SPACE) {
      const expected = config.acceso === "publico" || config.urls_firmadas === true;
      for (const seed of SEEDS) {
        const events = eventsOf(config, SOCIO, seed);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.outcome === (expected ? "permitido" : "bloqueado"))).toBe(true);
      }
    }
  });
});

describe("bots scanning for open buckets", () => {
  it("are blocked by a private bucket, with or without CDN", () => {
    for (const acceso of ["privado", "privado_cdn"]) {
      for (const seed of SEEDS) {
        const events = eventsOf(withConfig({ acceso }), BOTS, seed);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.outcome === "bloqueado")).toBe(true);
      }
    }
  });

  it("still compromise a public bucket with logging on: the data is already gone", () => {
    for (const seed of SEEDS) {
      const config = withConfig({ acceso: "publico", registro: true });
      const events = eventsOf(config, BOTS, seed);
      expect(events.every((e) => e.outcome === "no_detectado")).toBe(true);
      expect(attackerStatus(config, BOTS, seed)).toBe("comprometido");
    }
  });

  it("keep a public bucket well below the optimum even with signed URLs and logging", () => {
    const seed = SEEDS[0];
    const best = simulateTotal(OPTIMAL, seed);
    const publicBest = simulateTotal({ acceso: "publico", urls_firmadas: true, registro: true }, seed);
    expect(best - publicBest).toBeGreaterThanOrEqual(10);
  });

  it("go unnoticed on a public bucket with logging off", () => {
    for (const seed of SEEDS) {
      const config = withConfig({ acceso: "publico", registro: false });
      const events = eventsOf(config, BOTS, seed);
      expect(events.every((e) => e.outcome === "no_detectado")).toBe(true);
      expect(attackerStatus(config, BOTS, seed)).toBe("comprometido");
    }
  });
});

describe("expired link leaked on a forum", () => {
  it("is blocked when signed URLs are on, or when the bucket is not public", () => {
    for (const config of SEARCH_SPACE) {
      if (!(config.urls_firmadas === true || config.acceso !== "publico")) continue;
      for (const seed of SEEDS) {
        const events = eventsOf(config, ENLACE, seed);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.outcome === "bloqueado")).toBe(true);
      }
    }
  });

  it("is detected on a public bucket with logging on and no signed URLs", () => {
    for (const seed of SEEDS) {
      const config = withConfig({ acceso: "publico", urls_firmadas: false, registro: true });
      const events = eventsOf(config, ENLACE, seed);
      expect(events.every((e) => e.outcome === "detectado")).toBe(true);
      expect(events.every((e) => e.explanationKey === "enlace_detectado")).toBe(true);
    }
  });

  it("gets through unnoticed on a public bucket with no signed URLs and no logging", () => {
    for (const seed of SEEDS) {
      const config = withConfig({ acceso: "publico", urls_firmadas: false, registro: false });
      const events = eventsOf(config, ENLACE, seed);
      expect(events.every((e) => e.outcome === "no_detectado")).toBe(true);
      expect(attackerStatus(config, ENLACE, seed)).toBe("comprometido");
    }
  });
});

describe("optimal configuration", () => {
  it("is a private bucket behind a CDN, signed URLs and logging on", () => {
    expect(scenario.optimal).toEqual(OPTIMAL);
  });

  it("stops every attacker and keeps every legitimate download and image load", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { score, events } = simulate(scenario, scenario.optimal, seed);
      expect(score.security).toBe(100);
      expect(score.operations).toBe(100);
      expect(events.filter((e) => e.role === "legitimo").every((e) => e.outcome === "permitido")).toBe(true);
    }
  });

  it("is the best one in the search space", () => {
    for (const seed of [42, 7, 3]) {
      const optimalTotal = simulate(scenario, scenario.optimal, seed).score.total;
      for (const config of SEARCH_SPACE) {
        expect(optimalTotal).toBeGreaterThanOrEqual(simulate(scenario, config, seed).score.total);
      }
    }
  });

  it("beats every public-bucket configuration on every seed", () => {
    const publico = SEARCH_SPACE.filter((config) => config.acceso === "publico");
    for (let seed = 1; seed <= 20; seed++) {
      expect(simulate(scenario, scenario.optimal, seed).score.total).toBeGreaterThan(
        bestTotal(publico, seed),
      );
    }
  });

  it("beats every private-bucket-without-CDN configuration on every seed", () => {
    const privado = SEARCH_SPACE.filter((config) => config.acceso === "privado");
    for (let seed = 1; seed <= 20; seed++) {
      expect(simulate(scenario, scenario.optimal, seed).score.total).toBeGreaterThan(
        bestTotal(privado, seed),
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
});

describe("schema", () => {
  const raw: unknown = parse(readFileSync(path.join(CONTENT_DIR, "bucket-publico.yaml"), "utf8"));

  it("accepts the scenario file with one storage profile per actor", () => {
    const parsed = parseScenario(raw);
    expect(parsed.id).toBe("bucket-publico");
    expect(parsed.track).toBe("cloud");
    expect(parsed.actors.map((actor) => actor.storage?.vector).sort()).toEqual(
      ["carga_imagen", "descarga_socio", "enlace_viejo", "escaneo"],
    );
  });
});
