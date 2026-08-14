import { useEffect, useState } from 'react';
import type { PointerEvent } from 'react';
import MaterialIcon from './MaterialIcon';

type GithubStarPillProps = {
    className?: string;
};

function formatCount(value: number) {
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
    }
    if (value >= 1_000) {
        return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return String(value);
}

const GithubLogo = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        aria-hidden="true"
    >
        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.699-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
);

export default function GithubStarPill({ className = '' }: GithubStarPillProps) {
    const [count, setCount] = useState<string>('—');

    const handlePointerMove = (event: PointerEvent<HTMLAnchorElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
        event.currentTarget.style.setProperty('--beam-x', `${(x * 100).toFixed(2)}%`);
        event.currentTarget.style.setProperty('--beam-y', `${(y * 100).toFixed(2)}%`);
    };

    const handlePointerLeave = (event: PointerEvent<HTMLAnchorElement>) => {
        event.currentTarget.style.setProperty('--beam-x', '50%');
        event.currentTarget.style.setProperty('--beam-y', '50%');
    };

    useEffect(() => {
        let isMounted = true;

        fetch('https://api.github.com/repos/figranium/figranium')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!isMounted || !data?.stargazers_count) {
                    return;
                }
                setCount(formatCount(Number(data.stargazers_count)));
            })
            .catch(() => {
                if (isMounted) {
                    setCount('—');
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <a
            href="https://github.com/figranium/figranium"
            target="_blank"
            rel="noreferrer"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            className={`gh-pill beam-follow inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white ${className}`}
            aria-label="Star Figranium on GitHub"
        >
            <GithubLogo className="h-3.5 w-3.5" />
            GitHub
            <span className="mx-0.5 h-3 w-px bg-white/20" aria-hidden="true" />
            <MaterialIcon name="star" className="text-sm" fill />
            {count}
        </a>
    );
}
