/**
 * Snapshot extraction logic for the Navigation Staging Site (Snapshot_Job core).
 *
 * This is the unit-testable core invoked by the scheduled GitHub Action. For a
 * configured brand it:
 *
 *   1. Fetches `origin + layoutPath` (Req 1.1).
 *   2. Parses JSON and extracts **only** the top-level `nav` array — `header`,
 *      `footer`, `notification`, and every other key are discarded (Req 1.2, 2.1,
 *      2.2; Correctness Property 1: snapshot purity).
 *   3. Writes `data/<brand>/nav.json` (the array only) and `data/<brand>/nav.meta.json`
 *      (capture timestamp, source, status) (Req 1.3, 1.7).
 *
 * Fail-safe behaviour (Req 1.6; Correctness Property 2): each brand is processed
 * independently. On any fetch/parse/extract error the meta is written with
 * `status: "failed"` and a `lastError`, and any existing `nav.json` is left
 * untouched so the last good snapshot is retained. A failure never leaves a brand
 * with a missing or partial snapshot.
 *
 * Security: the fetch target is static config, never user input (no SSRF surface),
 * and only the public `nav` array is ever persisted — no personalised content is
 * stored (pii-and-data baseline).
 */
import { promises as nodeFs } from "node:fs";
import * as nodePath from "node:path";

import type { BrandConfig } from "../config/brands";
import type { NavNode, SnapshotMeta } from "../src/data/types";

/** Shape of the layout API response. Only `nav` is consumed; the rest is discarded. */
interface LayoutResponse {
  nav: unknown;
  [key: string]: unknown;
}

/** A minimal fetch signature so tests can inject a mock and never hit production. */
export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/**
 * Filesystem abstraction so the writer is testable without touching disk.
 * The default implementation (`nodeFileStore`) is backed by `node:fs`.
 */
export interface FileStore {
  /** Returns the file contents, or `null` if the file does not exist. */
  readFile(path: string): Promise<string | null>;
  /** Writes the file, creating parent directories as needed. */
  writeFile(path: string, contents: string): Promise<void>;
}

/** Injectable dependencies for the snapshot core. */
export interface SnapshotDeps {
  fetch: FetchLike;
  store: FileStore;
  /** Root data directory. Defaults to "data". */
  dataDir?: string;
  /** Supplies the capture timestamp (ISO 8601). Defaults to `new Date().toISOString()`. */
  now?: () => string;
}

/** Raised when a brand cannot be fetched, parsed, or extracted. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

/** The successful extraction result for a single brand. */
export interface SnapshotResult {
  nav: NavNode[];
  capturedAt: string;
  status: "ok";
}

/** The outcome of processing one brand (whether the snapshot was refreshed or retained). */
export interface BrandOutcome {
  brandId: string;
  status: "ok" | "failed";
  /** Present when `status` is "failed". */
  lastError?: string;
  /** True when a previous `nav.json` was retained because this run failed. */
  retainedPrevious?: boolean;
}

const DEFAULT_DATA_DIR = "data";

/** The source URL for a brand's layout response. */
function brandSource(brand: BrandConfig): string {
  return brand.origin + brand.layoutPath;
}

function navPath(dataDir: string, brandId: string): string {
  return nodePath.posix.join(dataDir, brandId, "nav.json");
}

function metaPath(dataDir: string, brandId: string): string {
  return nodePath.posix.join(dataDir, brandId, "nav.meta.json");
}

/**
 * Fetches a brand's layout response and extracts **only** the `nav` array.
 *
 * Throws {@link SnapshotError} on a non-OK response, unparseable JSON, or a
 * missing/non-array `nav`. Nothing but the `nav` array is read from the body, so
 * no non-navigation or personalised content can leak into the result
 * (Correctness Property 1).
 */
export async function snapshotBrand(
  brand: BrandConfig,
  deps: Pick<SnapshotDeps, "fetch"> & { now?: () => string },
): Promise<SnapshotResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const url = brandSource(brand);

  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await deps.fetch(url);
  } catch (cause) {
    throw new SnapshotError(`fetch failed: ${errorMessage(cause)}`);
  }

  if (!res.ok) {
    throw new SnapshotError(`HTTP ${res.status}`);
  }

  let body: LayoutResponse;
  try {
    body = (await res.json()) as LayoutResponse;
  } catch (cause) {
    throw new SnapshotError(`invalid JSON: ${errorMessage(cause)}`);
  }

  if (!body || typeof body !== "object" || !Array.isArray(body.nav)) {
    throw new SnapshotError("nav array missing");
  }

  // Extract ONLY the nav array — every other top-level key (header, footer,
  // notification, ...) is intentionally never read.
  return {
    nav: body.nav as NavNode[],
    capturedAt: now(),
    status: "ok",
  };
}

