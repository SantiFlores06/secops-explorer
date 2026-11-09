import type { Config, FactValue, MailProfile, Scenario } from "./types";

/**
 * Email authentication facts (SPF, DKIM, DMARC) for one message.
 *
 * Pure: the same scenario, config and profile always give the same facts.
 */

/** Facts this module adds to the rule engine, besides the scenario's controls. */
export const MAIL_FACTS = ["dmarc_resultado", "dmarc_accion"] as const;

export type DmarcAction = "entregar" | "cuarentena" | "rechazar";

/**
 * DMARC passes when SPF or DKIM passes for the sender:
 * - Our own servers pass SPF whenever the record exists, and DKIM when signing is on.
 * - The provider passes SPF only when the record authorizes it. DKIM never covers it.
 * - A foreign server never passes.
 */
function dmarcPasses(mail: MailProfile, config: Config): boolean {
  const spf =
    mail.server === "propio"
      ? config.spf !== "none"
      : mail.server === "proveedor" && config.spf === "con_proveedor";
  const dkim = mail.server === "propio" && config.dkim === true;
  return spf || dkim;
}

/**
 * The published policy only acts on mail from the protected domain, and only
 * when DMARC fails. `none` delivers the message and leaves the outcome to the
 * reports rules.
 */
export function mailFacts(scenario: Scenario, config: Config, mail: MailProfile): Record<string, FactValue> {
  const pass = dmarcPasses(mail, config);
  const protectedMail =
    scenario.protectedDomain !== undefined && mail.fromDomain === scenario.protectedDomain;

  let action: DmarcAction = "entregar";
  if (protectedMail && !pass) {
    if (config.dmarc === "quarantine") action = "cuarentena";
    if (config.dmarc === "reject") action = "rechazar";
  }

  return {
    dmarc_resultado: pass ? "pass" : "fail",
    dmarc_accion: action,
  };
}
