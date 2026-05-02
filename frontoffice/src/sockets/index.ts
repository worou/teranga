import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { config } from '../config';
import { logger } from '../utils/logger';

interface AuthedSocket extends Socket {
  userId?: string;
}

export function initSockets(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      credentials: true,
    },
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  // JWT auth during handshake
  io.use((socket: AuthedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization as string)?.replace(/^Bearer\s+/, '');
      if (!token) return next(new Error('Token manquant'));

      const payload = verifyAccessToken(token);
      socket.userId = payload.userId;
      next();
    } catch (err) {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const userId = socket.userId!;
    logger.info('Socket connected', { userId, socketId: socket.id });

    // Join personal room - used to push notifications & new matches
    socket.join(`user:${userId}`);

    socket.on('join_match', (matchId: string) => {
      socket.join(`match:${matchId}`);
    });

    socket.on('leave_match', (matchId: string) => {
      socket.leave(`match:${matchId}`);
    });

    socket.on('typing', (data: { matchId: string; isTyping: boolean }) => {
      if (!data?.matchId) return;
      socket.to(`match:${data.matchId}`).emit('typing', {
        userId,
        isTyping: !!data.isTyping,
      });
    });

    socket.on('disconnect', (reason) => {
      logger.info('Socket disconnected', { userId, reason });
    });
  });

  return io;
}

/**
 * Helper: emit a "new_message" event to all participants of a match.
 */
export function emitNewMessage(io: Server, matchId: string, message: unknown) {
  io.to(`match:${matchId}`).emit('new_message', message);
}

/**
 * Helper: notify both users of a new match.
 */
export function emitNewMatch(io: Server, userIds: string[], match: unknown) {
  userIds.forEach((uid) => {
    io.to(`user:${uid}`).emit('new_match', match);
  });
}

/**
 * Helper: push a notification.
 */
export function emitNotification(io: Server, userId: string, notification: unknown) {
  io.to(`user:${userId}`).emit('notification', notification);
}
