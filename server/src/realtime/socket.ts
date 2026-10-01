import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { Server } from 'socket.io';
import type { Env } from '../config/env';
import { logger } from '../config/logger';
import { getRedis, redisStatus } from '../config/redis';
import type { AuthService } from '../modules/auth/auth.service';
import { rideRoom, SOCKET_EVENTS, userRoom } from './events';
import type { RealtimeHub } from './hub';
import type { LocationService } from './locationService';
import type { RideSyncPort } from './rideSync';

export type AttachRealtimeDeps = {
  env: Env;
  auth: AuthService;
  locations: LocationService;
  rideSync: RideSyncPort;
  hub: RealtimeHub;
};

export type RealtimeHandle = {
  io: Server;
  close: () => Promise<void>;
};

function handshakeToken(socket: {
  handshake: {
    auth: Record<string, unknown>;
    query: Record<string, unknown>;
    headers: { authorization?: string };
  };
}): string | undefined {
  const authToken = socket.handshake.auth.token;
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken;
  }
  const queryToken = socket.handshake.query.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  const header = socket.handshake.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }
  return undefined;
}

function parsePoint(payload: unknown): { lat: number; lng: number } | null {
  if (!payload || typeof payload !== 'object') return null;
  const lat = (payload as { lat?: unknown }).lat;
  const lng = (payload as { lng?: unknown }).lng;
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng };
}

export async function attachRealtime(
  httpServer: HttpServer,
  deps: AttachRealtimeDeps,
): Promise<RealtimeHandle> {
  const io = new Server(httpServer, {
    cors: {
      origin: deps.env.CORS_ORIGINS,
      credentials: true,
    },
  });

  let subscriber: Redis | undefined;
  if (redisStatus.connected) {
    try {
      const publisher = getRedis();
      subscriber = publisher.duplicate();
      if (subscriber.status === 'wait') {
        await subscriber.connect();
      }
      io.adapter(createAdapter(publisher, subscriber));
      logger.info('Socket.IO Redis adapter attached');
    } catch (error) {
      logger.warn('Socket.IO Redis adapter skipped', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  io.use((socket, next) => {
    const token = handshakeToken(socket);
    if (!token) {
      next(new Error('unauthorized'));
      return;
    }
    try {
      const claims = deps.auth.verifyAccessToken(token);
      socket.data.userId = claims.userId;
      socket.data.role = claims.role;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    const role = socket.data.role as string;
    void socket.join(userRoom(userId));

    void (async () => {
      const snapshot = await deps.rideSync.getActiveForUser(userId);
      if (snapshot) {
        await socket.join(rideRoom(snapshot.rideId));
      }
      socket.emit(SOCKET_EVENTS.RIDE_SYNC, snapshot);
    })();

    socket.on(SOCKET_EVENTS.DRIVER_LOCATION, (payload: unknown) => {
      if (role !== 'driver') return;
      const point = parsePoint(payload);
      if (!point) return;
      void (async () => {
        const result = await deps.locations.ingest(userId, point);
        if (!result.accepted) return;
        const snapshot = await deps.rideSync.getActiveForUser(userId);
        if (snapshot) {
          io.to(rideRoom(snapshot.rideId)).emit(SOCKET_EVENTS.DRIVER_LOCATION, {
            driverId: userId,
            lat: point.lat,
            lng: point.lng,
          });
        }
      })();
    });
  });

  deps.hub.bind(io);

  return {
    io,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        io.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      subscriber?.disconnect();
    },
  };
}
