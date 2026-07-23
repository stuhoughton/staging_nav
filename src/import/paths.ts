/**
 * Path normalisation and live-tree indexing (Requirement 4.7; Correctness Property 6).
 *
 * This is the foundation of the CSV → navigation converter. It provides the two
 * primitives every add/remove/move operation (task 9.2) is built on:
 *
 *   - {@link normalisePath} turns a raw path value — whether it came from a CSV
 *     `old`/`new` cell or from a snapshot node's `pathField` — into a single
 *     canonical form. Because the *same* function is applied to both sides,
 *     matching is symmetric: a CSV path matches a snapshot node whenever they
 *     denote the same location, regardless of trivial formatting differences in
 *     slashes, casing, percent-encoding, or whitespace (Property 6).
 *   - {@link buildPathIndex} walks the live navigation tree and indexes every
 *     node by its normalised `node[pathField]` value, capturing each node's
 *     parent and depth so the converter can place, move, and remove nodes. The
 *     `pathField` is the abstracted match strategy from `BrandConfig` (design's
 *     "Match strategy") — `seoPath` by default, `urlPath` for JD Williams.
 *
 * The index reads the live tree but never mutates it; producing the proposed
 * tree without touching the live snapshot is the converter's job (Property 3).
 */
import type { NavNode } from "../data/types";

/** The node field the converter keys identity and placement off (design's abstracted `pathField`). */
export type PathField = "seoPath" | "urlPath";

/**
 * Decodes percent-encoding, tolerating malformed sequences.
 *
 * A colleague-authored CSV may contain a stray `%` that is not a valid escape
 * (e.g. `50% off`). `decodeURIComponent` throws on those, so we fall back to the
 * original string rather than rejecting an otherwise usable path.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Normalises a raw path into the single canonical form used for matching.
 *
 * Applied identically to CSV `old`/`new` values and to snapshot node path values,
 * which is what makes matching symmetric (Property 6). The steps, in order:
 *
 *   1. Trim surrounding whitespace and strip a leading BOM.
 *   2. Decode percent-encoding (tolerant of malformed escapes).
 *   3. Case-fold (lower-case) for case-insensitive comparison.
 *   4. Collapse any run of slashes to a single slash (fixes `//` and stray dupes).
 *   5. Ensure exactly one leading slash.
 *   6. Strip trailing slash(es), preserving the root `/`.
 *
 * An empty or slash-only input normalises to the root `/`.
 */
export function normalisePath(rawPath: string): string {
  // 1. trim + strip BOM
  let path = rawPath.replace(/^\uFEFF/, "").trim();
  // 2. decode percent-encoding
  path = safeDecode(path);
  // trim again in case decoding surfaced surrounding whitespace (e.g. %20)
  path = path.trim();
  // 3. case-fold
  path = path.toLowerCase();
  // 4. collapse runs of slashes to a single slash
  path = path.replace(/\/{2,}/g, "/");
  // 5. ensure a single leading slash
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  // 6. strip trailing slash(es), keeping the root
  if (path.length > 1) {
    path = path.replace(/\/+$/, "");
  }
  return path === "" ? "/" : path;
}

/** A live node located in the tree, keyed by its normalised path value. */
export interface IndexedNode {
  /** The live node (a reference into the live tree — not mutated by indexing). */
  node: NavNode;
  /** The node's parent, or `null` for a top-level node. */
  parent: NavNode | null;
  /** Depth in the tree: `0` for top-level nodes, `1` for their children, and so on. */
  depth: number;
  /** The normalised `pathField` value used as this node's index key. */
  key: string;
}

/**
 * An index of the live navigation tree, keyed by normalised `pathField` value.
 *
 * `byPath` maps each normalised path to the node that owns it. When two nodes
 * share the same normalised path the *first* encountered (depth-first,
 * document order) wins the map slot and the collided key is recorded in
 * {@link LiveTreeIndex.duplicates}, so the converter can surface a
 * `DUPLICATE_PATH` error rather than silently mismatching.
 */
export interface LiveTreeIndex {
  /** Normalised path → the node at that path (first occurrence wins on collision). */
  readonly byPath: ReadonlyMap<string, IndexedNode>;
  /** Normalised paths that appear on more than one node, each listed once. */
  readonly duplicates: readonly string[];
  /**
   * Looks a raw (un-normalised) path up in the index, normalising it the same way
   * node paths were normalised. This is the symmetric-matching entry point used by
   * the converter for CSV `old`/`new` values (Property 6).
   */
  lookup(rawPath: string): IndexedNode | undefined;
}

/**
 * Builds a {@link LiveTreeIndex} for a navigation tree, keyed by the normalised
 * value of each node's `pathField`.
 *
 * Traverses depth-first in document order, recording every node's parent and
 * depth. Duplicate normalised paths keep their first occurrence in `byPath` and
 * are collected in `duplicates`. The input tree is never mutated.
 */
export function buildPathIndex(nav: readonly NavNode[], pathField: PathField): LiveTreeIndex {
  const byPath = new Map<string, IndexedNode>();
  const duplicateSet = new Set<string>();

  const visit = (nodes: readonly NavNode[], parent: NavNode | null, depth: number): void => {
    for (const node of nodes) {
      const key = normalisePath(node[pathField]);
      if (byPath.has(key)) {
        // First occurrence wins the slot; record the collision once.
        duplicateSet.add(key);
      } else {
        byPath.set(key, { node, parent, depth, key });
      }
      if (node.navigationNode && node.navigationNode.length > 0) {
        visit(node.navigationNode, node, depth + 1);
      }
    }
  };

  visit(nav, null, 0);

  return {
    byPath,
    duplicates: [...duplicateSet],
    lookup(rawPath: string): IndexedNode | undefined {
      return byPath.get(normalisePath(rawPath));
    },
  };
}
