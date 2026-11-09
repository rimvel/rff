// Light and dark theme values shared by the page layout (server) and the theme switch (browser).

export type Theme = 'light' | 'dark';

/** What the visitor picked with the switch; 'system' (nothing saved) follows the phone's or computer's setting */
export type ThemeChoice = Theme | 'system';

/** Browser bar colour (phones, installed app) for each theme: the top of the page gradient (app/globals.css) */
export const THEME_COLORS: Record<Theme, string> = { light: '#5161ce', dark: '#24205a' };

/** localStorage key for the saved choice; absent means "follow the system setting" */
export const THEME_STORAGE_KEY = 'theme';

/** The saved choice as stored, or 'system' for anything else (nothing saved, an old or unknown value) */
export function parseThemeChoice(saved: string | null): ThemeChoice {
    return saved === 'light' || saved === 'dark' ? saved : 'system';
}

/** The theme actually shown */
export function effectiveTheme(choice: ThemeChoice, system: Theme): Theme {
    return choice === 'system' ? system : choice;
}

/**
 * What a press of the switch stores: the opposite of what's shown, except that landing on
 * the system's own theme goes back to following the system (so it isn't pinned for ever).
 */
export function toggledChoice(choice: ThemeChoice, system: Theme): ThemeChoice {
    const next: Theme = effectiveTheme(choice, system) === 'dark' ? 'light' : 'dark';
    return next === system ? 'system' : next;
}

/**
 * Runs in <head> before the page is drawn, so a saved choice shows from the first frame
 * instead of flashing the system theme until the switch's JavaScript loads.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
