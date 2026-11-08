import { describe, expect, it } from "vitest";
import { getScenario } from "../scenarios";
import { compareWithOptimal } from "./compare";
import { defaultConfig } from "./config";
import { isDocumentationIp } from "./ips";
import { simulate } from "./simulate";
import { summarizeEvents } from "./summary";
import type { Config, Scenario } from "./types";

const scenario = getScenario("ssh-expuesto");
if (!scenario) throw new Error("ssh-expuesto scenario is missing");

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const defaults = defaultConfig(scenario);
const withConfig = (overrides: Config): Config => ({ ...defaults, ...overrides });

const keyOnly = withConfig({ password_auth: false, key_auth: true });

function attackerEvents(config: Config, seed: number) {
  return simulate(scenario!, config, seed).events.filter((e) => e.role === "atacante");
}

describe("determinism", () => {
  it("returns identical results for the same scenario, config and seed", () => {
    const config = withConfig({ fail2ban_maxretry: 3, mfa: true });
    expect(simulate(scenario, config, 42)).toEqual(simulate(scenario, config, 42));
  });

  it("changes the timeline when the seed changes", () => {
    const a = simulate(scenario, defaults, 1).events.map((e) => [e.t, e.ip]);
    const b = simulate(scenario, defaults, 2).events.map((e) => [e.t, e.ip]);
    expect(a).not.toEqual(b);
  });

  it("builds the same timeline whatever the configuration", () => {
    const shape = (config: Config) =>
      simulate(scenario, config, 9).events.map((e) => [
        e.t,
        e.actorId,
        e.ip,
        e.user,
        e.credential,
      ]);
    expect(shape(defaults)).toEqual(shape(keyOnly));
    expect(shape(defaults)).toEqual(shape(withConfig({ solo_vpn: true, mfa: true })));
  });

  it("orders events by time and numbers them in sequence", () => {
    const { events } = simulate(scenario, defaults, 3);
    events.forEach((event, i) => expect(event.index).toBe(i));
    for (let i = 1; i < events.length; i++) {
      expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
    }
  });

  it("only ever uses documentation IP addresses, never shared between roles", () => {
    for (const seed of SEEDS) {
      const { events } = simulate(scenario, defaults, seed);
      for (const event of events) expect(isDocumentationIp(event.ip)).toBe(true);
      const legitIps = new Set(events.filter((e) => e.role === "legitimo").map((e) => e.ip));
      const attackIps = events.filter((e) => e.role === "atacante").map((e) => e.ip);
      for (const ip of attackIps) expect(legitIps.has(ip)).toBe(false);
    }
  });

  it("gives the botnet hundreds of distinct addresses", () => {
    const { events } = simulate(scenario, defaults, 5);
    const botnetIps = new Set(events.filter((e) => e.actorId === "botnet").map((e) => e.ip));
    expect(botnetIps.size).toBe(150);
  });
});

describe("the lesson: disabling passwords", () => {
  it("lets the leaked credential in with the default configuration", () => {
    for (const seed of SEEDS) {
      const { score, events } = simulate(scenario, defaults, seed);
      const leaked = score.attackers.find((a) => a.actorId === "credencial_filtrada");
      expect(leaked?.status).toBe("comprometido");
      expect(
        events.filter((e) => e.actorId === "credencial_filtrada" && e.outcome === "no_detectado"),
      ).toHaveLength(3);
    }
  });

  it("stops both the botnet and the leaked credential on every seed", () => {
    for (const seed of SEEDS) {
      const events = attackerEvents(keyOnly, seed);
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.outcome === "bloqueado")).toBe(true);

      const { score } = simulate(scenario, keyOnly, seed);
      expect(score.security).toBe(100);
      expect(score.operations).toBe(100);
      expect(score.attackers.every((a) => a.status === "detenido")).toBe(true);
    }
  });

  it("explains the refusal with the right reason", () => {
    const events = attackerEvents(keyOnly, 4).filter((e) => e.actorId === "credencial_filtrada");
    expect(events.every((e) => e.explanationKey === "password_auth_off")).toBe(true);
  });
});

