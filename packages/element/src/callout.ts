import {
  lineSegment,
  pointFrom,
  pointRotateRads,
  type GlobalPoint,
  type LineSegment,
  type LocalPoint,
} from "@excalidraw/math";

import type { ExcalidrawCalloutElement } from "./types";

export const CALLOUT_TAIL_MAX_HEIGHT = 32;

export const getCalloutTailHeight = (
  element: Pick<ExcalidrawCalloutElement, "height">,
) => {
  const absHeight = Math.abs(element.height);
  if (absHeight === 0) {
    return 0;
  }
  return (
    Math.sign(element.height || 1) *
    Math.min(CALLOUT_TAIL_MAX_HEIGHT, absHeight / 3)
  );
};

export const getCalloutBodyHeight = (
  element: Pick<ExcalidrawCalloutElement, "height">,
) => element.height - getCalloutTailHeight(element);

const getCalloutTailHalfWidth = (
  element: Pick<ExcalidrawCalloutElement, "width">,
) => Math.min(Math.abs(element.width) * 0.12, 28);

export const getCalloutLocalPoints = (
  element: Pick<ExcalidrawCalloutElement, "width" | "height">,
): LocalPoint[] => {
  const bodyBottom = getCalloutBodyHeight(element);
  const tailCenterX = element.width * 0.58;
  const tailTipX = element.width * 0.48;
  const tailHalfWidth =
    getCalloutTailHalfWidth(element) * Math.sign(element.width || 1);

  return [
    pointFrom<LocalPoint>(0, 0),
    pointFrom<LocalPoint>(element.width, 0),
    pointFrom<LocalPoint>(element.width, bodyBottom),
    pointFrom<LocalPoint>(tailCenterX + tailHalfWidth, bodyBottom),
    pointFrom<LocalPoint>(tailTipX, element.height),
    pointFrom<LocalPoint>(tailCenterX - tailHalfWidth, bodyBottom),
    pointFrom<LocalPoint>(0, bodyBottom),
  ];
};

export const getCalloutGlobalPoints = (
  element: ExcalidrawCalloutElement,
): GlobalPoint[] => {
  const center = pointFrom<GlobalPoint>(
    element.x + element.width / 2,
    element.y + element.height / 2,
  );

  return getCalloutLocalPoints(element).map(([x, y]) =>
    pointRotateRads(
      pointFrom<GlobalPoint>(element.x + x, element.y + y),
      center,
      element.angle,
    ),
  );
};

export const getCalloutLineSegments = (
  element: ExcalidrawCalloutElement,
): LineSegment<GlobalPoint>[] => {
  const points = getCalloutGlobalPoints(element);
  return points.map((point, index) =>
    lineSegment(point, points[(index + 1) % points.length]),
  );
};

export const getCalloutPath = (
  element: ExcalidrawCalloutElement,
  radius: number,
) => {
  const width = element.width;
  const bodyBottom = getCalloutBodyHeight(element);
  const absBodyHeight = Math.abs(bodyBottom);
  const r = Math.min(radius, Math.abs(width) / 2, absBodyHeight / 2);
  const tailCenterX = width * 0.58;
  const tailTipX = width * 0.48;
  const tailHalfWidth =
    getCalloutTailHalfWidth(element) * Math.sign(width || 1);
  const tailBaseLeft = tailCenterX - tailHalfWidth;
  const tailBaseRight = tailCenterX + tailHalfWidth;

  return [
    `M ${r} 0`,
    `L ${width - r} 0`,
    `Q ${width} 0, ${width} ${r}`,
    `L ${width} ${bodyBottom - r}`,
    `Q ${width} ${bodyBottom}, ${width - r} ${bodyBottom}`,
    `L ${tailBaseRight} ${bodyBottom}`,
    `L ${tailTipX} ${element.height}`,
    `L ${tailBaseLeft} ${bodyBottom}`,
    `L ${r} ${bodyBottom}`,
    `Q 0 ${bodyBottom}, 0 ${bodyBottom - r}`,
    `L 0 ${r}`,
    `Q 0 0, ${r} 0`,
    "Z",
  ].join(" ");
};
