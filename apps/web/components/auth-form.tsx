"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";

import { dictionaries, type Locale } from "../lib/i18n";
import { useFlash } from "./flash-provider";

interface AuthFormProps {
  apiBaseUrl: string;
  mode: "login" | "register";
  locale: Locale;
}

export function AuthForm({ apiBaseUrl, mode, locale }: AuthFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showFlash } = useFlash();
  const dictionary = dictionaries[locale];
  const searchError = useMemo(
    () => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("error") : null),
    []
  );
  const [form, setForm] = useState({
    name: "",
    workspaceName: "",
    email: "",
    password: ""
  });

  useEffect(() => {
    if (!searchError) {
      return;
    }

    showFlash({
      tone: "error",
      message: `${dictionary.authForm.oauthFailed}: ${searchError}`
    });

    const nextSearchParams = new URLSearchParams(window.location.search);
    nextSearchParams.delete("error");
    const nextUrl = nextSearchParams.size > 0 ? `${window.location.pathname}?${nextSearchParams.toString()}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [dictionary.authForm.oauthFailed, searchError, showFlash]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!apiBaseUrl) {
      showFlash({
        tone: "error",
        message: dictionary.authForm.missingApi
      });
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
      showFlash({
        tone: "error",
        message: body?.message ?? dictionary.authForm.authFailed
      });
      return;
    }

    startTransition(() => {
      router.push("/");
      router.refresh();
    });
  }

  return (
    <form className="editor-form auth-card" onSubmit={handleSubmit}>
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

      <div className="editor-actions">
        <button className="button-primary" disabled={isPending} type="submit">
          {isPending ? dictionary.authForm.pleaseWait : mode === "login" ? dictionary.authForm.signIn : dictionary.authForm.createAccount}
        </button>
      </div>
    </form>
  );
}
