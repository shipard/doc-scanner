import { FastifyRequest, FastifyReply } from 'fastify';

declare module '@fastify/session' {
  interface FastifySessionObject {
    userId?: string;
    inviteToken?: string;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.session.userId) {
    if (request.url.startsWith('/api/')) {
      reply.status(401).send({ error: 'Unauthorized' });
    } else {
      reply.redirect('/');
    }
    return;
  }
}

export async function requireActive(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.session.userId) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  const { query } = await import('../db/connection');
  const result = await query(
    'SELECT id, status FROM users WHERE id = $1',
    [request.session.userId]
  );

  if (result.rows.length === 0) {
    request.session.destroy(() => {});
    reply.status(401).send({ error: 'User not found' });
    return;
  }

  const user = result.rows[0];
  if (user.status !== 'active') {
    reply.status(403).send({ error: 'Account not active', status: user.status });
    return;
  }
}
