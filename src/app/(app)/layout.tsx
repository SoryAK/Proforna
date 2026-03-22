import { LayoutShell } from "@/components/layout-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <LayoutShell>{children}</LayoutShell>;
}
