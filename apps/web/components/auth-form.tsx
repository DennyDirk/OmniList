"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { dictionaries, type Locale } from "../lib/i18n";

interface AuthFormProps {
  apiBaseUrl: string;
  mode: "login" | "register";
  locale: Locale;
}

export function AuthForm({ apiBaseUrl, mode, locale }: AuthFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const dictionary = dictionaries[locale];
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : undefined;
  const [form, setForm] = useState({
    name: "",
    workspaceName: "",
    email: "",
    password: ""
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!apiBaseUrl) {
      setError(dictionary.authForm.missingApi);
      return;
    }

    const endpoint = mode === "login" ? `${apiBaseUrl}/auth/login` : `${apiBaseUrl}/auth/register`;
    const payload =
      mode === "login"
        ? {
            email: form.email,
            password: form.password
          }
        : {
            name: form.name,
            workspaceName: form.workspaceName || undefined,
            email: form.email,
            password: form.password
          };

    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
      setError(body?.message ?? dictionary.authForm.authFailed);
      return;
    }

    startTransition(() => {
      router.push("/");
      router.refresh();
    });
  }

  return (
    <form className="editor-form auth-card" onSubmit={handleSubmit}>
      {search?.get("error") ? (
        <div className="banner error">
          {dictionary.authForm.oauthFailed}: {search.get("error")}
        </div>
      ) : null}
      {mode === "register" ? (
        <>
          <label className="field">
            <span>{dictionary.authForm.name}</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
          </label>
          <label className="field">
            <span>{dictionary.authForm.workspaceName}</span>
            <input
              value={form.workspaceName}
              onChange={(event) => setForm((current) => ({ ...current, workspaceName: event.target.value }))}
            />
          </label>
        </>
      ) : null}

      <label className="field">
        <span>{dictionary.authForm.email}</span>
        <input
          type="email"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          required
        />
      </label>

      <label className="field">
        <span>{dictionary.authForm.password}</span>
        <input
          type="password"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          required
        />
      </label>

      {error ? <div className="banner error">{error}</div> : null}

      <div className="editor-actions">
        <button className="button-primary" disabled={isPending} type="submit">
          {isPending ? dictionary.authForm.pleaseWait : mode === "login" ? dictionary.authForm.signIn : dictionary.authForm.createAccount}
        </button>
      </div>
    </form>
  );
}
