/**
 * Types for the Nav Renderer.
 *
 * The recursive renderer (task 7.1) is deliberately independent of theming
 * (task 7.2): it accepts an optional {@link BrandTheme} prop per the design's
 * `NavRendererProps`, but does not depend on any concrete theme to render
 * structure, groups, leaves, and links. Task 7.2 fills in the theme registry
 * (see `./themes`) and the visual styling keyed off `BrandTheme.id`, while
 * keeping all brand styling isolated in that theme layer so the renderer's
 * structural logic is untouched.
 */
import type { NavNode } from "../data/types";

/** Brand colour palette, applied to the renderer as CSS custom properties. */
export interface ThemeColors {
  /** Primary brand colour — the top navigation bar background. */
  primary: string;
  /** Text/icon colour used on top of `primary`. */
  onPrimary: string;
  /** Surface background for expanded groups (the megamenu panels). */
  surface: string;
  /** Text colour used on top of `surface`. */
  onSurface: string;
  /** Accent colour for links, hover, and focus affordances. */
  accent: string;
  /** Divider/border colour between navigation regions. */
  border: string;
}

/** Brand typography. Values are CSS `font-family` stacks. */
export interface ThemeFonts {
  /** Body/link font stack. */
  body: string;
  /** Heading/group-title font stack. */
  heading: string;
}

/** Brand spacing scale (CSS length values, e.g. "0.5rem"). */
export interface ThemeSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
}

/** Brand logo shown in the navigation header. */
export interface ThemeLogo {
  /** Image source (URL or data URI). */
  src: string;
  /** Accessible alternative text. */
  alt: string;
}

/**
 * Per-brand visual theme (task 7.2). Holds the colours, fonts, spacing, and logo
 * that approximate a brand's production megamenu presentation.
 *
 * All brand styling lives here in the theme layer, keyed by `BrandConfig.themeId`
 * in the theme registry (`./themes`). The renderer consumes a theme only through
 * `id` (a `data-theme` hook), the derived CSS custom properties, and the logo —
 * so fidelity can be tightened per brand later without touching render logic.
 */
export interface BrandTheme {
  /** Theme key, matching `BrandConfig.themeId`, e.g. "jdwilliams". */
  id: string;
  /** Human-readable theme/brand name. */
  name: string;
  colors: ThemeColors;
  fonts: ThemeFonts;
  spacing: ThemeSpacing;
  logo: ThemeLogo;
}

/**
 * Props for {@link NavRenderer}.
 *
 * - `nodes` — the navigation tree to render (live snapshot or proposed).
 * - `mode` — whether this view is the live snapshot or a proposed change; the
 *   renderer surfaces it as a `data-mode` hook so the mode banner (task 10) and
 *   theming (task 7.2) can key off it. The two modes are never rendered
 *   ambiguously.
 * - `theme` — optional per-brand theme (task 7.2). Rendering works without it.
 */
export interface NavRendererProps {
  nodes: NavNode[];
  mode: "live" | "proposed";
  theme?: BrandTheme;
}
