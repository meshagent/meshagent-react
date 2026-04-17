# [Meshagent](https://www.meshagent.com)

## MeshAgent React

`@meshagent/meshagent-react` provides React hooks for the room and document utilities built on top of `@meshagent/meshagent`.

The package is the React counterpart to the Flutter utility widgets in `meshagent-flutter`.

## Hooks

- `useRoomConnection(...)`: authorize, connect, retry retryable room startup failures, and dispose a `RoomClient`
- `useDocumentConnection(...)`: open a room document, retry failed opens, and close it on unmount
- `useRoomParticipants(...)`: track the current remote participants for a room
- `useClientToolkits(...)`: host client-side toolkits for the lifetime of a component
- `useRoomIndicators(...)`: listen for typing and thinking indicators on a chat path
- `LivekitClient` / `room.livekit`: fetch LiveKit connection info from the room toolkit
- `LivekitProtocolChannel`: bridge MeshAgent protocol traffic over LiveKit data messages

## Example

```tsx
import {
  staticAuthorization,
  useDocumentConnection,
  useRoomConnection,
} from "@meshagent/meshagent-react";
import type { RoomClient } from "@meshagent/meshagent";

export function RoomScreen(props: {
  projectId: string;
  roomName: string;
  url: string;
  jwt: string;
}) {
  const connection = useRoomConnection({
    authorization: staticAuthorization({
      projectId: props.projectId,
      roomName: props.roomName,
      url: props.url,
      jwt: props.jwt,
    }),
  });

  if (connection.state === "authorizing" || connection.state === "connecting" || connection.state === "retrying") {
    return <div>Connecting...</div>;
  }

  if (!connection.client || connection.state === "done") {
    return <div>Connection failed: {String(connection.error)}</div>;
  }

  return <ConnectedRoom room={connection.client} />;
}

function ConnectedRoom({ room }: { room: RoomClient }) {
  const documentConnection = useDocumentConnection({
    room,
    path: "/notes/thread.thread",
  });

  if (documentConnection.loading) {
    return <div>Loading document...</div>;
  }

  if (documentConnection.error || !documentConnection.document) {
    return <div>Document error: {String(documentConnection.error)}</div>;
  }

  return <div>Connected to document {documentConnection.document.id}</div>;
}
```

## Authorization Helpers

- `developmentAuthorization(...)`: generate a participant JWT locally for development
- `staticAuthorization(...)`: reuse a JWT and room URL that your backend already issued

## Documentation

- [docs.meshagent.com](https://docs.meshagent.com/)
