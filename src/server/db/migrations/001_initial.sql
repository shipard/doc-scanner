-- Create ENUM types
CREATE TYPE user_status AS ENUM ('pending_approval', 'active', 'suspended');
CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'expired');
CREATE TYPE document_status AS ENUM ('received', 'processing', 'sent', 'failed');

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  oauth_provider VARCHAR(50) NOT NULL,
  oauth_id VARCHAR(255) NOT NULL,
  status user_status NOT NULL DEFAULT 'pending_approval',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  invite_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_idx ON users(oauth_provider, oauth_id);

-- Invites table
CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  token VARCHAR(255) UNIQUE NOT NULL,
  status invite_status NOT NULL DEFAULT 'pending',
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ NULL
);

-- Add FK from users to invites (after invites table exists)
ALTER TABLE users ADD CONSTRAINT users_invite_id_fkey
  FOREIGN KEY (invite_id) REFERENCES invites(id) ON DELETE SET NULL;

-- Document logs table
CREATE TABLE IF NOT EXISTS document_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  note VARCHAR(500),
  photo_count INTEGER NOT NULL DEFAULT 0,
  status document_status NOT NULL DEFAULT 'received',
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS document_logs_user_idx ON document_logs(user_id);
CREATE INDEX IF NOT EXISTS document_logs_status_idx ON document_logs(status);
CREATE INDEX IF NOT EXISTS document_logs_created_idx ON document_logs(created_at DESC);

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(64) NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NULL
);
