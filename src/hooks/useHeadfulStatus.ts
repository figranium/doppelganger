import { useState, useEffect } from 'react';

export function useHeadfulStatus() {
    const [useNovnc, setUseNovnc] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelled = false;
        const checkStatus = async () => {
            try {
                const res = await fetch('/api/headful/status');
                if (res.ok) {
                    const data = await res.json();
                    if (!cancelled) setUseNovnc(!!data.useNovnc);
                } else {
                    if (!cancelled) setUseNovnc(false);
                }
            } catch {
                if (!cancelled) setUseNovnc(false);
            }
        };
        checkStatus();
        return () => {
            cancelled = true;
        };
    }, []);

    return useNovnc;
}
