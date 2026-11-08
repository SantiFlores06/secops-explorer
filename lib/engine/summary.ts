import type { AuthAction, Credential, Outcome, Role, SimEvent } from "./types";

export interface TimelineRow {
  key: string;
  tStart: number;
  tEnd: number;
  /** How many raw events this row stands for. */
  count: number;
  /** Distinct source IPs behind the row. */
  ipCount: number;
  actorId: string;
  actorName: string;
  role: Role;
  action: AuthAction;
  /** Set only when every event in the row used the same user. */
  user: string | null;
  /** Set only when every event in the row came from the same IP. */
  ip: string | null;
  /** Set only when every event in the row carried the same credential validity. */
  credential: Credential | null;
  outcome: Outcome;
  explanationKey: string;
  /** How many events in the row made the server ban an IP. */
  bans: number;
}

/**
 * Turns the raw event list into rows a person can read.
 *
 * Legitimate activity is shown event by event, because every one of them
 * matters. Attacker activity is folded by actor, outcome and reason: a botnet
 * trying hundreds of passwords becomes a handful of rows with a count.
 */
export function summarizeEvents(events: SimEvent[]): TimelineRow[] {
  const rows = new Map<
    string,
    TimelineRow & { ips: Set<string>; users: Set<string>; credentials: Set<Credential> }
  >();

  for (const event of events) {
    const key =
      event.role === "legitimo"
        ? `evento-${event.index}`
        : `${event.actorId}|${event.outcome}|${event.explanationKey}`;

    const existing = rows.get(key);
    if (existing) {
      existing.count += 1;
      existing.tEnd = Math.max(existing.tEnd, event.t);
      existing.tStart = Math.min(existing.tStart, event.t);
      existing.ips.add(event.ip);
      existing.users.add(event.user);
      existing.credentials.add(event.credential);
      if (event.banned) existing.bans += 1;
      continue;
    }

    rows.set(key, {
      key,
      tStart: event.t,
      tEnd: event.t,
      count: 1,
      ipCount: 1,
      actorId: event.actorId,
      actorName: event.actorName,
      role: event.role,
      action: event.action,
      user: event.user,
      ip: event.ip,
      credential: event.credential,
      outcome: event.outcome,
      explanationKey: event.explanationKey,
      bans: event.banned ? 1 : 0,
      ips: new Set([event.ip]),
      users: new Set([event.user]),
      credentials: new Set([event.credential]),
    });
  }

  return [...rows.values()]
    .map(({ ips, users, credentials, ...row }) => ({
      ...row,
      ipCount: ips.size,
      ip: ips.size === 1 ? [...ips][0] : null,
      user: users.size === 1 ? [...users][0] : null,
      credential: credentials.size === 1 ? [...credentials][0] : null,
    }))
    .sort((a, b) => a.tStart - b.tStart || a.key.localeCompare(b.key));
}

/** Formats seconds as mm:ss for the simulated clock. */
export function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
