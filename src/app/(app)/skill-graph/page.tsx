import SkillGraph from "@/components/skill-graph";
import { CareerAnalyticsBanner } from "@/components/career-analytics-banner";

export default function SkillGraphPage() {
  return (
    <div className="container mx-auto p-4 md:p-6 max-w-[1600px]">
      <CareerAnalyticsBanner section="evidence" className="mb-4" />
      <SkillGraph />
    </div>
  );
}
