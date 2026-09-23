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
        return <div style={{ width: '2rem', height: '2rem' }}></div>; // Placeholder
    }

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setChosenTheme(newTheme);
        try {
            localStorage.setItem('theme', newTheme);
        } catch {
            // Storage unavailable (e.g. private mode); the theme still applies for this visit
        }
    };

    return (
        <button
            onClick={toggleTheme}
            className="theme-toggle-btn"
            aria-label="Toggle Dark Mode"
            title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
            {theme === 'dark' ? '☀️' : '🌙'}
        </button>
    );
}
