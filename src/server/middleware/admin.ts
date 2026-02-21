import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/connection';

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.session.userId) {
    reply.redirect('/');
    return;
  }

  const result = await query(
    'SELECT id, is_admin, status FROM users WHERE id = $1',
    [request.session.userId]
  );

  if (result.rows.length === 0 || !result.rows[0].is_admin) {
    reply.status(403).send('Forbidden');
    return;
  }

  if (result.rows[0].status !== 'active') {
    reply.status(403).send('Account not active');
    return;
  }
}
