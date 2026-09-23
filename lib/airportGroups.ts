import { Airport } from './types';

export interface AirportGroup {
    kind: 'region' | 'city' | 'country';
    name: string;
    countryCode: string;
    airportCodes: string[];
}

// Virtual regions built from Ryanair's region names
const VIRTUAL_REGIONS = [
    { name: 'Spain South', countryCode: 'es', match: ['Andalusia', 'Costa del Sol', 'Costa Calida', 'Costa Blanca'] },
    { name: 'Spain North', countryCode: 'es', match: ['Galicia', 'Cantabria', 'Costa Brava', 'Costa Dorada', 'Costa Azahar', 'Aragon'] },
    { name: 'Spain Islands', countryCode: 'es', match: ['Balearic Islands', 'Canary Isles'] },
    { name: 'Italy North', countryCode: 'it', match: ['Lombardy', 'Veneto', 'Piedmont', 'Friuli-Venezia Giulia', 'Liguria', 'Emilia-Romagna', 'Tuscany'] },
    { name: 'Italy South', countryCode: 'it', match: ['Campania', 'Puglia', 'Calabria', 'Sicily', 'Sardinia', 'Abruzzo', 'Lazio'] },
    { name: 'Greece Islands', countryCode: 'gr', match: ['Greek Islands'] },
    { name: 'Portugal Coast', countryCode: 'pt', match: ['Algarve', 'Lisbon'] },
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
        airportCodes: airports
            .filter(a => a.country.code === group.countryCode && a.region && group.match.includes(a.region.name))
            .map(a => a.code),
    })).filter(r => r.airportCodes.length > 0);

    return {
        airports,
        regions,
        cities: [...cities.values()],
        countries: [...countries.values()],
    };
}

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
        regions: index.regions.filter(r => r.name.toLowerCase().includes(s)),
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
