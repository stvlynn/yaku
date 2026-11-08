export interface Envelope<T = unknown> {
  destination: "background" | "offscreen" | "content";
  action: string;
  payload?: T;
}
export type Reply<T> =
  { ok: true; value: T } | { ok: false; error: string; name?: string };

export function errorReply(error: unknown): Reply<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : undefined,
  };
}

export async function request<T>(message: Envelope): Promise<T> {
  const reply: Reply<T> | undefined = await chrome.runtime.sendMessage(message);
  if (!reply) throw new Error("The extension did not respond.");
  if (!reply.ok) {
    const error = new Error(reply.error);
    if (reply.name) error.name = reply.name;
    throw error;
  }
  return reply.value;
}

export function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "destination" in value &&
    "action" in value &&
    typeof value.action === "string"
  );
}
