import { CareerLayoutMock } from "./prototype/CareerLayoutMock";
import { MapGraphicMock } from "./prototype/MapGraphicMock";
import { OnboardingMock } from "./prototype/OnboardingMock";
import { ProfornaChatMock } from "./prototype/ProfornaChatMock";
import { ProfornaShellMock } from "./prototype/ProfornaShellMock";
import { SidebarCareerMock } from "./prototype/SidebarCareerMock";

export type DevPrototype =
  | "chat"
  | "shell"
  | "career-layout"
  | "sidebar-career"
  | "map-graphic"
  | "onboarding";

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
  return null;
}

export function DevPrototypeScreen({ kind }: { kind: DevPrototype }) {
  if (kind === "chat") return <ProfornaChatMock />;
  if (kind === "shell") return <ProfornaShellMock />;
  if (kind === "career-layout") return <CareerLayoutMock />;
  if (kind === "sidebar-career") return <SidebarCareerMock />;
  if (kind === "map-graphic") return <MapGraphicMock />;
  return <OnboardingMock />;
}
