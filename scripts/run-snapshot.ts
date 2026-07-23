/**
 * Snapshot_Job runner entrypoint (invoked by `.github/workflows/snapshot.yml`).
 *
 * This is the thin CLI wrapper around the unit-tested snapshot core. It:
 *
 *   1. Resolves the enabled brands from configuration (Req 1.4, 1.8) — no brand
 *      is hard-coded here.
 *   2. Runs the snapshot for every enabled brand independently via `runSnapshot`,
 *      backed by the real `node:fs` store (Req 1.1–1.3, 1.7).
 *   3. Writes a per-brand outcome table to the GitHub Actions step summary so the
 *      run's result is visible at a glance (Req 1.6 — failures are recorded).
 *   4. Exits non-zero ONLY when it is appropriate to alert: a single brand failing
 *      is tolerated (its previous snapshot is retained by the fail-safe core), so
 *      the job stays green. It exits non-zero only if EVERY enabled brand failed,
 *      which points at a systemic problem worth a maintainer's attention.
 *
 * The fetch target is static configuration, never user input, so there is no SSRF
 * surface, and only the public `nav` array is ever persisted (pii-and-data
 * baseline). The runner reads no secrets and prints no request/response bodies.
 */
import { promises as nodeFs } from "node:fs";

import { getEnabledBrands } from "../config/brands";
import { type BrandOutcome, type FetchLike, nodeFileStore, runSnapshot } from "./snapshot";

/**
 * Adapts the platform `fetch` to the narrow {@link FetchLike} the core expects.
 * A per-request timeout guards against a hung endpoint stalling the whole job.
 */
const FETCH_TIMEOUT_MS = 15_000;

const fetchWithTimeout: FetchLike = async (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(input, {
      signal: init?.signal ?? controller.signal,
      headers: { accept: "application/json", "user-agent": "nav-staging-snapshot" },
    });
    return { ok: res.ok, status: res.status, json: () => res.json() };
  } finally {
    clearTimeout(timer);
  }
};

/** Renders the per-brand outcomes as a GitHub-flavoured Markdown table. */
function renderSummary(outcomes: readonly BrandOutcome[]): string {
  const lines: string[] = [
    "## Navigation snapshot",
    "",
    "| Brand | Result | Detail |",
    "| --- | --- | --- |",
  ];
  for (const outcome of outcomes) {
    if (outcome.status === "ok") {
      lines.push(`| \`${outcome.brandId}\` | ✅ captured | fresh snapshot committed |`);
    } else {
      const detail = outcome.retainedPrevious
        ? `retained previous snapshot — ${outcome.lastError ?? "unknown error"}`
        : `no previous snapshot to retain — ${outcome.lastError ?? "unknown error"}`;
      lines.push(`| \`${outcome.brandId}\` | ⚠️ failed | ${escapeCell(detail)} |`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

/** Escapes the characters that would break a Markdown table cell. */
function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Appends the summary to the step-summary file when running in GitHub Actions. */
async function writeStepSummary(summary: string): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    // Running locally: fall back to stdout so the outcome is still visible.
    process.stdout.write(summary);
    return;
  }
  await nodeFs.appendFile(summaryPath, summary, "utf8");
}

async function main(): Promise<void> {
  const brands = getEnabledBrands();
  if (brands.length === 0) {
    process.stdout.write("No enabled brands configured — nothing to snapshot.\n");
    return;
  }

  const outcomes = await runSnapshot(brands, {
    fetch: fetchWithTimeout,
    store: nodeFileStore,
  });

  await writeStepSummary(renderSummary(outcomes));

  const failed = outcomes.filter((o) => o.status === "failed");
  for (const outcome of failed) {
    process.stderr.write(
      `snapshot failed for ${outcome.brandId}: ${outcome.lastError ?? "unknown error"}\n`,
    );
  }

  // Fail-safe: a partial failure keeps the job green (previous snapshots retained).
  // Only a total failure of every enabled brand is treated as a job failure.
  if (failed.length === outcomes.length) {
    process.exitCode = 1;
  }
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`snapshot run crashed: ${message}\n`);
  process.exitCode = 1;
});
