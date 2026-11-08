// Links that open a trip on ryanair.com, ready to pick the flights and book.

const SELECT_URL = 'https://www.ryanair.com/gb/en/trip/flights/select';

/**
 * Ryanair's flight selection page for one adult. `dateOut` / `dateIn` are "YYYY-MM-DD"; give `dateIn` for a
 * return trip. Ryanair needs its full set of parameters (with only some of them it shows its home page),
 * and a real market in the path: "/gb/en/" works, "/en/en/" is a 404.
 */
export function ryanairBookingUrl(origin: string, destination: string, dateOut: string, dateIn?: string): string {
    const params = new URLSearchParams({
        adt: '1',
        teen: '0',
        chd: '0',
        inf: '0',
        dateOut,
        dateIn: dateIn ?? '',
        isConnectedFlight: 'false',
        discount: '0',
        promoCode: '',
        isReturn: dateIn ? 'true' : 'false',
        originIata: origin,
        destinationIata: destination,
        tpAdults: '1',
        tpTeens: '0',
        tpChildren: '0',
        tpInfants: '0',
        tpStartDate: dateOut,
        tpEndDate: dateIn ?? '',
        tpDiscount: '0',
        tpPromoCode: '',
        tpOriginIata: origin,
        tpDestinationIata: destination,
    });
    return `${SELECT_URL}?${params}`;
}
