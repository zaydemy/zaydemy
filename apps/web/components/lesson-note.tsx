import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a lesson note: CommonMark plus GitHub tables, task lists and
 * strikethrough. Raw HTML in the source is not rendered, so notes cannot
 * inject markup or scripts. The editor preview and the student's lesson page
 * use this same component: what the instructor sees is what students get.
 */
export function LessonNote({ source }: { source: string }) {
  return (
    <div className="prose-note">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Links in notes leave the app; never hand them the opener.
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {source}
      </Markdown>
    </div>
  );
}
