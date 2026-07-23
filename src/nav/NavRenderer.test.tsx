import { render, screen, within } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NavNode } from "../data/types";
import { jdWilliamsNavFixture } from "../__fixtures__/jdwilliams-nav";
import { NavRenderer } from "./NavRenderer";
import { jdWilliamsTheme } from "./themes";

describe("NavRenderer", () => {
  it("renders groups as expandable disclosures and leaves as links", () => {
    const nodes: NavNode[] = [
      { title: "Womens", urlPath: "/shop/c/womens", type: "G", seoPath: "/womens" },
      { title: "Sale", urlPath: "/shop/c/sale", type: "L", seoPath: "/sale" },
    ];
    const { container } = render(<NavRenderer nodes={nodes} mode="live" />);

    // Group → a <details>/<summary> disclosure carrying the title.
    const group = container.querySelector("details.nav-group");
    expect(group).not.toBeNull();
    expect(within(group as HTMLElement).getByText("Womens")).toBeInTheDocument();

    // Leaf → an anchor link.
    const saleLink = screen.getByRole("link", { name: "Sale" });
    expect(saleLink).toHaveAttribute("href", "/shop/c/sale");
  });

  it("renders leaf links with their urlPath as href (Req 3.3)", () => {
    render(<NavRenderer nodes={jdWilliamsNavFixture} mode="live" />);

    expect(screen.getByRole("link", { name: "Dresses" })).toHaveAttribute(
      "href",
      "/shop/c/womens/dresses",
    );
    expect(screen.getByRole("link", { name: "Lingerie" })).toHaveAttribute(
      "href",
      "/shop/c/womens/lingerie",
    );
    expect(screen.getByRole("link", { name: "Sale" })).toHaveAttribute("href", "/shop/c/sale");
  });

  it("renders the full three-level nesting (Req 3.2)", () => {
    const { container } = render(<NavRenderer nodes={jdWilliamsNavFixture} mode="live" />);

    // Level 1: Womens (group) → Level 2: Shop by Category (group) → Level 3: Dresses (leaf).
    const topList = container.querySelector("nav.nav-renderer > ul.nav-list[data-depth='1']");
    expect(topList).not.toBeNull();
    expect(container.querySelector("ul.nav-list[data-depth='2']")).not.toBeNull();
    expect(container.querySelector("ul.nav-list[data-depth='3']")).not.toBeNull();

    // The deepest leaf is reachable and correctly linked.
    const dresses = screen.getByRole("link", { name: "Dresses" });
    expect(dresses).toHaveAttribute("href", "/shop/c/womens/dresses");

    // Its intermediate group ancestor is present.
    expect(screen.getAllByText("Shop by Category").length).toBeGreaterThan(0);
  });

  it("annotates a malformed node without blanking sibling nodes (Property 7)", () => {
    const nodes = [
      { title: "Womens", urlPath: "/shop/c/womens", type: "G", seoPath: "/womens" },
      // Malformed: unknown type, no usable link.
      { title: "Broken", type: "X" },
      { title: "Sale", urlPath: "/shop/c/sale", type: "L", seoPath: "/sale" },
    ] as unknown as NavNode[];

    const { container } = render(<NavRenderer nodes={nodes} mode="live" />);

    // The malformed node is annotated, not silently dropped.
    const malformed = container.querySelectorAll("[data-malformed='true']");
    expect(malformed).toHaveLength(1);
    expect(screen.getByText(/skipped malformed navigation node/i)).toBeInTheDocument();

    // Valid siblings still render around it — the tree is not blanked.
    expect(
      within(container.querySelector("details.nav-group") as HTMLElement).getByText("Womens"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sale" })).toBeInTheDocument();
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
  // A node the runtime guard accepts.
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
  // Nodes the guard must reject and annotate rather than draw.
  const arbMalformed: fc.Arbitrary<unknown> = fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.constant({}),
    fc.record({ title: fc.constant("   "), type: fc.constant("L"), urlPath: fc.string() }),
    fc.record({ title: fc.string({ minLength: 1 }), type: fc.constant("X") }),
    // Leaf missing a usable urlPath.
    fc.record({ title: fc.constant("Leaf"), type: fc.constant("L") }),
    fc.integer(),
    fc.string(),
  );

  const arbNodes = fc.array(fc.oneof(arbLeaf, arbGroup, arbMalformed), { maxLength: 12 });

  it("draws or annotates every top-level node — one item per node, never blank", () => {
    fc.assert(
      fc.property(arbNodes, (nodes) => {
        const { container, unmount } = render(
          <NavRenderer nodes={nodes as unknown as NavNode[]} mode="live" />,
        );
        try {
          const topList = container.querySelector("nav.nav-renderer > ul.nav-list");
          const directItems = topList
            ? Array.from(topList.children).filter((child) => child.tagName === "LI")
            : [];
          // Every node is accounted for exactly once (drawn or annotated).
          expect(directItems).toHaveLength(nodes.length);
        } finally {
          unmount();
        }
      }),
    );
  });
});
