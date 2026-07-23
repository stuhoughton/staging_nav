/**
 * CSV import: parse + validate (Requirements 4.2, 4.3, 4.4).
 *
 * This is the first half of the client-side `parse → validate → convert → render`
 * pipeline. The uploaded CSV is untrusted input, so it is handled defensively:
 * size- and row-count-guarded, parsed by a maintained CSV parser (papaparse,
 * pinned), and only ever surfaced as data — never executed or injected as HTML
 * (security-baseline; conversion + rendering are tasks 9 and 10).
 *
 * Two responsibilities live here, mirroring the design's `src/import/` interface:
 *
 *   - {@link parseCsv} turns a `File` (or raw text) into `ProposedRow[]`, applying
 *     the size/row-count guards, normalising header names, and requiring the
 *     `old`/`new` columns. Parse-stage problems (too large, unparseable, missing
 *     columns) are returned as `ValidationError[]` rather than thrown, because
 *     Req 4.4 requires them to be shown to the colleague as descriptive messages.
 *   - {@link validateRows} checks the parsed rows for per-row problems (empty rows)
 *     and returns descriptive `ValidationError`s.
 *
 * Path normalisation and add/remove/move semantics are deliberately NOT done here
 * — that is the converter's job (task 9). This module only gets clean, column-
 * shaped rows out of an untrusted file.
 */
import Papa from "papaparse";

import type { ProposedRow, ValidationError } from "../data/types";

/**
 * Maximum accepted CSV size in bytes. A proposed-nav CSV is a handful of path
 * rows; anything approaching a megabyte is not a legitimate nav change and is
 * rejected up front to avoid oversized-input problems (design: "Enforce a max
 * file size").
 */
export const MAX_CSV_BYTES = 1024 * 1024; // 1 MiB

/**
 * Maximum accepted data-row count (excluding the header row). Guards against a
 * small-but-pathological file expanding into an unreasonable number of rows
 * (design: "and max row count").
 */
export const MAX_CSV_ROWS = 5_000;

/** The canonical column headers the converter needs, after normalisation. */
const REQUIRED_COLUMNS = ["old", "new"] as const;

/** Options for {@link parseCsv}, overridable in tests. */
export interface ParseCsvOptions {
  /** Byte ceiling; defaults to {@link MAX_CSV_BYTES}. */
  maxBytes?: number;
  /** Data-row ceiling; defaults to {@link MAX_CSV_ROWS}. */
  maxRows?: number;
}

/**
 * Result of {@link parseCsv}. Either clean, column-shaped rows, or the collected
 * parse-stage validation errors — never both. This mirrors the all-or-nothing
 * contract the converter and UI rely on (design Property 5).
 */
export type ParseCsvResult =
  | { ok: true; rows: ProposedRow[] }
  | { ok: false; errors: ValidationError[] };

/** Normalises a header cell: trim surrounding whitespace, strip a BOM, lower-case. */
function normaliseHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
}

/** Byte length of a string using UTF-8, matching how a `File` reports `.size`. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Reads a `Blob`/`File` as UTF-8 text, preferring `Blob.text()` with a `FileReader` fallback. */
async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") {
    return blob.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(blob);
  });
}

/** Reads a `File`/`Blob` or passes a string through, returning text + byte size. */
async function readSource(source: File | Blob | string): Promise<{ text: string; bytes: number }> {
  if (typeof source === "string") {
    return { text: source, bytes: byteLength(source) };
  }
  const text = await readBlobText(source);
  // Prefer the source's reported size; fall back to the decoded text length.
  const bytes = typeof source.size === "number" ? source.size : byteLength(text);
  return { text, bytes };
}

/**
 * Parses an imported CSV into `ProposedRow[]`.
 *
 * Steps, in order (each failure short-circuits with a descriptive error):
 *   1. Read the source and enforce the byte-size guard (`FILE_TOO_LARGE`).
 *   2. Parse with papaparse in header mode; a structural parse failure (e.g. an
 *      unterminated quote) becomes `PARSE_ERROR`.
 *   3. Require the normalised `old` and `new` columns (`MISSING_COLUMN`).
 *   4. Enforce the row-count guard (`FILE_TOO_LARGE`).
 *
 * On success, returns one {@link ProposedRow} per data row with `old`/`new` as the
 * raw (untrimmed) cell values — path normalisation is the converter's concern.
 */
export async function parseCsv(
  source: File | Blob | string,
  options: ParseCsvOptions = {},
): Promise<ParseCsvResult> {
  const maxBytes = options.maxBytes ?? MAX_CSV_BYTES;
  const maxRows = options.maxRows ?? MAX_CSV_ROWS;

  const { text, bytes } = await readSource(source);

  if (bytes > maxBytes) {
    return {
      ok: false,
      errors: [
        {
          code: "FILE_TOO_LARGE",
          message: `CSV is too large: ${bytes} bytes exceeds the ${maxBytes}-byte limit.`,
        },
      ],
    };
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normaliseHeader,
  });

  // Treat structural quote errors as fatal — the file cannot be trusted to have
  // been parsed into the intended columns. Delimiter auto-detection notices and
  // ragged-row (FieldMismatch) notices are tolerated; missing columns and empty
  // rows are handled explicitly below and by validateRows.
  const fatal = parsed.errors.find((error) => error.type === "Quotes");
  if (fatal) {
    return {
      ok: false,
      errors: [
        {
          code: "PARSE_ERROR",
          ...(typeof fatal.row === "number" ? { row: fatal.row + 1 } : {}),
          message: `CSV could not be parsed: ${fatal.message}`,
        },
      ],
    };
  }

  const fields = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((column) => !fields.includes(column));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [
        {
          code: "MISSING_COLUMN",
          message: `CSV is missing required column(s): ${missing.join(", ")}. Expected an "old" and a "new" column.`,
        },
      ],
    };
  }

  if (parsed.data.length > maxRows) {
    return {
      ok: false,
      errors: [
        {
          code: "FILE_TOO_LARGE",
          message: `CSV has too many rows: ${parsed.data.length} exceeds the ${maxRows}-row limit.`,
        },
      ],
    };
  }

  const rows: ProposedRow[] = parsed.data.map((record) => ({
    old: record.old ?? "",
    new: record.new ?? "",
  }));

  return { ok: true, rows };
}

/**
 * Validates parsed rows for per-row problems.
 *
 * The only per-row concern at this stage is an empty row — one whose `old` and
 * `new` are both blank after trimming — which carries no operation and is almost
 * certainly a stray line. Column presence and file-level guards are enforced in
 * {@link parseCsv}; path-existence checks (`OLD_NOT_FOUND`, `PARENT_NOT_FOUND`,
 * `DUPLICATE_PATH`) belong to the converter (task 9).
 *
 * Returns an empty array when every row is well-formed.
 */
export function validateRows(rows: ProposedRow[]): ValidationError[] {
  const errors: ValidationError[] = [];

  rows.forEach((row, index) => {
    const oldEmpty = row.old.trim() === "";
    const newEmpty = row.new.trim() === "";
    if (oldEmpty && newEmpty) {
      errors.push({
        row: index + 1,
        code: "EMPTY_ROW",
        message: `Row ${index + 1} is empty: both "old" and "new" are blank.`,
      });
    }
  });

  return errors;
}
