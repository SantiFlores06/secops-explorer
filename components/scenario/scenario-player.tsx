"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { compareWithOptimal } from "@/lib/engine/compare";
import { defaultConfig } from "@/lib/engine/config";
import { DEFAULT_SEED, decodeShare, encodeShare, nextSeed, type DecodedShare } from "@/lib/engine/share";
import type { Config, ControlValue, Outcome, Scenario } from "@/lib/engine/types";
import ControlPanel from "./control-panel";
import { OUTCOME_CHIP, OUTCOME_LABEL, ROLE_LABEL } from "./labels";
import ResultsView from "./results-view";

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

/**
 * Layout: a two-column grid on desktop (main column + 360px right column), one column
 * on phones. Each card sets its own desktop cell and its phone order, so the phone
 * reads: summary, diagram, step, settings, stepper, results, comparison, events.
 */
function Player({ scenario, initial }: { scenario: Scenario; initial: DecodedShare }) {
  const [config, setConfig] = useState<Config>(initial.config);
  const [seed, setSeed] = useState(initial.seed);
  // A link that carries a seed points at a specific game: replay it right away.
  const [run, setRun] = useState<Run | null>(
    initial.shared ? { id: 1, config: initial.config, seed: initial.seed } : null,
  );
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const comparison = useMemo(
    () => (run ? compareWithOptimal(scenario, run.config, run.seed) : null),
    [scenario, run],
  );

  function updateControl(controlId: string, value: ControlValue) {
    setConfig((current) => ({ ...current, [controlId]: value }));
    setCopyState("idle");
  }

  function simulateNow() {
    setRun((previous) => ({ id: (previous?.id ?? 0) + 1, config: { ...config }, seed }));
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

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section
        aria-label="Resumen de la partida"
        className="order-1 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-start-1 lg:row-start-1"
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`card p-4 ${stat.highlight ? "border-green-ink bg-green text-green-ink" : ""}`}
          >
            <p className={`label-caps ${stat.highlight ? "text-green-ink" : ""}`}>{stat.label}</p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums">{stat.value ?? "–"}</p>
            <p className={`text-xs ${stat.highlight ? "text-green-ink" : "text-muted"}`}>
              {stat.note}
            </p>
          </div>
        ))}
      </section>

      <section
        aria-labelledby="mapa-titulo"
        className="card order-2 flex flex-col gap-4 p-5 lg:col-start-1 lg:row-start-2"
      >
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

        {/* Reserved for the network diagram; the next slice draws it here. */}
        <div
          data-diagram
          className="paper-grid flex min-h-56 items-center justify-center rounded-control border border-dashed border-line-strong p-6 text-center text-sm text-muted"
        >
          <p>Espacio reservado para el diagrama de red.</p>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="label-caps">Quiénes participan</h3>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {scenario.actors.map((actor) => (
              <li key={actor.id} className="rounded-control border border-line bg-field p-3">
                <p className="font-bold">{actor.name}</p>
                <p className="label-caps mt-1">{ROLE_LABEL[actor.role]}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{actor.description}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2 text-sm leading-6">
          <p className="text-muted">{scenario.context}</p>
          <p className="text-xs leading-5 break-words text-muted">
            MITRE ATT&amp;CK: {scenario.tags.attack.join(", ")} · NIST CSF 2.0:{" "}
            {scenario.tags.csf.join(", ")}
          </p>
        </div>
      </section>

      {comparison && run ? (
        <>
          <p role="status" className="sr-only">
            Simulación lista: {comparison.yours.score.total} de 100 puntos.
          </p>
          <ResultsView key={run.id} scenario={scenario} comparison={comparison} />
        </>
      ) : (
        <section className="card order-3 border-dashed p-6 lg:col-start-2 lg:row-start-1">
          <h2 className="text-lg">Todavía no hay resultados</h2>
          <p className="mt-2 leading-7 text-muted">
            Ajusta la configuración y pulsa <strong className="text-ink">Simular</strong>. Verás
            qué intentó cada actor, qué frenó tu configuración y a quién le rompió el trabajo.
          </p>
        </section>
      )}

      <section
        aria-label="Tu configuración"
        className="card order-4 flex flex-col gap-5 p-5 lg:col-start-2 lg:row-start-2 lg:row-span-5"
      >
        <p className="label-caps">Tu configuración</p>

        <ControlPanel
          title={scenario.wording.configPanelTitle}
          controls={scenario.controls}
          config={config}
          onChange={updateControl}
        />

        <div aria-label="Semilla y acciones" className="flex flex-col gap-4 border-t border-line pt-5">
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
              <button type="button" className="btn btn-secondary" onClick={() => setSeed(nextSeed(seed))}>
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
    </div>
  );
}
