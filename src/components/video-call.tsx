"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Loader2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  roomId: string;
  peerId: string;
  onLeave: () => void;
}

export function VideoCall({ roomId, peerId, onLeave }: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [connected, setConnected] = useState(false);
  const [waitingForPeer, setWaitingForPeer] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [initiator, setInitiator] = useState(false);
  const [ready, setReady] = useState(false);

  // Join room and determine if initiator
  const joinAndSetup = useCallback(async () => {
    try {
      // Join via signal API
      const joinRes = await fetch("/api/interview-room/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, peerId, action: "join" }),
      });
      if (!joinRes.ok) {
        const err = await joinRes.json();
        toast.error(err.error || "Failed to join room");
        return;
      }

      // Check room info to determine if we're the initiator (first peer)
      const roomRes = await fetch(`/api/interview-room?roomId=${roomId}`);
      const room = await roomRes.json();
      const isInitiator = room.peerCount <= 1;
      setInitiator(isInitiator);

      if (isInitiator) {
        setWaitingForPeer(true);
      }

      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setReady(true);

      if (!isInitiator) {
        // Guest: create peer immediately as non-initiator,
        // then start polling for the initiator's offer
        createPeer(false, stream);
      }

      // Start polling for signals
      startPolling(stream, isInitiator);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast.error("Camera/mic permission denied");
      } else {
        toast.error("Failed to set up media");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, peerId]);

  function createPeer(isInitiator: boolean, stream: MediaStream) {
    // Dynamic import simple-peer (client-only)
    import("simple-peer").then(({ default: Peer }) => {
      const peer = new Peer({
        initiator: isInitiator,
        stream,
        trickle: true,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      });

      peer.on("signal", async (signal) => {
        await fetch("/api/interview-room/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, peerId, action: "signal", signal }),
        });
      });

      peer.on("stream", (remoteStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setConnected(true);
        setWaitingForPeer(false);
      });

      peer.on("close", () => {
        setConnected(false);
        toast.info("Peer disconnected");
      });

      peer.on("error", (err) => {
        console.error("Peer error:", err);
      });

      peerRef.current = peer;
    });
  }

  function startPolling(stream: MediaStream, isInit: boolean) {
    let peerCreated = !isInit; // guest already has peer created

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/interview-room/signal?roomId=${roomId}&peerId=${peerId}`
        );
        const data = await res.json();

        if (data.signals && data.signals.length > 0) {
          // If initiator hasn't created peer yet, the arrival of a signal
          // means the guest joined — create the initiator peer now
          if (isInit && !peerCreated) {
            createPeer(true, stream);
            peerCreated = true;
            // Wait tiny bit for peer to init before feeding signals
            await new Promise((r) => setTimeout(r, 100));
          }

          for (const signal of data.signals) {
            if (peerRef.current && !peerRef.current.destroyed) {
              peerRef.current.signal(signal);
            }
          }
        }

        // Also check room peer count to detect if guest arrived
        if (isInit && !peerCreated) {
          const roomRes = await fetch(`/api/interview-room?roomId=${roomId}`);
          const room = await roomRes.json();
          if (room.peerCount >= 2) {
            createPeer(true, stream);
            peerCreated = true;
          }
        }
      } catch {
        // Network hiccup — ignore
      }
    }, 1000);
  }

  // Toggle video
  function toggleVideo() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setVideoEnabled((v) => !v);
  }

  // Toggle audio
  function toggleAudio() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setAudioEnabled((a) => !a);
  }

  // Screen share
  async function toggleScreenShare() {
    if (screenSharing) {
      // Stop screen share, restore camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const camStream = localStreamRef.current;
      if (camStream && peerRef.current && !peerRef.current.destroyed) {
        const camTrack = camStream.getVideoTracks()[0];
        if (camTrack) {
          peerRef.current.replaceTrack(
            peerRef.current.streams[0]?.getVideoTracks()[0] ?? camTrack,
            camTrack,
            camStream
          );
        }
      }
      if (localVideoRef.current && camStream) {
        localVideoRef.current.srcObject = camStream;
      }
      setScreenSharing(false);
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStreamRef.current = screenStream;

      const screenTrack = screenStream.getVideoTracks()[0];
      if (peerRef.current && !peerRef.current.destroyed && localStreamRef.current) {
        const currentTrack = localStreamRef.current.getVideoTracks()[0];
        if (currentTrack) {
          peerRef.current.replaceTrack(currentTrack, screenTrack, localStreamRef.current);
        }
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      screenTrack.onended = () => {
        toggleScreenShare();
      };

      setScreenSharing(true);
    } catch {
      toast.error("Screen share cancelled or not supported");
    }
  }

  // Leave
  function handleLeave() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (peerRef.current && !peerRef.current.destroyed) peerRef.current.destroy();

    fetch("/api/interview-room/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, peerId, action: "leave" }),
    }).catch(() => {});

    onLeave();
  }

  useEffect(() => {
    joinAndSetup();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (peerRef.current && !peerRef.current.destroyed) peerRef.current.destroy();
    };
  }, [joinAndSetup]);

  return (
    <div className="flex flex-col h-full">
      {/* Video area */}
      <div className="flex-1 relative bg-gray-950 rounded-lg overflow-hidden">
        {/* Remote video (large) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />

        {!connected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-950/90">
            {waitingForPeer ? (
              <>
                <Users className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-lg font-medium">Waiting for interviewer to join...</p>
                <p className="text-sm text-gray-400 mt-1">
                  Share the room link to get started
                </p>
              </>
            ) : !ready ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p>Setting up camera...</p>
              </>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p>Connecting...</p>
              </>
            )}
          </div>
        )}

        {/* Local video (picture-in-picture) */}
        <div className="absolute bottom-4 right-4 w-48 aspect-video rounded-lg overflow-hidden border-2 border-white/20 shadow-lg bg-gray-900">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover mirror"
          />
          {!videoEnabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <VideoOff className="h-6 w-6 text-gray-500" />
            </div>
          )}
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-center gap-3 py-4">
        <Button
          variant={videoEnabled ? "outline" : "destructive"}
          size="icon"
          onClick={toggleVideo}
          title={videoEnabled ? "Turn off camera" : "Turn on camera"}
        >
          {videoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>

        <Button
          variant={audioEnabled ? "outline" : "destructive"}
          size="icon"
          onClick={toggleAudio}
          title={audioEnabled ? "Mute" : "Unmute"}
        >
          {audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>

        <Button
          variant={screenSharing ? "default" : "outline"}
          size="icon"
          onClick={toggleScreenShare}
          title={screenSharing ? "Stop sharing" : "Share screen"}
        >
          {screenSharing ? (
            <MonitorOff className="h-5 w-5" />
          ) : (
            <Monitor className="h-5 w-5" />
          )}
        </Button>

        <Button variant="destructive" size="icon" onClick={handleLeave} title="Leave call">
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
