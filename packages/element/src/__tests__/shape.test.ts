import { pointFrom, type LocalPoint } from "@excalidraw/math";

import { convertToExcalidrawElements } from "../transform";
import { ShapeCache } from "../shape";

import type { ExcalidrawElementSkeleton } from "../transform";

const convert = (element: ExcalidrawElementSkeleton) =>
  convertToExcalidrawElements([element], { regenerateIds: false })[0];

describe("ShapeCache", () => {
  beforeEach(() => {
    ShapeCache.destroy();
  });

  it("generates a second outline for double-styled closed shapes", () => {
    const rectangle = convert({
      type: "rectangle",
      id: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      strokeStyle: "double",
    });

    if (rectangle.type !== "rectangle") {
      throw new Error("Expected a rectangle element");
    }

    expect(ShapeCache.generateElementShape(rectangle, null)).toHaveLength(2);
  });

  it("generates parallel strokes for double-styled linear elements", () => {
    const line = convert({
      type: "line",
      id: "line",
      x: 0,
      y: 0,
      points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(100, 0)],
      strokeStyle: "double",
    });

    if (line.type !== "line") {
      throw new Error("Expected a line element");
    }

    expect(ShapeCache.generateElementShape(line, null)).toHaveLength(2);
  });
});
