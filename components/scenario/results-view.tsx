import { useEffect, useRef, useState, type RefObject } from "react";
import type { Comparison } from "@/lib/engine/compare";
import { formatClock, summarizeEvents, type TimelineRow } from "@/lib/engine/summary";
import type { ControlValue, Scenario, Wording } from "@/lib/engine/types";
import {
  ACTION_LABEL,
  ATTACKER_STATUS_LABEL,
  OUTCOME_CHIP,
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

/**
 * The sections of one run. They are direct children of the player's grid, so each
 * one places itself (desktop) and orders itself (phone). The player keys this by run,
 * so the step starts over every time the scenario is simulated again.
 */
export default function ResultsView({ scenario, comparison }: ResultsViewProps) {
  const rows = summarizeEvents(comparison.yours.events);
  const [step, setStep] = useState(0);
  const stepperRef = useRef<HTMLDivElement>(null);
  const lastStep = rows.length - 1;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      // While the person types or picks a value, the arrows belong to that field.
      if (event.target instanceof Element && event.target.closest("input, select, textarea")) {
        return;
      }
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      setStep((current) => Math.max(0, Math.min(current + delta, lastStep)));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lastStep]);

  // Keep the current step visible inside the stepper's own horizontal scroll box.
  useEffect(() => {
    const container = stepperRef.current;
    const button = container?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    if (!container || !button) return;
    container.scrollTo?.({
      left: button.offsetLeft - container.clientWidth / 2 + button.clientWidth / 2,
    });
  }, [step]);

  if (rows.length === 0) return null;

  const goTo = (index: number) => setStep(Math.max(0, Math.min(index, lastStep)));

  return (
    <>
      <StepPanel scenario={scenario} rows={rows} step={step} onGoTo={goTo} />
      <StepperCard
        scenario={scenario}
        rows={rows}
        step={step}
        onGoTo={goTo}
        containerRef={stepperRef}
      />
      <ScoreSection comparison={comparison} wording={scenario.wording} />
      <ComparisonSection scenario={scenario} comparison={comparison} />
      <TimelineSection scenario={scenario} rows={rows} />
    </>
  );
}

function stepTitle(scenario: Scenario, row: TimelineRow): string {
  return scenario.explanations[row.explanationKey]?.title ?? row.explanationKey;
}

/** The current event in full: outcome, what happened, why, and the good practice. */
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
  const row = rows[step];
  const explanation = scenario.explanations[row.explanationKey];
  const next = rows[step + 1];
  const style = VALENCE_STYLE[valenceOf(row.role, row.outcome, row.credential)];

  return (
    <section
      aria-labelledby="paso-titulo"
      className="card order-3 flex flex-col gap-4 p-5 lg:col-start-2 lg:row-start-1"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label-caps">
          Paso {step + 1} / {rows.length}
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
          disabled={step === 0}
          onClick={() => onGoTo(step - 1)}
        >
          ← Atrás
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          disabled={!next}
          onClick={() => onGoTo(step + 1)}
        >
          {next ? `Siguiente: ${stepTitle(scenario, next)} →` : "Último paso"}
        </button>
      </div>
      <p className="text-xs text-muted">
        <kbd className="rounded border border-line-strong bg-field px-1.5 font-bold text-ink">←</kbd>{" "}
        <kbd className="rounded border border-line-strong bg-field px-1.5 font-bold text-ink">→</kbd>{" "}
        cambian de paso
      </p>
    </section>
  );
}

