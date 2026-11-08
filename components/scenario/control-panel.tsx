"use client";

import { useState } from "react";
import type {
  Config,
  ControlDef,
  ControlValue,
  EnumControl,
  NumberControl,
  ToggleControl,
} from "@/lib/engine/types";

interface ControlPanelProps {
  controls: ControlDef[];
  config: Config;
  onChange: (controlId: string, value: ControlValue) => void;
}

export default function ControlPanel({ controls, config, onChange }: ControlPanelProps) {
  return (
    <fieldset className="flex flex-col gap-5">
      <legend className="mb-3 text-lg font-semibold">Configuración del servidor</legend>
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
    </fieldset>
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
          className="mt-0.5 size-5 shrink-0 accent-sky-700"
        />
        <span className="font-medium">
          {control.label}{" "}
          <span className="font-normal text-zinc-600 dark:text-zinc-400">
            ({value ? "activado" : "desactivado"})
          </span>
        </span>
      </label>
      <p id={helpId} className="ml-8 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
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
      <label htmlFor={inputId} className="font-medium">
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
          className="field w-28"
        />
        {control.unit ? (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{control.unit}</span>
        ) : null}
      </div>
      <p id={helpId} className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
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
      <label htmlFor={selectId} className="font-medium">
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
      <p id={helpId} className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
        {control.help}
      </p>
    </div>
  );
}
