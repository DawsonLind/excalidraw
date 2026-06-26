import { useEffect, useMemo } from "react";

import type { CSSProperties } from "react";

import { atom } from "../../editor-jotai";

import "./Confetti.scss";

export const confettiTriggerAtom = atom(0);

const CONFETTI_COLORS = [
  "#ff6b6b",
  "#ffd43b",
  "#51cf66",
  "#339af0",
  "#845ef7",
  "#f06595",
];

const CONFETTI_PIECES = 90;
const CONFETTI_DURATION = 1800;

type ConfettiOverlayProps = {
  width: number;
  height: number;
  trigger: number;
  onDone: () => void;
};

export const ConfettiOverlay = ({
  width,
  height,
  trigger,
  onDone,
}: ConfettiOverlayProps) => {
  const pieces = useMemo(() => {
    const centerX = Math.max(width / 2, 1);
    const centerY = Math.max(height * 0.38, 1);

    return Array.from({ length: CONFETTI_PIECES }, (_, index) => {
      const angle = -Math.PI / 2 + (index / (CONFETTI_PIECES - 1) - 0.5) * 2.5;
      const distance = 220 + ((index * 47) % 260);
      const drift = ((index * 29) % 160) - 80;
      const size = 6 + (index % 4) * 2;

      return {
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        delay: `${(index % 12) * 22}ms`,
        duration: `${CONFETTI_DURATION + (index % 8) * 70}ms`,
        height: `${size * 1.6}px`,
        left: `${centerX}px`,
        rotate: `${(index * 137) % 720 - 360}deg`,
        top: `${centerY}px`,
        width: `${size}px`,
        x: `${Math.cos(angle) * distance + drift}px`,
        y: `${Math.sin(angle) * distance + height * 0.48}px`,
      };
    });
  }, [height, width]);

  useEffect(() => {
    if (!trigger) {
      return;
    }

    const timeout = window.setTimeout(onDone, CONFETTI_DURATION + 900);
    return () => window.clearTimeout(timeout);
  }, [onDone, trigger]);

  if (!trigger) {
    return null;
  }

  return (
    <div
      className="excalidraw-confetti"
      aria-hidden="true"
      key={trigger}
      style={{ width, height }}
    >
      {pieces.map((piece, index) => (
        <span
          className="excalidraw-confetti__piece"
          key={index}
          style={
            {
              "--confetti-color": piece.color,
              "--confetti-delay": piece.delay,
              "--confetti-duration": piece.duration,
              "--confetti-height": piece.height,
              "--confetti-left": piece.left,
              "--confetti-rotate": piece.rotate,
              "--confetti-top": piece.top,
              "--confetti-width": piece.width,
              "--confetti-x": piece.x,
              "--confetti-y": piece.y,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
};
