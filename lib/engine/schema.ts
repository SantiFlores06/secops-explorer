import { z } from "zod";
import { isDocumentationIp, isDocumentationRange } from "./ips";
import type {
  Actor,
  Behavior,
  ControlDef,
  CredentialModel,
  Explanation,
  IpSpec,
  Rule,
  Scenario,
} from "./types";

/**
 * Validation for scenario files.
 *
 * Scenario files use Spanish keys (they are content, written by authors and
 * contributors). This module validates them strictly and maps them to the
 * English-named `Scenario` the engine works with.
 */

/** Facts every attempt exposes to rules, besides the scenario's controls. */
export const BUILTIN_FACTS = [
  "accion",
  "usuario",
  "actor",
  "rol",
  "credencial",
  "via_vpn",
  "segundo_factor",
  "usuario_existe",
  "usuario_permitido",
  "ip_baneada",
] as const;

const id = z
  .string()
  .regex(/^[a-z][a-z0-9_-]*$/, "debe usar minúsculas, números, guiones y guiones bajos");
const text = z.string().min(1, "no puede estar vacío");
const outcome = z.enum(["permitido", "bloqueado", "detectado", "no_detectado"]);
const authAction = z.enum(["login_clave", "login_password"]);
const integerPair = z
  .tuple([z.number().int().min(0), z.number().int().min(0)])
  .refine(([min, max]) => min <= max, "el mínimo no puede superar al máximo");

const toggleControl = z.strictObject({
  id,
  tipo: z.literal("toggle"),
  etiqueta: text,
  ayuda: text,
  default: z.boolean(),
  costo: z.number().min(0).default(0),
});

const numberControl = z
  .strictObject({
    id,
    tipo: z.literal("numero"),
    etiqueta: text,
    ayuda: text,
    rango: integerPair,
    default: z.number().int(),
    unidad: z.string().optional(),
    costo: z.number().min(0).default(0),
  })
  .refine(({ rango, default: value }) => value >= rango[0] && value <= rango[1], {
    message: "el valor por defecto debe estar dentro del rango",
    path: ["default"],
  });

const control = z.discriminatedUnion("tipo", [toggleControl, numberControl]);

const ips = z.discriminatedUnion("tipo", [
  z.strictObject({
    tipo: z.literal("fija"),
    valor: z.string().refine(isDocumentationIp, "debe ser una IP reservada (RFC 5737)"),
  }),
  z.strictObject({
    tipo: z.literal("variable"),
    cantidad: z.number().int().min(1),
    rangos: z
      .array(z.string().refine(isDocumentationRange, "debe ser un rango reservado (RFC 5737)"))
      .min(1),
  }),
]);

const actorBase = {
  id,
  nombre: text,
  descripcion: text,
  rol: z.enum(["legitimo", "atacante"]),
  metodos: z.array(authAction).min(1),
  usuarios: z.array(text).min(1),
  credencial: z.enum(["valida", "adivinada"]).default("valida"),
  prob_exito: z.number().min(0).max(1).optional(),
  ips,
  via_vpn: z.boolean(),
  segundo_factor: z.boolean(),
};

const actor = z
  .discriminatedUnion("patron", [
    z.strictObject({
      ...actorBase,
      patron: z.literal("sesiones"),
      sesiones: z.number().int().min(1),
      fallos_por_sesion: integerPair,
    }),
    z.strictObject({
      ...actorBase,
      patron: z.literal("rafagas"),
      intentos_por_ip: integerPair,
    }),
    z.strictObject({
      ...actorBase,
      patron: z.literal("goteo"),
      intentos: z.number().int().min(1),
    }),
  ])
  .refine((value) => value.credencial !== "adivinada" || value.prob_exito !== undefined, {
    message: "una credencial adivinada requiere prob_exito",
    path: ["prob_exito"],
  });

const rule = z.strictObject({
  si: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  resultado: outcome,
  explicacion: text,
  cuenta_fallo: z.boolean().default(false),
});

const explanation = z.strictObject({
  titulo: text,
  texto: text,
  practica: text,
  fuente: text,
});

