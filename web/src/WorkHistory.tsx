import type { CareerFile } from "@core/career-file";
import type { DetailTab } from "./RoleDetailPanel";
import { WorkMap } from "./WorkMap";

export function WorkHistory({
  career,
  careerError,
  focusJobId,
  focusTab,
  mapRevision = 0,
  careerRevision = 0,
  canvasFromNav = false,
  onHome,
}: {
  career: CareerFile;
  careerError: string | null;
  focusJobId?: string | null;
  focusTab?: DetailTab;
  mapRevision?: number;
  careerRevision?: number;
  canvasFromNav?: boolean;
  onHome: () => void;
}) {
  return (
    <WorkMap
      fallbackCareer={career}
      error={careerError}
      focusRoleId={focusJobId}
      focusTab={focusTab}
      mapRevision={mapRevision}
      careerRevision={careerRevision}
      canvasFromNav={canvasFromNav}
      onHome={onHome}
    />
  );
}
