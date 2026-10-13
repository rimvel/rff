import { distanceKm } from './mixedAirports';
import { ANYWHERE } from './searchUrl';
import { Airport } from './types';

export interface AirportGroup {
    kind: 'region' | 'city' | 'country';
    name: string;
    countryCode: string; // '' for a group across several countries
    airportCodes: string[];
    icon?: string; // shown instead of the flag, e.g. for a group across several countries
    description?: string; // e.g. "Sunniest coasts and islands"
}

interface RegionDefinition {
    name: string;
    countryCode: string; // '' for a group across several countries
    regions?: string[]; // Ryanair region names (within countryCode)
    airports?: string[]; // airport codes; for airports Ryanair gives no useful region (e.g. "Default ES")
    icon?: string;
    description?: string;
    // Other words that find the group. Not place names, so typing "Malta" still picks the airport, and not
    // a country with no other group, so "France" + Enter still picks all of France
    keywords?: string[];
}

// Groups of destinations: by Ryanair's region names and/or by airport code. Codes Ryanair
// doesn't fly to (any more) are skipped. Keep groups to about 25 airports: each airport is a
// separate search, and a search can have at most MAX_AIRPORTS_PER_SIDE.
const VIRTUAL_REGIONS: RegionDefinition[] = [
    { name: 'Spain South', countryCode: 'es', regions: ['Andalusia', 'Costa del Sol', 'Costa Calida', 'Costa Blanca'] },
    { name: 'Spain North', countryCode: 'es', regions: ['Galicia', 'Cantabria', 'Costa Brava', 'Costa Dorada', 'Costa Azahar', 'Aragon'], airports: ['VIT'] },
    { name: 'Spain Islands', countryCode: 'es', regions: ['Balearic Islands', 'Canary Isles'], airports: ['PMI'] },
    { name: 'Canary Islands', countryCode: 'es', regions: ['Canary Isles'], keywords: ['canaries', 'spain'] },
    { name: 'Balearic Islands', countryCode: 'es', regions: ['Balearic Islands'], airports: ['PMI'], keywords: ['spain'] },
    { name: 'Italy North', countryCode: 'it', regions: ['Lombardy', 'Veneto', 'Piedmont', 'Friuli-Venezia Giulia', 'Liguria', 'Emilia-Romagna', 'Tuscany'], airports: ['RMI'] },
    { name: 'Italy South', countryCode: 'it', regions: ['Campania', 'Puglia', 'Calabria', 'Sicily', 'Sardinia', 'Abruzzo', 'Lazio'], airports: ['OLB'] },
    { name: 'Italian Islands', countryCode: 'it', regions: ['Sicily', 'Sardinia'], airports: ['OLB'], description: 'Sicily and Sardinia', keywords: ['italy'] },
    { name: 'Greece Islands', countryCode: 'gr', regions: ['Greek Islands'] },
    { name: 'Crete', countryCode: 'gr', airports: ['HER', 'CHQ'], keywords: ['greece'] },
    { name: 'Portugal Coast', countryCode: 'pt', regions: ['Algarve', 'Lisbon'] },
    { name: 'Croatia Coast', countryCode: 'hr', regions: ['Dalmatian', 'Kvarner Bay'], airports: ['DBV', 'PUY'] },
    { name: 'South of France', countryCode: 'fr', regions: ['French Riviera', 'Languedoc-Roussillon', 'Corsica'] },
    {
        name: 'South of Europe',
        countryCode: '',
        icon: '☀️',
        description: 'Sunniest coasts and islands',
        // Warm for most of the year: Canaries, Andalusia and Costa Blanca, Algarve, Madeira, Sicily,
        // Malta, Crete, Rhodes, Kos, Santorini, Cyprus
        airports: [
            'ACE', 'FUE', 'LPA', 'TFS', 'AGP', 'LEI', 'RMU', 'ALC', 'FAO', 'FNC', 'CTA', 'PMO', 'TPS',
            'MLA', 'HER', 'CHQ', 'RHO', 'KGS', 'JTR', 'LCA', 'PFO',
        ],
        keywords: ['sunny', 'warm', 'beach', 'mediterranean'],
    },
    {
        name: 'Ski & Alps',
        countryCode: '',
        icon: '⛷️',
        description: 'Airports near ski resorts',
        // Salzburg, Klagenfurt; Memmingen and Friedrichshafen (Tyrol, Vorarlberg, Allgäu);
        // Grenoble (French Alps); Turin (Via Lattea); Verona and Treviso (Dolomites)
        airports: ['SZG', 'KLU', 'FMM', 'FDH', 'GNB', 'TRN', 'VRN', 'TSF'],
        keywords: ['skiing', 'snow', 'mountains', 'winter'],
    },
];

export interface AirportIndex {
    airports: Airport[];
    regions: AirportGroup[];
    cities: AirportGroup[];
    countries: AirportGroup[];
}

