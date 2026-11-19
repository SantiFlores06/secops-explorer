"use client";

import { useEffect, useRef } from "react";

export interface StepperItem {
  /** Short label under the dot: the clock of the event, or "Configurar" / "Resumen". */
  short: string;
  /** Accessible name of the dot. */
  title: string;
}

interface StepperProps {
  /** Index 0 is the configuration, the last one is the summary. */
  items: StepperItem[];
  step: number;
  onGoTo: (step: number) => void;
}

/** The one stepper of the page: every step (configuration, events, summary) is a dot. */
export default function Stepper({ items, step, onGoTo }: StepperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const last = items.length - 1;
  const fill = last > 0 ? Math.min(100, (step / last) * 100) : 0;

  // Keep the current dot centered inside the stepper's own horizontal scroll box.
  useEffect(() => {
    const container = containerRef.current;
    const button = container?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    if (!container || !button) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const offset = button.getBoundingClientRect().left - container.getBoundingClientRect().left;
    container.scrollTo?.({
      left: container.scrollLeft + offset - container.clientWidth / 2 + button.offsetWidth / 2,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [step]);

  return (
    <section aria-labelledby="en-esta-partida" className="card flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="en-esta-partida" className="label-caps">
          En esta partida
        </h2>
        <p className="label-caps tabular-nums">
          Paso {step} de {last}
        </p>
      </div>
      <div
        ref={containerRef}
        role="region"
        aria-labelledby="en-esta-partida"
        tabIndex={0}
        className="overflow-x-auto overscroll-x-contain pb-1"
      >
        <div className="relative flex min-w-max px-9 py-2">
          <div aria-hidden="true" className="absolute top-6 right-9 left-9 h-0.5 bg-line-strong">
            <div
              className="h-full bg-green-ink transition-[width] duration-300 ease-out"
              style={{ width: `${fill}%` }}
            />
          </div>
          <ol className="relative flex">
            {items.map((item, index) => {
              const current = index === step;
              const done = index < step;
              const mark = index === 0 ? "C" : index === last ? "R" : String(index);
              return (
                <li
                  key={`${index}-${item.short}`}
                  className="relative z-10 flex w-[72px] shrink-0 flex-col items-center gap-1.5"
                >
                  <button
                    type="button"
                    data-step={index}
                    aria-label={`Paso ${index}: ${item.title}`}
                    aria-current={current ? "step" : undefined}
                    onClick={() => onGoTo(index)}
                    className={`dot ${current ? "dot-now" : done ? "dot-done" : ""}`}
                  >
                    {mark}
                  </button>
                  <span className="w-full truncate text-center text-[11px] text-muted">
                    {item.short}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
