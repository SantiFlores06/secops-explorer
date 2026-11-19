import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ScenarioPlayer from "@/components/scenario/scenario-player";
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

  const scenarios = listScenarios();
  const position = scenarios.findIndex((item) => item.id === scenario.id) + 1;

  return (
    <div className="flex flex-col gap-5">
      <header className="card p-5 sm:p-6">
        <nav aria-label="Ubicación" className="label-caps flex flex-wrap items-center gap-2">
          <Link href="/" className="hover:text-ink hover:underline underline-offset-4">
            {scenario.track}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">
            Escenario {position} de {scenarios.length}
          </span>
        </nav>
        <h1 className="mt-3 text-3xl tracking-tight sm:text-4xl">{scenario.title}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="chip chip-amber">Configurar</span>
          <span className="chip chip-lavender">{scenario.actors.length} actores</span>
        </div>
        <p className="mt-4 max-w-3xl leading-7 text-muted">{scenario.summary}</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{scenario.context}</p>
      </header>

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
