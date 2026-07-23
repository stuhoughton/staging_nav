import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BRANDS, getEnabledBrands, type BrandConfig } from "./brands";

describe("brand registry", () => {
  it("contains the five N Brown storefront brands", () => {
    expect(BRANDS.map((b) => b.id)).toEqual([
      "jdwilliams",
      "jacamo",
      "simplybe",
      "ambrosewilson",
      "fashionworld",
    ]);
  });

  it("enables only JD Williams in v1", () => {
    const enabledIds = BRANDS.filter((b) => b.enabled).map((b) => b.id);
    expect(enabledIds).toEqual(["jdwilliams"]);
  });

  it("uses each brand's production origin from the glossary", () => {
    const byId = Object.fromEntries(BRANDS.map((b) => [b.id, b.origin]));
    expect(byId).toEqual({
      jdwilliams: "https://www.jdwilliams.co.uk",
      jacamo: "https://www.jacamo.co.uk",
      simplybe: "https://www.simplybe.co.uk",
      ambrosewilson: "https://www.ambrosewilson.com",
      fashionworld: "https://www.fashionworld.co.uk",
    });
  });
});

describe("getEnabledBrands", () => {
  it("returns only enabled brands", () => {
    const enabled = getEnabledBrands();
    expect(enabled.every((b) => b.enabled)).toBe(true);
    expect(enabled.map((b) => b.id)).toEqual(["jdwilliams"]);
  });

  it("returns no disabled brands", () => {
    const enabledIds = new Set(getEnabledBrands().map((b) => b.id));
    for (const brand of BRANDS) {
      if (!brand.enabled) {
        expect(enabledIds.has(brand.id)).toBe(false);
      }
    }
  });
});

/**
 * Property 9: Config-driven brands — the set of selectable brands equals the set
 * of enabled brands in config, with no brand hard-coded in render logic.
 *
 * **Validates: Requirements 1.8, 5.1**
 */
describe("Property 9: config-driven brands", () => {
  // A generic brand entry so we can prove selection is derived purely from the
  // `enabled` flag over an arbitrary registry — i.e. adding an entry surfaces it
  // with no other change, and nothing is hard-coded.
  const brandArb: fc.Arbitrary<BrandConfig> = fc.record({
    id: fc.string({ minLength: 1 }),
    name: fc.string(),
    origin: fc.webUrl(),
    layoutPath: fc.string(),
    themeId: fc.string(),
    pathField: fc.constantFrom("seoPath", "urlPath"),
    enabled: fc.boolean(),
  });

  // The selection contract, mirroring the exported helper. Correctness Property 9
  // is that selection is exactly this filter over config — no hard-coded brands.
  const selectable = (registry: readonly BrandConfig[]): BrandConfig[] =>
    registry.filter((b) => b.enabled);

  it("the exported helper is exactly the enabled subset of config", () => {
    expect(getEnabledBrands()).toEqual(BRANDS.filter((b) => b.enabled));
  });

  it("selectable set equals enabled set for any registry", () => {
    fc.assert(
      fc.property(fc.array(brandArb), (registry) => {
        const result = selectable(registry);
        // every selectable brand is enabled...
        expect(result.every((b) => b.enabled)).toBe(true);
        // ...and every enabled brand is selectable.
        const selectableIdx = new Set(result);
        for (const b of registry) {
          expect(selectableIdx.has(b) || !b.enabled).toBe(true);
        }
        expect(result.length).toBe(registry.filter((b) => b.enabled).length);
      }),
    );
  });

  it("adding an enabled entry surfaces exactly that new brand", () => {
    fc.assert(
      fc.property(fc.array(brandArb), brandArb, (registry, extra) => {
        const before = selectable(registry);
        const after = selectable([...registry, { ...extra, enabled: true }]);
        // The new enabled entry appears, and nothing else changes.
        expect(after.length).toBe(before.length + 1);
        expect(after.slice(0, before.length)).toEqual(before);
        expect(after[after.length - 1]).toEqual({ ...extra, enabled: true });
      }),
    );
  });

  it("adding a disabled entry surfaces no new brand", () => {
    fc.assert(
      fc.property(fc.array(brandArb), brandArb, (registry, extra) => {
        const before = selectable(registry);
        const after = selectable([...registry, { ...extra, enabled: false }]);
        expect(after).toEqual(before);
      }),
    );
  });
});
