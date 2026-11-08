"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { compareWithOptimal } from "@/lib/engine/compare";
import { defaultConfig } from "@/lib/engine/config";
import { DEFAULT_SEED, decodeShare, encodeShare, nextSeed, type DecodedShare } from "@/lib/engine/share";
import type { Config, ControlValue, Scenario } from "@/lib/engine/types";
import ControlPanel from "./control-panel";
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

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-2">
        <ControlPanel controls={scenario.controls} config={config} onChange={updateControl} />

        <div>
          <label htmlFor="semilla" className="font-medium">
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
              className="field w-40"
            />
            <button type="button" className="btn btn-secondary" onClick={() => setSeed(nextSeed(seed))}>
              Otra partida
            </button>
          </div>
          <p id="semilla-ayuda" className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
            La misma semilla repite exactamente la misma partida: los mismos ataques en los
            mismos momentos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={simulateNow}>
            Simular
          </button>
          <button type="button" className="btn btn-secondary" onClick={reset}>
            Restablecer
          </button>
          <button type="button" className="btn btn-secondary" onClick={copyLink}>
            Copiar enlace
          </button>
        </div>
        <p role="status" className="min-h-5 text-sm text-zinc-600 dark:text-zinc-400">
          {copyState === "ok"
            ? "Enlace copiado: reproduce esta partida exacta."
            : copyState === "error"
              ? "No se pudo copiar. Copia la dirección desde la barra del navegador."
              : ""}
        </p>
      </div>

      <div aria-live="polite">
        {comparison && run ? (
          <>
            <p className="sr-only">
              Simulación lista: {comparison.yours.score.total} de 100 puntos.
            </p>
            <ResultsView key={run.id} scenario={scenario} comparison={comparison} />
          </>
        ) : (
          <div className="card text-zinc-700 dark:text-zinc-300">
            <h2 className="text-xl font-semibold">Todavía no hay resultados</h2>
            <p className="mt-2 leading-7">
              Ajusta la configuración y pulsa <strong>Simular</strong>. Verás qué intentó cada
              actor, qué frenó tu configuración y a quién le rompió el trabajo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
