import { simplify } from "points-on-curve";
import { getStroke } from "perfect-freehand";
import { LaserPointer } from "@excalidraw/laser-pointer";

import {
  type GeometricShape,
  getClosedCurveShape,
  getCurveShape,
  getEllipseShape,
  getFreedrawShape,
  getPolygonShape,
} from "@excalidraw/utils/shape";

import {
  pointFrom,
  pointDistance,
  type LocalPoint,
  pointRotateRads,
} from "@excalidraw/math";
import {
  ROUGHNESS,
  THEME,
  isTransparent,
  assertNever,
  COLOR_PALETTE,
  LINE_POLYGON_POINT_MERGE_DISTANCE,
  applyDarkModeFilter,
  DEFAULT_STROKE_STREAMLINE,
} from "@excalidraw/common";

import { RoughGenerator } from "roughjs/bin/generator";

import type { GlobalPoint } from "@excalidraw/math";

import type { Mutable } from "@excalidraw/common/utility-types";

import type {
  AppState,
  EmbedsValidationStatus,
} from "@excalidraw/excalidraw/types";
import type {
  ElementShape,
  ElementShapes,
  SVGPathString,
} from "@excalidraw/excalidraw/scene/types";

import { elementWithCanvasCache } from "./renderElement";

import {
  canBecomePolygon,
  isElbowArrow,
  isEmbeddableElement,
  isIframeElement,
  isIframeLikeElement,
  isLinearElement,
} from "./typeChecks";
import { getCornerRadius, isPathALoop } from "./utils";
import { headingForPointIsHorizontal } from "./heading";

import { canChangeRoundness } from "./comparisons";
import {
  elementCenterPoint,
  getArrowheadPoints,
  getDiamondPoints,
  getElementAbsoluteCoords,
} from "./bounds";
import { shouldTestInside } from "./collision";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  ExcalidrawSelectionElement,
  ExcalidrawLinearElement,
  ExcalidrawFreeDrawElement,
  ElementsMap,
  ExcalidrawLineElement,
  Arrowhead,
} from "./types";

import type { Drawable, Options } from "roughjs/bin/core";
import type { Point as RoughPoint } from "roughjs/bin/geometry";

export class ShapeCache {
  private static rg = new RoughGenerator();
  private static cache = new WeakMap<
    ExcalidrawElement,
    { shape: ElementShape; theme: AppState["theme"] }
  >();

  /**
   * Retrieves shape from cache if available. Use this only if shape
   * is optional and you have a fallback in case it's not cached.
   */
  public static get = <T extends ExcalidrawElement>(
    element: T,
    theme: AppState["theme"] | null,
  ) => {
    const cached = ShapeCache.cache.get(element);
    if (cached && (theme === null || cached.theme === theme)) {
      return cached.shape as T["type"] extends keyof ElementShapes
        ? ElementShapes[T["type"]] | undefined
        : ElementShape | undefined;
    }
    return undefined;
  };

  public static delete = (element: ExcalidrawElement) => {
    ShapeCache.cache.delete(element);
    elementWithCanvasCache.delete(element);
  };

  public static destroy = () => {
    ShapeCache.cache = new WeakMap();
  };

  /**
   * Generates & caches shape for element if not already cached, otherwise
   * returns cached shape.
   */
  public static generateElementShape = <
    T extends Exclude<ExcalidrawElement, ExcalidrawSelectionElement>,
  >(
    element: T,
    renderConfig: {
      isExporting: boolean;
      canvasBackgroundColor: AppState["viewBackgroundColor"];
      embedsValidationStatus: EmbedsValidationStatus;
      theme: AppState["theme"];
    } | null,
  ) => {
    // when exporting, always regenerated to guarantee the latest shape
    const cachedShape = renderConfig?.isExporting
      ? undefined
      : ShapeCache.get(element, renderConfig ? renderConfig.theme : null);

    // `null` indicates no rc shape applicable for this element type,
    // but it's considered a valid cache value (= do not regenerate)
    if (cachedShape !== undefined) {
      return cachedShape;
    }

    elementWithCanvasCache.delete(element);

    const shape = _generateElementShape(
      element,
      ShapeCache.rg,
      renderConfig || {
        isExporting: false,
        canvasBackgroundColor: COLOR_PALETTE.white,
        embedsValidationStatus: null,
        theme: THEME.LIGHT,
      },
    ) as T["type"] extends keyof ElementShapes
      ? ElementShapes[T["type"]]
      : Drawable | null;

    if (!renderConfig?.isExporting) {
      ShapeCache.cache.set(element, {
        shape,
        theme: renderConfig?.theme || THEME.LIGHT,
      });
    }

    return shape;
  };
}

const getDashArrayDashed = (strokeWidth: number) => [8, 8 + strokeWidth];

const getDashArrayDotted = (strokeWidth: number) => [1.5, 6 + strokeWidth];

const getDoubleStrokeOffset = (strokeWidth: number) =>
  Math.max(3, strokeWidth * 2.5);

const withoutFill = (options: Options): Options => {
  const outlineOptions = { ...options };
  delete outlineOptions.fill;
  delete outlineOptions.fillStyle;
  return outlineOptions;
};

const withoutStroke = (options: Options): Options => ({
  ...options,
  stroke: "none",
});

const getInset = (width: number, height: number, offset: number) =>
  Math.min(offset, Math.max(0, Math.min(width, height) / 2 - 1));

