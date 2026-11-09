// Light and dark theme values shared by the page layout (server) and the theme switch (browser).

export type Theme = 'light' | 'dark';

/** Browser bar colour (phones, installed app) for each theme: the top of the page gradient (app/globals.css) */
export const THEME_COLORS: Record<Theme, string> = { light: '#5161ce', dark: '#24205a' };
