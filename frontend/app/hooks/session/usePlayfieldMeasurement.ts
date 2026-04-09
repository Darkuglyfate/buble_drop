"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_PLAYFIELD_WIDTH_PX = 390;
const DEFAULT_PLAYFIELD_HEIGHT_PX = 760;

/**
 * Observes header, footer, and playfield elements via ResizeObserver
 * to track layout dimensions for the session play screen.
 */
export function usePlayfieldMeasurement(isActive: boolean) {
  const [headerHeightPx, setHeaderHeightPx] = useState(116);
  const [footerHeightPx, setFooterHeightPx] = useState(156);
  const headerRef = useRef<HTMLElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const playfieldRef = useRef<HTMLDivElement | null>(null);
  const playfieldMetricsRef = useRef({
    width: DEFAULT_PLAYFIELD_WIDTH_PX,
    height: DEFAULT_PLAYFIELD_HEIGHT_PX,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const observers: ResizeObserver[] = [];
    const observeElement = (
      element: Element | null,
      onMeasure: (height: number) => void,
    ) => {
      if (!element) {
        return;
      }
      const measure = () => {
        const height = Math.round(element.getBoundingClientRect().height);
        if (height > 0) {
          onMeasure(height);
        }
      };
      measure();
      const observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(element);
      observers.push(observer);
    };

    observeElement(headerRef.current, setHeaderHeightPx);
    observeElement(footerRef.current, setFooterHeightPx);

    const playfieldElement = playfieldRef.current;
    if (playfieldElement) {
      const measurePlayfield = () => {
        const bounds = playfieldElement.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0) {
          playfieldMetricsRef.current = {
            width: bounds.width,
            height: bounds.height,
          };
        }
      };
      measurePlayfield();
      const playfieldObserver = new ResizeObserver(() => {
        measurePlayfield();
      });
      playfieldObserver.observe(playfieldElement);
      observers.push(playfieldObserver);
    }

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [isActive]);

  return {
    headerHeightPx,
    footerHeightPx,
    headerRef,
    footerRef,
    playfieldRef,
    playfieldMetricsRef,
  };
}
