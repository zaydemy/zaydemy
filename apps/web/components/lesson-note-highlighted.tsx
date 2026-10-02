import "server-only";
import rehypeShiki from "@shikijs/rehype";
import { MarkdownAsync } from "react-markdown";
import { noteComponents, notePlugins } from "./lesson-note";

/**
 * A lesson note with syntax highlighting, rendered on the server: no
 * highlighter is shipped to the browser. Colours come as CSS variables for a
 * light and a dark theme (see `.shiki` in globals.css), so code follows the
 * app's theme.
 */
export async function HighlightedLessonNote({ source }: { source: string }) {
  return (
    <div className="prose-note">
      <MarkdownAsync
        remarkPlugins={notePlugins}
        rehypePlugins={[
          [
            rehypeShiki,
            {
              themes: { light: "github-light", dark: "github-dark" },
              defaultColor: false,
              // Unknown or missing languages render as plain text.
              fallbackLanguage: "text",
              defaultLanguage: "text",
              lazy: true,
            },
          ],
        ]}
        components={noteComponents}
      >
        {source}
      </MarkdownAsync>
    </div>
  );
}
