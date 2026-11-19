"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
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

interface Point {
  x: number;
  y: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ActorSlot {
  box: Box;
  /** Where the packet leaves the actor. */
  anchor: Point;
  /** Center of the origin chip shown while the actor is active. */
  label: Point;
  /** Route from the actor to the shield's entry edge (used when the packet is blocked). */
  blocked: string;
  /** Route from the actor through the shield to the target. */
  delivered: string;
}

interface Geometry {
  viewW: number;
  viewH: number;
  /** Font size (SVG units) for secondary labels. Keeps rendered text >= 11px on phones. */
  smallText: number;
  actors: ActorSlot[];
  shield: Box;
  target: Box;
  blockPoint: Point;
  targetEntry: Point;
  /** Idle dashed connector from the shield to the target. */
  throughPath: string;
}

// Landscape: actors in a column on the left, shield in the middle, target on the right.
const LANDSCAPE_W = 600;
const LANDSCAPE_H = 380;
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

// Portrait (phones): actors stacked in a column on the right, a rail on the left,
// shield in the middle and target at the bottom. Sized so 1 unit is about 1px at 320px.
const PORTRAIT_W = 320;
const PORTRAIT_PAD = 12;
const P_CX = PORTRAIT_W / 2;
const P_ACTOR_X = 120;
const P_ACTOR_W = 180;
const P_ACTOR_H = 50;
const P_ACTOR_GAP = 10;
const P_RAIL_X = 24;
const P_SHIELD = { w: 200, h: 150 };
const P_GAP = 40;
const P_TARGET_H = 72;

const STEP_MS = 2500;
const PACKET_MS = 1600;
const PACKET_RADIUS = 7;
/** Ease-in-out for the packet: it is on screen moving, so it accelerates and settles. */
const PACKET_SPLINE = { calcMode: "spline", keyTimes: "0;1", keySplines: "0.77 0 0.175 1" };

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

const PACKET_COLOR: Record<Outcome, string> = {
  permitido: "var(--color-green-ink)",
  bloqueado: "var(--color-slate-ink)",
  detectado: "var(--color-amber-ink)",
  no_detectado: "var(--color-red-ink)",
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** Phones and narrow tablets get the portrait layout. Matches Tailwind's `sm` breakpoint minus 1px. */
const PORTRAIT_QUERY = "(max-width: 639px)";

/** A stable subscribe function per query, so useSyncExternalStore does not resubscribe each render. */
function subscribeTo(query: string) {
  return (onChange: () => void) => {
    if (typeof window.matchMedia !== "function") return () => {};
    const media = window.matchMedia(query);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  };
}

const subscribeReducedMotion = subscribeTo(REDUCED_MOTION_QUERY);
const subscribePortrait = subscribeTo(PORTRAIT_QUERY);

function matches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => matches(REDUCED_MOTION_QUERY),
    () => false,
  );
}

