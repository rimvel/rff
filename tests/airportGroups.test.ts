import { describe, expect, it } from 'vitest';
import { buildAirportIndex, labelFor, shortLabelFor } from '../lib/airportGroups';
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
        expect(shortLabelFor('VNO,AGP', index)).toBe('2 airports');
    });
});
