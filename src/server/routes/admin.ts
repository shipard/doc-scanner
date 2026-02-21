import { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { requireAdmin } from '../middleware/admin';
import { query } from '../db/connection';
import { createInvite, sendInviteEmailForInvite } from '../services/invite';
import { config } from '../config';

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply admin auth to all routes
  fastify.addHook('preHandler', requireAdmin);

  // Dashboard
  fastify.get('/admin', async (request, reply) => {
    const [activeUsers, pendingUsers, docsToday, docsTotal, pendingInvites] = await Promise.all([
      query(`SELECT COUNT(*) FROM users WHERE status = 'active'`),
      query(`SELECT COUNT(*) FROM users WHERE status = 'pending_approval'`),
      query(`SELECT COUNT(*) FROM document_logs WHERE created_at >= NOW()::date`),
      query(`SELECT COUNT(*) FROM document_logs`),
      query(`SELECT COUNT(*) FROM invites WHERE status = 'pending' AND expires_at > NOW()`),
    ]);

    const adminUser = await query(
      'SELECT name FROM users WHERE id = $1',
      [request.session.userId]
    );

    return reply.view('dashboard.ejs', {
      title: 'Dashboard',
      adminName: adminUser.rows[0]?.name,
      stats: {
        activeUsers: parseInt(activeUsers.rows[0].count),
        pendingUsers: parseInt(pendingUsers.rows[0].count),
        docsToday: parseInt(docsToday.rows[0].count),
        docsTotal: parseInt(docsTotal.rows[0].count),
        pendingInvites: parseInt(pendingInvites.rows[0].count),
      },
    });
  });

  // Users list
  fastify.get<{ Querystring: { status?: string } }>('/admin/users', async (request, reply) => {
    const { status } = request.query;
    let whereClause = '';
    const params: string[] = [];

    if (status) {
      whereClause = 'WHERE status = $1';
      params.push(status);
    }

    const result = await query(
      `SELECT id, email, name, status, is_admin, created_at FROM users ${whereClause} ORDER BY created_at DESC`,
      params
    );

    return reply.view('users.ejs', {
      title: 'Users',
      users: result.rows,
      statusFilter: status || '',
    });
  });

  // Approve user
  fastify.post<{ Params: { id: string } }>('/admin/users/:id/approve', async (request, reply) => {
    await query(
      `UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [request.params.id]
    );
    reply.redirect('/admin/users');
  });

  // Suspend user
  fastify.post<{ Params: { id: string } }>('/admin/users/:id/suspend', async (request, reply) => {
    await query(
      `UPDATE users SET status = 'suspended', updated_at = NOW() WHERE id = $1`,
      [request.params.id]
    );
    reply.redirect('/admin/users');
  });

  // Activate user
  fastify.post<{ Params: { id: string } }>('/admin/users/:id/activate', async (request, reply) => {
    await query(
      `UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [request.params.id]
    );
    reply.redirect('/admin/users');
  });

  // Delete user
  fastify.delete<{ Params: { id: string } }>('/admin/users/:id', async (request, reply) => {
    await query('DELETE FROM users WHERE id = $1', [request.params.id]);
    reply.send({ success: true });
  });

  // Toggle admin
  fastify.post<{ Params: { id: string } }>('/admin/users/:id/toggle-admin', async (request, reply) => {
    await query(
      `UPDATE users SET is_admin = NOT is_admin, updated_at = NOW() WHERE id = $1`,
      [request.params.id]
    );
    reply.redirect('/admin/users');
  });

  // Invites list
  fastify.get('/admin/invites', async (request, reply) => {
    const result = await query(
      `SELECT i.*, u.name AS created_by_name
       FROM invites i
       LEFT JOIN users u ON u.id = i.created_by
       ORDER BY i.created_at DESC`
    );

    return reply.view('invites.ejs', {
      title: 'Invites',
      invites: result.rows,
      baseUrl: config.BASE_URL,
    });
  });

  // Create invite
  fastify.post<{ Body: { email: string; name: string } }>('/admin/invites', async (request, reply) => {
    const { email, name } = request.body;
    if (!email) {
      return reply.redirect('/admin/invites?error=email_required');
    }

    const invite = await createInvite(email, name || null, request.session.userId);

    try {
      await sendInviteEmailForInvite(invite);
    } catch (err) {
      console.error('Failed to send invite email:', err);
    }

    reply.redirect('/admin/invites');
  });

  // Delete invite
  fastify.delete<{ Params: { id: string } }>('/admin/invites/:id', async (request, reply) => {
    await query('DELETE FROM invites WHERE id = $1', [request.params.id]);
    reply.send({ success: true });
  });

  // Logs
  fastify.get<{
    Querystring: { status?: string; userId?: string; page?: string }
  }>('/admin/logs', async (request, reply) => {
    const { status, userId, page = '1' } = request.query;
    const pageNum = Math.max(1, parseInt(page));
    const limit = 50;
    const offset = (pageNum - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      conditions.push(`dl.status = $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      conditions.push(`dl.user_id = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM document_logs dl ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(limit);
    params.push(offset);

    const result = await query(
      `SELECT dl.id, dl.recipient_email, dl.recipient_name, dl.note,
              dl.photo_count, dl.status, dl.error_message, dl.created_at, dl.sent_at,
              u.name AS sender_name, u.email AS sender_email
       FROM document_logs dl
       JOIN users u ON u.id = dl.user_id
       ${where}
       ORDER BY dl.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return reply.view('logs.ejs', {
      title: 'Logs',
      logs: result.rows,
      total,
      page: pageNum,
      pages: Math.ceil(total / limit),
      statusFilter: status || '',
    });
  });

  // API keys list
  fastify.get('/admin/api-keys', async (request, reply) => {
    const result = await query(
      `SELECT ak.id, ak.name, ak.key_prefix, ak.is_active, ak.created_at, ak.last_used_at,
              u.name AS created_by_name
       FROM api_keys ak
       JOIN users u ON u.id = ak.created_by
       ORDER BY ak.created_at DESC`
    );

    const newKey = (request.session as Record<string, unknown>).newApiKey as string | undefined;
    if (newKey) {
      delete (request.session as Record<string, unknown>).newApiKey;
    }

    return reply.view('api-keys.ejs', {
      title: 'API Keys',
      apiKeys: result.rows,
      newKey,
    });
  });

  // Create API key
  fastify.post<{ Body: { name: string } }>('/admin/api-keys', async (request, reply) => {
    const { name } = request.body;
    if (!name) {
      return reply.redirect('/admin/api-keys?error=name_required');
    }

    const rawKey = randomBytes(32).toString('hex');
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 8);
    const id = uuidv4();

    await query(
      `INSERT INTO api_keys (id, name, key_hash, key_prefix, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, name, keyHash, keyPrefix, request.session.userId]
    );

    // Store the plain key in session to show once
    (request.session as Record<string, unknown>).newApiKey = rawKey;

    reply.redirect('/admin/api-keys');
  });

  // Deactivate API key
  fastify.delete<{ Params: { id: string } }>('/admin/api-keys/:id', async (request, reply) => {
    await query(
      `UPDATE api_keys SET is_active = false WHERE id = $1`,
      [request.params.id]
    );
    reply.send({ success: true });
  });
}
