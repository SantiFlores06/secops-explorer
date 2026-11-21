import type { Config, FactValue, StorageProfile } from "./types";

/**
 * Storage access facts (public access, signed URLs) for one request to the bucket.
 *
 * Pure: the same config and profile always give the same facts. Each fact is a
 * single yes/no question, because rules only combine facts with AND. The raw
 * controls (acceso, urls_firmadas, registro) are already facts, so this module
 * only adds the questions that group several options together.
 */

/** Facts this module adds to the rule engine, besides the scenario's controls. */
export const STORAGE_FACTS = [
  "vector",
  "acceso_publico",
  "acceso_privado",
  "descarga_permitida",
] as const;

/**
 * - Public access lets anyone who knows an object's address download it.
 * - Private access closes the bucket to direct requests. Only the private
 *   option without a CDN also closes the shop's images, because nothing else
 *   reads the bucket for the website.
 * - A partner can download a report when the bucket is public (any link works)
 *   or when signed URLs are on (the link carries its own expiring permission).
 */
export function storageFacts(config: Config, profile: StorageProfile): Record<string, FactValue> {
  const publicAccess = config.acceso === "publico";

  return {
    vector: profile.vector,
    acceso_publico: publicAccess,
    acceso_privado: config.acceso === "privado",
    descarga_permitida: publicAccess || config.urls_firmadas === true,
  };
}
