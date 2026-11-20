import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR, getScenario } from "../scenarios";
import { defaultConfig } from "./config";
import { identityFacts } from "./identity";
import { isDocumentationIp } from "./ips";
import { parseScenario } from "./schema";
import { simulate } from "./simulate";
import type { Config, Scenario } from "./types";

const found = getScenario("portal-mfa");
if (!found) throw new Error("portal-mfa scenario is missing");
const scenario: Scenario = found;

const MFA = ["none", "sms", "push", "push_numero", "totp", "fido2"] as const;
const PASSWORDS = ["basica", "larga_y_filtradas"] as const;
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const OPTIMAL: Config = { mfa: "fido2", contrasenas: "larga_y_filtradas", bloqueo: false };

/** Every combination of the three controls: the search space the optimum must beat. */
const SEARCH_SPACE: Config[] = MFA.flatMap((mfa) =>
  PASSWORDS.flatMap((contrasenas) => [false, true].map((bloqueo) => ({ mfa, contrasenas, bloqueo }))),
);

const EMPLEADOS = "empleados";
const TIPEO = "empleado_tipeo";
const RELLENO = "relleno_credenciales";
const FATIGA = "fatiga_mfa";
const AITM = "phishing_aitm";

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

describe("identity facts", () => {
  const facts = (mfa: string, contrasenas = "basica") =>
    identityFacts({ mfa, contrasenas, bloqueo: false }, { vector: "inicio" });

  it("turns the MFA choice into yes/no questions", () => {
    expect(facts("none")).toMatchObject({
      mfa_activo: false,
      mfa_fatiga_resistente: false,
      mfa_resistente_phishing: false,
    });
    expect(facts("push")).toMatchObject({
      mfa_activo: true,
      mfa_fatiga_resistente: false,
      mfa_resistente_phishing: false,
    });
    for (const mfa of ["sms", "push_numero", "totp"]) {
      expect(facts(mfa)).toMatchObject({
        mfa_activo: true,
        mfa_fatiga_resistente: true,
        mfa_resistente_phishing: false,
      });
    }
    expect(facts("fido2")).toMatchObject({
      mfa_activo: true,
      mfa_fatiga_resistente: true,
      mfa_resistente_phishing: true,
    });
  });

  it("flags the strong password policy only for larga_y_filtradas", () => {
    expect(facts("none", "larga_y_filtradas").contrasena_fuerte).toBe(true);
    expect(facts("none", "basica").contrasena_fuerte).toBe(false);
  });

  it("passes the actor's vector through", () => {
    expect(identityFacts({ mfa: "none", contrasenas: "basica", bloqueo: false }, { vector: "aitm" }).vector).toBe(
      "aitm",
    );
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

describe("the employees", () => {
  it("always get in, whatever the configuration", () => {
    for (const config of SEARCH_SPACE) {
      for (const seed of [1, 2, 3]) {
        const events = eventsOf(config, EMPLEADOS, seed);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.outcome === "permitido")).toBe(true);
      }
    }
  });
});

describe("the employee who mistypes", () => {
  it("is never locked out when the lockout is off", () => {
    for (const mfa of MFA) {
      for (const seed of SEEDS) {
        const events = eventsOf(withConfig({ mfa, bloqueo: false }), TIPEO, seed);
        expect(events.every((e) => e.outcome === "permitido")).toBe(true);
      }
    }
  });

  it("is locked out with the lockout on, including the correct password typed afterwards", () => {
    let lockedValid = 0;
    for (const seed of SEEDS) {
      for (const event of eventsOf(withConfig({ bloqueo: true }), TIPEO, seed)) {
        expect(event.outcome).toBe("bloqueado");
        expect(event.explanationKey).toBe("tipeo_bloqueado");
        if (event.credential === "valida") lockedValid++;
      }
    }
    // Locked valid attempts are what makes the lockout cost operations in the score.
    expect(lockedValid).toBeGreaterThan(0);
  });

  it("gets in every time with the lockout off", () => {
    for (const seed of SEEDS) {
      for (const event of eventsOf(withConfig({ bloqueo: false }), TIPEO, seed)) {
        if (event.credential === "valida") expect(event.outcome).toBe("permitido");
      }
    }
  });
});

describe("credential stuffing with leaked passwords", () => {
  it("is blocked by any MFA", () => {
    for (const mfa of MFA.filter((m) => m !== "none")) {
      for (const seed of SEEDS) {
        const events = eventsOf(withConfig({ mfa, contrasenas: "basica", bloqueo: false }), RELLENO, seed);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.outcome === "bloqueado")).toBe(true);
      }
    }
  });

  it("is blocked by the breached-password check when there is no MFA", () => {
    for (const bloqueo of [false, true]) {
      for (const seed of SEEDS) {
        const config = withConfig({ mfa: "none", contrasenas: "larga_y_filtradas", bloqueo });
        const events = eventsOf(config, RELLENO, seed);
        expect(events.every((e) => e.outcome === "bloqueado")).toBe(true);
      }
    }
  });

  it("is detected, not stopped, when only the lockout is on", () => {
    for (const seed of SEEDS) {
      const config = withConfig({ mfa: "none", contrasenas: "basica", bloqueo: true });
      const events = eventsOf(config, RELLENO, seed);
      expect(events.every((e) => e.outcome === "detectado")).toBe(true);
      expect(events.every((e) => e.explanationKey === "relleno_alerta_bloqueo")).toBe(true);
      expect(attackerStatus(config, RELLENO, seed)).toBe("detectado");
    }
  });

  it("gets in unnoticed with no MFA, a basic password policy and no lockout", () => {
    for (const seed of SEEDS) {
      const config = withConfig({ mfa: "none", contrasenas: "basica", bloqueo: false });
      const events = eventsOf(config, RELLENO, seed);
      expect(events.every((e) => e.outcome === "no_detectado")).toBe(true);
      expect(attackerStatus(config, RELLENO, seed)).toBe("comprometido");
    }
  });
});

