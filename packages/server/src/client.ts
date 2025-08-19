import * as crypto from "crypto";
import type { ServerEvent, EventMap } from "./types";

/**
 * Options for the SSE client.
 */
export interface SSEClientOptions {
  /** Optional user ID associated with this client */
  userId?: string | null;
}

/**
 * Represents a Server-Sent Events (SSE) client.
 * This class manages the connection, sending events, and handling heartbeats.
 *
 * @template TEvents The type of events to infer when sending messages.
 * This allows for strongly-typed event handling.
 */
export class SSEClient<TEvents extends EventMap = EventMap> {
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private readonly encoder = new TextEncoder();
  private heartbeat: NodeJS.Timeout | null = null;
  private closed = false;

  //#region Public properties

  /** Unique identifier for this SSE client */
  public readonly id = crypto.randomUUID();

  /** Optional user ID associated with this client */
  public readonly userId: string | null = null;

  /** Readable stream for this client's SSE messages */
  public readonly readable: ReadableStream<Uint8Array>;

  //#endregion

  /**
   * Creates a new SSE client.
   * @param options Options for the SSE client.
   */
  constructor(options?: SSEClientOptions) {
    const stream = new TransformStream<Uint8Array, Uint8Array>();

    this.userId = options?.userId ?? null;
    this.writer = stream.writable.getWriter();
    this.readable = stream.readable;
  }

  /**
   * Send a structured SSE event to this client.
   * @template T The type of payload in the event.
   * @param evt The SSE event to send.
   * @returns A promise that resolves when the event has been sent.
   */
  send(evt: ServerEvent<TEvents>): Promise<void> {
    console.log(`Sending event to client ${this.id}:`, evt);
    return this.writeRaw(this.formatMessage(evt));
  }

  /**
   * Sends a ping event to keep the connection alive.
   * @returns A promise that resolves when the ping has been sent.
   */
  ping(): Promise<void> {
    return this.writeRaw(this.encoder.encode(`: ping ${Date.now()}\n\n`));
  }

  /**
   * Starts the heartbeat for this client.
   * This will send periodic pings to keep the connection alive.
   * @param ms The interval in milliseconds for the heartbeat. Defaults to 15000 (15 seconds).
   */
  startHeartbeat(ms = 15000): void {
    this.stopHeartbeat();
    console.log(
      `Starting heartbeat for client ${this.id} with interval ${ms}ms`,
    );

    this.heartbeat = setInterval(() => {
      this.ping()
        .then(() => console.log(`Heartbeat ping sent for client ${this.id}`))
        .catch(() => this.close());
    }, ms);
  }

  /**
   * Stops the heartbeat for this client.
   * This will prevent further pings from being sent.
   */
  stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
    }
    this.heartbeat = null;
    console.log(`Heartbeat stopped for client ${this.id}`);
  }

  /**
   * Checks if the SSE client connection is closed.
   * @returns True if the connection is closed, false otherwise.
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Closes the SSE client connection.
   * This will stop the heartbeat and close the writable stream.
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.stopHeartbeat();

    try {
      await this.writer.close();
    } catch {
      // already closed/aborted
    }

    console.log(`SSE client connection closed: ${this.id}`);
  }

  /**
   * Write raw data to the client's writable stream.
   * @param buf The data to write.
   * @returns A promise that resolves when the data has been written.
   */
  private async writeRaw(buf: Uint8Array): Promise<void> {
    if (this.closed) {
      return;
    }

    try {
      await this.writer.write(buf);
    } catch {
      await this.close();
    }
  }

  /**
   * Formats an SSE event into a Uint8Array.
   * @param sseEvent The SSE event object to format.
   * @returns The formatted SSE event as a Uint8Array.
   */
  private formatMessage(sseEvent: ServerEvent<TEvents>): Uint8Array {
    const { event, data, id, retry } = sseEvent;

    let chunk = "";
    if (id) chunk += `id: ${id}\n`;
    if (event) chunk += `event: ${event as string}\n`;
    if (retry) chunk += `retry: ${retry}\n`;
    if (data !== undefined) {
      const serialized = typeof data === "string" ? data : JSON.stringify(data);
      chunk += `data: ${serialized}\n`;
    }
    chunk += `\n`; // end of message
    return this.encoder.encode(chunk);
  }
}
