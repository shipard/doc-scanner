import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireApiKey } from '../middleware/apiKey';
import { createInvite, sendInviteEmailForInvite } from '../services/invite';
import { config } from '../config';

const createInviteSchema = z.object({
  name: z.string().max(255),
  email: z.string().email(),
});

export async function externalRoutes(fastify: FastifyInstance): Promise<void> {
  // Create invite from external system
  fastify.post('/api/external/invites', {
    preHandler: [requireApiKey],
  }, async (request, reply) => {
    const parsed = createInviteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
    }

    const { name, email } = parsed.data;
    const invite = await createInvite(email, name);

    try {
      await sendInviteEmailForInvite(invite);
    } catch (err) {
      console.error('Failed to send invite email:', err);
    }

    const inviteUrl = `${config.BASE_URL}/invite/${invite.token}`;

    return reply.status(201).send({
      success: true,
      inviteId: invite.id,
      inviteUrl,
    });
  });
}
