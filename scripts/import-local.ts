/**
 * One-off local snapshot importer (manual capture path).
 *
 * The production layout API sits behind bot protection that refuses scripted
 * clients (curl/fetch get HTTP 403), so the scheduled Snapshot_Job cannot fetch
 * it from CI. Until the endpoint is allowlisted for the job, this helper lets a
 * colleague capture the layout response from a real browser (which passes the
 * WAF) and turn it into a committed snapshot locally.
 *
 * Usage:
 *   npx vite-node scripts/import-local.ts <brandId> <path-to-layout.json>
 *   e.g. npx vite-node scripts/import-local.ts jdwilliams layout.json
 *
 * It reuses the tested snapshot core (`writeSnapshot`), so it extracts ONLY the
 * top-level `nav` array — header/footer/notification and any personalised content
 * are discarded (Correctness Property 1) — and writes `data/<brand>/nav.json` +
 * `nav.meta.json` in exactly the shape the app loader expects.
 */
import { promises as nodeFs } from "node:fs";

import { BRANDS } from "../config/brands";
import { nodeFileStore, writeSnapshot } from "./snapshot";
import type { NavNode } from "../src/data/types";

async function main(): Promise<void> {
  const brandId = process.argv[2];
  const inputPath = process.argv[3];

  if (!brandId || !inputPath) {
    throw new Error("usage: vite-node scripts/import-local.ts <brandId> <path-to-layout.json>");
  }

  const brand = BRANDS.find((b) => b.id === brandId);
  if (!brand) {
    throw new Error(`unknown brand: ${brandId}`);
  }

  const raw = await nodeFs.readFile(inputPath, "utf8");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`input file is not valid JSON: ${(cause as Error).message}`);
  }

  if (!body || typeof body !== "object" || !Array.isArray((body as { nav?: unknown }).nav)) {
    throw new Error("input JSON has no top-level `nav` array — save the full /api/layout response");
  }

  const nav = (body as { nav: NavNode[] }).nav;

  await writeSnapshot(
    brand,
    { nav, capturedAt: new Date().toISOString(), status: "ok" },
    { store: nodeFileStore },
  );

  process.stdout.write(
    `Captured ${nav.length} top-level nav node(s) for ${brand.id} -> data/${brand.id}/nav.json\n`,
  );
}

main().catch((cause: unknown) => {
  process.stderr.write(
    `import-local failed: ${cause instanceof Error ? cause.message : String(cause)}\n`,
  );
  process.exitCode = 1;
});
