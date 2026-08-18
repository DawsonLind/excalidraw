import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import {
  DEFAULT_ELEMENT_STROKE_COLOR_PALETTE,
  THEME_COLOR_PALETTES,
} from "@excalidraw/common";

import { EditorJotaiProvider } from "../../editor-jotai";

import { Picker } from "./Picker";

import type { ColorPickerType } from "./colorPickerUtils";

const renderPicker = (type: ColorPickerType = "elementStroke") => {
  const onChange = vi.fn();

  const TestPicker = () => {
    const [color, setColor] = useState<string>(
      DEFAULT_ELEMENT_STROKE_COLOR_PALETTE.red[4],
    );

    return (
      <Picker
        color={color}
        onChange={(nextColor) => {
          setColor(nextColor);
          onChange(nextColor);
        }}
        type={type}
        elements={[]}
        palette={DEFAULT_ELEMENT_STROKE_COLOR_PALETTE}
        updateData={vi.fn()}
        onEyeDropperToggle={vi.fn()}
        onEscape={vi.fn()}
      />
    );
  };

  return {
    onChange,
    ...render(
      <EditorJotaiProvider>
        <TestPicker />
      </EditorJotaiProvider>,
    ),
  };
};

describe("Picker palette presets", () => {
  it.each(["elementStroke", "elementBackground"] as const)(
    "shows accessible presets for the %s picker",
    (type) => {
      renderPicker(type);

      expect(
        screen.getByRole("group", { name: "Palette presets" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Default palette" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Pastel palette" }),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Neon palette" })).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Earth palette" }),
      ).toBeTruthy();
    },
  );

  it("keeps palette presets out of the canvas background picker", () => {
    renderPicker("canvasBackground");

    expect(screen.queryByRole("group", { name: "Palette presets" })).toBeNull();
  });

  it("swaps swatches and restores the incoming palette", () => {
    const { onChange } = renderPicker();
    const redSwatch = () => screen.getByTestId("color-red");
    const swatchColor = () =>
      redSwatch().style.getPropertyValue("--swatch-color");

    expect(swatchColor()).toBe(DEFAULT_ELEMENT_STROKE_COLOR_PALETTE.red[4]);

    fireEvent.click(screen.getByRole("button", { name: "Pastel palette" }));

    expect(swatchColor()).toBe(THEME_COLOR_PALETTES.pastel.red[4]);
    expect(
      screen
        .getByRole("button", { name: "Pastel palette" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(redSwatch());

    expect(onChange).toHaveBeenLastCalledWith(
      THEME_COLOR_PALETTES.pastel.red[4],
    );
    expect(
      screen
        .getAllByRole("button", { name: "Shade" })[0]
        .style.getPropertyValue("--swatch-color"),
    ).toBe(THEME_COLOR_PALETTES.pastel.red[0]);

    fireEvent.click(screen.getByRole("button", { name: "Default palette" }));

    expect(swatchColor()).toBe(DEFAULT_ELEMENT_STROKE_COLOR_PALETTE.red[4]);
  });

  it("uses the active palette for color and shade keyboard shortcuts", () => {
    const { onChange } = renderPicker();
    const pickerContent = screen
      .getByRole("dialog", { name: "Color picker" })
      .querySelector<HTMLElement>(".color-picker-content")!;

    fireEvent.click(screen.getByRole("button", { name: "Neon palette" }));
    fireEvent.keyDown(pickerContent, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Neon palette" }),
    );

    fireEvent.keyDown(pickerContent, { key: "s" });

    expect(onChange).toHaveBeenLastCalledWith(
      THEME_COLOR_PALETTES.neon.blue[4],
    );

    fireEvent.keyDown(pickerContent, {
      key: "!",
      code: "Digit1",
      shiftKey: true,
    });

    expect(onChange).toHaveBeenLastCalledWith(
      THEME_COLOR_PALETTES.neon.blue[0],
    );
  });
});
