import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  adminSecret: process.env.ADMIN_SECRET || 'admin-secret-change-me',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173',
  },
};
