import { useEffect } from 'react';
import { RemoteToolkit } from '@meshagent/meshagent';

interface ClientToolkitsProps {
    toolkits: RemoteToolkit[];
    public?: boolean;
}

export const useClientToolkits = ({ toolkits, public: isPublic = false }: ClientToolkitsProps) => {
    useEffect(() => {
        toolkits.forEach(toolkit => toolkit.start({public_: isPublic}));

        return () => toolkits.forEach(toolkit => toolkit.stop());
    }, [toolkits, isPublic]);
};
