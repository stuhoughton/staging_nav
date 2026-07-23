import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { BrandConfig } from "../config/brands";
import { App } from "./App";
import type { SnapshotBundle } from "./data/types";
import { ModeBanner } from "./app/ModeBanner";
import { jdWilliamsNavFixture } from "./__fixtures__/jdwilliams-nav";

const jdWilliams: BrandConfig = {
  id: "jdwilliams",
  name: "JD Williams",
  origin: "https://www.jdwilliams.co.uk",
  layoutPath: "/api/layout",
  themeId: "jdwilliams",
  pathField: "urlPath",
  enabled: true,
};

const CAPTURED_AT = "2024-01-15T09:30:00.000Z";

const okBundle: SnapshotBundle = {
  brandId: "jdwilliams",
  nav: jdWilliamsNavFixture,
  capturedAt: CAPTURED_AT,
  status: "ok",
};

const loadOk = (): SnapshotBundle => okBundle;
const loadFailed = (): SnapshotBundle => ({
  brandId: "jdwilliams",
  nav: [],
  capturedAt: "",
  status: "failed",
});

/** Builds a CSV `File` the file input accepts and `parseCsv` can read. */
function csvFile(contents: string, name = "proposed.csv"): File {
  return new File([contents], name, { type: "text/csv" });
}

describe("App shell", () => {
  it("renders the selected brand's live snapshot on load (Req 5.2)", () => {
    render(<App brands={[jdWilliams]} loadSnapshotFn={loadOk} />);

    // The live nav is rendered in live mode.
    const nav = document.querySelector("nav.nav-renderer");
    expect(nav).toHaveAttribute("data-mode", "live");
    // A representative leaf link from the fixture is present.
    expect(screen.getByRole("link", { name: "Dresses" })).toHaveAttribute(
      "href",
      "/shop/c/womens/dresses",
    );
  });

  it("shows the live snapshot capture timestamp in the banner (Req 3.4)", () => {
    render(<App brands={[jdWilliams]} loadSnapshotFn={loadOk} />);

    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("data-mode", "live");
    expect(banner).toHaveTextContent(/live snapshot/i);
    expect(banner).toHaveTextContent(CAPTURED_AT);
  });

  it("lists enabled brands as selectable options (Req 5.1)", () => {
    render(<App brands={[jdWilliams]} loadSnapshotFn={loadOk} />);

    const select = screen.getByLabelText("Brand");
    expect(within(select).getByRole("option", { name: "JD Williams" })).toBeInTheDocument();
  });

  it("switches to the proposed tree with a proposed banner on a successful import (Req 4.5, 4.6)", async () => {
    const user = userEvent.setup();
    render(<App brands={[jdWilliams]} loadSnapshotFn={loadOk} />);

    // Sanity: Sale is present in the live tree.
    expect(screen.getByRole("link", { name: "Sale" })).toBeInTheDocument();

    // Remove the Sale leaf (pathField is urlPath for JD Williams).
    const input = screen.getByLabelText(/import proposed change/i);
    await user.upload(input, csvFile("old,new\n/shop/c/sale,\n"));

    // Banner flips to proposed, showing the source filename.
    await waitFor(() => {
      const banner = screen.getByRole("status");
      expect(banner).toHaveAttribute("data-mode", "proposed");
      expect(banner).toHaveTextContent(/proposed change/i);
      expect(banner).toHaveTextContent("proposed.csv");
    });

    // The proposed tree rendered: Sale is gone, other nodes remain.
    expect(document.querySelector("nav.nav-renderer")).toHaveAttribute("data-mode", "proposed");
    expect(screen.queryByRole("link", { name: "Sale" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dresses" })).toBeInTheDocument();
  });

  it("keeps the live nav and shows descriptive errors on a failed import (Req 4.4)", async () => {
    const user = userEvent.setup();
    render(<App brands={[jdWilliams]} loadSnapshotFn={loadOk} />);

    const input = screen.getByLabelText(/import proposed change/i);
    // "old" path that does not exist → OLD_NOT_FOUND, whole import rejected.
    await user.upload(input, csvFile("old,new\n/does/not/exist,\n"));

    // A descriptive error is shown.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no navigation node matches/i);

    // The live nav stays on screen in live mode — no partial proposal.
    expect(document.querySelector("nav.nav-renderer")).toHaveAttribute("data-mode", "live");
    expect(screen.getByRole("link", { name: "Sale" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("data-mode", "live");
  });

  it("shows a descriptive error for a CSV missing required columns (Req 4.4)", async () => {
    const user = userEvent.setup();
    render(<App brands={[jdWilliams]} loadSnapshotFn={loadOk} />);

    const input = screen.getByLabelText(/import proposed change/i);
    await user.upload(input, csvFile("foo,bar\n1,2\n"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/missing required column/i);
    expect(document.querySelector("nav.nav-renderer")).toHaveAttribute("data-mode", "live");
  });

  it("keeps the brand selectable and shows a message when the snapshot can't render (Req 5.4)", () => {
    render(<App brands={[jdWilliams]} loadSnapshotFn={loadFailed} />);

    // Brand still selectable.
    const select = screen.getByLabelText("Brand");
    expect(within(select).getByRole("option", { name: "JD Williams" })).toBeInTheDocument();

    // No broken render; a descriptive message stands in for the nav.
    expect(document.querySelector("nav.nav-renderer")).toBeNull();
    expect(screen.getByText(/can't be rendered right now/i)).toBeInTheDocument();
  });
});

describe("Mode clarity (Property 8)", () => {
  // The UI always indicates live (with timestamp) vs proposed (with filename);
  // the two are never ambiguous.
  // **Validates: Requirements 3.4, 4.6**
  it("live mode always shows the capture timestamp and never a filename", () => {
    fc.assert(
      fc.property(fc.string(), (capturedAt) => {
        const { container, unmount } = render(
          <ModeBanner mode="live" capturedAt={capturedAt} filename="ignored.csv" />,
        );
        try {
          const banner = container.querySelector(".mode-banner");
          expect(banner).toHaveAttribute("data-mode", "live");
          expect(banner?.textContent).toMatch(/^Live snapshot — captured /);
          expect(banner?.textContent).not.toMatch(/Proposed change/);
        } finally {
          unmount();
        }
      }),
    );
  });

  it("proposed mode always shows the source filename and never a live timestamp", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (filename) => {
        const { container, unmount } = render(
          <ModeBanner mode="proposed" capturedAt="2024-01-01T00:00:00Z" filename={filename} />,
        );
        try {
          const banner = container.querySelector(".mode-banner");
          expect(banner).toHaveAttribute("data-mode", "proposed");
          expect(banner?.textContent).toMatch(/^Proposed change — imported from /);
          expect(banner?.textContent).not.toMatch(/Live snapshot/);
        } finally {
          unmount();
        }
      }),
    );
  });
});
