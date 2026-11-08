import type { Comparison } from "@/lib/engine/compare";
import { formatClock, summarizeEvents, type TimelineRow } from "@/lib/engine/summary";
import type { ControlValue, Scenario } from "@/lib/engine/types";
import {
  ACTION_LABEL,
  ATTACKER_STATUS_LABEL,
  OUTCOME_LABEL,
  ROLE_LABEL,
  VALENCE_STYLE,
  attackerValence,
  valenceOf,
} from "./labels";

interface ResultsViewProps {
  scenario: Scenario;
  comparison: Comparison;
}

export default function ResultsView({ scenario, comparison }: ResultsViewProps) {
  const rows = summarizeEvents(comparison.yours.events);

  return (
    <div className="flex flex-col gap-6">
      <ScoreSection comparison={comparison} />
      <ComparisonSection scenario={scenario} comparison={comparison} />
      <TimelineSection scenario={scenario} rows={rows} />
    </div>
  );
}

function ScoreSection({ comparison }: { comparison: Comparison }) {
  const { score } = comparison.yours;
  return (
    <section aria-labelledby="resultado" className="card">
      <h2 id="resultado" className="text-xl font-semibold">
        Resultado
      </h2>
      <p className="mt-2">
        <span className="text-5xl font-semibold tabular-nums">{score.total}</span>
        <span className="text-zinc-600 dark:text-zinc-400"> / 100 puntos</span>
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <ScoreBar
          label="Seguridad"
          value={score.security}
          hint="Atacantes detenidos (100), detectados (50) o sin detectar (0)."
        />
        <ScoreBar
          label="Operatividad"
          value={score.operations}
          hint="Accesos legítimos que pudieron entrar."
        />
        <ScoreBar
          label="Costo operativo"
          value={score.cost}
          hint={`Usas ${score.costUnits} de ${score.maxCostUnits} unidades de mantenimiento.`}
        />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="font-semibold">Atacantes</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {score.attackers.map((attacker) => {
              const style = VALENCE_STYLE[attackerValence(attacker.status)];
              return (
                <li key={attacker.actorId} className="text-sm">
                  <span className="font-medium">{attacker.name}</span>
                  <span className={`ml-2 rounded px-2 py-0.5 text-xs font-medium ${style.badge}`}>
                    <span className="sr-only">{style.meaning}: </span>
                    {ATTACKER_STATUS_LABEL[attacker.status]}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold">Equipo legítimo</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {score.legit.map((person) => {
              const allIn = person.permitted === person.validAttempts;
              const style = VALENCE_STYLE[allIn ? "good" : "bad"];
              return (
                <li key={person.actorId} className="text-sm">
                  <span className="font-medium">{person.name}</span>
                  <span className={`ml-2 rounded px-2 py-0.5 text-xs font-medium ${style.badge}`}>
                    <span className="sr-only">{style.meaning}: </span>
                    Pudo entrar {person.permitted} de {person.validAttempts} veces
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ScoreBar({ label, value, hint }: { label: string; value: number; hint: string }) {
  const id = `barra-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span id={id} className="font-medium">
          {label}
        </span>
        <span className="font-mono tabular-nums">{value}/100</span>
      </div>
      <div
        role="meter"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      >
        <div
          className="h-full rounded-full bg-sky-700 dark:bg-sky-500"
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{hint}</p>
    </div>
  );
}

function formatValue(scenario: Scenario, controlId: string, value: ControlValue): string {
  const control = scenario.controls.find((item) => item.id === controlId);
  if (control?.kind === "number") {
    if (value === 0 && control.id.endsWith("maxretry")) return "0 (apagado)";
    return control.unit ? `${value} ${control.unit}` : String(value);
  }
  return value ? "activado" : "desactivado";
}

function ComparisonSection({ scenario, comparison }: ResultsViewProps) {
  const { yours, optimal, differences, gap } = comparison;
  return (
    <section aria-labelledby="comparacion" className="card">
      <h2 id="comparacion" className="text-xl font-semibold">
        Tu configuración frente a la recomendada
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-4 sm:max-w-md">
        <div>
          <dt className="text-sm text-zinc-600 dark:text-zinc-400">Tu puntaje</dt>
          <dd className="text-2xl font-semibold tabular-nums">{yours.score.total}</dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-600 dark:text-zinc-400">Configuración recomendada</dt>
          <dd className="text-2xl font-semibold tabular-nums">{optimal.score.total}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm leading-6">
        {gap === 0
          ? "Igualas el puntaje de la configuración recomendada, con la misma semilla."
          : `Te faltan ${gap} ${gap === 1 ? "punto" : "puntos"} para igualar a la configuración recomendada, con la misma semilla.`}
      </p>
      {differences.length > 0 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer py-3 font-medium text-sky-700 dark:text-sky-400">
            Ver qué cambia la configuración recomendada
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {differences.map((difference) => (
              <li key={difference.controlId}>
                <span className="font-medium">{difference.label}:</span> tú{" "}
                {formatValue(scenario, difference.controlId, difference.yours)}, recomendada{" "}
                {formatValue(scenario, difference.controlId, difference.optimal)}.
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function clockLabel(row: TimelineRow): string {
  return row.tStart === row.tEnd
    ? formatClock(row.tStart)
    : `${formatClock(row.tStart)}–${formatClock(row.tEnd)}`;
}

function describeRow(row: TimelineRow): string {
  const method = ACTION_LABEL[row.action];
  const entered = row.outcome !== "bloqueado";
  let text: string;

  if (row.count === 1) {
    const user = row.user ? ` como «${row.user}»` : "";
    text = `${entered ? "Entró" : "Intentó entrar"} con ${method}${user} desde ${row.ip}.`;
  } else {
    const noun = entered ? "accesos" : "intentos";
    const origin =
      row.ipCount === 1 ? `desde ${row.ip}` : `desde ${row.ipCount} direcciones distintas`;
    text = `${row.count} ${noun} con ${method} ${origin}.`;
  }

  if (row.bans > 0) {
    text += ` fail2ban bloqueó ${row.bans} ${row.bans === 1 ? "dirección" : "direcciones"}.`;
  }
  return text;
}

function TimelineSection({ scenario, rows }: { scenario: Scenario; rows: TimelineRow[] }) {
  return (
    <section aria-labelledby="linea-de-tiempo">
      <h2 id="linea-de-tiempo" className="text-xl font-semibold">
        Qué pasó, minuto a minuto
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        La actividad de los atacantes se agrupa por resultado y motivo; la del equipo legítimo
        aparece evento por evento.
      </p>
      <ol className="mt-4 flex flex-col gap-3">
        {rows.map((row, index) => {
          const explanation = scenario.explanations[row.explanationKey];
          const style = VALENCE_STYLE[valenceOf(row.role, row.outcome, row.credential)];
          return (
            <li
              key={row.key}
              className={`fx-enter card border-l-4 ${style.border}`}
              style={{ "--i": Math.min(index, 20) } as React.CSSProperties}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                  <span className="sr-only">Minuto </span>
                  {clockLabel(row)}
                </span>
                <span className="font-semibold">{row.actorName}</span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {ROLE_LABEL[row.role]}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${style.badge}`}>
                  <span className="sr-only">{style.meaning}: </span>
                  {OUTCOME_LABEL[row.outcome]}
                </span>
              </div>
              <p className="mt-2 font-medium">{explanation?.title ?? row.explanationKey}</p>
              <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                {describeRow(row)}
              </p>
              {explanation ? (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer py-3 text-sky-700 dark:text-sky-400">
                    ¿Por qué pasó?
                  </summary>
                  <div className="mt-2 flex flex-col gap-2 leading-6">
                    <p>{explanation.text}</p>
                    <p>
                      <span className="font-medium">Buena práctica:</span> {explanation.practice}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Fuente: {explanation.source}
                    </p>
                  </div>
                </details>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