const getInsetDiamondPoints = (
  element: ExcalidrawElement,
  offset: number,
): RoughPoint[] | null => {
  const inset = getInset(element.width, element.height, offset);
  if (!inset) {
    return null;
  }
  const width = element.width - inset * 2;
  const height = element.height - inset * 2;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return [
    [inset + width / 2, inset],
    [inset + width, inset + height / 2],
    [inset + width / 2, inset + height],
    [inset, inset + height / 2],
  ];
};

const getOffsetLinearPoints = (
  points: readonly LocalPoint[],
  offset: number,
): [RoughPoint[], RoughPoint[]] | null => {
  if (points.length < 2) {
    return null;
  }

  const getOffsetPoint = (
    index: number,
    direction: 1 | -1,
  ): RoughPoint => {
    const prev = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const length = Math.hypot(dx, dy) || 1;
    const nx = (-dy / length) * offset * direction;
    const ny = (dx / length) * offset * direction;

    return [points[index][0] + nx, points[index][1] + ny];
  };

  return [
    points.map((_, index) => getOffsetPoint(index, 1)),
    points.map((_, index) => getOffsetPoint(index, -1)),
  ];
};

const getInsetLinearPoints = (
  points: readonly LocalPoint[],
  offset: number,
): RoughPoint[] => {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const inset = getInset(width, height, offset);
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;
  const scaleX = width ? Math.max(0, width - inset * 2) / width : 1;
  const scaleY = height ? Math.max(0, height - inset * 2) / height : 1;

  return points.map((point) => [
    centerX + (point[0] - centerX) * scaleX,
    centerY + (point[1] - centerY) * scaleY,
  ]);
};

function adjustRoughness(element: ExcalidrawElement): number {
  const roughness = element.roughness;

  const maxSize = Math.max(element.width, element.height);
  const minSize = Math.min(element.width, element.height);

  // don't reduce roughness if
  if (
    // both sides relatively big
    (minSize >= 20 && maxSize >= 50) ||
    // is round & both sides above 15px
    (minSize >= 15 &&
      !!element.roundness &&
      canChangeRoundness(element.type)) ||
    // relatively long linear element
    (isLinearElement(element) && maxSize >= 50)
  ) {
    return roughness;
  }

  return Math.min(roughness / (maxSize < 10 ? 3 : 2), 2.5);
}

export const generateRoughOptions = (
  element: ExcalidrawElement,
  continuousPath = false,
  isDarkMode: boolean = false,
): Options => {
  const hasDashedStroke = element.strokeStyle === "dashed";
  const hasDottedStroke = element.strokeStyle === "dotted";

  const options: Options = {
    seed: element.seed,
    strokeLineDash: hasDashedStroke
      ? getDashArrayDashed(element.strokeWidth)
      : hasDottedStroke
      ? getDashArrayDotted(element.strokeWidth)
      : undefined,
    // for non-solid strokes, disable multiStroke because it tends to make
    // dashes/dots overlay each other. Double lines use separate paths.
    disableMultiStroke: element.strokeStyle !== "solid",
    // for non-solid strokes, increase the width a bit to make it visually
    // similar to solid strokes, because we're also disabling multiStroke
    strokeWidth: hasDashedStroke || hasDottedStroke
      ? element.strokeWidth + 0.5
      : element.strokeWidth,
    // when increasing strokeWidth, we must explicitly set fillWeight and
    // hachureGap because if not specified, roughjs uses strokeWidth to
    // calculate them (and we don't want the fills to be modified)
    fillWeight: element.strokeWidth / 2,
    hachureGap: element.strokeWidth * 4,
    roughness: adjustRoughness(element),
    stroke: applyDarkModeFilter(element.strokeColor, isDarkMode),
    preserveVertices:
      continuousPath || element.roughness < ROUGHNESS.cartoonist,
  };

  switch (element.type) {
    case "rectangle":
    case "iframe":
    case "embeddable":
    case "diamond":
    case "ellipse": {
      options.fillStyle = element.fillStyle;
      options.fill = isTransparent(element.backgroundColor)
        ? undefined
        : applyDarkModeFilter(element.backgroundColor, isDarkMode);
      if (element.type === "ellipse") {
        options.curveFitting = 1;
      }
      return options;
    }
    case "line":
    case "freedraw": {
      if (isPathALoop(element.points)) {
        options.fillStyle = element.fillStyle;
        options.fill =
          element.backgroundColor === "transparent"
            ? undefined
            : applyDarkModeFilter(element.backgroundColor, isDarkMode);
      }
      return options;
    }
    case "arrow":
      return options;
    default: {
      throw new Error(`Unimplemented type ${element.type}`);
    }
  }
};

const modifyIframeLikeForRoughOptions = (
  element: NonDeletedExcalidrawElement,
  isExporting: boolean,
  embedsValidationStatus: EmbedsValidationStatus | null,
) => {
  if (
    isIframeLikeElement(element) &&
    (isExporting ||
      (isEmbeddableElement(element) &&
        embedsValidationStatus?.get(element.id) !== true)) &&
    isTransparent(element.backgroundColor) &&
    isTransparent(element.strokeColor)
  ) {
    return {
      ...element,
      roughness: 0,
      backgroundColor: "#d3d3d3",
      fillStyle: "solid",
    } as const;
  } else if (isIframeElement(element)) {
    return {
      ...element,
      strokeColor: isTransparent(element.strokeColor)
        ? "#000000"
        : element.strokeColor,
      backgroundColor: isTransparent(element.backgroundColor)
        ? "#f4f4f6"
        : element.backgroundColor,
    };
  }
  return element;
};

