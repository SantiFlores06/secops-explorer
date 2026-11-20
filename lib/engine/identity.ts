import type { Config, FactValue, IdentityProfile } from "./types";

/**
 * Identity and access facts (MFA, password policy, lockout) for one login attempt.
 *
 * Pure: the same config and profile always give the same facts. Each fact is a
 * single yes/no question, because rules only combine facts with AND. The raw
 * control values (mfa, contrasenas, bloqueo) are already facts, so this module
 * only adds the questions that group several options together.
 */

/** Facts this module adds to the rule engine, besides the scenario's controls. */
export const IDENTITY_FACTS = [
  "vector",
  "mfa_activo",
  "mfa_fatiga_resistente",
  "mfa_resistente_phishing",
  "contrasena_fuerte",
] as const;

/**
 * - Any second factor stops a stolen password alone.
 * - Push without number matching lets a fatigued user approve the attacker's
 *   prompt, so it does not count as fatigue-resistant.
 * - Only FIDO2 keys and passkeys are bound to the real origin, so a proxy
 *   site cannot relay them.
 */
export function identityFacts(config: Config, profile: IdentityProfile): Record<string, FactValue> {
  const mfa = config.mfa;

  return {
    vector: profile.vector,
    mfa_activo: mfa !== "none",
    mfa_fatiga_resistente: mfa !== "none" && mfa !== "push",
    mfa_resistente_phishing: mfa === "fido2",
    contrasena_fuerte: config.contrasenas === "larga_y_filtradas",
  };
}
