"use client";

import { useActionState } from "react";
import { inviteClient, type InviteState } from "../../actions";

/** Type a client's email (or pick someone you've delivered to before) to put this delivery on their account. */
export function InviteClient({ projectId, known }: { projectId: string; known: { email: string; name: string; company: string }[] }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteClient.bind(null, projectId), { error: "" });
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <label htmlFor="invite-email" className="small" style={{ color: "var(--ink-2)" }}>Add a client by the email of anyone at their organisation</label>
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <input
          key={state.added ?? "form"}
          id="invite-email"
          name="email"
          type="email"
          className="input"
          list="known-clients"
          placeholder="client@company.com"
          autoComplete="off"
          required
          style={{ maxWidth: 420 }}
        />
        <button type="submit" className="btn" disabled={pending}>{pending ? "Adding…" : "Add to delivery"}</button>
      </div>
      <datalist id="known-clients">
        {known.map((k) => (
          <option key={k.email} value={k.email}>{[k.name, k.company].filter(Boolean).join(" · ")}</option>
        ))}
      </datalist>
      {state.error ? <p className="error" role="alert" style={{ margin: 0 }}>{state.error}</p> : null}
      {state.added ? <p className="small good" role="status" style={{ margin: 0 }}>Added. Everyone at {state.added} can see it on their dashboard now.</p> : null}
    </form>
  );
}
