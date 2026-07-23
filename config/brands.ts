/**
 * Configuration-driven brand registry.
 *
 * Single source of truth for which brands exist and how each is handled. Adding
 * a brand is a configuration change — a new entry here — with no change to render
 * logic (Requirements 1.8, 5.1; Correctness Property 9).
 *
 * The first version targets JD Williams only: `jdwilliams` is the only entry with
 * `enabled: true`. The other four brands are present as disabled entries so they
 * can be turned on later without code changes.
 */

/** How each brand is fetched, themed, and matched. */
export interface BrandConfig {
  /** Stable identifier, e.g. "jdwilliams". Used as the data folder and theme key. */
  id: string;
  /** Display name, e.g. "JD Williams". */
  name: string;
  /** Production origin, e.g. "https://www.jdwilliams.co.uk". */
  origin: string;
  /** Path to the layout API on the origin, e.g. "/api/layout". */
  layoutPath: string;
  /** Key into the theme registry. */
  themeId: string;
  /** CSV converter match strategy — the node field paths are keyed off. Defaults to "seoPath". */
  pathField: "seoPath" | "urlPath";
  /** Whether the brand is selectable in the current version. */
  enabled: boolean;
}

/**
 * The full brand registry. Origins are taken from the requirements glossary.
 *
 * v1: only `jdwilliams` is enabled. The remaining four are staged as disabled
 * entries so enabling them later is a one-line config change.
 */
export const BRANDS: readonly BrandConfig[] = [
  {
    id: "jdwilliams",
    name: "JD Williams",
    origin: "https://www.jdwilliams.co.uk",
    layoutPath: "/api/layout",
    themeId: "jdwilliams",
    // CONFIRMED BY USER (task 8): the real JD Williams CSV `old`/`new` values are
    // `urlPath` destinations, not the design's provisional `seoPath` default. The
    // converter therefore keys node identity/placement off `urlPath` for this brand.
    pathField: "urlPath",
    enabled: true,
  },
  // The four brands below are not yet enabled. Their `pathField` is left at the
  // design default "seoPath" and MUST be confirmed (as JD Williams' was) before
  // each is turned on, since the correct field depends on that brand's real CSVs.
  {
    id: "jacamo",
    name: "Jacamo",
    origin: "https://www.jacamo.co.uk",
    layoutPath: "/api/layout",
    themeId: "jacamo",
    pathField: "seoPath",
    enabled: false,
  },
  {
    id: "simplybe",
    name: "Simply Be",
    origin: "https://www.simplybe.co.uk",
    layoutPath: "/api/layout",
    themeId: "simplybe",
    pathField: "seoPath",
    enabled: false,
  },
  {
    id: "ambrosewilson",
    name: "Ambrose Wilson",
    origin: "https://www.ambrosewilson.com",
    layoutPath: "/api/layout",
    themeId: "ambrosewilson",
    pathField: "seoPath",
    enabled: false,
  },
  {
    id: "fashionworld",
    name: "Fashion World",
    origin: "https://www.fashionworld.co.uk",
    layoutPath: "/api/layout",
    themeId: "fashionworld",
    pathField: "seoPath",
    enabled: false,
  },
];

/**
 * Returns only the brands that are enabled in the current version.
 *
 * This is the sole gate the UI uses to decide which brands are selectable, so the
 * set of selectable brands always equals the set of enabled config entries
 * (Correctness Property 9). No brand is hard-coded in render logic.
 */
export function getEnabledBrands(): BrandConfig[] {
  return BRANDS.filter((brand) => brand.enabled);
}
