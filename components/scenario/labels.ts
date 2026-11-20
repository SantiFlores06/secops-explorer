import type { AttackerStatus, AuthAction, Credential, Outcome, Role } from "@/lib/engine/types";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  permitido: "Permitido",
  bloqueado: "Bloqueado",
  detectado: "Detectado",
  no_detectado: "No detectado",
};

export const ACTION_LABEL: Record<AuthAction, string> = {
  login_clave: "clave pública",
  login_password: "contraseña",
  enviar_correo: "correo",
  visitar_web: "visita web",
  iniciar_sesion_portal: "inicio de sesión web",
};

/** Human name for a scenario track id; unknown ids fall back to the id itself. */
const TRACK_LABEL: Record<string, string> = {
  hardening: "Hardening",
  correo: "Correo",
  "web-appsec": "Web y AppSec",
  identidad: "Identidad y acceso",
};

export function trackLabel(track: string): string {
  return TRACK_LABEL[track] ?? track;
}

export const ROLE_LABEL: Record<Role, string> = {
  legitimo: "Equipo legítimo",
  atacante: "Atacante",
};

export const ATTACKER_STATUS_LABEL: Record<AttackerStatus, string> = {
  detenido: "Detenido",
  detectado: "Entró, pero se detectó",
  comprometido: "Entró sin ser detectado",
};

export type Valence = "good" | "warn" | "bad" | "neutral";

/** Whether an outcome is good news for the defender, given who acted. */
export function valenceOf(role: Role, outcome: Outcome, credential: Credential | null): Valence {
  if (role === "legitimo") {
    if (outcome === "permitido") return "good";
    // A legitimate user mistyping is expected; it is not the defender's fault.
    return credential === "invalida" ? "neutral" : "bad";
  }
  if (outcome === "bloqueado") return "good";
  return outcome === "detectado" ? "warn" : "bad";
}

export function attackerValence(status: AttackerStatus): Valence {
  return status === "detenido" ? "good" : status === "detectado" ? "warn" : "bad";
}

/**
 * Pastel chip per outcome. The text label is always shown next to the color,
 * so the color is never the only signal.
 */
export const OUTCOME_CHIP: Record<Outcome, string> = {
  permitido: "chip-green",
  bloqueado: "chip-slate",
  detectado: "chip-amber",
  no_detectado: "chip-red",
};

/** Tailwind classes per valence. `rail` is the row marker; `chip` is the text status. */
export const VALENCE_STYLE: Record<Valence, { rail: string; chip: string; meaning: string }> = {
  good: {
    rail: "bg-green-ink",
    chip: "chip-green",
    meaning: "Resultado favorable",
  },
  warn: {
    rail: "bg-amber-ink",
    chip: "chip-amber",
    meaning: "Resultado con reservas",
  },
  bad: {
    rail: "bg-red-ink",
    chip: "chip-red",
    meaning: "Resultado desfavorable",
  },
  neutral: {
    rail: "bg-slate-ink",
    chip: "chip-slate",
    meaning: "Resultado esperado",
  },
};
