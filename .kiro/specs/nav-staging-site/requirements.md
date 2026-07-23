# Requirements Document

## Introduction

The Navigation Staging Site is a lightweight, free-to-host web application that lets N Brown colleagues preview proposed navigation hierarchy changes rendered exactly as production renders them, for N Brown's storefront brands, before those changes are rolled out to production. N Brown has no staging environment for navigation changes today; this feature fills that gap.

The site's authoritative source of navigation data is each brand's production layout API (for example `https://www.jdwilliams.co.uk/api/layout`), which returns the live navigation hierarchy under the top-level `nav` key of a larger JSON schema (alongside `header`, `footer`, and `notification`, which are out of scope). A scheduled job snapshots that `nav` array per brand into the repository, giving both a stable data source (avoiding browser cross-origin issues) and a version history. When the site loads it renders the live navigation for the selected brand. A colleague can then import a proposed change as a CSV, which the site converts into the navigation JSON shape and renders with the same production fidelity.

### Confirmed navigation node schema (JD Williams)

Each navigation node observed in the live `nav` array has the following shape:

- `title` — display text (for example `"Dresses"`).
- `urlPath` — the destination link the node points to (for example `/shop/c/womens/dresses`); may contain query strings and is not hierarchy-shaped.
- `type` — `"G"` for a group/expandable node or `"L"` for a leaf link.
- `seoPath` — a clean, hierarchy-shaped path (for example `/womens/shop-by-category/dresses`) whose segments mirror the node's position in the tree.
- `iconUrlPath` — a dash-joined identifier path.
- `navigationNode` — an array of child nodes (present on group nodes). Observed nesting is up to three levels deep.

There is no comparison or diff view. The site renders one brand's navigation at a time — either the live snapshot or an imported proposed hierarchy — styled the way production styles it.

A core expectation is fidelity: the staging site must render navigation the way production renders it visually, not merely present a structural or textual tree. Navigation data is public storefront content and contains no customer personal data.

## Scope note (first version)

The first version targets **JD Williams** only. The Snapshot_Job, brand configuration, and Nav_Renderer MUST be configuration-driven so the remaining four brands are added as configuration entries without code changes. Brand-switch behaviour and how an imported Proposed_Hierarchy is treated when switching brand are deferred (see Requirement 7).

## Sensitivity Flags

- **Customer PII:** None. Navigation/layout data is public storefront content.
- **Payments / card data:** None.
- **Authentication / authorisation:** The staging site is gated behind Netlify password protection so only colleagues with the shared credential can view unreleased navigation plans (see Requirement 8). No customer authentication is involved.
- **Data handling note:** The scheduled snapshot MUST extract only the navigation section of the layout response and MUST NOT store personalised or non-navigation content.

## Glossary

- **Staging_Site**: The web application that renders navigation hierarchies. Hosted for free on Netlify and runnable from GitHub.
- **Brand**: One of N Brown's five storefront brands, each with its own production layout API endpoint. The five brands and their production origins are:
  - JD Williams — `https://www.jdwilliams.co.uk`
  - Jacamo — `https://www.jacamo.co.uk`
  - Simply Be — `https://www.simplybe.co.uk`
  - Ambrose Wilson — `https://www.ambrosewilson.com`
  - Fashion World — `https://www.fashionworld.co.uk`
