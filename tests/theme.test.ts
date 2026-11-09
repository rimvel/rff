import { describe, expect, it } from 'vitest';
import { effectiveTheme, parseThemeChoice, toggledChoice } from '../lib/theme';

describe('theme choice', () => {
    it('follows the system setting when nothing (or something unknown) is saved', () => {
        expect(parseThemeChoice(null)).toBe('system');
        expect(parseThemeChoice('auto')).toBe('system');
        expect(effectiveTheme('system', 'dark')).toBe('dark');
        expect(effectiveTheme('system', 'light')).toBe('light');
    });

    it('keeps a theme picked with the switch, whatever the system says', () => {
        expect(parseThemeChoice('light')).toBe('light');
        expect(effectiveTheme('light', 'dark')).toBe('light');
        expect(effectiveTheme('dark', 'light')).toBe('dark');
    });

    it('a press saves the opposite theme, or goes back to the system when that matches it', () => {
        expect(toggledChoice('system', 'dark')).toBe('light');
        expect(toggledChoice('light', 'dark')).toBe('system');
        expect(toggledChoice('system', 'light')).toBe('dark');
        expect(toggledChoice('dark', 'light')).toBe('system');
        // A theme saved before the system changed: one press switches it, and that's the system's theme again
        expect(toggledChoice('dark', 'dark')).toBe('light');
        expect(toggledChoice('light', 'light')).toBe('dark');
    });
});
