/**
 * Tests for the snapshot extraction logic.
 *
 * `fetch` is always mocked — these tests never touch a production endpoint — and
 * the filesystem is an in-memory {@link FileStore}, so they are fast and isolated.
 *
 * Coverage:
 *  - Unit: extracts only `nav`; discards other keys; writes correct metadata and
 *    timestamp; fail-safe retains the previous snapshot and records the failure.
 *  - Property 1 (Snapshot purity): the committed snapshot is exactly the `nav`
 *    array, nothing else from the layout response.  **Validates: Requirements 2.1, 2.2**
 *  - Property 2 (Fail-safe snapshots): after any run every brand still has a valid
 *    `nav.json` — freshly captured or the previous good one retained.
 *    **Validates: Requirements 1.6**
 */
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import type { BrandConfig } from "../config/brands";
import type { NavNode } from "../src/data/types";
import { jdWilliamsNavFixture } from "../src/__fixtures__/jdwilliams-nav";
import {
  type FetchLike,
  type FileStore,
  runSnapshot,
  snapshotBrand,
  snapshotBrandToStore,
} from "./snapshot";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const BRAND: BrandConfig = {
  id: "jdwilliams",
  name: "JD Williams",
  origin: "https://www.jdwilliams.co.uk",
  layoutPath: "/api/layout",
  themeId: "jdwilliams",
  pathField: "seoPath",
  enabled: true,
};

/** An in-memory FileStore for assertions without touching disk. */
function memoryStore(initial: Record<string, string> = {}): FileStore & {
  files: Map<string, string>;
} {
  const files = new Map<string, string>(Object.entries(initial));
  return {
    files,
    async readFile(path: string): Promise<string | null> {
      return files.has(path) ? (files.get(path) as string) : null;
    },
    async writeFile(path: string, contents: string): Promise<void> {
      files.set(path, contents);
    },
  };
}

/** A mock fetch that returns the given body as JSON with HTTP 200. */
function okFetch(body: unknown): FetchLike {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }));
}

/** A mock fetch that returns a non-OK HTTP status. */
function httpErrorFetch(status: number): FetchLike {
  return vi.fn(async () => ({
    ok: false,
    status,
    json: async () => ({}),
  }));
}

/** A mock fetch that rejects, simulating a network failure. */
function rejectingFetch(message: string): FetchLike {
  return vi.fn(async () => {
    throw new Error(message);
  });
}

const navJsonPath = "data/jdwilliams/nav.json";
const metaJsonPath = "data/jdwilliams/nav.meta.json";

// ---------------------------------------------------------------------------
// Unit tests: snapshotBrand extraction
// ---------------------------------------------------------------------------

