import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

export async function verifyBackgroundSource(
  profile,
  extensionId,
  backgroundPath,
) {
  const [port, socketPath] = (
    await readFile(join(profile, "DevToolsActivePort"), "utf8")
  )
    .trim()
    .split("\n");
  const socket = new WebSocket(`ws://127.0.0.1:${port}${socketPath}`);
  const pending = new Map();
  const parsed = [];
  let nextId = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Background identity timed out: ${method}`));
      }, 10000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const operation = pending.get(message.id);
    if (operation) {
      clearTimeout(operation.timeout);
      pending.delete(message.id);
      message.error
        ? operation.reject(new Error(JSON.stringify(message.error)))
        : operation.resolve(message.result);
    } else if (message.method === "Debugger.scriptParsed")
      parsed.push({ ...message.params, sessionId: message.sessionId });
  });
  let sessionId;
  try {
    const { targetInfos } = await send("Target.getTargets");
    const target = targetInfos.find(
      (target) =>
        target.type === "service_worker" &&
        target.url === `chrome-extension://${extensionId}/background.js`,
    );
    if (!target)
      throw new Error("The extension service worker is not running.");
    ({ sessionId } = await send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    }));
    await send("Debugger.enable", {}, sessionId);
    const script = parsed.find(
      (script) => script.sessionId === sessionId && script.url === target.url,
    );
    if (!script)
      throw new Error("Chrome did not expose the executed background script.");
    const { scriptSource } = await send(
      "Debugger.getScriptSource",
      { scriptId: script.scriptId },
      sessionId,
    );
    const expected = await readFile(backgroundPath, "utf8");
    const hash = (value) => createHash("sha256").update(value).digest("hex");
    const result = {
      actualHash: hash(scriptSource),
      expectedHash: hash(expected),
      bytes: Buffer.byteLength(scriptSource),
      matches: scriptSource === expected,
    };
    if (!result.matches)
      throw new Error(
        `The persistent profile executes a stale background build: ${JSON.stringify(result)}. Use a fresh experiment profile; do not treat this as a product regression.`,
      );
    return result;
  } finally {
    if (sessionId) {
      await send("Debugger.disable", {}, sessionId);
      await send("Target.detachFromTarget", { sessionId });
    }
    for (const operation of pending.values()) clearTimeout(operation.timeout);
    socket.close();
  }
}
