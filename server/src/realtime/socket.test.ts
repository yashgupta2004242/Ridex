import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as clientIo, type Socket } from 'socket.io-client';
import { AppError } from '../common/AppError';
import { ERROR_CODES, HTTP } from '../common/constants';
import { getEnv } from '../config/env';
import type { AuthService } from '../modules/auth/auth.service';
import type { DriverPingPort } from './driverPing';
import { SOCKET_EVENTS } from './events';
import { MemoryGeo } from './geo';
import { RealtimeHub } from './hub';
import { LocationService } from './locationService';
import type { RideSnapshot, RideSyncPort } from './rideSync';
import { attachRealtime, type RealtimeHandle } from './socket';

const env = getEnv();

function waitFor(socket: Socket, event: string, ms = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('socket handshake and rooms', () => {
  const geo = new MemoryGeo();
  const drivers: DriverPingPort = {
    async canPing(userId) {
      return userId === 'driver-1';
    },
    async updateLocation() {
      return;
    },
  };
  const locations = new LocationService(geo, drivers);
  let snapshot: RideSnapshot | null = null;
  const rideSync: RideSyncPort = {
    async getActiveForUser(userId) {
      if (snapshot && (snapshot.riderId === userId || snapshot.driverId === userId)) {
        return snapshot;
      }
      return null;
    },
  };
  const hub = new RealtimeHub();
  const auth = {
    verifyAccessToken(token: string) {
      if (token === 'rider-token') return { userId: 'rider-1', role: 'rider' as const };
      if (token === 'driver-token') return { userId: 'driver-1', role: 'driver' as const };
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Access token is invalid or expired');
    },
  } as AuthService;

  async function listen() {
    const server = http.createServer();
    const realtime: RealtimeHandle = await attachRealtime(server, {
      env,
      auth,
      locations,
      rideSync,
      hub,
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    return {
      realtime,
      url: `http://127.0.0.1:${port}`,
      close: () => realtime.close(),
    };
  }

  beforeEach(async () => {
    snapshot = null;
    await geo.remove('driver-1');
  });

  it('rejects a socket with no access token', async () => {
    const session = await listen();
    try {
      const socket = clientIo(session.url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      const error = await waitFor(socket, 'connect_error');
      expect((error as Error).message).toContain('unauthorized');
      socket.close();
    } finally {
      await session.close();
    }
  });

  it('sends ride:sync on connect and fans driver location into the ride room', async () => {
    const session = await listen();
    try {
      snapshot = {
        rideId: 'ride-1',
        status: 'accepted',
        riderId: 'rider-1',
        driverId: 'driver-1',
      };

      const riderSocket = clientIo(session.url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        auth: { token: 'rider-token' },
      });
      const riderSync = await waitFor(riderSocket, SOCKET_EVENTS.RIDE_SYNC);
      expect(riderSync).toMatchObject({ rideId: 'ride-1', riderId: 'rider-1', driverId: 'driver-1' });

      const driverSocket = clientIo(session.url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        auth: { token: 'driver-token' },
      });
      await waitFor(driverSocket, SOCKET_EVENTS.RIDE_SYNC);

      const locationPromise = waitFor(riderSocket, SOCKET_EVENTS.DRIVER_LOCATION);
      driverSocket.emit(SOCKET_EVENTS.DRIVER_LOCATION, { lat: 28.6139, lng: 77.209 });
      const location = await locationPromise;
      expect(location).toMatchObject({ driverId: 'driver-1', lat: 28.6139, lng: 77.209 });
      expect(await locations.position('driver-1')).toEqual({ lat: 28.6139, lng: 77.209 });

      riderSocket.close();
      driverSocket.close();
    } finally {
      await session.close();
    }
  });

  it('delivers hub events to the user room', async () => {
    const session = await listen();
    try {
      const socket = clientIo(session.url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        auth: { token: 'rider-token' },
      });
      await waitFor(socket, SOCKET_EVENTS.RIDE_SYNC);
      const offered = waitFor(socket, SOCKET_EVENTS.RIDE_OFFER);
      hub.emitToUser('rider-1', SOCKET_EVENTS.RIDE_OFFER, { rideId: 'pending-1' });
      expect(await offered).toEqual({ rideId: 'pending-1' });
      socket.close();
    } finally {
      await session.close();
    }
  });
});
