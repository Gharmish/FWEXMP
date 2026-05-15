/**
 * Renders a schema.org JSON-LD block (BRIEF §6: structured data on
 * every page). Server component; the script is inert markup.
 */
export interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // JSON-LD must be raw JSON in a script tag; this is the standard,
      // safe pattern (no user input is interpolated).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
