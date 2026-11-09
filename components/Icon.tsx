import { ReactNode } from 'react';

/**
 * The site's small line icons. They are drawn on a 24×24 grid with a 2px stroke, sized to the surrounding text
 * (1em) and coloured with it (currentColor), so they sit in buttons and labels like a letter would.
 * Decorative: the text next to them says what they mean, so screen readers skip them.
 */
const PATHS = {
    calendar: (
        <>
            <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
        </>
    ),
    globe: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.6 2.5 3.8 5.5 3.8 9s-1.2 6.5-3.8 9c-2.6-2.5-3.8-5.5-3.8-9S9.4 5.5 12 3z" />
        </>
    ),
    sun: (
        <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </>
    ),
    star: <path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.6l6-.9z" />,
    'chevron-down': <path d="M6 9l6 6 6-6" />,
    'chevron-left': <path d="M15 6l-6 6 6 6" />,
    'chevron-right': <path d="M9 6l6 6-6 6" />,
    minus: <path d="M5 12h14" />,
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    external: <path d="M7 17L17 7M9 7h8v8" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

interface IconProps {
    name: IconName;
    className?: string;
    /** Fill the shape too (e.g. a saved star) */
    filled?: boolean;
}

export default function Icon({ name, className, filled = false }: IconProps) {
    return (
        <svg
            className={className ? `ui-icon ${className}` : 'ui-icon'}
            viewBox="0 0 24 24"
            width="1em"
            height="1em"
            fill={filled ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            {PATHS[name]}
        </svg>
    );
}
