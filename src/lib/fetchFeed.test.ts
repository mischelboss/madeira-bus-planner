import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFeedZip } from "./fetchFeed.ts";

const RELEASE_URL = "https://github.com/mischelboss/madeira-gtfs/releases/download/latest/latest.zip";

describe("fetchFeedZip", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches a plain URL directly when there's no token", async () => {
    const body = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => body.buffer });
    vi.stubGlobal("fetch", fetchMock);

    const buf = await fetchFeedZip("https://example.com/feed.zip");

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/feed.zip");
    expect([...buf]).toEqual([1, 2, 3]);
  });

  it("fetches a plain URL directly even with a token, when it isn't a GitHub release-download URL", async () => {
    const body = new Uint8Array([9]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => body.buffer });
    vi.stubGlobal("fetch", fetchMock);

    await fetchFeedZip("https://example.com/feed.zip", { token: "shh" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/feed.zip");
  });

  it("resolves a private release asset via the API when a token is given", async () => {
    const body = new Uint8Array([7, 7, 7]);
    const calls: { url: string; headers?: Record<string, string> }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url, headers: init?.headers });
      if (url.endsWith("/releases/tags/latest")) {
        return {
          ok: true,
          json: async () => ({ assets: [{ id: 555, name: "latest.zip" }, { id: 1, name: "other.zip" }] }),
        };
      }
      if (url.endsWith("/releases/assets/555")) {
        return { ok: true, arrayBuffer: async () => body.buffer };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const buf = await fetchFeedZip(RELEASE_URL, { token: "s3cr3t" });

    expect([...buf]).toEqual([7, 7, 7]);
    expect(calls[0].url).toBe(
      "https://api.github.com/repos/mischelboss/madeira-gtfs/releases/tags/latest",
    );
    expect(calls[0].headers?.Authorization).toBe("Bearer s3cr3t");
    expect(calls[1].url).toBe("https://api.github.com/repos/mischelboss/madeira-gtfs/releases/assets/555");
    expect(calls[1].headers?.Accept).toBe("application/octet-stream");
  });

  it("throws a clear error when the release has no asset by that name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ assets: [{ id: 1, name: "nope.zip" }] }) }),
    );

    await expect(fetchFeedZip(RELEASE_URL, { token: "x" })).rejects.toThrow(/no asset named "latest\.zip"/);
  });

  it("throws when the release metadata request itself fails (e.g. token lacks access)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(fetchFeedZip(RELEASE_URL, { token: "x" })).rejects.toThrow(/404/);
  });
});
