import clsx from "clsx";
import { useEffect, useRef } from "react";

import {
  THEME_COLOR_PALETTE_NAMES,
  THEME_COLOR_PALETTES,
} from "@excalidraw/common";

import type {
  ColorPaletteCustom,
  ColorPalettePresetName,
} from "@excalidraw/common";

import { useAtom } from "../../editor-jotai";
import { t } from "../../i18n";

import { activeColorPickerSectionAtom } from "./colorPickerUtils";

import type { TranslationKeys } from "../../i18n";

const PALETTE_PREVIEW_KEYS = ["red", "yellow", "green", "blue"] as const;

const PALETTE_LABEL_KEYS: Record<ColorPalettePresetName, TranslationKeys> = {
  default: "colorPicker.palettePresets.default",
  pastel: "colorPicker.palettePresets.pastel",
  neon: "colorPicker.palettePresets.neon",
  earth: "colorPicker.palettePresets.earth",
};

const getPalettePreviewColors = (palette: ColorPaletteCustom) => {
  const getPreviewColor = (value: ColorPaletteCustom[string]) =>
    Array.isArray(value) ? value[2] : value;
  const preferredColors = PALETTE_PREVIEW_KEYS.map((key) => palette[key])
    .filter((value): value is ColorPaletteCustom[string] => !!value)
    .map(getPreviewColor);
  const fallbackColors = Object.values(palette)
    .map(getPreviewColor)
    .filter((color) => color !== "transparent");

  return [...preferredColors, ...fallbackColors].slice(0, 4);
};

interface PalettePresetsProps {
  activePalette: ColorPalettePresetName;
  defaultPalette: ColorPaletteCustom;
  onSelect: (palette: ColorPalettePresetName) => void;
}

export const PalettePresets = ({
  activePalette,
  defaultPalette,
  onSelect,
}: PalettePresetsProps) => {
  const [activeColorPickerSection, setActiveColorPickerSection] = useAtom(
    activeColorPickerSectionAtom,
  );
  const activeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeColorPickerSection === "palettePresets") {
      activeButtonRef.current?.focus();
    }
  }, [activeColorPickerSection, activePalette]);

  const presets = [
    { name: "default" as const, palette: defaultPalette },
    ...THEME_COLOR_PALETTE_NAMES.map((name) => ({
      name,
      palette: THEME_COLOR_PALETTES[name],
    })),
  ];

  return (
    <div
      className="color-picker__palette-presets"
      role="group"
      aria-label={t("colorPicker.palettePresets.label")}
    >
      {presets.map(({ name, palette }) => {
        const label = t(PALETTE_LABEL_KEYS[name]);

        return (
          <button
            ref={activePalette === name ? activeButtonRef : undefined}
            type="button"
            tabIndex={-1}
            className={clsx("color-picker__palette-preset", {
              active: activePalette === name,
            })}
            aria-label={label}
            aria-pressed={activePalette === name}
            title={label}
            data-testid={`color-palette-${name}`}
            onFocus={() => setActiveColorPickerSection("palettePresets")}
            onClick={() => onSelect(name)}
            key={name}
          >
            <span
              className="color-picker__palette-preset-swatches"
              aria-hidden="true"
            >
              {getPalettePreviewColors(palette).map((color, index) => (
                <span
                  className="color-picker__palette-preset-swatch"
                  style={{ backgroundColor: color }}
                  key={`${color}-${index}`}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
};
