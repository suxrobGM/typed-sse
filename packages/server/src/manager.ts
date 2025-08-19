import { SSEClient, type SSEClientOptions } from "./client";
import type { ServerEvent, EventMap } from "./types";

/**
 * Manages SSE client connections and event broadcasting.
 *
 * @example
 * const client = SSEManager.default.createClient({ userId: "user-id" });
 * client.startHeartbeat();
 * SSEManager.default.sendToUser("user-id", { event: "message", data: "Hello!" });
 * SSEManager.default.broadcast({ event: "global", data: "Broadcast message" });
 * client.close();
 */
export class SSEManager {
  private static defaultInstance: SSEManager;

  // clientId -> client
  private readonly clientsById = new Map<string, SSEClient>(); // prettier-ignore

  // userId -> set of clientIds
  private readonly clientIdsByUser = new Map<string, Set<string>>();

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
   * Create a new SSE client for a user.
   * @param options Options for the SSE client.
   * @template TEvents The type of events to infer when sending messages.
   * @returns A new SSEClient instance.
   */
  createClient<TEvents extends EventMap = EventMap>(
    sseOptions?: SSEClientOptions,
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
  addClient<TEvents extends EventMap = EventMap>(
    client: SSEClient<TEvents>,
  ): void {
    this.clientsById.set(client.id, client as SSEClient<EventMap>);

    // If client has a userId, add it to the user index
    if (client.userId) {
      let set = this.clientIdsByUser.get(client.userId);
      if (!set) {
        set = new Set<string>();
        this.clientIdsByUser.set(client.userId, set);
      }
      set.add(client.id);
    }

    console.log(`SSE client added: ${client.id}, user: ${client.userId}`);
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

    if (client.userId) {
      const set = this.clientIdsByUser.get(client.userId);
      if (set) {
        set.delete(clientId);
        if (set.size === 0) this.clientIdsByUser.delete(client.userId);
      }
    }

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
    event: ServerEvent<TEvents>,
  ): Promise<void> {
    const client = this.clientsById.get(clientId);
    if (!client) {
      return;
    }

    await client.send(event as ServerEvent<EventMap>);
    console.log(
      `Event sent to client: ${clientId}, event: ${event.event as string}`,
    );
  }

  /**
   * Send an event to all clients associated with a user.
   * @param userId The ID of the user to send the event to.
   * @param event The SSE event to send.
   * @template TEvents The type of events to infer payload structure.
   * @returns A promise that resolves when all clients have been notified.
   */
  async sendToUser<TEvents extends EventMap = EventMap>(
    userId: string,
    event: ServerEvent<TEvents>,
  ): Promise<void> {
    const ids = this.clientIdsByUser.get(userId);
    if (!ids?.size) {
      console.warn(`No clients found for user ID: ${userId}`);
      return;
    }

    await Promise.all(
      [...ids].map((cid) =>
        this.clientsById.get(cid)?.send(event as ServerEvent<EventMap>),
      ),
    );

    console.log(
      `Event sent to user: ${userId}, event: ${event.event as string}`,
    );
  }

  /**
   * Broadcast an event to all connected clients.
   * @param event The SSE event to broadcast.
   * @template TEvents The type of events to infer payload structure.
   * @returns A promise that resolves when all clients have been notified.
   */
  async broadcast<TEvents extends EventMap = EventMap>(
    event: ServerEvent<TEvents>,
  ): Promise<void> {
    await Promise.all(
      [...this.clientsById.values()].map((c) =>
        c.send(event as ServerEvent<EventMap>),
      ),
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

  /**
   * Get the number of unique users with connected clients.
   * @returns The count of unique users.
   */
  usersCount(): number {
    return this.clientIdsByUser.size;
  }
}
