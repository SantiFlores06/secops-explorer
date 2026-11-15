import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, securityHeaders, type SecurityHeader } from "./headers";

function findHeader(headers: SecurityHeader[], key: string): string {
  const header = headers.find((item) => item.key === key);
  if (!header) throw new Error(`missing header ${key}`);
  return header.value;
}

describe("security headers (production)", () => {
  const headers = securityHeaders({ isDev: false });

  it("sets the required static headers", () => {
    expect(findHeader(headers, "Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(findHeader(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(findHeader(headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(findHeader(headers, "X-Frame-Options")).toBe("DENY");
    expect(findHeader(headers, "Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  it("sets a Content-Security-Policy header", () => {
    expect(findHeader(headers, "Content-Security-Policy")).toBeTruthy();
  });

  it("never allows unsafe-eval", () => {
    const csp = findHeader(headers, "Content-Security-Policy");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("locks down the CSP directives that matter most", () => {
    const csp = buildContentSecurityPolicy({ isDev: false });
    const directives = new Map(
      csp.split(";").map((part) => {
        const [name, ...values] = part.trim().split(/\s+/);
        return [name, values] as const;
      }),
    );

    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'self'"]);
    expect(directives.get("form-action")).toEqual(["'self'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives.get("connect-src")).toEqual(["'self'"]);
  });

  it("does not use nonces (static rendering)", () => {
    const csp = buildContentSecurityPolicy({ isDev: false });
    expect(csp).not.toContain("nonce-");
  });
});

describe("security headers (development)", () => {
  it("allows unsafe-eval and HMR websockets", () => {
    const csp = buildContentSecurityPolicy({ isDev: true });
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
  });
});
