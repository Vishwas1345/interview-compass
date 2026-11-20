"use client";

import { useSession } from "@/components/session";
import { ButtonLink } from "@/components/ui";

export function HomeActions() {
  const session = useSession();
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {session.status === "signedIn" ? (
        <ButtonLink href="/kits">Open my kits</ButtonLink>
      ) : (
        <>
          <ButtonLink href="/register">Create an account</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            Sign in
          </ButtonLink>
        </>
      )}
    </div>
  );
}
