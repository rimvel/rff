import { ImageResponse } from 'next/og';

// App icons for "Add to home screen": the site's flight-path logo in white on the purple gradient.
// "maskable" icons keep the logo inside the central safe zone, because phones crop them into shapes.

const ICONS: Record<string, { size: number; maskable: boolean }> = {
    '180.png': { size: 180, maskable: false }, // iPhone home screen
    '192.png': { size: 192, maskable: false },
    '512.png': { size: 512, maskable: false },
    'maskable-512.png': { size: 512, maskable: true },
};

export const dynamicParams = false;

export function generateStaticParams() {
    return Object.keys(ICONS).map(name => ({ name }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
    const { name } = await params;
    const { size, maskable } = ICONS[name];
    const logo = Math.round(size * (maskable ? 0.6 : 0.78));

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #5161ce 0%, #5b3687 100%)',
                }}
            >
                <svg width={logo} height={logo} viewBox="0 0 512 512">
                    <path
                        d="M60,380 C160,380 200,280 256,256 C312,232 340,150 400,140"
                        fill="none"
                        stroke="white"
                        strokeWidth="34"
                        strokeLinecap="round"
                    />
                    <circle cx="256" cy="256" r="36" fill="white" />
                    <circle cx="256" cy="256" r="15" fill="#5a4bb0" />
                    {/* Airplane (Material Icons "flight", Apache 2.0), pointing along the path */}
                    <path
                        fill="white"
                        transform="translate(446, 134) rotate(78) scale(5.2) translate(-12, -12)"
                        d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
                    />
                </svg>
            </div>
        ),
        { width: size, height: size },
    );
}
