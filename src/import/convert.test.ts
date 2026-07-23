import { describe, expect, it } from "vitest";

import type { NavNode, ProposedRow } from "../data/types";
import { jdWilliamsNavFixture } from "../__fixtures__/jdwilliams-nav";
import { convert } from "./convert";

/** JD Williams keys node identity/placement off `urlPath` (see config/brands.ts). */
const PATH_FIELD = "urlPath" as const;

/** Depth-first lookup of a node by exact `urlPath`, for assertions. */
function findByUrlPath(nav: readonly NavNode[], urlPath: string): NavNode | undefined {
  for (const node of nav) {
    if (node.urlPath === urlPath) {
      return node;
    }
    if (node.navigationNode) {
      const found = findByUrlPath(node.navigationNode, urlPath);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/** Convenience: build a single-row conversion input. */
function row(oldValue: string, newValue: string): ProposedRow {
  return { old: oldValue, new: newValue };
}

describe("convert — remove (old set, new empty)", () => {
  it("removes a leaf node at the old path", () => {
    const result = convert(jdWilliamsNavFixture, [row("/shop/c/womens/dresses", "")], PATH_FIELD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findByUrlPath(result.nav, "/shop/c/womens/dresses")).toBeUndefined();
    // Siblings survive.
    expect(findByUrlPath(result.nav, "/shop/c/womens/tops")).toBeDefined();
    expect(result.summary).toEqual({ added: 0, removed: 1, moved: 0 });
  });

  it("removes a group and its entire subtree", () => {
    const result = convert(jdWilliamsNavFixture, [row("/shop/c/womens", "")], PATH_FIELD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findByUrlPath(result.nav, "/shop/c/womens")).toBeUndefined();
    // A descendant of the removed group is gone too.
    expect(findByUrlPath(result.nav, "/shop/c/womens/dresses")).toBeUndefined();
    // An unrelated top-level node is untouched.
    expect(findByUrlPath(result.nav, "/shop/c/mens")).toBeDefined();
  });

  it("reports OLD_NOT_FOUND when the old path matches no node", () => {
    const result = convert(jdWilliamsNavFixture, [row("/shop/c/ghost", "")], PATH_FIELD);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([expect.objectContaining({ row: 1, code: "OLD_NOT_FOUND" })]);
  });
});

describe("convert — add (old empty, new set)", () => {
  it("adds a leaf under an existing parent", () => {
    const result = convert(jdWilliamsNavFixture, [row("", "/shop/c/mens/jackets")], PATH_FIELD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const added = findByUrlPath(result.nav, "/shop/c/mens/jackets");
    expect(added).toBeDefined();
    expect(added?.type).toBe("L");
    expect(added?.title).toBe("Jackets"); // humanised last segment
    // Placed under the Mens group.
    const mens = findByUrlPath(result.nav, "/shop/c/mens");
    expect(mens?.navigationNode?.some((n) => n.urlPath === "/shop/c/mens/jackets")).toBe(true);
    expect(result.summary).toEqual({ added: 1, removed: 0, moved: 0 });
  });

  it("humanises a dashed last segment into a title", () => {
    const result = convert(
      jdWilliamsNavFixture,
      [row("", "/shop/c/mens/going-out-tops")],
      PATH_FIELD,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findByUrlPath(result.nav, "/shop/c/mens/going-out-tops")?.title).toBe("Going Out Tops");
  });

  it("adds a top-level node when the new path has a single segment", () => {
    const result = convert(jdWilliamsNavFixture, [row("", "/clearance")], PATH_FIELD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Present at the top level.
    expect(result.nav.some((n) => n.urlPath === "/clearance")).toBe(true);
  });

  it("reports PARENT_NOT_FOUND when the new parent does not exist", () => {
    const result = convert(
      jdWilliamsNavFixture,
      [row("", "/shop/c/nonexistent/child")],
      PATH_FIELD,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([expect.objectContaining({ row: 1, code: "PARENT_NOT_FOUND" })]);
  });

  it("reports DUPLICATE_PATH when the new path already exists", () => {
    const result = convert(jdWilliamsNavFixture, [row("", "/shop/c/sale")], PATH_FIELD);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([expect.objectContaining({ row: 1, code: "DUPLICATE_PATH" })]);
  });
});

describe("convert — move / rename (both set, differ)", () => {
  it("moves a node under a new parent, preserving its title", () => {
    const result = convert(
      jdWilliamsNavFixture,
      [row("/shop/c/womens/dresses", "/shop/c/mens/dresses")],
      PATH_FIELD,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Gone from the old location, present under Mens with the same title.
    expect(findByUrlPath(result.nav, "/shop/c/womens/dresses")).toBeUndefined();
    const moved = findByUrlPath(result.nav, "/shop/c/mens/dresses");
    expect(moved?.title).toBe("Dresses");
    const mens = findByUrlPath(result.nav, "/shop/c/mens");
    expect(mens?.navigationNode?.some((n) => n.urlPath === "/shop/c/mens/dresses")).toBe(true);
    expect(result.summary).toEqual({ added: 0, removed: 0, moved: 1 });
  });

  it("re-derives the title when the last segment changes (rename)", () => {
    const result = convert(jdWilliamsNavFixture, [row("/shop/c/sale", "/clearance")], PATH_FIELD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const renamed = findByUrlPath(result.nav, "/clearance");
    expect(renamed?.title).toBe("Clearance");
    expect(findByUrlPath(result.nav, "/shop/c/sale")).toBeUndefined();
  });

  it("reports OLD_NOT_FOUND when the old path matches no node", () => {
    const result = convert(
      jdWilliamsNavFixture,
      [row("/shop/c/none", "/shop/c/mens/none")],
      PATH_FIELD,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([expect.objectContaining({ row: 1, code: "OLD_NOT_FOUND" })]);
  });

  it("reports DUPLICATE_PATH when the new path is already occupied", () => {
    const result = convert(
      jdWilliamsNavFixture,
      [row("/shop/c/womens/dresses", "/shop/c/womens/tops")],
      PATH_FIELD,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([expect.objectContaining({ row: 1, code: "DUPLICATE_PATH" })]);
  });

  it("reports PARENT_NOT_FOUND when the new parent does not exist", () => {
    const result = convert(
      jdWilliamsNavFixture,
      [row("/shop/c/sale", "/shop/c/ghost/sale")],
      PATH_FIELD,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([expect.objectContaining({ row: 1, code: "PARENT_NOT_FOUND" })]);
  });
});

describe("convert — matching is normalisation-symmetric (Property 6 basis)", () => {
  it("matches an old path that differs only in case, slashes and whitespace", () => {
    const result = convert(
      jdWilliamsNavFixture,
      [row("  /shop/c/Womens/Dresses/  ", "")],
      PATH_FIELD,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findByUrlPath(result.nav, "/shop/c/womens/dresses")).toBeUndefined();
    expect(result.summary.removed).toBe(1);
  });
});

describe("convert — no-op rows", () => {
  it("skips a fully empty row without error or change", () => {
    const result = convert(jdWilliamsNavFixture, [row("", "")], PATH_FIELD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toEqual({ added: 0, removed: 0, moved: 0 });
  });

  it("treats old equal to new (after normalisation) as a no-op", () => {
    const result = convert(
      jdWilliamsNavFixture,
      [row("/shop/c/sale", "/shop/c/SALE/")],
      PATH_FIELD,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toEqual({ added: 0, removed: 0, moved: 0 });
    expect(findByUrlPath(result.nav, "/shop/c/sale")).toBeDefined();
  });
});

describe("convert — combined operations and summary", () => {
  it("applies remove, add and move together and counts them", () => {
    const rows: ProposedRow[] = [
      row("/shop/c/womens/knitwear", ""), // remove
      row("", "/shop/c/mens/jackets"), // add
      row("/shop/c/home/bedding", "/shop/c/mens/bedding"), // move
    ];
    const result = convert(jdWilliamsNavFixture, rows, PATH_FIELD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toEqual({ added: 1, removed: 1, moved: 1 });
    expect(findByUrlPath(result.nav, "/shop/c/womens/knitwear")).toBeUndefined();
    expect(findByUrlPath(result.nav, "/shop/c/mens/jackets")).toBeDefined();
    expect(findByUrlPath(result.nav, "/shop/c/mens/bedding")).toBeDefined();
  });
});

describe("convert — all-or-nothing (Property 5)", () => {
  it("rejects the whole import when any row is invalid and returns no tree", () => {
    const rows: ProposedRow[] = [
      row("/shop/c/womens/dresses", ""), // valid remove
      row("/shop/c/ghost", ""), // invalid: OLD_NOT_FOUND
    ];
    const result = convert(jdWilliamsNavFixture, rows, PATH_FIELD);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result).not.toHaveProperty("nav");
    expect(result.errors).toEqual([expect.objectContaining({ row: 2, code: "OLD_NOT_FOUND" })]);
  });

  it("collects errors from multiple invalid rows", () => {
    const rows: ProposedRow[] = [
      row("/shop/c/ghost", ""), // OLD_NOT_FOUND
      row("", "/shop/c/sale"), // DUPLICATE_PATH
    ];
    const result = convert(jdWilliamsNavFixture, rows, PATH_FIELD);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code)).toEqual(["OLD_NOT_FOUND", "DUPLICATE_PATH"]);
  });
});

describe("convert — live tree immutability (Property 3)", () => {
  it("does not mutate the input live tree on success", () => {
    const snapshot = structuredClone(jdWilliamsNavFixture);
    convert(
      jdWilliamsNavFixture,
      [row("/shop/c/womens/dresses", "/shop/c/mens/dresses"), row("", "/clearance")],
      PATH_FIELD,
    );
    expect(jdWilliamsNavFixture).toEqual(snapshot);
  });

  it("does not mutate the input live tree on rejection", () => {
    const snapshot = structuredClone(jdWilliamsNavFixture);
    convert(jdWilliamsNavFixture, [row("/shop/c/ghost", "")], PATH_FIELD);
    expect(jdWilliamsNavFixture).toEqual(snapshot);
  });
});

describe("convert — determinism (Property 4)", () => {
  it("produces an identical tree and summary across repeated runs", () => {
    const rows: ProposedRow[] = [
      row("/shop/c/womens/dresses", ""),
      row("", "/shop/c/mens/jackets"),
      row("/shop/c/sale", "/clearance"),
    ];
    const first = convert(jdWilliamsNavFixture, rows, PATH_FIELD);
    const second = convert(jdWilliamsNavFixture, rows, PATH_FIELD);

    expect(first).toEqual(second);
  });
});