const generateArrowheadCardinalityOne = (
  generator: RoughGenerator,
  arrowheadPoints: number[] | null,
  lineOptions: Options,
) => {
  if (arrowheadPoints === null) {
    return [];
  }

  const [, , x3, y3, x4, y4] = arrowheadPoints;

  return [generator.line(x3, y3, x4, y4, lineOptions)];
};

const generateArrowheadLinesToTip = (
  generator: RoughGenerator,
  arrowheadPoints: number[] | null,
  lineOptions: Options,
) => {
  if (arrowheadPoints === null) {
    return [];
  }

  const [x2, y2, x3, y3, x4, y4] = arrowheadPoints;

  return [
    generator.line(x3, y3, x2, y2, lineOptions),
    generator.line(x4, y4, x2, y2, lineOptions),
  ];
};

const getArrowheadLineOptions = (
  element: ExcalidrawLinearElement,
  options: Options,
) => {
  const lineOptions = { ...options };

  if (element.strokeStyle === "dotted") {
    // for dotted arrows caps, reduce gap to make it more legible
    const dash = getDashArrayDotted(element.strokeWidth - 1);
    lineOptions.strokeLineDash = [dash[0], dash[1] - 1];
  } else {
    // for solid/dashed, keep solid arrow cap
    delete lineOptions.strokeLineDash;
  }
  lineOptions.roughness = Math.min(1, lineOptions.roughness || 0);

  return lineOptions;
};

const generateArrowheadOutlineCircle = (
  generator: RoughGenerator,
  options: Options,
  strokeColor: string,
  arrowheadPoints: number[] | null,
  fill: string,
  diameterScale = 1,
) => {
  if (arrowheadPoints === null) {
    return [];
  }

  const [x, y, diameter] = arrowheadPoints;
  const circleOptions = {
    ...options,
    fill,
    fillStyle: "solid" as const,
    stroke: strokeColor,
    roughness: Math.min(0.5, options.roughness || 0),
  };

  delete circleOptions.strokeLineDash;

  return [generator.circle(x, y, diameter * diameterScale, circleOptions)];
};

const getArrowheadShapes = (
  element: ExcalidrawLinearElement,
  shape: Drawable[],
  position: "start" | "end",
  arrowhead: Arrowhead,
  generator: RoughGenerator,
  options: Options,
  canvasBackgroundColor: string,
  isDarkMode: boolean,
) => {
  if (arrowhead === null) {
    return [];
  }

  const strokeColor = applyDarkModeFilter(element.strokeColor, isDarkMode);
  const backgroundFillColor = applyDarkModeFilter(
    canvasBackgroundColor,
    isDarkMode,
  );
  const cardinalityOneOrManyOffset = -0.25;
  const cardinalityZeroCircleScale = 0.8;

  switch (arrowhead) {
    case "circle":
    case "circle_outline": {
      return generateArrowheadOutlineCircle(
        generator,
        options,
        strokeColor,
        getArrowheadPoints(element, shape, position, arrowhead),
        arrowhead === "circle_outline" ? backgroundFillColor : strokeColor,
      );
    }
    case "triangle":
    case "triangle_outline": {
      const arrowheadPoints = getArrowheadPoints(
        element,
        shape,
        position,
        arrowhead,
      );

      if (arrowheadPoints === null) {
        return [];
      }

      const [x, y, x2, y2, x3, y3] = arrowheadPoints;
      const triangleOptions = {
        ...options,
        fill:
          arrowhead === "triangle_outline" ? backgroundFillColor : strokeColor,
        fillStyle: "solid" as const,
        roughness: Math.min(1, options.roughness || 0),
      };

      // always use solid stroke for arrowhead
      delete triangleOptions.strokeLineDash;

      return [
        generator.polygon(
          [
            [x, y],
            [x2, y2],
            [x3, y3],
            [x, y],
          ],
          triangleOptions,
        ),
      ];
    }
    case "diamond":
    case "diamond_outline": {
      const arrowheadPoints = getArrowheadPoints(
        element,
        shape,
        position,
        arrowhead,
      );

      if (arrowheadPoints === null) {
        return [];
      }

      const [x, y, x2, y2, x3, y3, x4, y4] = arrowheadPoints;
      const diamondOptions = {
        ...options,
        fill:
          arrowhead === "diamond_outline" ? backgroundFillColor : strokeColor,
        fillStyle: "solid" as const,
        roughness: Math.min(1, options.roughness || 0),
      };

      // always use solid stroke for arrowhead
      delete diamondOptions.strokeLineDash;

      return [
        generator.polygon(
          [
            [x, y],
            [x2, y2],
            [x3, y3],
            [x4, y4],
            [x, y],
          ],
          diamondOptions,
        ),
      ];
    }
    case "cardinality_one":
      return generateArrowheadCardinalityOne(
        generator,
        getArrowheadPoints(element, shape, position, arrowhead),
        getArrowheadLineOptions(element, options),
      );
    case "cardinality_many":
      return generateArrowheadLinesToTip(
        generator,
        getArrowheadPoints(element, shape, position, arrowhead),
        getArrowheadLineOptions(element, options),
      );
    case "cardinality_one_or_many": {
      const lineOptions = getArrowheadLineOptions(element, options);

      return [
        ...generateArrowheadLinesToTip(
          generator,
          getArrowheadPoints(element, shape, position, "cardinality_many"),
          lineOptions,
        ),
        ...generateArrowheadCardinalityOne(
          generator,
          getArrowheadPoints(
            element,
            shape,
            position,
            "cardinality_one",
            cardinalityOneOrManyOffset,
          ),
          lineOptions,
        ),
      ];
    }
    case "cardinality_exactly_one": {
      const lineOptions = getArrowheadLineOptions(element, options);

      return [
        ...generateArrowheadCardinalityOne(
          generator,
          getArrowheadPoints(element, shape, position, "cardinality_one", -0.5),
          lineOptions,
        ),
        ...generateArrowheadCardinalityOne(
          generator,
          getArrowheadPoints(element, shape, position, "cardinality_one"),
          lineOptions,
        ),
      ];
    }
    case "cardinality_zero_or_one": {
      const lineOptions = getArrowheadLineOptions(element, options);

      return [
        ...generateArrowheadOutlineCircle(
          generator,
          options,
          strokeColor,
          getArrowheadPoints(element, shape, position, "circle_outline", 1.5),
          backgroundFillColor,
          cardinalityZeroCircleScale,
        ),
        ...generateArrowheadCardinalityOne(
          generator,
          getArrowheadPoints(element, shape, position, "cardinality_one", -0.5),
          lineOptions,
        ),
      ];
    }
    case "cardinality_zero_or_many": {
      const lineOptions = getArrowheadLineOptions(element, options);

      return [
        ...generateArrowheadLinesToTip(
          generator,
          getArrowheadPoints(element, shape, position, "cardinality_many"),
          lineOptions,
        ),
        ...generateArrowheadOutlineCircle(
          generator,
          options,
          strokeColor,
          getArrowheadPoints(element, shape, position, "circle_outline", 1.5),
          backgroundFillColor,
          cardinalityZeroCircleScale,
        ),
      ];
    }
    case "bar":
    case "arrow":
    default: {
      return generateArrowheadLinesToTip(
        generator,
        getArrowheadPoints(element, shape, position, arrowhead),
        getArrowheadLineOptions(element, options),
      );
    }
  }
};

