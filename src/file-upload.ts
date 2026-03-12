import { EventEmitter, RoomClient } from "@meshagent/meshagent";

export enum UploadStatus {
  Initial   = "initial",
  Uploading = "uploading",
  Completed = "completed",
  Failed    = "failed",
}

interface UploadStatusEvent {
    status: UploadStatus;
    progress?: number; // Optional, only for progress events
}

export abstract class FileUpload extends EventEmitter<UploadStatusEvent> {
  protected _status: UploadStatus = UploadStatus.Initial;

  protected constructor(
    public path: string,
    public size: number = 0,
  ) {
    super();
  }

  get status(): UploadStatus {
    return this._status;
  }

  protected set status(value: UploadStatus) {
    if (this._status !== value) {
      this._status = value;
      this.emit("status", {
          status: value,
          progress: this.bytesUploaded,
      });
    }
  }

  abstract get bytesUploaded(): number;

  abstract get done(): Promise<void>;

  get filename(): string {
    return this.path.split("/").pop() ?? "";
  }

  abstract startUpload(): void;
}

export class MeshagentFileUpload extends FileUpload {
  private _bytesUploaded = 0;

  private _done!: Promise<void>;
  private _resolveDone!: () => void;
  private _rejectDone!: (reason?: unknown) => void;

  private _downloadUrl!: Promise<URL>;
  private _resolveUrl!: (url: URL) => void;
  private _rejectUrl!: (reason?: unknown) => void;

  constructor(
    public readonly room: RoomClient,
    path: string,

    public readonly dataStream: AsyncIterable<Uint8Array>,
    size = 0,
    autoStart = true,
  ) {
    super(path, size);

    this._done = new Promise<void>((res, rej) => {
      this._resolveDone = res;
      this._rejectDone = rej;
    });

    this._downloadUrl = new Promise<URL>((res, rej) => {
      this._resolveUrl = res;
      this._rejectUrl = rej;
    });

    if (autoStart) this._upload();
  }

  static deferred(
    room: RoomClient,
    path: string,
    dataStream: AsyncIterable<Uint8Array>,
    size = 0,
  ): MeshagentFileUpload {
    return new MeshagentFileUpload(room, path, dataStream, size, false);
  }

  get bytesUploaded(): number {
    return this._bytesUploaded;
  }

  get done(): Promise<void> {
    return this._done;
  }

  /** Resolves to the server’s public download URL – like Dart version. */
  get downloadUrl(): Promise<URL> {
    return this._downloadUrl;
  }

  startUpload(): void {
    this._upload(); // idempotent guard inside _upload()
  }

  private async _upload(): Promise<void> {
    if (this.status !== UploadStatus.Initial) {
      throw new Error("upload already started or completed");
    }

    try {
      this.status = UploadStatus.Uploading;

      const self = this;
      async function* trackedChunks(): AsyncIterable<Uint8Array> {
        for await (const chunk of self.dataStream) {
          self._bytesUploaded += chunk.length;
          self.emit("progress", {
            status: UploadStatus.Uploading,
            progress: self.bytesUploaded / self.size,
          });
          yield chunk;
        }
      }

      await this.room.storage.uploadStream(this.path, trackedChunks(), {
        overwrite: true,
        size: this.size,
      });

      this._resolveDone();
      this.status = UploadStatus.Completed;

      const urlStr = await this.room.storage.downloadUrl(this.path);
      this._resolveUrl(new URL(urlStr));
    } catch (err) {
      this.status = UploadStatus.Failed;
      this._rejectDone(err);
      this._rejectUrl(err);
    }
  }
}
