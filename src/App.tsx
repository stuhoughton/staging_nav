/**
 * App shell (task 10).
 *
 * Wires the building blocks into the running site:
 *
 *   - Brand selector listing the enabled brands; selecting one loads and renders
 *     that brand's live snapshot (Req 5.1–5.3).
 *   - CSV import control; a successful import renders the proposed tree with a
 *     "proposed" banner (Req 4.5, 4.6), while a failed import keeps the live nav on
 *     screen and shows descriptive validation messages (Req 4.4). This is the
 *     all-or-nothing contract — there is never a partially applied proposal
 *     (Correctness Property 5).
 *   - A persistent, visually distinct mode banner reflecting live vs proposed
 *     (Req 3.4, 4.6; Property 8).
 *   - If the selected brand's snapshot cannot be rendered, the brand stays
 *     selectable and a descriptive message is shown in place of the render
 *     (Req 5.4).
 *
 * Security: every converted/snapshot value reaches the DOM as JSX text or an
 * attribute, so React escapes it. Nothing here uses `dangerouslySetInnerHTML`, so
 * an untrusted CSV value can never be injected as raw HTML (security-baseline).
 *
 * Dependencies (`brands`, `loadSnapshotFn`) are injectable with production defaults
 * so component tests can supply a known snapshot without touching committed data.
 */
import { useMemo, useState } from "react";

import { getEnabledBrands, type BrandConfig } from "../config/brands";
import { loadSnapshot } from "./data/loadSnapshot";
import type { NavNode, SnapshotBundle, ValidationError } from "./data/types";
import { convert } from "./import/convert";
import { parseCsv, validateRows } from "./import/csv";
import { ModeBanner } from "./app/ModeBanner";
import { BrandSelector } from "./app/BrandSelector";
import { CsvImport } from "./app/CsvImport";
import { NavRenderer } from "./nav/NavRenderer";
import { getTheme } from "./nav/themes";

/** State describing a successfully imported proposal currently being previewed. */
interface ProposedState {
  nav: NavNode[];
  filename: string;
}

export interface AppProps {
  /** Enabled brands to offer; defaults to the configured enabled brands. */
  brands?: readonly BrandConfig[];
  /** Snapshot loader; injectable for tests. Defaults to the build-time loader. */
  loadSnapshotFn?: (brandId: string) => SnapshotBundle;
}

export const App = ({
  brands = getEnabledBrands(),
  loadSnapshotFn = loadSnapshot,
}: AppProps = {}): JSX.Element => {
  const [selectedId, setSelectedId] = useState<string>(brands[0]?.id ?? "");
  const [proposed, setProposed] = useState<ProposedState | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const brand = useMemo(
    () => brands.find((candidate) => candidate.id === selectedId),
    [brands, selectedId],
  );

  // Load the selected brand's live snapshot. Recomputed when the brand changes.
  const bundle = useMemo<SnapshotBundle | null>(
    () => (brand ? loadSnapshotFn(brand.id) : null),
    [brand, loadSnapshotFn],
  );

  const theme = getTheme(brand?.themeId);
  const mode: "live" | "proposed" = proposed ? "proposed" : "live";

  /** Switching brand resets any active proposal and errors, back to the live view. */
  const handleSelectBrand = (brandId: string): void => {
    setSelectedId(brandId);
    setProposed(null);
    setErrors([]);
  };

  /** Runs the parse → validate → convert pipeline for an imported CSV file. */
  const handleImport = async (file: File): Promise<void> => {
    if (!brand || !bundle || bundle.status !== "ok") {
      return;
    }

    const parsed = await parseCsv(file);
    if (!parsed.ok) {
      setProposed(null);
      setErrors(parsed.errors);
      return;
    }

    const rowErrors = validateRows(parsed.rows);
    if (rowErrors.length > 0) {
      setProposed(null);
      setErrors(rowErrors);
      return;
    }

    const outcome = convert(bundle.nav, parsed.rows, brand.pathField);
    if (!outcome.ok) {
      // All-or-nothing: reject the whole import, keep the live nav on screen.
      setProposed(null);
      setErrors(outcome.errors);
      return;
    }

    setProposed({ nav: outcome.nav, filename: file.name });
    setErrors([]);
  };

  const canRender = bundle !== null && bundle.status === "ok";
  const nodesToRender = proposed ? proposed.nav : (bundle?.nav ?? []);

  return (
    <main className="app">
      <header className="app__header">
        <h1>Navigation Staging Site</h1>
        <p>Preview N Brown storefront navigation before it ships.</p>
      </header>

      <section className="app__controls">
        <BrandSelector brands={brands} selectedId={selectedId} onSelect={handleSelectBrand} />
        <CsvImport onImport={(file) => void handleImport(file)} />
      </section>

      <ModeBanner mode={mode} capturedAt={bundle?.capturedAt} filename={proposed?.filename} />

      {errors.length > 0 ? (
        <section className="app__errors" role="alert">
          <p className="app__errors-heading">Import rejected — the live navigation is unchanged:</p>
          <ul>
            {errors.map((error, index) => (
              <li key={`${error.code}-${error.row ?? index}`}>{error.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {canRender ? (
        <NavRenderer nodes={nodesToRender} mode={mode} theme={theme} linkOrigin={brand?.origin} />
      ) : (
        <section className="app__snapshot-error" role="status">
          <p>
            {brand
              ? `The navigation for ${brand.name} can't be rendered right now. The brand stays selectable — try again once a snapshot is available.`
              : "Select a brand to preview its navigation."}
          </p>
        </section>
      )}
    </main>
  );
};