export const generateLinearCollisionShape = (
  element: ExcalidrawLinearElement | ExcalidrawFreeDrawElement,
  elementsMap: ElementsMap,
): {
  op: string;
  data: number[];
}[] => {
  const generator = new RoughGenerator();
  const options: Options = {
    seed: element.seed,
    disableMultiStroke: true,
    disableMultiStrokeFill: true,
    roughness: 0,
    preserveVertices: true,
  };
  const center = elementCenterPoint(element, elementsMap);

  switch (element.type) {
    case "line":
    case "arrow": {
      // points array can be empty in the beginning, so it is important to add
      // initial position to it
      const points = element.points.length
        ? element.points
        : [pointFrom<LocalPoint>(0, 0)];

      if (isElbowArrow(element)) {
        return generator.path(generateElbowArrowShape(points, 16), options)
          .sets[0].ops;
      } else if (!element.roundness) {
        return points.map((point, idx) => {
          const p = pointRotateRads(
            pointFrom<GlobalPoint>(element.x + point[0], element.y + point[1]),
            center,
            element.angle,
          );

          return {
            op: idx === 0 ? "move" : "lineTo",
            data: pointFrom<LocalPoint>(p[0] - element.x, p[1] - element.y),
          };
        });
      }

      return generator
        .curve(points as unknown as RoughPoint[], options)
        .sets[0].ops.slice(0, element.points.length)
        .map((op, i) => {
          if (i === 0) {
            const p = pointRotateRads<GlobalPoint>(
              pointFrom<GlobalPoint>(
                element.x + op.data[0],
                element.y + op.data[1],
              ),
              center,
              element.angle,
            );

            return {
              op: "move",
              data: pointFrom<LocalPoint>(p[0] - element.x, p[1] - element.y),
            };
          }

          return {
            op: "bcurveTo",
            data: [
              pointRotateRads(
                pointFrom<GlobalPoint>(
                  element.x + op.data[0],
                  element.y + op.data[1],
                ),
                center,
                element.angle,
              ),
              pointRotateRads(
                pointFrom<GlobalPoint>(
                  element.x + op.data[2],
                  element.y + op.data[3],
                ),
                center,
                element.angle,
              ),
              pointRotateRads(
                pointFrom<GlobalPoint>(
                  element.x + op.data[4],
                  element.y + op.data[5],
                ),
                center,
                element.angle,
              ),
            ]
              .map((p) =>
                pointFrom<LocalPoint>(p[0] - element.x, p[1] - element.y),
              )
              .flat(),
          };
        });
    }
    case "freedraw": {
      if (element.points.length < 2) {
        return [];
      }

      const simplifiedPoints = simplify(
        element.points as Mutable<LocalPoint[]>,
        0.75,
      );

      return generator
        .curve(simplifiedPoints as [number, number][], options)
        .sets[0].ops.slice(0, element.points.length)
        .map((op, i) => {
          if (i === 0) {
            const p = pointRotateRads<GlobalPoint>(
              pointFrom<GlobalPoint>(
                element.x + op.data[0],
                element.y + op.data[1],
              ),
              center,
              element.angle,
            );

            return {
              op: "move",
              data: pointFrom<LocalPoint>(p[0] - element.x, p[1] - element.y),
            };
          }

          return {
            op: "bcurveTo",
            data: [
              pointRotateRads(
                pointFrom<GlobalPoint>(
                  element.x + op.data[0],
                  element.y + op.data[1],
                ),
                center,
                element.angle,
              ),
              pointRotateRads(
                pointFrom<GlobalPoint>(
                  element.x + op.data[2],
                  element.y + op.data[3],
                ),
                center,
                element.angle,
              ),
              pointRotateRads(
                pointFrom<GlobalPoint>(
                  element.x + op.data[4],
                  element.y + op.data[5],
                ),
                center,
                element.angle,
              ),
            ]
              .map((p) =>
                pointFrom<LocalPoint>(p[0] - element.x, p[1] - element.y),
              )
              .flat(),
          };
        });
    }
  }
};

