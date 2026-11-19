import type { Config, FactValue, WebProfile } from "./types";

/**
 * Web security facts (CSP, HSTS, cookies, framing) for one request or script.
 *
 * Pure: the same config and profile always give the same facts. Each fact is a
 * single yes/no question, because rules only combine facts with AND.
 */

/** Facts this module adds to the rule engine, besides the scenario's controls. */
export const WEB_FACTS = [
  "vector",
  "proveedor_autorizado",
  "csp_bloquea_xss",
  "cookie_httponly",
] as const;

/**
 * - The provider's chat script runs under every policy except a strict CSP that
 *   does not list the provider.
 * - A strict CSP (with or without the provider) stops injected inline scripts.
 * - HttpOnly cookies cannot be read by script, even when the script runs.
 */
export function webFacts(config: Config, profile: WebProfile): Record<string, FactValue> {
  const strictCsp = config.csp === "estricta" || config.csp === "estricta_con_proveedor";

  return {
    vector: profile.vector,
    proveedor_autorizado: config.csp !== "estricta",
    csp_bloquea_xss: strictCsp,
    cookie_httponly: config.cookies === "secure_httponly" || config.cookies === "secure_httponly_samesite",
  };
}
