"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatClock, type TimelineRow } from "@/lib/engine/summary";
import type { Config, Outcome, Scenario } from "@/lib/engine/types";
import { OUTCOME_LABEL, ROLE_LABEL } from "./labels";

interface NetworkDiagramProps {
  scenario: Scenario;
  /** The configuration that was simulated; its enabled defenses fill the config node. */
  config: Config;
  /** Timeline rows of the last simulation, or null before the first one. */
  rows: TimelineRow[] | null;
  /** Stepper index: 0 is the configuration, 1..rows.length an event, rows.length + 1 the summary. */
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
  /** Center of the origin label shown while the actor is active. */
  label: Point;
  /** Route from the actor to the shield's entry edge (used when the packet is blocked). */
  blocked: string;
  /** Route from the actor through the shield to the target. */
  delivered: string;
}

interface Geometry {
  viewW: number;
  viewH: number;
  actors: ActorSlot[];
  shield: Box;
  target: Box;
  blockPoint: Point;
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

// Portrait (phones): actors stacked on the right, a rail on the left, shield in the middle
// and target at the bottom. One unit is about one CSS pixel at 320px.
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

/** Time between automatic steps while the game plays. */
const PLAY_MS = 2600;

const PACKET_CLASS: Record<Outcome, string> = {
  permitido: "p-g",
  bloqueado: "p-s",
  detectado: "p-a",
  no_detectado: "p-r",
};

const TARGET_CLASS: Record<Outcome, string> = {
  permitido: "node-g",
  bloqueado: "node-t",
  detectado: "node-a",
  no_detectado: "node-r",
};

const RING_COLOR: Record<Outcome, string> = {
  permitido: "var(--g-dot)",
  bloqueado: "var(--s-dot)",
  detectado: "var(--a-dot)",
  no_detectado: "var(--r-dot)",
};

/** Phones and narrow tablets get the portrait layout. Matches Tailwind's `sm` breakpoint minus 1px. */
const PORTRAIT_QUERY = "(max-width: 639px)";

function subscribePortrait(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(PORTRAIT_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function usePortrait(): boolean {
  return useSyncExternalStore(
    subscribePortrait,
    () => typeof window.matchMedia === "function" && window.matchMedia(PORTRAIT_QUERY).matches,
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
      label: { x: (ACTOR_RIGHT + SHIELD_LEFT) / 2, y: (y + SHIELD.cy) / 2 },
      blocked,
      delivered: `${blocked} L ${SHIELD_RIGHT} ${SHIELD.cy} ${curve(SHIELD_RIGHT, SHIELD.cy, TARGET_X, TARGET_CY)}`,
    };
  });
  return {
    viewW: LANDSCAPE_W,
    viewH: LANDSCAPE_H,
    actors,
    shield: { x: SHIELD_LEFT, y: SHIELD.cy - SHIELD.h / 2, w: SHIELD.w, h: SHIELD.h },
    target: { x: TARGET_X, y: TARGET_CY - TARGET_H / 2, w: TARGET_W, h: TARGET_H },
    blockPoint: { x: SHIELD_LEFT, y: SHIELD.cy },
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
      label: { x: (P_RAIL_X + P_ACTOR_X) / 2, y },
      blocked,
      delivered: `${blocked} L ${P_CX} ${shieldCy} L ${P_CX} ${target.y}`,
    };
  });

  return {
    viewW: PORTRAIT_W,
    viewH: target.y + P_TARGET_H + PORTRAIT_PAD,
    actors,
    shield,
    target,
    blockPoint: { x: shield.x, y: shieldCy },
    throughPath: `M ${P_CX} ${shield.y + shield.h} L ${P_CX} ${target.y}`,
  };
}

function originOf(row: TimelineRow): string {
  return row.ip ?? `${row.ipCount} IPs`;
}

/**
 * The network as HTML nodes on a fixed-size stage, scaled down to fit the column. The
 * packets travel with CSS offset-path; the stage is in CSS pixels, so the paths match.
 */
