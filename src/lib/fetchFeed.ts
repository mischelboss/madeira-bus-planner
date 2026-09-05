/**
 * Fetches the published GTFS zip, authenticating when it's a GitHub release
 * asset on a private repo.
 *
 * `madeira-gtfs` stays private (the user's call — the feed itself is public
 * via this fetch, the source repo isn't). A plain `fetch()` against
 * `github.com/<owner>/<repo>/releases/download/<tag>/<asset>` 404s for a
 * private repo even with an `Authorization` header — that URL doesn't accept
 * one. The documented way in: resolve the release via the API (which does
 * accept a token), find the asset's id, then fetch *that* asset URL with
 * `Accept: application/octet-stream` — GitHub streams the binary back (or
 * redirects to a signed one-time URL, which `fetch` follows transparently).
 */

const RELEASE_DOWNLOAD_RE =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/;

export interface FetchFeedOptions {
  /** a PAT with at least Contents:Read on the source repo; undefined/empty => try unauthenticated */
  token?: string;
}

/** Downloads a URL to a Uint8Array, resolving a private GitHub release asset via the API when a token is given. */
export async function fetchFeedZip(url: string, opts: FetchFeedOptions = {}): Promise<Uint8Array> {
  const token = opts.token?.trim();
  const m = token ? RELEASE_DOWNLOAD_RE.exec(url) : null;
  if (m) {
    const [, owner, repo, tag, assetName] = m;
    return fetchPrivateReleaseAsset(owner, repo, tag, decodeURIComponent(assetName), token!);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchPrivateReleaseAsset(
  owner: string,
  repo: string,
  tag: string,
  assetName: string,
  token: string,
): Promise<Uint8Array> {
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const relUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`;
  const relRes = await fetch(relUrl, { headers: authHeaders });
  if (!relRes.ok) {
    throw new Error(`fetch release metadata ${relUrl}: ${relRes.status} — check the token's access to ${owner}/${repo}`);
  }
  const release = (await relRes.json()) as { assets: { id: number; name: string }[] };
  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    throw new Error(`release "${tag}" on ${owner}/${repo} has no asset named "${assetName}"`);
  }

  const assetUrl = `https://api.github.com/repos/${owner}/${repo}/releases/assets/${asset.id}`;
  const assetRes = await fetch(assetUrl, {
    headers: { ...authHeaders, Accept: "application/octet-stream" },
  });
  if (!assetRes.ok) throw new Error(`fetch asset ${assetUrl}: ${assetRes.status}`);
  return new Uint8Array(await assetRes.arrayBuffer());
}
