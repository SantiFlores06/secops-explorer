"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { compareWithOptimal } from "@/lib/engine/compare";
import { defaultConfig } from "@/lib/engine/config";
import { DEFAULT_SEED, decodeShare, encodeShare, nextSeed, type DecodedShare } from "@/lib/engine/share";
import { formatClock, summarizeEvents } from "@/lib/engine/summary";
import type { Config, ControlValue, Outcome, Scenario } from "@/lib/engine/types";
import ControlPanel from "./control-panel";
import { OUTCOME_CHIP, OUTCOME_LABEL } from "./labels";
import NetworkDiagram from "./network-diagram";
import ResultsView from "./results-view";
import Stepper, { type StepperItem } from "./stepper";

/**
 * Reads the shared link (if any) and hands it to the player.
 * Must sit inside a Suspense boundary because it reads the query string.
 */
export default function ScenarioPlayer({ scenario }: { scenario: Scenario }) {
  const searchParams = useSearchParams();
  const initial = decodeShare(scenario, searchParams);
  return <Player scenario={scenario} initial={initial} />;
}

interface Run {
  id: number;
  config: Config;
  seed: number;
}

type CopyState = "idle" | "ok" | "error";

const OUTCOMES: Outcome[] = ["permitido", "bloqueado", "detectado", "no_detectado"];

function stepTitle(scenario: Scenario, explanationKey: string): string {
  return scenario.explanations[explanationKey]?.title ?? explanationKey;
}

/**
 * One stepper drives the page. Step 0 is the configuration (the right panel holds the
 * controls); steps 1..N are the events; step N + 1 is the summary.
 */
