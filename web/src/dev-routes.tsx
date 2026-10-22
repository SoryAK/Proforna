import { CareerLayoutMock } from "./prototype/CareerLayoutMock";
import { NotesOnPinsMock } from "./prototype/NotesOnPinsMock";
import { MapGraphicMock } from "./prototype/MapGraphicMock";
import { DutyCompareMock } from "./prototype/DutyCompareMock";
import { OnboardingMock } from "./prototype/OnboardingMock";
import { ProfornaChatMock } from "./prototype/ProfornaChatMock";
import { ProfornaShellMock } from "./prototype/ProfornaShellMock";
import { SidebarCareerMock } from "./prototype/SidebarCareerMock";
import { RolePageMock } from "./prototype/RolePageMock";

export type DevPrototype =
  | "chat"
  | "shell"
  | "career-layout"
  | "sidebar-career"
  | "map-graphic"
  | "onboarding"
  | "duty-compare"
  | "notes-on-pins"
  | "role-page";

function hashPath(): string {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0];
}

export function readReviewOnboarding(): boolean {
  if (!import.meta.env.DEV) return false;
  return hashPath() === "onboarding";
}

export function readDevPrototype(): DevPrototype | null {
  if (!import.meta.env.DEV) return null;
  const path = hashPath();
  if (path === "prototype/chat") return "chat";
  if (path === "prototype/shell") return "shell";
  if (path === "prototype/career-layout") return "career-layout";
  if (path === "prototype/sidebar-career") return "sidebar-career";
  if (path === "prototype/map-graphic") return "map-graphic";
  if (path === "prototype/onboarding") return "onboarding";
  if (path === "prototype/duty-compare") return "duty-compare";
  if (path === "prototype/notes-on-pins") return "notes-on-pins";
  if (path === "prototype/role-page") return "role-page";
  return null;
}

export function DevPrototypeScreen({ kind }: { kind: DevPrototype }) {
  if (kind === "chat") return <ProfornaChatMock />;
  if (kind === "shell") return <ProfornaShellMock />;
  if (kind === "career-layout") return <CareerLayoutMock />;
  if (kind === "sidebar-career") return <SidebarCareerMock />;
  if (kind === "map-graphic") return <MapGraphicMock />;
  if (kind === "duty-compare") return <DutyCompareMock />;
  if (kind === "notes-on-pins") return <NotesOnPinsMock />;
  if (kind === "role-page") return <RolePageMock />;
  return <OnboardingMock />;
}
