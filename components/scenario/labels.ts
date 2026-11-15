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
};

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

/** Tailwind classes per valence. `rail` is the row marker; `pill` is the text status. */
export const VALENCE_STYLE: Record<Valence, { rail: string; pill: string; meaning: string }> = {
  good: {
    rail: "bg-defense",
    pill: "border-defense/60 bg-defense/10 text-defense",
    meaning: "Resultado favorable",
  },
  warn: {
    rail: "bg-caution",
    pill: "border-caution/60 bg-caution/10 text-caution",
    meaning: "Resultado con reservas",
  },
  bad: {
    rail: "bg-alert",
    pill: "border-alert/60 bg-alert/10 text-alert",
    meaning: "Resultado desfavorable",
  },
  neutral: {
    rail: "bg-idle",
    pill: "border-idle/60 bg-idle/10 text-idle",
    meaning: "Resultado esperado",
  },
};
