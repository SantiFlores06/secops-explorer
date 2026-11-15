export type SecurityHeader = { key: string; value: string };

export type SecurityHeadersOptions = { isDev: boolean };

/**
 * Static CSP (no nonce). A nonce would force dynamic rendering and disable
 * Partial Prerendering, which this app relies on. Consequences:
 * - script-src needs 'unsafe-inline': Next.js inlines its RSC payload and
 *   bootstrap scripts without a nonce.
 * - style-src needs 'unsafe-inline': server-rendered elements carry style
 *   attributes (for example the progress bars in the results view).
 * - 'unsafe-eval' is only allowed in development, where React uses eval to
 *   rebuild server stacks. HMR also needs ws:/wss:.
 */
export function buildContentSecurityPolicy({ isDev }: SecurityHeadersOptions): string {
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  const connectSrc = ["'self'"];

  if (isDev) {
    scriptSrc.push("'unsafe-eval'");
    connectSrc.push("ws:", "wss:");
  }

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "blob:", "data:"]],
    ["font-src", ["'self'"]],
    ["connect-src", connectSrc],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];

  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

export function securityHeaders(options: SecurityHeadersOptions): SecurityHeader[] {
  return [
    // No "preload": it is hard to undo once submitted to the preload list.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
  ];
}