describe("other controls", () => {
  it("MFA turns a leaked password into a refusal without hurting legitimate users", () => {
    const { score, events } = simulate(scenario, withConfig({ mfa: true }), 6);
    const leaked = events.filter((e) => e.actorId === "credencial_filtrada");
    expect(leaked.every((e) => e.explanationKey === "mfa_requerido")).toBe(true);
    expect(score.operations).toBe(100);
  });

  it("VPN-only blocks every attacker at the network layer", () => {
    const events = attackerEvents(withConfig({ solo_vpn: true }), 6);
    expect(events.every((e) => e.explanationKey === "vpn_requerida")).toBe(true);
  });

  it("alerts turn an unnoticed breach into a detected one", () => {
    const { score } = simulate(scenario, withConfig({ alertas_login: true }), 6);
    const leaked = score.attackers.find((a) => a.actorId === "credencial_filtrada");
    expect(leaked?.status).toBe("detectado");
  });

  it("AllowUsers and no root login stop the botnet's root guesses", () => {
    for (const seed of SEEDS) {
      const hardened = withConfig({ permit_root_login: false, allow_users: true });
      const botnet = attackerEvents(hardened, seed).filter((e) => e.actorId === "botnet");
      expect(botnet.every((e) => e.outcome === "bloqueado")).toBe(true);
    }
  });

  it("fail2ban bans botnet addresses and drops their later attempts", () => {
    const { events } = simulate(scenario, withConfig({ fail2ban_maxretry: 3 }), 8);
    const botnet = events.filter((e) => e.actorId === "botnet");
    expect(botnet.some((e) => e.banned)).toBe(true);
    expect(botnet.some((e) => e.explanationKey === "ip_baneada")).toBe(true);

    const off = simulate(scenario, defaults, 8).events.filter((e) => e.actorId === "botnet");
    expect(off.some((e) => e.explanationKey === "ip_baneada")).toBe(false);
  });

  describe("ban expiry", () => {
    // One attacker, one fixed IP, 40 wrong guesses spread over the hour.
    const lone: Scenario = {
      ...scenario,
      actors: [
        {
          id: "solo",
          name: "Atacante solitario",
          description: "Una sola dirección que falla una y otra vez.",
          role: "atacante",
          methods: ["login_password"],
          users: ["root"],
          credential: { kind: "guessed", successProbability: 0 },
          ips: { kind: "fixed", address: "203.0.113.99" },
          behavior: { kind: "drip", attempts: 40 },
          viaVpn: false,
          hasSecondFactor: false,
        },
      ],
    };
    const keys = (config: Config) =>
      new Set(simulate(lone, config, 3).events.map((e) => e.explanationKey));

    it("lets the address back in once a short ban expires", () => {
      const seen = keys(withConfig({ fail2ban_maxretry: 1, fail2ban_bantime: 1 }));
      expect(seen.has("ip_baneada")).toBe(true);
      expect(seen.has("credencial_invalida")).toBe(true);
      const banEvents = simulate(lone, withConfig({ fail2ban_maxretry: 1, fail2ban_bantime: 1 }), 3)
        .events.filter((e) => e.banned);
      expect(banEvents.length).toBeGreaterThan(1);
    });

    it("keeps the address out for the whole window when the ban is long", () => {
      const { events } = simulate(lone, withConfig({ fail2ban_maxretry: 1, fail2ban_bantime: 1440 }), 3);
      expect(events.filter((e) => e.banned)).toHaveLength(1);
      expect(events.slice(1).every((e) => e.explanationKey === "ip_baneada")).toBe(true);
    });
  });
});

describe("the lesson: an aggressive fail2ban locks out the traveling admin", () => {
  const aggressive = withConfig({
    password_auth: false,
    key_auth: true,
    fail2ban_maxretry: 1,
    fail2ban_bantime: 1440,
  });
  const lenient = withConfig({
    password_auth: false,
    key_auth: true,
    fail2ban_maxretry: 5,
    fail2ban_bantime: 10,
  });

  it("blocks the traveler's valid attempts because of the ban", () => {
    for (const seed of SEEDS) {
      const { events, score } = simulate(scenario, aggressive, seed);
      const lockedOut = events.filter(
        (e) =>
          e.actorId === "admin_viajero" &&
          e.credential === "valida" &&
          e.outcome === "bloqueado" &&
          e.explanationKey === "ip_baneada",
      );
      expect(lockedOut.length).toBeGreaterThan(0);
      expect(score.operations).toBeLessThan(100);
    }
  });

  it("leaves the traveler alone when the limit is reasonable", () => {
    for (const seed of SEEDS) {
      const { score } = simulate(scenario, lenient, seed);
      expect(score.operations).toBe(100);
    }
  });
});

