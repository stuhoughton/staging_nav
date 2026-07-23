/**
 * Property-based tests for the CSV → navigation converter (task 9.3).
 *
 * These fast-check properties complement the example-based cases in
 * `convert.test.ts`. They generate randomised small navigation trees and
 * randomised `old`/`new` row sets (mixing genuine add / remove / move operations
 * with deliberately-invalid ones) and assert the converter's four universal
 * guarantees from the design's Correctness Properties:
 *
 *   - Property 3 — Live tree immutability: after any conversion (accepted or
 *     rejected) the input live tree is deep-equal to its original.
 *     **Validates: Requirements 4.1, 4.5**
 *   - Property 4 — Deterministic conversion: the same inputs produce an identical
 *     output tree and summary across repeated runs.
 *     **Validates: Requirements 4.1**
 *   - Property 5 — All-or-nothing import: any invalid row yields `ok: false` and
 *     no partial tree.
 *     **Validates: Requirements 4.3, 4.4**
 *   - Property 6 — Path-match consistency: matching is invariant to
 *     slash/case/encoding/whitespace differences in the CSV values.
 *     **Validates: Requirements 4.7, 4.8, 4.9, 4.10**
 *
 * The generated trees use hierarchy-shaped, globally-unique `urlPath`/`seoPath`
 * values (`/seg0`, `/seg0/seg3`, …) so that a node's parent path (its path minus
 * the last segment) always resolves to a real ancestor. That lets the row
 * generators derive genuinely valid add/remove/move operations as well as
 * deliberately-invalid ones. JD Williams keys identity off `urlPath`
 * (see `config/brands.ts`), which is the field these tests match on.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { NavNode, ProposedRow } from "../data/types";
import { convert } from "./convert";
import { normalisePath, type PathField } from "./paths";

/** JD Williams keys node identity/placement off `urlPath` (see config/brands.ts). */
const PATH_FIELD: PathField = "urlPath";

/** Keep property runs snappy on these small, bounded inputs (aligned with the
 * global fast-check cap in vitest.setup.ts). */
const NUM_RUNS = 25;

// ---------------------------------------------------------------------------
// Arbitraries: small random trees with unique, hierarchy-shaped paths
// ---------------------------------------------------------------------------

/** A bare tree shape before paths/labels are assigned. */
interface RawShape {
  isGroup: boolean;
  children: RawShape[];
}

/**
 * Explicitly depth-bounded shape arbitrary. Recursion stops at `depth === 0`,
 * which guarantees termination and keeps trees small (max depth 3, matching the
 * three-level nesting observed in production).
 */
function rawShapeArb(depth: number): fc.Arbitrary<RawShape> {
  const childrenArb: fc.Arbitrary<RawShape[]> =
    depth <= 0 ? fc.constant<RawShape[]>([]) : fc.array(rawShapeArb(depth - 1), { maxLength: 3 });
  return fc.record({ isGroup: fc.boolean(), children: childrenArb });
}

/**
 * Turns raw shapes into a `NavNode[]` with globally-unique, hierarchy-shaped
 * paths. Each node's `urlPath`/`seoPath` is `<parentPath>/seg<n>`, so its parent
 * path resolves to its real parent and every path is already in canonical form.
 */
function buildTree(shapes: readonly RawShape[]): NavNode[] {
  let counter = 0;
  const walk = (nodes: readonly RawShape[], parentPath: string): NavNode[] =>
    nodes.map((shape) => {
      const segment = `seg${counter++}`;
      const path = `${parentPath}/${segment}`;
      const hasChildren = shape.children.length > 0;
      const node: NavNode = {
        title: segment,
        urlPath: path,
        type: shape.isGroup || hasChildren ? "G" : "L",
        seoPath: path,
      };
      if (hasChildren) {
        node.navigationNode = walk(shape.children, path);
      }
      return node;
    });
  return walk(shapes, "");
}

const treeArb: fc.Arbitrary<NavNode[]> = fc.array(rawShapeArb(3), { maxLength: 4 }).map(buildTree);

const nonEmptyTreeArb: fc.Arbitrary<NavNode[]> = treeArb.filter(
  (tree) => collectPaths(tree).length > 0,
);

