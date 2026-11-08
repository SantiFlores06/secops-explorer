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
    <div className="flex flex-col gap-12">
      <section className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">SecOps Explorer</h1>
        <p className="mt-4 text-lg leading-8 text-zinc-700 dark:text-zinc-300">
          Practica seguridad defensiva configurando sistemas simulados y observa al instante qué
          ocurre cuando usuarios legítimos y atacantes chocan contra tu configuración.
        </p>
        <p className="mt-4 leading-7 text-zinc-700 dark:text-zinc-300">
          La lección de fondo es una sola: la mejor configuración es la que frena al atacante sin
          romperle el trabajo al usuario legítimo. Bloquear todo nunca gana.
        </p>
      </section>

      <section aria-labelledby="como-funciona">
        <h2 id="como-funciona" className="text-2xl font-semibold tracking-tight">
          Cómo funciona
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="card">
              <p className="text-sm font-medium text-sky-700 dark:text-sky-400">Paso {index + 1}</p>
              <h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="escenarios">
        <h2 id="escenarios" className="text-2xl font-semibold tracking-tight">
          Escenarios
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {scenarios.map((scenario) => (
            <li key={scenario.id} className="card flex flex-col gap-3">
              <div>
                <h3 className="text-lg font-semibold">{scenario.title}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                  {scenario.summary}
                </p>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                MITRE ATT&amp;CK: {scenario.tags.attack.join(", ")} · NIST CSF 2.0:{" "}
                {scenario.tags.csf.join(", ")}
              </p>
              <Link
                href={`/escenarios/${scenario.id}`}
                className="btn btn-primary self-start"
              >
                Probar este escenario
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
