import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import fastifyPassport from '@fastify/passport';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCsrfProtection from '@fastify/csrf-protection';
import path from 'path';
import ejs from 'ejs';
import { config } from './config';
import { setupPassport, authRoutes } from './routes/auth';
import { documentRoutes } from './routes/documents';
import { externalRoutes } from './routes/external';
import { adminRoutes } from './routes/admin';

const fastify = Fastify({
  logger: {
    level: config.NODE_ENV === 'development' ? 'info' : 'warn',
  },
  trustProxy: true,
});

async function start(): Promise<void> {
  // CORS
  await fastify.register(fastifyCors, {
    origin: config.BASE_URL,
    credentials: true,
  });

  // Cookie
  await fastify.register(fastifyCookie);

  // Session
  await fastify.register(fastifySession, {
    secret: config.SESSION_SECRET,
    cookie: {
      secure: config.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
    saveUninitialized: false,
  });

  // Passport (initialize only — using @fastify/session for storage)
  await fastify.register(fastifyPassport.initialize());
  await setupPassport();

  // Multipart (file uploads) — 20 MB per file, 10 files = 200 MB max
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 10,
    },
  });

  // Rate limiting
  await fastify.register(fastifyRateLimit, {
    global: false,
  });

  // CSRF protection for admin forms
  await fastify.register(fastifyCsrfProtection, {
    sessionPlugin: '@fastify/session',
  });

  // Template engine (EJS for admin)
  await fastify.register(fastifyView, {
    engine: { ejs },
    root: path.join(__dirname, 'views'),
    layout: 'layout.ejs',
    viewExt: 'ejs',
  });

  // Static files (production: serve built client)
  if (config.NODE_ENV === 'production') {
    await fastify.register(fastifyStatic, {
      root: path.join(__dirname, '../../dist/client'),
      prefix: '/',
    });
  }

  // Routes
  await fastify.register(authRoutes);
  await fastify.register(documentRoutes);
  await fastify.register(externalRoutes);
  await fastify.register(adminRoutes);

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }));

  // SPA fallback (production)
  if (config.NODE_ENV === 'production') {
    fastify.setNotFoundHandler(async (request, reply) => {
      if (!request.url.startsWith('/api/') && !request.url.startsWith('/admin') && !request.url.startsWith('/auth/')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Not found' });
    });
  }

  await fastify.listen({
    port: config.PORT,
    host: config.HOST,
  });

  console.log(`ScanDoc server running at http://${config.HOST}:${config.PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
