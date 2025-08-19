"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EventSourceState,
  EventReadyState,
  AnyHandler,
  UnsubscribeFn,
  SubscribeFn,
  EventKey,
  OpenHandler,
  ErrorHandler,
  MessageHandler,
  NamedHandler,
  UrlOptions,
  UseEventSourceOptions,
  UseEventSourceReturn,
} from "../types";
import { buildUrl, isReservedEvent, safeParseJson } from "../utils";
import type { EventMap } from "../types";

/**
 * Hook to manage a Server-Sent Events (SSE) connection and state.
 * This hook provides a simple interface to connect, disconnect, and handle events from an SSE endpoint.
 * It supports automatic reconnection with exponential backoff and allows for custom event handlers.
 *
 * @param url The SSE endpoint URL to connect to.
 * @template TEvents Optional type for event names and payloads.
 * @param opts Optional configuration for the SSE connection.
 * @returns An object containing the current state of the connection and methods to connect/disconnect.
 *
 * @example
 * // Custom named events
 * interface SSEvents {
 *   connected: { clientId: string; userId: string };
 * }
 *
 * // Automatically connect to an SSE endpoint
 * const { subscribe, state, connect, disconnect } = useEventSource<SSEvents>("/api/sse/", { enabled: true });
 *
 * // Listen for the "connected" event
 * useEffect(() => {
 *  const off = subscribe("connected", (data) => {
 *    console.log("SSE connected:", data);
 *  });
 *
 *  // Unnamed events (raw message)
 *  // This listens to all "message" events that do not have a specific name
 *  // Typically used for simple text or JSON messages without a custom event name
 *  const offMessage = subscribe("message", (data, ev) => {
 *    console.log("SSE message:", data);
 *  });
 *
 *  // Cleanup on unmount
 *  return () => {
 *    off();
 *    offMessage();
 *  };
 * }, [subscribe]);
 */
