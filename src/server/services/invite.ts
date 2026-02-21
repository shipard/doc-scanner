import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection';
import { config } from '../config';
import { sendInviteEmail } from './email';

export interface Invite {
  id: string;
  email: string;
  name: string | null;
  token: string;
  status: string;
  created_by: string | null;
  created_at: Date;
  expires_at: Date;
  accepted_at: Date | null;
}

export async function createInvite(
  email: string,
  name: string | null,
  createdBy?: string
): Promise<Invite> {
  const token = randomBytes(32).toString('hex');
  const id = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.INVITE_EXPIRY_DAYS);

  const result = await query<Invite>(
    `INSERT INTO invites (id, email, name, token, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, email, name, token, createdBy || null, expiresAt]
  );

  return result.rows[0];
}

export async function sendInviteEmailForInvite(invite: Invite): Promise<void> {
  const inviteUrl = `${config.BASE_URL}/invite/${invite.token}`;
  await sendInviteEmail(invite.email, invite.name, inviteUrl);
}

export async function acceptInvite(
  token: string,
  userId: string
): Promise<boolean> {
  const result = await query(
    `SELECT id, status, expires_at FROM invites
     WHERE token = $1 AND status = 'pending'`,
    [token]
  );

  if (result.rows.length === 0) {
    return false;
  }

  const invite = result.rows[0];

  if (new Date(invite.expires_at) < new Date()) {
    await query(
      `UPDATE invites SET status = 'expired' WHERE id = $1`,
      [invite.id]
    );
    return false;
  }

  await query(
    `UPDATE invites SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
    [invite.id]
  );

  await query(
    `UPDATE users SET status = 'active', invite_id = $1, updated_at = NOW() WHERE id = $2`,
    [invite.id, userId]
  );

  return true;
}

export async function getInviteByToken(token: string): Promise<Invite | null> {
  const result = await query<Invite>(
    `SELECT * FROM invites WHERE token = $1`,
    [token]
  );
  return result.rows[0] || null;
}
