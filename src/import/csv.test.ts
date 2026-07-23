import { describe, expect, it } from "vitest";

import { MAX_CSV_BYTES, MAX_CSV_ROWS, parseCsv, validateRows } from "./csv";
import type { ProposedRow } from "../data/types";

describe("parseCsv", () => {
  it("parses a valid CSV into old/new rows", async () => {
    const csv = ["old,new", "/shop/a,/shop/b", ",/shop/c", "/shop/d,"].join("\n");

    const result = await parseCsv(csv);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual<ProposedRow[]>([
      { old: "/shop/a", new: "/shop/b" },
      { old: "", new: "/shop/c" },
      { old: "/shop/d", new: "" },
    ]);
  });

  it("normalises header names (case, surrounding whitespace, BOM)", async () => {
    const csv = ["\uFEFF Old , NEW ", "/a,/b"].join("\n");

    const result = await parseCsv(csv);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual<ProposedRow[]>([{ old: "/a", new: "/b" }]);
  });

  it("reads from a File and preserves raw cell values", async () => {
    const file = new File(["old,new\n/shop/womens,/womens"], "change.csv", {
      type: "text/csv",
    });

    const result = await parseCsv(file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual<ProposedRow[]>([{ old: "/shop/womens", new: "/womens" }]);
  });

  it("rejects a CSV missing a required column", async () => {
    const csv = ["old,foo", "/a,/b"].join("\n");

    const result = await parseCsv(csv);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("MISSING_COLUMN");
    expect(result.errors[0]?.message).toContain("new");
  });

  it("rejects a CSV missing both required columns", async () => {
    const result = await parseCsv("foo,bar\n1,2");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe("MISSING_COLUMN");
    expect(result.errors[0]?.message).toContain("old");
    expect(result.errors[0]?.message).toContain("new");
  });

  it("rejects unparseable content (unterminated quote)", async () => {
    const csv = 'old,new\n"unterminated,value';

    const result = await parseCsv(csv);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe("PARSE_ERROR");
  });

  it("rejects a file that exceeds the byte-size guard", async () => {
    const result = await parseCsv("old,new\n/a,/b", { maxBytes: 4 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe("FILE_TOO_LARGE");
    expect(result.errors[0]?.message).toContain("bytes");
  });

  it("rejects a file that exceeds the byte-size guard when read from a File", async () => {
    const big = "old,new\n" + "/a,/b\n".repeat(1000);
    const file = new File([big], "big.csv", { type: "text/csv" });

    const result = await parseCsv(file, { maxBytes: 10 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects a CSV that exceeds the row-count guard", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => `/a${i},/b${i}`);
    const csv = ["old,new", ...rows].join("\n");

    const result = await parseCsv(csv, { maxRows: 5 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe("FILE_TOO_LARGE");
    expect(result.errors[0]?.message).toContain("rows");
  });

  it("accepts a CSV exactly at the row-count guard", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => `/a${i},/b${i}`);
    const csv = ["old,new", ...rows].join("\n");

    const result = await parseCsv(csv, { maxRows: 5 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(5);
  });

  it("exposes sensible default guard limits", () => {
    expect(MAX_CSV_BYTES).toBeGreaterThan(0);
    expect(MAX_CSV_ROWS).toBeGreaterThan(0);
  });
});

describe("validateRows", () => {
  it("returns no errors for well-formed rows", () => {
    const rows: ProposedRow[] = [
      { old: "/a", new: "/b" },
      { old: "", new: "/c" },
      { old: "/d", new: "" },
    ];

    expect(validateRows(rows)).toEqual([]);
  });

  it("flags a row where both old and new are blank", () => {
    const rows: ProposedRow[] = [
      { old: "/a", new: "/b" },
      { old: "  ", new: "" },
    ];

    const errors = validateRows(rows);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("EMPTY_ROW");
    expect(errors[0]?.row).toBe(2);
  });

  it("reports every empty row with its 1-based index", () => {
    const rows: ProposedRow[] = [
      { old: "", new: "" },
      { old: "/a", new: "/b" },
      { old: " ", new: " " },
    ];

    const errors = validateRows(rows);

    expect(errors.map((e) => e.row)).toEqual([1, 3]);
    expect(errors.every((e) => e.code === "EMPTY_ROW")).toBe(true);
  });
});
