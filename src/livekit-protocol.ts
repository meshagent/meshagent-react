import type { ProtocolChannel } from '@meshagent/meshagent';
import * as livekit from 'livekit-client';

type DataReceivedHandler = (data: Uint8Array) => void;

type LivekitDataReceivedCallback = livekit.RoomEventCallbacks['dataReceived'];

export class LivekitProtocolChannel implements ProtocolChannel {
  private readonly room: livekit.Room;
  private readonly remote: livekit.RemoteParticipant;
  private readonly topic: string;
  private onDataReceived?: DataReceivedHandler;
  private readonly handleDataReceivedBound: LivekitDataReceivedCallback;

  constructor({
    room,
    remote,
    topic,
  }: {
    room: livekit.Room;
    remote: livekit.RemoteParticipant;
    topic: string;
  }) {
    this.room = room;
    this.remote = remote;
    this.topic = topic;
    this.handleDataReceivedBound = this.handleDataReceived.bind(this);
  }

  public start(
    onDataReceived: (data: Uint8Array) => void,
    _params: {
      onDone?: () => void;
      onError?: (error: unknown) => void;
    },
  ): void {
    this.onDataReceived = onDataReceived;
    this.room.on(livekit.RoomEvent.DataReceived, this.handleDataReceivedBound);
  }

  public async sendData(data: Uint8Array): Promise<void> {
    await this.room.localParticipant.publishData(data, {
      reliable: true,
      topic: this.topic,
      destinationIdentities: [this.remote.identity],
    });
  }

  public dispose(): void {
    this.room.off(livekit.RoomEvent.DataReceived, this.handleDataReceivedBound);
    this.onDataReceived = undefined;
  }

  private handleDataReceived(
    payload: Uint8Array,
    participant?: livekit.RemoteParticipant,
    _kind?: livekit.DataPacket_Kind,
    topic?: string,
    _encryptionType?: livekit.Encryption_Type,
  ): void {
    const identityMatches = participant?.identity === this.remote.identity;

    if (identityMatches && topic === this.topic) {
      this.onDataReceived?.(payload);
    }
  }
}
