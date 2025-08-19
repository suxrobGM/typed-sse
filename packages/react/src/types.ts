/** Standard reserved events that are not user-defined */
type ReservedEvents = "open" | "error" | "message";


/** Generic event map: event name -> payload type */
export type EventMap = {
  [key: string]: unknown;
};

/** Extract event names as string literals from an EventMap and reserved events */
export type EventKey<T extends EventMap> =
  | (Exclude<keyof T, ReservedEvents> & string)
  | ReservedEvents;

export type OpenHandler = () => void;
export type ErrorHandler = (e: Event) => void;
export type MessageHandler = (data: unknown, ev: MessageEvent) => void;
export type NamedHandler<T> = (data: T, ev: MessageEvent) => void;

// prettier-ignore
export type AnyHandler<TEvents extends EventMap, K extends string> =
  K extends "open" ? OpenHandler :
  K extends "error" ? ErrorHandler :
  K extends "message" ? MessageHandler :
  K extends keyof TEvents ? NamedHandler<TEvents[K]> :
  never;

export type UnsubscribeFn = () => void;

// export type BatchHandlers<TEvents extends EventMap> = {
//   open?: OpenHandler;
//   error?: ErrorHandler;
//   message?: MessageHandler;
// } & {
//   [K in EventKey<TEvents>]?: NamedHandler<TEvents[K]>;
// };

export type SubscribeFn<TEvents extends EventMap> = {
  // Named events
  <K extends EventKey<TEvents>>(
    event: K,
    handler: NamedHandler<TEvents[K]>,
  ): UnsubscribeFn;

  // Batch subscription
  //(map: BatchHandlers<TEvents>): UnsubscribeFn;

  // Reserved events
  open: (handler: OpenHandler) => UnsubscribeFn;
  error: (handler: ErrorHandler) => UnsubscribeFn;
  message: (handler: MessageHandler) => UnsubscribeFn;
};

/**
 * Options for the useEventSource hook.
 */
export interface UseEventSourceOptions {
  /** Start immediately (default: false) */
  enabled?: boolean;
  /** Pass cookies for same-origin auth if needed */
  withCredentials?: boolean;
  /** Optional Last-Event-ID to resume a stream */
  lastEventId?: string;
  /** Custom parser for event.data (default: JSON.parse with fallback to string) */
  parse?: (raw: string) => unknown;
  /** Auto-reconnect config */
  reconnect?: {
    /** Enable automatic reconnection (default: true) */
    enabled?: boolean;
    /** Initial delay before reconnecting (default: 1000) */
    initialDelayMs?: number;
    /** Maximum delay between reconnect attempts (default: 15000) */
    maxDelayMs?: number;
    /** Maximum number of reconnect attempts (default: 10) */
    maxRetries?: number;
  };
}

export interface UrlOptions {
  /** Base URL for the SSE endpoint */
  url: string;
  /**
   * Optional query parameters to append to the URL,
   * useful for passing user IDs or other identifiers to the SSE endpoint.
   * Null or undefined values will be filtered out.
   */
  query?: Record<string, string | null | undefined>;
}

/**
 * Return type for the useEventSource hook.
 */
export interface UseEventSourceReturn<TEvents extends EventMap> {
  /** Current SSE connection state */
  state: EventSourceState;
  /** Subscribe to events */
  subscribe: SubscribeFn<TEvents>;
  /** Connect to the SSE endpoint */
  connect: () => void;
  /** Disconnect from the SSE endpoint */
  disconnect: () => void;
}

/**
 * SSE Ready State type.
 * The following values are used:
 * 0 - CONNECTING: The connection is not yet open.
 * 1 - OPEN: The connection is open and ready to send/receive events.
 * 2 - CLOSED: The connection has been closed.
 */
export type EventReadyState = 0 | 1 | 2;

/**
 * Represents the state of a Server-Sent Events (SSE) connection.
 */
export type EventSourceState = {
  /**
   * The URL of the SSE endpoint.
   */
  url: string;
  /**
   * Indicates whether the SSE connection is currently open.
   */
  connected: boolean;
  /**
   * The current ready state of the SSE connection.
   * 0 - CONNECTING, 1 - OPEN, 2 - CLOSED.
   */
  readyState: EventReadyState;
  /**
   * The last event ID received from the server.
   * Used for reconnection purposes.
   */
  lastEventId: string | null;
  /**
   * The last event name received from the server.
   * This can be used to identify the type of the last event.
   */
  lastEventName: string | null;
  /**
   * The last data payload received from the server.
   * This can be any type, depending on the event data structure.
   */
  lastData: unknown;
  /**
   * The last error that occurred during the SSE connection.
   * This can be null if no error has occurred.
   */
  error: Event | null;
};
