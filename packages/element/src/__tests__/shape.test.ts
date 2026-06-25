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

    expect(ShapeCache.generateElementShape(rectangle, null)).toHaveLength(2);
  });

  it("generates parallel strokes for double-styled linear elements", () => {
    const line = convert({
      type: "line",
      id: "line",
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [100, 0],
      ],
      strokeStyle: "double",
    });

    expect(ShapeCache.generateElementShape(line, null)).toHaveLength(2);
  });
});
