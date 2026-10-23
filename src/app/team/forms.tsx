"use client";

import { useActionState } from "react";
import { claimOwnerAccount, updateStudio } from "./actions";

export function StudioForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(updateStudio, { error: "" });
  return (
    <form action={action} className="stack" style={{ maxWidth: 520 }}>
      <div className="field">
        <label htmlFor="studio-name">Organisation name</label>
        <input id="studio-name" name="name" className="input" defaultValue={name} required maxLength={80} />
        <span className="small muted">Shown at the top of every delivery you send.</span>
      </div>
      <div className="field">
        <label htmlFor="studio-email">Contact email for your clients</label>
        <input id="studio-email" name="email" type="email" className="input" defaultValue={email} />
      </div>
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      <div><button type="submit" className="btn" disabled={pending}>{pending ? "Saving…" : "Save"}</button></div>
    </form>
  );
}

export function ClaimForm() {
  const [state, action, pending] = useActionState(claimOwnerAccount, { error: "" });
  return (
    <form action={action} className="stack" style={{ maxWidth: 520 }}>
      <div className="field">
        <label htmlFor="claim-name">Your name</label>
        <input id="claim-name" name="name" className="input" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor="claim-email">Email</label>
        <input id="claim-email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="claim-password">Password</label>
        <input id="claim-password" name="password" type="password" className="input" autoComplete="new-password" minLength={10} required />
        <span className="small muted">At least 10 characters.</span>
      </div>
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create my sign-in"}</button></div>
    </form>
  );
}
