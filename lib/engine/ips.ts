/**
 * Only documentation-reserved addresses (RFC 5737) may appear in scenarios,
 * so nothing in the simulation can ever point at a real host.
 */

export const DOCUMENTATION_RANGES = [
  "192.0.2.0/24",
  "198.51.100.0/24",
  "203.0.113.0/24",
] as const;

const PREFIX_OF_RANGE: Record<string, string> = {
  "192.0.2.0/24": "192.0.2",
  "198.51.100.0/24": "198.51.100",
  "203.0.113.0/24": "203.0.113",
};

export function isDocumentationRange(cidr: string): boolean {
  return cidr in PREFIX_OF_RANGE;
}

export function isDocumentationIp(ip: string): boolean {
  const match = /^(192\.0\.2|198\.51\.100|203\.0\.113)\.(\d{1,3})$/.exec(ip);
  if (!match) return false;
  const host = Number(match[2]);
  return host >= 1 && host <= 254;
}

/** Usable host addresses (.1 to .254) of one of the documentation /24 ranges. */
export function hostsOfRange(cidr: string): string[] {
  const prefix = PREFIX_OF_RANGE[cidr];
  if (!prefix) throw new Error(`Not a documentation range: ${cidr}`);
  return Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
}
