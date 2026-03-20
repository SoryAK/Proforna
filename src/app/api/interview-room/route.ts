import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { createRoom, getRoomInfo } from "@/lib/interview-rooms";

/** POST — create a new interview room */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const hostName = typeof body.hostName === "string" ? body.hostName.trim() : "Host";
  const resumeSlug = typeof body.resumeSlug === "string" ? body.resumeSlug : null;

  const roomId = uuid().slice(0, 8); // short 8-char code
  createRoom(roomId, hostName, resumeSlug);

  return NextResponse.json({ roomId }, { status: 201 });
}

/** GET — get room info (public, no auth) */
export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get("roomId");
  if (!roomId) {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }

  const info = getRoomInfo(roomId);
  if (!info) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json(info);
}
