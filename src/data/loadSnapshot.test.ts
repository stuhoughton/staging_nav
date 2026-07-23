/**
 * Tests for the snapshot loader.
 *
 * These exercise the pure {@link buildSnapshotBundle} core plus {@link loadSnapshot}
 * with an injected resolver, so they never depend on committed files existing on
 * disk. Coverage per task 6:
 *  - ok: a present, valid nav.json (with metadata) produces a renderable bundle
 *    carrying the capture timestamp (Req 3.4, 5.2).
 *  - missing: an absent nav.json yields a failed bundle, not a thrown error (Req 5.4).
 *  - malformed: invalid JSON or a non-array payload yields a failed bundle (Req 5.4).
 */
import { describe, expect, it } from "vitest";

import type { NavNode } from "./types";
import { jdWilliamsNavFixture } from "../__fixtures__/jdwilliams-nav";
import {
  buildSnapshotBundle,
  loadSnapshot,
  type RawSnapshotFiles,
  type SnapshotResolver,
} from "./loadSnapshot";

const CAPTURED_AT = "2024-01-15T09:30:00.000Z";

function okMeta(capturedAt = CAPTURED_AT, status: "ok" | "failed" = "ok"): string {
  return JSON.stringify({
    brandId: "jdwilliams",
    capturedAt,
    source: "https://www.jdwilliams.co.uk/api/layout",
    status,
  });
}

// ---------------------------------------------------------------------------
// ok snapshots
// ---------------------------------------------------------------------------

describe("buildSnapshotBundle — ok", () => {
  it("returns a renderable bundle with the nav array and capture timestamp", () => {
    const raw: RawSnapshotFiles = {
      navJson: JSON.stringify(jdWilliamsNavFixture),
      metaJson: okMeta(),
    };

    const bundle = buildSnapshotBundle("jdwilliams", raw);

    expect(bundle.status).toBe("ok");
    expect(bundle.brandId).toBe("jdwilliams");
    expect(bundle.nav).toEqual(jdWilliamsNavFixture);
    expect(bundle.capturedAt).toBe(CAPTURED_AT);
  });

  it("accepts an empty nav array as a valid (renderable) snapshot", () => {
    const bundle = buildSnapshotBundle("jdwilliams", {
      navJson: "[]",
      metaJson: okMeta(),
    });

    expect(bundle.status).toBe("ok");
    expect(bundle.nav).toEqual([]);
    expect(bundle.capturedAt).toBe(CAPTURED_AT);
  });

  it("still renders the retained nav when the meta status is failed", () => {
    // The Snapshot_Job retains the previous good nav.json on a failed refresh
    // (meta.status = "failed"). That retained nav is still renderable.
    const bundle = buildSnapshotBundle("jdwilliams", {
      navJson: JSON.stringify(jdWilliamsNavFixture),
      metaJson: okMeta("2024-01-01T00:00:00.000Z", "failed"),
    });

    expect(bundle.status).toBe("ok");
    expect(bundle.nav).toEqual(jdWilliamsNavFixture);
    expect(bundle.capturedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("renders a valid nav even when the meta file is absent", () => {
    const bundle = buildSnapshotBundle("jdwilliams", {
      navJson: JSON.stringify(jdWilliamsNavFixture),
      metaJson: null,
    });

    expect(bundle.status).toBe("ok");
    expect(bundle.nav).toEqual(jdWilliamsNavFixture);
    expect(bundle.capturedAt).toBe("");
  });

  it("renders a valid nav even when the meta file is malformed", () => {
    const bundle = buildSnapshotBundle("jdwilliams", {
      navJson: JSON.stringify(jdWilliamsNavFixture),
      metaJson: "{ not valid json",
    });

    expect(bundle.status).toBe("ok");
    expect(bundle.capturedAt).toBe("");
  });

  it("falls back to an empty timestamp when meta lacks capturedAt", () => {
    const bundle = buildSnapshotBundle("jdwilliams", {
      navJson: "[]",
      metaJson: JSON.stringify({ brandId: "jdwilliams", status: "ok" }),
    });

    expect(bundle.status).toBe("ok");
    expect(bundle.capturedAt).toBe("");
  });
});

// ---------------------------------------------------------------------------
// missing snapshots
// ---------------------------------------------------------------------------

describe("buildSnapshotBundle — missing", () => {
  it("returns a failed bundle with empty nav when nav.json is absent", () => {
    const bundle = buildSnapshotBundle("jdwilliams", { navJson: null, metaJson: null });

    expect(bundle.status).toBe("failed");
    expect(bundle.nav).toEqual([]);
    expect(bundle.brandId).toBe("jdwilliams");
    expect(bundle.capturedAt).toBe("");
  });

  it("does not throw when the snapshot is missing", () => {
    expect(() =>
      buildSnapshotBundle("jdwilliams", { navJson: null, metaJson: null }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// malformed snapshots
// ---------------------------------------------------------------------------

describe("buildSnapshotBundle — malformed", () => {
  it("returns a failed bundle when nav.json is not valid JSON", () => {
    const bundle = buildSnapshotBundle("jdwilliams", {
      navJson: "{ this is : not json ]",
      metaJson: okMeta(),
    });

    expect(bundle.status).toBe("failed");
    expect(bundle.nav).toEqual([]);
  });

  it("returns a failed bundle when nav.json parses to a non-array", () => {
    const bundle = buildSnapshotBundle("jdwilliams", {
      navJson: JSON.stringify({ nav: [] }),
      metaJson: okMeta(),
    });

    expect(bundle.status).toBe("failed");
    expect(bundle.nav).toEqual([]);
  });

  it("does not throw on malformed content", () => {
    expect(() =>
      buildSnapshotBundle("jdwilliams", { navJson: "definitely not json", metaJson: null }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// loadSnapshot with an injected resolver
// ---------------------------------------------------------------------------

describe("loadSnapshot", () => {
  it("delegates to the injected resolver and returns an ok bundle", () => {
    const nav: NavNode[] = [
      { title: "Sale", urlPath: "/shop/c/sale", type: "L", seoPath: "/sale" },
    ];
    const resolver: SnapshotResolver = () => ({
      navJson: JSON.stringify(nav),
      metaJson: okMeta(),
    });

    const bundle = loadSnapshot("jdwilliams", resolver);

    expect(bundle.status).toBe("ok");
    expect(bundle.nav).toEqual(nav);
    expect(bundle.capturedAt).toBe(CAPTURED_AT);
  });

  it("returns a failed bundle when the resolver reports no committed snapshot", () => {
    const resolver: SnapshotResolver = () => ({ navJson: null, metaJson: null });

    const bundle = loadSnapshot("simplybe", resolver);

    expect(bundle.status).toBe("failed");
    expect(bundle.brandId).toBe("simplybe");
    expect(bundle.nav).toEqual([]);
  });

  it("passes the requested brandId through to the resolver", () => {
    const seen: string[] = [];
    const resolver: SnapshotResolver = (brandId) => {
      seen.push(brandId);
      return { navJson: null, metaJson: null };
    };

    loadSnapshot("jacamo", resolver);

    expect(seen).toEqual(["jacamo"]);
  });
});