/** All node paths in document order. Paths are already canonical by construction. */
function collectPaths(nav: readonly NavNode[]): string[] {
  const paths: string[] = [];
  const walk = (nodes: readonly NavNode[]): void => {
    for (const node of nodes) {
      paths.push(node.urlPath);
      if (node.navigationNode) {
        walk(node.navigationNode);
      }
    }
  };
  walk(nav);
  return paths;
}

// ---------------------------------------------------------------------------
// Arbitraries: mixed row sets (valid add/remove/move + deliberately-invalid)
// ---------------------------------------------------------------------------

/** A fresh, never-in-tree segment (existing segments are all `seg<n>`). */
const freshSegment: fc.Arbitrary<string> = fc.integer({ min: 0, max: 99999 }).map((i) => `x${i}`);

/**
 * A row generator for a given tree's paths, mixing valid operations (remove,
 * add-under-existing-parent, move) with deliberately-invalid ones
 * (OLD_NOT_FOUND, PARENT_NOT_FOUND, DUPLICATE_PATH) and no-ops.
 */
function rowArbFor(paths: readonly string[]): fc.Arbitrary<ProposedRow> {
  const generators: fc.Arbitrary<ProposedRow>[] = [
    // Add at the top level.
    freshSegment.map((seg) => ({ old: "", new: `/${seg}` })),
    // Add under a non-existent parent → PARENT_NOT_FOUND.
    fc.tuple(freshSegment, freshSegment).map(([a, b]) => ({ old: "", new: `/ghost-${a}/${b}` })),
    // Remove a node that is not present → OLD_NOT_FOUND.
    freshSegment.map((seg) => ({ old: `/ghost-${seg}`, new: "" })),
    // A fully empty (no-op) row.
    fc.constant<ProposedRow>({ old: "", new: "" }),
  ];

  if (paths.length > 0) {
    const pickExisting = fc.constantFrom(...paths);
    generators.push(
      // Remove an existing node (or one of its ancestors).
      pickExisting.map((p) => ({ old: p, new: "" })),
      // Add a child under an existing parent.
      fc.tuple(pickExisting, freshSegment).map(([p, seg]) => ({ old: "", new: `${p}/${seg}` })),
      // Add over an existing path → DUPLICATE_PATH.
      pickExisting.map((p) => ({ old: "", new: p })),
      // Move an existing node under an existing parent with a fresh segment.
      fc
        .tuple(pickExisting, pickExisting, freshSegment)
        .map(([from, parent, seg]) => ({ old: from, new: `${parent}/${seg}` })),
    );
  }

  return fc.oneof(...generators);
}

/** A tree paired with a mixed set of rows derived from it. */
const scenarioArb: fc.Arbitrary<{ tree: NavNode[]; rows: ProposedRow[] }> = treeArb.chain((tree) =>
  fc.record({
    tree: fc.constant(tree),
    rows: fc.array(rowArbFor(collectPaths(tree)), { maxLength: 8 }),
  }),
);

// ---------------------------------------------------------------------------
// Path mangling for Property 6 (equivalent spellings of the same path)
// ---------------------------------------------------------------------------

interface MangleOpts {
  upper: boolean;
  trailingSlash: boolean;
  doubleSlash: boolean;
  pad: boolean;
  encode: boolean;
}

const mangleOptsArb: fc.Arbitrary<MangleOpts> = fc.record({
  upper: fc.boolean(),
  trailingSlash: fc.boolean(),
  doubleSlash: fc.boolean(),
  pad: fc.boolean(),
  encode: fc.boolean(),
});

/** Percent-encodes every alphanumeric character; decodes back to the original. */
function encodeAlphanumerics(value: string): string {
  return value.replace(/[a-z0-9]/gi, (ch) => `%${ch.charCodeAt(0).toString(16)}`);
}

/**
 * Rewrites a canonical path into a trivially-different but normalisation-equivalent
 * spelling: upper-casing, extra/duplicated slashes, percent-encoding, and padding.
 * Every transformation is undone by `normalisePath`, so the mangled value must
 * still match the same node.
 */