/**
 * Generates the roughjs shape for given element.
 *
 * Low-level. Use `ShapeCache.generateElementShape` instead.
 *
 * @private
 */
const _generateElementShape = (
  element: Exclude<NonDeletedExcalidrawElement, ExcalidrawSelectionElement>,
  generator: RoughGenerator,
  {
    isExporting,
    canvasBackgroundColor,
    embedsValidationStatus,
    theme,
  }: {
    isExporting: boolean;
    canvasBackgroundColor: string;
    embedsValidationStatus: EmbedsValidationStatus | null;
    theme?: AppState["theme"];
  },
): ElementShape => {
  const isDarkMode = theme === THEME.DARK;
  switch (element.type) {
    case "rectangle":
    case "iframe":
    case "embeddable": {
      let shape: ElementShapes[typeof element.type];
      const options = generateRoughOptions(
        modifyIframeLikeForRoughOptions(
          element,
          isExporting,
          embedsValidationStatus,
        ),
        !!element.roundness,
        isDarkMode,
      );
      const radius = element.roundness
        ? getCornerRadius(Math.min(element.width, element.height), element)
        : 0;
      // this is for rendering the stroke/bg of the embeddable, especially
      // when the src url is not set

      if (element.roundness) {
        const w = element.width;
        const h = element.height;
        shape = generator.path(
          `M ${radius} 0 L ${w - radius} 0 Q ${w} 0, ${w} ${radius} L ${w} ${
            h - radius
          } Q ${w} ${h}, ${w - radius} ${h} L ${radius} ${h} Q 0 ${h}, 0 ${
            h - radius
          } L 0 ${radius} Q 0 0, ${radius} 0`,
          options,
        );
      } else {
        shape = generator.rectangle(
          0,
          0,
          element.width,
          element.height,
          options,
        );
      }
      if (element.strokeStyle === "double") {
        const inset = getInset(
          element.width,
          element.height,
          getDoubleStrokeOffset(element.strokeWidth),
        );
        if (inset) {
          const innerWidth = element.width - inset * 2;
          const innerHeight = element.height - inset * 2;
          const innerOptions = withoutFill(options);
          const innerShape = element.roundness
            ? generator.path(
                `M ${inset + Math.min(radius, innerWidth / 2)} ${inset} L ${
                  inset + innerWidth - Math.min(radius, innerWidth / 2)
                } ${inset} Q ${inset + innerWidth} ${inset}, ${
                  inset + innerWidth
                } ${inset + Math.min(radius, innerHeight / 2)} L ${
                  inset + innerWidth
                } ${
                  inset + innerHeight - Math.min(radius, innerHeight / 2)
                } Q ${
                  inset + innerWidth
                } ${inset + innerHeight}, ${
                  inset + innerWidth - Math.min(radius, innerWidth / 2)
                } ${inset + innerHeight} L ${
                  inset + Math.min(radius, innerWidth / 2)
                } ${inset + innerHeight} Q ${inset} ${
                  inset + innerHeight
                }, ${inset} ${
                  inset + innerHeight - Math.min(radius, innerHeight / 2)
                } L ${inset} ${
                  inset + Math.min(radius, innerHeight / 2)
                } Q ${inset} ${inset}, ${
                  inset + Math.min(radius, innerWidth / 2)
                } ${inset}`,
                innerOptions,
              )
            : generator.rectangle(
                inset,
                inset,
                innerWidth,
                innerHeight,
                innerOptions,
              );
          shape = [shape, innerShape] as ElementShapes[typeof element.type];
        }
      }
      return shape;
    }
    case "diamond": {
      let shape: ElementShapes[typeof element.type];
      const options = generateRoughOptions(
        element,
        !!element.roundness,
        isDarkMode,
      );

      const [topX, topY, rightX, rightY, bottomX, bottomY, leftX, leftY] =
        getDiamondPoints(element);
      if (element.roundness) {
        const verticalRadius = getCornerRadius(Math.abs(topX - leftX), element);

        const horizontalRadius = getCornerRadius(
          Math.abs(rightY - topY),
          element,
        );

        shape = generator.path(
          `M ${topX + verticalRadius} ${topY + horizontalRadius} L ${
            rightX - verticalRadius
          } ${rightY - horizontalRadius}
            C ${rightX} ${rightY}, ${rightX} ${rightY}, ${
            rightX - verticalRadius
          } ${rightY + horizontalRadius}
            L ${bottomX + verticalRadius} ${bottomY - horizontalRadius}
            C ${bottomX} ${bottomY}, ${bottomX} ${bottomY}, ${
            bottomX - verticalRadius
          } ${bottomY - horizontalRadius}
            L ${leftX + verticalRadius} ${leftY + horizontalRadius}
            C ${leftX} ${leftY}, ${leftX} ${leftY}, ${leftX + verticalRadius} ${
            leftY - horizontalRadius
          }
            L ${topX - verticalRadius} ${topY + horizontalRadius}
            C ${topX} ${topY}, ${topX} ${topY}, ${topX + verticalRadius} ${
            topY + horizontalRadius
          }`,
          options,
        );
      } else {
        shape = generator.polygon(
          [
            [topX, topY],
            [rightX, rightY],
            [bottomX, bottomY],
            [leftX, leftY],
          ],
          options,
        );
      }
      if (element.strokeStyle === "double") {
        const insetPoints = getInsetDiamondPoints(
          element,
          getDoubleStrokeOffset(element.strokeWidth),
        );
        if (insetPoints) {
          shape = [
            shape,
            generator.polygon(insetPoints, withoutFill(options)),
          ] as ElementShapes[typeof element.type];
        }
      }
      return shape;
    }
    case "ellipse": {
      const options = generateRoughOptions(element, false, isDarkMode);
      const shape: ElementShapes[typeof element.type] = generator.ellipse(
        element.width / 2,
        element.height / 2,
        element.width,
        element.height,
        options,
      );
      if (element.strokeStyle === "double") {
        const inset = getInset(
          element.width,
          element.height,
          getDoubleStrokeOffset(element.strokeWidth),
        );
        if (inset) {
          return [
            shape,
            generator.ellipse(
              element.width / 2,
              element.height / 2,
              element.width - inset * 2,
              element.height - inset * 2,
              withoutFill(options),
            ),
          ] as ElementShapes[typeof element.type];
        }
      }
      return shape;
    }
    case "line":
    case "arrow": {
      let shape: ElementShapes[typeof element.type];
      const options = generateRoughOptions(element, false, isDarkMode);

      // points array can be empty in the beginning, so it is important to add
      // initial position to it
      const points = element.points.length
        ? element.points
        : [pointFrom<LocalPoint>(0, 0)];

      if (element.strokeStyle === "double" && isElbowArrow(element)) {
        if (
          !points.every(
            (point) => Math.abs(point[0]) <= 1e6 && Math.abs(point[1]) <= 1e6,
          )
        ) {
          console.error(
            `Elbow arrow with extreme point positions detected. Arrow not rendered.`,
            element.id,
            JSON.stringify(points),
          );
          shape = [];
        } else {
          const offsetPoints = getOffsetLinearPoints(
            points,
            getDoubleStrokeOffset(element.strokeWidth),
          );
          shape = [
            generator.path(
              generateElbowArrowShape(points, 16),
              withoutStroke(withoutFill(options)),
            ),
            ...(offsetPoints
              ? [
                  generator.path(
                    generateElbowArrowShape(
                      offsetPoints[0] as unknown as LocalPoint[],
                      16,
                    ),
                    withoutFill(options),
                  ),
                  generator.path(
                    generateElbowArrowShape(
                      offsetPoints[1] as unknown as LocalPoint[],
                      16,
                    ),
                    withoutFill(options),
                  ),
                ]
              : [
                  generator.path(
                    generateElbowArrowShape(points, 16),
                    withoutFill(options),
                  ),
                ]),
          ];
        }
      } else if (element.strokeStyle === "double" && isPathALoop(points)) {
        if (options.fill) {
          shape = [
            generator.polygon(points as unknown as RoughPoint[], options),
            generator.linearPath(
              getInsetLinearPoints(
                points,
                getDoubleStrokeOffset(element.strokeWidth),
              ),
              withoutFill(options),
            ),
          ];
        } else {
          const offsetPoints = getOffsetLinearPoints(
            points,
            getDoubleStrokeOffset(element.strokeWidth),
          );
          shape = offsetPoints
            ? [
                generator.linearPath(
                  points as unknown as RoughPoint[],
                  withoutStroke(withoutFill(options)),
                ),
                generator.linearPath(offsetPoints[0], options),
                generator.linearPath(offsetPoints[1], options),
              ]
            : [generator.linearPath(points as unknown as RoughPoint[], options)];
        }
      } else if (isElbowArrow(element)) {
        // NOTE (mtolmacs): Temporary fix for extremely big arrow shapes
        if (
          !points.every(
            (point) => Math.abs(point[0]) <= 1e6 && Math.abs(point[1]) <= 1e6,
          )
        ) {
          console.error(
            `Elbow arrow with extreme point positions detected. Arrow not rendered.`,
            element.id,
            JSON.stringify(points),
          );
          shape = [];
        } else {
          shape = [
            generator.path(
              generateElbowArrowShape(points, 16),
              generateRoughOptions(element, true, isDarkMode),
            ),
          ];
        }
      } else if (element.strokeStyle === "double") {
        const offsetPoints = getOffsetLinearPoints(
          points,
          getDoubleStrokeOffset(element.strokeWidth),
        );
        const doubleOptions = withoutFill(options);
        const referenceOptions = withoutStroke(doubleOptions);

        shape = offsetPoints
          ? element.roundness
            ? [
                generator.curve(
                  points as unknown as RoughPoint[],
                  referenceOptions,
                ),
                generator.curve(offsetPoints[0], doubleOptions),
                generator.curve(offsetPoints[1], doubleOptions),
              ]
            : [
                generator.linearPath(
                  points as unknown as RoughPoint[],
                  referenceOptions,
                ),
                generator.linearPath(offsetPoints[0], doubleOptions),
                generator.linearPath(offsetPoints[1], doubleOptions),
              ]
          : [
              generator.linearPath(
                points as unknown as RoughPoint[],
                doubleOptions,
              ),
            ];
      } else if (!element.roundness) {
        // curve is always the first element
        // this simplifies finding the curve for an element
        if (options.fill) {
          shape = [
            generator.polygon(points as unknown as RoughPoint[], options),
          ];
        } else {
          shape = [
            generator.linearPath(points as unknown as RoughPoint[], options),
          ];
        }
      } else {
        shape = [generator.curve(points as unknown as RoughPoint[], options)];
      }

      // add lines only in arrow
      if (element.type === "arrow") {
        const arrowheadReferenceShape =
          element.strokeStyle === "double"
            ? [
                isElbowArrow(element)
                  ? generator.path(
                      generateElbowArrowShape(points, 16),
                      generateRoughOptions(element, true, isDarkMode),
                    )
                  : element.roundness
                  ? generator.curve(points as unknown as RoughPoint[], options)
                  : generator.linearPath(
                      points as unknown as RoughPoint[],
                      options,
                    ),
              ]
            : shape;
        const { startArrowhead = null, endArrowhead = "arrow" } = element;

        if (startArrowhead !== null) {
          const shapes = getArrowheadShapes(
            element,
            arrowheadReferenceShape,
            "start",
            startArrowhead,
            generator,
            options,
            canvasBackgroundColor,
            isDarkMode,
          );
          shape.push(...shapes);
        }

        if (endArrowhead !== null) {
          if (endArrowhead === undefined) {
            // Hey, we have an old arrow here!
          }

          const shapes = getArrowheadShapes(
            element,
            arrowheadReferenceShape,
            "end",
            endArrowhead,
            generator,
            options,
            canvasBackgroundColor,
            isDarkMode,
          );
          shape.push(...shapes);
        }
      }
      return shape;
    }
    case "freedraw": {
      // oredered in terms of z-index [background, stroke]
      const shapes: ElementShapes[typeof element.type] = [];

      // (1) background fill (rc shape), optional
      if (isPathALoop(element.points)) {
        // generate rough polygon to fill freedraw shape
        const simplifiedPoints = simplify(
          element.points as Mutable<LocalPoint[]>,
          0.75,
        );
        shapes.push(
          generator.curve(simplifiedPoints as [number, number][], {
            ...generateRoughOptions(element, false, isDarkMode),
            stroke: "none",
          }),
        );
      }

      // (2) stroke
      shapes.push(getFreeDrawSvgPath(element));

      return shapes;
    }
    case "frame":
    case "magicframe":
    case "text":
    case "image": {
      const shape: ElementShapes[typeof element.type] = null;
      // we return (and cache) `null` to make sure we don't regenerate
      // `element.canvas` on rerenders
      return shape;
    }
    default: {
      assertNever(
        element,
        `generateElementShape(): Unimplemented type ${(element as any)?.type}`,
      );
      return null;
    }
  }
};

