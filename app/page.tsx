import type { Metadata } from 'next';
import HomePage from '@/components/HomePage';
import { buildAirportIndex } from '@/lib/airportGroups';
import { getAirports } from '@/lib/ryanair';
import { searchTitle } from '@/lib/searchTitle';
import { readSearch } from '@/lib/searchUrl';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// A shared search link gets its own preview title, e.g. "Vilnius → Barcelona · 13 Nov – 20 Nov"
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
    const raw = await searchParams;
    const params = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])));
    const req = readSearch(params);
    if (!req) return {};

    const index = buildAirportIndex(await getAirports().catch(() => []));
    const description = 'Cheapest flights for these dates, including one-stop connections.';
    const fullTitle = searchTitle(req, index);
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
