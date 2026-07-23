import "@testing-library/jest-dom/vitest";
import fc from "fast-check";

// Cap the number of generated examples per property globally so the
// property-based (fast-check) suite runs faster than the default 100 runs.
// Individual tests can still override this locally via
// fc.assert(prop, { numRuns: ... }) when a specific test needs more coverage.
fc.configureGlobal({ numRuns: 25 });
