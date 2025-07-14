type Subscriber<T> = {
    next: (value: T) => void;
    error?: (err: unknown) => void;
    complete?: () => void;
};

function abortableNext<T>(iterator: AsyncIterator<T>, signal: AbortSignal): Promise<IteratorResult<T>> {
    const nextP = iterator.next();
    const abortP = new Promise<never>((_, rej) => {
        signal.addEventListener("abort", () => rej(new Error("aborted")), { once: true });
    });
    return Promise.race([nextP, abortP]);
}

export interface Subscription {
    unsubscribe: () => void;
}

export function subscribe<T>(iterable: AsyncIterable<T>, { next, error, complete }: Subscriber<T>): Subscription {
    const controller = new AbortController();
    const it = iterable[Symbol.asyncIterator]();

    (async () => {
        try {
            while (!controller.signal.aborted) {
                const { value, done } = await abortableNext(it, controller.signal);

                if (done) break;
                next(value);
            }

            if (!controller.signal.aborted && complete) {
                complete();
            }
        } catch (err) {
            if (!controller.signal.aborted && error) {
                error(err as Error);
            }
        }
    })();

    return {
        unsubscribe: () => controller.abort(),
    };
}