/** One circle per timeline row, joined by a line. Scrolls sideways when there are many. */
function StepperCard({
  scenario,
  rows,
  step,
  onGoTo,
  containerRef,
}: {
  scenario: Scenario;
  rows: TimelineRow[];
  step: number;
  onGoTo: (index: number) => void;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <section
      aria-labelledby="en-esta-partida"
      className="card order-5 flex flex-col gap-3 p-5 lg:col-start-1 lg:row-start-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="en-esta-partida" className="label-caps">
          En esta partida
        </h2>
        <p className="label-caps tabular-nums">
          Paso {step + 1} de {rows.length}
        </p>
      </div>
      <div
        ref={containerRef}
        role="region"
        aria-labelledby="en-esta-partida"
        tabIndex={0}
        className="relative overflow-x-auto pb-1"
      >
        <ol className="flex min-w-max items-center py-2">
          {rows.map((row, index) => {
            const current = index === step;
            const reached = index <= step;
            const title = stepTitle(scenario, row);
            return (
              <li key={row.key} className="flex items-center">
                {index > 0 ? (
                  <span
                    aria-hidden="true"
                    className={`h-0.5 w-8 sm:w-12 ${reached ? "bg-green-ink" : "bg-line-strong"}`}
                  />
                ) : null}
                <button
                  type="button"
                  data-step={index}
                  aria-label={`Paso ${index + 1}: ${title}`}
                  aria-current={current ? "step" : undefined}
                  onClick={() => onGoTo(index)}
                  className={`grid size-10 shrink-0 place-items-center rounded-full border-2 text-sm font-bold tabular-nums ${
                    current
                      ? "border-green-ink bg-green text-green-ink"
                      : reached
                        ? "border-green-ink bg-lavender text-lavender-ink"
                        : "border-line-strong bg-field text-ink"
                  }`}
                >
                  {index + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** The decision's consequence: the three axes, and who got in or was blocked. */
function ScoreSection({ comparison, wording }: { comparison: Comparison; wording: Wording }) {
  const { score } = comparison.yours;
  return (
    <section
      aria-labelledby="resultado"
      className="card order-6 overflow-hidden lg:col-start-1 lg:row-start-4"
    >
      <div className="border-b border-line px-5 py-3">
        <h2 id="resultado" className="label-caps">
          Resultado
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
        <ScoreBar
          label="Seguridad"
          value={score.security}
          hint="Atacantes detenidos (100), detectados (50) o sin detectar (0)."
        />
        <ScoreBar label="Operatividad" value={score.operations} hint={wording.operationsHint} />
        <ScoreBar
          label="Costo operativo"
          value={score.cost}
          hint={`Usas ${score.costUnits} de ${score.maxCostUnits} unidades de mantenimiento.`}
        />
      </div>

      <div className="grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-2">
        <div className="bg-panel p-5">
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
                  <span className={`chip ${style.chip}`}>
                    <span className="sr-only">{style.meaning}: </span>
                    {ATTACKER_STATUS_LABEL[attacker.status]}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="bg-panel p-5">
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
                  <span className={`chip ${style.chip}`}>
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
    <div className="bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span id={id} className="label-caps">
          {label}
        </span>
        <span className="tabular-nums">
          <span className="text-2xl font-extrabold">{value}</span>
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
    <section
      aria-labelledby="comparacion"
      className="card order-7 overflow-hidden lg:col-start-1 lg:row-start-5"
    >
      <div className="border-b border-line px-5 py-3">
        <h2 id="comparacion" className="label-caps">
          Tu configuración frente a la recomendada
        </h2>
      </div>
      <div className="p-5">
        <dl className="grid grid-cols-2 gap-4 sm:max-w-md">
          <div>
            <dt className="text-xs text-muted">Tu puntaje</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{yours.score.total}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Configuración recomendada</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{optimal.score.total}</dd>
          </div>
        </dl>
        <p className="mt-3 leading-6">
          {gap === 0
            ? "Igualas el puntaje de la configuración recomendada, con la misma semilla."
            : `Te faltan ${gap} ${gap === 1 ? "punto" : "puntos"} para igualar a la configuración recomendada, con la misma semilla.`}
        </p>
        {differences.length > 0 ? (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer py-3 font-bold text-green-ink">
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

/** Every event, one table row pair per event. Folded under a disclosure to keep the page short. */
function TimelineSection({ scenario, rows }: { scenario: Scenario; rows: TimelineRow[] }) {
  return (
    <details className="card order-8 overflow-hidden lg:col-start-1 lg:row-start-6">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4 font-bold">
        <span>Ver todos los eventos</span>
        <span id="linea-de-tiempo" className="label-caps">
          Qué pasó, minuto a minuto
        </span>
      </summary>
      <p className="border-t border-line px-5 py-3 text-xs leading-5 text-muted">
        La actividad de los atacantes se agrupa por resultado y motivo; la del equipo legítimo
        aparece evento por evento.
      </p>
      {/* Scrolls inside its own box on narrow screens; the page itself never scrolls sideways. */}
      <div
        role="region"
        aria-labelledby="linea-de-tiempo"
        tabIndex={0}
        className="relative overflow-x-auto border-t border-line"
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
    </details>
  );
}
