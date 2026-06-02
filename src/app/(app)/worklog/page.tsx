import { WorklogPage } from "@/components/worklog/worklog-page";
import { CareerAnalyticsBanner } from "@/components/career-analytics-banner";

export const metadata = {
  title: "Worklog · Resumsify",
};

export default function Page() {
  return (
    <div className="flex h-full flex-col">
      <CareerAnalyticsBanner section="activity" />
      <div className="flex-1 min-h-0">
        <WorklogPage />
      </div>
    </div>
  );
}
