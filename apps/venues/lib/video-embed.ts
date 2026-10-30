/**
 * video-embed — CP-154 · turn a pasted YouTube / Vimeo link into an embed URL
 *
 * Accepts the forms people actually paste: youtube.com/watch?v=, youtu.be/,
 * youtube.com/shorts/, youtube.com/embed/, vimeo.com/123, vimeo.com/123/hash
 * (unlisted), player.vimeo.com/video/123. Returns null for anything else so
 * the UI can say "that doesn't look like a YouTube or Vimeo link".
 */
export type VideoEmbed = { provider: "youtube" | "vimeo"; src: string; watchUrl: string };

export function parseVideoUrl(raw: string | null | undefined): VideoEmbed | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let u: URL;
  try { u = new URL(s.startsWith("http") ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtu.be" || host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (u.searchParams.get("v")) id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/\/(shorts|embed|live|v)\/([A-Za-z0-9_-]{6,})/);
      if (m) id = m[2];
    }
    if (!id || !/^[A-Za-z0-9_-]{6,}$/.test(id)) return null;
    const start = u.searchParams.get("t")?.replace(/s$/, "");
    const q = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" });
    if (start && /^\d+$/.test(start)) q.set("start", start);
    return { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}?${q}`, watchUrl: `https://youtu.be/${id}` };
  }

  if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
    const m = u.pathname.match(/\/(?:video\/)?(\d{6,})(?:\/([A-Za-z0-9]+))?/);
    if (!m) return null;
    const q = new URLSearchParams({ dnt: "1", title: "0", byline: "0", portrait: "0", playsinline: "1" });
    if (m[2]) q.set("h", m[2]);
    return { provider: "vimeo", src: `https://player.vimeo.com/video/${m[1]}?${q}`, watchUrl: `https://vimeo.com/${m[1]}` };
  }
  return null;
}
