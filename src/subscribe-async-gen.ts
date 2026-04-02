type Subscriber<T> = {
  next: (value: T) => void;
  error?: (err: unknown) => void;
  complete?: () => void;
};

function abortableNext<T>(iterator: AsyncIterator<T>, signal: AbortSignal): Promise<IteratorResult<T>> {
  const nextPromise = iterator.next();
  const abortPromise = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });

  return Promise.race([nextPromise, abortPromise]);
}

export interface Subscription {
  unsubscribe: () => void;
}

export function subscribe<T>(
  iterable: AsyncIterable<T>,
  { next, error, complete }: Subscriber<T>,
): Subscription {
  const controller = new AbortController();
  const iterator = iterable[Symbol.asyncIterator]();

  void (async () => {
    try {
      while (!controller.signal.aborted) {
        const { value, done } = await abortableNext(iterator, controller.signal);

        if (done) {
          break;
        }

        next(value);
      }

      if (!controller.signal.aborted) {
        complete?.();
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        error?.(err);
      }
    } finally {
      await iterator.return?.();
    }
  })();

  return {
    unsubscribe: () => controller.abort(),
  };
}
