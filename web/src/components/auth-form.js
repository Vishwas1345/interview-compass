"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { get, post } from "@/lib/api";
import { useSession } from "@/components/session";
import { DEFAULT_NEXT, safeNext } from "@interview-compass/shared";
import { Alert, Button, Card, Field, buttonClass } from "@/components/ui";

const PASSWORD_MIN = 8;

// What the API's Google sign-in sends back on failure (/login?error=..., D22).
const GOOGLE_ERRORS = {
  google_cancelled: "Google sign-in was cancelled.",
  google_expired: "That sign-in expired. Try again.",
  google_unverified: "Your Google account's email is not verified. Verify it with Google, or sign up with email and password.",
  google_unavailable: "Google sign-in is unavailable right now. Try again, or use email and password.",
};

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
  const googleError = GOOGLE_ERRORS[params.get("error")];
  // Offered only when the server has Google sign-in configured.
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    let cancelled = false;
    get("/auth/options")
      .then((options) => !cancelled && setGoogle(options.google === true))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const googleHref = `/api/auth/google/start${next !== DEFAULT_NEXT ? `?next=${encodeURIComponent(next)}` : ""}`;

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
      {googleError && <Alert className="mt-4">{googleError}</Alert>}
      <Card className="mt-6 p-5">
        {google && (
          <>
            {/* A plain link, not next/link: the browser must really leave for Google, and
                a prefetch must never start a sign-in. */}
            <a href={googleHref} className={buttonClass("secondary", "md", "w-full")}>
              <GoogleMark />
              Continue with Google
            </a>
            <div className="my-4 flex items-center gap-3 text-xs text-faint" aria-hidden="true">
              <span className="h-px flex-1 bg-rule" />
              or with email
              <span className="h-px flex-1 bg-rule" />
            </div>
          </>
        )}
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

// Google's "G" mark, as its sign-in branding asks for.
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
