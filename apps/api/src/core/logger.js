import pino from 'pino';
import { getConfig } from '../config/env.js';

function createLogger() {
  const config = getConfig();
  const options = {
    level: config.isTest ? 'silent' : config.logLevel,
    base: { service: 'personalitify-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.currentPassword',
        '*.newPassword',
        '*.refreshToken',
        '*.accessToken',
        '*.token',
      ],
      censor: '[redacted]',
    },
  };

  if (config.env === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
    };
  }
  return pino(options);
}

export const logger = createLogger();
