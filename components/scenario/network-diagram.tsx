"use client";

import { useEffect, useId, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { TimelineRow } from "@/lib/engine/summary";
import type { Config, Outcome, Scenario } from "@/lib/engine/types";
import { OUTCOME_LABEL, ROLE_LABEL } from "./labels";

interface NetworkDiagramProps {
  scenario: Scenario;
  /** The configuration on screen; its enabled toggles fill the defenses node. */
  config: Config;
  /** Timeline rows of the last simulation, or null before the first one. */
  rows: TimelineRow[] | null;
  step: number;
  onStepChange: (step: number) => void;
}

const VIEW_W = 600;
const VIEW_H = 380;
const LEFT_X = 6;
const ACTOR_W = 150;
const ACTOR_H = 58;
const ACTOR_RIGHT = LEFT_X + ACTOR_W;
const ACTOR_TOP = 62;
const ACTOR_BOTTOM = 318;
const SHIELD = { cx: 300, cy: 190, w: 130, h: 160 };
const SHIELD_LEFT = SHIELD.cx - SHIELD.w / 2;
const SHIELD_RIGHT = SHIELD.cx + SHIELD.w / 2;
const TARGET_X = 444;
const TARGET_W = 150;
const TARGET_H = 84;
const TARGET_CY = 190;

const STEP_MS = 2500;
const PACKET_MS = 1600;
const PACKET_RADIUS = 7;

const PACKET_COLOR: Record<Outcome, string> = {
  permitido: "var(--color-green-ink)",
  bloqueado: "var(--color-slate-ink)",
  detectado: "var(--color-amber-ink)",
  no_detectado: "var(--color-red-ink)",
};

const PALETTE = {
  paper: { fill: "var(--color-field)", stroke: "var(--color-line)" },
  idle: { fill: "var(--color-field)", stroke: "var(--color-line-strong)" },
  legitimo: { fill: "var(--color-green)", stroke: "var(--color-green-ink)" },
  atacante: { fill: "var(--color-red)", stroke: "var(--color-red-ink)" },
  shield: { fill: "var(--color-lavender)", stroke: "var(--color-lavender-ink)" },
  target: { fill: "var(--color-slate)", stroke: "var(--color-slate-ink)" },
  targetPermitido: { fill: "var(--color-green)", stroke: "var(--color-green-ink)" },
  targetDetectado: { fill: "var(--color-amber)", stroke: "var(--color-amber-ink)" },
  targetNoDetectado: { fill: "var(--color-red)", stroke: "var(--color-red-ink)" },
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Splits a label into at most `maxLines` lines of `maxChars`, truncating the rest. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`;
    return kept.map((line) => truncate(line, maxChars));
  }
  return lines.map((line) => truncate(line, maxChars));
}

/** Evenly spaces the actors down the left column. */
function actorCenters(count: number): number[] {
  if (count <= 1) return [TARGET_CY];
  return Array.from(
    { length: count },
    (_, index) => ACTOR_TOP + (index * (ACTOR_BOTTOM - ACTOR_TOP)) / (count - 1),
  );
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const middle = (x1 + x2) / 2;
  return `C ${middle} ${y1} ${middle} ${y2} ${x2} ${y2}`;
}

/** Route from an actor to the shield (stops at its edge) or on through it to the target. */
function routeFrom(x: number, y: number, stopAtShield: boolean): string {
  const toShield = `M ${x} ${y} ${curve(x, y, SHIELD_LEFT, SHIELD.cy)}`;
  if (stopAtShield) return toShield;
  return `${toShield} L ${SHIELD_RIGHT} ${SHIELD.cy} ${curve(SHIELD_RIGHT, SHIELD.cy, TARGET_X, TARGET_CY)}`;
}

function originOf(row: TimelineRow): string {
  return row.ip ?? `${row.ipCount} IPs`;
}

export default function NetworkDiagram({
  scenario,
  config,
  rows,
  step,
  onStepChange,
}: NetworkDiagramProps) {
  const uid = useId().replace(/:/g, "");
  const shadowId = `${uid}-shadow`;
  const gridId = `${uid}-grid`;
  const reducedMotion = usePrefersReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState(0);

  const last = rows ? rows.length - 1 : -1;
  const index = rows ? Math.min(step, last) : -1;
  const row = rows && index >= 0 ? rows[index] : null;
  const isPlaying = playing && row !== null && index < last;

  // Auto-advance: one step every STEP_MS. Stops itself on the last step.
  useEffect(() => {
    if (!playing || !rows || step >= rows.length - 1) return;
    const timer = window.setTimeout(() => {
      if (step + 1 >= rows.length - 1) setPlaying(false);
      onStepChange(step + 1);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, rows, step, onStepChange]);

  function togglePlay() {
    if (!rows) return;
    if (isPlaying) {
      setPlaying(false);
      return;
    }
    if (index >= last) onStepChange(0);
    setPlaying(true);
  }

  const centers = actorCenters(scenario.actors.length);
  const actorY = new Map(scenario.actors.map((actor, i) => [actor.id, centers[i]]));
  // Active defenses: toggles that are on, numbers above zero, enums set to anything but "none".
  const enabledToggles = scenario.controls.flatMap((control) => {
    const value = config[control.id];
    if (control.kind === "toggle") return value === true ? [control.label] : [];
    if (control.kind === "enum") {
      if (value === "none") return [];
      const option = control.options.find((o) => o.value === value);
      return option ? [option.label] : [];
    }
    return Number(value) > 0 ? [control.label] : [];
  });

  const activeY = row ? (actorY.get(row.actorId) ?? TARGET_CY) : null;
  const blocked = row?.outcome === "bloqueado";
  const endX = blocked ? SHIELD_LEFT : TARGET_X;
  const endY = blocked ? SHIELD.cy : TARGET_CY;
  const color = row ? PACKET_COLOR[row.outcome] : undefined;

  const targetPalette = !row
    ? PALETTE.target
    : row.outcome === "permitido"
      ? PALETTE.targetPermitido
      : row.outcome === "detectado"
        ? PALETTE.targetDetectado
        : row.outcome === "no_detectado"
          ? PALETTE.targetNoDetectado
          : PALETTE.target;

  const label = row
    ? `Paso ${index + 1} de ${rows?.length ?? 0}: ${row.actorName} (${ROLE_LABEL[row.role]}) desde ${originOf(row)}, resultado: ${OUTCOME_LABEL[row.outcome]}. Destino: ${scenario.wording.targetLabel}.`
    : `Diagrama de red del escenario. ${scenario.wording.targetLabel} todavía sin tráfico.`;

  const targetLines = wrap(scenario.wording.targetLabel, 18, 2);
  const shieldLines = enabledToggles.length
    ? enabledToggles.slice(0, 3).flatMap((text) => wrap(text, 17, 2))
    : ["Ninguna activa"];
  const shieldMore = enabledToggles.length - 3;

  return (
    <div data-diagram className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={label}
        className="block h-auto w-full max-w-full"
      >
        <defs>
          <pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" style={{ stroke: PALETTE.paper.stroke }} strokeWidth="1" />
          </pattern>
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1d1b18" floodOpacity="0.18" />
          </filter>
        </defs>

        <g aria-hidden="true">
          <rect width={VIEW_W} height={VIEW_H} rx={16} style={{ fill: PALETTE.paper.fill }} />
          <rect width={VIEW_W} height={VIEW_H} rx={16} fill={`url(#${gridId})`} opacity={0.7} />

          {/* Dashed connectors: every actor to the shield, the shield to the target. */}
          {scenario.actors.map((actor) => {
            const y = actorY.get(actor.id) ?? TARGET_CY;
            const isActive = row?.actorId === actor.id;
            const style: CSSProperties = isActive
              ? { stroke: color }
              : { stroke: PALETTE.idle.stroke };
            return (
              <path
                key={`edge-${actor.id}`}
                d={`M ${ACTOR_RIGHT} ${y} ${curve(ACTOR_RIGHT, y, SHIELD_LEFT, SHIELD.cy)}`}
                fill="none"
                style={style}
                strokeWidth={isActive ? 2.5 : 1.5}
                strokeDasharray={isActive ? undefined : "6 6"}
                opacity={row && !isActive ? 0.45 : 1}
              />
            );
          })}
          <path
            d={`M ${SHIELD_RIGHT} ${SHIELD.cy} ${curve(SHIELD_RIGHT, SHIELD.cy, TARGET_X, TARGET_CY)}`}
            fill="none"
            style={{ stroke: PALETTE.idle.stroke }}
            strokeWidth={1.5}
            strokeDasharray="6 6"
          />
        </g>

        {scenario.actors.map((actor) => {
          const y = actorY.get(actor.id) ?? TARGET_CY;
          const palette = PALETTE[actor.role];
          const active = row?.actorId === actor.id;
          const nameLines = wrap(actor.name, 20, 2);
          return (
            <g
              key={actor.id}
              data-node="actor"
              data-actor-id={actor.id}
              data-active={active ? "true" : undefined}
            >
              <title>{`${actor.name} (${ROLE_LABEL[actor.role]})`}</title>
              <NodeBox
                x={LEFT_X}
                y={y - ACTOR_H / 2}
                w={ACTOR_W}
                h={ACTOR_H}
                palette={row ? palette : PALETTE.idle}
                strong={active}
                shadowId={shadowId}
              />
              <g aria-hidden="true">
                <text x={LEFT_X + ACTOR_W / 2} y={y - 10} textAnchor="middle" className="fill-ink text-xs font-bold">
                  {nameLines.map((line, i) => (
                    <tspan key={i} x={LEFT_X + ACTOR_W / 2} dy={i === 0 ? 0 : 14}>
                      {line}
                    </tspan>
                  ))}
                </text>
                <text x={LEFT_X + ACTOR_W / 2} y={y + 20} textAnchor="middle" className="fill-muted" fontSize={10}>
                  {ROLE_LABEL[actor.role]}
                </text>
              </g>
            </g>
          );
        })}

        <g data-node="shield" aria-hidden="true">
          <title>Defensas activas</title>
          <NodeBox
            x={SHIELD_LEFT}
            y={SHIELD.cy - SHIELD.h / 2}
            w={SHIELD.w}
            h={SHIELD.h}
            palette={PALETTE.shield}
            shadowId={shadowId}
          />
          <text x={SHIELD.cx} y={SHIELD.cy - SHIELD.h / 2 + 26} textAnchor="middle" className="fill-ink text-xs font-bold">
            Defensas
          </text>
          {shieldLines.map((line, i) => (
            <text key={i} x={SHIELD.cx} y={SHIELD.cy - SHIELD.h / 2 + 50 + i * 16} textAnchor="middle" fontSize={11} className="fill-ink">
              {line}
            </text>
          ))}
          {shieldMore > 0 ? (
            <text x={SHIELD.cx} y={SHIELD.cy - SHIELD.h / 2 + 50 + 3 * 16} textAnchor="middle" fontSize={11} className="fill-muted">
              {`+${shieldMore} más`}
            </text>
          ) : null}
        </g>

        <g data-node="target" aria-hidden="true">
          <title>{scenario.wording.targetLabel}</title>
          {row && row.outcome === "detectado" ? (
            <rect
              x={TARGET_X - 7}
              y={TARGET_CY - TARGET_H / 2 - 7}
              width={TARGET_W + 14}
              height={TARGET_H + 14}
              rx={20}
              fill="none"
              style={{ stroke: PALETTE.targetDetectado.stroke }}
              strokeWidth={3}
            />
          ) : null}
          <NodeBox
            x={TARGET_X}
            y={TARGET_CY - TARGET_H / 2}
            w={TARGET_W}
            h={TARGET_H}
            palette={targetPalette}
            shadowId={shadowId}
          />
          <text x={TARGET_X + TARGET_W / 2} y={TARGET_CY - 12} textAnchor="middle" className="fill-ink text-sm font-bold">
            {targetLines.map((line, i) => (
              <tspan key={i} x={TARGET_X + TARGET_W / 2} dy={i === 0 ? 0 : 16}>
                {line}
              </tspan>
            ))}
          </text>
          <text x={TARGET_X + TARGET_W / 2} y={TARGET_CY + 26} textAnchor="middle" fontSize={10} className="fill-muted">
            Destino
          </text>
        </g>

        {row && activeY !== null ? (
          <g aria-hidden="true">
            {/* Edge label: origin and count of the current step. */}
            <g>
              <rect
                x={(ACTOR_RIGHT + SHIELD_LEFT) / 2 - 46}
                y={(activeY + SHIELD.cy) / 2 - 17}
                width={92}
                height={34}
                rx={6}
                style={{ fill: PALETTE.paper.fill, stroke: PALETTE.idle.stroke }}
              />
              <text x={(ACTOR_RIGHT + SHIELD_LEFT) / 2} y={(activeY + SHIELD.cy) / 2 - 3} textAnchor="middle" fontSize={10} className="fill-ink font-mono font-bold">
                {originOf(row)}
              </text>
              <text x={(ACTOR_RIGHT + SHIELD_LEFT) / 2} y={(activeY + SHIELD.cy) / 2 + 10} textAnchor="middle" fontSize={10} className="fill-muted">
                {`×${row.count} ${row.count === 1 ? "evento" : "eventos"}`}
              </text>
            </g>

            {blocked ? (
              <g transform={`translate(${SHIELD_LEFT}, ${SHIELD.cy})`}>
                <circle r={11} style={{ fill: PALETTE.target.stroke }} />
                <text y={4} textAnchor="middle" fontSize={12} fontWeight={700} style={{ fill: PALETTE.paper.fill }}>
                  ✕
                </text>
              </g>
            ) : null}

            {reducedMotion ? (
              <circle
                cx={endX}
                cy={endY}
                r={PACKET_RADIUS}
                style={{ fill: color, stroke: PALETTE.paper.fill }}
                strokeWidth={2}
              />
            ) : (
              <circle
                key={`${index}-${replay}`}
                cx={ACTOR_RIGHT}
                cy={activeY}
                r={PACKET_RADIUS}
                style={{ fill: color, stroke: PALETTE.paper.fill }}
                strokeWidth={2}
              >
                <animateMotion
                  dur={`${PACKET_MS}ms`}
                  fill="freeze"
                  {...{ path: routeFrom(ACTOR_RIGHT, activeY, blocked === true) }}
                />
              </circle>
            )}
          </g>
        ) : null}
      </svg>

      {row === null ? (
        <p className="text-center text-sm text-muted">Simulá para ver el tráfico</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary flex-1" disabled={!rows} onClick={() => setReplay((n) => n + 1)}>
          Repetir
        </button>
        <button type="button" className="btn btn-secondary flex-1" disabled={!rows} onClick={togglePlay}>
          {isPlaying ? "Pausar" : "Reproducir"}
        </button>
      </div>
    </div>
  );
}

function NodeBox({
  x,
  y,
  w,
  h,
  palette,
  strong = false,
  shadowId,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  palette: { fill: string; stroke: string };
  strong?: boolean;
  shadowId: string;
}) {
  return (
    <g>
      {/* Thin slab under the box: a pseudo-isometric depth cue. */}
      <rect x={x} y={y + 5} width={w} height={h} rx={14} style={{ fill: palette.stroke }} opacity={0.25} />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={14}
        style={{ fill: palette.fill, stroke: palette.stroke }}
        strokeWidth={strong ? 3 : 1.5}
        filter={`url(#${shadowId})`}
      />
    </g>
  );
}
