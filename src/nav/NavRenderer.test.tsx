import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NavNode } from "../data/types";
import { jdWilliamsNavFixture } from "../__fixtures__/jdwilliams-nav";
import { NavRenderer } from "./NavRenderer";
import { jdWilliamsTheme } from "./themes";

/** The active (visible) panel in the drawer. */
function activePanel(container: HTMLElement): HTMLElement {
  const panel = container.querySelector<HTMLElement>(".nav-panel--active");
  if (!panel) {
    throw new Error("no active panel");
  }
  return panel;
}

describe("NavRenderer drawer", () => {
  it("renders the root menu: groups as drill buttons, leaves as links", () => {
    const nodes: NavNode[] = [
      { title: "Womens", urlPath: "/shop/c/womens", type: "G", seoPath: "/womens" },
      { title: "Sale", urlPath: "/shop/c/sale", type: "L", seoPath: "/sale" },
    ];
    const { container } = render(<NavRenderer nodes={nodes} mode="live" />);

    const root = activePanel(container);
    // Group → a drill button carrying the title.
    expect(within(root).getByRole("button", { name: /Womens/ })).toBeInTheDocument();
    // Leaf → an anchor link with its urlPath.
    expect(within(root).getByRole("link", { name: "Sale" })).toHaveAttribute(
      "href",
      "/shop/c/sale",
    );
  });

  it("drills into a category and shows its sections and links, then navigates back", async () => {
    const user = userEvent.setup();
    const { container } = render(<NavRenderer nodes={jdWilliamsNavFixture} mode="live" />);

    // Root shows Womens as a drill target.
    const womens = within(activePanel(container)).getByRole("button", { name: /Womens/ });
    await user.click(womens);

    // The active panel is now the Womens category: its section heading and a deep link.
    const panel = activePanel(container);
    expect(within(panel).getByRole("heading", { name: "Shop by Category" })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Dresses" })).toHaveAttribute(
      "href",
      "/shop/c/womens/dresses",
    );

    // A breadcrumb reflects the trail and Back returns to the root menu.
    expect(within(panel).getByText("Home")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: /Back/ }));
    expect(
      within(activePanel(container)).getByRole("button", { name: /Womens/ }),
    ).toBeInTheDocument();
  });

  it("keeps every leaf link in the DOM across panels (full-tree preview)", () => {
    render(<NavRenderer nodes={jdWilliamsNavFixture} mode="live" />);
    // Deep links exist regardless of which panel is active.
    expect(screen.getByRole("link", { name: "Dresses" })).toHaveAttribute(
      "href",
      "/shop/c/womens/dresses",
    );
    expect(screen.getByRole("link", { name: "Lingerie" })).toHaveAttribute(
      "href",
      "/shop/c/womens/lingerie",
    );
  });

  it("annotates a malformed node without blanking sibling nodes (Property 7)", () => {
    const nodes = [
      { title: "Womens", urlPath: "/shop/c/womens", type: "G", seoPath: "/womens" },
      { title: "Broken", type: "X" },
      { title: "Sale", urlPath: "/shop/c/sale", type: "L", seoPath: "/sale" },
    ] as unknown as NavNode[];

    const { container } = render(<NavRenderer nodes={nodes} mode="live" />);
    const root = activePanel(container);

    // The malformed node is annotated, not silently dropped.
    expect(root.querySelectorAll("[data-malformed='true']")).toHaveLength(1);
    expect(screen.getByText(/skipped malformed navigation node/i)).toBeInTheDocument();

    // Valid siblings still render around it.
    expect(within(root).getByRole("button", { name: /Womens/ })).toBeInTheDocument();
    expect(within(root).getByRole("link", { name: "Sale" })).toBeInTheDocument();
  });

  it("surfaces the mode as a data hook (live vs proposed)", () => {
    const { container: live } = render(<NavRenderer nodes={[]} mode="live" />);
    expect(live.querySelector("nav.nav-renderer")).toHaveAttribute("data-mode", "live");

    const { container: proposed } = render(<NavRenderer nodes={[]} mode="proposed" />);
    expect(proposed.querySelector("nav.nav-renderer")).toHaveAttribute("data-mode", "proposed");
  });

  it("passes the theme id through as a data hook when provided", () => {
    const { container } = render(<NavRenderer nodes={[]} mode="live" theme={jdWilliamsTheme} />);
    expect(container.querySelector("nav.nav-renderer")).toHaveAttribute("data-theme", "jdwilliams");
  });
});

describe("NavRenderer render totality (Property 7)", () => {
  const arbLeaf: fc.Arbitrary<unknown> = fc.record({
    title: fc.string({ minLength: 1 }).filter((s) => s.trim() !== ""),
    urlPath: fc.string(),
    type: fc.constant("L"),
    seoPath: fc.string(),
  });
  const arbGroup: fc.Arbitrary<unknown> = fc.record({
    title: fc.string({ minLength: 1 }).filter((s) => s.trim() !== ""),
    urlPath: fc.string(),
    type: fc.constant("G"),
    seoPath: fc.string(),
  });
  const arbMalformed: fc.Arbitrary<unknown> = fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.constant({}),
    fc.record({ title: fc.constant("   "), type: fc.constant("L"), urlPath: fc.string() }),
    fc.record({ title: fc.string({ minLength: 1 }), type: fc.constant("X") }),
    fc.record({ title: fc.constant("Leaf"), type: fc.constant("L") }),
    fc.integer(),
    fc.string(),
  );

  const arbNodes = fc.array(fc.oneof(arbLeaf, arbGroup, arbMalformed), { maxLength: 12 });

  it("draws or annotates every top-level node — one root row per node, never blank", () => {
    fc.assert(
      fc.property(arbNodes, (nodes) => {
        const { container, unmount } = render(
          <NavRenderer nodes={nodes as unknown as NavNode[]} mode="live" />,
        );
        try {
          const rootMenu = container.querySelector(".nav-panel[data-panel='root'] > ul.nav-menu");
          const items = rootMenu
            ? Array.from(rootMenu.children).filter((child) => child.tagName === "LI")
            : [];
          // Every top-level node is accounted for exactly once (drawn or annotated).
          expect(items).toHaveLength(nodes.length);
        } finally {
          unmount();
        }
      }),
    );
  });
});
