import { Suspense } from "react";
import { PracticePage } from "@/components/practice/practice-page";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Practise · InterviewCompass" };

// useParams needs a Suspense boundary under cacheComponents.
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PracticePage />
    </Suspense>
  );
}