const generateElbowArrowShape = (
  points: readonly LocalPoint[],
  radius: number,
) => {
  const subpoints = [] as [number, number][];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const next = points[i + 1];
    const point = points[i];
    const prevIsHorizontal = headingForPointIsHorizontal(point, prev);
    const nextIsHorizontal = headingForPointIsHorizontal(next, point);
    const corner = Math.min(
      radius,
      pointDistance(points[i], next) / 2,
      pointDistance(points[i], prev) / 2,
    );

    if (prevIsHorizontal) {
      if (prev[0] < point[0]) {
        // LEFT
        subpoints.push([points[i][0] - corner, points[i][1]]);
      } else {
        // RIGHT
        subpoints.push([points[i][0] + corner, points[i][1]]);
      }
    } else if (prev[1] < point[1]) {
      // UP
      subpoints.push([points[i][0], points[i][1] - corner]);
    } else {
      subpoints.push([points[i][0], points[i][1] + corner]);
    }

    subpoints.push(points[i] as [number, number]);

    if (nextIsHorizontal) {
      if (next[0] < point[0]) {
        // LEFT
        subpoints.push([points[i][0] - corner, points[i][1]]);
      } else {
        // RIGHT
        subpoints.push([points[i][0] + corner, points[i][1]]);
      }
    } else if (next[1] < point[1]) {
      // UP
      subpoints.push([points[i][0], points[i][1] - corner]);
    } else {
      // DOWN
      subpoints.push([points[i][0], points[i][1] + corner]);
    }
  }

  const d = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 0; i < subpoints.length; i += 3) {
    d.push(`L ${subpoints[i][0]} ${subpoints[i][1]}`);
    d.push(
      `Q ${subpoints[i + 1][0]} ${subpoints[i + 1][1]}, ${
        subpoints[i + 2][0]
      } ${subpoints[i + 2][1]}`,
    );
  }
  d.push(`L ${points[points.length - 1][0]} ${points[points.length - 1][1]}`);

  return d.join(" ");
};

