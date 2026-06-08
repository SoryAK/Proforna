import { redirect } from "next/navigation";

/**
 * The standalone /integrations page was folded into the unified Settings
 * dialog (see ADR-0019). This redirect keeps any old bookmarks / OAuth
 * callbacks pointed here landing on the Settings dialog's Integrations tab.
 */
export default function IntegrationsRedirect() {
  redirect("/dashboard?settings=integrations");
}
