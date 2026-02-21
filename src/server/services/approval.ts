import { config } from '../config';

export async function callApprovalWebhook(
  name: string,
  email: string
): Promise<boolean> {
  if (!config.APPROVAL_WEBHOOK_URL) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.APPROVAL_WEBHOOK_TIMEOUT
    );

    const response = await fetch(config.APPROVAL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return false;
    }

    const data = await response.json() as { success?: number };
    return data.success === 1;
  } catch (err) {
    console.error('Approval webhook error:', err);
    return false;
  }
}
