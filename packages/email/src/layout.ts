/** Escapes text for HTML content and attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const font = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * Shared email shell: one 600px column, inline styles only (mail clients drop
 * stylesheets), `lang` and `dir` from the recipient's locale. Every argument
 * that is not already HTML must be escaped by the caller.
 */
export function layout(input: {
  lang: string;
  dir: "ltr" | "rtl";
  appName: string;
  bodyHtml: string;
}): string {
  const appName = escapeHtml(input.appName);
  return `<!doctype html>
<html lang="${escapeHtml(input.lang)}" dir="${input.dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${appName}</title></head>
<body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:${font};color:#18181b">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden">
    <div style="padding:20px 32px;border-bottom:1px solid #e4e4e7;font:600 15px/1 ${font}">${appName}</div>
    <div style="padding:32px">${input.bodyHtml}</div>
  </div>
</body>
</html>`;
}

export const styles = { font, mono };
