/**
 * Renders a schema.org JSON-LD block (BRIEF §6: structured data on
 * every page). Server component; the script is inert markup.
 */
export interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  // `data` carries host-authored free text (experience title/description,
  // host bio). `JSON.stringify` does NOT escape `<`, `>`, `&`, so a value
  // containing `</script>` would break out of the tag (stored XSS). Escape
  // the HTML-significant characters as \uXXXX — keeps the JSON valid while
  // neutralising tag-breakout and HTML-comment tricks.
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