const rawScenario = z.strictObject({
  id,
  track: id,
  tipo: z.enum(["entender", "configurar", "detectar", "responder"]),
  titulo: text,
  resumen: text,
  contexto: text,
  duracion_segundos: z.number().int().min(60),
  tags: z.strictObject({
    attack: z.array(text),
    csf: z.array(text),
  }),
  usuarios_existentes: z.array(text).min(1),
  usuarios_permitidos: z.array(text),
  metodos_aceptados: z.strictObject({
    login_clave: id.optional(),
    login_password: id.optional(),
  }),
  bloqueo_por_fallos: z
    .strictObject({
      max_intentos: id,
      duracion_minutos: id,
      ventana_segundos: z.number().int().min(1),
    })
    .optional(),
  controles: z.array(control).min(1),
  actores: z.array(actor).min(1),
  evaluacion: z.array(rule).min(1),
  explicaciones: z.record(z.string(), explanation),
  pesos: z.strictObject({
    seguridad: z.number().min(0),
    operatividad: z.number().min(0),
    costo: z.number().min(0),
  }),
  optimo: z.record(z.string(), z.union([z.boolean(), z.number()])),
});

type RawScenario = z.output<typeof rawScenario>;
type RawActor = RawScenario["actores"][number];
type RawControl = RawScenario["controles"][number];

function duplicates(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

const validated = rawScenario.superRefine((data, ctx) => {
  const fail = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: "custom", message, path });

  const controlIds = data.controles.map((item) => item.id);
  for (const dup of duplicates(controlIds)) fail(`control repetido: ${dup}`, ["controles"]);
  for (const dup of duplicates(data.actores.map((item) => item.id))) {
    fail(`actor repetido: ${dup}`, ["actores"]);
  }

  const togglesById = new Set(
    data.controles.filter((item) => item.tipo === "toggle").map((item) => item.id),
  );
  const numbersById = new Set(
    data.controles.filter((item) => item.tipo === "numero").map((item) => item.id),
  );

  for (const [method, controlId] of Object.entries(data.metodos_aceptados)) {
    if (controlId !== undefined && !togglesById.has(controlId)) {
      fail(`${method} apunta a un toggle inexistente: ${controlId}`, ["metodos_aceptados", method]);
    }
  }

  const lockout = data.bloqueo_por_fallos;
  if (lockout) {
    for (const key of ["max_intentos", "duracion_minutos"] as const) {
      if (!numbersById.has(lockout[key])) {
        fail(`${key} debe apuntar a un control numérico: ${lockout[key]}`, [
          "bloqueo_por_fallos",
          key,
        ]);
      }
    }
  }

  const knownFacts = new Set<string>([...BUILTIN_FACTS, ...controlIds]);
  data.evaluacion.forEach((item, index) => {
    for (const key of Object.keys(item.si)) {
      if (!knownFacts.has(key)) {
        fail(`condición desconocida: ${key}`, ["evaluacion", index, "si", key]);
      }
    }
    if (!(item.explicacion in data.explicaciones)) {
      fail(`explicación inexistente: ${item.explicacion}`, ["evaluacion", index, "explicacion"]);
    }
  });
  const last = data.evaluacion[data.evaluacion.length - 1];
  if (last && Object.keys(last.si).length > 0) {
    fail("la última regla debe ser un caso general (si: {})", ["evaluacion"]);
  }

  for (const user of data.usuarios_permitidos) {
    if (!data.usuarios_existentes.includes(user)) {
      fail(`usuario permitido que no existe: ${user}`, ["usuarios_permitidos"]);
    }
  }

  const fixedIps: string[] = [];
  data.actores.forEach((item, index) => {
    if (item.ips.tipo === "fija") fixedIps.push(item.ips.valor);
    if (item.rol === "legitimo") {
      for (const user of item.usuarios) {
        if (!data.usuarios_existentes.includes(user)) {
          fail(`el actor legítimo usa un usuario que no existe: ${user}`, ["actores", index]);
        }
      }
    }
    if (item.ips.tipo === "variable" && item.ips.cantidad > item.ips.rangos.length * 254) {
      fail("pide más IPs de las que tienen sus rangos", ["actores", index, "ips"]);
    }
  });
  for (const dup of duplicates(fixedIps)) fail(`IP fija repetida: ${dup}`, ["actores"]);

  for (const [controlId, value] of Object.entries(data.optimo)) {
    const def = data.controles.find((item) => item.id === controlId);
    if (!def) {
      fail(`el óptimo menciona un control inexistente: ${controlId}`, ["optimo", controlId]);
    } else if (def.tipo === "toggle" && typeof value !== "boolean") {
      fail("el valor óptimo de un toggle debe ser true o false", ["optimo", controlId]);
    } else if (
      def.tipo === "numero" &&
      (typeof value !== "number" || value < def.rango[0] || value > def.rango[1])
    ) {
      fail("el valor óptimo debe estar dentro del rango del control", ["optimo", controlId]);
    }
  }
  for (const controlId of controlIds) {
    if (!(controlId in data.optimo)) {
      fail(`falta el control en el óptimo: ${controlId}`, ["optimo"]);
    }
  }

  const weightSum = data.pesos.seguridad + data.pesos.operatividad + data.pesos.costo;
  if (Math.abs(weightSum - 1) > 1e-6) fail("los pesos deben sumar 1", ["pesos"]);
});