function mangle(path: string, opts: MangleOpts): string {
  let result = path;
  if (opts.upper) {
    result = result.toUpperCase();
  }
  if (opts.doubleSlash) {
    result = result.replace(/\//g, "//");
  }
  if (opts.encode) {
    result = encodeAlphanumerics(result);
  }
  if (opts.trailingSlash) {
    result = `${result}/`;
  }
  if (opts.pad) {
    result = `  ${result}  `;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Property 3: live tree immutability
// ---------------------------------------------------------------------------

describe("Property 3: live tree immutability", () => {
  // **Validates: Requirements 4.1, 4.5**
  it("never mutates the input live tree, for any tree and any rows", () => {
    fc.assert(
      fc.property(scenarioArb, ({ tree, rows }) => {
        const before = structuredClone(tree);
        convert(tree, rows, PATH_FIELD);
        expect(tree).toEqual(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: deterministic conversion
// ---------------------------------------------------------------------------

describe("Property 4: deterministic conversion", () => {
  // **Validates: Requirements 4.1**
  it("produces an identical outcome (tree and summary) across repeated runs", () => {
    fc.assert(
      fc.property(scenarioArb, ({ tree, rows }) => {
        const first = convert(tree, rows, PATH_FIELD);
        const second = convert(tree, rows, PATH_FIELD);
        expect(first).toEqual(second);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: all-or-nothing import
// ---------------------------------------------------------------------------

describe("Property 5: all-or-nothing import", () => {
  // **Validates: Requirements 4.3, 4.4**
  it("rejects the whole import with no partial tree when any row is invalid", () => {
    // This path can never exist in a generated tree, nor be created by any row
    // the generators emit, so it always yields OLD_NOT_FOUND → ok: false.
    const guaranteedInvalid: ProposedRow = { old: "/__never_present__/__child__", new: "" };

    fc.assert(
      fc.property(scenarioArb, ({ tree, rows }) => {
        const result = convert(tree, [...rows, guaranteedInvalid], PATH_FIELD);
        expect(result.ok).toBe(false);
        // No partial tree is ever returned on rejection.
        expect(result).not.toHaveProperty("nav");
        // The rejection carries per-row errors, including the guaranteed miss.
        if (!result.ok) {
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some((error) => error.code === "OLD_NOT_FOUND")).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: path-match consistency
// ---------------------------------------------------------------------------

describe("Property 6: path-match consistency", () => {
  it("only applies normalisation-invariant manglings (guards the test's own assumption)", () => {
    // Every mangle we apply is one normalisePath is defined to undo, so a mangled
    // path must share the canonical form of the original. If this ever fails the
    // matching tests below would be exercising the wrong thing.
    fc.assert(
      fc.property(
        nonEmptyTreeArb.chain((tree) =>
          fc.record({
            target: fc.constantFrom(...collectPaths(tree)),
            opts: mangleOptsArb,
          }),
        ),
        ({ target, opts }) => {
          expect(normalisePath(mangle(target, opts))).toBe(normalisePath(target));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("matches an 'old' path regardless of slash/case/encoding/whitespace (remove)", () => {
    fc.assert(
      fc.property(
        nonEmptyTreeArb.chain((tree) =>
          fc.record({
            tree: fc.constant(tree),
            target: fc.constantFrom(...collectPaths(tree)),
            opts: mangleOptsArb,
          }),
        ),
        ({ tree, target, opts }) => {
          const clean = convert(tree, [{ old: target, new: "" }], PATH_FIELD);
          const mangled = convert(tree, [{ old: mangle(target, opts), new: "" }], PATH_FIELD);
          // The clean removal genuinely matched a node...
          expect(clean.ok).toBe(true);
          // ...and the mangled spelling produces the exact same outcome.
          expect(mangled).toEqual(clean);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("matches both 'old' and 'new' paths regardless of formatting (move)", () => {
    fc.assert(
      fc.property(
        nonEmptyTreeArb.chain((tree) => {
          const paths = collectPaths(tree);
          return fc.record({
            tree: fc.constant(tree),
            from: fc.constantFrom(...paths),
            destParent: fc.constantFrom(...paths),
            seg: freshSegment,
            oldOpts: mangleOptsArb,
            newOpts: mangleOptsArb,
          });
        }),
        ({ tree, from, destParent, seg, oldOpts, newOpts }) => {
          const newPath = `${destParent}/${seg}`;
          const clean = convert(tree, [{ old: from, new: newPath }], PATH_FIELD);
          const mangled = convert(
            tree,
            [{ old: mangle(from, oldOpts), new: mangle(newPath, newOpts) }],
            PATH_FIELD,
          );
          // A genuine move (fresh destination segment, existing source & parent)...
          expect(clean.ok).toBe(true);
          // ...matches identically however the two paths are spelled.
          expect(mangled).toEqual(clean);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
