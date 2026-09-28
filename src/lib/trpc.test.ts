import { afterEach, expect, it, vi } from "vitest";
import { login } from "@/fns/auth";
import { loadState } from "@/fns/snapshot";

afterEach(() => vi.unstubAllGlobals());

it("preserves tRPC batching, SuperJSON encoding, and session credentials", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify([{ result: { data: { json: { id: "P-1", role: "FREIGHT_OWNER" } } } }]),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  expect(await login("owner@example.test", "test-password")).toEqual({
    id: "P-1",
    role: "FREIGHT_OWNER",
  });
  const [url, options] = fetchMock.mock.calls[0]!;
  expect(String(url)).toBe("/api/trpc/auth.login?batch=1");
  expect(options).toMatchObject({ method: "POST", credentials: "include" });
  expect(JSON.parse(options.body)).toEqual({
    "0": { json: { email: "owner@example.test", password: "test-password" } },
  });
});

it("propagates API failures instead of fabricating successful data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Backend unavailable")));
  await expect(loadState()).rejects.toThrow("Backend unavailable");
});
