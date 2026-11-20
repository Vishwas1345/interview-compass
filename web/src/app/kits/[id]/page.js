import { Suspense } from "react";
import { KitPage } from "@/components/kit-page";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Kit · InterviewCompass" };

// useParams/useSearchParams need a Suspense boundary under cacheComponents.
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <KitPage />
    </Suspense>
  );
}
