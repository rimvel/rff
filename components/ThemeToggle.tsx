'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

function readStoredTheme(): Theme {
    try {
        return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
    } catch {
        return 'light';
    }
}

const subscribe = (onChange: () => void) => {
    window.addEventListener('storage', onChange);
    return () => window.removeEventListener('storage', onChange);
};

export default function ThemeToggle() {
    // null while rendering on the server, so the button only appears once we know the stored theme
    const storedTheme = useSyncExternalStore<Theme | null>(subscribe, readStoredTheme, () => null);
    const [chosenTheme, setChosenTheme] = useState<Theme | null>(null);
    const theme = chosenTheme ?? storedTheme;

    useEffect(() => {
        if (theme) document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    if (!theme) {
        return <div className="theme-switch-placeholder" aria-hidden="true" />; // same size, so nothing jumps
    }

    const dark = theme === 'dark';
    const toggleTheme = () => {
        const newTheme = dark ? 'light' : 'dark';
        setChosenTheme(newTheme);
        try {
            localStorage.setItem('theme', newTheme);
        } catch {
            // Storage unavailable (e.g. private mode); the theme still applies for this visit
        }
    };

    return (
        <button
            type="button"
            role="switch"
            aria-checked={dark}
            aria-label="Dark mode"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
            className="theme-switch"
        >
            <span className="theme-switch-knob" aria-hidden="true" />
            <svg className={`theme-switch-icon ${dark ? '' : 'on'}`} viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4.5" fill="currentColor" />
                <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
                </g>
            </svg>
            <svg className={`theme-switch-icon ${dark ? 'on' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" />
            </svg>
        </button>
    );
}
