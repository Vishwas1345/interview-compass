"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { post } from "@/lib/api";
import { useSession } from "@/components/session";
import { DEFAULT_NEXT, safeNext } from "@interview-compass/shared";
import { Alert, Button, Card, Field } from "@/components/ui";

const PASSWORD_MIN = 8;

// Sign in and sign up share one form. After success the user goes back to where
// they were sent from (?next=), or to their kits.
export function AuthForm({ mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const register = mode === "register";
  // Server render has no window; the origin only checks that resolving stays on site.
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const next = safeNext(params.get("next"), origin);

  async function submit(event) {
    event.preventDefault();
    const found = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = "Enter a valid email address.";
    if (register && password.length < PASSWORD_MIN) found.password = `Password must be at least ${PASSWORD_MIN} characters.`;
    if (!register && !password) found.password = "Enter your password.";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const { user } = await post(register ? "/auth/register" : "/auth/login", { email, password });
      session.signedIn(user);
      router.replace(next);
    } catch (error) {
      if (error.code === "EMAIL_TAKEN") setErrors({ email: error.message });
      else setFormError(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-display text-[34px] leading-tight text-ink">{register ? "Create your account" : "Sign in"}</h1>
      <p className="mt-1 text-sm text-muted">{register ? "Your kits are saved to your account." : "Welcome back. Your kits are waiting."}</p>
      {params.get("expired") && (
        <Alert tone="warning" className="mt-4">
          Your session ended. Sign in again to continue.
        </Alert>
      )}
      <Card className="mt-6 p-5">
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
          <Field
            label="Password"
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            hint={register ? `At least ${PASSWORD_MIN} characters.` : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            required
          />
          {formError && <Alert>{formError}</Alert>}
          <Button type="submit" busy={busy} className="w-full">
            {register ? "Create account" : "Sign in"}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        {register ? "Already have an account? " : "New here? "}
        <Link className="font-medium text-accent underline-offset-2 hover:underline" href={`${register ? "/login" : "/register"}${next !== DEFAULT_NEXT ? `?next=${encodeURIComponent(next)}` : ""}`}>
          {register ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
