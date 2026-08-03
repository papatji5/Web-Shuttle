import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as IOServer } from 'socket.io';
import { onRealtimeEvent } from './src/lib/realtimeEvents';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let io: IOServer | null = null;

type RealtimePayload = {
  rideId?: string | number;
  status?: string;
  payload?: unknown;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  passengerEmail?: string | null;
  estimatedFareCents?: number | null;
};

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || '', true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize Socket.IO after server creation
  io = new IOServer(httpServer, {
    path: '/api/socketio',
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const broadcastRideStatus = (rideId: string, status: string, payload: unknown) => {
    io?.to(String(rideId)).emit('rideStatusChanged', { rideId, status, payload });
  };

  const rideRequestedHandler = (payload: unknown) => {
    io?.to('drivers').emit('rideRequested', payload);
  };

  const rideStatusChangedHandler = (payload: unknown) => {
    const typedPayload = payload as RealtimePayload;
    if (typedPayload?.rideId) {
      broadcastRideStatus(String(typedPayload.rideId), String(typedPayload.status ?? 'UPDATED'), typedPayload.payload ?? typedPayload);
    }
  };

  onRealtimeEvent('rideRequested', rideRequestedHandler);
  onRealtimeEvent('rideStatusChanged', rideStatusChangedHandler);

  io.on('connection', (socket) => {
    console.log('[Socket.IO] Connected:', socket.id);

    socket.on('joinRide', ({ rideId, meta }: { rideId: string | number; meta?: { role?: string; name?: string } }) => {
      try {
        socket.join(String(rideId));
        (socket as typeof socket & { rideId?: string | number; meta?: Record<string, unknown> }).rideId = rideId;
        (socket as typeof socket & { rideId?: string | number; meta?: Record<string, unknown> }).meta = meta ?? {};
        if ((meta?.role || '').toUpperCase() === 'DRIVER') {
          socket.join('drivers');
        }
        const roomSockets = io!.sockets.adapter.rooms.get(String(rideId));
        const roomSize = roomSockets?.size || 0;
        console.log(`[Socket.IO] ${socket.id} joined ride ${rideId} (room size: ${roomSize})`, meta);
      } catch (e) {
        console.error('[Socket.IO] joinRide error:', e);
      }
    });

    socket.on('leaveRide', ({ rideId }) => {
      try {
        socket.leave(String(rideId));
        delete (socket as any).rideId;
        delete (socket as any).meta;
        console.log(`[Socket.IO] ${socket.id} left ride ${rideId}`);
      } catch (e) {
        console.error('[Socket.IO] leaveRide error:', e);
      }
    });

    socket.on('rideAccepted', ({ rideId, payload }) => {
      socket.to(String(rideId)).emit('rideAccepted', { rideId, payload });
    });

    socket.on('rideStatusChanged', ({ rideId, status, payload }) => {
      broadcastRideStatus(String(rideId), String(status ?? 'UPDATED'), payload ?? {});
    });

    socket.on('message', ({ rideId, text, ...rest }) => {
      const socketMeta = (socket as any).meta || {};
      const fromLabel =
        socketMeta.name ||
        (socketMeta.role === 'DRIVER' ? 'Driver' : socketMeta.role === 'PASSENGER' ? 'Passenger' : socketMeta.role || 'Other');
      const payload = { rideId: rideId ?? null, text, from: socket.id, fromLabel, ...rest };
      const roomSockets = rideId ? io!.sockets.adapter.rooms.get(String(rideId)) : null;
      const roomSize = roomSockets?.size || 0;
      console.log(`[Socket.IO] Message from ${socket.id} (${fromLabel}) to room ${rideId} (room size: ${roomSize})`);
      console.log(`[Socket.IO] Message payload:`, payload);
      console.log(`[Socket.IO] Sockets in room:`, Array.from(roomSockets || []).map((sid) => sid));

      if (!rideId) {
        console.log('[Socket.IO] Broadcasting to all clients (no rideId)');
        io!.emit('message', payload);
      } else {
        console.log(`[Socket.IO] Broadcasting to room ${rideId}`);
        socket.emit('message-sent', { rideId, text });
        socket.to(String(rideId)).emit('message', payload);
        console.log(`[Socket.IO] Total connected sockets: ${io!.sockets.sockets.size}`);
      }
    });

    socket.on('call-offer', ({ rideId, offer }) => {
      socket.to(String(rideId)).emit('call-offer', { offer, from: socket.id });
    });

    socket.on('call-answer', ({ rideId, answer }) => {
      socket.to(String(rideId)).emit('call-answer', { answer, from: socket.id });
    });

    socket.on('ice-candidate', ({ rideId, candidate }) => {
      socket.to(String(rideId)).emit('ice-candidate', { candidate, from: socket.id });
    });

    socket.on('driver-location', ({ rideId, lat, lng }) => {
      if (rideId && Number.isFinite(lat) && Number.isFinite(lng)) {
        socket.to(String(rideId)).emit('driver-location', { rideId, lat, lng, from: socket.id });
      }
    });

    socket.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected:', socket.id);
    });
  });

  httpServer
    .once('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
