import { describe, expect, it } from "vitest";
import { createTemporaryTranslationStore } from "../frontend/src/features/temporary-translation";

function fixture() {
  let time = 1_000;
  const data: Record<string, unknown> = {};
  const storage = {
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(values: Record<string, unknown>) {
      Object.assign(data, values);
    },
    async remove(key: string) {
      delete data[key];
    },
  };
  return {
    store: createTemporaryTranslationStore(storage, () => time),
    storage,
    data,
    advance(milliseconds: number) {
      time += milliseconds;
    },
  };
}

describe("temporary website translation", () => {
  it("retains fixed expiry across repeated actions and background recreation", async () => {
    const { store, storage, advance } = fixture();
    const first = await store.start("example.com", 5);
    advance(60_000);
    expect(await store.start("example.com", 60)).toEqual(first);
    const restarted = createTemporaryTranslationStore(storage, () => 61_000);
    expect(await restarted.read("example.com")).toEqual(first);
    advance(240_000);
    expect(await store.read("example.com")).toBeUndefined();
    expect((await store.start("example.com", 10))?.expiresAt).toBe(901_000);
  });

  it("isolates exact hostnames and removes only the stopped activation", async () => {
    const { store } = fixture();
    await store.start("example.com", 5);
    expect(await store.read("sub.example.com")).toBeUndefined();
    await store.start("sub.example.com", 10);
    await store.stop("example.com");
    expect(await store.read("example.com")).toBeUndefined();
    expect(await store.read("sub.example.com")).toBeDefined();
    expect(await store.start("other.example", 0)).toBeUndefined();
  });

  it("serializes concurrent starts without extending the first activation", async () => {
    const { store } = fixture();
    const [first, repeated] = await Promise.all([
      store.start("example.com", 5),
      store.start("example.com", 60),
    ]);
    expect(repeated).toEqual(first);
    await Promise.all([
      store.start("example.com", 10),
      store.stop("example.com"),
    ]);
    expect(await store.read("example.com")).toBeUndefined();
  });
});
