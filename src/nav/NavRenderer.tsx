/**
 * Nav Renderer (recursive) — task 7.1.
 *
 * Renders a `NavNode[]` the way the production storefront structures it: a
 * top-level navigation, expandable groups (`type: "G"`), and leaf links
 * (`type: "L"`) that carry their `urlPath` as `href`, recursing to the full
 * observed depth of three levels (Requirements 3.1–3.3).
 *
 * Render totality (Correctness Property 7, Req 3.2 / 5.4): every node is either
 * drawn or explicitly annotated as skipped. A single malformed node — one that
 * is not an object, lacks a usable `title`, has an unknown `type`, or is a leaf
 * without a link — is annotated in place rather than throwing, so it can never
 * blank the whole navigation.
 *
 * Visual theming is intentionally out of scope here (task 7.2): the renderer
 * exposes `data-mode` and `data-theme` hooks and semantic class names, but the
 * concrete brand styling lives in the isolated theme layer.
 */
import type { NavNode } from "../data/types";
import { themeToCssVars } from "./themes";
import type { NavRendererProps } from "./types";

/**
 * Runtime guard for a renderable node. The static type is `NavNode`, but the
 * tree can originate from a committed snapshot or a CSV conversion, so entries
 * are validated defensively before rendering (Property 7).
 *
 * A node is renderable when it is a non-null object with a non-empty string
 * `title` and a known `type`. A leaf additionally needs a string `urlPath` to
 * carry as its link; anything else is treated as malformed and annotated.
 */
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

interface NavNodeItemProps {
  /** Typed as `unknown` because the input tree may contain malformed entries. */
  node: unknown;
  /** 1-based nesting depth, surfaced as a `data-depth` hook. */
  depth: number;
}

/** Renders a single node: a malformed annotation, an expandable group, or a leaf link. */
function NavNodeItem({ node, depth }: NavNodeItemProps): JSX.Element {
  if (!isRenderableNavNode(node)) {
    return (
      <li className="nav-item nav-item--malformed" data-malformed="true">
        <span role="note">Skipped malformed navigation node</span>
      </li>
    );
  }

  if (node.type === "G") {
    const children = Array.isArray(node.navigationNode) ? node.navigationNode : [];
    return (
      <li className="nav-item nav-item--group">
        <details className="nav-group">
          <summary className="nav-group__title">{node.title}</summary>
          {children.length > 0 ? <NavNodeList nodes={children} depth={depth + 1} /> : null}
        </details>
      </li>
    );
  }

  return (
    <li className="nav-item nav-item--leaf">
      <a className="nav-leaf__link" href={node.urlPath}>
        {node.title}
      </a>
    </li>
  );
}

interface NavNodeListProps {
  nodes: readonly unknown[];
  depth: number;
}

/** Renders one level of the tree; recurses into groups via {@link NavNodeItem}. */
function NavNodeList({ nodes, depth }: NavNodeListProps): JSX.Element {
  return (
    <ul className="nav-list" data-depth={depth}>
      {nodes.map((node, index) => (
        <NavNodeItem key={nodeKey(node, index)} node={node} depth={depth} />
      ))}
    </ul>
  );
}

/**
 * Recursive navigation renderer. See the module docstring for the fidelity and
 * totality guarantees.
 *
 * Theming (task 7.2) is applied purely as opaque styling: when a `theme` is
 * supplied the renderer exposes it as a `data-theme` hook, applies the theme's
 * CSS custom properties to the root element, and renders the brand logo. All of
 * those brand-specific values come from the isolated theme layer (`./themes`),
 * so the structural logic above is untouched and per-brand fidelity can be
 * tightened without changing this component.
 */
export function NavRenderer({ nodes, mode, theme }: NavRendererProps): JSX.Element {
  return (
    <nav
      className="nav-renderer"
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
      <NavNodeList nodes={nodes} depth={1} />
    </nav>
  );
}
