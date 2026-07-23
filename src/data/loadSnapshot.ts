/// <reference types="vite/client" />
/**
 * Snapshot loader for the Navigation Staging Site.
 *
 * The scheduled Snapshot_Job commits each brand's navigation to the repository as
 * `data/<brand>/nav.json` (the `nav` array only) plus `data/<brand>/nav.meta.json`
 * (capture timestamp, source, status). This loader reads those committed files for
 * a selected brand and exposes a {@link SnapshotBundle} to the UI (Req 5.2), so the
 * capture timestamp can be displayed alongside the rendered navigation (Req 3.4).
 *
 * Error handling (Req 5.4): a missing or malformed snapshot never throws into the
 * render tree. Instead the loader returns a bundle with `status: "failed"` and an
 * empty `nav`, so the app can keep the brand selectable and show a descriptive
 * message in place of a broken render.
 *
 * The committed files are bundled at build time via Vite's glob import (no runtime
 * `fetch`, so there is no cross-origin surface). The parsing/validation logic is
 * factored into the pure {@link buildSnapshotBundle}, which is exercised directly
 * by the unit tests without depending on any files existing on disk.
 */
import type { NavNode, SnapshotBundle, SnapshotMeta } from "./types";

/**
 * The raw committed file contents for a single brand. `null` means the file is
 * absent (the Snapshot_Job has never produced it).
 */
export interface RawSnapshotFiles {
  /** Raw contents of `data/<brand>/nav.json`, or `null` if absent. */
  navJson: string | null;
  /** Raw contents of `data/<brand>/nav.meta.json`, or `null` if absent. */
  metaJson: string | null;
}

/** Resolves the committed raw files for a brand. Injectable so tests avoid disk. */
export type SnapshotResolver = (brandId: string) => RawSnapshotFiles;

/** Builds the standard "cannot render" bundle (Req 5.4). */
function failedBundle(brandId: string, capturedAt = ""): SnapshotBundle {
  return { brandId, nav: [], capturedAt, status: "failed" };
}

/**
 * Reads the capture timestamp from a brand's meta file on a best-effort basis.
 *
 * The timestamp is display-only (Req 3.4); a missing or malformed meta must not
 * make an otherwise-renderable snapshot unusable, so this returns "" rather than
 * throwing when the meta is absent or cannot be parsed.
 */
function readCapturedAt(metaJson: string | null): string {
  if (metaJson === null) {
    return "";
  }
  try {
    const meta = JSON.parse(metaJson) as Partial<SnapshotMeta>;
    return typeof meta.capturedAt === "string" ? meta.capturedAt : "";
  } catch {
    return "";
  }
}

/**
 * Pure core: turns raw committed file contents into a {@link SnapshotBundle}.
 *
 * A snapshot is renderable (`status: "ok"`) only when `nav.json` is present and
 * parses to a JSON array. A missing file, invalid JSON, or a non-array payload is
 * treated as malformed and yields a failed bundle with an empty `nav` (Req 5.4).
 * Per-node validation is intentionally left to the renderer, which skips or
 * annotates individual malformed nodes rather than blanking the whole tree.
 */
export function buildSnapshotBundle(brandId: string, raw: RawSnapshotFiles): SnapshotBundle {
  if (raw.navJson === null) {
    return failedBundle(brandId);
  }

  let parsedNav: unknown;
  try {
    parsedNav = JSON.parse(raw.navJson);
  } catch {
    return failedBundle(brandId);
  }

  if (!Array.isArray(parsedNav)) {
    return failedBundle(brandId);
  }

  return {
    brandId,
    nav: parsedNav as NavNode[],
    capturedAt: readCapturedAt(raw.metaJson),
    status: "ok",
  };
}

/**
 * Indexes Vite glob results (`{ "../../data/<brand>/<file>": contents }`) by brand
 * id, extracted from the directory segment preceding the file name.
 */
function indexByBrand(modules: Record<string, string>): Record<string, string> {
  const byBrand: Record<string, string> = {};
  for (const [path, contents] of Object.entries(modules)) {
    const match = /\/data\/([^/]+)\/[^/]+$/.exec(path);
    if (match?.[1]) {
      byBrand[match[1]] = contents;
    }
  }
  return byBrand;
}

// Eagerly bundle every committed snapshot as raw text at build time. When no
// snapshots have been committed yet these maps are simply empty, and every brand
// resolves to a failed bundle until the Snapshot_Job runs.
const navModules = import.meta.glob("../../data/*/nav.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const metaModules = import.meta.glob("../../data/*/nav.meta.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const navByBrand = indexByBrand(navModules);
const metaByBrand = indexByBrand(metaModules);

/** Default resolver backed by the build-time bundled snapshot files. */
const defaultResolver: SnapshotResolver = (brandId) => ({
  navJson: navByBrand[brandId] ?? null,
  metaJson: metaByBrand[brandId] ?? null,
});

/**
 * Loads the committed snapshot for a brand and returns a {@link SnapshotBundle}.
 *
 * Never throws for a missing or malformed snapshot — those surface as a failed
 * bundle the UI can render a message for (Req 5.4). The `resolve` dependency is
 * injectable so tests supply raw contents directly without touching the filesystem.
 */
export function loadSnapshot(
  brandId: string,
  resolve: SnapshotResolver = defaultResolver,
): SnapshotBundle {
  return buildSnapshotBundle(brandId, resolve(brandId));
}
