import { describe, expect, it } from "vitest";

import type { NavNode } from "../data/types";
import { jdWilliamsNavFixture } from "../__fixtures__/jdwilliams-nav";
import { buildPathIndex, normalisePath } from "./paths";

describe("normalisePath", () => {
  it("returns an already-canonical path unchanged", () => {
    expect(normalisePath("/shop/c/womens/dresses")).toBe("/shop/c/womens/dresses");
  });

  describe("whitespace", () => {
    it("trims surrounding whitespace", () => {
      expect(normalisePath("   /womens/dresses   ")).toBe("/womens/dresses");
    });

    it("strips a leading byte-order mark", () => {
      expect(normalisePath("\uFEFF/womens")).toBe("/womens");
    });
  });

  describe("leading slash", () => {
    it("adds a missing leading slash", () => {
      expect(normalisePath("womens/dresses")).toBe("/womens/dresses");
    });

    it("collapses multiple leading slashes to one", () => {
      expect(normalisePath("///womens/dresses")).toBe("/womens/dresses");
    });
  });

  describe("trailing slash", () => {
    it("strips a single trailing slash", () => {
      expect(normalisePath("/womens/dresses/")).toBe("/womens/dresses");
    });

    it("strips multiple trailing slashes", () => {
      expect(normalisePath("/womens/dresses///")).toBe("/womens/dresses");
    });

    it("preserves the root path", () => {
      expect(normalisePath("/")).toBe("/");
    });
  });

  describe("internal slashes", () => {
    it("collapses runs of internal slashes to a single slash", () => {
      expect(normalisePath("/womens//shop-by-category///dresses")).toBe(
        "/womens/shop-by-category/dresses",
      );
    });
  });

  describe("casing", () => {
    it("lower-cases for case-insensitive comparison", () => {
      expect(normalisePath("/Womens/Shop-By-Category/DRESSES")).toBe(
        "/womens/shop-by-category/dresses",
      );
    });
  });

  describe("percent-encoding", () => {
    it("decodes percent-encoded segments", () => {
      expect(normalisePath("/womens/shop%20by%20category")).toBe("/womens/shop by category");
    });

    it("decodes an encoded slash and then collapses it", () => {
      expect(normalisePath("/womens%2F%2Fdresses")).toBe("/womens/dresses");
    });

    it("tolerates a malformed percent sequence rather than throwing", () => {
      expect(normalisePath("/sale/50%-off")).toBe("/sale/50%-off");
    });
  });

  describe("empty input", () => {
    it("normalises an empty string to the root", () => {
      expect(normalisePath("")).toBe("/");
    });

    it("normalises whitespace-only input to the root", () => {
      expect(normalisePath("   ")).toBe("/");
    });
  });

  it("is idempotent: normalising a normalised path is a no-op", () => {
    const messy = "  ///Womens//Shop-By-Category/Dresses/// ";
    const once = normalisePath(messy);
    expect(normalisePath(once)).toBe(once);
  });

  it("normalises CSV and snapshot spellings of the same path to one key (Property 6 basis)", () => {
    // A snapshot value and its trivially-different CSV spelling collapse to the
    // same canonical form, which is what makes matching symmetric.
    const snapshotValue = "/shop/c/womens/dresses";
    const csvValue = " /shop/c/Womens/Dresses/ ";
    expect(normalisePath(csvValue)).toBe(normalisePath(snapshotValue));
  });
});