export function buildAirportIndex(airports: Airport[]): AirportIndex {
    const countries = new Map<string, AirportGroup>();
    const cities = new Map<string, AirportGroup>();

    for (const a of airports) {
        if (!countries.has(a.country.name)) {
            countries.set(a.country.name, { kind: 'country', name: a.country.name, countryCode: a.country.code, airportCodes: [] });
        }
        countries.get(a.country.name)!.airportCodes.push(a.code);

        // Metropolitan area (e.g. all of London) takes priority over the city
        const city = a.macCity || a.city;
        const cityKey = `${city.name}-${a.country.code}`;
        if (!cities.has(cityKey)) {
            cities.set(cityKey, { kind: 'city', name: city.name, countryCode: a.country.code, airportCodes: [] });
        }
        cities.get(cityKey)!.airportCodes.push(a.code);
    }

    const regions: AirportGroup[] = VIRTUAL_REGIONS.map(group => ({
        kind: 'region' as const,
        name: group.name,
        countryCode: group.countryCode,
        icon: group.icon,
        description: group.description,
        airportCodes: airports
            .filter(a =>
                group.airports?.includes(a.code) ||
                (a.country.code === group.countryCode && a.region && group.regions?.includes(a.region.name)))
            .map(a => a.code),
    })).filter(r => r.airportCodes.length > 0);

    return {
        airports,
        regions,
        cities: [...cities.values()],
        countries: [...countries.values()],
    };
}

const KEYWORDS = new Map(VIRTUAL_REGIONS.map(g => [g.name, g.keywords ?? []]));

export interface AirportMatches {
    regions: AirportGroup[];
    cities: AirportGroup[];
    countries: AirportGroup[];
    airports: Airport[];
}

export function searchAirports(index: AirportIndex, search: string): AirportMatches {
    if (!search) return { regions: [], cities: [], countries: [], airports: [] };
    const s = search.toLowerCase();

    return {
        // Keywords match from the start ("sun" finds "sunny"), so "Skiathos" doesn't find "ski"
        regions: index.regions.filter(r =>
            r.name.toLowerCase().includes(s) || (s.length >= 3 && KEYWORDS.get(r.name)?.some(k => k.startsWith(s)))),
        cities: index.cities.filter(c => c.airportCodes.length > 1 && c.name.toLowerCase().includes(s)),
        countries: index.countries.filter(c => c.airportCodes.length > 1 && c.name.toLowerCase().includes(s)),
        airports: index.airports
            .filter(a =>
                a.code.toLowerCase().includes(s) ||
                a.name.toLowerCase().includes(s) ||
                a.country.name.toLowerCase().includes(s) ||
                a.city.name.toLowerCase().includes(s) ||
                (a.macCity && a.macCity.name.toLowerCase().includes(s))
            )
            .sort((a, b) => a.country.name.localeCompare(b.country.name)),
    };
}

/**
 * Text for the airport field given selected codes: "VNO - Vilnius", "Barcelona - All (3)",
 * or the codes themselves when they don't match a known group.
 */
export function labelFor(codes: string, index: AirportIndex): string {
    if (!codes) return '';
    if (codes === ANYWHERE) return '🌍 Anywhere';
    const list = codes.split(',');
    if (list.length === 1) {
        const airport = index.airports.find(a => a.code === list[0]);
        return airport ? `${airport.code} - ${airport.name}` : list[0];
    }
    const wanted = [...list].sort().join(',');
    const group = [...index.cities, ...index.regions, ...index.countries]
        .find(g => [...g.airportCodes].sort().join(',') === wanted);
    return group ? `${group.name} - All (${group.airportCodes.length})` : list.join(', ');
}

/** Short place name for compact displays: "Vilnius", "Barcelona", or "3 airports". */
export function shortLabelFor(codes: string, index: AirportIndex): string {
    if (codes === ANYWHERE) return 'Anywhere';
    const list = codes.split(',');
    if (list.length === 1) {
        const airport = index.airports.find(a => a.code === list[0]);
        return airport ? (airport.macCity ?? airport.city).name : list[0];
    }
    const label = labelFor(codes, index);
    if (label.includes(' - All')) return label.split(' - All')[0];
    // A few airports that aren't a known group: name their cities, e.g. "Vilnius, Kaunas"
    const cities = [...new Set(list.map(code => {
        const airport = index.airports.find(a => a.code === code);
        return airport ? (airport.macCity ?? airport.city).name : code;
    }))];
    return cities.length <= 3 ? cities.join(', ') : `${list.length} airports`;
}

/** Other airports within `maxKm` of any of the given ones, nearest first. */
export function nearbyAirports(codes: string[], index: AirportIndex, maxKm = 250): Airport[] {
    const selected = index.airports.filter(a => codes.includes(a.code) && a.coordinates);
    return index.airports
        .filter(a => !codes.includes(a.code) && a.coordinates)
        .map(a => ({ a, km: Math.min(...selected.map(s => distanceKm(s.coordinates!, a.coordinates!))) }))
        .filter(x => x.km <= maxKm)
        .sort((x, y) => x.km - y.km)
        .map(x => x.a);
}
