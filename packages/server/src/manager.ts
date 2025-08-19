import {SSEClient, type SSEClientOptions} from "./client";
import type {EventMap, ServerEvent} from "./types";

/**
 * Manages SSE client connections and event broadcasting.
 *
 * @example
 * const client = SSEManager.default.createClient();
 * client.startHeartbeat();
 * SSEManager.default.sendToClient("session-id", { event: "message", data: "Hello!" });
 * SSEManager.default.broadcast({ event: "global", data: "Broadcast message" });
 * client.close();
 */
export class SSEManager {
  private static defaultInstance: SSEManager;

  // clientId -> client
  private readonly clientsById = new Map<string, SSEClient>();

  /**
   * Get the default singleton instance.
   */
  static get default(): SSEManager {
    if (!SSEManager.defaultInstance) {
      SSEManager.defaultInstance = new SSEManager();
    }
    return SSEManager.defaultInstance;
  }

  /**
   * Create a new SSE client.
   * @param options Options for the SSE client.
   * @template TEvents The type of events to infer when sending messages.
   * @returns A new SSEClient instance.
   */
  createClient<TEvents extends EventMap = EventMap>(
    sseOptions: SSEClientOptions = {}
  ): SSEClient<TEvents> {
    const client = new SSEClient<TEvents>(sseOptions);
    this.addClient(client);
    return client;
  }

  /**
   * Register an existing client.
   * @param client An instance of SSEClient to register.
   * @template TEvents The type of events to infer when sending messages.
   */
  addClient<TEvents extends EventMap = EventMap>(client: SSEClient<TEvents>): void {
    this.clientsById.set(client.sessionId, client as unknown as SSEClient<EventMap>);

    console.log(`SSE client added: ${client.sessionId}`);
  }

  /**
   * Remove a client connection.
   * @param clientId The ID of the client to remove.
   */
  async removeClient(clientId: string): Promise<void> {
    const client = this.clientsById.get(clientId);
    if (!client) {
      return;
    }

    // Clean indexes first
    this.clientsById.delete(clientId);

    // Close the stream last
    await client.close();
    console.log(`SSE client removed: ${clientId}`);
  }

  /**
   * Start a per-connection heartbeat to keep the connection alive.
   * @param clientId The ID of the client to start the heartbeat for.
   * @param ms The interval in milliseconds for the heartbeat. Defaults to 15000.
   */
  startHeartbeat(clientId: string, ms = 15000): void {
    this.clientsById.get(clientId)?.startHeartbeat(ms);
    console.log(`Heartbeat started for client: ${clientId}`);
  }

  /**
   * Send an event to the specified client.
   * @param clientId The ID of the client to send the event to.
   * @param event The SSE event to send.
   * @template TEvents The type of events to infer payload structure.
   * @returns A promise that resolves when the client has been notified.
   */
  async sendToClient<TEvents extends EventMap = EventMap>(
    clientId: string,
    event: ServerEvent<TEvents>
  ): Promise<void> {
    const client = this.clientsById.get(clientId);
    if (!client) {
      return;
    }

    await client.send(event as ServerEvent<EventMap>);
    console.log(`Event sent to client: ${clientId}, event: ${event.event as string}`);
  }

  /**
   * Broadcast an event to all connected clients.
   * @param event The SSE event to broadcast.
   * @template TEvents The type of events to infer payload structure.
   * @returns A promise that resolves when all clients have been notified.
   */
  async broadcast<TEvents extends EventMap = EventMap>(event: ServerEvent<TEvents>): Promise<void> {
    await Promise.all(
      [...this.clientsById.values()].map((c) => c.send(event as ServerEvent<EventMap>))
    );
    console.log(`Broadcast event: ${event.event as string}, data:`, event.data);
  }

  /**
   * Get the number of connected clients.
   * @returns The count of connected clients.
   */
  clientsCount(): number {
    return this.clientsById.size;
  }
}
