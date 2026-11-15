"use client";

import { useId, useState } from "react";
import type {
  Config,
  ControlDef,
  ControlValue,
  EnumControl,
  NumberControl,
  ToggleControl,
} from "@/lib/engine/types";

interface ControlPanelProps {
  title: string;
  controls: ControlDef[];
  config: Config;
  onChange: (controlId: string, value: ControlValue) => void;
}

export default function ControlPanel({ title, controls, config, onChange }: ControlPanelProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="panel">
      <div className="panel-head">
        <h2 id={titleId} className="label-caps">
          {title}
        </h2>
      </div>
      <div role="group" aria-labelledby={titleId} className="flex flex-col gap-5 p-4">
        {controls.map((control) => {
          if (control.kind === "toggle") {
            return (
              <ToggleField
                key={control.id}
                control={control}
                value={config[control.id] === true}
                onChange={(value) => onChange(control.id, value)}
              />
            );
          }
          if (control.kind === "enum") {
            return (
              <EnumField
                key={control.id}
                control={control}
                value={String(config[control.id])}
                onChange={(value) => onChange(control.id, value)}
              />
            );
          }
          return (
            <NumberField
              key={control.id}
              control={control}
              value={Number(config[control.id])}
              onChange={(value) => onChange(control.id, value)}
            />
          );
        })}
      </div>
    </section>
  );
}

function ToggleField({
  control,
  value,
  onChange,
}: {
  control: ToggleControl;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const helpId = `${control.id}-ayuda`;
  return (
    <div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          role="switch"
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={helpId}
          className="mt-0.5 size-5 shrink-0 accent-defense"
        />
        <span className="font-bold">
          {control.label}{" "}
          <span className="font-normal text-muted">({value ? "activado" : "desactivado"})</span>
        </span>
      </label>
      <p id={helpId} className="ml-8 text-xs leading-5 text-muted">
        {control.help}
      </p>
    </div>
  );
}

function clamp(control: NumberControl, raw: number): number {
  return Math.min(control.max, Math.max(control.min, Math.round(raw)));
}

function NumberField({
  control,
  value,
  onChange,
}: {
  control: NumberControl;
  value: number;
  onChange: (value: number) => void;
}) {
  // While typing, the field keeps the raw text; the clamped value is applied
  // immediately and the text is normalized when the field loses focus.
  const [draft, setDraft] = useState<string | null>(null);
  const inputId = `${control.id}-campo`;
  const helpId = `${control.id}-ayuda`;

  return (
    <div>
      <label htmlFor={inputId} className="font-bold">
        {control.label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={control.min}
          max={control.max}
          step={1}
          value={draft ?? String(value)}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            const parsed = Number(text);
            if (text.trim() !== "" && Number.isFinite(parsed)) onChange(clamp(control, parsed));
          }}
          onBlur={() => setDraft(null)}
          aria-describedby={helpId}
          className="field w-28 tabular-nums"
        />
        {control.unit ? <span className="text-xs text-muted">{control.unit}</span> : null}
      </div>
      <p id={helpId} className="mt-1 text-xs leading-5 text-muted">
        {control.help} Valores de {control.min} a {control.max}.
      </p>
    </div>
  );
}

function EnumField({
  control,
  value,
  onChange,
}: {
  control: EnumControl;
  value: string;
  onChange: (value: string) => void;
}) {
  const selectId = `${control.id}-campo`;
  const helpId = `${control.id}-ayuda`;

  return (
    <div>
      <label htmlFor={selectId} className="font-bold">
        {control.label}
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={helpId}
        className="field mt-1 w-full"
      >
        {control.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p id={helpId} className="mt-1 text-xs leading-5 text-muted">
        {control.help}
      </p>
    </div>
  );
}
