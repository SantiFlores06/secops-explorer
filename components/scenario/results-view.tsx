import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { Comparison } from "@/lib/engine/compare";
import { formatClock, summarizeEvents, type TimelineRow } from "@/lib/engine/summary";
import type { ControlValue, Scenario } from "@/lib/engine/types";
import {
  ACTION_LABEL,
  OUTCOME_CHIP,
  OUTCOME_LABEL,
  ROLE_LABEL,
  VALENCE_STYLE,
  valenceOf,
} from "./labels";

interface ResultsViewProps {
  scenario: Scenario;
  comparison: Comparison;
  /** Optional: the player passes the rows it already built for the diagram. */
  rows?: TimelineRow[];
  /**
   * Stepper index of the panel: 1..rows.length is an event, rows.length + 1 is the summary.
   * Without it the view keeps its own step, starting at the first event.
   */
  step?: number;
  onStepChange?: (step: number) => void;
  /** The summary's "Configurar de nuevo" action. */
  onConfigure?: () => void;
}

/**
 * The side panel after a run: one card per event, then the summary. The player keys it by
 * run, so the step starts over every time the scenario is simulated again.
 */
export default function ResultsView({
  scenario,
  comparison,
  rows: rowsProp,
  step: controlledStep,
  onStepChange,
  onConfigure,
}: ResultsViewProps) {
  const rows = rowsProp ?? summarizeEvents(comparison.yours.events);
  const summaryStep = rows.length + 1;
  const [localStep, setLocalStep] = useState(1);
  const isControlled = controlledStep !== undefined;
  const step = Math.min(Math.max(controlledStep ?? localStep, 1), summaryStep);

  const setStep = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 1), summaryStep);
      if (!isControlled) setLocalStep(clamped);
      onStepChange?.(clamped);
    },
    [isControlled, onStepChange, summaryStep],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      // While the person types or picks a value, the arrows belong to that field.
      if (event.target instanceof Element && event.target.closest("input, select, textarea")) {
        return;
      }
      event.preventDefault();
      setStep(step + (event.key === "ArrowRight" ? 1 : -1));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, setStep]);

  if (rows.length === 0) return null;

  if (step > rows.length) {
    return (
      <SummaryPanel
        scenario={scenario}
        comparison={comparison}
        rows={rows}
        onBack={() => setStep(rows.length)}
        onConfigure={onConfigure}
      />
    );
  }

  return <StepPanel key={step} scenario={scenario} rows={rows} step={step} onGoTo={setStep} />;
}

function stepTitle(scenario: Scenario, row: TimelineRow): string {
  return scenario.explanations[row.explanationKey]?.title ?? row.explanationKey;
}

