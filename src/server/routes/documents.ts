import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection';
import { requireActive } from '../middleware/auth';
import { generatePdf } from '../services/pdf';
import { sendDocumentEmail } from '../services/email';
import { MultipartFile } from '@fastify/multipart';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_PHOTOS = 10;

const uploadSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().max(255).optional(),
  note: z.string().max(500).optional(),
});

export async function documentRoutes(fastify: FastifyInstance): Promise<void> {
  // Upload document
  fastify.post('/api/documents', {
    preHandler: [requireActive],
  }, async (request, reply) => {
    const userId = request.session.userId!;
    const photos: Buffer[] = [];
    const fields: Record<string, string> = {};

    const parts = request.parts();

    for await (const part of parts) {
      if (part.type === 'file') {
        const filePart = part as MultipartFile;
        if (!ALLOWED_MIME_TYPES.includes(filePart.mimetype)) {
          return reply.status(400).send({
            error: `Invalid file type: ${filePart.mimetype}. Allowed: JPEG, PNG, WebP`,
          });
        }

        const chunks: Buffer[] = [];
        let size = 0;

        for await (const chunk of filePart.file) {
          size += chunk.length;
          if (size > MAX_PHOTO_SIZE) {
            return reply.status(400).send({ error: 'File too large (max 20 MB)' });
          }
          chunks.push(chunk);
        }

        photos.push(Buffer.concat(chunks));

        if (photos.length > MAX_PHOTOS) {
          return reply.status(400).send({ error: `Too many photos (max ${MAX_PHOTOS})` });
        }
      } else {
        const value = await (part as { value: string }).value;
        fields[part.fieldname] = value;
      }
    }

    if (photos.length === 0) {
      return reply.status(400).send({ error: 'At least one photo is required' });
    }

    const parsed = uploadSchema.safeParse(fields);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid fields', details: parsed.error.flatten() });
    }

    const { recipientEmail, recipientName, note } = parsed.data;
    const docId = uuidv4();

    // Save log entry
    await query(
      `INSERT INTO document_logs (id, user_id, recipient_email, recipient_name, note, photo_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'received')`,
      [docId, userId, recipientEmail, recipientName || null, note || null, photos.length]
    );

    // Process asynchronously
    setImmediate(async () => {
      try {
        await query(
          `UPDATE document_logs SET status = 'processing' WHERE id = $1`,
          [docId]
        );

        const pdfBuffer = await generatePdf(photos);
        await sendDocumentEmail(recipientEmail, recipientName || null, note || null, pdfBuffer);

        await query(
          `UPDATE document_logs SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [docId]
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Document processing error:', err);
        await query(
          `UPDATE document_logs SET status = 'failed', error_message = $1 WHERE id = $2`,
          [message, docId]
        );
      }
    });

    return reply.status(201).send({ id: docId, status: 'received' });
  });

  // Get own document history
  fastify.get('/api/documents', {
    preHandler: [requireActive],
  }, async (request, reply) => {
    const userId = request.session.userId!;
    const result = await query(
      `SELECT id, recipient_email, recipient_name, note, photo_count, status, error_message, created_at, sent_at
       FROM document_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    return reply.send(result.rows);
  });
}