/**
 * Writes a successful snapshot for a brand: `nav.json` (the array only) and
 * `nav.meta.json` (`status: "ok"`, capture timestamp, source).
 */
export async function writeSnapshot(
  brand: BrandConfig,
  result: SnapshotResult,
  deps: Pick<SnapshotDeps, "store"> & { dataDir?: string },
): Promise<void> {
  const dataDir = deps.dataDir ?? DEFAULT_DATA_DIR;
  const meta: SnapshotMeta = {
    brandId: brand.id,
    capturedAt: result.capturedAt,
    source: brandSource(brand),
    status: "ok",
  };
  await deps.store.writeFile(navPath(dataDir, brand.id), toJson(result.nav));
  await deps.store.writeFile(metaPath(dataDir, brand.id), toJson(meta));
}

/**
 * Writes the fail-safe meta for a brand without touching its `nav.json`.
 *
 * The existing `nav.json` (if any) is left exactly as it was so the last good
 * snapshot is retained (Req 1.6, Correctness Property 2). The retained snapshot's
 * capture timestamp is preserved from the previous meta when present.
 */
export async function writeFailure(
  brand: BrandConfig,
  lastError: string,
  deps: Pick<SnapshotDeps, "store"> & { dataDir?: string; now?: () => string },
): Promise<void> {
  const dataDir = deps.dataDir ?? DEFAULT_DATA_DIR;
  const now = deps.now ?? (() => new Date().toISOString());

  // Preserve the previous capture timestamp when we have a good prior meta, so the
  // timestamp keeps describing the retained nav.json rather than the failed run.
  let capturedAt = now();
  const priorMeta = await readMeta(brand, { store: deps.store, dataDir });
  if (priorMeta?.capturedAt) {
    capturedAt = priorMeta.capturedAt;
  }

  const meta: SnapshotMeta = {
    brandId: brand.id,
    capturedAt,
    source: brandSource(brand),
    status: "failed",
    lastError,
  };
  // Deliberately DO NOT write nav.json — the previous snapshot stays put.
  await deps.store.writeFile(metaPath(dataDir, brand.id), toJson(meta));
}

/**
 * Processes a single brand end to end against the given store: fetch → extract →
 * write, with fail-safe handling. Never throws for an expected snapshot failure;
 * returns a {@link BrandOutcome} describing what happened so one brand failing
 * never blocks the others.
 */
export async function snapshotBrandToStore(
  brand: BrandConfig,
  deps: SnapshotDeps,
): Promise<BrandOutcome> {
  const dataDir = deps.dataDir ?? DEFAULT_DATA_DIR;
  try {
    const result = await snapshotBrand(brand, deps);
    await writeSnapshot(brand, result, deps);
    return { brandId: brand.id, status: "ok" };
  } catch (cause) {
    const lastError = errorMessage(cause);
    const hadPrevious = (await deps.store.readFile(navPath(dataDir, brand.id))) !== null;
    await writeFailure(brand, lastError, deps);
    return {
      brandId: brand.id,
      status: "failed",
      lastError,
      retainedPrevious: hadPrevious,
    };
  }
}

/**
 * Runs the snapshot for every given brand independently. A failure for one brand
 * is captured in its outcome and does not stop the others (Req 1.6, 1.4).
 */
export async function runSnapshot(
  brands: readonly BrandConfig[],
  deps: SnapshotDeps,
): Promise<BrandOutcome[]> {
  const outcomes: BrandOutcome[] = [];
  for (const brand of brands) {
    outcomes.push(await snapshotBrandToStore(brand, deps));
  }
  return outcomes;
}

/** Reads and parses a brand's committed meta, or `null` if absent/unparseable. */
async function readMeta(
  brand: BrandConfig,
  deps: Pick<SnapshotDeps, "store"> & { dataDir?: string },
): Promise<SnapshotMeta | null> {
  const dataDir = deps.dataDir ?? DEFAULT_DATA_DIR;
  const raw = await deps.store.readFile(metaPath(dataDir, brand.id));
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as SnapshotMeta;
  } catch {
    return null;
  }
}

function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}

/**
 * Default {@link FileStore} backed by `node:fs`, used by the GitHub Action.
 * Not exercised by unit tests (which inject an in-memory store) so production
 * runs never depend on test wiring.
 */
export const nodeFileStore: FileStore = {
  async readFile(path: string): Promise<string | null> {
    try {
      return await nodeFs.readFile(path, "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw cause;
    }
  },
  async writeFile(path: string, contents: string): Promise<void> {
    await nodeFs.mkdir(nodePath.dirname(path), { recursive: true });
    await nodeFs.writeFile(path, contents, "utf8");
  },
};