describe("MFA fatigue with a valid password", () => {
  it("gets in unnoticed with no MFA or with push without number matching", () => {
    for (const mfa of ["none", "push"]) {
      for (const seed of SEEDS) {
        const events = eventsOf(withConfig({ mfa }), FATIGA, seed);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.outcome === "no_detectado")).toBe(true);
      }
    }
  });

  it("is blocked by push with number matching, SMS, TOTP and FIDO2", () => {
    for (const mfa of ["push_numero", "sms", "totp", "fido2"]) {
      for (const seed of SEEDS) {
        const events = eventsOf(withConfig({ mfa }), FATIGA, seed);
        expect(events.every((e) => e.outcome === "bloqueado")).toBe(true);
        expect(events.every((e) => e.explanationKey === "fatiga_bloqueada")).toBe(true);
      }
    }
  });
});

describe("AiTM phishing proxy that relays the code", () => {
  it("is blocked only by FIDO2, because the key is bound to the real origin", () => {
    for (const mfa of MFA) {
      for (const seed of SEEDS) {
        const events = eventsOf(withConfig({ mfa }), AITM, seed);
        const expected = mfa === "fido2" ? "bloqueado" : "no_detectado";
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.outcome === expected)).toBe(true);
      }
    }
  });
});

describe("optimal configuration", () => {
  it("is FIDO2, the breached-password check and the lockout off", () => {
    expect(scenario.optimal).toEqual(OPTIMAL);
  });

  it("stops every attacker and keeps every legitimate login", () => {
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

  it("beats every push configuration on every seed", () => {
    const push = SEARCH_SPACE.filter((config) => config.mfa === "push");
    for (let seed = 1; seed <= 20; seed++) {
      expect(simulate(scenario, scenario.optimal, seed).score.total).toBeGreaterThan(
        bestTotal(push, seed),
      );
    }
  });

  it("beats every TOTP configuration on every seed", () => {
    const totp = SEARCH_SPACE.filter((config) => config.mfa === "totp");
    for (let seed = 1; seed <= 20; seed++) {
      expect(simulate(scenario, scenario.optimal, seed).score.total).toBeGreaterThan(
        bestTotal(totp, seed),
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
  const raw: unknown = parse(readFileSync(path.join(CONTENT_DIR, "portal-mfa.yaml"), "utf8"));

  it("accepts the scenario file with one identity vector per actor", () => {
    const parsed = parseScenario(raw);
    expect(parsed.id).toBe("portal-mfa");
    expect(parsed.track).toBe("identidad");
    expect(parsed.actors.map((actor) => actor.identity?.vector).sort()).toEqual(
      ["aitm", "fatiga", "inicio", "relleno", "tipeo"],
    );
  });
});