describe("buildPathIndex", () => {
  it("indexes every node in a nested tree keyed by the chosen pathField", () => {
    const index = buildPathIndex(jdWilliamsNavFixture, "seoPath");

    // 4 top-level + 2 (womens children) + 3 (dresses/tops/knitwear)
    // + 1 (mens child group) + 2 (shirts/trousers) + 1 (home child) = 13 nodes.
    expect(index.byPath.size).toBe(13);
    expect(index.duplicates).toEqual([]);

    // A top-level group, a mid-level group, and a deep leaf are all present.
    expect(index.byPath.has("/womens")).toBe(true);
    expect(index.byPath.has("/womens/shop-by-category")).toBe(true);
    expect(index.byPath.has("/womens/shop-by-category/dresses")).toBe(true);
    expect(index.byPath.has("/sale")).toBe(true);
  });

  it("records each node's parent and depth", () => {
    const index = buildPathIndex(jdWilliamsNavFixture, "seoPath");

    const womens = index.byPath.get("/womens");
    expect(womens?.parent).toBeNull();
    expect(womens?.depth).toBe(0);

    const shopByCategory = index.byPath.get("/womens/shop-by-category");
    expect(shopByCategory?.parent).toBe(womens?.node);
    expect(shopByCategory?.depth).toBe(1);

    const dresses = index.byPath.get("/womens/shop-by-category/dresses");
    expect(dresses?.parent).toBe(shopByCategory?.node);
    expect(dresses?.depth).toBe(2);
    expect(dresses?.node.title).toBe("Dresses");
  });

  it("keys off urlPath when that is the configured pathField (JD Williams)", () => {
    const index = buildPathIndex(jdWilliamsNavFixture, "urlPath");

    // urlPath values differ from seoPath values, so the keys differ too.
    expect(index.byPath.has("/shop/c/womens/dresses")).toBe(true);
    expect(index.byPath.has("/womens/shop-by-category/dresses")).toBe(false);
  });

  it("does not mutate the input tree", () => {
    const snapshot = structuredClone(jdWilliamsNavFixture);
    buildPathIndex(jdWilliamsNavFixture, "urlPath");
    expect(jdWilliamsNavFixture).toEqual(snapshot);
  });

  describe("duplicate paths", () => {
    const duplicateTree: NavNode[] = [
      { title: "Sale", urlPath: "/sale", type: "L", seoPath: "/sale" },
      // Same seoPath as the first node, differently cased / trailing-slashed.
      { title: "Clearance", urlPath: "/clearance", type: "L", seoPath: "/Sale/" },
      { title: "Womens", urlPath: "/womens", type: "L", seoPath: "/womens" },
    ];

    it("surfaces a normalised duplicate once in `duplicates`", () => {
      const index = buildPathIndex(duplicateTree, "seoPath");
      expect(index.duplicates).toEqual(["/sale"]);
    });

    it("keeps the first occurrence in the map on collision", () => {
      const index = buildPathIndex(duplicateTree, "seoPath");
      // The first node ("Sale") wins the slot; the collision does not overwrite it.
      expect(index.byPath.get("/sale")?.node.title).toBe("Sale");
      // Non-colliding nodes are still indexed.
      expect(index.byPath.get("/womens")?.node.title).toBe("Womens");
    });

    it("counts each colliding key once even with several collisions", () => {
      const tripled: NavNode[] = [
        { title: "A", urlPath: "/a", type: "L", seoPath: "/dupe" },
        { title: "B", urlPath: "/b", type: "L", seoPath: "/dupe" },
        { title: "C", urlPath: "/c", type: "L", seoPath: "/DUPE/" },
      ];
      const index = buildPathIndex(tripled, "seoPath");
      expect(index.duplicates).toEqual(["/dupe"]);
      expect(index.byPath.size).toBe(1);
    });
  });

  describe("lookup", () => {
    it("finds a node from a trivially-different CSV spelling (symmetric matching)", () => {
      const index = buildPathIndex(jdWilliamsNavFixture, "urlPath");
      // A CSV cell with different casing, extra whitespace and a trailing slash
      // still resolves to the snapshot node — Property 6 in action.
      const hit = index.lookup("  /shop/c/Womens/Dresses/  ");
      expect(hit?.node.title).toBe("Dresses");
    });

    it("returns undefined when no node matches", () => {
      const index = buildPathIndex(jdWilliamsNavFixture, "urlPath");
      expect(index.lookup("/shop/c/nonexistent")).toBeUndefined();
    });
  });
});
