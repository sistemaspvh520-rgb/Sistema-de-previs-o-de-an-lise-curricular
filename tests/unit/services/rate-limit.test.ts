import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "@/services/rate-limit/rate-limit";

beforeEach(() => resetRateLimits());

describe("rate limit", () => {
  it("permite até a capacidade e depois bloqueia", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", { capacity: 3, refillPerMinute: 3 }, now).allowed).toBe(true);
    const blocked = rateLimit("k", { capacity: 3, refillPerMinute: 3 }, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
  it("recarrega com o tempo", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) rateLimit("k", { capacity: 3, refillPerMinute: 3 }, now);
    expect(rateLimit("k", { capacity: 3, refillPerMinute: 3 }, now + 30_000).allowed).toBe(true);
  });
});
