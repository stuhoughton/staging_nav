/**
 * Shared data models for the Navigation Staging Site.
 *
 * These types are the single source of truth for the shape of navigation data
 * as it flows through the app: from the committed snapshot, through CSV import
 * and conversion, to the renderer. They mirror the confirmed JD Williams
 * `/api/layout` `nav` node schema and the design's Data Models section.
 */

/**
 * A single production navigation node, as observed in the live `nav` array.
 *
 * - `type: "G"` is a group/expandable node (typically has `navigationNode` children).
 * - `type: "L"` is a leaf link that points at `urlPath`.
 */
export interface NavNode {
  /** Display text, e.g. "Dresses". */
  title: string;
  /** Destination link the node points to, e.g. "/shop/c/womens/dresses". Not hierarchy-shaped; may carry query strings. */
  urlPath: string;
  /** Group (expandable) or Leaf (link). */
  type: "G" | "L";
  /** Clean, hierarchy-shaped path whose segments mirror tree position, e.g. "/womens/shop-by-category/dresses". */
  seoPath: string;
  /** Dash-joined icon identifier path, present on some nodes. */
  iconUrlPath?: string;
  /** Alt text, present on some nodes. */
  altText?: string;
  /** Child nodes, present on group nodes. */
  navigationNode?: NavNode[];
}

/**
 * Metadata recorded alongside a committed snapshot (written to `nav.meta.json`).
 */
export interface SnapshotMeta {
  brandId: string;
  /** ISO 8601 capture timestamp. */
  capturedAt: string;
  /** The source URL, i.e. origin + layoutPath. */
  source: string;
  status: "ok" | "failed";
  /** Populated when `status` is "failed". */
  lastError?: string;
}

/**
 * The selected brand's navigation plus display metadata, as surfaced to the UI
 * by the snapshot loader.
 */
export interface SnapshotBundle {
  brandId: string;
  nav: NavNode[];
  /** ISO 8601 capture timestamp, shown in the UI. */
  capturedAt: string;
  status: "ok" | "failed";
}

/**
 * One row of an imported Proposed_CSV: the node's current path and its proposed path.
 *
 * - `old` set, `new` empty  → remove.
 * - `old` empty, `new` set  → add.
 * - both set and differing   → move/rename.
 */
export interface ProposedRow {
  old: string;
  new: string;
}

/** Counts of the operations applied by a successful conversion, for display. */
export interface ChangeSummary {
  added: number;
  removed: number;
  moved: number;
}

/** A single, descriptive validation failure produced during import/conversion. */
export interface ValidationError {
  /** 1-based CSV row, when applicable. */
  row?: number;
  code:
    | "MISSING_COLUMN"
    | "EMPTY_ROW"
    | "OLD_NOT_FOUND"
    | "PARENT_NOT_FOUND"
    | "DUPLICATE_PATH"
    | "FILE_TOO_LARGE"
    | "PARSE_ERROR";
  message: string;
}

/**
 * The result of converting a Proposed_CSV against a live snapshot.
 *
 * All-or-nothing: either a fully converted tree with a summary, or the collected
 * per-row errors with no partial tree.
 */
export type ConversionOutcome =
  | { ok: true; nav: NavNode[]; summary: ChangeSummary }
  | { ok: false; errors: ValidationError[] };
