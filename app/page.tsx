import Link from "next/link";
import { listScenarios } from "@/lib/scenarios";

const STEPS = [
  {
    title: "Configura",
    text: "Ajusta controles reales de un sistema: contraseñas, claves, bloqueo por intentos fallidos, segundo factor.",
  },
  {
    title: "Simula",
    text: "El motor reproduce una hora con administradores, bots y atacantes actuando contra tu configuración.",
  },
  {
    title: "Aprende",
    text: "Ves qué se frenó, qué se coló y por qué, y comparas tu resultado con la configuración recomendada.",
  },
];

export default function Home() {
  const scenarios = listScenarios();

  return (
    <div className="flex flex-col gap-6">
      <section className="card p-5 sm:p-7">
        <h1 className="max-w-3xl text-4xl tracking-tight sm:text-5xl">
          SecOps <span className="highlight">Explorer</span>
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-ink">
          Practica seguridad defensiva configurando sistemas simulados y observa al instante qué
          ocurre cuando usuarios legítimos y atacantes chocan contra tu configuración.
        </p>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          La lección de fondo es una sola: la mejor configuración es la que frena al atacante sin
          romperle el trabajo al usuario legítimo. Bloquear todo nunca gana.
        </p>
      </section>

      <section aria-labelledby="como-funciona" className="card overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <h2 id="como-funciona" className="label-caps">
            Cómo funciona
          </h2>
        </div>
        <ol className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="bg-panel p-5">
              <p className="label-caps text-green-ink">Paso {index + 1}</p>
              <h3 className="mt-1 text-xl">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="escenarios" className="card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
          <h2 id="escenarios" className="label-caps">
            Escenarios
          </h2>
          <span aria-hidden="true" className="text-xs text-muted tabular-nums">
            {String(scenarios.length).padStart(2, "0")} disponibles
          </span>
        </div>
        <ul className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2">
          {scenarios.map((scenario, index) => (
            <li key={scenario.id} className="flex flex-col gap-3 bg-panel p-5">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-xl">{scenario.title}</h3>
                <span aria-hidden="true" className="text-xs text-muted tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="chip chip-amber">Configurar</span>
                <span className="chip chip-lavender">{scenario.track}</span>
              </div>
              <p className="text-sm leading-6 text-ink">{scenario.summary}</p>
              <p className="text-xs leading-5 break-words text-muted">
                MITRE ATT&amp;CK: {scenario.tags.attack.join(", ")} · NIST CSF 2.0:{" "}
                {scenario.tags.csf.join(", ")}
              </p>
              <Link href={`/escenarios/${scenario.id}`} className="btn btn-primary mt-auto self-start">
                Probar este escenario
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
