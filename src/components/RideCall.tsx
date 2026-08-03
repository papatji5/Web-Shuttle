"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  sendCallOffer,
  onCallOffer,
  sendCallAnswer,
  onCallAnswer,
  sendIceCandidate,
  onIceCandidate,
} from "@/lib/rideSocket";

export default function RideCall({ rideId }: { rideId: string }) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleRemoteStream = (event: RTCTrackEvent) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    const handleOffer = async (data: any) => {
      try {
        if (!peerConnectionRef.current) {
          setupPeerConnection();
        }
        const pc = peerConnectionRef.current!;
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendCallAnswer(rideId, answer);
      } catch (e) {
        console.error("Offer handling error:", e);
      }
    };

    const handleAnswer = async (data: any) => {
      try {
        const pc = peerConnectionRef.current;
        if (pc && pc.remoteDescription === null) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      } catch (e) {
        console.error("Answer handling error:", e);
      }
    };

    const handleIceCandidate = async (data: any) => {
      try {
        const pc = peerConnectionRef.current;
        if (pc && data.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (e) {
        console.error("ICE candidate error:", e);
      }
    };

    const off1 = onCallOffer(handleOffer);
    const off2 = onCallAnswer(handleAnswer);
    const off3 = onIceCandidate(handleIceCandidate);

    return () => {
      off1();
      off2();
      off3();
    };
  }, [rideId]);

  const setupPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
    });

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendIceCandidate(rideId, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        endCall();
      }
    };

    peerConnectionRef.current = pc;
  };

  const startCall = async () => {
    try {
      setError(null);
      if (!peerConnectionRef.current) {
        setupPeerConnection();
      }
      const pc = peerConnectionRef.current!;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: isAudioEnabled,
        video: isVideoEnabled ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendCallOffer(rideId, offer);
      setIsCallActive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      console.error("Start call error:", e);
    }
  };

  const endCall = () => {
    const pc = peerConnectionRef.current;
    if (pc) {
      pc.close();
      peerConnectionRef.current = null;
    }

    if (localVideoRef.current && localVideoRef.current.srcObject) {
      (localVideoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
      localVideoRef.current.srcObject = null;
    }

    setIsCallActive(false);
  };

  const toggleAudio = () => {
    const pc = peerConnectionRef.current;
    if (pc && localVideoRef.current?.srcObject) {
      const stream = localVideoRef.current.srcObject as MediaStream;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  const toggleVideo = () => {
    const pc = peerConnectionRef.current;
    if (pc && localVideoRef.current?.srcObject) {
      const stream = localVideoRef.current.srcObject as MediaStream;
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  return (
    <div className="card stack">
      <h3>Call</h3>
      {error && <div className="alert"><strong>Error:</strong> {error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div>
          <p style={{ fontSize: "12px", color: "#94a3b8" }}>You</p>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            style={{
              width: "100%",
              borderRadius: "4px",
              backgroundColor: "#0f172a",
              maxHeight: "300px",
            }}
          />
        </div>
        <div>
          <p style={{ fontSize: "12px", color: "#94a3b8" }}>Other</p>
          <video
            ref={remoteVideoRef}
            autoPlay
            style={{
              width: "100%",
              borderRadius: "4px",
              backgroundColor: "#0f172a",
              maxHeight: "300px",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {!isCallActive ? (
          <button onClick={startCall} className="btn btn-primary">
            Start Call
          </button>
        ) : (
          <>
            <button
              onClick={toggleAudio}
              className={`btn ${isAudioEnabled ? "btn-primary" : "btn"}`}
              title={isAudioEnabled ? "Mute" : "Unmute"}
            >
              {isAudioEnabled ? "🔊 Audio On" : "🔇 Audio Off"}
            </button>
            <button
              onClick={toggleVideo}
              className={`btn ${isVideoEnabled ? "btn-primary" : "btn"}`}
              title={isVideoEnabled ? "Stop video" : "Start video"}
            >
              {isVideoEnabled ? "📹 Video On" : "📹 Video Off"}
            </button>
            <button onClick={endCall} className="btn">
              End Call
            </button>
          </>
        )}
      </div>
    </div>
  );
}