export default function NetworkDiagram({
  scenario,
  config,
  rows,
  step,
  onStepChange,
}: NetworkDiagramProps) {
  const portrait = usePortrait();
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState(0);

  const last = rows ? rows.length + 1 : 0;
  const index = rows && step >= 1 && step <= rows.length ? step - 1 : -1;
  const row = rows && index >= 0 ? rows[index] : null;

  const geometry = useMemo(
    () => (portrait ? portraitGeometry(scenario.actors.length) : landscapeGeometry(scenario.actors.length)),
    [portrait, scenario.actors.length],
  );
  const { viewW, viewH, shield, target } = geometry;

  // Fit the fixed-size stage into the available width. Never scales up.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth;
      // Fill the card: scale up on wide screens too, capped so text never gets oversized.
      if (width > 0) setScale(Math.min(1.4, width / viewW));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewW]);

  // Autoplay: one step every PLAY_MS. Stops itself on the summary.
  useEffect(() => {
    if (!playing || !rows || step >= last) return;
    const timer = window.setTimeout(() => {
      if (step + 1 >= last) setPlaying(false);
      onStepChange(step + 1);
    }, PLAY_MS);
    return () => window.clearTimeout(timer);
  }, [playing, rows, step, last, onStepChange]);

  function togglePlay() {
    if (!rows) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (step < 1 || step >= last) onStepChange(1);
    setPlaying(true);
  }

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

  const actorIndex = new Map(scenario.actors.map((actor, i) => [actor.id, i]));
  const activeSlot = row ? (geometry.actors[actorIndex.get(row.actorId) ?? 0] ?? null) : null;
  const blocked = row?.outcome === "bloqueado";
  const route = activeSlot ? (blocked ? activeSlot.blocked : activeSlot.delivered) : "";
  const motionKey = `${index}-${replay}`;

  const label =
    row && rows
      ? `Paso ${index + 1} de ${rows.length}: ${row.actorName} (${ROLE_LABEL[row.role]}) desde ${originOf(row)}, resultado: ${OUTCOME_LABEL[row.outcome]}. Destino: ${scenario.wording.targetLabel}.`
      : `Diagrama de red del escenario. ${scenario.wording.targetLabel} todavía sin tráfico.`;

  const targetLines = wrap(scenario.wording.targetLabel, 18, 2);
  const shieldLines = enabledToggles.length
    ? enabledToggles.slice(0, 3).flatMap((text) => wrap(text, 17, 2))
    : ["Ninguna activa"];
  const shieldMore = enabledToggles.length - 3;

  return (
    <div data-diagram className="flex flex-col gap-3">
      <div
        ref={stageRef}
        role="img"
        aria-label={label}
        className="relative w-full overflow-hidden"
        style={{ height: viewH * scale }}
      >
        <div
          aria-hidden="true"
          className="gridpaper absolute top-0 left-0 overflow-hidden rounded-xl"
          style={{ width: viewW, height: viewH, transform: `scale(${scale})`, transformOrigin: "0 0" }}
        >
          <svg
            aria-hidden="true"
            width={viewW}
            height={viewH}
            viewBox={`0 0 ${viewW} ${viewH}`}
            className="absolute top-0 left-0 overflow-visible"
          >
            {scenario.actors.map((actor, i) => (
              <path key={`edge-${actor.id}`} d={geometry.actors[i].blocked} className="edge" />
            ))}
            <path d={geometry.throughPath} className="edge" />
            {route ? <path d={route} className="edge edge-on" /> : null}
          </svg>

          {scenario.actors.map((actor, i) => {
            const slot = geometry.actors[i];
            const active = row?.actorId === actor.id;
            // "Ana, administradora de la oficina" -> "Ana": full names live in the step panel.
            const names = wrap(actor.name.split(",")[0], 17, 2);
            return (
              <div
                key={actor.id}
                data-node="actor"
                data-actor-id={actor.id}
                data-name={actor.name}
                data-active={active ? "true" : undefined}
                className={`node ${actor.role === "atacante" ? "node-r" : "node-g"}${row && !active ? " node-dim" : ""}`}
                style={{ left: slot.box.x, top: slot.box.y, width: slot.box.w, height: slot.box.h }}
              >
                {names.map((line, lineIndex) => (
                  <span key={lineIndex} className="block text-[13px] leading-tight font-bold">
                    {line}
                  </span>
                ))}
                <span className="mt-1 text-[11px] opacity-85">{ROLE_LABEL[actor.role]}</span>
              </div>
            );
          })}

          <div
            data-node="shield"
            className="node node-l"
            style={{ left: shield.x, top: shield.y, width: shield.w, height: shield.h }}
          >
            <span className="text-[13px] leading-tight font-extrabold">Tu configuración</span>
            {shieldLines.map((line, lineIndex) => (
              <span key={lineIndex} className="text-[11px] leading-snug">
                {line}
              </span>
            ))}
            {shieldMore > 0 ? <span className="text-[11px] opacity-85">{`+${shieldMore} más`}</span> : null}
          </div>

          <div
            data-node="target"
            data-name={scenario.wording.targetLabel}
            className={`node ${row ? TARGET_CLASS[row.outcome] : "node-t"}`}
            style={{ left: target.x, top: target.y, width: target.w, height: target.h }}
          >
            {targetLines.map((line, lineIndex) => (
              <span key={lineIndex} className="block text-[13px] leading-tight font-bold">
                {line}
              </span>
            ))}
            <span className="mt-1 text-[11px] opacity-85">Destino</span>
          </div>

          {row && activeSlot ? (
            // Keyed by step and replay: a new step or "Repetir paso" remounts the packet.
            <div key={motionKey} aria-hidden="true" className="pointer-events-none absolute inset-0">
              {[`packet ${PACKET_CLASS[row.outcome]}`, `packet trail1 ${PACKET_CLASS[row.outcome]}`, `packet trail2 ${PACKET_CLASS[row.outcome]}`].map(
                (className) => (
                  <span key={className} className={className} style={{ offsetPath: `path("${route}")` }} />
                ),
              )}
              {blocked ? (
                <span
                  className="stopx text-sm font-bold"
                  style={{ left: geometry.blockPoint.x, top: geometry.blockPoint.y }}
                >
                  ✕
                </span>
              ) : (
                <span
                  className="ring"
                  style={{
                    left: target.x - 6,
                    top: target.y - 6,
                    width: target.w + 12,
                    height: target.h + 12,
                    borderColor: RING_COLOR[row.outcome],
                  }}
                />
              )}
              <div
                className="absolute"
                style={{
                  left: activeSlot.label.x,
                  top: activeSlot.label.y,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <span className="elabel">{`${originOf(row)} · ${formatClock(row.tStart)}`}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {rows === null ? (
        <p className="text-center text-sm text-muted">Simulá para ver el tráfico</p>
      ) : row === null ? (
        <p className="text-center text-sm text-muted">Pulsa Siguiente para ver el tráfico</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary flex-1"
          disabled={!row}
          onClick={() => setReplay((n) => n + 1)}
        >
          Repetir paso
        </button>
        <button type="button" className="btn btn-secondary flex-1" disabled={!rows} onClick={togglePlay}>
          {playing ? "Pausar" : "Reproducir partida"}
        </button>
      </div>
    </div>
  );
}
