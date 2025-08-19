# Typed Server-Sent Events

Fully typed Server-Sent Events (SSE) implementation for Node.js and browser environments, with a focus on type safety and exceptional developer experience. This library provides a complete solution for real-time communication between server and client, featuring automatic reconnection, heartbeat management, and compile-time type checking for all events.

Unlike traditional SSE implementations that rely on string-based event handling, this library uses TypeScript's type system to ensure that all events are properly typed across both server and client code. This eliminates runtime errors from typos or mismatched data structures, while providing excellent IntelliSense support during development.

The implementation is designed for production use with features like automatic client cleanup, per-user broadcasting, and robust error handling. It supports both individual client targeting and broadcast messaging, making it suitable for applications ranging from simple notifications to complex real-time collaboration features.

## Features

### Type Safety

- **Compile-time validation** of all events across server and client
- **IntelliSense support** with full autocompletion for event names and payloads
- **Runtime error elimination** from typos or mismatched data structures

### Server-side Capabilities

- **Connection Management**: Automatic client registration, cleanup, and pooling
- **Broadcasting Options**: Send to all clients, specific users, or individual tabs/devices
- **Heartbeat System**: Configurable keep-alive mechanism (15s default) for proxy compatibility
- **User Association**: Group multiple client connections per user for targeted messaging
- **Framework Agnostic**: Server-side code works with any Node.js framework

### Client-side Features

- **React Hook Integration**: Purpose-built `useEventSource` hook for seamless React integration
- **Automatic Reconnection**: Intelligent retry logic with exponential backoff
- **Connection State Management**: Real-time status updates and error reporting
- **Flexible URL Construction**: Support for query parameters and dynamic endpoint building
- **Custom Data Parsing**: Configurable JSON parsing with fallback handling

---

## 1. Quick start

### 1-a Define named events

You can define your named typed events in a shared file, for example `src/types/events.ts`:

```ts
export type SSEvents = {
  connected: {clientId: string; userId?: string | null};
  notification: {message: string; timestamp: string};
};
```

### 1-b Implement the SSE route (Next 15 `/app/api/sse/route.ts`)

You can implement the SSE route in a Next.js application like this:

```ts
import {NextRequest, NextResponse} from "next/server";
import {SSEManager} from "@/lib/sse/server";
import type {SSEvents} from "@/types/events";

const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = req.nextUrl.searchParams.get("user_id");

  // 1) Register client
  const client = SSEManager.default.createClient<SSEvents>();
  client.startHeartbeat(); // keep proxies alive

  // 2) Handshake event
  queueMicrotask(() =>
    client.send({
      event: "connected",
      data: {clientId: client.id, userId},
    })
  );

  // 3) Cleanup on disconnect
  req.signal.addEventListener("abort", () => SSEManager.default.removeClient(client.id));

  return new NextResponse(client.readable, {
    status: 200,
    headers: sseHeaders,
  });
}
```

I already implemented a sample SSE route in the `src/app/api/sse/route.ts` file, which handles client registration, heartbeat, and cleanup on disconnect.

### 1-c Consume in React

There is a React hook `useEventSource` that you can use to consume the SSE events in your React components like this:

```tsx
"use client";
import { ReactElement, useEffect } from "react";
import { useEventSource } from "@/lib/sse/client";
import type { SSEvents } from "@/types/events";

export function Notifications({ userId }: { userId?: string }): ReactElement {
  const { state, subscribe } = useEventSource<SSEvents>(
    "/api/sse",
    { enabled: true }, // auto-connect
  );

  // listen for a named event
  useEffect(() => {
    const off = subscribe("notification", (d) =>
      console.log("Hello", d.message),
    );
    return off;
  }, [subscribe]);

  return <p>{state.connected ? "🟢 live" : "🔴 offline"}</p>;
}
```

This hook automatically connects to the SSE route, manages reconnections, and provides a `subscribe` function to listen for specific events from the type-safe `SSEvents`.

I already implemented a sample React component in the `src/app/sse/components/SSEDemo.tsx` file, which demonstrates full usage of the `useEventSource` hook.

---

## 2. Server-side API

### Overview

The server-side API consists of two main classes that work together to provide a robust SSE implementation:

- **`SSEManager`**: A singleton class that manages all client connections and provides broadcasting capabilities
- **`SSEClient`**: Represents individual client connections with type-safe event sending

Both classes are strongly typed with the `EventMap` generic, ensuring compile-time validation of all events. This type safety extends across your entire application, preventing common runtime errors and providing excellent IntelliSense support.

### Key Features

