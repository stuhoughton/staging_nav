import { describe, expect, it } from "vitest";
import { BRANDS } from "../../config/brands";
import { THEMES, defaultTheme, getTheme, jdWilliamsTheme, themeToCssVars } from "./themes";
import type { BrandTheme } from "./types";

describe("theme registry", () => {
  it("registers the JD Williams theme keyed by its themeId", () => {
    expect(THEMES.jdwilliams).toBe(jdWilliamsTheme);
    expect(jdWilliamsTheme.id).toBe("jdwilliams");
  });

  it("the registry key matches each registered theme's own id", () => {
    for (const [key, theme] of Object.entries(THEMES)) {
      expect(theme.id).toBe(key);
    }
  });

  it("the JD Williams config themeId resolves to a registered theme", () => {
    const jd = BRANDS.find((b) => b.id === "jdwilliams");
    expect(jd).toBeDefined();
    expect(getTheme(jd?.themeId)).toBe(jdWilliamsTheme);
  });
});

describe("getTheme lookup and fallback", () => {
  it("returns the registered theme when the themeId is known", () => {
    expect(getTheme("jdwilliams")).toBe(jdWilliamsTheme);
  });

  it("falls back to the default theme for an unknown themeId", () => {
    expect(getTheme("jacamo")).toBe(defaultTheme);
    expect(getTheme("not-a-real-theme")).toBe(defaultTheme);
  });

  it("falls back to the default theme when themeId is undefined", () => {
    expect(getTheme(undefined)).toBe(defaultTheme);
  });

  it("does not resolve inherited object properties as themes", () => {
    // Guards against prototype keys like "toString"/"constructor" leaking through.
    expect(getTheme("toString")).toBe(defaultTheme);
    expect(getTheme("constructor")).toBe(defaultTheme);
  });

  it("always returns a complete, valid theme", () => {
    for (const id of ["jdwilliams", "unknown", undefined]) {
      const theme: BrandTheme = getTheme(id);
      expect(theme.id).toBeTruthy();
      expect(theme.name).toBeTruthy();
      expect(theme.colors.primary).toBeTruthy();
      expect(theme.fonts.body).toBeTruthy();
      expect(theme.spacing.md).toBeTruthy();
      expect(theme.logo.src).toBeTruthy();
      expect(theme.logo.alt).toBeTruthy();
    }
  });
});

describe("themeToCssVars", () => {
  it("maps theme values onto namespaced CSS custom properties", () => {
    const vars = themeToCssVars(jdWilliamsTheme) as Record<string, string>;
    expect(vars["--nav-color-primary"]).toBe(jdWilliamsTheme.colors.primary);
    expect(vars["--nav-color-accent"]).toBe(jdWilliamsTheme.colors.accent);
    expect(vars["--nav-font-heading"]).toBe(jdWilliamsTheme.fonts.heading);
    expect(vars["--nav-space-md"]).toBe(jdWilliamsTheme.spacing.md);
  });

  it("emits only nav-namespaced custom properties", () => {
    const vars = themeToCssVars(jdWilliamsTheme) as Record<string, string>;
    for (const key of Object.keys(vars)) {
      expect(key.startsWith("--nav-")).toBe(true);
    }
  });
});
