import { CareerLayoutMock } from "./prototype/CareerLayoutMock";
import { ProfornaChatMock } from "./prototype/ProfornaChatMock";
import { ProfornaShellMock } from "./prototype/ProfornaShellMock";

export type DevPrototype = "chat" | "shell" | "career-layout";

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
  return null;
}

export function DevPrototypeScreen({ kind }: { kind: DevPrototype }) {
  if (kind === "chat") return <ProfornaChatMock />;
  if (kind === "shell") return <ProfornaShellMock />;
  return <CareerLayoutMock />;
}
