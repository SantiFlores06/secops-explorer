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
      <section className="panel p-5 sm:p-6">
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">SecOps Explorer</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-ink">
          Practica seguridad defensiva configurando sistemas simulados y observa al instante qué
          ocurre cuando usuarios legítimos y atacantes chocan contra tu configuración.
        </p>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          La lección de fondo es una sola: la mejor configuración es la que frena al atacante sin
          romperle el trabajo al usuario legítimo. Bloquear todo nunca gana.
        </p>
      </section>

      <section aria-labelledby="como-funciona" className="panel">
        <div className="panel-head">
          <h2 id="como-funciona" className="label-caps">
            Cómo funciona
          </h2>
        </div>
        <ol className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="bg-panel p-4">
              <p className="label-caps text-defense">Paso {index + 1}</p>
              <h3 className="mt-1 text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="escenarios" className="panel">
        <div className="panel-head">
          <h2 id="escenarios" className="label-caps">
            Escenarios
          </h2>
          <span aria-hidden="true" className="text-xs text-muted tabular-nums">
            {String(scenarios.length).padStart(2, "0")} disponibles
          </span>
        </div>
        <ul className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2">
          {scenarios.map((scenario, index) => (
            <li key={scenario.id} className="flex flex-col gap-3 bg-panel p-4">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-bold">{scenario.title}</h3>
                <span aria-hidden="true" className="text-xs text-muted tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
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
