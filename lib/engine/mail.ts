import type { Config, FactValue, MailProfile, Scenario } from "./types";

/**
 * Email authentication facts (SPF, DKIM, DMARC) for one message.
 *
 * Pure: the same scenario, config, profile and roll always give the same facts.
 * The roll is drawn once per message when the timeline is built, so it never
 * depends on the configuration.
 */

/** Facts this module adds to the rule engine, besides the scenario's controls. */
export const MAIL_FACTS = [
  "dominio_protegido",
  "spf_resultado",
  "dkim_resultado",
  "dmarc_resultado",
  "dmarc_accion",
] as const;

type Check = "pass" | "fail" | "none";
type Alignment = "relaxed" | "strict";
export type DmarcAction = "entregar" | "cuarentena" | "rechazar";

/** Approximates the organizational domain by its last two labels (news.example.com -> example.com). */
function organizationalDomain(domain: string): string {
  return domain.split(".").slice(-2).join(".");
}

function aligned(signingDomain: string | null, fromDomain: string, mode: Alignment): boolean {
  if (signingDomain === null) return false;
  return mode === "strict"
    ? signingDomain === fromDomain
    : organizationalDomain(signingDomain) === organizationalDomain(fromDomain);
}

/**
 * SPF and DKIM are checked, aligned against the From domain, and DMARC passes
 * when at least one of them is aligned. Then the policy decides what happens
 * to a failing message, but only for the share of messages `pct` selects.
 */
export function mailFacts(
  scenario: Scenario,
  config: Config,
  mail: MailProfile,
  roll: number,
): Record<string, FactValue> {
  const spfEnabled = config.spf !== "off";
  let spf: Check;
  if (mail.spf === "tercero") spf = "pass";
  else if (!spfEnabled) spf = "none";
  else spf = mail.spf === "propio" ? "pass" : "fail";
  const spfAligned = spf === "pass" && mail.spf === "propio";

  const signed =
    mail.signing === "tercero" ||
    ((mail.signing === "propia" || mail.signing === "delegada") && config.dkim === true);
  const dkim: Check = signed ? "pass" : "none";
  const alignment: Alignment = config.alineacion === "strict" ? "strict" : "relaxed";
  const dkimAligned = signed && aligned(mail.signingDomain, mail.fromDomain, alignment);

  const dmarc: Check = spfAligned || dkimAligned ? "pass" : "fail";
  const protectedMail =
    scenario.protectedDomain !== undefined && mail.fromDomain === scenario.protectedDomain;

  let action: DmarcAction = "entregar";
  if (protectedMail && dmarc === "fail" && roll < Number(config.pct)) {
    if (config.politica === "quarantine") action = "cuarentena";
    if (config.politica === "reject") action = "rechazar";
  }

  return {
    dominio_protegido: protectedMail,
    spf_resultado: spf,
    dkim_resultado: dkim,
    dmarc_resultado: dmarc === "pass" ? "pass" : "fail",
    dmarc_accion: action,
  };
}
