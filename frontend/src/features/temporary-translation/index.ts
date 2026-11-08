import { temporaryDomainDurations } from "../../entities/settings";

export interface TemporaryTranslation {
  hostname: string;
  expiresAt: number;
}

interface Storage {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (values: Record<string, unknown>) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

export function createTemporaryTranslationStore(
  storage: Storage,
  now: () => number = Date.now,
) {
  const key = (hostname: string) => `temporaryTranslation:${hostname}`;
  let pending: Promise<unknown> = Promise.resolve();
  function mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation, operation);
    pending = result;
    return result;
  }
  async function read(
    hostname: string,
  ): Promise<TemporaryTranslation | undefined> {
    const value = (await storage.get(key(hostname)))[key(hostname)];
    if (
      !value ||
      typeof value !== "object" ||
      !("hostname" in value) ||
      value.hostname !== hostname ||
      !("expiresAt" in value) ||
      typeof value.expiresAt !== "number" ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= now()
    )
      return undefined;
    return { hostname, expiresAt: value.expiresAt };
  }
  return {
    read,
    start(hostname: string, minutes: number) {
      return mutate(async () => {
        if (
          !minutes ||
          !temporaryDomainDurations.some((value) => value === minutes)
        )
          return undefined;
        const active = await read(hostname);
        if (active) return active;
        const grant = { hostname, expiresAt: now() + minutes * 60_000 };
        await storage.set({ [key(hostname)]: grant });
        return grant;
      });
    },
    stop(hostname: string) {
      return mutate(() => storage.remove(key(hostname)));
    },
  };
}