/**
 * get the pure geometric shape of an excalidraw elementw
 * which is then used for hit detection
 */
export const getElementShape = <Point extends GlobalPoint | LocalPoint>(
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
): GeometricShape<Point> => {
  switch (element.type) {
    case "rectangle":
    case "diamond":
    case "frame":
    case "magicframe":
    case "embeddable":
    case "image":
    case "iframe":
    case "text":
    case "selection":
      return getPolygonShape(element);
    case "arrow":
    case "line": {
      const roughShape = ShapeCache.generateElementShape(element, null)[0];
      const [, , , , cx, cy] = getElementAbsoluteCoords(element, elementsMap);

      return shouldTestInside(element)
        ? getClosedCurveShape<Point>(
            element,
            roughShape,
            pointFrom<Point>(element.x, element.y),
            element.angle,
            pointFrom(cx, cy),
          )
        : getCurveShape<Point>(
            roughShape,
            pointFrom<Point>(element.x, element.y),
            element.angle,
            pointFrom(cx, cy),
          );
    }

    case "ellipse":
      return getEllipseShape(element);

    case "freedraw": {
      const [, , , , cx, cy] = getElementAbsoluteCoords(element, elementsMap);
      return getFreedrawShape(
        element,
        pointFrom(cx, cy),
        shouldTestInside(element),
      );
    }
  }
};

