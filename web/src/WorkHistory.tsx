import type { CareerFile } from "@core/career-file";
import { WorkMap } from "./WorkMap";

export function WorkHistory({
  career,
  careerError,
  focusJobId,
  mapRevision = 0,
  onHome,
}: {
  career: CareerFile;
  careerError: string | null;
  focusJobId?: string | null;
  mapRevision?: number;
  onHome: () => void;
}) {
  return (
    <WorkMap
      fallbackCareer={career}
      error={careerError}
      focusRoleId={focusJobId}
      mapRevision={mapRevision}
      onHome={onHome}
    />
  );
}