function usePortrait(): boolean {
  return useSyncExternalStore(
    subscribePortrait,
    () => matches(PORTRAIT_QUERY),
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

function landscapeGeometry(count: number): Geometry {
  const actors = actorCenters(count).map((y): ActorSlot => {
    const blocked = `M ${ACTOR_RIGHT} ${y} ${curve(ACTOR_RIGHT, y, SHIELD_LEFT, SHIELD.cy)}`;
    return {
      box: { x: LEFT_X, y: y - ACTOR_H / 2, w: ACTOR_W, h: ACTOR_H },
      anchor: { x: ACTOR_RIGHT, y },
      label: { x: (ACTOR_RIGHT + SHIELD_LEFT) / 2, y: (y + SHIELD.cy) / 2 },
      blocked,
      delivered: `${blocked} L ${SHIELD_RIGHT} ${SHIELD.cy} ${curve(SHIELD_RIGHT, SHIELD.cy, TARGET_X, TARGET_CY)}`,
    };
  });
  return {
    viewW: LANDSCAPE_W,
    viewH: LANDSCAPE_H,
    smallText: 11,
    actors,
    shield: { x: SHIELD_LEFT, y: SHIELD.cy - SHIELD.h / 2, w: SHIELD.w, h: SHIELD.h },
    target: { x: TARGET_X, y: TARGET_CY - TARGET_H / 2, w: TARGET_W, h: TARGET_H },
    blockPoint: { x: SHIELD_LEFT, y: SHIELD.cy },
    targetEntry: { x: TARGET_X, y: TARGET_CY },
    throughPath: `M ${SHIELD_RIGHT} ${SHIELD.cy} ${curve(SHIELD_RIGHT, SHIELD.cy, TARGET_X, TARGET_CY)}`,
  };
}

function portraitGeometry(count: number): Geometry {
  const stackBottom =
    count === 0 ? PORTRAIT_PAD : PORTRAIT_PAD + (count - 1) * (P_ACTOR_H + P_ACTOR_GAP) + P_ACTOR_H;
  const shield: Box = {
    x: P_CX - P_SHIELD.w / 2,
    y: stackBottom + P_GAP,
    w: P_SHIELD.w,
    h: P_SHIELD.h,
  };
  const shieldCy = shield.y + shield.h / 2;
  const target: Box = { x: shield.x, y: shield.y + shield.h + P_GAP, w: shield.w, h: P_TARGET_H };

  const actors = Array.from({ length: count }, (_, index): ActorSlot => {
    const top = PORTRAIT_PAD + index * (P_ACTOR_H + P_ACTOR_GAP);
    const y = top + P_ACTOR_H / 2;
    // Each actor runs left along its own row, then down the rail to the shield's row.
    const blocked = `M ${P_ACTOR_X} ${y} L ${P_RAIL_X} ${y} L ${P_RAIL_X} ${shieldCy} L ${shield.x} ${shieldCy}`;
    return {
      box: { x: P_ACTOR_X, y: top, w: P_ACTOR_W, h: P_ACTOR_H },
      anchor: { x: P_ACTOR_X, y },
      label: { x: (P_RAIL_X + P_ACTOR_X) / 2, y },
      blocked,
      delivered: `${blocked} L ${P_CX} ${shieldCy} L ${P_CX} ${target.y}`,
    };
  });

  return {
    viewW: PORTRAIT_W,
    viewH: target.y + P_TARGET_H + PORTRAIT_PAD,
    smallText: 12,
    actors,
    shield,
    target,
    blockPoint: { x: shield.x, y: shieldCy },
    targetEntry: { x: P_CX, y: target.y },
    throughPath: `M ${P_CX} ${shield.y + shield.h} L ${P_CX} ${target.y}`,
  };
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
  const portrait = usePortrait();
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

  const geometry = useMemo(
    () => (portrait ? portraitGeometry(scenario.actors.length) : landscapeGeometry(scenario.actors.length)),
    [portrait, scenario.actors.length],
  );
  const { smallText, shield, target } = geometry;
  const actorIndex = new Map(scenario.actors.map((actor, i) => [actor.id, i]));

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

  const activeSlot = row ? (geometry.actors[actorIndex.get(row.actorId) ?? 0] ?? null) : null;
  const blocked = row?.outcome === "bloqueado";
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

  const endPoint = blocked ? geometry.blockPoint : geometry.targetEntry;

  return (
    <div data-diagram className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${geometry.viewW} ${geometry.viewH}`}
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
          <rect width={geometry.viewW} height={geometry.viewH} rx={16} style={{ fill: PALETTE.paper.fill }} />
          <rect width={geometry.viewW} height={geometry.viewH} rx={16} fill={`url(#${gridId})`} opacity={0.7} />

          {/* Dashed connectors: every actor to the shield, the shield to the target. */}
          {scenario.actors.map((actor, i) => {
            const slot = geometry.actors[i];
            const isActive = row?.actorId === actor.id;
            const style: CSSProperties = isActive
              ? { stroke: color }
              : { stroke: PALETTE.idle.stroke };
            return (
              <path
                key={`edge-${actor.id}`}
                className="diagram-edge"
                d={slot.blocked}
                fill="none"
                style={style}
                strokeWidth={isActive ? 2.5 : 1.5}
                strokeDasharray={isActive ? undefined : "6 6"}
                opacity={row && !isActive ? 0.45 : 1}
              />
            );
          })}
          <path
            className="diagram-edge"
            d={geometry.throughPath}
            fill="none"
            style={{ stroke: PALETTE.idle.stroke }}
            strokeWidth={1.5}
            strokeDasharray="6 6"
          />
        </g>

        {scenario.actors.map((actor, i) => {
          const slot = geometry.actors[i];
          const palette = PALETTE[actor.role];
          const active = row?.actorId === actor.id;
          const nameLines = wrap(actor.name, 20, 2);
          const cx = slot.box.x + slot.box.w / 2;
          const cy = slot.box.y + slot.box.h / 2;
          return (
            <g
              key={actor.id}
              data-node="actor"
              data-actor-id={actor.id}
              data-active={active ? "true" : undefined}
            >
              <title>{`${actor.name} (${ROLE_LABEL[actor.role]})`}</title>
              <NodeBox
                x={slot.box.x}
                y={slot.box.y}
                w={slot.box.w}
                h={slot.box.h}
                palette={row ? palette : PALETTE.idle}
                strong={active}
                shadowId={shadowId}
              />
              <g aria-hidden="true">
                <text x={cx} y={cy - 10} textAnchor="middle" className="fill-ink text-xs font-bold">
                  {nameLines.map((line, lineIndex) => (
                    <tspan key={lineIndex} x={cx} dy={lineIndex === 0 ? 0 : 14}>
                      {line}
                    </tspan>
                  ))}
                </text>
                <text x={cx} y={cy + 20} textAnchor="middle" className="fill-muted" fontSize={smallText}>
                  {ROLE_LABEL[actor.role]}
                </text>
              </g>
            </g>
          );
        })}

        <g data-node="shield" aria-hidden="true">
          <title>Tu configuración activa</title>
          <NodeBox
            x={shield.x}
            y={shield.y}
            w={shield.w}
            h={shield.h}
            palette={PALETTE.shield}
            shadowId={shadowId}
          />
          <text x={shield.x + shield.w / 2} y={shield.y + 26} textAnchor="middle" className="fill-ink text-xs font-bold">
            Tu configuración
          </text>
          {shieldLines.map((line, i) => (
            <text key={i} x={shield.x + shield.w / 2} y={shield.y + 50 + i * 16} textAnchor="middle" fontSize={smallText} className="fill-ink">
              {line}
            </text>
          ))}
          {shieldMore > 0 ? (
            <text x={shield.x + shield.w / 2} y={shield.y + 50 + 3 * 16} textAnchor="middle" fontSize={smallText} className="fill-muted">
              {`+${shieldMore} más`}
            </text>
          ) : null}
        </g>

        <g data-node="target" aria-hidden="true">
          <title>{scenario.wording.targetLabel}</title>
          {row && row.outcome === "detectado" ? (
            <rect
              x={target.x - 7}
              y={target.y - 7}
              width={target.w + 14}
              height={target.h + 14}
              rx={20}
              fill="none"
              style={{ stroke: PALETTE.targetDetectado.stroke }}
              strokeWidth={3}
            />
          ) : null}
          <NodeBox
            x={target.x}
            y={target.y}
            w={target.w}
            h={target.h}
            palette={targetPalette}
            shadowId={shadowId}
          />
          <text x={target.x + target.w / 2} y={target.y + target.h / 2 - 12} textAnchor="middle" className="fill-ink text-sm font-bold">
            {targetLines.map((line, i) => (
              <tspan key={i} x={target.x + target.w / 2} dy={i === 0 ? 0 : 16}>
                {line}
              </tspan>
            ))}
          </text>
          <text x={target.x + target.w / 2} y={target.y + target.h / 2 + 26} textAnchor="middle" fontSize={smallText} className="fill-muted">
            Destino
          </text>
        </g>

        {row && activeSlot !== null ? (
          <g aria-hidden="true">
            {/* Edge label: origin and count of the current step. */}
            <g>
              <rect
                x={activeSlot.label.x - 46}
                y={activeSlot.label.y - 17}
                width={92}
                height={34}
                rx={6}
                style={{ fill: PALETTE.paper.fill, stroke: PALETTE.idle.stroke }}
              />
              <text x={activeSlot.label.x} y={activeSlot.label.y - 3} textAnchor="middle" fontSize={smallText} className="fill-ink font-mono font-bold">
                {originOf(row)}
              </text>
              <text x={activeSlot.label.x} y={activeSlot.label.y + 10} textAnchor="middle" fontSize={smallText} className="fill-muted">
                {`×${row.count} ${row.count === 1 ? "evento" : "eventos"}`}
              </text>
            </g>

            {blocked ? (
              <g transform={`translate(${geometry.blockPoint.x}, ${geometry.blockPoint.y})`}>
                <circle r={11} style={{ fill: PALETTE.target.stroke }} />
                <text y={4} textAnchor="middle" fontSize={12} fontWeight={700} style={{ fill: PALETTE.paper.fill }}>
                  ✕
                </text>
              </g>
            ) : null}

            {reducedMotion ? (
              <circle
                cx={endPoint.x}
                cy={endPoint.y}
                r={PACKET_RADIUS}
                style={{ fill: color, stroke: PALETTE.paper.fill }}
                strokeWidth={2}
              />
            ) : (
              <circle
                key={`${index}-${replay}`}
                cx={activeSlot.anchor.x}
                cy={activeSlot.anchor.y}
                r={PACKET_RADIUS}
                style={{ fill: color, stroke: PALETTE.paper.fill }}
                strokeWidth={2}
              >
                <animateMotion
                  dur={`${PACKET_MS}ms`}
                  fill="freeze"
                  {...PACKET_SPLINE}
                  {...{ path: blocked ? activeSlot.blocked : activeSlot.delivered }}
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
