import fs from "fs";
import path from "path";

import { THEME_IDS, THEME_REGISTRY, isDarkTheme } from "@excalidraw/common";

import { STORAGE_KEYS } from "../app_constants";

const indexHtml = fs.readFileSync(
  path.resolve(__dirname, "../index.html"),
  "utf8",
);

const bootScript = indexHtml.match(
  /<script>([\s\S]*?DARK_THEME_BACKGROUNDS[\s\S]*?)<\/script>/,
)?.[1];

const runBootScript = (storedTheme: string | null) => {
  document.documentElement.className = "";
  document.documentElement.style.backgroundColor = "";

  if (storedTheme === null) {
    localStorage.removeItem(STORAGE_KEYS.LOCAL_STORAGE_THEME);
  } else {
    localStorage.setItem(STORAGE_KEYS.LOCAL_STORAGE_THEME, storedTheme);
  }

  // eslint-disable-next-line no-new-func
  new Function(bootScript!)();

  return {
    isDark: document.documentElement.classList.contains("dark"),
    background: document.documentElement.style.backgroundColor,
  };
};

const toRgb = (hex: string) => {
  const probe = document.createElement("div");
  probe.style.backgroundColor = hex;
  return probe.style.backgroundColor;
};

describe("index.html early theme script", () => {
  it("is present in index.html", () => {
    expect(bootScript).toBeTruthy();
  });

  it("mirrors the background of every dark theme in the registry", () => {
    const declaration = bootScript!.match(
      /DARK_THEME_BACKGROUNDS = \{([^}]*)\}/,
    );

    const mirrored = Object.fromEntries(
      [...declaration![1].matchAll(/([\w-]+):\s*"(#[0-9a-f]{3,8})"/g)].map(
        ([, id, background]) => [id, background],
      ),
    );

    expect(mirrored).toEqual(
      Object.fromEntries(
        THEME_IDS.filter(isDarkTheme).map((id) => [
          id,
          THEME_REGISTRY[id].swatch,
        ]),
      ),
    );
  });

  it.each(THEME_IDS.filter(isDarkTheme))(
    "marks a stored %s theme as dark",
    (theme) => {
      expect(runBootScript(theme)).toEqual({
        isDark: true,
        background: toRgb(THEME_REGISTRY[theme].swatch),
      });
    },
  );

  it.each(THEME_IDS.filter((theme) => !isDarkTheme(theme)))(
    "leaves a stored %s theme light",
    (theme) => {
      expect(runBootScript(theme)).toEqual({ isDark: false, background: "" });
    },
  );

  it("falls back to light for missing and unknown values", () => {
    expect(runBootScript(null)).toEqual({ isDark: false, background: "" });
    expect(runBootScript("nope")).toEqual({ isDark: false, background: "" });
    // `system` resolves via matchMedia, which reports light in tests
    expect(runBootScript("system")).toEqual({ isDark: false, background: "" });
  });

  it("does not treat inherited object keys as themes", () => {
    expect(runBootScript("constructor")).toEqual({
      isDark: false,
      background: "",
    });
  });
});
