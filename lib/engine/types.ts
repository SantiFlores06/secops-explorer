/**
 * Domain types for the simulation engine.
 *
 * The engine is pure and deterministic: it knows nothing about React, the DOM
 * or the network. Property names are English; string *values* that come from
 * scenario files (outcomes, actions, roles) keep their Spanish data spelling.
 */

export type Outcome = "permitido" | "bloqueado" | "detectado" | "no_detectado";
export type Role = "legitimo" | "atacante";
/** What an actor tries: log in (SSH scenario) or send a message (DMARC scenario). */
export type AuthAction = "login_clave" | "login_password" | "enviar_correo";
export type Credential = "valida" | "invalida";

export type ControlValue = boolean | number | string;
export type Config = Record<string, ControlValue>;

export interface ToggleControl {
  id: string;
  kind: "toggle";
  label: string;
  help: string;
  defaultValue: boolean;
  /** Maintenance cost units charged while the toggle is on. */
  cost: number;
}

export interface NumberControl {
  id: string;
  kind: "number";
  label: string;
  help: string;
  min: number;
  max: number;
  defaultValue: number;
  unit?: string;
  /** Maintenance cost units charged while the value is greater than zero. */
  cost: number;
}

export interface EnumOption {
  value: string;
  label: string;
  /** Maintenance cost units charged while this option is selected. */
  cost: number;
}

export interface EnumControl {
  id: string;
  kind: "enum";
  label: string;
  help: string;
  options: EnumOption[];
  defaultValue: string;
}

export type ControlDef = ToggleControl | NumberControl | EnumControl;

export type IpSpec =
  | { kind: "fixed"; address: string }
  | { kind: "pool"; count: number; ranges: string[] };

export type Behavior =
  /** A person opening sessions: some failed attempts, then a valid one. */
  | { kind: "sessions"; sessions: number; failuresPerSession: [number, number] }
  /** A bot trying several passwords per IP in quick succession. */
  | { kind: "bursts"; attemptsPerIp: [number, number] }
  /** A few attempts spread over the whole timeline from one address. */
  | { kind: "drip"; attempts: number };

export type CredentialModel =
  | { kind: "valid" }
  | { kind: "guessed"; successProbability: number };

/** Where a message is sent from. Values come from scenario data (Spanish). */
export interface MailProfile {
  /** Domain shown in the From header. */
  fromDomain: string;
  /** "propio": our servers. "proveedor": an external provider sending for us. "ajeno": anyone else. */
  server: "propio" | "proveedor" | "ajeno";
}

export interface Actor {
  id: string;
  name: string;
  description: string;
  role: Role;
  /** Actions the actor can use, in order of preference. */
  methods: AuthAction[];
  users: string[];
  credential: CredentialModel;
  ips: IpSpec;
  behavior: Behavior;
  viaVpn: boolean;
  hasSecondFactor: boolean;
  /** Present only for actors that send mail. */
  mail?: MailProfile;
}

export type FactValue = boolean | number | string;

export interface Rule {
  /** Every entry must match the attempt facts (logical AND). Empty = catch-all. */
  when: Record<string, FactValue>;
  outcome: Outcome;
  explanationKey: string;
  /** Whether the server records this refusal as an authentication failure. */
  countsAsFailure: boolean;
}

export interface Explanation {
  title: string;
  text: string;
  practice: string;
  source: string;
}

export interface FailureLockout {
  /** Control holding the failure threshold (0 disables the mechanism). */
  maxAttemptsControl: string;
  /** Control holding the ban length in minutes. */
  banMinutesControl: string;
  windowSeconds: number;
}

export interface Weights {
  security: number;
  operations: number;
  cost: number;
}

export interface Scenario {
  id: string;
  track: string;
  kind: string;
  title: string;
  summary: string;
  context: string;
  durationSeconds: number;
  tags: { attack: string[]; csf: string[] };
  existingUsers: string[];
  allowedUsers: string[];
  /** Mail only: the domain whose DMARC policy the player configures. */
  protectedDomain?: string;
  /** Maps an auth action to the toggle control that enables it. */
  acceptedMethods: Partial<Record<AuthAction, string>>;
  failureLockout?: FailureLockout;
  controls: ControlDef[];
  actors: Actor[];
  rules: Rule[];
  explanations: Record<string, Explanation>;
  weights: Weights;
  optimal: Config;
}

/** One action an actor tries against the server, before any evaluation. */
export interface Attempt {
  seq: number;
  t: number;
  actorId: string;
  methods: AuthAction[];
  user: string;
  ip: string;
  credential: Credential;
  viaVpn: boolean;
  hasSecondFactor: boolean;
}

export interface SimEvent {
  index: number;
  /** Seconds since the start of the simulated window. */
  t: number;
  actorId: string;
  actorName: string;
  role: Role;
  action: AuthAction;
  user: string;
  ip: string;
  credential: Credential;
  outcome: Outcome;
  explanationKey: string;
  /** True when this event made the server ban the source IP. */
  banned: boolean;
}

export type AttackerStatus = "detenido" | "detectado" | "comprometido";

export interface AttackerSummary {
  actorId: string;
  name: string;
  status: AttackerStatus;
  attempts: number;
  breaches: number;
}

export interface LegitSummary {
  actorId: string;
  name: string;
  validAttempts: number;
  permitted: number;
}

export interface Score {
  security: number;
  operations: number;
  cost: number;
  total: number;
  attackers: AttackerSummary[];
  legit: LegitSummary[];
  costUnits: number;
  maxCostUnits: number;
}

export interface SimulationResult {
  scenarioId: string;
  seed: number;
  config: Config;
  events: SimEvent[];
  score: Score;
}
