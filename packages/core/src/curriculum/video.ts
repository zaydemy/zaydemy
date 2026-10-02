/**
 * Turns a video page address into one that can be embedded in the lesson
 * page, for the providers we know. `null` means "show a link instead".
 *
 * Hosts are matched on the parsed URL, never with a substring: a look-alike
 * such as `youtube.com.evil.example` or `evil.example/?youtube.com/watch`
 * must not be framed.
 */
export function toEmbedUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const id = /^[\w-]{6,}$/;

  if (host === "youtu.be") {
    const video = url.pathname.slice(1);
    return id.test(video) ? youtube(video) : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const video =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : /^\/(?:embed|shorts|live)\/([\w-]+)/.exec(url.pathname)?.[1];
    return video && id.test(video) ? youtube(video) : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const video = /^\/(?:video\/)?(\d+)/.exec(url.pathname)?.[1];
    return video ? `https://player.vimeo.com/video/${video}` : null;
  }
  return null;
}

// The no-cookie domain sets no cookies until the viewer presses play.
const youtube = (video: string) => `https://www.youtube-nocookie.com/embed/${video}`;
