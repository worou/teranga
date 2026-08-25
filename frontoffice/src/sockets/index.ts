import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { config } from '../config';
import { logger } from '../utils/logger';
import { conversationsService } from '../services/conversations.service';

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

    // ⚠️  L'identifiant de salle vient du client : il DOIT être vérifié.
    // Sans ce contrôle, n'importe quel membre authentifié rejoignait la
    // conversation d'autrui en devinant son identifiant et recevait tout ce qui
    // s'y diffusait. Le trou était inexploitable tant qu'aucun client web ne
    // rejoignait de salle ; brancher le client l'aurait armé.
    socket.on('join_conversation', async (conversationId: string) => {
      if (typeof conversationId !== 'string' || !conversationId) return;
      try {
        if (!(await conversationsService.isParticipant(userId, conversationId))) {
          logger.warn('Socket: adhésion refusée à une conversation tierce', {
            userId,
            conversationId,
          });
          socket.emit('join_denied', { conversationId });
          return;
        }
        // La vérification est asynchrone : la connexion a pu tomber entre-temps.
        if (!socket.connected) return;
        socket.join(`conversation:${conversationId}`);
      } catch (err) {
        logger.error("Socket: échec du contrôle d'adhésion", {
          userId,
          conversationId,
          error: (err as Error).message,
        });
      }
    });

    // Quitter est sans risque : on ne peut sortir que d'une salle où l'on est.
    socket.on('leave_conversation', (conversationId: string) => {
      if (typeof conversationId !== 'string' || !conversationId) return;
      socket.leave(`conversation:${conversationId}`);
    });

    // « En train d'écrire » : même exigence. On émet dans la salle plutôt que
    // d'après la donnée reçue, et seulement si l'on y appartient — `socket.rooms`
    // ne contient la salle que si l'adhésion a été accordée ci-dessus.
    socket.on('typing', (data: { conversationId: string; isTyping: boolean }) => {
      if (!data?.conversationId) return;
      const room = `conversation:${data.conversationId}`;
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit('typing', { userId, isTyping: !!data.isTyping });
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
 * Le client web rejoint la salle après vérification d'appartenance (voir
 * `join_conversation`) et affiche les messages reçus sans attendre le sondage.
 * Le sondage subsiste en filet, pour les cas où la socket est tombée.
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
