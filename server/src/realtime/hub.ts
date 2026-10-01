import type { Server } from 'socket.io';
import { rideRoom, userRoom, type SocketEvent } from './events';

export class RealtimeHub {
  private io: Server | null = null;

  bind(io: Server): void {
    this.io = io;
  }

  emitToUser(userId: string, event: SocketEvent, payload: unknown): void {
    this.io?.to(userRoom(userId)).emit(event, payload);
  }

  emitToRide(rideId: string, event: SocketEvent, payload: unknown): void {
    this.io?.to(rideRoom(rideId)).emit(event, payload);
  }

  async joinRide(userId: string, rideId: string): Promise<void> {
    const sockets = await this.io?.in(userRoom(userId)).fetchSockets();
    if (!sockets) return;
    for (const socket of sockets) {
      await socket.join(rideRoom(rideId));
    }
  }

  async leaveRide(userId: string, rideId: string): Promise<void> {
    const sockets = await this.io?.in(userRoom(userId)).fetchSockets();
    if (!sockets) return;
    for (const socket of sockets) {
      socket.leave(rideRoom(rideId));
    }
  }
}