function Player({ scenario, initial }: { scenario: Scenario; initial: DecodedShare }) {
  const [config, setConfig] = useState<Config>(initial.config);
  const [seed, setSeed] = useState(initial.seed);
  // A link that carries a seed points at a specific game: replay it right away.
  const [run, setRun] = useState<Run | null>(
    initial.shared ? { id: 1, config: initial.config, seed: initial.seed } : null,
  );
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [step, setStep] = useState(0);

  const comparison = useMemo(
    () => (run ? compareWithOptimal(scenario, run.config, run.seed) : null),
    [scenario, run],
  );
  const rows = useMemo(
    () => (comparison ? summarizeEvents(comparison.yours.events) : null),
    [comparison],
  );

  // Arrows move from the configuration into the first event. Inside the results they are
  // handled by the results view.
  useEffect(() => {
    if (step !== 0 || !rows) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowRight") return;
      if (event.target instanceof Element && event.target.closest("input, select, textarea")) return;
      event.preventDefault();
      setStep(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, rows]);

  function updateControl(controlId: string, value: ControlValue) {
    setConfig((current) => ({ ...current, [controlId]: value }));
    setCopyState("idle");
  }

  function simulateNow() {
    setRun((previous) => ({ id: (previous?.id ?? 0) + 1, config: { ...config }, seed }));
    setStep(1);
    setCopyState("idle");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${encodeShare(scenario, config, seed)}`,
    );
  }

  function reset() {
    setConfig(defaultConfig(scenario));
    setSeed(DEFAULT_SEED);
    setRun(null);
    setStep(0);
    setCopyState("idle");
    window.history.replaceState(null, "", window.location.pathname);
  }

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}?${encodeShare(scenario, config, seed)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("ok");
    } catch {
      setCopyState("error");
    }
  }

  const score = comparison?.yours.score;
  const stats = [
    { label: "SEGURIDAD", value: score?.security, note: "de 100", highlight: false },
    { label: "OPERATIVIDAD", value: score?.operations, note: "de 100", highlight: false },
    { label: "COSTO", value: score?.cost, note: "de 100", highlight: false },
    { label: "TOTAL", value: score?.total, note: "Puntaje total", highlight: true },
  ];

  const stepperItems: StepperItem[] = [
    { short: "Configurar", title: "Configurar" },
    ...(rows ?? []).map((row) => ({
      short: formatClock(row.tStart),
      title: stepTitle(scenario, row.explanationKey),
    })),
    ...(rows ? [{ short: "Resumen", title: "Resumen" }] : []),
  ];

  const showResults = step > 0 && comparison !== null && run !== null && rows !== null;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        <section key={run?.id ?? 0} aria-label="Puntaje" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`card p-4 ${stat.highlight ? "border-green-ink bg-green text-green-ink" : ""}`}
            >
              <p className={`label-caps ${stat.highlight ? "text-green-ink" : ""}`}>{stat.label}</p>
              <p className="mt-2 text-3xl font-extrabold tabular-nums">
                {stat.value === undefined ? (
                  "–"
                ) : (
                  <span
                    aria-hidden="true"
                    className="count"
                    style={{ "--to": stat.value } as CSSProperties}
                  />
                )}
                <span className="sr-only">{stat.value ?? "–"}</span>
              </p>
              <p className={`text-xs ${stat.highlight ? "text-green-ink" : "text-muted"}`}>{stat.note}</p>
            </div>
          ))}
        </section>

        {comparison && run ? (
          <p role="status" className="sr-only">
            Simulación lista: {comparison.yours.score.total} de 100 puntos.
          </p>
        ) : null}

        <section aria-labelledby="mapa-titulo" className="card flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="mapa-titulo" className="label-caps">
              Mapa del escenario
            </h2>
            <ul aria-label="Leyenda de resultados" className="flex flex-wrap gap-2">
              {OUTCOMES.map((outcome) => (
                <li key={outcome} className={`chip ${OUTCOME_CHIP[outcome]}`}>
                  {OUTCOME_LABEL[outcome]}
                </li>
              ))}
            </ul>
          </div>

          {/* Keyed by run: a new simulation resets the playback and the packet. */}
          <NetworkDiagram
            key={run?.id ?? 0}
            scenario={scenario}
            config={run ? run.config : config}
            rows={rows}
            step={step}
            onStepChange={setStep}
          />
        </section>

        <Stepper items={stepperItems} step={step} onGoTo={setStep} />
      </div>

      <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6">
        {showResults ? (
          <ResultsView
            key={run.id}
            scenario={scenario}
            comparison={comparison}
            rows={rows}
            step={step}
            onStepChange={setStep}
            onConfigure={() => setStep(0)}
          />
        ) : (
          <section className="card gi flex flex-col gap-5 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="label-caps">Paso 0 · Configurar</p>
              <span className="chip chip-amber">Tu turno</span>
            </div>

            <ControlPanel
              title={scenario.wording.configPanelTitle}
              controls={scenario.controls}
              config={config}
              onChange={updateControl}
            />

            <div className="flex flex-col gap-4 border-t border-line pt-5">
              <div>
                <label htmlFor="semilla" className="font-bold">
                  Semilla
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    id="semilla"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={4294967295}
                    value={seed}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      if (event.target.value.trim() !== "" && Number.isFinite(parsed)) {
                        setSeed(Math.min(4294967295, Math.max(0, Math.trunc(parsed))));
                      }
                    }}
                    aria-describedby="semilla-ayuda"
                    className="field w-40 tabular-nums"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSeed(nextSeed(seed))}
                  >
                    Otra partida
                  </button>
                </div>
                <p id="semilla-ayuda" className="mt-1 text-xs leading-5 text-muted">
                  La misma semilla repite exactamente la misma partida: los mismos ataques en los
                  mismos momentos.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary w-full" onClick={simulateNow}>
                  Simular
                </button>
                <button type="button" className="btn btn-secondary flex-1" onClick={reset}>
                  Restablecer
                </button>
                <button type="button" className="btn btn-secondary flex-1" onClick={copyLink}>
                  Copiar enlace
                </button>
              </div>
              <p role="status" className="min-h-5 text-xs text-muted">
                {copyState === "ok"
                  ? "Enlace copiado: reproduce esta partida exacta."
                  : copyState === "error"
                    ? "No se pudo copiar. Copia la dirección desde la barra del navegador."
                    : ""}
              </p>
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
