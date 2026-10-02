import { describe, expect, it } from "vitest";
import { toEmbedUrl } from "./video";

describe("toEmbedUrl", () => {
  it("embeds YouTube in its no-cookie player", () => {
    const embed = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toBe(embed);
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(embed);
    expect(toEmbedUrl("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe(embed);
    expect(toEmbedUrl(" https://youtube.com/embed/dQw4w9WgXcQ ")).toBe(embed);
  });

  it("embeds Vimeo", () => {
    expect(toEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
    expect(toEmbedUrl("https://player.vimeo.com/video/123456789?h=abc")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("does not embed other hosts, look-alikes or non-web addresses", () => {
    for (const value of [
      "https://example.com/video.mp4",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://evil.example/?u=https://youtube.com/watch?v=dQw4w9WgXcQ",
      "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "https://www.youtube.com/watch?v=<script>",
      "not a url",
    ]) {
      expect(toEmbedUrl(value), value).toBeNull();
    }
  });
});
