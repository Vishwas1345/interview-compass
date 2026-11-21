"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { get, patch, post, upload, del } from "@/lib/api";
import { RequireAuth, useSession } from "@/components/session";
import { Avatar } from "@/components/avatar";
import { Alert, Button, Card, Dialog, Field, Skeleton } from "@/components/ui";

const PHOTO_MAX = 1024 * 1024;
const RESUME_MAX = 4 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PASSWORD_MIN = 8;

export function ProfilePage() {
  return (
    <RequireAuth fallback={<Skeleton className="h-96 w-full" />}>
      <ProfileInner />
    </RequireAuth>
  );
}

function ProfileInner() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const session = useSession();

  useEffect(() => {
    let cancelled = false;
    get("/profile")
      .then((data) => !cancelled && setProfile(data.profile))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // Every section reports the saved profile; the sidebar follows.
  const saved = (next) => {
    setProfile(next);
    session.updateUser(next.user);
  };

  if (error) return <Alert>{error}</Alert>;
  const google = profile?.user?.signInMethod === "google";
  if (!profile) {
    return (
      <div className="space-y-4" aria-label="Loading profile">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[34px] leading-tight text-ink">Profile</h1>
        <p className="mt-0.5 text-sm text-muted">Your details stay private to your account. They are never sent to the AI.</p>
      </div>
      <LinkedNotice />
      <PhotoSection profile={profile} onSaved={saved} />
      <DetailsSection profile={profile} onSaved={saved} />
      <ResumeSection profile={profile} onSaved={saved} />
      {google ? (
        <GoogleAccountSection email={profile.email} />
      ) : (
        <>
          <EmailSection profile={profile} onSaved={(user) => (setProfile((p) => ({ ...p, email: user.email })), session.updateUser(user))} />
          <PasswordSection />
        </>
      )}
      <DeleteSection google={google} email={profile.email} />
    </div>
  );
}

// Shown once, right after a password account became a Google account (D22). It renders
// only after the profile has loaded in the browser (never on the server), so it can read
// the address when its state is created; the address is then cleaned so a reload does
// not repeat it.
function LinkedNotice() {
  const router = useRouter();
  const [show] = useState(() => new URLSearchParams(window.location.search).get("notice") === "google-linked");
  useEffect(() => {
    if (show) router.replace("/profile");
  }, [show, router]);
  if (!show) return null;
  return (
    <Alert tone="info" title="Your account now signs in with Google">
      Your old password no longer works, and your other devices were signed out.
    </Alert>
  );
}

// Email and password belong to Google for these accounts (D22).
function GoogleAccountSection({ email }) {
  return (
    <Section title="Sign-in" description="Your email and password are managed by Google.">
      <p className="text-sm text-ink-soft">
        You sign in with Google as <span className="font-medium text-ink">{email}</span>.
      </p>
    </Section>
  );
}

function Section({ title, description, children, tone }) {
  return (
    <Card className={`p-5 ${tone === "danger" ? "border-danger/30" : ""}`}>
      <h2 className={`font-display text-xl ${tone === "danger" ? "text-danger" : "text-ink"}`}>{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

// A hidden file input behind a normal button, keyboard-friendly.
function FilePicker({ accept, label, busy, onFile, variant = "secondary" }) {
  const input = useRef(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // the same file can be chosen again
          if (file) onFile(file);
        }}
      />
      <Button variant={variant} size="sm" busy={busy} onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  );
}

function useStatus() {
  const [status, setStatus] = useState(null); // { tone, text }
  useEffect(() => {
    if (status?.tone !== "success") return;
    const timer = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [status]);
  return [status, setStatus];
}

function Status({ status }) {
  if (!status) return null;
  return (
    <p role={status.tone === "error" ? "alert" : "status"} className={`mt-3 text-sm ${status.tone === "error" ? "text-danger" : "text-accent"}`}>
      {status.text}
    </p>
  );
}

function PhotoSection({ profile, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useStatus();

  async function choose(file) {
    // Checked here for a quick answer; the server checks the bytes regardless.
    if (!PHOTO_TYPES.includes(file.type)) return setStatus({ tone: "error", text: "Use a JPEG, PNG or WebP image." });
    if (file.size > PHOTO_MAX) return setStatus({ tone: "error", text: "The photo must be 1 MB or smaller." });
    setBusy(true);
    try {
      onSaved((await upload("/profile/photo", file)).profile);
      setStatus({ tone: "success", text: "Photo updated." });
    } catch (e) {
      setStatus({ tone: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      onSaved((await del("/profile/photo")).profile);
      setStatus({ tone: "success", text: "Photo removed." });
    } catch (e) {
      setStatus({ tone: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Photo" description="JPEG, PNG or WebP, up to 1 MB.">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar user={profile.user} size="h-20 w-20" text="text-2xl" />
        <div className="flex gap-2">
          <FilePicker accept={PHOTO_TYPES.join(",")} label={profile.photo ? "Replace photo" : "Upload photo"} busy={busy} onFile={choose} />
          {profile.photo && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={remove}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <Status status={status} />
    </Section>
  );
}

const DETAIL_FIELDS = [
  { key: "name", label: "Full name", max: 80, autoComplete: "name" },
  { key: "jobTitle", label: "Job title", max: 100, autoComplete: "organization-title", placeholder: "e.g. Backend Engineer" },
  { key: "phone", label: "Phone", max: 30, autoComplete: "tel", type: "tel", placeholder: "+91 98765 43210" },
  { key: "location", label: "Location", max: 100, autoComplete: "address-level2", placeholder: "City, country" },
  { key: "linkedin", label: "LinkedIn", max: 300, type: "url", placeholder: "https://linkedin.com/in/…" },
  { key: "website", label: "Website or GitHub", max: 300, type: "url", placeholder: "https://github.com/…" },
];

function checkDetails(values) {
  const errors = {};
  if (!/^[0-9+().\-\s]*$/.test(values.phone)) errors.phone = "Use digits, spaces and + ( ) - . only.";
  for (const key of ["linkedin", "website"]) {
    if (values[key] && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(values[key].trim())) errors[key] = "Enter a full web address starting with http:// or https://.";
  }
  return errors;
}

function DetailsSection({ profile, onSaved }) {
  const initial = Object.fromEntries([...DETAIL_FIELDS.map((f) => f.key), "bio"].map((k) => [k, profile[k] ?? ""]));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useStatus();
  const dirty = Object.keys(values).some((k) => values[k] !== (profile[k] ?? ""));
  const set = (key) => (e) => (setValues((v) => ({ ...v, [key]: e.target.value })), setErrors((x) => ({ ...x, [key]: undefined })));

  async function save(e) {
    e.preventDefault();
    const found = checkDetails(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const next = (await patch("/profile", values)).profile;
      onSaved(next);
      setValues(Object.fromEntries(Object.keys(values).map((k) => [k, next[k] ?? ""])));
      setStatus({ tone: "success", text: "Details saved." });
    } catch (err) {
      // Server messages look like "phone: Use digits…": show them on the field.
      const match = /^(\w+): (.*)$/.exec(err.message);
      if (match && match[1] in values) setErrors({ [match[1]]: match[2] });
      else setStatus({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Details" description="All optional.">
      <form onSubmit={save} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {DETAIL_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              type={f.type ?? "text"}
              autoComplete={f.autoComplete}
              placeholder={f.placeholder}
              maxLength={f.max}
              value={values[f.key]}
              onChange={set(f.key)}
              error={errors[f.key]}
            />
          ))}
        </div>
        <Field
          className="mt-4"
          label="Short bio"
          hint={`${values.bio.length}/500`}
          multiline
          rows={3}
          maxLength={500}
          value={values.bio}
          onChange={set("bio")}
          error={errors.bio}
        />
        <div className="mt-4 flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-muted">Unsaved changes</span>}
          <Button type="submit" busy={busy} disabled={!dirty}>
            Save details
          </Button>
        </div>
      </form>
      <Status status={status} />
    </Section>
  );
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ResumeSection({ profile, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useStatus();
  const resume = profile.resume;

  async function choose(file) {
    if (file.type && file.type !== "application/pdf") return setStatus({ tone: "error", text: "Use a PDF file." });
    if (file.size > RESUME_MAX) return setStatus({ tone: "error", text: "The résumé must be 4 MB or smaller." });
    setBusy(true);
    try {
      onSaved((await upload("/profile/resume", file, { "X-Filename": encodeURIComponent(file.name) })).profile);
      setStatus({ tone: "success", text: "Résumé uploaded." });
    } catch (e) {
      setStatus({ tone: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      onSaved((await del("/profile/resume")).profile);
      setStatus({ tone: "success", text: "Résumé removed." });
    } catch (e) {
      setStatus({ tone: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Résumé" description="One PDF, up to 4 MB. Stored for you to download; the app never reads it.">
      {resume ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-rule bg-paper px-4 py-3">
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded bg-danger-tint text-[10px] font-bold text-danger">
            PDF
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{resume.filename}</p>
            <p className="text-xs text-muted">
              {formatSize(resume.size)} · uploaded {new Date(resume.uploadedAt).toLocaleDateString()}
            </p>
          </div>
          <a href="/api/profile/resume" className="rounded-md px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-accent-tint">
            Download
          </a>
          <FilePicker accept="application/pdf" label="Replace" busy={busy} onFile={choose} />
          <Button variant="ghost" size="sm" disabled={busy} onClick={remove}>
            Remove
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-rule-strong px-4 py-4">
          <p className="text-sm text-muted">No résumé uploaded yet.</p>
          <FilePicker accept="application/pdf" label="Upload résumé" busy={busy} onFile={choose} variant="primary" />
        </div>
      )}
      <Status status={status} />
    </Section>
  );
}

function EmailSection({ profile, onSaved }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useStatus();

  async function save(e) {
    e.preventDefault();
    const found = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = "Enter a valid email address.";
    if (!password) found.password = "Enter your current password.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      onSaved((await post("/account/email", { email, currentPassword: password })).user);
      setEmail("");
      setPassword("");
      setStatus({ tone: "success", text: "Email changed. Use it next time you sign in." });
    } catch (err) {
      if (err.code === "WRONG_PASSWORD") setErrors({ password: err.message });
      else if (err.code === "EMAIL_TAKEN") setErrors({ email: err.message });
      else setStatus({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Email" description={`You sign in with ${profile.email}.`}>
      <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="New email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Field label="Current password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" busy={busy}>
            Change email
          </Button>
        </div>
      </form>
      <Status status={status} />
    </Section>
  );
}

function PasswordSection() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useStatus();
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const found = {};
    if (!form.current) found.current = "Enter your current password.";
    if (form.next.length < PASSWORD_MIN) found.next = `Password must be at least ${PASSWORD_MIN} characters.`;
    else if (form.next !== form.confirm) found.confirm = "The two new passwords do not match.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await post("/account/password", { currentPassword: form.current, newPassword: form.next });
      setForm({ current: "", next: "", confirm: "" });
      setStatus({ tone: "success", text: "Password changed. Your other devices were signed out." });
    } catch (err) {
      if (err.code === "WRONG_PASSWORD") setErrors({ current: err.message });
      else setStatus({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Password" description="Changing it signs you out everywhere else.">
      <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password" type="password" autoComplete="current-password" value={form.current} onChange={set("current")} error={errors.current} />
        <Field label="New password" type="password" autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters.`} value={form.next} onChange={set("next")} error={errors.next} />
        <Field label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} error={errors.confirm} />
        <div className="flex justify-end sm:col-span-3">
          <Button type="submit" busy={busy}>
            Change password
          </Button>
        </div>
      </form>
      <Status status={status} />
    </Section>
  );
}

// google: the account has no password, so typing its email confirms instead.
function DeleteSection({ google, email }) {
  const router = useRouter();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function confirm(e) {
    e?.preventDefault();
    if (!password) return setError(google ? "Type your email to confirm." : "Enter your password to confirm.");
    if (google && password.trim().toLowerCase() !== email) return setError("Type your account's email exactly to confirm.");
    setBusy(true);
    try {
      await post("/account/delete", google ? { confirmEmail: password } : { password });
      session.signedOutLocally();
      router.replace("/");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Section title="Delete account" tone="danger" description="Removes your account, every kit, your practice history, photo and résumé. This cannot be undone.">
      <Button variant="danger" size="sm" onClick={() => (setOpen(true), setPassword(""), setError(null))}>
        Delete my account
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account?"
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" busy={busy} onClick={confirm}>
              Delete everything
            </Button>
          </>
        }
      >
        <form onSubmit={confirm}>
          <p>Your account, kits, practice history and files are removed for good.</p>
          {google ? (
            <Field className="mt-3" label={`Type ${email} to confirm`} type="email" autoComplete="off" value={password} onChange={(e) => (setPassword(e.target.value), setError(null))} error={error} />
          ) : (
            <Field className="mt-3" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => (setPassword(e.target.value), setError(null))} error={error} />
          )}
        </form>
      </Dialog>
    </Section>
  );
}
