/**
 * In-memory signaling store for interview rooms.
 * Each room has two peers (host = candidate, guest = interviewer).
 * Signals are queued per-peer and consumed via polling.
 */

export interface InterviewRoom {
  id: string;
  hostName: string;
  resumeSlug: string | null; // optional interactive resume to show
  createdAt: number;
  peers: Set<string>; // peer ids present
  signals: Map<string, unknown[]>; // peerId -> queued signals FOR that peer
}

const rooms = new Map<string, InterviewRoom>();

export function createRoom(id: string, hostName: string, resumeSlug: string | null): InterviewRoom {
  const room: InterviewRoom = {
    id,
    hostName,
    resumeSlug,
    createdAt: Date.now(),
    peers: new Set(),
    signals: new Map(),
  };
  rooms.set(id, room);
  return room;
}

export function getRoom(id: string): InterviewRoom | undefined {
  return rooms.get(id);
}

export function joinRoom(roomId: string, peerId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  if (room.peers.size >= 2 && !room.peers.has(peerId)) return false;
  room.peers.add(peerId);
  if (!room.signals.has(peerId)) room.signals.set(peerId, []);
  return true;
}

export function pushSignal(roomId: string, fromPeerId: string, signal: unknown): void {
  const room = rooms.get(roomId);
  if (!room) return;
  // Push to the OTHER peer's queue
  for (const peerId of room.peers) {
    if (peerId !== fromPeerId) {
      const queue = room.signals.get(peerId) ?? [];
      queue.push(signal);
      room.signals.set(peerId, queue);
    }
  }
}

export function drainSignals(roomId: string, peerId: string): unknown[] {
  const room = rooms.get(roomId);
  if (!room) return [];
  const queue = room.signals.get(peerId) ?? [];
  room.signals.set(peerId, []);
  return queue;
}

export function leaveRoom(roomId: string, peerId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  room.peers.delete(peerId);
  room.signals.delete(peerId);
  if (room.peers.size === 0) {
    rooms.delete(roomId);
  }
}

export function getRoomInfo(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return {
    id: room.id,
    hostName: room.hostName,
    resumeSlug: room.resumeSlug,
    peerCount: room.peers.size,
    createdAt: room.createdAt,
  };
}

// Clean up rooms older than 4 hours
setInterval(() => {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  for (const [id, room] of rooms) {
    if (room.createdAt < cutoff) rooms.delete(id);
  }
}, 60 * 1000);
