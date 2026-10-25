import net from "node:net";
import { randomUUID } from "node:crypto";

/** Independent fixture actor through the documented TCP protocol, not a database shortcut. */
export class TcpPeer {
  private socket = new net.Socket();
  private bytes = Buffer.alloc(0);
  private pending = new Map<
    string,
    {
      resolve: (data: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }
  >();
  constructor() {
    this.socket.on("data", (chunk) => {
      this.bytes = Buffer.concat([this.bytes, chunk]);
      while (this.bytes.length >= 4) {
        const length = this.bytes.readInt32BE(0);
        if (length <= 0 || length > 262144) {
          this.socket.destroy(new Error("Invalid Core frame"));
          return;
        }
        if (this.bytes.length < length + 4) return;
        const message = JSON.parse(
          this.bytes.subarray(4, length + 4).toString("utf8"),
        );
        this.bytes = this.bytes.subarray(length + 4);
        if (message.kind !== "RESPONSE") continue;
        const call = this.pending.get(message.requestId);
        this.pending.delete(message.requestId);
        if (message.ok) call?.resolve(message.data);
        else
          call?.reject(new Error(`${message.errorCode}: ${message.message}`));
      }
    });
    const fail = (error: Error) => {
      for (const call of this.pending.values()) call.reject(error);
      this.pending.clear();
    };
    this.socket.on("error", fail);
    this.socket.on("close", () => fail(new Error("Core socket closed")));
  }
  async connect() {
    await new Promise<void>((resolve, reject) => {
      this.socket.once("error", reject);
      this.socket.connect(18081, "127.0.0.1", () => {
        this.socket.off("error", reject);
        resolve();
      });
    });
    return this;
  }
  async call(action: string, data: unknown) {
    const requestId = randomUUID();
    const body = Buffer.from(
      JSON.stringify({
        version: 1,
        kind: "REQUEST",
        requestId,
        action,
        ok: true,
        data,
      }),
    );
    const frame = Buffer.alloc(body.length + 4);
    frame.writeInt32BE(body.length);
    body.copy(frame, 4);
    try {
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(requestId);
          reject(new Error("TCP fixture timed out"));
        }, 6000);
        this.pending.set(requestId, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        this.socket.write(frame);
      });
    } finally {
      this.pending.delete(requestId);
    }
  }
  close() {
    this.socket.destroy();
  }
}
