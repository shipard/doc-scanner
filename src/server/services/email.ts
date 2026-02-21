import nodemailer from 'nodemailer';
import { config } from '../config';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendDocumentEmail(
  to: string,
  toName: string | null,
  note: string | null,
  pdfBuffer: Buffer
): Promise<void> {
  const subject = note?.trim() || 'Naskenovaný dokument';
  const recipient = toName ? `${toName} <${to}>` : to;

  await getTransporter().sendMail({
    from: config.SMTP_FROM,
    to: recipient,
    subject,
    text: 'Posílám naskenovaný dokument.',
    html: '<p>Posílám naskenovaný dokument.</p>',
    attachments: [
      {
        filename: 'dokument.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

export async function sendInviteEmail(
  to: string,
  name: string | null,
  inviteUrl: string
): Promise<void> {
  const recipient = name ? `${name} <${to}>` : to;

  await getTransporter().sendMail({
    from: config.SMTP_FROM,
    to: recipient,
    subject: 'Pozvánka do ScanDoc',
    text: `Byli jste pozváni do aplikace ScanDoc. Klikněte na odkaz níže pro registraci:\n\n${inviteUrl}`,
    html: `<p>Byli jste pozváni do aplikace ScanDoc. Klikněte na odkaz níže pro registraci:</p><p><a href="${inviteUrl}">${inviteUrl}</a></p>`,
  });
}
