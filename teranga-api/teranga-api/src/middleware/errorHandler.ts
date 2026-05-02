import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      statusCode: 400,
      error: 'Validation Error',
      message: 'Données invalides',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Our AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? 'Internal Server Error' : 'Client Error',
      message: err.message,
      details: err.details,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Token invalide ou expiré',
    });
  }

  // Prisma known errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    if (prismaErr.code === 'P2002') {
      return res.status(409).json({
        statusCode: 409,
        error: 'Conflict',
        message: 'Cette ressource existe déjà',
        details: prismaErr.meta,
      });
    }
    if (prismaErr.code === 'P2025') {
      return res.status(404).json({
        statusCode: 404,
        error: 'Not Found',
        message: 'Ressource introuvable',
      });
    }
  }

  logger.error('Unhandled error', { message: err.message, stack: err.stack, path: req.path });

  return res.status(500).json({
    statusCode: 500,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Une erreur est survenue' : err.message,
  });
}
