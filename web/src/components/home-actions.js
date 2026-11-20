"use client";

import { useSession } from "@/components/session";
import { ButtonLink } from "@/components/ui";

export function HomeActions() {
  const session = useSession();
  return (
    <div className="mt-9 flex flex-wrap items-center gap-3">
      {session.status === "signedIn" ? (
        <ButtonLink href="/kits" className="h-11 px-5 text-[15px]">
          Open my kits
        </ButtonLink>
      ) : (
        <>
          <ButtonLink href="/register" className="h-11 px-5 text-[15px]">
            Build your first kit
          </ButtonLink>
          <ButtonLink href="/login" variant="ghost" className="h-11 px-4 text-[15px]">
            I have an account
          </ButtonLink>
        </>
      )}
    </div>
  );
}