describe("snapshotBrand", () => {
  it("extracts only the nav array and discards other keys", async () => {
    const layout = {
      nav: jdWilliamsNavFixture,
      header: { logo: "brand-logo", account: "personalised" },
      footer: { links: ["about", "contact"] },
      notification: { message: "personalised banner" },
      somethingElse: 42,
    };
    const result = await snapshotBrand(BRAND, { fetch: okFetch(layout) });

    expect(result.nav).toEqual(jdWilliamsNavFixture);
    expect(result.status).toBe("ok");
    // Nothing beyond nav/capturedAt/status is present on the result.
    expect(Object.keys(result).sort()).toEqual(["capturedAt", "nav", "status"]);
  });

  it("records an ISO 8601 capture timestamp from the injected clock", async () => {
    const now = () => "2024-01-15T09:30:00.000Z";
    const result = await snapshotBrand(BRAND, {
      fetch: okFetch({ nav: [] }),
      now,
    });
    expect(result.capturedAt).toBe("2024-01-15T09:30:00.000Z");
  });

  it("throws when the response is not OK", async () => {
    await expect(snapshotBrand(BRAND, { fetch: httpErrorFetch(503) })).rejects.toThrow("HTTP 503");
  });

  it("throws when nav is missing", async () => {
    await expect(
      snapshotBrand(BRAND, { fetch: okFetch({ header: {}, footer: {} }) }),
    ).rejects.toThrow("nav array missing");
  });

  it("throws when nav is not an array", async () => {
    await expect(
      snapshotBrand(BRAND, { fetch: okFetch({ nav: { not: "an array" } }) }),
    ).rejects.toThrow("nav array missing");
  });

  it("throws when the network fetch rejects", async () => {
    await expect(snapshotBrand(BRAND, { fetch: rejectingFetch("ECONNREFUSED") })).rejects.toThrow(
      /fetch failed/,
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests: writing snapshot + metadata
// ---------------------------------------------------------------------------

describe("snapshotBrandToStore (success path)", () => {
  it("writes nav.json containing exactly the nav array", async () => {
    const store = memoryStore();
    await snapshotBrandToStore(BRAND, {
      fetch: okFetch({ nav: jdWilliamsNavFixture, header: {} }),
      store,
      now: () => "2024-01-15T09:30:00.000Z",
    });

    const nav = JSON.parse(store.files.get(navJsonPath) as string);
    expect(nav).toEqual(jdWilliamsNavFixture);
  });

  it("writes metadata with timestamp, source and ok status", async () => {
    const store = memoryStore();
    await snapshotBrandToStore(BRAND, {
      fetch: okFetch({ nav: [] }),
      store,
      now: () => "2024-01-15T09:30:00.000Z",
    });

    const meta = JSON.parse(store.files.get(metaJsonPath) as string);
    expect(meta).toEqual({
      brandId: "jdwilliams",
      capturedAt: "2024-01-15T09:30:00.000Z",
      source: "https://www.jdwilliams.co.uk/api/layout",
      status: "ok",
    });
  });
});

// ---------------------------------------------------------------------------
// Unit tests: fail-safe handling
// ---------------------------------------------------------------------------

describe("snapshotBrandToStore (fail-safe path)", () => {
  it("retains the previous nav.json and records the failure on fetch error", async () => {
    const previousNav = JSON.stringify(
      [{ title: "Old", urlPath: "/old", type: "L", seoPath: "/old" }],
      null,
      2,
    );
    const store = memoryStore({
      [navJsonPath]: previousNav,
      [metaJsonPath]: JSON.stringify(
        {
          brandId: "jdwilliams",
          capturedAt: "2024-01-01T00:00:00.000Z",
          source: "https://www.jdwilliams.co.uk/api/layout",
          status: "ok",
        },
        null,
        2,
      ),
    });

    const outcome = await snapshotBrandToStore(BRAND, {
      fetch: rejectingFetch("network down"),
      store,
      now: () => "2024-02-01T00:00:00.000Z",
    });

    // nav.json is untouched — last good snapshot retained.
    expect(store.files.get(navJsonPath)).toBe(previousNav);
    // meta records the failure...
    const meta = JSON.parse(store.files.get(metaJsonPath) as string);
    expect(meta.status).toBe("failed");
    expect(meta.lastError).toMatch(/network down/);
    // ...and preserves the previous capture timestamp of the retained snapshot.
    expect(meta.capturedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(outcome.status).toBe("failed");
    expect(outcome.retainedPrevious).toBe(true);
  });

  it("records a failure with no prior snapshot without fabricating nav.json", async () => {
    const store = memoryStore();
    const outcome = await snapshotBrandToStore(BRAND, {
      fetch: httpErrorFetch(500),
      store,
      now: () => "2024-02-01T00:00:00.000Z",
    });

    // No nav.json is invented on first-ever failure.
    expect(store.files.has(navJsonPath)).toBe(false);
    const meta = JSON.parse(store.files.get(metaJsonPath) as string);
    expect(meta.status).toBe("failed");
    expect(meta.lastError).toMatch(/HTTP 500/);
    expect(outcome.retainedPrevious).toBe(false);
  });

  it("processes brands independently — one failure does not block others", async () => {
    const brandB: BrandConfig = { ...BRAND, id: "jacamo", origin: "https://www.jacamo.co.uk" };
    const store = memoryStore();

    // A fetch that fails for jdwilliams but succeeds for jacamo.
    const fetch: FetchLike = vi.fn(async (url: string) => {
      if (url.includes("jdwilliams")) {
        throw new Error("boom");
      }
      return { ok: true, status: 200, json: async () => ({ nav: [] }) };
    });

    const outcomes = await runSnapshot([BRAND, brandB], {
      fetch,
      store,
      now: () => "2024-02-01T00:00:00.000Z",
    });

    expect(outcomes.map((o) => o.status)).toEqual(["failed", "ok"]);
    expect(store.files.has("data/jacamo/nav.json")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Arbitraries for property-based tests
// ---------------------------------------------------------------------------

/** A small recursive NavNode arbitrary (bounded depth to keep runs fast). */
const navNodeArb: fc.Arbitrary<NavNode> = fc.letrec<{ node: NavNode }>((tie) => ({
  node: fc.record(
    {
      title: fc.string(),
      urlPath: fc.string(),
      type: fc.constantFrom("G" as const, "L" as const),
      seoPath: fc.string(),
      // Non-required: fast-check either omits the key or supplies a NavNode[],
      // matching `navigationNode?: NavNode[]` under exactOptionalPropertyTypes.
      navigationNode: fc.array(tie("node"), { maxLength: 3 }),
    },
    { requiredKeys: ["title", "urlPath", "type", "seoPath"] },
  ),
})).node;

const navArrayArb: fc.Arbitrary<NavNode[]> = fc.array(navNodeArb, { maxLength: 5 });

/** Arbitrary "noise" keys that must never end up in a committed snapshot. */
const noiseArb = fc.record({
  header: fc.anything(),
  footer: fc.anything(),
  notification: fc.anything(),
  personalised: fc.anything(),
});

// ---------------------------------------------------------------------------
// Property 1: Snapshot purity
// ---------------------------------------------------------------------------

/**
 * Property 1: A committed snapshot contains exactly the `nav` array and nothing
 * else from the layout response — no `header`, `footer`, `notification`, or
 * personalised content is ever persisted.
 *
 * **Validates: Requirements 2.1, 2.2**
 */
describe("Property 1: snapshot purity", () => {
  it("persists exactly the nav array and never any other layout key", async () => {
    await fc.assert(
      fc.asyncProperty(navArrayArb, noiseArb, async (nav, noise) => {
        const store = memoryStore();
        const layout = { ...noise, nav };

        await snapshotBrandToStore(BRAND, {
          fetch: okFetch(layout),
          store,
          now: () => "2024-01-15T09:30:00.000Z",
        });

        // The committed nav.json is deep-equal to the source nav array...
        const written = JSON.parse(store.files.get(navJsonPath) as string);
        expect(written).toEqual(nav);

        // ...and no committed file contains any of the discarded keys' marker names
        // as top-level keys of the persisted nav payload.
        expect(Array.isArray(written)).toBe(true);

        // The meta payload only ever carries navigation metadata, never content.
        const meta = JSON.parse(store.files.get(metaJsonPath) as string);
        expect(Object.keys(meta).sort()).toEqual(
          ["brandId", "capturedAt", "source", "status"].sort(),
        );
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Fail-safe snapshots
// ---------------------------------------------------------------------------

/**
 * Property 2: After any Snapshot_Job run, every brand that had a good snapshot
 * still has a valid `nav.json` — either freshly captured (`ok`) or the previous
 * good one retained (`failed`). A failure never leaves a brand with a missing or
 * partial snapshot.
 *
 * **Validates: Requirements 1.6**
 */
describe("Property 2: fail-safe snapshots", () => {
  // Model a run as either a success (returns a fresh nav array) or a failure.
  const runArb = fc.oneof(
    fc.record({ kind: fc.constant("ok" as const), nav: navArrayArb }),
    fc.record({
      kind: fc.constant("fail" as const),
      how: fc.constantFrom("network", "http", "nonav"),
    }),
  );

  it("always leaves a valid nav.json when a good snapshot existed before", async () => {
    await fc.assert(
      fc.asyncProperty(navArrayArb, runArb, async (previousNav, run) => {
        // Seed a known-good previous snapshot.
        const store = memoryStore({
          [navJsonPath]: `${JSON.stringify(previousNav, null, 2)}\n`,
          [metaJsonPath]: `${JSON.stringify(
            {
              brandId: BRAND.id,
              capturedAt: "2024-01-01T00:00:00.000Z",
              source: "https://www.jdwilliams.co.uk/api/layout",
              status: "ok",
            },
            null,
            2,
          )}\n`,
        });

        let fetch: FetchLike;
        if (run.kind === "ok") {
          fetch = okFetch({ nav: run.nav, header: {} });
        } else if (run.how === "network") {
          fetch = rejectingFetch("offline");
        } else if (run.how === "http") {
          fetch = httpErrorFetch(502);
        } else {
          fetch = okFetch({ header: {} }); // nav missing
        }

        await snapshotBrandToStore(BRAND, {
          fetch,
          store,
          now: () => "2024-02-01T00:00:00.000Z",
        });

        // A nav.json must still exist and be a valid nav array after any run.
        const raw = store.files.get(navJsonPath);
        expect(raw).toBeDefined();
        const nav = JSON.parse(raw as string);
        expect(Array.isArray(nav)).toBe(true);

        if (run.kind === "ok") {
          // Fresh capture on success.
          expect(nav).toEqual(run.nav);
        } else {
          // Previous good snapshot retained on failure.
          expect(nav).toEqual(previousNav);
          const meta = JSON.parse(store.files.get(metaJsonPath) as string);
          expect(meta.status).toBe("failed");
          expect(typeof meta.lastError).toBe("string");
        }
      }),
    );
  });
});
