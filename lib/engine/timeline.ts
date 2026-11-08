import { hostsOfRange } from "./ips";
import { createRng, deriveSeed, type Rng } from "./rng";
import type { Actor, Attempt, Credential, Scenario } from "./types";

/**
 * Stage 1: turns the scenario's actors into an ordered list of attempts.
 *
 * The timeline depends only on the scenario and the seed, never on the
 * player's configuration. That is what makes two configurations comparable:
 * the same attackers show up at the same moments in both runs.
 */
export function buildTimeline(scenario: Scenario, seed: number): Attempt[] {
  const usedIps = new Set<string>();
  for (const actor of scenario.actors) {
    if (actor.ips.kind === "fixed") usedIps.add(actor.ips.address);
  }

  const drafts: Omit<Attempt, "seq">[] = [];
  for (const actor of scenario.actors) {
    const rng = createRng(deriveSeed(seed, actor.id));
    const ips = resolveIps(actor, rng, usedIps);
    drafts.push(...actorAttempts(actor, ips, rng, scenario.durationSeconds));
  }

  return drafts
    .map((draft, order) => ({ draft, order }))
    .sort((a, b) => a.draft.t - b.draft.t || a.order - b.order)
    .map(({ draft }, seq) => ({ ...draft, seq }));
}

function resolveIps(actor: Actor, rng: Rng, usedIps: Set<string>): string[] {
  if (actor.ips.kind === "fixed") return [actor.ips.address];

  const candidates = actor.ips.ranges
    .flatMap(hostsOfRange)
    .filter((ip) => !usedIps.has(ip));
  if (candidates.length < actor.ips.count) {
    throw new Error(
      `Actor "${actor.id}" needs ${actor.ips.count} IPs but only ${candidates.length} are free`,
    );
  }
  const picked = rng.shuffle(candidates).slice(0, actor.ips.count);
  for (const ip of picked) usedIps.add(ip);
  return picked;
}

function attackerCredential(actor: Actor, rng: Rng): Credential {
  if (actor.credential.kind === "valid") return "valida";
  return rng.chance(actor.credential.successProbability) ? "valida" : "invalida";
}

function actorAttempts(
  actor: Actor,
  ips: string[],
  rng: Rng,
  duration: number,
): Omit<Attempt, "seq">[] {
  const base = {
    actorId: actor.id,
    methods: actor.methods,
    viaVpn: actor.viaVpn,
    hasSecondFactor: actor.hasSecondFactor,
  };
  const attempts: Omit<Attempt, "seq">[] = [];
  const { behavior } = actor;

  if (behavior.kind === "sessions") {
    const starts = Array.from({ length: behavior.sessions }, () =>
      rng.int(30, Math.max(31, duration - 180)),
    ).sort((a, b) => a - b);
    starts.forEach((start, session) => {
      const ip = ips[session % ips.length];
      const [minFailures, maxFailures] = behavior.failuresPerSession;
      const failures = rng.int(minFailures, maxFailures);
      let t = start;
      for (let i = 0; i < failures; i++) {
        attempts.push({ ...base, t, ip, user: rng.pick(actor.users), credential: "invalida" });
        t += rng.int(5, 12);
      }
      attempts.push({ ...base, t, ip, user: rng.pick(actor.users), credential: "valida" });
    });
  } else if (behavior.kind === "bursts") {
    for (const ip of ips) {
      let t = rng.int(0, Math.max(1, duration - 90));
      const count = rng.int(...behavior.attemptsPerIp);
      for (let i = 0; i < count; i++) {
        attempts.push({
          ...base,
          t,
          ip,
          user: rng.pick(actor.users),
          credential: attackerCredential(actor, rng),
        });
        t += rng.int(2, 6);
      }
    }
  } else {
    const times = Array.from({ length: behavior.attempts }, () =>
      rng.int(0, duration),
    ).sort((a, b) => a - b);
    for (const t of times) {
      attempts.push({
        ...base,
        t,
        ip: ips[0],
        user: rng.pick(actor.users),
        credential: attackerCredential(actor, rng),
      });
    }
  }

  return attempts;
}
