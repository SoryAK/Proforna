import type { CareerFile } from "@core/career-file";
import { WorkMap } from "./WorkMap";

export function WorkHistory({
  career,
  careerError,
  focusJobId,
  onHome,
}: {
  career: CareerFile;
  careerError: string | null;
  focusJobId?: string | null;
  onHome: () => void;
}) {
  return (
    <WorkMap
      fallbackCareer={career}
      error={careerError}
      focusRoleId={focusJobId}
      onHome={onHome}
    />
  );
}
