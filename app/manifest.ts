import type { MetadataRoute } from 'next';

// Lets phones (and desktop Chrome/Edge) install the site as an app: "Add to home screen"
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'RFF – cheap flights, beyond direct',
        short_name: 'RFF',
        description: 'Find the cheapest flights, including one-stop connections you can\'t book as one trip.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#4b3487',
        theme_color: '#5161ce',
        icons: [
            { src: '/pwa-icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/pwa-icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
}
