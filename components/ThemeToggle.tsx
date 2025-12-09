'use client';

import { useState, useEffect } from 'react';

export default function ThemeToggle() {
    const [mounted, setMounted] = useState(false);
    const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

    // Effect to set initial state
    useEffect(() => {
        setMounted(true);
        const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
        if (storedTheme) {
            setTheme(storedTheme);
            document.documentElement.setAttribute('data-theme', storedTheme);
        }
    }, []);

    const toggleTheme = () => {
        let newTheme: 'light' | 'dark';

        if (theme === 'system') {
            const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            newTheme = isSystemDark ? 'light' : 'dark';
        } else {
            newTheme = theme === 'light' ? 'dark' : 'light';
        }

        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    if (!mounted) {
        return <div style={{ width: '2rem', height: '2rem' }}></div>; // Placeholder
    }

    const currentEffectiveTheme = theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme;

    return (
        <button
            onClick={toggleTheme}
            className="theme-toggle-btn"
            aria-label="Toggle Dark Mode"
            title={currentEffectiveTheme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
            {currentEffectiveTheme === 'dark' ? '☀️' : '🌙'}
        </button>
    );
}
