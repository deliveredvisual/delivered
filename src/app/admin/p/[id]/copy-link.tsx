"use client";

import { useState } from "react";

export function CopyLink({ url, label = "Client link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="row" style={{ gap: 8, flexWrap: "nowrap", minWidth: 0 }}>
      <input className="input mono" readOnly value={url} aria-label={label} onFocus={(e) => e.target.select()} style={{ minWidth: 0 }} />
      <button
        type="button"
        className="btn"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