describe("scoring", () => {
  it("blocking everything never wins: it kills operations", () => {
    const blockAll = withConfig({ password_auth: false, key_auth: false });
    for (const seed of SEEDS) {
      const blocked = simulate(scenario, blockAll, seed).score;
      const best = simulate(scenario, scenario.optimal, seed).score;
      expect(blocked.security).toBe(100);
      expect(blocked.operations).toBe(0);
      expect(best.total).toBeGreaterThan(blocked.total);
    }
  });

  it("the declared optimal configuration beats the defaults", () => {
    for (const seed of SEEDS) {
      const optimal = simulate(scenario, scenario.optimal, seed).score;
      const initial = simulate(scenario, defaults, seed).score;
      expect(optimal.total).toBeGreaterThan(initial.total);
    }
  });

  it("the declared optimal configuration is the best one in the whole search space", () => {
    const toggles = [
      "permit_root_login",
      "password_auth",
      "key_auth",
      "allow_users",
      "mfa",
      "solo_vpn",
      "alertas_login",
    ];
    const lockouts: Config[] = [{ fail2ban_maxretry: 0, fail2ban_bantime: 10 }];
    for (const maxretry of [1, 3, 10]) {
      for (const bantime of [1, 10, 1440]) {
        lockouts.push({ fail2ban_maxretry: maxretry, fail2ban_bantime: bantime });
      }
    }

    for (const seed of [42, 7]) {
      const optimalTotal = simulate(scenario, scenario.optimal, seed).score.total;
      let best = -1;
      for (let mask = 0; mask < 1 << toggles.length; mask++) {
        const switches: Config = {};
        toggles.forEach((id, i) => (switches[id] = (mask & (1 << i)) !== 0));
        for (const lockout of lockouts) {
          const total = simulate(scenario, { ...switches, ...lockout }, seed).score.total;
          best = Math.max(best, total);
        }
      }
      expect(optimalTotal).toBeGreaterThanOrEqual(best);
    }
  }, 60_000);

  it("keeps every axis between 0 and 100", () => {
    for (const seed of SEEDS) {
      const { score } = simulate(scenario, withConfig({ fail2ban_maxretry: 2 }), seed);
      for (const value of [score.security, score.operations, score.cost, score.total]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("normalizes out-of-range and unknown config values", () => {
    const result = simulate(scenario, { fail2ban_maxretry: 999, nope: true }, 1);
    expect(result.config.fail2ban_maxretry).toBe(20);
    expect("nope" in result.config).toBe(false);
  });
});

describe("compareWithOptimal", () => {
  it("reports no gap and no differences for the optimal configuration", () => {
    const comparison = compareWithOptimal(scenario, scenario.optimal, 11);
    expect(comparison.gap).toBe(0);
    expect(comparison.differences).toEqual([]);
  });

  it("lists exactly the controls that differ", () => {
    const comparison = compareWithOptimal(scenario, defaults, 11);
    const ids = comparison.differences.map((d) => d.controlId);
    expect(ids).toEqual(
      expect.arrayContaining(["permit_root_login", "password_auth", "key_auth", "allow_users"]),
    );
    expect(ids).not.toContain("mfa");
    expect(comparison.gap).toBeGreaterThan(0);
  });
});

describe("summarizeEvents", () => {
  it("folds attacker events into a few rows but keeps legitimate ones separate", () => {
    const { events } = simulate(scenario, defaults, 2);
    const rows = summarizeEvents(events);
    expect(rows.length).toBeLessThan(events.length / 4);

    const legitRows = rows.filter((r) => r.role === "legitimo");
    expect(legitRows).toHaveLength(events.filter((e) => e.role === "legitimo").length);
    expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(events.length);
  });
});
