/**
 * CSV → navigation converter: apply add / remove / move-rename (Requirements 4.1,
 * 4.4, 4.8, 4.9, 4.10; Correctness Properties 3, 4, 5).
 *
 * This is the second half of the client-side `parse → validate → convert → render`
 * pipeline. Given the loaded live navigation tree and the parsed `old`/`new` rows,
 * {@link convert} produces a brand-new proposed tree — it never mutates the live
 * snapshot — or, if any row is invalid, rejects the whole import with per-row
 * errors and no partial tree.
 *
 * Operation semantics keyed off each row's `old`/`new` values (Req 4.8–4.10):
 *
 *   - **Remove** (`old` set, `new` empty): delete the node at the `old` path; if it
 *     is a group its whole subtree goes with it. Missing `old` → `OLD_NOT_FOUND`.
 *   - **Add** (`old` empty, `new` set): insert a new leaf at the position implied by
 *     `new`. Its parent is derived from `new`'s parent segments; a missing parent →
 *     `PARENT_NOT_FOUND`; a path already occupied → `DUPLICATE_PATH`.
 *   - **Move / rename** (`old` and `new` both set and differ): relocate the node at
 *     `old` to the position implied by `new`, updating its `pathField` value to
 *     `new`. Missing `old` → `OLD_NOT_FOUND`; missing new parent → `PARENT_NOT_FOUND`;
 *     new path already occupied → `DUPLICATE_PATH`.
 *
 * Matching is symmetric: every `old`/`new` value and every node's `pathField` value
 * is run through {@link normalisePath} (reused from `paths.ts`), so trivial
 * slash/case/encoding differences never cause a mismatch (Property 6). The confirmed
 * `pathField` for JD Williams is `urlPath` (see `config/brands.ts`).
 *
 * Provisional defaults for synthesised values (PROVISIONAL — revisit against a real
 * sample CSV, per the design's "Known semantic gaps to close with a sample CSV"):
 *
 *   - Added node `title` = humanised last path segment (e.g. `shop-by-category` →
 *     "Shop By Category").
 *   - Added node paths (`urlPath`/`seoPath`) = the normalised `new` path.
 *   - Added node `type` = `"L"` (a leaf; we do not fabricate intermediate groups).
 *   - Sibling order = appended after existing siblings, in CSV row order among adds.
 *   - Move/rename preserves the node's `title` unless the last segment changes (a
 *     rename), in which case the title is re-derived from the new last segment.
 */
import type {
  ChangeSummary,
  ConversionOutcome,
  NavNode,
  ProposedRow,
  ValidationError,
} from "../data/types";
import { normalisePath, type PathField } from "./paths";

/** Splits a normalised path into its non-empty segments (e.g. `/a/b` → `["a", "b"]`). */
function segmentsOf(normalised: string): string[] {
  return normalised.split("/").filter((segment) => segment.length > 0);
}

/**
 * The normalised parent path of a normalised path, or `null` when the path is
 * top-level (a single segment, whose parent is the root).
 */
function parentPathOf(normalised: string): string | null {
  const segments = segmentsOf(normalised);
  if (segments.length <= 1) {
    return null;
  }
  return `/${segments.slice(0, -1).join("/")}`;
}

/**
 * Humanises the last segment of a raw path into a provisional display title:
 * decode, take the final path segment, replace dashes/underscores with spaces,
 * collapse whitespace, and title-case each word. Falls back to the trimmed raw
 * value when no usable segment is present.
 */