function toControl(raw: RawControl): ControlDef {
  if (raw.tipo === "toggle") {
    return {
      id: raw.id,
      kind: "toggle",
      label: raw.etiqueta,
      help: raw.ayuda,
      defaultValue: raw.default,
      cost: raw.costo,
    };
  }
  return {
    id: raw.id,
    kind: "number",
    label: raw.etiqueta,
    help: raw.ayuda,
    min: raw.rango[0],
    max: raw.rango[1],
    defaultValue: raw.default,
    unit: raw.unidad,
    cost: raw.costo,
  };
}

function toActor(raw: RawActor): Actor {
  const ipSpec: IpSpec =
    raw.ips.tipo === "fija"
      ? { kind: "fixed", address: raw.ips.valor }
      : { kind: "pool", count: raw.ips.cantidad, ranges: raw.ips.rangos };

  const behavior: Behavior =
    raw.patron === "sesiones"
      ? { kind: "sessions", sessions: raw.sesiones, failuresPerSession: raw.fallos_por_sesion }
      : raw.patron === "rafagas"
        ? { kind: "bursts", attemptsPerIp: raw.intentos_por_ip }
        : { kind: "drip", attempts: raw.intentos };

  const credential: CredentialModel =
    raw.credencial === "adivinada"
      ? { kind: "guessed", successProbability: raw.prob_exito ?? 0 }
      : { kind: "valid" };

  return {
    id: raw.id,
    name: raw.nombre,
    description: raw.descripcion,
    role: raw.rol,
    methods: raw.metodos,
    users: raw.usuarios,
    credential,
    ips: ipSpec,
    behavior,
    viaVpn: raw.via_vpn,
    hasSecondFactor: raw.segundo_factor,
  };
}

function toScenario(raw: RawScenario): Scenario {
  const acceptedMethods: Scenario["acceptedMethods"] = {};
  if (raw.metodos_aceptados.login_clave) {
    acceptedMethods.login_clave = raw.metodos_aceptados.login_clave;
  }
  if (raw.metodos_aceptados.login_password) {
    acceptedMethods.login_password = raw.metodos_aceptados.login_password;
  }

  const rules: Rule[] = raw.evaluacion.map((item) => ({
    when: item.si,
    outcome: item.resultado,
    explanationKey: item.explicacion,
    countsAsFailure: item.cuenta_fallo,
  }));

  const explanations: Record<string, Explanation> = {};
  for (const [key, item] of Object.entries(raw.explicaciones)) {
    explanations[key] = {
      title: item.titulo,
      text: item.texto,
      practice: item.practica,
      source: item.fuente,
    };
  }

  return {
    id: raw.id,
    track: raw.track,
    kind: raw.tipo,
    title: raw.titulo,
    summary: raw.resumen,
    context: raw.contexto,
    durationSeconds: raw.duracion_segundos,
    tags: raw.tags,
    existingUsers: raw.usuarios_existentes,
    allowedUsers: raw.usuarios_permitidos,
    acceptedMethods,
    failureLockout: raw.bloqueo_por_fallos && {
      maxAttemptsControl: raw.bloqueo_por_fallos.max_intentos,
      banMinutesControl: raw.bloqueo_por_fallos.duracion_minutos,
      windowSeconds: raw.bloqueo_por_fallos.ventana_segundos,
    },
    controls: raw.controles.map(toControl),
    actors: raw.actores.map(toActor),
    rules,
    explanations,
    weights: {
      security: raw.pesos.seguridad,
      operations: raw.pesos.operatividad,
      cost: raw.pesos.costo,
    },
    optimal: raw.optimo,
  };
}

export class ScenarioValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Escenario inválido:\n- ${issues.join("\n- ")}`);
    this.name = "ScenarioValidationError";
    this.issues = issues;
  }
}

/** Validates a parsed YAML document and returns the engine's `Scenario`. */
export function parseScenario(raw: unknown): Scenario {
  const result = validated.safeParse(raw);
  if (!result.success) {
    throw new ScenarioValidationError(
      result.error.issues.map((issue) => {
        const where = issue.path.length ? `${issue.path.join(".")}: ` : "";
        return `${where}${issue.message}`;
      }),
    );
  }
  return toScenario(result.data);
}
