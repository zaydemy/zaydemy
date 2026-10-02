import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/*
 * Lesson notes: CommonMark plus GitHub tables, task lists and strikethrough.
 * Raw HTML in the source is not rendered, so notes cannot inject markup or
 * scripts. The editor preview (this file) and the student's lesson page
 * (lesson-note-highlighted.tsx) share the same markup and styles
 * (`.prose-note`); the lesson page also highlights code on the server.
 */

export const noteComponents: Components = {
  // Links in notes leave the app; never hand them the opener.
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

export const notePlugins = [remarkGfm];

/** Synchronous rendering, safe for client components (the editor's live preview). */
export function LessonNote({ source }: { source: string }) {
  return (
    <div className="prose-note">
      <Markdown remarkPlugins={notePlugins} components={noteComponents}>
        {source}
      </Markdown>
    </div>
  );
}
