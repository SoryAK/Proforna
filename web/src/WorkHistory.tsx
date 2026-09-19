import type { CareerFile } from "@core/career-file";
import { WorkMap } from "./WorkMap";

export function WorkHistory({
  career,
  careerError,
  focusJobId,
}: {
  career: CareerFile;
  careerError: string | null;
  focusJobId?: string | null;
}) {
  return (
    <WorkMap
      fallbackCareer={career}
      error={careerError}
      focusRoleId={focusJobId}
    />
  );
}
