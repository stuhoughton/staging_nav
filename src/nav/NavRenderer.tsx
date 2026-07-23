/**
 * Nav Renderer (recursive drill-down drawer) — tasks 7.1 / 7.2.
 *
 * Reproduces the production storefront navigation *interaction*, not just its
 * structure: a vertical drawer that drills down. The root panel lists the
 * top-level categories; selecting a group replaces the panel with that category's
 * contents — a back/breadcrumb header, then its sub-groups as section headings
 * with their links beneath (mirroring the live megamenu's "Shop By Category /
 * Shop By Fit / Brands" layout). Leaf nodes are links carrying their `urlPath`
 * (Requirements 3.1–3.3).
 *
 * Every panel is rendered into the DOM; only the active one is shown (the drawer
 * slides between them). This keeps the full tree present for a faithful preview
 * and lets deep links be found regardless of which panel is open.
 *
 * Render totality (Correctness Property 7, Req 3.2 / 5.4): every node is either
 * drawn or annotated as skipped; one malformed node never blanks the drawer.
 *
 * Brand styling stays isolated in the theme layer (`./themes`): this component
 * only applies the theme's CSS custom properties and logo, and exposes
 * `data-mode` / `data-theme` hooks. Fidelity is tightened by editing tokens/CSS,
 * never the structural logic here.
 */
import { useEffect, useMemo, useState } from "react";

import type { NavNode } from "../data/types";
import { themeToCssVars } from "./themes";
import type { NavRendererProps } from "./types";

const ROOT_PANEL = "root";

/** Runtime guard for a renderable node (defensive: trees may contain bad entries). */
function isRenderableNavNode(node: unknown): node is NavNode {
  if (typeof node !== "object" || node === null) {
    return false;
  }
  const candidate = node as Record<string, unknown>;
  if (typeof candidate.title !== "string" || candidate.title.trim() === "") {
    return false;
  }
  if (candidate.type !== "G" && candidate.type !== "L") {
    return false;
  }
  if (candidate.type === "L" && typeof candidate.urlPath !== "string") {
    return false;
  }
  return true;
}

/** True when a node is a renderable group. */
function isGroup(node: unknown): node is NavNode & { type: "G" } {
  return isRenderableNavNode(node) && node.type === "G";
}

/** A node's children as an array (empty when absent). */
function childrenOf(node: NavNode): readonly unknown[] {
  return Array.isArray(node.navigationNode) ? node.navigationNode : [];
}

/** A single drill-down panel: the root menu, or a drilled-into category. */
interface PanelModel {
  /** Stable id: "root", or an index path like "2" or "2/0/1". */
  id: string;
  /** Panel to return to via "back"; null for the root. */
  parentId: string | null;
  /** Category title (breadcrumb label); "" for the root. */
  title: string;
  /** The raw child nodes this panel displays. */
  children: readonly unknown[];
  /** False for the root menu, true for a drilled-into category. */
  drilled: boolean;
}

/**
 * Flattens the tree into the set of panels the drawer can show.
 *
 * Root's child groups are drill targets. Inside a drilled panel, a child group is
 * an inline *section* (its leaf children listed beneath it); only a group nested
 * one level deeper (a group that is a grandchild) becomes a further drill target.
 * This matches the production drawer, where a category expands to sections and you
 * only drill again for a sub-category that itself has children.
 */
function buildPanels(nodes: readonly unknown[]): PanelModel[] {
  const panels: PanelModel[] = [
    { id: ROOT_PANEL, parentId: null, title: "", children: nodes, drilled: false },
  ];

  const addDrilled = (node: NavNode, id: string, parentId: string): void => {
    const children = childrenOf(node);
    panels.push({ id, parentId, title: node.title, children, drilled: true });
    children.forEach((child, ci) => {
      if (isGroup(child)) {
        childrenOf(child).forEach((grandchild, gi) => {
          if (isGroup(grandchild)) {
            addDrilled(grandchild, `${id}/${ci}/${gi}`, id);
          }
        });
      }
    });
  };

  nodes.forEach((child, ci) => {
    if (isGroup(child)) {
      addDrilled(child, String(ci), ROOT_PANEL);
    }
  });

  return panels;
}

