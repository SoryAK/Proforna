import { NextResponse } from "next/server";

/** @deprecated This route is no longer needed after CurrentPosition→WorkHistory unification */
export async function PATCH() {
  return NextResponse.json({ error: "Deprecated — positions are now unified in WorkHistory" }, { status: 410 });
}
