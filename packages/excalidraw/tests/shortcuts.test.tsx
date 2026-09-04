import React from "react";

import { KEYS } from "@excalidraw/common";

import { Excalidraw } from "../index";

import { SHAPES } from "../components/shapes";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { fireEvent, render, waitFor } from "./test-utils";

describe("shortcuts", () => {
  beforeAll(() => {
    // radix popover, used by the color pickers, requires ResizeObserver
    (global as any).ResizeObserver =
      (global as any).ResizeObserver ||
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
  });

  it("Clear canvas shortcut should display confirm dialog", async () => {
    await render(
      <Excalidraw
        initialData={{ elements: [API.createElement({ type: "rectangle" })] }}
        handleKeyboardGlobally
      />,
    );

    expect(window.h.elements.length).toBe(1);

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.keyDown(KEYS.DELETE);
    });
    const confirmDialog = document.querySelector(".confirm-dialog")!;
    expect(confirmDialog).not.toBe(null);

    fireEvent.click(confirmDialog.querySelector('[aria-label="Confirm"]')!);

    await waitFor(() => {
      expect(window.h.elements[0].isDeleted).toBe(true);
    });
  });

  it("tool shortcuts should not collide with unmodified editor shortcuts", () => {
    // tool switching runs before these handlers and returns early, so a tool
    // claiming one of these keys would shadow it
    const reservedKeys = new Map<string, string>([
      [KEYS.G, "background color picker"],
      [KEYS.S, "stroke color picker"],
      [KEYS.I, "background eye dropper"],
      [KEYS.Q, "lock tool toggle"],
      [KEYS.F, "frame tool"],
    ]);

    const conflicts: string[] = [];

    for (const shape of SHAPES) {
      const keys = !shape.key
        ? []
        : typeof shape.key === "string"
        ? [shape.key]
        : shape.key;

      for (const key of keys) {
        const owner = reservedKeys.get(key);

        if (owner) {
          conflicts.push(`"${key}": ${shape.value} tool vs ${owner}`);
        }

        reservedKeys.set(key, shape.value);
      }
    }

    expect(conflicts).toEqual([]);
  });

  it("G should open the background color picker instead of switching tools", async () => {
    const rectangle = API.createElement({ type: "rectangle" });

    await render(
      <Excalidraw
        initialData={{ elements: [rectangle] }}
        handleKeyboardGlobally
      />,
    );

    API.setSelectedElements([rectangle]);

    Keyboard.keyPress(KEYS.G);

    expect(window.h.state.activeTool.type).toBe("selection");
    expect(window.h.state.openPopup).toBe("elementBackground");
  });

  it("triangle tool should be selectable via its own shortcut", async () => {
    const { container } = await render(<Excalidraw handleKeyboardGlobally />);

    Keyboard.keyPress(KEYS.W);

    expect(window.h.state.activeTool.type).toBe("triangle");
    const triangleTool = container.querySelector(
      '[data-testid="toolbar-triangle"]',
    )!;

    expect(triangleTool).toHaveAttribute("aria-keyshortcuts", "W");
    expect(triangleTool.closest("label")).toHaveAttribute(
      "title",
      "Triangle — W",
    );
  });
});
