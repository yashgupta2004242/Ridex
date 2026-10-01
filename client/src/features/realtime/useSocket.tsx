import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSelector } from 'react-redux';
import { io, type Socket } from 'socket.io-client';
import type { RootState } from '../../app/store';
import { SOCKET_EVENTS, type RideOfferPayload, type RideSyncPayload } from './events';

type SocketContextValue = {
  socket: Socket | null;
  connected: boolean;
  lastSync: RideSyncPayload;
  offer: (RideOfferPayload & { expiresAt: number }) | null;
  dismissOffer: () => void;
  driverPing: { driverId: string; lat: number; lng: number } | null;
};

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  lastSync: null,
  offer: null,
  dismissOffer: () => undefined,
  driverPing: null,
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const accessToken = useSelector((state: RootState) => state.session.accessToken);
  const role = useSelector((state: RootState) => state.session.user?.role);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastSync, setLastSync] = useState<RideSyncPayload>(null);
  const [offer, setOffer] = useState<(RideOfferPayload & { expiresAt: number }) | null>(null);
  const [driverPing, setDriverPing] = useState<{ driverId: string; lat: number; lng: number } | null>(
    null,
  );

  useEffect(() => {
    if (!accessToken) {
      setSocket(null);
      setConnected(false);
      setLastSync(null);
      setOffer(null);
      setDriverPing(null);
      return;
    }

    const next = io({
      path: '/socket.io',
      auth: { token: accessToken },
      transports: ['websocket'],
      autoConnect: true,
    });

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onSync = (payload: RideSyncPayload) => setLastSync(payload);
    const onOffer = (payload: RideOfferPayload) => {
      setOffer({ ...payload, expiresAt: Date.now() + (payload.timeoutMs || 15_000) });
    };
    const onStatus = (payload: { rideId?: string }) => {
      setOffer((current) => (current && current.rideId === payload.rideId ? null : current));
    };
    const onDriverPing = (payload: { driverId?: string; lat?: number; lng?: number }) => {
      if (
        typeof payload?.driverId === 'string' &&
        typeof payload.lat === 'number' &&
        typeof payload.lng === 'number'
      ) {
        setDriverPing({ driverId: payload.driverId, lat: payload.lat, lng: payload.lng });
      }
    };

    next.on('connect', onConnect);
    next.on('disconnect', onDisconnect);
    next.on(SOCKET_EVENTS.RIDE_SYNC, onSync);
    next.on(SOCKET_EVENTS.RIDE_OFFER, onOffer);
    next.on(SOCKET_EVENTS.RIDE_ACCEPTED, onStatus);
    next.on(SOCKET_EVENTS.RIDE_STATUS, onStatus);
    next.on(SOCKET_EVENTS.RIDE_CANCELLED, onStatus);
    next.on(SOCKET_EVENTS.DRIVER_LOCATION, onDriverPing);
    setSocket(next);

    return () => {
      next.off('connect', onConnect);
      next.off('disconnect', onDisconnect);
      next.off(SOCKET_EVENTS.RIDE_SYNC, onSync);
      next.off(SOCKET_EVENTS.RIDE_OFFER, onOffer);
      next.off(SOCKET_EVENTS.RIDE_ACCEPTED, onStatus);
      next.off(SOCKET_EVENTS.RIDE_STATUS, onStatus);
      next.off(SOCKET_EVENTS.RIDE_CANCELLED, onStatus);
      next.off(SOCKET_EVENTS.DRIVER_LOCATION, onDriverPing);
      next.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [accessToken]);

  useEffect(() => {
    if (!socket || role !== 'driver' || !navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        socket.emit(SOCKET_EVENTS.DRIVER_LOCATION, {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 4000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [socket, role]);

  const value = useMemo(
    () => ({ socket, connected, lastSync, offer, dismissOffer: () => setOffer(null), driverPing }),
    [socket, connected, lastSync, offer, driverPing],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
