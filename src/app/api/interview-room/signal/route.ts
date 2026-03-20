import { NextRequest, NextResponse } from "next/server";
import { joinRoom, pushSignal, drainSignals, leaveRoom } from "@/lib/interview-rooms";

/**
 * POST — send a signal or join/leave a room
 * Body: { roomId, peerId, action: "join" | "signal" | "leave", signal? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { roomId, peerId, action, signal } = body as {
    roomId: string;
    peerId: string;
    action: "join" | "signal" | "leave";
    signal?: unknown;
  };

  if (!roomId || !peerId || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (action === "join") {
    const ok = joinRoom(roomId, peerId);
    if (!ok) {
      return NextResponse.json({ error: "Room full or not found" }, { status: 403 });
    }
    return NextResponse.json({ joined: true });
  }

  if (action === "signal") {
    pushSignal(roomId, peerId, signal);
    return NextResponse.json({ sent: true });
  }

  if (action === "leave") {
    leaveRoom(roomId, peerId);
    return NextResponse.json({ left: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/**
 * GET — poll for signals addressed to this peer
 * Query: ?roomId=xxx&peerId=yyy
 */
export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get("roomId");
  const peerId = req.nextUrl.searchParams.get("peerId");

  if (!roomId || !peerId) {
    return NextResponse.json({ error: "Missing roomId or peerId" }, { status: 400 });
  }

  const signals = drainSignals(roomId, peerId);
  return NextResponse.json({ signals });
}
