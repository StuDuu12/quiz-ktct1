"use client";

import { useEffect, useRef } from "react";

export function HydrationMarker() {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    markerRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  return (
    <span
      ref={markerRef}
      hidden
      aria-hidden="true"
      data-hydrated="false"
    />
  );
}