export function useEventSource<TEvents extends EventMap = EventMap>(
  url: string | UrlOptions,
  opts?: UseEventSourceOptions,
): UseEventSourceReturn<TEvents> {
  const {
    enabled = false,
    withCredentials = false,
    lastEventId,
    parse = safeParseJson,
    reconnect = {},
  } = opts ?? {};

  const {
    enabled: reconnectEnabled = true,
    initialDelayMs = 1000,
    maxDelayMs = 15000,
    maxRetries = 10,
  } = reconnect;

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);

  // name -> Set<handler>
  const listenersRef = useRef<Map<string, Set<AnyHandler<TEvents, string>>>>(new Map()); // prettier-ignore

  // name -> DOM dispatcher
  const dispatchersRef = useRef<Map<string, (ev: MessageEvent) => void>>(new Map()); // prettier-ignore

  const urlString = useMemo(() => buildUrl(url), [url]);

  const [state, setState] = useState<EventSourceState>({
    url: urlString,
    connected: false,
    readyState: 0,
    lastEventId: lastEventId ?? null,
    lastEventName: null,
    lastData: null,
    error: null,
  });

  // Emit to all subscribers for a name
  const emit = useCallback((name: string, ...args: unknown[]) => {
    const set = listenersRef.current.get(name);
    if (!set) {
      return;
    }

    for (const fn of set) {
      try {
        // @ts-expect-error runtime dispatch, types ensured at subscribe sites
        fn(...args);
      } catch (err) {
        console.error(`Listener for "${name}" threw`, err);
      }
    }
  }, []);

  // Attach a named event listener to the current EventSource if not already attached
  const attachNamedIfNeeded = useCallback(
    (name: string) => {
      if (isReservedEvent(name)) {
        return;
      }

      if (!eventSourceRef.current || dispatchersRef.current.has(name)) {
        return;
      }

      const dispatch = (ev: MessageEvent) => {
        const set = listenersRef.current.get(name);

        // quick bail if no subs
        if (!set || set.size === 0) {
          return;
        }

        const data = parse(ev.data as string);
        setState((s) => ({
          ...s,
          lastEventId: ev.lastEventId || s.lastEventId,
          lastEventName: name,
          lastData: data,
        }));
        emit(name, data, ev);
      };

      eventSourceRef.current.addEventListener(name, dispatch);
      dispatchersRef.current.set(name, dispatch);
    },
    [emit, parse],
  );

  const attachAllNamed = useCallback(() => {
    for (const name of listenersRef.current.keys()) {
      if (!isReservedEvent(name)) {
        attachNamedIfNeeded(name);
      }
    }
  }, [attachNamedIfNeeded]);

  // Add/remove a listener from the Map
  const addListener = useCallback(
    (name: string, handler: AnyHandler<TEvents, string>): UnsubscribeFn => {
      let set = listenersRef.current.get(name);
      if (!set) {
        set = new Set();
        listenersRef.current.set(name, set);
      }
      set.add(handler);

      attachNamedIfNeeded(name);

      return () => {
        console.log(`Listener removed for "${name}"`);

        const current = listenersRef.current.get(name);
        if (!current) {
          return;
        }

        current.delete(handler);
        if (current.size > 0) {
          return;
        }

        // last handler removed
        listenersRef.current.delete(name);
        const disp = dispatchersRef.current.get(name);

        if (disp && eventSourceRef.current && !isReservedEvent(name)) {
          eventSourceRef.current.removeEventListener(name, disp);
        }
        dispatchersRef.current.delete(name);
      };
    },
    [attachNamedIfNeeded],
  );

  // Build the typed subscribe() function with reserved helpers
  const subscribe = useMemo<SubscribeFn<TEvents>>(() => {
    // Generic callable that preserves K inference
    const core = <K extends EventKey<TEvents>>(
      event: K,
      handler: NamedHandler<TEvents[K]>,
    ): UnsubscribeFn =>
      addListener(event, handler as AnyHandler<TEvents, string>);

    // Attach reserved helpers
    const api = Object.assign(core, {
      open: (h: OpenHandler) =>
        addListener("open", h as unknown as AnyHandler<TEvents, string>),
      error: (h: ErrorHandler) =>
        addListener("error", h as unknown as AnyHandler<TEvents, string>),
      message: (h: MessageHandler) =>
        addListener("message", h as unknown as AnyHandler<TEvents, string>),
    }) satisfies SubscribeFn<TEvents>;

    return api;
  }, [addListener]);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Detach all named listeners
    if (eventSourceRef.current) {
      for (const [name, dispatch] of dispatchersRef.current) {
        eventSourceRef.current.removeEventListener(name, dispatch);
      }
    }

    dispatchersRef.current.clear();
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const connect = useCallback(() => {
    if (eventSourceRef.current?.readyState === EventSource.OPEN) {
      console.warn("EventSource is already connected");
      return;
    }

    destroyedRef.current = false;
    cleanup();

    const eventSource = new EventSource(urlString, { withCredentials });
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      retryRef.current = 0;
      setState((s) => ({ ...s, connected: true, readyState: 1, error: null }));
      emit("open");

      // Attach all named listeners once connected
      attachAllNamed();
    };

    eventSource.onerror = (e) => {
      console.error("EventSource error:", e);

      setState((s) => ({
        ...s,
        connected: false,
        readyState: eventSource.readyState as EventReadyState,
        error: e,
      }));

      emit("error", e);

      if (eventSource.readyState === EventSource.CLOSED) {
        scheduleReconnect();
      }
    };

    eventSource.onmessage = (ev) => {
      const data = parse(ev.data as string);

      setState((s) => ({
        ...s,
        lastEventId: ev.lastEventId || s.lastEventId,
        lastEventName: "message",
        lastData: data,
      }));
      emit("message", data, ev);
    };
  }, [urlString, withCredentials, cleanup, parse, emit, attachAllNamed]);

  const scheduleReconnect = useCallback(() => {
    if (!reconnectEnabled || destroyedRef.current) {
      return;
    }
    if (retryRef.current >= maxRetries) {
      return;
    }

    // Calculate exponential backoff delay with a cap at maxDelayMs
    // Example: 1000, 2000, 4000, ..., capped at maxDelayMs
    const delay = Math.min(
      initialDelayMs * Math.pow(2, retryRef.current),
      maxDelayMs,
    );

    retryRef.current += 1;
    timerRef.current = setTimeout(() => {
      connect(); // try again
    }, delay);

    console.log(
      `Reconnecting in ${delay}ms (attempt ${retryRef.current + 1}/${maxRetries})`,
    );
  }, [initialDelayMs, maxDelayMs, maxRetries, reconnectEnabled, connect]);

  const disconnect = useCallback(() => {
    destroyedRef.current = true;
    cleanup();
    setState((s) => ({ ...s, connected: false, readyState: 2 })); // CLOSED
  }, [cleanup]);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => disconnect();
  }, [enabled, connect, disconnect]);

  return {
    state,
    subscribe,
    connect,
    disconnect,
  };
}
