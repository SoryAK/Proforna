import { JobAssetsPage } from "@/components/job-assets-page";

export const metadata = {
  title: "Job Assets · Resumsify",
};

export default function Page() {
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <JobAssetsPage />
    </div>
  );
}
