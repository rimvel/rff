'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { effectiveTheme, parseThemeChoice, Theme, THEME_COLORS, THEME_STORAGE_KEY, ThemeChoice, toggledChoice } from '@/lib/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readSavedChoice(): ThemeChoice {
    try {
        return parseThemeChoice(localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
        return 'system';
    }
}

// Another tab changing the saved choice
const subscribeStorage = (onChange: () => void) => {
    window.addEventListener('storage', onChange);
    return () => window.removeEventListener('storage', onChange);
};

const readSystemTheme = (): Theme => (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light');

// The phone or computer switching light/dark (e.g. automatically at sunset)
const subscribeSystem = (onChange: () => void) => {
    const media = window.matchMedia(DARK_QUERY);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
};

export default function ThemeToggle() {
    // null while rendering on the server, so the button only appears once we know the theme
    const savedChoice = useSyncExternalStore<ThemeChoice | null>(subscribeStorage, readSavedChoice, () => null);
    const systemTheme = useSyncExternalStore<Theme | null>(subscribeSystem, readSystemTheme, () => null);
    const [pressedChoice, setPressedChoice] = useState<ThemeChoice | null>(null);
    const choice = pressedChoice ?? savedChoice;
    const theme = choice && systemTheme ? effectiveTheme(choice, systemTheme) : null;

    useEffect(() => {
        if (!choice || !theme) return;
        // No data-theme: the stylesheet's prefers-color-scheme rules follow the system by themselves
        if (choice === 'system') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', choice);
        document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute('content', THEME_COLORS[theme]));
    }, [choice, theme]);

    if (!theme) {
        return <div className="theme-switch-placeholder" aria-hidden="true" />; // same size, so nothing jumps
    }

    const dark = theme === 'dark';
    const toggleTheme = () => {
        if (!choice || !systemTheme) return;
        const newChoice = toggledChoice(choice, systemTheme);
        setPressedChoice(newChoice);
        try {
            if (newChoice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
            else localStorage.setItem(THEME_STORAGE_KEY, newChoice);
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