- **Type Safety**: All events are validated at compile time using TypeScript generics
- **Connection Management**: Automatic client registration, cleanup, and connection pooling
- **Broadcasting Options**: Send to all clients, specific users, or individual clients/tabs
- **Heartbeat System**: Configurable keep-alive mechanism to prevent proxy timeouts
- **Error Handling**: Robust error handling with automatic cleanup on connection failures

### SSEManager Class

The `SSEManager` class is the central hub for managing SSE connections. It provides a default singleton instance (`SSEManager.default`) for convenience, though you can create custom instances if needed.

**Core Methods:**

- `createClient<TEvents>(options?)`: Creates and registers a new SSE client
- `broadcast<TEvents>(event, data)`: Sends events to all connected clients
- `sendToUser<TEvents>(userId, event, data)`: Sends events to all clients for a specific user
- `sendToClient<TEvents>(clientId, event, data)`: Sends events to a specific client
- `removeClient(clientId)`: Cleanly removes and closes a client connection

### SSEClient Class

Each `SSEClient` represents a single connection (browser tab/device) and provides methods for sending events and managing the connection lifecycle.

**Core Methods:**

- `send<TEvents>(event, data)`: Sends a typed event to this specific client
- `startHeartbeat(intervalMs?)`: Starts periodic ping messages (default: 15 seconds)
- `close()`: Closes the connection and cleans up resources

**Properties:**

- `id`: Unique client identifier
- `userId`: Optional user association for user-based broadcasting
- `readable`: ReadableStream for the SSE connection

Example client registration in a Next.js API route:

```ts
import {type NextRequest, NextResponse} from "next/server";
import {SSEManager} from "@/lib/sse/server";
import type {SSEvents} from "@/types/events";

const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

/**
 * Create a new SSE client connection.
 * This will register the client and start a heartbeat to keep the connection alive.
 * The client will receive a handshake event with its ID and user ID (if provided).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const searchParams = req.nextUrl.searchParams;
  const userId = searchParams.get("user_id"); // optional user ID

  // Register and start heartbeat
  const client = SSEManager.default.createClient<SSEvents>({userId});
  client.startHeartbeat();

  console.log(`SSE client connected: ${client.id}, user ID: ${userId}`);

  // Send the handshake event after the response is sent
  queueMicrotask(() => {
    client
      .send({event: "connected", data: {clientId: client.id, userId}})
      .then(() => console.log(`SSE handshake sent for client: ${client.id}`))
      .catch((err) => console.error("Handshake send failed:", err));
  });

  // Cleanup when the request is aborted (client disconnects)
  req.signal.addEventListener("abort", () => {
    SSEManager.default
      .removeClient(client.id)
      .then(() => console.log(`SSE disconnected: ${client.id}`))
      .catch((err) => console.error(`Error removing SSE client: ${err}`));
  });

  return new NextResponse(client.readable, {
    headers: sseHeaders,
    status: 200,
  });
}
```

Example event broadcasting:

```ts
type MyEvents = {
  notification: { message: string; timestamp: string };
  connected: { clientId: string; userId?: string | null };
};

// broadcasting, send the notification event to all connected clients
await SSEManager.default.broadcast<MyEvents>("notification", {
  message: "Hello, world",
  timestamp: new Date().toISOString(),
});

// send to a specific user (all their tabs/devices)
await SSEManager.default.sendToUser<MyEvents>("user-123", "notification", { ... });

// send to a specific client (can be a tab or device)
await SSEManager.default.sendToClient<MyEvents>(clientId, "notification", { ... });
```

### Lifecycle helpers

| Method                          | Purpose                                      |
| ------------------------------- | -------------------------------------------- |
| `createClient(opts?)`           | returns `SSEClient`; automatically registers |
| `removeClient(id)`              | cleanup & closes stream                      |
| `startHeartbeat(clientId, ms?)` | per-connection keep-alive (defaults 15 s)    |
| `clientsCount()`                | metrics for dashboards                       |

All helpers accept generic `<TEvents extends EventMap>` so you can define your own event types and then use them with `SSEManager` and `SSEClient` methods.

`SSEClient.startHeartbeat()` sends `: ping <ts>` every _n_ ms (default 15 000) — enough to keep AWS ALB, Nginx & Cloudflare from timing out. Every send/heartbeat is wrapped in `try/catch`; failures close the client. `SSEManager` logs `client added / removed`, broadcast counts, and errors.

---

## 3. Client-side API

### Client Overview

The client-side API is centered around the `useEventSource` React hook, which provides a complete solution for consuming SSE events in React applications. This hook abstracts away the complexity of managing `EventSource` connections while maintaining full type safety and providing advanced features like automatic reconnection and error handling.

### Client Key Features

