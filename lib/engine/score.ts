import type {
  AttackerSummary,
  Config,
  LegitSummary,
  Scenario,
  Score,
  SimEvent,
} from "./types";

const DETECTED_CREDIT = 50;

function costUnits(scenario: Scenario, config: Config): number {
  let total = 0;
  for (const control of scenario.controls) {
    const value = config[control.id];
    const active = control.kind === "toggle" ? value === true : Number(value) > 0;
    if (active) total += control.cost;
  }
  return total;
}

function maxCostUnits(scenario: Scenario): number {
  return scenario.controls.reduce((sum, control) => sum + control.cost, 0);
}

function summarizeAttackers(scenario: Scenario, events: SimEvent[]): AttackerSummary[] {
  return scenario.actors
    .filter((actor) => actor.role === "atacante")
    .map((actor) => {
      const own = events.filter((event) => event.actorId === actor.id);
      const undetected = own.filter((event) => event.outcome === "no_detectado");
      const detected = own.filter((event) => event.outcome === "detectado");
      const status =
        undetected.length > 0
          ? "comprometido"
          : detected.length > 0
            ? "detectado"
            : "detenido";
      return {
        actorId: actor.id,
        name: actor.name,
        status,
        attempts: own.length,
        breaches: undetected.length + detected.length,
      };
    });
}

function summarizeLegit(scenario: Scenario, events: SimEvent[]): LegitSummary[] {
  return scenario.actors
    .filter((actor) => actor.role === "legitimo")
    .map((actor) => {
      const valid = events.filter(
        (event) => event.actorId === actor.id && event.credential === "valida",
      );
      return {
        actorId: actor.id,
        name: actor.name,
        validAttempts: valid.length,
        permitted: valid.filter((event) => event.outcome === "permitido").length,
      };
    });
}

/**
 * Stage 3: three axes from 0 to 100.
 *
 * - Security: per attacker, 100 if stopped, 50 if it got in but was noticed,
 *   0 if it got in unnoticed; averaged over attackers.
 * - Operations: share of valid legitimate attempts that were allowed.
 * - Cost: how much of the maximum maintenance burden you avoided.
 */
export function computeScore(
  scenario: Scenario,
  config: Config,
  events: SimEvent[],
): Score {
  const attackers = summarizeAttackers(scenario, events);
  const legit = summarizeLegit(scenario, events);

  const attackerPoints: number[] = attackers.map((attacker) =>
    attacker.status === "detenido"
      ? 100
      : attacker.status === "detectado"
        ? DETECTED_CREDIT
        : 0,
  );
  const security = attackerPoints.length
    ? attackerPoints.reduce((a, b) => a + b, 0) / attackerPoints.length
    : 100;

  const validAttempts = legit.reduce((sum, actor) => sum + actor.validAttempts, 0);
  const permitted = legit.reduce((sum, actor) => sum + actor.permitted, 0);
  const operations = validAttempts ? (permitted / validAttempts) * 100 : 100;

  const spent = costUnits(scenario, config);
  const maxCost = maxCostUnits(scenario);
  const cost = maxCost ? (1 - spent / maxCost) * 100 : 100;

  const { weights } = scenario;
  const total =
    security * weights.security + operations * weights.operations + cost * weights.cost;

  return {
    security: Math.round(security),
    operations: Math.round(operations),
    cost: Math.round(cost),
    total: Math.round(total),
    attackers,
    legit,
    costUnits: spent,
    maxCostUnits: maxCost,
  };
}