export const toggleLinePolygonState = (
  element: ExcalidrawLineElement,
  nextPolygonState: boolean,
): {
  polygon: ExcalidrawLineElement["polygon"];
  points: ExcalidrawLineElement["points"];
} | null => {
  const updatedPoints = [...element.points];

  if (nextPolygonState) {
    if (!canBecomePolygon(element.points)) {
      return null;
    }

    const firstPoint = updatedPoints[0];
    const lastPoint = updatedPoints[updatedPoints.length - 1];

    const distance = Math.hypot(
      firstPoint[0] - lastPoint[0],
      firstPoint[1] - lastPoint[1],
    );

    if (
      distance > LINE_POLYGON_POINT_MERGE_DISTANCE ||
      updatedPoints.length < 4
    ) {
      updatedPoints.push(pointFrom(firstPoint[0], firstPoint[1]));
    } else {
      updatedPoints[updatedPoints.length - 1] = pointFrom(
        firstPoint[0],
        firstPoint[1],
      );
    }
  }

  // TODO: satisfies ElementUpdate<ExcalidrawLineElement>
  const ret = {
    polygon: nextPolygonState,
    points: updatedPoints,
  };

  return ret;
};

// -----------------------------------------------------------------------------
//                         freedraw shape helper
// -----------------------------------------------------------------------------

// NOTE not cached (-> for SVG export)
const getFreeDrawSvgPath = (element: ExcalidrawFreeDrawElement) => {
  return getSvgPathFromStroke(
    getFreedrawOutlinePoints(element),
  ) as SVGPathString;
};

/**
 * Freedraw stroke geometry tuning constants.
 *
 * These factors are not derived analytically — they were tuned empirically by
 * visually comparing rendered strokes until they matched the desired feel.
 * Treat them as magic numbers backed by visual verification.
 */
const VARIABLE_WIDTH_FREEDRAW = {
  /** Stroke size relative to `strokeWidth` for pressure-sensitive strokes. */
  SIZE_FACTOR: 4.25,
  THINNING: 0.6,
  SMOOTHING: 0.5,
} as const;

const CONSTANT_WIDTH_FREEDRAW = {
  /** Stroke size relative to `strokeWidth` for uniform (laser) strokes. */
  SIZE_FACTOR: 1.4,
} as const;

const getFreedrawStreamline = (element: ExcalidrawFreeDrawElement) =>
  element.strokeOptions?.streamline ?? DEFAULT_STROKE_STREAMLINE;

/**
 * Pressure-sensitive (variable width) freedraw outline, rendered with
 * perfect-freehand. This is the original Excalidraw freedraw look.
 */
const getVariableWidthFreedrawOutline = (
  element: ExcalidrawFreeDrawElement,
): [number, number][] => {
  // If input points are empty (should they ever be?) return a dot
  const inputPoints = element.simulatePressure
    ? element.points
    : element.points.length
    ? element.points.map(
        ([x, y], i) => [x, y, element.pressures[i]] as [number, number, number],
      )
    : [[0, 0, 0.5]];

  return getStroke(inputPoints as number[][], {
    simulatePressure: element.simulatePressure,
    size: element.strokeWidth * VARIABLE_WIDTH_FREEDRAW.SIZE_FACTOR,
    thinning: VARIABLE_WIDTH_FREEDRAW.THINNING,
    smoothing: VARIABLE_WIDTH_FREEDRAW.SMOOTHING,
    streamline: getFreedrawStreamline(element),
    easing: (t) => Math.sin((t * Math.PI) / 2), // https://easings.net/#easeOutSine
    last: true,
  }) as [number, number][];
};

const createLaserPointer = (element: ExcalidrawFreeDrawElement) =>
  new LaserPointer({
    size: element.strokeWidth * CONSTANT_WIDTH_FREEDRAW.SIZE_FACTOR,
    streamline: getFreedrawStreamline(element),
    simplify: 0,
    sizeMapping: (details) => Math.max(0.1, details.pressure),
  });

/**
 * Uniform (constant width) freedraw outline, rendered with the laser-pointer
 * geometry. Pressure is pinned to 1 so the stroke keeps a constant width.
 */
const getConstantWidthFreedrawOutline = (
  element: ExcalidrawFreeDrawElement,
): [number, number][] => {
  const laserPointer = createLaserPointer(element);
  element.points.map(([x, y]) => laserPointer.addPoint([x, y, 1]));

  return laserPointer
    .getStrokeOutline()
    .map(([x, y]) => [x, y] as [number, number]);
};

export const getFreedrawOutlinePoints = (
  element: ExcalidrawFreeDrawElement,
): [number, number][] => {
  // Unknown/absent variability falls back to the original variable rendering.
  return element.strokeOptions?.variability === "constant"
    ? getConstantWidthFreedrawOutline(element)
    : getVariableWidthFreedrawOutline(element);
};

const med = (A: number[], B: number[]) => {
  return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
};

// Trim SVG path data so number are each two decimal points. This
// improves SVG exports, and prevents rendering errors on points
// with long decimals.
const TO_FIXED_PRECISION = /(\s?[A-Z]?,?-?[0-9]*\.[0-9]{0,2})(([0-9]|e|-)*)/g;

const getSvgPathFromStroke = (points: number[][]): string => {
  if (!points.length) {
    return "";
  }

  const max = points.length - 1;

  return points
    .reduce(
      (acc, point, i, arr) => {
        if (i === max) {
          acc.push(point, med(point, arr[0]), "L", arr[0], "Z");
        } else {
          acc.push(point, med(point, arr[i + 1]));
        }
        return acc;
      },
      ["M", points[0], "Q"],
    )
    .join(" ")
    .replace(TO_FIXED_PRECISION, "$1");
};

// -----------------------------------------------------------------------------
