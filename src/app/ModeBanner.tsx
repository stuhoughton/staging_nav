/**
 * Persistent mode banner (task 10; Requirements 3.4, 4.6; Correctness Property 8).
 *
 * Always tells the colleague whether the current view is the live snapshot or an
 * imported proposal, so the two are never visually ambiguous (Property 8):
 *
 *   - live     → "Live snapshot — captured {timestamp}" (Req 3.4)
 *   - proposed → "Proposed change — imported from {filename}" (Req 4.6)
 *
 * The proposed state is made visually distinct (a different colour treatment and a
 * `data-mode` hook) so a proposal is never mistaken for live production data. All
 * values are rendered as JSX text and therefore escaped by React — a CSV filename
 * or capture timestamp is never injected as raw HTML.
 */

export interface ModeBannerProps {
  /** Which view is currently rendered. */
  mode: "live" | "proposed";
  /**
   * ISO 8601 capture timestamp of the live snapshot (shown in live mode).
   * Explicitly allows `undefined` (e.g. before a brand's snapshot has loaded);
   * the banner falls back to a descriptive placeholder.
   */
  capturedAt?: string | undefined;
  /**
   * Source filename of the imported proposal (shown in proposed mode).
   * Explicitly allows `undefined` when no proposal is active; the banner falls
   * back to a descriptive placeholder.
   */
  filename?: string | undefined;
}

/** Palette per mode — live is calm/neutral, proposed is a distinct warning treatment. */
const MODE_STYLE: Record<ModeBannerProps["mode"], { background: string; color: string }> = {
  live: { background: "#e7f1e9", color: "#14432a" },
  proposed: { background: "#fdecc8", color: "#7a4a00" },
};

/** The always-on banner describing the current mode. */
export function ModeBanner({ mode, capturedAt, filename }: ModeBannerProps): JSX.Element {
  const style = MODE_STYLE[mode];
  const message =
    mode === "live"
      ? `Live snapshot — captured ${capturedAt ?? "unknown"}`
      : `Proposed change — imported from ${filename ?? "imported file"}`;

  return (
    <div
      className={`mode-banner mode-banner--${mode}`}
      data-mode={mode}
      role="status"
      aria-live="polite"
      style={{
        background: style.background,
        color: style.color,
        padding: "0.5rem 1rem",
        borderRadius: "4px",
        fontWeight: 600,
      }}
    >
      {message}
    </div>
  );
}
