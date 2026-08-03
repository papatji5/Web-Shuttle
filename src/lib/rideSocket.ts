import { getSocket } from './socket';

type UserMeta = { userId?: string; role?: 'DRIVER' | 'PASSENGER' };

export function joinRide(rideId: string, meta: UserMeta = {}) {
  const s = getSocket();
  console.debug('joinRide', rideId, meta);
  s.emit('joinRide', { rideId, meta });
}

export function leaveRide(rideId: string) {
  const s = getSocket();
  console.debug('leaveRide', rideId);
  s.emit('leaveRide', { rideId });
}

export function emitRideAccepted(rideId: string, payload: any) {
  const s = getSocket();
  console.debug('emitRideAccepted', rideId, payload);
  s.emit('rideAccepted', { rideId, payload });
}

export function emitRideStatusChanged(rideId: string, status: string, payload: any) {
  const s = getSocket();
  console.debug('emitRideStatusChanged', { rideId, status, payload });
  s.emit('rideStatusChanged', { rideId, status, payload });
  // Fallback: also POST a ride message so passengers see the update even when Socket.IO
  // is not available (e.g., on Vercel). This writes a driver message to the ride messages
  // endpoint which the passenger RideChat polls.
  try {
    void fetch(`/api/rides/${encodeURIComponent(rideId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ text: payload?.message ?? `Status: ${status}` }),
    }).then((res) => {
      if (!res.ok) console.debug('emitRideStatusChanged: fallback POST failed', res.status);
    }).catch((err) => console.debug('emitRideStatusChanged: fallback POST error', err));
  } catch (e) {
    // ignore
  }
}

export function onRideStatusChanged(cb: (payload: any) => void) {
  const s = getSocket();
  s.on('rideStatusChanged', cb);
  return () => s.off('rideStatusChanged', cb);
}

export function sendMessage(rideId: string, text: string) {
  const s = getSocket();
  console.debug('sendMessage', { rideId, text });
  s.emit('message', { rideId, text });
}

export function onMessage(cb: (msg: any) => void) {
  const s = getSocket();
  s.on('message', cb);
  return () => s.off('message', cb);
}

// Simple WebRTC signaling helpers (offer/answer/ice)
export function sendCallOffer(rideId: string, offer: any) {
  const s = getSocket();
  s.emit('call-offer', { rideId, offer });
}

export function onCallOffer(cb: (data: any) => void) {
  const s = getSocket();
  s.on('call-offer', cb);
  return () => s.off('call-offer', cb);
}

export function sendDriverLocation(rideId: string, lat: number, lng: number) {
  const s = getSocket();
  s.emit('driver-location', { rideId, lat, lng });
}

export function sendCallAnswer(rideId: string, answer: any) {
  const s = getSocket();
  s.emit('call-answer', { rideId, answer });
}

export function onCallAnswer(cb: (data: any) => void) {
  const s = getSocket();
  s.on('call-answer', cb);
  return () => s.off('call-answer', cb);
}

export function sendIceCandidate(rideId: string, candidate: any) {
  const s = getSocket();
  s.emit('ice-candidate', { rideId, candidate });
}

export function onIceCandidate(cb: (data: any) => void) {
  const s = getSocket();
  s.on('ice-candidate', cb);
  return () => s.off('ice-candidate', cb);
}
