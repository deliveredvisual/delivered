"use client";

import { useActionState } from "react";
import type { Project } from "@/db/schema";
import type { FormState } from "./actions";

type Props = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  project?: Project;
  submitLabel: string;
};

export function ProjectForm({ action, project, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const p = project;
  return (
    <form action={formAction} className="stack" style={{ gap: 28 }}>
      <section className="stack">
        <h2 className="h3">Project</h2>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" className="input" required defaultValue={p?.title} placeholder="GT3 RS launch — Hakone" />
          </div>
          <div className="field">
            <label htmlFor="clientName">Client</label>
            <input id="clientName" name="clientName" className="input" defaultValue={p?.clientName} placeholder="Client or company name" />
          </div>
          <div className="field">
            <label htmlFor="category">Type of work</label>
            <input id="category" name="category" className="input" defaultValue={p?.category} placeholder="Commercial, Editorial, Private…" />
          </div>
          <div className="field">
            <label htmlFor="shotDate">Shot on</label>
            <input id="shotDate" name="shotDate" type="date" className="input" defaultValue={p?.shotDate ?? ""} />
          </div>
        </div>
        {!p ? (
          <div className="field">
            <label htmlFor="sets">Sets <span className="muted">(optional, comma separated)</span></label>
            <input id="sets" name="sets" className="input" placeholder="Track, Static, Details, Behind the scenes" />
          </div>
        ) : null}
      </section>

      <section className="stack">
        <h2 className="h3">Access</h2>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="password">{p?.passwordHash ? "New password (leave blank to keep)" : "Password (optional)"}</label>
            <input id="password" name="password" type="text" className="input" autoComplete="off" placeholder={p?.passwordHash ? "••••••" : "Link alone opens it"} />
          </div>
        </div>
        {p?.passwordHash ? (
          <label className="check"><input type="checkbox" name="clearPassword" /> Remove the password</label>
        ) : null}
        <label className="check">
          <input type="checkbox" name="nda" defaultChecked={p?.nda} />
          <span>NDA mode: watermark previews, hide share options, and mark the delivery confidential</span>
        </label>
        <label className="check">
          <input type="checkbox" name="rawEnabled" defaultChecked={p?.rawEnabled} />
          <span>Offer RAW files for download</span>
        </label>
      </section>

      <section className="stack">
        <h2 className="h3">Invoice</h2>
        <label className="check">
          <input type="checkbox" name="invoicePaid" defaultChecked={p?.invoicePaid} />
          <span>Invoice paid</span>
        </label>
        <label className="check">
          <input type="checkbox" name="holdUntilPaid" defaultChecked={p?.holdUntilPaid} />
          <span>Hold full-resolution and RAW downloads until the invoice is paid (web-size stays available)</span>
        </label>
      </section>

      <section className="stack">
        <h2 className="h3">Usage licence</h2>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="licenceUsage">Usage</label>
            <input id="licenceUsage" name="licenceUsage" className="input" defaultValue={p?.licenceUsage} placeholder="Digital + print" />
          </div>
          <div className="field">
            <label htmlFor="licenceTerritory">Territory</label>
            <input id="licenceTerritory" name="licenceTerritory" className="input" defaultValue={p?.licenceTerritory} placeholder="UK & EU" />
          </div>
          <div className="field">
            <label htmlFor="licenceTerm">Term</label>
            <input id="licenceTerm" name="licenceTerm" className="input" defaultValue={p?.licenceTerm} placeholder="12 months from delivery" />
          </div>
          <div className="field">
            <label htmlFor="licenceCredit">Credit</label>
            <input id="licenceCredit" name="licenceCredit" className="input" defaultValue={p?.licenceCredit} placeholder="Alec Pender" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="licenceTerms">Full terms <span className="muted">(shown to the client)</span></label>
          <textarea id="licenceTerms" name="licenceTerms" className="textarea" rows={4} defaultValue={p?.licenceTerms} />
        </div>
      </section>

      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}
