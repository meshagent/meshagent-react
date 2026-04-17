import {
  JsonContent,
  RoomClient,
  RoomServerException,
} from '@meshagent/meshagent';

export class LivekitConnectionInfo {
  public readonly url: string;
  public readonly token: string;

  constructor({ url, token }: { url: string; token: string }) {
    this.url = url;
    this.token = token;
  }
}

export class LivekitClient {
  public readonly room: RoomClient;

  constructor({ room }: { room: RoomClient }) {
    this.room = room;
  }

  public async getConnectionInfo({
    breakoutRoom,
  }: {
    breakoutRoom?: string;
  } = {}): Promise<LivekitConnectionInfo> {
    const response = await this.room.invoke({
      toolkit: 'livekit',
      tool: 'connect',
      input: { breakout_room: breakoutRoom ?? null },
    });

    if (!(response instanceof JsonContent)) {
      throw new RoomServerException('unexpected return type from livekit.connect');
    }

    const responseJson = response.json;
    if (
      typeof responseJson !== 'object'
      || responseJson == null
      || Array.isArray(responseJson)
    ) {
      throw new RoomServerException('unexpected return type from livekit.connect');
    }

    const token = responseJson.token;
    const url = responseJson.url;
    if (typeof token !== 'string' || typeof url !== 'string') {
      throw new RoomServerException('unexpected return type from livekit.connect');
    }

    return new LivekitConnectionInfo({ token, url });
  }
}

declare module '@meshagent/meshagent' {
  interface RoomClient {
    readonly livekit: LivekitClient;
  }
}

if (!Object.getOwnPropertyDescriptor(RoomClient.prototype, 'livekit')) {
  Object.defineProperty(RoomClient.prototype, 'livekit', {
    configurable: true,
    enumerable: false,
    get(this: RoomClient): LivekitClient {
      return new LivekitClient({ room: this });
    },
  });
}
