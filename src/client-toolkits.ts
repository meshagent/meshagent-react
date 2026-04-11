import { useEffect } from 'react';
import { RoomClient, startHostedToolkit, Toolkit } from '@meshagent/meshagent';

interface ClientToolkitsProps {
    room: RoomClient;
    toolkits: Toolkit[];
    public?: boolean;
}

export const useClientToolkits = ({ room, toolkits, public: isPublic = false }: ClientToolkitsProps) => {
    useEffect(() => {
        let disposed = false;
        const startedToolkits: Array<{ stop(): Promise<void> }> = [];

        void (async () => {
            try {
                for (const toolkit of toolkits) {
                    const hostedToolkit = await startHostedToolkit({
                        room,
                        toolkit,
                        public_: isPublic,
                    });
                    if (disposed) {
                        await hostedToolkit.stop();
                        continue;
                    }
                    startedToolkits.push(hostedToolkit);
                }
            } catch (error) {
                await Promise.all(startedToolkits.map((toolkit) => toolkit.stop()));
                console.error("unable to start client toolkits", error);
            }
        })();

        return () => {
            disposed = true;
            void Promise.all(startedToolkits.map((toolkit) => toolkit.stop()));
        };
    }, [room, toolkits, isPublic]);
};
