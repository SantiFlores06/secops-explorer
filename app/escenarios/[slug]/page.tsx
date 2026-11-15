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
    <div className="flex flex-col gap-6">
      <header className="panel p-4 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{scenario.title}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-ink">{scenario.summary}</p>
        <p className="mt-3 max-w-3xl leading-7 text-muted">{scenario.context}</p>
        <p className="mt-4 text-xs leading-5 break-words text-muted">
          MITRE ATT&amp;CK: {scenario.tags.attack.join(", ")} · NIST CSF 2.0:{" "}
          {scenario.tags.csf.join(", ")}
        </p>
      </header>

      <section aria-labelledby="actores" className="panel">
        <div className="panel-head">
          <h2 id="actores" className="label-caps">
            Quiénes participan
          </h2>
        </div>
        <ul className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {scenario.actors.map((actor) => (
            <li key={actor.id} className="bg-panel p-4">
              <p className="font-bold">{actor.name}</p>
              <p className="label-caps mt-1">{ROLE_LABEL[actor.role]}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{actor.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <Suspense
        fallback={
          <p role="status" className="text-muted">
            Cargando el simulador…
          </p>
        }
      >
        <ScenarioPlayer scenario={scenario} />
      </Suspense>
    </div>
  );
}
