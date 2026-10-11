import type { Metadata } from 'next';
import HomePage from '@/components/HomePage';
import { buildAirportIndex, shortLabelFor } from '@/lib/airportGroups';
import { getAirports } from '@/lib/ryanair';
import { readSearch } from '@/lib/searchUrl';
import { localToUtcMs } from '@/lib/time';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function formatDay(date: string): string {
    return new Date(localToUtcMs(date)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// A shared search link gets its own preview title, e.g. "Vilnius → Barcelona · 13 Nov – 20 Nov"
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
    const raw = await searchParams;
    const params = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])));
    const req = readSearch(params);
    if (!req) return {};

    const index = buildAirportIndex(await getAirports().catch(() => []));
    const from = shortLabelFor(req.origin, index);
    const dates = req.returnDate ? `${formatDay(req.date)} – ${formatDay(req.returnDate)}` : formatDay(req.date);
    const title = req.dest === 'ANYWHERE'
        ? `Cheapest destinations from ${from} · ${dates}`
        : `${from} ${req.returnDate ? '⇄' : '→'} ${shortLabelFor(req.dest, index)} · ${dates}`;
    const description = 'Cheapest flights for these dates, including one-stop connections.';
    const fullTitle = `${title} | RFF`;
    return {
        title: { absolute: fullTitle },
        description,
        openGraph: { title: fullTitle, description, url: `/?${params}` },
        twitter: { title: fullTitle, description },
    };
}

export default function Page() {
    return <HomePage />;
}