- **Layout_API**: A brand's production endpoint that returns the live layout as JSON, including the `nav` array (for example `https://www.jdwilliams.co.uk/api/layout`).
- **Navigation_Hierarchy**: The tree of navigation nodes (each with `title`, `urlPath`, `type`, `seoPath`, `iconUrlPath`, and optional `navigationNode` children) contained in the `nav` array of a layout response.
- **Live_Snapshot**: A committed copy of a Brand's Navigation_Hierarchy captured from its Layout_API at a scheduled time.
- **Snapshot_Job**: The scheduled automated process (a GitHub Action) that fetches each configured Brand's Layout_API, extracts the navigation section, and commits it to the repository.
- **Proposed_Hierarchy**: A Navigation_Hierarchy, in the same JSON shape as a Live_Snapshot, produced by converting an imported CSV.
- **Proposed_CSV**: A CSV file a Colleague imports describing a proposed navigation change, containing an `old` column and a `new` column.
- **CSV_Converter**: The component that converts a Proposed_CSV into a Proposed_Hierarchy in the Live_Snapshot JSON shape.
- **Nav_Renderer**: The component that renders a Navigation_Hierarchy visually in the manner of the production storefront.
- **Colleague**: An authorised N Brown employee who uses the Staging_Site to preview navigation changes.

## Requirements

### Requirement 1: Scheduled snapshot of live navigation per configured brand

**User Story:** As a Colleague, I want the live navigation for each configured brand captured on a schedule, so that the staging site always has a recent, version-controlled baseline to render.

#### Acceptance Criteria

1. WHERE a Brand has a configured Layout_API endpoint, THE Snapshot_Job SHALL fetch the layout response for that Brand.
2. WHEN the Snapshot_Job fetches a Brand's layout response, THE Snapshot_Job SHALL extract only the navigation section from the response.
3. WHEN the Snapshot_Job extracts a Brand's navigation section, THE Snapshot_Job SHALL commit the extracted Navigation_Hierarchy to the repository as that Brand's Live_Snapshot.
4. THE Snapshot_Job SHALL capture a Live_Snapshot for each configured Brand on each scheduled run.
5. THE Snapshot_Job SHALL run on a defined schedule without manual intervention.
6. IF the Snapshot_Job cannot fetch a Brand's Layout_API, or cannot complete extraction or commit for that Brand, THEN THE Snapshot_Job SHALL record the failure and retain the previous Live_Snapshot for that Brand.
7. WHEN the Snapshot_Job commits a Live_Snapshot, THE Snapshot_Job SHALL record the capture timestamp for that Brand.
8. WHERE a new Brand is added to the configuration, THE Snapshot_Job SHALL include that Brand on its next run without requiring code changes.

### Requirement 2: Snapshot excludes non-navigation and personalised content

**User Story:** As a Colleague responsible for data hygiene, I want snapshots limited to navigation content, so that no personalised or unnecessary data is stored in the repository.

#### Acceptance Criteria

1. WHEN the Snapshot_Job commits a Live_Snapshot, THE Snapshot_Job SHALL include only navigation nodes from the layout response.
2. IF the layout response contains personalised or non-navigation content, THEN THE Snapshot_Job SHALL exclude that content from the committed Live_Snapshot.

### Requirement 3: Render live navigation with production fidelity

**User Story:** As a Colleague, I want the staging site to render navigation the way production does, so that I can judge how a change will actually look and behave to customers.

#### Acceptance Criteria

1. WHEN the Staging_Site loads, THE Nav_Renderer SHALL render the selected Brand's Live_Snapshot as a visual navigation matching the production storefront presentation.
2. THE Nav_Renderer SHALL render the full nesting of the Navigation_Hierarchy, including parent nodes and their descendant nodes.
3. WHEN a navigation node has a destination link, THE Nav_Renderer SHALL present that link on the rendered node.
4. THE Staging_Site SHALL display the capture timestamp of the Live_Snapshot currently being rendered.

### Requirement 4: Import a proposed change as CSV and convert to navigation JSON

**User Story:** As a Colleague, I want to import a proposed navigation change as a CSV, so that I can preview an unreleased change without hand-writing JSON.

#### Acceptance Criteria

