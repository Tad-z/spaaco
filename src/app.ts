import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { UPLOAD_LIMITS } from './config/constants.js';
import { API_PREFIX, apiRoutes } from './routes/index.js';
import { requestId } from './middlewares/request-id.middleware.js';
import { notFound } from './middlewares/not-found.middleware.js';
import { errorHandler } from './middlewares/error-handler.middleware.js';
import { cacheHeaders } from './middlewares/cache-headers.middleware.js';
import { publicReadLimiter } from './middlewares/rate-limit.middleware.js';

/**
 * Builds the Express app. It never listens — `server.ts` does that — so tests
 * can drive the whole stack through Supertest without binding a port.
 */

export interface CreateAppOptions {
  /**
   * Origins allowed to call the API. Defaults to `CORS_ORIGINS`; tests override
   * it rather than reaching into config.
   */
  readonly corsOrigins?: readonly string[];
  /**
   * Rate limiting, on by default. Tests turn it off so a file of requests does
   * not trip a limit meant for a whole minute of real traffic.
   */
  readonly rateLimit?: boolean;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const corsOrigins = options.corsOrigins ?? config.CORS_ORIGINS;

  // Behind a load balancer, so rate limiting and IP hashing see the real client.
  app.set('trust proxy', 1);
  app.set('rateLimitEnabled', options.rateLimit !== false);
  app.disable('x-powered-by');
  app.disable('etag');

  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      // An allow-list, not a reflector: only the public site and the admin
      // dashboard may call this API from a browser.
      origin: (origin, callback) => {
        // No Origin header means a same-origin or non-browser caller (curl,
        // server-side rendering, health checks), which CORS does not govern.
        if (origin === undefined || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      exposedHeaders: ['x-request-id', 'etag'],
      maxAge: 600,
    })
  );
  app.use(express.json({ limit: UPLOAD_LIMITS.jsonBodyLimit }));
  // Only the admin refresh token is a cookie; nothing else reads one.
  app.use(cookieParser());

  app.use(API_PREFIX, publicReadLimiter);
  app.use(API_PREFIX, cacheHeaders);
  app.use(API_PREFIX, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
