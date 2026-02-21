#!/usr/bin/env tsx
import 'dotenv/config';
import { query, db } from '../src/server/db/connection';

async function main(): Promise<void> {
  const emailArg = process.argv.find((a) => a.startsWith('--email='));
  const email = emailArg?.split('=')[1];

  if (!email) {
    console.error('Usage: tsx scripts/create-admin.ts --email=admin@example.com');
    process.exit(1);
  }

  const result = await query(
    'SELECT id, email, name, status FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    console.error(`No user found with email: ${email}`);
    console.error('Please log in through the app first, then run this script.');
    process.exit(1);
  }

  const user = result.rows[0];

  await query(
    `UPDATE users SET is_admin = true, status = 'active', updated_at = NOW() WHERE id = $1`,
    [user.id]
  );

  console.log(`✅ User ${user.name} (${user.email}) is now an admin.`);
  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
