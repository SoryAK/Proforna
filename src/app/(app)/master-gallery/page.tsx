import { Suspense } from "react";
import { MasterGalleryPage } from "@/components/master-gallery/master-gallery-page";

export const metadata = {
  title: "Master Gallery · Resumsify",
};

export default function Page() {
  // Suspense wrapper required: useSearchParams() suspends on the
  // server during Next 15+ static generation.
  return (
    <Suspense fallback={null}>
      <MasterGalleryPage />
    </Suspense>
  );
}
