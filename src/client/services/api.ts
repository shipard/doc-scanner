export interface DocumentRecord {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  note: string | null;
  photo_count: number;
  status: 'received' | 'processing' | 'sent' | 'failed';
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

export async function uploadDocument(
  photos: Blob[],
  recipientEmail: string,
  recipientName: string,
  note: string
): Promise<{ id: string; status: string }> {
  const formData = new FormData();

  for (const photo of photos) {
    formData.append('photos', photo, 'photo.jpg');
  }

  formData.append('recipientEmail', recipientEmail);
  if (recipientName) formData.append('recipientName', recipientName);
  if (note) formData.append('note', note);

  const res = await fetch('/api/documents', {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' })) as { error: string };
    throw new Error(err.error || 'Upload failed');
  }

  return res.json() as Promise<{ id: string; status: string }>;
}

export async function getDocuments(): Promise<DocumentRecord[]> {
  const res = await fetch('/api/documents', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json() as Promise<DocumentRecord[]>;
}