- **Type Safety**: Strongly typed with `EventMap` generics for compile-time event validation
- **Automatic Reconnection**: Intelligent retry logic with exponential backoff
- **Connection Management**: Automatic connection establishment and cleanup
- **Event Subscription**: Simple, typed event listeners with cleanup handling
- **State Management**: Real-time connection state and error reporting
- **Flexible Configuration**: Customizable reconnection strategies and connection options

### useEventSource Hook

The `useEventSource` hook is the primary interface for consuming SSE events in React components. It handles all the low-level details of working with `EventSource` while providing a clean, typed API.

**Function Signature:**

```ts
useEventSource<TEvents extends EventMap>(
  endpoint: string | { url: string; query?: Record<string, string> },
  options?: UseEventSourceOptions
)
```

**Return Value:**

- `state`: Connection state object with status, error information, and last event
- `subscribe`: Function to register typed event listeners
- `connect`: Manual connection function (when `enabled: false`)
- `disconnect`: Function to close the connection

### Configuration Options

The hook accepts an options object that allows you to customize its behavior:

**Connection Options:**

- `enabled` (boolean, default: `false`): Whether to auto-connect on mount
- `withCredentials` (boolean, default: `false`): Include cookies in requests

**Reconnection Strategy:**

- `reconnect.initialDelayMs` (number, default: `1000`): Initial retry delay
- `reconnect.maxDelayMs` (number, default: `15000`): Maximum retry delay
- `reconnect.maxRetries` (number, default: `10`): Maximum retry attempts

**Data Processing:**

- `parse` (function): Custom JSON parser for event data (defaults to `JSON.parse`)

### URL Construction

The first parameter supports two formats for maximum flexibility:

1. **Simple string**: Direct URL to the SSE endpoint

   ```ts
   useEventSource<MyEvents>("/api/sse");
   ```

2. **Object with query parameters**: Automatic URL construction with query string

   ```ts
   useEventSource<MyEvents>({
     url: "/api/sse",
     query: {user_id: userId, channel: "notifications"},
   });
   // Results in: /api/sse?user_id=userId&channel=notifications
   ```

Example usage:

```ts
function MyComponent() {
  const { state, subscribe, connect, disconnect } = useEventSource<MyEvents>(
    { url: "/api/sse", query: { user_id: "user-123" } },
    {
      enabled: false, // manual connect
      reconnect: { maxRetries: 8 },
    },
  );

  useEffect(() => {
    // subscribe to a specific event
    const offNotification = subscribe("notification", (data) => {
      console.log("Hello", data.message);
    });

    const offConnected = subscribe("connected", (data) => {
      console.log("Client connected:", data.clientId, data.userId);
    });

    // unnamed events
    const offMessage = subscribe("message", (data) => {
      console.log("New message:", data.content);
    });

    // cleanup subscriptions
    return () => {
      offNotification();
      offConnected();
      offMessage();
    };
  }, [subscribe]);

  return (
    <div>
      <p>{state.connected ? "🟢 live" : "🔴 offline"}</p>
      <button onClick={connect}>Connect</button>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  );
}
```

---

## 4. Backend integration examples

Below are some examples of how to integrate the SSE server-side API into backend code like webhook handlers or background jobs.

### Webhook handler

```ts
import {SSEManager} from "@/lib/sse/server";
import type {SSEvents} from "@/types/events";

export async function POST(req: Request) {
  const payload = await req.json(); // Stripe event
  await SSEManager.default.broadcast<SSEvents>("notification", {
    message: "Payment received",
    timestamp: new Date().toISOString(),
  });
  return new Response("ok");
}
```

### Background job

```ts
import {cron} from "node-cron";
import {SSEManager} from "@/lib/sse/server";
import type {SSEvents} from "@/types/events";

cron("0 0 * * *", async () => {
  await SSEManager.default.broadcast<SSEvents>("notification", {
    message: "Daily summary ready!",
    timestamp: new Date().toISOString(),
  });
});
```

Backend modules never touch raw SSE APIs—they only call typed helpers.

---

## 5. Folder structure

```text
lib/
└─ sse/
   ├─ client/
   │  ├─ hooks/useEventSource.tsx   # React hook
   │  ├─ types.ts                   # client shared types
   │  └─ utils.ts                   # buildUrl, safeParseJson
   ├─ server/
   │  ├─ client.ts                  # SSEClient<TEvents>
   │  ├─ manager.ts                 # SSEManager singleton
   │  └─ types.ts                   # ServerEvent helpers
   ├─ shared/
   │  └─ types.ts                   # shared types (EventMap)
   └─ index.ts                      # barrel exports
```

Routes live in `app/api/sse` and `app/api/sse/emit`. The sample demo page is in `app/sse/page.tsx`.

---
