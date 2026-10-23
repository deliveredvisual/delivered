"use client";

import { createContext, useActionState, useContext } from "react";
import { acceptInvite, signupClient, signupCreative, type SignupState } from "./actions";

const MIN = 10;

/** Values typed before a mistake, so the form can show them again. */
const Kept = createContext<Record<string, string>>({});

function Field({ id, label, type = "text", auto, hint, required = true }: { id: string; label: string; type?: string; auto?: string; hint?: string; required?: boolean }) {
  const kept = useContext(Kept);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        className="input"
        autoComplete={auto}
        required={required}
        defaultValue={type === "password" ? undefined : kept[id]}
        minLength={type === "password" ? MIN : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint ? <span id={`${id}-hint`} className="small muted">{hint}</span> : null}
    </div>
  );
}

function Form({
  action,
  submit,
  busy,
  next,
  children,
}: {
  action: (s: SignupState, f: FormData) => Promise<SignupState>;
  submit: string;
  busy: string;
  next?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  return (
    <Kept.Provider value={state.values ?? {}}>
    <form key={state.n ?? 0} action={formAction} className="stack">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {children}
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? busy : submit}</button>
    </form>
    </Kept.Provider>
  );
}

const pw = `At least ${MIN} characters`;

export function ClientSignup({ next }: { next: string }) {
  return (
    <Form action={signupClient} submit="Create account" busy="Creating…" next={next}>
      <Field id="name" label="Your name" auto="name" />
      <Field id="company" label="Company or organisation" auto="organization" hint="e.g. McLaren Automotive. Colleagues you invite join it." />
      <Field id="email" label="Work email" type="email" auto="email" />
      <Field id="password" label="Password" type="password" auto="new-password" hint={pw} />
    </Form>
  );
}

export function CreativeSignup() {
  return (
    <Form action={signupCreative} submit="Create studio" busy="Creating…">
      <Field id="name" label="Your name" auto="name" />
      <Field id="studioName" label="Studio or business name" auto="organization" hint="Clients see this on every delivery" />
      <Field id="email" label="Email" type="email" auto="email" />
      <Field id="password" label="Password" type="password" auto="new-password" hint={pw} />
    </Form>
  );
}

export function InviteSignup({ token }: { token: string }) {
  return (
    <Form action={acceptInvite.bind(null, token)} submit="Join the team" busy="Joining…">
      <Field id="name" label="Your name" auto="name" />
      <Field id="email" label="Email" type="email" auto="email" />
      <Field id="password" label="Password" type="password" auto="new-password" hint={`${pw}. Already have an account? Use its password.`} />
    </Form>
  );
}
