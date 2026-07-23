/**
 * Theme layer for the Nav Renderer — task 7.2.
 *
 * All brand styling is isolated here, keyed by `BrandConfig.themeId`. The
 * renderer (`./NavRenderer`) consumes a theme only as opaque styling: it reads
 * `id` as a `data-theme` hook, applies the derived CSS custom properties, and
 * renders the logo. It never branches on a specific brand. This keeps the
 * renderer's structural logic untouched and lets per-brand fidelity be tightened
 * later by editing a theme entry — never the render logic.
 *
 * The JD Williams theme approximates the production megamenu presentation
 * (colours, fonts, spacing, logo). It is a deliberate structural-plus-themed
 * approximation, not a pixel-for-pixel copy of production CSS (see the design's
 * fidelity note); the isolation here is what makes tightening it cheap.
 */
import type { CSSProperties } from "react";
import type { BrandTheme } from "./types";

/**
 * A simple inline-SVG wordmark used as the JD Williams logo, so the theme is
 * self-contained (no external asset fetch). Swap for the real brand asset when
 * tightening fidelity.
 */
const JD_WILLIAMS_LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="32" viewBox="0 0 160 32">' +
      '<rect width="160" height="32" fill="none"/>' +
      '<text x="0" y="24" font-family="Georgia, serif" font-size="24" font-weight="700" fill="#1a1a1a">' +
      "JD Williams</text></svg>",
  );

/** The JD Williams brand theme. */
export const jdWilliamsTheme: BrandTheme = {
  id: "jdwilliams",
  name: "JD Williams",
  colors: {
    primary: "#1a1a1a",
    onPrimary: "#ffffff",
    surface: "#ffffff",
    onSurface: "#1a1a1a",
    accent: "#b5121b",
    border: "#e0e0e0",
  },
  fonts: {
    body: '"Helvetica Neue", Arial, sans-serif',
    heading: 'Georgia, "Times New Roman", serif',
  },
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
  },
  logo: {
    src: JD_WILLIAMS_LOGO,
    alt: "JD Williams",
  },
};

/**
 * Neutral fallback theme. Used when a `themeId` has no registered theme yet —
 * for example the four brands staged as disabled config entries whose themes are
 * added later. The renderer always receives a valid, complete theme.
 */
export const defaultTheme: BrandTheme = {
  id: "default",
  name: "Default",
  colors: {
    primary: "#222222",
    onPrimary: "#ffffff",
    surface: "#ffffff",
    onSurface: "#222222",
    accent: "#005b99",
    border: "#cccccc",
  },
  fonts: {
    body: "system-ui, Arial, sans-serif",
    heading: "system-ui, Arial, sans-serif",
  },
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
  },
  logo: {
    src:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32" viewBox="0 0 120 32">' +
          '<text x="0" y="24" font-family="system-ui, sans-serif" font-size="20" fill="#222">Store</text></svg>',
      ),
    alt: "Store",
  },
};

/** The theme registry, keyed by `themeId` (matching `BrandConfig.themeId`). */
export const THEMES: Readonly<Record<string, BrandTheme>> = {
  [jdWilliamsTheme.id]: jdWilliamsTheme,
};

/**
 * Look up a theme by its `themeId`.
 *
 * Returns the registered theme when one exists, otherwise the neutral
 * {@link defaultTheme}. This guarantees the renderer always has a complete theme
 * to style from, even for brands whose bespoke theme has not been authored yet.
 */
export function getTheme(themeId: string | undefined): BrandTheme {
  if (themeId !== undefined && Object.prototype.hasOwnProperty.call(THEMES, themeId)) {
    const theme = THEMES[themeId];
    if (theme !== undefined) {
      return theme;
    }
  }
  return defaultTheme;
}

/**
 * Map a {@link BrandTheme} to the CSS custom properties the renderer's stylesheet
 * consumes. This is the single bridge between the theme layer and the DOM: the
 * renderer applies these variables to its root element, so all brand-specific
 * visual values flow through here and nowhere else.
 */
export function themeToCssVars(theme: BrandTheme): CSSProperties {
  return {
    "--nav-color-primary": theme.colors.primary,
    "--nav-color-on-primary": theme.colors.onPrimary,
    "--nav-color-surface": theme.colors.surface,
    "--nav-color-on-surface": theme.colors.onSurface,
    "--nav-color-accent": theme.colors.accent,
    "--nav-color-border": theme.colors.border,
    "--nav-font-body": theme.fonts.body,
    "--nav-font-heading": theme.fonts.heading,
    "--nav-space-xs": theme.spacing.xs,
    "--nav-space-sm": theme.spacing.sm,
    "--nav-space-md": theme.spacing.md,
    "--nav-space-lg": theme.spacing.lg,
  } as CSSProperties;
}
