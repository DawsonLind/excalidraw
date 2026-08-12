import {
  THEME,
  THEME_IDS,
  getNextTheme,
  getThemeAppearance,
  getThemeClassNames,
  isDarkTheme,
  isTheme,
  parseTheme,
} from "@excalidraw/common";

describe("theme registry", () => {
  it("parses known theme ids", () => {
    expect(parseTheme(THEME.DARK)).toBe(THEME.DARK);
    expect(parseTheme("paper")).toBe(THEME.PAPER);
    expect(parseTheme("high-contrast")).toBe(THEME.HIGH_CONTRAST);
  });

  it("falls back for unknown and host-only values", () => {
    expect(parseTheme("system")).toBe(THEME.LIGHT);
    expect(parseTheme("nope")).toBe(THEME.LIGHT);
    expect(parseTheme(null)).toBe(THEME.LIGHT);
    expect(parseTheme(undefined, THEME.DARK)).toBe(THEME.DARK);
  });

  it("does not treat system as a theme id", () => {
    expect(isTheme("system")).toBe(false);
  });

  it("derives appearance from the registry", () => {
    expect(getThemeAppearance(THEME.PAPER)).toBe("light");
    expect(getThemeAppearance(THEME.HIGH_CONTRAST)).toBe("light");
    expect(getThemeAppearance(THEME.MIDNIGHT)).toBe("dark");
    expect(getThemeAppearance(THEME.FOREST)).toBe("dark");
    expect(isDarkTheme(THEME.LIGHT)).toBe(false);
    expect(isDarkTheme(THEME.MIDNIGHT)).toBe(true);
  });

  it("cycles through registered themes", () => {
    expect(getNextTheme(THEME.LIGHT)).toBe(THEME.DARK);
    expect(getNextTheme(THEME_IDS[THEME_IDS.length - 1])).toBe(THEME.LIGHT);
  });

  it("keeps theme--dark for dark appearance and adds palette classes", () => {
    expect(getThemeClassNames(THEME.LIGHT)).toEqual([]);
    expect(getThemeClassNames(THEME.DARK)).toEqual(["theme--dark"]);
    expect(getThemeClassNames(THEME.PAPER)).toEqual(["theme--paper"]);
    expect(getThemeClassNames(THEME.MIDNIGHT)).toEqual([
      "theme--dark",
      "theme--midnight",
    ]);
  });
});
