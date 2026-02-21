export interface User {
  id: string;
  email: string;
  name: string;
  status: 'pending_approval' | 'active' | 'suspended';
  is_admin: boolean;
}

export async function getMe(): Promise<User | null> {
  const res = await fetch('/auth/me', { credentials: 'include' });
  if (!res.ok) return null;
  return res.json() as Promise<User>;
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
}
