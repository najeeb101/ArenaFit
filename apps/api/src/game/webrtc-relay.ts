export interface SignalPeer {
  connectionId: string;
  emit(event: string, payload: unknown): void;
}

/**
 * Relays a WebRTC signaling message (SDP offer/answer or ICE candidate) from
 * the sender to every other peer in the group. The server never inspects
 * `payload` — it's opaque data exchanged by the browsers' RTCPeerConnections.
 * Returns how many peers received it, so callers can detect a match with no
 * other human participant (e.g. today's solo-vs-bot matches) without erroring.
 */
export function relaySignal(
  peers: SignalPeer[],
  senderConnectionId: string,
  event: string,
  payload: unknown,
): number {
  let delivered = 0;
  for (const peer of peers) {
    if (peer.connectionId === senderConnectionId) continue;
    peer.emit(event, payload);
    delivered++;
  }
  return delivered;
}
