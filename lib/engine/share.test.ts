import { describe, expect, it } from "vitest";
import { getScenario } from "../scenarios";
import { defaultConfig } from "./config";
import { DEFAULT_SEED, decodeShare, encodeShare } from "./share";
import { simulate } from "./simulate";

const scenario = getScenario("ssh-expuesto");
if (!scenario) throw new Error("ssh-expuesto scenario is missing");

describe("share links", () => {
  it("round-trips a configuration and a seed", () => {
    const config = {
      ...defaultConfig(scenario),
      password_auth: false,
      key_auth: true,
      fail2ban_maxretry: 4,
      fail2ban_bantime: 90,
    };
    const decoded = decodeShare(scenario, encodeShare(scenario, config, 31337));
    expect(decoded).toEqual({ config, seed: 31337, shared: true });
  });

  it("reproduces the exact same game from a link", () => {
    const config = { ...defaultConfig(scenario), mfa: true, fail2ban_maxretry: 3 };
    const decoded = decodeShare(scenario, encodeShare(scenario, config, 555));
    expect(simulate(scenario, decoded.config, decoded.seed)).toEqual(
      simulate(scenario, config, 555),
    );
  });

  it("falls back to defaults for an empty or garbled query", () => {
    const empty = decodeShare(scenario, "");
    expect(empty.config).toEqual(defaultConfig(scenario));
    expect(empty.seed).toBe(DEFAULT_SEED);
    expect(empty.shared).toBe(false);

    const garbled = decodeShare(
      scenario,
      "semilla=abc&password_auth=maybe&fail2ban_maxretry=lots&mfa=%3Cscript%3E",
    );
    expect(garbled.config).toEqual(defaultConfig(scenario));
    expect(garbled.shared).toBe(false);
  });

  it("clamps numbers to the control's range and ignores unknown parameters", () => {
    const decoded = decodeShare(scenario, "semilla=7&fail2ban_maxretry=500&otro=1");
    expect(decoded.config.fail2ban_maxretry).toBe(20);
    expect(decoded.shared).toBe(true);
    expect("otro" in decoded.config).toBe(false);
  });
});
