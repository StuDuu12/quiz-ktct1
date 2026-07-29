"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

type ModalFocusOptions = {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  invokerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
};

export function useModalFocus({
  active,
  containerRef,
  initialFocusRef,
  invokerRef,
  onClose,
}: ModalFocusOptions) {
  useEffect(() => {
    if (!active) return;
    const invoker = invokerRef.current;
    initialFocusRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      invoker?.focus();
    };
  }, [
    active,
    containerRef,
    initialFocusRef,
    invokerRef,
    onClose,
  ]);
}
