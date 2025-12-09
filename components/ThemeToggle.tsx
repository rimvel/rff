'use client';

import { useState, useEffect } from 'react';

export default function ThemeToggle() {
    const [mounted, setMounted] = useState(false);
    const [theme, setTheme] = useState<'light' | 'dark'>('light');

    // Effect to set initial state
    useEffect(() => {
        setMounted(true);
        const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
        if (storedTheme) {
            setTheme(storedTheme);
            document.documentElement.setAttribute('data-theme', storedTheme);
        } else {
            // Default to light
            document.documentElement.setAttribute('data-theme', 'light');
        }
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    if (!mounted) {
        return <div style={{ width: '2rem', height: '2rem' }}></div>; // Placeholder
    }

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
