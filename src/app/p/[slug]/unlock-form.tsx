"use client";

import { useActionState } from "react";
import { unlock } from "./actions";

export function UnlockForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(unlock.bind(null, slug), { error: "" });
  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" required autoFocus autoComplete="off" />
      </div>
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Opening…" : "Open delivery"}</button>
    </form>
  );
}
