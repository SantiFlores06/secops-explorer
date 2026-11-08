import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../scenarios";
import { parseScenario, ScenarioValidationError } from "./schema";

const raw: unknown = parse(readFileSync(path.join(CONTENT_DIR, "ssh-expuesto.yaml"), "utf8"));

// Mutations poke at arbitrary nested paths of a parsed YAML document, so the
// draft is deliberately untyped: the schema under test is what validates it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = Record<string, any>;

/** Deep-copies the valid scenario, applies a mutation and expects a rejection. */
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

describe("parseScenario", () => {
  it("accepts the SSH scenario and maps it to English-named fields", () => {
    const scenario = parseScenario(raw);
    expect(scenario.id).toBe("ssh-expuesto");
    expect(scenario.controls.length).toBeGreaterThan(5);
    expect(scenario.actors.map((a) => a.id)).toContain("botnet");
    expect(scenario.rules.at(-1)?.when).toEqual({});
    expect(scenario.failureLockout?.windowSeconds).toBe(600);
  });

  it("rejects unknown keys (typos in a scenario file)", () => {
    expectRejected((d) => (d.titulo_extra = "x"), "Unrecognized key");
  });

  it("rejects a rule that mentions an unknown fact or control", () => {
    expectRejected((d) => (d.evaluacion[0].si = { control_que_no_existe: true }), "condición desconocida");
  });

  it("rejects a rule whose explanation does not exist", () => {
    expectRejected((d) => (d.evaluacion[0].explicacion = "no_existe"), "explicación inexistente");
  });

  it("requires the last rule to be a catch-all", () => {
    expectRejected((d) => (d.evaluacion[d.evaluacion.length - 1].si = { rol: "atacante" }), "caso general");
  });

  it("rejects IP addresses outside the documentation ranges", () => {
    expectRejected((d) => (d.actores[0].ips = { tipo: "fija", valor: "8.8.8.8" }), "RFC 5737");
    expectRejected(
      (d) => (d.actores[3].ips = { tipo: "variable", cantidad: 5, rangos: ["10.0.0.0/24"] }),
      "RFC 5737",
    );
  });

  it("rejects weights that do not add up to 1", () => {
    expectRejected((d) => (d.pesos.costo = 0.5), "sumar 1");
  });

  it("rejects duplicated control ids", () => {
    expectRejected((d) => (d.controles[1].id = d.controles[0].id), "control repetido");
  });

  it("rejects an optimal configuration that misses a control or leaves its range", () => {
    expectRejected((d) => delete d.optimo.mfa, "falta el control en el óptimo");
    expectRejected((d) => (d.optimo.fail2ban_maxretry = 99), "dentro del rango");
    expectRejected((d) => (d.optimo.password_auth = 1), "true o false");
  });

  it("rejects mechanisms wired to the wrong kind of control", () => {
    expectRejected((d) => (d.metodos_aceptados.login_clave = "fail2ban_maxretry"), "toggle inexistente");
    expectRejected((d) => (d.bloqueo_por_fallos.max_intentos = "mfa"), "control numérico");
  });

  it("requires a success probability for guessed credentials", () => {
    expectRejected((d) => delete d.actores[3].prob_exito, "prob_exito");
  });

  it("rejects legitimate actors that use users who do not exist", () => {
    expectRejected((d) => (d.actores[0].usuarios = ["fantasma"]), "no existe");
  });

  it("rejects fixed IPs shared by two actors", () => {
    expectRejected((d) => (d.actores[1].ips = structuredClone(d.actores[0].ips)), "IP fija repetida");
  });
});