function humaniseLastSegment(rawPath: string): string {
  const normalised = normalisePath(rawPath);
  const segments = segmentsOf(normalised);
  const last = segments[segments.length - 1] ?? "";
  const words = last.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (words === "") {
    return rawPath.trim();
  }
  return words
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** A node located within the working tree, together with the array that holds it. */
interface Located {
  node: NavNode;
  /** The array the node lives in (top-level array or a parent's `navigationNode`). */
  siblings: NavNode[];
  /** The node's parent, or `null` for a top-level node. */
  parent: NavNode | null;
}

/**
 * Finds the node whose `pathField` value normalises to `target`, returning it with
 * its containing array and parent. Depth-first in document order; the first match
 * wins. Reads the working tree only.
 */
function locate(tree: NavNode[], pathField: PathField, target: string): Located | undefined {
  const visit = (siblings: NavNode[], parent: NavNode | null): Located | undefined => {
    for (const node of siblings) {
      if (normalisePath(node[pathField]) === target) {
        return { node, siblings, parent };
      }
      if (node.navigationNode && node.navigationNode.length > 0) {
        const found = visit(node.navigationNode, node);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  };
  return visit(tree, null);
}

/**
 * Returns the child array a node identified by `parentPath` owns, creating a
 * `navigationNode` array on it if absent, or the top-level array when `parentPath`
 * is `null`. Returns `undefined` when a non-null parent path matches no node.
 */
function resolveChildArray(
  tree: NavNode[],
  pathField: PathField,
  parentPath: string | null,
): NavNode[] | undefined {
  if (parentPath === null) {
    return tree;
  }
  const parent = locate(tree, pathField, parentPath);
  if (!parent) {
    return undefined;
  }
  if (!parent.node.navigationNode) {
    parent.node.navigationNode = [];
  }
  return parent.node.navigationNode;
}

/** Builds a provisional added leaf node with both path fields set to `newPath`. */
function makeAddedNode(newPath: string, rawNew: string): NavNode {
  return {
    title: humaniseLastSegment(rawNew),
    urlPath: newPath,
    type: "L",
    seoPath: newPath,
  };
}

/**
 * Converts a live navigation tree plus parsed CSV rows into a proposed tree.
 *
 * Never mutates `live` (Property 3): all work happens on a structural clone.
 * Deterministic (Property 4): rows are applied in order with no time/randomness.
 * All-or-nothing (Property 5): if any row produces a `ValidationError`, the whole
 * import is rejected with the collected errors and no tree is returned.
 *
 * @param live      The loaded live snapshot navigation (left untouched).
 * @param rows      Parsed `old`/`new` rows (already column-validated by `csv.ts`).
 * @param pathField The brand's configured match field (`urlPath` for JD Williams).
 */
export function convert(
  live: readonly NavNode[],
  rows: readonly ProposedRow[],
  pathField: PathField,
): ConversionOutcome {
  // Property 3: operate on a deep clone so the live tree is never mutated.
  const working: NavNode[] = structuredClone(live) as NavNode[];
  const errors: ValidationError[] = [];
  const summary: ChangeSummary = { added: 0, removed: 0, moved: 0 };

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const oldRaw = row.old ?? "";
    const newRaw = row.new ?? "";
    const oldEmpty = oldRaw.trim() === "";
    const newEmpty = newRaw.trim() === "";

    // Empty rows carry no operation; they are reported by validateRows (csv.ts),
    // so here they are simply skipped to keep conversion focused and deterministic.
    if (oldEmpty && newEmpty) {
      return;
    }

    const oldPath = normalisePath(oldRaw);
    const newPath = normalisePath(newRaw);

    // REMOVE: old set, new empty.
    if (!oldEmpty && newEmpty) {
      const located = locate(working, pathField, oldPath);
      if (!located) {
        errors.push({
          row: rowNumber,
          code: "OLD_NOT_FOUND",
          message: `Row ${rowNumber}: no navigation node matches the "old" path "${oldRaw}".`,
        });
        return;
      }
      const position = located.siblings.indexOf(located.node);
      located.siblings.splice(position, 1);
      summary.removed += 1;
      return;
    }

    // ADD: old empty, new set.
    if (oldEmpty && !newEmpty) {
      if (locate(working, pathField, newPath)) {
        errors.push({
          row: rowNumber,
          code: "DUPLICATE_PATH",
          message: `Row ${rowNumber}: a navigation node already exists at the "new" path "${newRaw}".`,
        });
        return;
      }
      const childArray = resolveChildArray(working, pathField, parentPathOf(newPath));
      if (!childArray) {
        errors.push({
          row: rowNumber,
          code: "PARENT_NOT_FOUND",
          message: `Row ${rowNumber}: the parent of the "new" path "${newRaw}" does not exist.`,
        });
        return;
      }
      childArray.push(makeAddedNode(newPath, newRaw));
      summary.added += 1;
      return;
    }

    // Both set and equal after normalisation: a no-op (no move, no rename).
    if (oldPath === newPath) {
      return;
    }

    // MOVE / RENAME: old and new both set and differ.
    const located = locate(working, pathField, oldPath);
    if (!located) {
      errors.push({
        row: rowNumber,
        code: "OLD_NOT_FOUND",
        message: `Row ${rowNumber}: no navigation node matches the "old" path "${oldRaw}".`,
      });
      return;
    }
    if (locate(working, pathField, newPath)) {
      errors.push({
        row: rowNumber,
        code: "DUPLICATE_PATH",
        message: `Row ${rowNumber}: a navigation node already exists at the "new" path "${newRaw}".`,
      });
      return;
    }
    const destination = resolveChildArray(working, pathField, parentPathOf(newPath));
    if (!destination) {
      errors.push({
        row: rowNumber,
        code: "PARENT_NOT_FOUND",
        message: `Row ${rowNumber}: the parent of the "new" path "${newRaw}" does not exist.`,
      });
      return;
    }

    // Detach from the current location.
    const position = located.siblings.indexOf(located.node);
    located.siblings.splice(position, 1);

    // Update the node's identity to the new path. When pathField is "urlPath" this
    // is the move itself; when it is "seoPath" the urlPath destination is preserved.
    const moved = located.node;
    moved[pathField] = newPath;

    // Rename provisional default: if the final segment changed, re-derive the title.
    const oldLast = segmentsOf(oldPath).slice(-1)[0] ?? "";
    const newLast = segmentsOf(newPath).slice(-1)[0] ?? "";
    if (oldLast !== newLast) {
      moved.title = humaniseLastSegment(newRaw);
    }

    destination.push(moved);
    summary.moved += 1;
  });

  if (errors.length > 0) {
    // Property 5: any invalid row rejects the whole import — no partial tree.
    return { ok: false, errors };
  }

  return { ok: true, nav: working, summary };
}
