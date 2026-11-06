/**
 * The site's mark for the purple header: the flight path with a stop and a plane, as on the installable app
 * icons (app/pwa-icons), a little bolder for its small size, in the text colour. The browser-tab icon
 * (public/logo.svg) stays coloured, because a white mark would vanish on a light tab.
 */
export default function LogoMark({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="34 60 486 346" aria-hidden="true" focusable="false">
            <defs>
                {/* A hole in the stop, so the background shows through */}
                <mask id="rff-logo-stop">
                    <rect x="0" y="0" width="512" height="512" fill="white" />
                    <circle cx="256" cy="256" r="17" fill="black" />
                </mask>
            </defs>
            <g mask="url(#rff-logo-stop)" fill="currentColor">
                <path
                    d="M60,380 C160,380 200,280 256,256 C312,232 340,150 400,140"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="46"
                    strokeLinecap="round"
                />
                <circle cx="256" cy="256" r="42" />
                {/* Airplane (Material Icons "flight", Apache 2.0), pointing along the path */}
                <path
                    transform="translate(446, 134) rotate(78) scale(6) translate(-12, -12)"
                    d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
                />
            </g>
        </svg>
    );
}
