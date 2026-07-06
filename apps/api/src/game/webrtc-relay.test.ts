import { describe, expect, it, vi } from "vitest";
import { relaySignal, type SignalPeer } from "./webrtc-relay";

function makePeer(connectionId: string): SignalPeer & { emit: ReturnType<typeof vi.fn> } {
  return { connectionId, emit: vi.fn() };
}

describe("relaySignal", () => {
  it("forwards to every other peer, excluding the sender", () => {
    const sender = makePeer("conn-a");
    const peerB = makePeer("conn-b");
    const peerC = makePeer("conn-c");

    const delivered = relaySignal([sender, peerB, peerC], "conn-a", "webrtc:offer", { sdp: "x" });

    expect(delivered).toBe(2);
    expect(sender.emit).not.toHaveBeenCalled();
    expect(peerB.emit).toHaveBeenCalledWith("webrtc:offer", { sdp: "x" });
    expect(peerC.emit).toHaveBeenCalledWith("webrtc:offer", { sdp: "x" });
  });

  it("delivers to zero peers when the sender is alone (solo-vs-bot today)", () => {
    const sender = makePeer("conn-a");
    const delivered = relaySignal([sender], "conn-a", "webrtc:ice-candidate", { candidate: "x" });
    expect(delivered).toBe(0);
  });

  it("passes the payload through untouched, regardless of shape", () => {
    const sender = makePeer("conn-a");
    const peer = makePeer("conn-b");
    const payload = { matchId: "m1", data: { type: "answer", sdp: "opaque-sdp-blob" } };

    relaySignal([sender, peer], "conn-a", "webrtc:answer", payload);

    expect(peer.emit).toHaveBeenCalledWith("webrtc:answer", payload);
  });
});