1. WHEN a Colleague imports a Proposed_CSV for the selected Brand, THE CSV_Converter SHALL convert the Proposed_CSV into a Proposed_Hierarchy in the same JSON shape as the Brand's Live_Snapshot.
2. THE CSV_Converter SHALL interpret the Proposed_CSV as having an `old` column and a `new` column.
3. WHEN a Colleague imports a Proposed_CSV, THE Staging_Site SHALL sanitise and validate the CSV content before converting or rejecting it.
4. IF an imported Proposed_CSV is malformed, is missing the expected columns, or cannot be converted into a valid Navigation_Hierarchy, THEN THE Staging_Site SHALL reject the import and display a descriptive validation message.
5. WHEN a Proposed_CSV is successfully converted, THE Nav_Renderer SHALL render the resulting Proposed_Hierarchy with the same production fidelity as a Live_Snapshot.
6. WHEN a Proposed_Hierarchy is being rendered, THE Staging_Site SHALL clearly indicate that the current view is a proposed change rather than the Live_Snapshot.

7. THE CSV_Converter SHALL treat the `old` and `new` cell values as navigation URL paths of the form found in the Live_Snapshot, positioning each affected node in the tree according to its path.
8. WHEN a row has an `old` value and an empty `new` value, THE CSV_Converter SHALL treat the node at the `old` path as removed.
9. WHEN a row has an empty `old` value and a `new` value, THE CSV_Converter SHALL treat the `new` path as a newly added node.
10. WHEN a row has both an `old` value and a `new` value that differ, THE CSV_Converter SHALL treat the node as moved or renamed from the `old` path to the `new` path.

> **DECISION RESOLVED (CSV shape):** Rows contain navigation URL paths matching those in the live JSON. `old` = the node's current path, `new` = its proposed path; empty `new` = remove, empty `old` = add, differing values = move/rename.
>
> **DESIGN-TIME CONFIRMATION (which path field):** The live JSON exposes two path-like fields per node — `seoPath` (hierarchy-shaped, mirrors tree position) and `urlPath` (the destination link, not hierarchy-shaped). The CSV_Converter needs to key node identity and tree placement off the hierarchy-shaped field (`seoPath`) while preserving each node's `urlPath` destination. The design will state this precisely; if the user's CSV paths are `urlPath` values rather than `seoPath` values, the converter's matching strategy changes and must be confirmed during design.

### Requirement 5: Select which brand's navigation to view

**User Story:** As a Colleague, I want to choose which brand I am viewing, so that I can preview navigation per brand.

#### Acceptance Criteria

1. THE Staging_Site SHALL present the configured Brands as selectable options.
2. WHEN a Colleague selects a Brand, THE Staging_Site SHALL render that Brand's Live_Snapshot.
3. WHEN a Colleague switches from one Brand to another Brand, THE Staging_Site SHALL update the rendered navigation to the newly selected Brand's Live_Snapshot.
4. IF the selected Brand's Navigation_Hierarchy cannot be rendered, THEN THE Staging_Site SHALL keep the Brand selectable and display a descriptive message in place of the rendered navigation.

> **DECISION DEFERRED (brand switching):** Per the first-version scope (JD Williams only), the exact brand-switcher behaviour — and whether an imported Proposed_Hierarchy is retained or cleared when the Colleague switches Brand — is deferred until after JD Williams is working. The design SHOULD keep brand selection configuration-driven so this can be revisited without rework.

### Requirement 6: Free hosting on Netlify runnable from GitHub, gated by password

**User Story:** As a Colleague, I want the staging site hosted somewhere free and safe that my colleagues can reach, so that we can review changes without cost or exposing unreleased plans publicly.

#### Acceptance Criteria

1. THE Staging_Site SHALL be deployable to Netlify from a GitHub repository at no hosting cost.
2. WHEN the Snapshot_Job commits an updated Live_Snapshot, THE Staging_Site SHALL serve the updated navigation data on its next deployment or load.
3. THE Staging_Site SHALL be reachable by authorised Colleagues via a shared URL.
4. THE Staging_Site SHALL be gated by Netlify password protection so that only Colleagues with the shared credential can view it.
