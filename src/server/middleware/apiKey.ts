import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { query } from '../db/connection';

export async function requireApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    reply.status(401).send({ error: 'Missing X-API-Key header' });
    return;
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  const result = await query(
    'SELECT id FROM api_keys WHERE key_hash = $1 AND is_active = true',
    [keyHash]
  );

  if (result.rows.length === 0) {
    reply.status(401).send({ error: 'Invalid API key' });
    return;
  }

  // Update last_used_at
  await query(
    'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
    [result.rows[0].id]
  );
}
