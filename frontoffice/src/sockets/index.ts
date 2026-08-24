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

    socket.on('join_conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('typing', (data: { conversationId: string; isTyping: boolean }) => {
      if (!data?.conversationId) return;
      socket.to(`conversation:${data.conversationId}`).emit('typing', {
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
 * Diffuse un message à tous les participants d'une conversation.
 *
 * ⚠️ Aucun client web ne rejoint `conversation:{id}` aujourd'hui : le fil se
 * rafraîchit par interrogation périodique. La diffusion part donc dans une
 * salle vide. Elle est maintenue pour qu'un client mobile — ou une évolution du
 * web — n'ait rien à ajouter côté serveur.
 */
export function emitNewMessage(io: Server, conversationId: string, message: unknown) {
  io.to(`conversation:${conversationId}`).emit('new_message', message);
}

/**
 * Helper: push a notification.
 */
export function emitNotification(io: Server, userId: string, notification: unknown) {
  io.to(`user:${userId}`).emit('notification', notification);
}