/** One event in full: outcome, what happened, why, and the good practice. */
function StepPanel({
  scenario,
  rows,
  step,
  onGoTo,
}: {
  scenario: Scenario;
  rows: TimelineRow[];
  step: number;
  onGoTo: (index: number) => void;
}) {
  const row = rows[step - 1];
  const explanation = scenario.explanations[row.explanationKey];
  const next = rows[step];
  const nextTitle = next ? stepTitle(scenario, next) : "Resumen";
  const style = VALENCE_STYLE[valenceOf(row.role, row.outcome, row.credential)];

  return (
    <section aria-labelledby="paso-titulo" className="card gi flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label-caps">
          Paso {step} / {rows.length} <span className="tabular-nums">· {formatClock(row.tStart)}</span>
        </p>
        <span className={`chip ${OUTCOME_CHIP[row.outcome]}`}>
          <span className="sr-only">{style.meaning}: </span>
          {OUTCOME_LABEL[row.outcome]}
        </span>
      </div>

      <h2 id="paso-titulo" className="text-xl leading-tight sm:text-2xl">
        {stepTitle(scenario, row)}
      </h2>
      <p className="leading-6">{describeRow(row)}</p>

      {explanation ? (
        <div className="flex flex-col gap-3 border-l-2 border-line-strong pl-3 text-sm leading-6">
          <div>
            <p className="label-caps">¿Por qué pasó?</p>
            <p className="mt-1">{explanation.text}</p>
          </div>
          <div>
            <p className="label-caps">Buena práctica</p>
            <p className="mt-1">{explanation.practice}</p>
          </div>
          <p className="text-xs text-muted">Fuente: {explanation.source}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={step <= 1}
          onClick={() => onGoTo(step - 1)}
        >
          ← Atrás
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={() => onGoTo(step + 1)}
        >
          {`Siguiente: ${nextTitle} →`}
        </button>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <span className="kbd">←</span>
        <span className="kbd">→</span> cambian de paso
      </p>
    </section>
  );
}

/** The consequence of the run: your score against the recommended one, and what changes. */
function SummaryPanel({
  scenario,
  comparison,
  rows,
  onBack,
  onConfigure,
}: {
  scenario: Scenario;
  comparison: Comparison;
  rows: TimelineRow[];
  onBack: () => void;
  onConfigure?: () => void;
}) {
  const { yours, optimal, differences, gap } = comparison;
  return (
    <section aria-labelledby="resumen-titulo" className="card gi flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label-caps">Resumen</p>
        <span className="chip chip-green">Partida completa</span>
      </div>
      <h2 id="resumen-titulo" className="text-xl leading-tight sm:text-2xl">
        Resumen de la partida
      </h2>

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-control border border-line bg-field p-3">
          <dt className="label-caps">Tu puntaje</dt>
          <dd className="mt-1 text-3xl font-extrabold tabular-nums">{yours.score.total}</dd>
        </div>
        <div className="rounded-control border border-green-ink bg-green p-3 text-green-ink">
          <dt className="label-caps text-green-ink">Recomendada</dt>
          <dd className="mt-1 text-3xl font-extrabold tabular-nums">{optimal.score.total}</dd>
        </div>
      </dl>

      <p className="text-sm leading-6">
        {gap === 0
          ? "Igualas el puntaje de la configuración recomendada, con la misma semilla."
          : `Te faltan ${gap} ${gap === 1 ? "punto" : "puntos"} para igualar a la configuración recomendada, con la misma semilla.`}
      </p>

      <div className="flex flex-col gap-2">
        <p className="label-caps">Qué cambia en la recomendada</p>
        {differences.length > 0 ? (
          <ul className="flex flex-col gap-1 border-l-2 border-line-strong pl-3 text-sm leading-6">
            {differences.map((difference) => (
              <li key={difference.controlId}>
                <span className="font-bold">{difference.label}:</span> tú{" "}
                {formatValue(scenario, difference.controlId, difference.yours)}, recomendada{" "}
                {formatValue(scenario, difference.controlId, difference.optimal)}.
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-6">Tu configuración ya coincide con la recomendada.</p>
        )}
      </div>

      <details className="overflow-hidden rounded-control border border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-bold">
          Ver todos los eventos
        </summary>
        <div className="flex flex-col gap-3 border-t border-line p-3">
          <p className="text-xs leading-5 text-muted">
            La actividad de los atacantes se agrupa por resultado y motivo; la del equipo legítimo
            aparece evento por evento.
          </p>
          <EventsTable scenario={scenario} rows={rows} />
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          ← Atrás
        </button>
        <button type="button" className="btn btn-primary flex-1" onClick={onConfigure}>
          Configurar de nuevo
        </button>
      </div>
    </section>
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

/** Every event, two table rows per event. Scrolls inside its own box on narrow screens. */
function EventsTable({ scenario, rows }: { scenario: Scenario; rows: TimelineRow[] }) {
  return (
    <>
      <p id="linea-de-tiempo" className="label-caps">
        Qué pasó, minuto a minuto
      </p>
      <div
        role="region"
        aria-labelledby="linea-de-tiempo"
        tabIndex={0}
        className="relative overflow-x-auto rounded-control border border-line"
      >
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Eventos de la simulación; cada evento ocupa dos filas</caption>
          <thead className="bg-raised">
            <tr className="border-b border-line-strong">
              <th scope="col" className="label-caps px-3 py-2 text-left text-ink">
                N.º
              </th>
              <th scope="col" className="label-caps hidden px-3 py-2 text-left text-ink sm:table-cell">
                Tiempo
              </th>
              <th scope="col" className="label-caps px-3 py-2 text-left text-ink">
                Actor y origen
              </th>
              <th scope="col" className="label-caps px-3 py-2 text-left text-ink">
                Resultado
              </th>
            </tr>
          </thead>
          {rows.map((row, index) => {
            const explanation = scenario.explanations[row.explanationKey];
            const style = VALENCE_STYLE[valenceOf(row.role, row.outcome, row.credential)];
            const enter = { "--i": Math.min(index, 20) } as CSSProperties;
            return (
              <tbody key={row.key} className="align-top hover:bg-raised">
                <tr className="fx-enter" style={enter}>
                  <td rowSpan={2} className="relative border-b border-line px-3 py-3">
                    <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${style.rail}`} />
                    <span className="font-bold tabular-nums">{String(index + 1).padStart(2, "0")}</span>
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
                    <span className={`chip ${OUTCOME_CHIP[row.outcome]}`}>
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
                        <summary className="cursor-pointer py-2 text-green-ink">¿Por qué pasó?</summary>
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
    </>
  );
}
