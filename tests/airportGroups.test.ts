import { describe, expect, it } from 'vitest';
import { buildAirportIndex, labelFor, searchAirports, shortLabelFor } from '../lib/airportGroups';
import { Airport } from '../lib/types';

const airport = (code: string, name: string, city: string, country = 'Spain', countryCode = 'es'): Airport => ({
    code, name, city: { name: city, code: city.toUpperCase() }, country: { name: country, code: countryCode },
});

const index = buildAirportIndex([
    airport('VNO', 'Vilnius', 'Vilnius', 'Lithuania', 'lt'),
    { ...airport('BCN', 'Barcelona', 'Barcelona'), macCity: { name: 'Barcelona', code: 'BCN' } },
    { ...airport('GRO', 'Girona', 'Girona'), macCity: { name: 'Barcelona', code: 'BCN' } },
    airport('AGP', 'Malaga', 'Malaga'),
]);

describe('labelFor', () => {
    it('names a single airport', () => {
        expect(labelFor('VNO', index)).toBe('VNO - Vilnius');
    });
    it('names a city or country group in any order', () => {
        expect(labelFor('GRO,BCN', index)).toBe('Barcelona - All (2)');
        expect(labelFor('AGP,BCN,GRO', index)).toBe('Spain - All (3)');
    });
    it('falls back to the codes', () => {
        expect(labelFor('VNO,AGP', index)).toBe('VNO, AGP');
        expect(labelFor('XXX', index)).toBe('XXX');
        expect(labelFor('', index)).toBe('');
    });
    it('gives short names for the recent searches list', () => {
        expect(shortLabelFor('GRO', index)).toBe('Barcelona');
        expect(shortLabelFor('BCN,GRO', index)).toBe('Barcelona');
        expect(shortLabelFor('VNO,AGP', index)).toBe('Vilnius, Malaga');
        expect(shortLabelFor('VNO,AGP,BCN,XXX', index)).toBe('4 airports');
    });
});

describe('destination groups', () => {
    const inRegion = (code: string, name: string, country: string, countryCode: string, region: string): Airport => ({
        ...airport(code, name, name, country, countryCode), region: { name: region, code: region.toUpperCase() },
    });
    const groups = buildAirportIndex([
        inRegion('TFS', 'Tenerife South', 'Spain', 'es', 'Canary Isles'),
        inRegion('LPA', 'Gran Canaria', 'Spain', 'es', 'Canary Isles'),
        inRegion('IBZ', 'Ibiza', 'Spain', 'es', 'Balearic Islands'),
        inRegion('PMI', 'Palma de Mallorca', 'Spain', 'es', 'Default ES'),
        inRegion('MLA', 'Malta', 'Malta', 'mt', 'Malta'),
        inRegion('JSI', 'Skiathos', 'Greece', 'gr', 'Greek Islands'),
        inRegion('SZG', 'Salzburg', 'Austria', 'at', 'Salzburg'),
        inRegion('BIQ', 'Biarritz', 'France', 'fr', 'Aquitaine'),
        inRegion('NCE', 'Nice', 'France', 'fr', 'French Riviera'),
    ]);
    const group = (name: string) => groups.regions.find(r => r.name === name);

    it('takes airports by Ryanair region and by code', () => {
        expect(group('Canary Islands')?.airportCodes).toEqual(['TFS', 'LPA']);
        // Palma has no useful region ("Default ES"), so it is listed by code
        expect(group('Balearic Islands')?.airportCodes).toEqual(['IBZ', 'PMI']);
        expect(group('Spain Islands')?.airportCodes).toEqual(['TFS', 'LPA', 'IBZ', 'PMI']);
    });
    it('groups airports across countries, skipping ones that are not flown to', () => {
        const south = group('South of Europe');
        expect(south?.airportCodes).toEqual(['TFS', 'LPA', 'MLA']);
        expect(south?.icon).toBe('☀️');
        expect(labelFor('MLA,TFS,LPA', groups)).toBe('South of Europe - All (3)');
        expect(group('Croatia Coast')).toBeUndefined(); // no airports in this list
    });
    it('finds groups by keyword, without hiding single airports', () => {
        const regions = (q: string) => searchAirports(groups, q).regions.map(r => r.name);
        expect(regions('canar')).toEqual(['Canary Islands']);
        expect(regions('sun')).toEqual(['South of Europe']);
        expect(regions('ski')).toEqual(['Ski & Alps']);
        expect(regions('skiathos')).toEqual([]);
        expect(regions('malta')).toEqual([]);
        expect(regions('su')).toEqual([]); // keywords need 3 letters
    });
});
