import { describe, expect, it } from "vitest";
import { createRng, deriveSeed, normalizeSeed } from "./rng";

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRng(123);
    const b = createRng(123);
    const first = Array.from({ length: 20 }, () => a.next());
    const second = Array.from({ length: 20 }, () => b.next());
    expect(first).toEqual(second);
  });

  it("produces different sequences for different seeds", () => {
    const a = Array.from({ length: 10 }, ((rng) => () => rng.next())(createRng(1)));
    const b = Array.from({ length: 10 }, ((rng) => () => rng.next())(createRng(2)));
    expect(a).not.toEqual(b);
  });

  it("returns floats in [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("int is inclusive on both ends and stays in range", () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const value = rng.int(3, 6);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it("shuffle returns a permutation and leaves the input untouched", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = createRng(5).shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input);
  });

  it("pick refuses an empty list", () => {
    expect(() => createRng(1).pick([])).toThrow();
  });
});

describe("seeds", () => {
  it("normalizes odd values to unsigned integers", () => {
    expect(normalizeSeed(Number.NaN)).toBe(0);
    expect(normalizeSeed(Infinity)).toBe(0);
    expect(normalizeSeed(42.9)).toBe(42);
    expect(normalizeSeed(-1)).toBe(4294967295);
  });

  it("derives independent seeds per label, deterministically", () => {
    expect(deriveSeed(1, "botnet")).toBe(deriveSeed(1, "botnet"));
    expect(deriveSeed(1, "botnet")).not.toBe(deriveSeed(1, "admin"));
    expect(deriveSeed(1, "botnet")).not.toBe(deriveSeed(2, "botnet"));
  });
});
