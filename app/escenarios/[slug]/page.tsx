import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ScenarioPlayer from "@/components/scenario/scenario-player";
import { ROLE_LABEL } from "@/components/scenario/labels";
import { getScenario, listScenarios } from "@/lib/scenarios";

export function generateStaticParams() {
  return listScenarios().map((scenario) => ({ slug: scenario.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/escenarios/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const scenario = getScenario(slug);
  return scenario ? { title: scenario.title, description: scenario.summary } : {};
}

export default async function ScenarioPage({ params }: PageProps<"/escenarios/[slug]">) {
  const { slug } = await params;
  const scenario = getScenario(slug);
  if (!scenario) notFound();

  return (
    <div className="flex flex-col gap-8">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{scenario.title}</h1>
        <p className="mt-3 text-lg leading-8 text-zinc-700 dark:text-zinc-300">
          {scenario.summary}
        </p>
        <p className="mt-3 leading-7 text-zinc-700 dark:text-zinc-300">{scenario.context}</p>
        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
          MITRE ATT&amp;CK: {scenario.tags.attack.join(", ")} · NIST CSF 2.0:{" "}
          {scenario.tags.csf.join(", ")}
        </p>
      </header>

      <section aria-labelledby="actores">
        <h2 id="actores" className="text-xl font-semibold">
          Quiénes participan
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scenario.actors.map((actor) => (
            <li key={actor.id} className="card">
              <p className="font-semibold">{actor.name}</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{ROLE_LABEL[actor.role]}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                {actor.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <Suspense
        fallback={
          <p role="status" className="text-zinc-600 dark:text-zinc-400">
            Cargando el simulador…
          </p>
        }
      >
        <ScenarioPlayer scenario={scenario} />
      </Suspense>
    </div>
  );
}
