import { createHmac } from "crypto";

export function webhookConfigured(): boolean {
  return Boolean(process.env.SCHEDULER_WEBHOOK_URL && process.env.SCHEDULER_WEBHOOK_SECRET);
}

export async function emitWebhook(event: {
  id: string;
  type: "booking.confirmed" | "booking.cancelled";
  booking: Record<string, unknown>;
}): Promise<void> {
  const url = process.env.SCHEDULER_WEBHOOK_URL;
  const secret = process.env.SCHEDULER_WEBHOOK_SECRET;
  if (!url || !secret) return;
  const body = JSON.stringify(event);
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Scheduler-Event": event.type,
        "X-Scheduler-Event-Id": event.id,
        "X-Scheduler-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("Scheduling webhook failed", error);
  }
}
