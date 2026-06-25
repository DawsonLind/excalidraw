import React from "react";

import { STICKY_NOTE_DEFAULTS, resolvablePromise } from "@excalidraw/common";

import { Excalidraw } from "../index";

import { getToolbarTools } from "../components/shapes";

import { Pointer } from "./helpers/ui";
import { getTextEditor } from "./queries/dom";
import { act, render } from "./test-utils";

import type { AppClassProperties, ExcalidrawImperativeAPI } from "../types";

describe("setActiveTool()", () => {
  const h = window.h;

  let excalidrawAPI: ExcalidrawImperativeAPI;

  const mouse = new Pointer("mouse");

  beforeEach(async () => {
    const excalidrawAPIPromise = resolvablePromise<ExcalidrawImperativeAPI>();
    await render(
      <Excalidraw
        onExcalidrawAPI={(api) => excalidrawAPIPromise.resolve(api as any)}
      />,
    );
    excalidrawAPI = await excalidrawAPIPromise;
  });

  it("should expose setActiveTool on package API", () => {
    expect(excalidrawAPI.setActiveTool).toBeDefined();
    expect(excalidrawAPI.setActiveTool).toBe(h.app.setActiveTool);
  });

  it("should set the active tool type", async () => {
    expect(h.state.activeTool.type).toBe("selection");
    act(() => {
      excalidrawAPI.setActiveTool({ type: "rectangle" });
    });
    expect(h.state.activeTool.type).toBe("rectangle");

    mouse.down(10, 10);
    mouse.up(20, 20);

    expect(h.state.activeTool.type).toBe("selection");
  });

  it("should support tool locking", async () => {
    expect(h.state.activeTool.type).toBe("selection");
    act(() => {
      excalidrawAPI.setActiveTool({ type: "rectangle", locked: true });
    });
    expect(h.state.activeTool.type).toBe("rectangle");

    mouse.down(10, 10);
    mouse.up(20, 20);

    expect(h.state.activeTool.type).toBe("rectangle");
  });

  it("should set custom tool", async () => {
    expect(h.state.activeTool.type).toBe("selection");
    act(() => {
      excalidrawAPI.setActiveTool({ type: "custom", customType: "comment" });
    });
    expect(h.state.activeTool.type).toBe("custom");
    expect(h.state.activeTool.customType).toBe("comment");
  });

  it("should create a sticky note with centered bound text", async () => {
    act(() => {
      excalidrawAPI.setActiveTool({ type: "stickynote" });
    });

    mouse.clickAt(120, 140);
    const editor = await getTextEditor();

    expect(editor).not.toBe(null);
    expect(h.elements).toHaveLength(2);
    expect(h.state.activeTool.type).toBe("selection");

    const [container, text] = h.elements;

    expect(container.type).toBe("rectangle");
    if (container.type !== "rectangle") {
      throw new Error("Expected sticky note container to be a rectangle");
    }
    expect(container.x).toBe(120 - STICKY_NOTE_DEFAULTS.width / 2);
    expect(container.y).toBe(140 - STICKY_NOTE_DEFAULTS.height / 2);
    expect(container.width).toBe(STICKY_NOTE_DEFAULTS.width);
    expect(container.height).toBe(STICKY_NOTE_DEFAULTS.height);
    expect(container.strokeColor).toBe(STICKY_NOTE_DEFAULTS.strokeColor);
    expect(container.backgroundColor).toBe(
      STICKY_NOTE_DEFAULTS.backgroundColor,
    );
    expect(container.fillStyle).toBe(STICKY_NOTE_DEFAULTS.fillStyle);
    expect(container.roundness).toEqual(STICKY_NOTE_DEFAULTS.roundness);

    expect(text.type).toBe("text");
    if (text.type !== "text") {
      throw new Error("Expected sticky note to create a bound text element");
    }
    expect(text.containerId).toBe(container.id);
    expect(text.textAlign).toBe("center");
    expect(text.verticalAlign).toBe("middle");
    expect(container.boundElements).toEqual([{ type: "text", id: text.id }]);
    expect(h.state.editingTextElement?.id).toBe(text.id);
  });
});
describe("getToolbarTools()", () => {
  const getToolValues = (preferredSelectionTool: "selection" | "lasso") =>
    getToolbarTools({
      state: {
        preferredSelectionTool: {
          type: preferredSelectionTool,
        },
      },
    } as AppClassProperties).map((tool) => tool.value);

  it("does not include lasso when selection is preferred", () => {
    const toolValues = getToolValues("selection");

    expect(toolValues.filter((value) => value === "selection")).toHaveLength(1);
    expect(toolValues.filter((value) => value === "lasso")).toHaveLength(0);
  });

  it("replaces selection with lasso when lasso is preferred", () => {
    const toolValues = getToolValues("lasso");

    expect(toolValues.filter((value) => value === "lasso")).toHaveLength(1);
    expect(toolValues.filter((value) => value === "selection")).toHaveLength(0);
  });
});
