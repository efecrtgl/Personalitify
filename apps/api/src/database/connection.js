import mongoose from 'mongoose';
import { logger } from '../core/logger.js';

mongoose.set('strictQuery', true);

/** Removes credentials from a MongoDB URI so it can be logged. */
export function redactMongoUri(uri) {
  return uri.replace(/\/\/([^@/]+)@/, '//***@');
}

export class DatabaseUnavailableError extends Error {
  constructor(uri, cause) {
    super(
      [
        `Could not connect to MongoDB at ${redactMongoUri(uri)}.`,
        '',
        'Personalitify needs a running MongoDB server:',
        '  1. Install MongoDB Community Server (https://www.mongodb.com/try/download/community).',
        '  2. Make sure the MongoDB service is running',
        '     (Windows: services.msc -> MongoDB, macOS: brew services start mongodb-community,',
        '     Linux: sudo systemctl start mongod).',
        '  3. Check MONGODB_URI in your .env file.',
        '',
        `Driver message: ${cause?.message ?? 'unknown error'}`,
      ].join('\n'),
    );
    this.name = 'DatabaseUnavailableError';
    this.cause = cause;
  }
}

let listenersAttached = false;

export async function connectDatabase(uri, { serverSelectionTimeoutMS = 5000 } = {}) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS, autoIndex: true });
  } catch (error) {
    throw new DatabaseUnavailableError(uri, error);
  }

  if (!listenersAttached) {
    listenersAttached = true;
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB connection lost'));
    mongoose.connection.on('reconnected', () => logger.info('MongoDB connection restored'));
    mongoose.connection.on('error', (error) => logger.error({ err: error }, 'MongoDB error'));
  }

  logger.info({ database: mongoose.connection.name }, 'Connected to MongoDB');
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

/** True when the driver currently holds a usable connection. */
export function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}