/** Annotation for a node that failed the renderable guard (Property 7). */
function MalformedRow(): JSX.Element {
  return (
    <li className="nav-item nav-item--malformed" data-malformed="true">
      <span role="note">Skipped malformed navigation node</span>
    </li>
  );
}

/**
 * Resolves a node's `urlPath` to an href.
 *
 * When a brand `origin` is supplied the path is resolved to an absolute URL on the
 * production storefront, so clicking opens the real destination rather than a
 * same-host path that the staging SPA would swallow (rebooting at the root). With
 * no origin (e.g. isolated component tests) the raw `urlPath` is used as-is.
 */
function leafHref(urlPath: string, origin: string | undefined): string {
  if (!origin) {
    return urlPath;
  }
  try {
    return new URL(urlPath, origin).href;
  } catch {
    return urlPath;
  }
}

/** A leaf link row carrying the node's destination. */
function LeafLink({ node, origin }: { node: NavNode; origin: string | undefined }): JSX.Element {
  const href = leafHref(node.urlPath, origin);
  // Production destinations open in a new tab so the staging drawer is preserved.
  const external = origin !== undefined;
  return (
    <a
      className="nav-row nav-row--leaf nav-leaf__link"
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {node.title}
    </a>
  );
}

/** A drill row: a button that navigates into a group's panel. */
function DrillRow({ node, onOpen }: { node: NavNode; onOpen: () => void }): JSX.Element {
  return (
    <button type="button" className="nav-row nav-row--drill" onClick={onOpen}>
      <span className="nav-row__label">{node.title}</span>
      <span className="nav-row__chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

/** Breadcrumb trail for a drilled panel, with each crumb navigating to its panel. */
function Breadcrumb({
  panel,
  byId,
  onNavigate,
}: {
  panel: PanelModel;
  byId: Map<string, PanelModel>;
  onNavigate: (id: string) => void;
}): JSX.Element {
  const trail: PanelModel[] = [];
  let cursor: PanelModel | undefined = panel;
  while (cursor && cursor.id !== ROOT_PANEL) {
    trail.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }

  return (
    <nav className="nav-breadcrumb" aria-label="Breadcrumb">
      <button
        type="button"
        className="nav-breadcrumb__crumb"
        onClick={() => onNavigate(ROOT_PANEL)}
      >
        Home
      </button>
      {trail.map((crumb, index) => {
        const isLast = index === trail.length - 1;
        return (
          <span key={crumb.id} className="nav-breadcrumb__segment">
            <span className="nav-breadcrumb__sep" aria-hidden="true">
              /
            </span>
            {isLast ? (
              <span className="nav-breadcrumb__current" aria-current="page">
                {crumb.title}
              </span>
            ) : (
              <button
                type="button"
                className="nav-breadcrumb__crumb"
                onClick={() => onNavigate(crumb.id)}
              >
                {crumb.title}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** Renders one panel's contents (root rows, or drilled sections + links). */
function PanelBody({
  panel,
  onOpen,
  origin,
}: {
  panel: PanelModel;
  /** Opens a child/grandchild group's panel by id. */
  onOpen: (id: string) => void;
  /** Brand origin for resolving leaf link destinations. */
  origin: string | undefined;
}): JSX.Element {
  // Root: a flat vertical menu — groups drill in, leaves are links.
  if (!panel.drilled) {
    return (
      <ul className="nav-menu" data-depth="1">
        {panel.children.map((child, ci) => (
          <li className="nav-menu__item" key={nodeKey(child, ci)}>
            {!isRenderableNavNode(child) ? (
              <span className="nav-item nav-item--malformed" data-malformed="true" role="note">
                Skipped malformed navigation node
              </span>
            ) : child.type === "G" ? (
              <DrillRow node={child} onOpen={() => onOpen(String(ci))} />
            ) : (
              <LeafLink node={child} origin={origin} />
            )}
          </li>
        ))}
      </ul>
    );
  }

  // Drilled category: leaves as direct links, groups as sections with their items.
  return (
    <div className="nav-sections">
      {panel.children.map((child, ci) => {
        if (!isRenderableNavNode(child)) {
          return (
            <ul className="nav-menu" key={`m-${ci}`}>
              <MalformedRow />
            </ul>
          );
        }
        if (child.type === "L") {
          return (
            <ul className="nav-menu" key={nodeKey(child, ci)}>
              <li className="nav-menu__item">
                <LeafLink node={child} origin={origin} />
              </li>
            </ul>
          );
        }
        // Group → a section heading with its children listed beneath.
        return (
          <section className="nav-section" key={nodeKey(child, ci)}>
            <h3 className="nav-section__title">{child.title}</h3>
            <ul className="nav-menu">
              {childrenOf(child).map((grandchild, gi) => (
                <li className="nav-menu__item" key={nodeKey(grandchild, gi)}>
                  {!isRenderableNavNode(grandchild) ? (
                    <span
                      className="nav-item nav-item--malformed"
                      data-malformed="true"
                      role="note"
                    >
                      Skipped malformed navigation node
                    </span>
                  ) : grandchild.type === "G" ? (
                    <DrillRow node={grandchild} onOpen={() => onOpen(`${panel.id}/${ci}/${gi}`)} />
                  ) : (
                    <LeafLink node={grandchild} origin={origin} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Stable-ish key for a node: prefer its hierarchy path, fall back to index. */
function nodeKey(node: unknown, index: number): string {
  if (typeof node === "object" && node !== null) {
    const seoPath = (node as Record<string, unknown>).seoPath;
    if (typeof seoPath === "string" && seoPath !== "") {
      return seoPath;
    }
  }
  return `node-${index}`;
}

/**
 * Recursive navigation renderer as a drill-down drawer. See the module docstring
 * for the interaction and totality guarantees.
 */
export function NavRenderer({ nodes, mode, theme, linkOrigin }: NavRendererProps): JSX.Element {
  const panels = useMemo(() => buildPanels(nodes), [nodes]);
  const byId = useMemo(() => new Map(panels.map((panel) => [panel.id, panel])), [panels]);
  const [activeId, setActiveId] = useState<string>(ROOT_PANEL);

  // Reset to the root menu whenever the tree changes (e.g. a proposed import),
  // so we never linger on a panel id that no longer exists.
  useEffect(() => {
    setActiveId(ROOT_PANEL);
  }, [nodes]);

  const open = (id: string): void => {
    setActiveId(byId.has(id) ? id : ROOT_PANEL);
  };

  return (
    <nav
      className="nav-renderer nav-renderer--drawer"
      data-mode={mode}
      data-theme={theme?.id}
      aria-label="Store navigation"
      style={theme ? themeToCssVars(theme) : undefined}
    >
      {theme ? (
        <div className="nav-renderer__header">
          <img className="nav-renderer__logo" src={theme.logo.src} alt={theme.logo.alt} />
        </div>
      ) : null}

      <div className="nav-renderer__panels">
        {panels.map((panel) => (
          <section
            key={panel.id}
            className={`nav-panel${panel.id === activeId ? " nav-panel--active" : ""}`}
            data-panel={panel.id}
            data-active={panel.id === activeId}
          >
            {panel.drilled ? (
              <div className="nav-panel__header">
                <button
                  type="button"
                  className="nav-back"
                  aria-label="Back"
                  onClick={() => open(panel.parentId ?? ROOT_PANEL)}
                >
                  <span aria-hidden="true">‹</span> Back
                </button>
                <Breadcrumb panel={panel} byId={byId} onNavigate={open} />
              </div>
            ) : null}
            <PanelBody panel={panel} onOpen={open} origin={linkOrigin} />
          </section>
        ))}
      </div>
    </nav>
  );
}
