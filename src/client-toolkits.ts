import { useEffect, useRef } from 'react';
import { RemoteToolkit } from '@meshagent/meshagent';

interface ClientToolkitsProps {
    toolkits: RemoteToolkit[];
    public?: boolean;
}

export const useClientToolkits = ({
    toolkits,
    public: isPublic = false,
}: ClientToolkitsProps) => {
    const refInit = useRef<boolean>(false);

    useEffect(() => {
        if (refInit.current) {
            refInit.current = true;

            toolkits.forEach(toolkit => toolkit.start({public_: isPublic}));
        }

        return () => toolkits.forEach(toolkit => toolkit.stop());
    }, [toolkits, isPublic]);
};
