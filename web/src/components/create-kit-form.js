"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";
import { RequireAuth } from "@/components/session";
import { Alert, Button, ButtonLink, Card, Dialog, Field, Skeleton } from "@/components/ui";

const JD_MAX = 20000; // what the pipeline reads (MAX_JD_CHARS)
const DRAFT_KEY = "ic:create-draft"; // survives a sign-in round trip (spec: session ended)

export function CreateKitForm() {
  return (
    <RequireAuth fallback={<Skeleton className="h-96 w-full" />}>
      <CreateKitFormInner />
    </RequireAuth>
  );
}

function CreateKitFormInner() {
  const router = useRouter();
  const [form, setForm] = useState({ jd: "", company_url: "", days: "5" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState(null); // { existing, sameDays }

  // Restore and keep a draft, so an expired session never loses a pasted posting.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage
      if (saved) setForm(saved);
    } catch {
      // no draft
    }
  }, []);
  const update = (field) => (event) => {
    const next = { ...form, [field]: event.target.value };
    setForm(next);
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  };

  function validate() {
    const found = {};
    if (!form.jd.trim()) found.jd = "Paste the job description.";
    else if (form.jd.length > JD_MAX) found.jd = `The job description is longer than ${JD_MAX.toLocaleString()} characters.`;
    if (!form.company_url.trim()) found.company_url = "Enter the company website.";
    const days = Number(form.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) found.days = "Days must be a whole number from 1 to 365.";
    return found;
  }

  async function submit(event, { force = false } = {}) {
    event?.preventDefault();
    if (busy) return; // a second click while sending does nothing
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const { kit } = await post("/kits", { jd: form.jd, company_url: form.company_url.trim(), days: Number(form.days), ...(force ? { force: true } : {}) });
      sessionStorage.removeItem(DRAFT_KEY);
      router.push(`/kits/${kit.id}`);
    } catch (error) {
      setBusy(false);
      if (error.code === "DUPLICATE") return setDuplicate(error.details);
      if (error.code === "GENERATION_RUNNING") {
        return setFormError({ message: error.message, href: `/kits/${error.details.existing?.id}`, label: "Open the running kit" });
      }
      if (error.code === "VALIDATION") return setFormError({ message: error.message });
      setFormError({ message: error.message });
    }
  }

  const existing = duplicate?.existing;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">New prep kit</h1>
      <p className="mt-1 text-sm text-zinc-600">Generation takes about one to two minutes. You can leave the page; it keeps going.</p>
      <Card className="mt-6 p-5">
        <form onSubmit={submit} noValidate className="space-y-5">
          <Field
            label="Job description"
            hint="Paste the whole posting. Requirements are taken from it word for word."
            multiline
            rows={12}
            value={form.jd}
            onChange={update("jd")}
            error={errors.jd}
            maxLength={JD_MAX + 1000}
          />
          <p className="-mt-3 text-right text-xs text-zinc-500">
            {form.jd.length.toLocaleString()} / {JD_MAX.toLocaleString()}
          </p>
          <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
            <Field label="Company website" placeholder="acme.com" inputMode="url" value={form.company_url} onChange={update("company_url")} error={errors.company_url} />
            <Field label="Days to prepare" type="number" min={1} max={365} inputMode="numeric" value={form.days} onChange={update("days")} error={errors.days} />
          </div>
          {formError && (
            <Alert action={formError.href && <ButtonLink href={formError.href} size="sm" variant="secondary">{formError.label}</ButtonLink>}>
              {formError.message}
            </Alert>
          )}
          <div className="flex justify-end">
            <Button type="submit" busy={busy}>
              Generate kit
            </Button>
          </div>
        </form>
      </Card>

      <Dialog
        open={Boolean(duplicate)}
        onClose={() => setDuplicate(null)}
        title="You already have a kit for this posting and company"
        actions={
          existing && (
            <>
              <Button variant="secondary" onClick={(e) => (setDuplicate(null), submit(e, { force: true }))}>
                Create a new one anyway
              </Button>
              {!duplicate.sameDays && (
                <ButtonLink href={`/kits/${existing.id}?setDays=${Number(form.days)}`} variant="secondary">
                  Open it and change to {form.days} days
                </ButtonLink>
              )}
              <ButtonLink href={`/kits/${existing.id}`}>Open it</ButtonLink>
            </>
          )
        }
      >
        {existing && (
          <p>
            <strong>{existing.role || existing.company}</strong> ({existing.days} {existing.days === 1 ? "day" : "days"}), created{" "}
            {new Date(existing.createdAt).toLocaleString()}. A new kit researches everything again;
            {duplicate.sameDays ? " opening the existing one is instant." : " changing the days only rebuilds the schedule."}
          </p>
        )}
      </Dialog>
    </div>
  );
}
