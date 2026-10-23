"use client";

import type { ReactNode } from "react";

/** A submit button that asks before doing something that can't be undone. */
export function ConfirmButton({ message, children, className = "btn btn-small btn-danger" }: { message: string; children: ReactNode; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
