// SSE reserved event names
type ReservedServerEvents = "message";

// Optional meta fields
type SSEMeta = { id?: string; retry?: number };

// Strongly-typed event
type ServerEventOf<TEvents extends EventMap, K extends keyof TEvents> = {
  event: K;
  data: TEvents[K];
} & SSEMeta;

// Default unnamed "message" event
type DefaultMessage<T = unknown> = {
  event?: undefined | ReservedServerEvents;
  data: T;
} & SSEMeta;

export type ServerEvent<TEvents extends EventMap = EventMap> =
  | ServerEventOf<TEvents, keyof TEvents>
  | DefaultMessage;

  /** Generic event map: event name -> payload type */
export type EventMap = {
  [key: string]: unknown;
};
