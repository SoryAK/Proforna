import type { CareerFile } from "@core/career-file";
import type { DetailTab } from "./RoleDetailPanel";
import { WorkMap } from "./WorkMap";

export function WorkHistory({
  career,
  careerError,
  focusJobId,
  focusTab,
  mapRevision = 0,
  onHome,
}: {
  career: CareerFile;
  careerError: string | null;
  focusJobId?: string | null;
  focusTab?: DetailTab;
  mapRevision?: number;
  onHome: () => void;
}) {
  return (
    <WorkMap
      fallbackCareer={career}
      error={careerError}
      focusRoleId={focusJobId}
      focusTab={focusTab}
      mapRevision={mapRevision}
      onHome={onHome}
    />
  );
}
