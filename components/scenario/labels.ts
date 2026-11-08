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

export const VALENCE_STYLE: Record<
  Valence,
  { border: string; badge: string; meaning: string }
> = {
  good: {
    border: "border-l-emerald-600",
    badge: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    meaning: "Resultado favorable",
  },
  warn: {
    border: "border-l-amber-500",
    badge: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    meaning: "Resultado con reservas",
  },
  bad: {
    border: "border-l-rose-600",
    badge: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
    meaning: "Resultado desfavorable",
  },
  neutral: {
    border: "border-l-zinc-400",
    badge: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
    meaning: "Resultado esperado",
  },
};
