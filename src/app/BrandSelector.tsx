/**
 * Brand selector (task 10; Requirements 5.1, 5.2, 5.3).
 *
 * Lists the configured, enabled brands as selectable options and reports the
 * chosen brand id back to the app shell. The list of options is driven entirely
 * by the brands passed in — which come from `getEnabledBrands()` — so the set of
 * selectable brands always equals the set of enabled config entries and no brand
 * is hard-coded here (Correctness Property 9).
 *
 * Brand names are rendered as JSX text, so React escapes them by default; no
 * config value is ever injected as raw HTML.
 */
import type { BrandConfig } from "../../config/brands";

export interface BrandSelectorProps {
  /** The enabled brands to offer. */
  brands: readonly BrandConfig[];
  /** The currently selected brand id. */
  selectedId: string;
  /** Called with the newly selected brand id. */
  onSelect: (brandId: string) => void;
}

/** A labelled dropdown of enabled brands. */
export function BrandSelector({ brands, selectedId, onSelect }: BrandSelectorProps): JSX.Element {
  return (
    <div className="brand-selector">
      <label className="brand-selector__label" htmlFor="brand-select">
        Brand
      </label>
      <select
        id="brand-select"
        className="brand-selector__select"
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
      >
        {brands.map((brand) => (
          <option key={brand.id} value={brand.id}>
            {brand.name}
          </option>
        ))}
      </select>
    </div>
  );
}
