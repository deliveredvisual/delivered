"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A row of tabs that scrolls sideways on a phone, scrolled so the current tab is in view. */
export function TabRow({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-current="true"], [aria-current="page"], [aria-pressed="true"]');
    if (el && ref.current && ref.current.scrollWidth > ref.current.clientWidth) {
      ref.current.scrollLeft = el.offsetLeft - ref.current.clientWidth / 2 + el.clientWidth / 2;
    }
  });
  return (
    <nav ref={ref} className={className} aria-label={label}>
      {children}
    </nav>
  );
}
