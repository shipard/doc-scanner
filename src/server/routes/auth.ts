import { FastifyInstance } from 'fastify';
import passport from '@fastify/passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection';
import { config } from '../config';
import { callApprovalWebhook } from '../services/approval';
import { acceptInvite } from '../services/invite';

interface User {
  id: string;
  email: string;
  name: string;
  status: string;
  is_admin: boolean;
}

declare module 'fastify' {
  interface PassportUser extends User {}
}

export async function setupPassport(): Promise<void> {
  passport.use(
    'google',
    new GoogleStrategy(
      {
        clientID: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL: config.GOOGLE_CALLBACK_URL,
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: (err: Error | null, user?: User | false) => void
      ) => {
        try {
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName || email || 'Unknown';

          if (!email) {
            return done(null, false);
          }

          // Check if user exists
          let result = await query<User>(
            'SELECT id, email, name, status, is_admin FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
            ['google', profile.id]
          );

          if (result.rows.length > 0) {
            return done(null, result.rows[0]);
          }

          // Create new user
          const userId = uuidv4();
          result = await query<User>(
            `INSERT INTO users (id, email, name, oauth_provider, oauth_id, status)
             VALUES ($1, $2, $3, 'google', $4, 'pending_approval')
             RETURNING id, email, name, status, is_admin`,
            [userId, email, name, profile.id]
          );

          const newUser = result.rows[0];

          // Try auto-approval via webhook
          const approved = await callApprovalWebhook(name, email);
          if (approved) {
            await query(
              `UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1`,
              [userId]
            );
            newUser.status = 'active';
          }

          done(null, newUser);
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );

  passport.registerUserSerializer<User, string>(async (user) => user.id);
  passport.registerUserDeserializer<string, User>(async (id) => {
    const result = await query<User>(
      'SELECT id, email, name, status, is_admin FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  });
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Initiate Google OAuth
  fastify.get('/auth/google', {
    preValidation: passport.authenticate('google', {
      scope: ['profile', 'email'],
    }),
  }, async () => {});

  // Google OAuth callback
  fastify.get('/auth/google/callback', {
    preValidation: passport.authenticate('google', {
      failureRedirect: '/?error=auth_failed',
    }),
  }, async (request, reply) => {
    const user = request.user as User;

    // Store user ID in our own session key for middleware usage
    request.session.userId = user.id;

    // Check if there's a pending invite token in session
    const inviteToken = request.session.inviteToken;
    if (inviteToken && user.status !== 'active') {
      const accepted = await acceptInvite(inviteToken, user.id);
      if (accepted) {
        user.status = 'active';
        delete request.session.inviteToken;
      }
    }

    if (user.status === 'pending_approval') {
      reply.redirect('/?status=pending_approval');
    } else {
      reply.redirect('/');
    }
  });

  // Store invite token in session before OAuth redirect
  fastify.get<{ Querystring: { invite?: string } }>('/auth/google/with-invite', async (request, reply) => {
    const { invite } = request.query;
    if (invite) {
      request.session.inviteToken = invite;
    }
    reply.redirect('/auth/google');
  });

  // Logout
  fastify.post('/auth/logout', async (request, reply) => {
    request.session.destroy(() => {});
    reply.send({ success: true });
  });

  // Get current user info
  fastify.get('/auth/me', async (request, reply) => {
    if (!request.session.userId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const result = await query<User>(
      'SELECT id, email, name, status, is_admin FROM users WHERE id = $1',
      [request.session.userId]
    );

    if (result.rows.length === 0) {
      request.session.destroy(() => {});
      return reply.status(401).send({ error: 'User not found' });
    }

    return reply.send(result.rows[0]);
  });
}
