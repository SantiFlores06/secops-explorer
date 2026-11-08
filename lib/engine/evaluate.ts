import type {
  Actor,
  Attempt,
  AuthAction,
  Config,
  FactValue,
  Rule,
  Scenario,
  SimEvent,
} from "./types";

interface LockoutState {
  /** Failure timestamps per IP, pruned to the lockout window. */
  failures: Map<string, number[]>;
  /** Ban expiry (in seconds) per IP. */
  bannedUntil: Map<string, number>;
}

/**
 * Stage 2: walks the timeline in order, carrying lockout state.
 *
 * This is a fold rather than a per-attempt map on purpose: whether an attempt
 * is refused by fail2ban depends on the failures that came before it.
 */
export function evaluateTimeline(
  scenario: Scenario,
  config: Config,
  attempts: Attempt[],
): SimEvent[] {
  const actorsById = new Map(scenario.actors.map((actor) => [actor.id, actor]));
  const state: LockoutState = { failures: new Map(), bannedUntil: new Map() };
  const events: SimEvent[] = [];

  for (const attempt of attempts) {
    const actor = actorsById.get(attempt.actorId);
    if (!actor) throw new Error(`Unknown actor "${attempt.actorId}"`);

    const action = chooseAction(scenario, config, attempt.methods);
    const facts = buildFacts(scenario, config, state, actor, attempt, action);
    const rule = scenario.rules.find((candidate) => matches(candidate, facts));
    if (!rule) {
      throw new Error(`No rule matched an attempt by "${attempt.actorId}"`);
    }

    const banned = rule.countsAsFailure
      ? registerFailure(scenario, config, state, attempt)
      : false;

    events.push({
      index: events.length,
      t: attempt.t,
      actorId: actor.id,
      actorName: actor.name,
      role: actor.role,
      action,
      user: attempt.user,
      ip: attempt.ip,
      credential: attempt.credential,
      outcome: rule.outcome,
      explanationKey: rule.explanationKey,
      banned,
    });
  }

  return events;
}

/** People adapt: they use the first method the server currently accepts. */
function chooseAction(
  scenario: Scenario,
  config: Config,
  methods: AuthAction[],
): AuthAction {
  const accepted = methods.find((method) => {
    const control = scenario.acceptedMethods[method];
    return control === undefined || config[control] === true;
  });
  return accepted ?? methods[0];
}

function buildFacts(
  scenario: Scenario,
  config: Config,
  state: LockoutState,
  actor: Actor,
  attempt: Attempt,
  action: AuthAction,
): Record<string, FactValue> {
  const bannedUntil = state.bannedUntil.get(attempt.ip);
  return {
    ...config,
    accion: action,
    usuario: attempt.user,
    actor: actor.id,
    rol: actor.role,
    credencial: attempt.credential,
    via_vpn: attempt.viaVpn,
    segundo_factor: attempt.hasSecondFactor,
    usuario_existe: scenario.existingUsers.includes(attempt.user),
    usuario_permitido: scenario.allowedUsers.includes(attempt.user),
    ip_baneada: bannedUntil !== undefined && bannedUntil > attempt.t,
  };
}

function matches(rule: Rule, facts: Record<string, FactValue>): boolean {
  return Object.entries(rule.when).every(([key, expected]) => facts[key] === expected);
}

/** Records one authentication failure and bans the IP when the limit is hit. */
function registerFailure(
  scenario: Scenario,
  config: Config,
  state: LockoutState,
  attempt: Attempt,
): boolean {
  const lockout = scenario.failureLockout;
  if (!lockout) return false;

  const maxAttempts = Number(config[lockout.maxAttemptsControl]);
  if (!(maxAttempts > 0)) return false;

  const recent = (state.failures.get(attempt.ip) ?? []).filter(
    (t) => t > attempt.t - lockout.windowSeconds,
  );
  recent.push(attempt.t);
  state.failures.set(attempt.ip, recent);

  if (recent.length < maxAttempts) return false;

  const banMinutes = Number(config[lockout.banMinutesControl]);
  state.bannedUntil.set(attempt.ip, attempt.t + banMinutes * 60);
  state.failures.set(attempt.ip, []);
  return true;
}
