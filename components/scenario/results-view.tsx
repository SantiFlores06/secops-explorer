import type { Comparison } from "@/lib/engine/compare";
import { formatClock, summarizeEvents, type TimelineRow } from "@/lib/engine/summary";
import type { ControlValue, Scenario, Wording } from "@/lib/engine/types";
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
    <div className="flex flex-col gap-4">
      <ScoreSection comparison={comparison} wording={scenario.wording} />
      <ComparisonSection scenario={scenario} comparison={comparison} />
      <TimelineSection scenario={scenario} rows={rows} />
    </div>
  );
}

/** The decision's consequence: total, the three axes, and who got in or was blocked. */
function ScoreSection({ comparison, wording }: { comparison: Comparison; wording: Wording }) {
  const { score } = comparison.yours;
  return (
    <section aria-labelledby="resultado" className="panel">
      <div className="panel-head">
        <h2 id="resultado" className="label-caps">
          Resultado
        </h2>
        <span className="text-xs text-muted">Puntaje total</span>
      </div>

      <div className="grid grid-cols-1 gap-px bg-line">
        <div className="bg-panel p-4">
          <p className="tabular-nums">
            <span className="text-6xl leading-none font-bold">{score.total}</span>
            <span className="text-lg text-muted"> / 100</span>
          </p>
        </div>
        <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
          <ScoreBar
            label="Seguridad"
            value={score.security}
            hint="Atacantes detenidos (100), detectados (50) o sin detectar (0)."
          />
          <ScoreBar
            label="Operatividad"
            value={score.operations}
            hint={wording.operationsHint}
          />
          <ScoreBar
            label="Costo operativo"
            value={score.cost}
            hint={`Usas ${score.costUnits} de ${score.maxCostUnits} unidades de mantenimiento.`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-2">
        <div className="bg-panel p-4">
          <h3 className="label-caps">Atacantes</h3>
          <ul className="mt-2 flex flex-col">
            {score.attackers.map((attacker) => {
              const style = VALENCE_STYLE[attackerValence(attacker.status)];
              return (
                <li
                  key={attacker.actorId}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 last:border-b-0"
                >
                  <span className="font-bold">{attacker.name}</span>
                  <span className={`pill ${style.pill}`}>
                    <span className="sr-only">{style.meaning}: </span>
                    {ATTACKER_STATUS_LABEL[attacker.status]}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="bg-panel p-4">
          <h3 className="label-caps">Equipo legítimo</h3>
          <ul className="mt-2 flex flex-col">
            {score.legit.map((person) => {
              const allIn = person.permitted === person.validAttempts;
              const style = VALENCE_STYLE[allIn ? "good" : "bad"];
              return (
                <li
                  key={person.actorId}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 last:border-b-0"
                >
                  <span className="font-bold">{person.name}</span>
                  <span className={`pill ${style.pill}`}>
                    <span className="sr-only">{style.meaning}: </span>
                    {wording.legitSummary
                      .replace("{permitidos}", String(person.permitted))
                      .replace("{total}", String(person.validAttempts))}
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
    <div className="bg-panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span id={id} className="label-caps">
          {label}
        </span>
        <span className="tabular-nums">
          <span className="text-2xl font-bold">{value}</span>
          <span className="text-xs text-muted">/100</span>
        </span>
      </div>
      <div
        role="meter"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="meter-track mt-3"
      >
        <div className="meter-fill" style={{ width: `${value}%` }} />
      </div>
      <p className="mt-2 text-xs leading-5 text-muted">{hint}</p>
    </div>
  );
}

function formatValue(scenario: Scenario, controlId: string, value: ControlValue): string {
  const control = scenario.controls.find((item) => item.id === controlId);
  if (control?.kind === "number") {
    if (value === 0 && control.id.endsWith("maxretry")) return "0 (apagado)";
    return control.unit ? `${value} ${control.unit}` : String(value);
  }
  if (control?.kind === "enum") {
    return control.options.find((option) => option.value === value)?.label ?? String(value);
  }
  return value ? "activado" : "desactivado";
}

function ComparisonSection({ scenario, comparison }: ResultsViewProps) {
  const { yours, optimal, differences, gap } = comparison;
  return (
    <section aria-labelledby="comparacion" className="panel">
      <div className="panel-head">
        <h2 id="comparacion" className="label-caps">
          Tu configuración frente a la recomendada
        </h2>
      </div>
      <div className="p-4">
        <dl className="grid grid-cols-2 gap-4 sm:max-w-md">
          <div>
            <dt className="text-xs text-muted">Tu puntaje</dt>
            <dd className="text-2xl font-bold tabular-nums">{yours.score.total}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Configuración recomendada</dt>
            <dd className="text-2xl font-bold tabular-nums">{optimal.score.total}</dd>
          </div>
        </dl>
        <p className="mt-3 leading-6">
          {gap === 0
            ? "Igualas el puntaje de la configuración recomendada, con la misma semilla."
            : `Te faltan ${gap} ${gap === 1 ? "punto" : "puntos"} para igualar a la configuración recomendada, con la misma semilla.`}
        </p>
        {differences.length > 0 ? (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer py-3 font-bold text-defense">
              Ver qué cambia la configuración recomendada
            </summary>
            <ul className="mt-1 flex flex-col gap-1 border-l-2 border-line-strong pl-3">
              {differences.map((difference) => (
                <li key={difference.controlId}>
                  <span className="font-bold">{difference.label}:</span> tú{" "}
                  {formatValue(scenario, difference.controlId, difference.yours)}, recomendada{" "}
                  {formatValue(scenario, difference.controlId, difference.optimal)}.
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function clockLabel(row: TimelineRow): string {
  return row.tStart === row.tEnd
    ? formatClock(row.tStart)
    : `${formatClock(row.tStart)}–${formatClock(row.tEnd)}`;
}

function originLabel(row: TimelineRow): string {
  return row.ip ?? `${row.ipCount} direcciones`;
}

function describeMailRow(row: TimelineRow): string {
  const received = row.outcome !== "bloqueado";
  const verb = received ? "recibido" : "rechazado";
  if (row.count === 1) {
    const sender = row.user ? ` con remitente «${row.user}»` : "";
    return `Mensaje ${verb}${sender} desde ${row.ip}.`;
  }
  const origin =
    row.ipCount === 1 ? `desde ${row.ip}` : `desde ${row.ipCount} direcciones distintas`;
  return `${row.count} mensajes ${received ? "recibidos" : "rechazados"} ${origin}.`;
}

function describeRow(row: TimelineRow): string {
  if (row.action === "enviar_correo") return describeMailRow(row);
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
    <section aria-labelledby="linea-de-tiempo" className="panel">
      <div className="panel-head">
        <h2 id="linea-de-tiempo" className="label-caps">
          Qué pasó, minuto a minuto
        </h2>
      </div>
      <p className="border-b border-line px-4 py-3 text-xs leading-5 text-muted">
        La actividad de los atacantes se agrupa por resultado y motivo; la del equipo legítimo
        aparece evento por evento.
      </p>
      {/* Scrolls inside its own box on narrow screens; the page itself never scrolls sideways. */}
      <div
        role="region"
        aria-labelledby="linea-de-tiempo"
        tabIndex={0}
        className="relative overflow-x-auto"
      >
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Eventos de la simulación; cada evento ocupa dos filas</caption>
          <thead className="bg-raised">
            <tr className="border-b border-line-strong">
              <th scope="col" className="label-caps px-3 py-2 text-left">
                N.º
              </th>
              <th scope="col" className="label-caps hidden px-3 py-2 text-left sm:table-cell">
                Tiempo
              </th>
              <th scope="col" className="label-caps px-3 py-2 text-left">
                Actor y origen
              </th>
              <th scope="col" className="label-caps px-3 py-2 text-left">
                Resultado
              </th>
            </tr>
          </thead>
          {rows.map((row, index) => {
            const explanation = scenario.explanations[row.explanationKey];
            const style = VALENCE_STYLE[valenceOf(row.role, row.outcome, row.credential)];
            const enter = { "--i": Math.min(index, 20) } as React.CSSProperties;
            return (
              <tbody key={row.key} className="align-top hover:bg-raised">
                <tr className="fx-enter" style={enter}>
                  <td rowSpan={2} className="relative border-b border-line px-3 py-3">
                    <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${style.rail}`} />
                    <span className="font-bold tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </td>
                  <td className="hidden px-3 pt-3 font-mono whitespace-nowrap text-muted tabular-nums sm:table-cell">
                    <span className="sr-only">Minuto </span>
                    {clockLabel(row)}
                  </td>
                  <td className="px-3 pt-3">
                    <span className="block font-bold">{row.actorName}</span>
                    <span className="block text-xs text-muted">
                      {ROLE_LABEL[row.role]} · <span className="tabular-nums">{originLabel(row)}</span>
                    </span>
                    <span className="block text-xs text-muted tabular-nums sm:hidden">
                      <span className="sr-only">Minuto </span>
                      {clockLabel(row)}
                    </span>
                  </td>
                  <td className="px-3 pt-3">
                    <span className={`pill ${style.pill}`}>
                      <span className="sr-only">{style.meaning}: </span>
                      {OUTCOME_LABEL[row.outcome]}
                    </span>
                  </td>
                </tr>
                <tr className="fx-enter" style={enter}>
                  <td colSpan={3} className="border-b border-line px-3 pt-2 pb-3">
                    <p className="font-bold">
                      <span className="sr-only">Acción: </span>
                      {explanation?.title ?? row.explanationKey}
                    </p>
                    <p className="mt-1 leading-6 text-ink">{describeRow(row)}</p>
                    {explanation ? (
                      <details className="mt-1 text-sm">
                        <summary className="cursor-pointer py-2 text-defense">¿Por qué pasó?</summary>
                        <div className="mt-1 flex flex-col gap-2 border-l-2 border-line-strong pl-3 leading-6">
                          <p>{explanation.text}</p>
                          <p>
                            <span className="font-bold">Buena práctica:</span> {explanation.practice}
                          </p>
                          <p className="text-xs text-muted">Fuente: {explanation.source}</p>
                        </div>
                      </details>
                    ) : null}
                  </td>
                </tr>
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}
