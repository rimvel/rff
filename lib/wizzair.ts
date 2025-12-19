
interface WizzPrice {
    amount: number;
    currencyCode: string;
}

interface WizzFlight {
    departureStation: string;
    arrivalStation: string;
    departureDate: string; // ISO format
    arrivalDate: string;
    flightNumber: string;
    fares: Array<{
        bundle: string;
        basePrice: WizzPrice;
        discountedPrice: WizzPrice;
    }>;
}

export interface WizzFlightResult {
    departureDate: string;
    arrivalDate: string;
    price: {
        value: number;
        currencyCode: string;
    };
    flightNumber: string;
    duration: string;
    carrier: 'Wizzair';
}

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://wizzair.com',
    'Referer': 'https://wizzair.com/en-gb',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

// Trying a recent version found in community scripts or guessing.
// If this fails, the user might need to update the version or provide a proxy.
const API_VERSION = '26.1.0';
const BASE_URL = `https://be.wizzair.com/${API_VERSION}/Api`;

export async function searchWizzairFlights(origin: string, destination: string, date: string): Promise<WizzFlightResult[]> {
    const url = `${BASE_URL}/search/search`;

    // Wizzair API typically expects this structure
    const payload = {
        flightList: [
            {
                departureStation: origin,
                arrivalStation: destination,
                departureDate: date
            }
        ],
        adultCount: 1,
        childCount: 0,
        infantCount: 0,
        wdc: true
    };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const res = await fetch(url, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.status === 429 || res.status === 403) {
            console.warn(`Wizzair API blocked (Status ${res.status}). This is expected for server-side calls without proxies.`);
            return [];
        }

        if (!res.ok) {
            console.error(`Wizzair API error: ${res.status}`);
            return [];
        }

        const data = await res.json();

        // Map response to our internal format
        // Note: The response structure is inferred. Adjust based on actual response if successful.
        if (data.outboundFlights && Array.isArray(data.outboundFlights)) {
            return data.outboundFlights.map((f: any) => {
                // Find cheapest fare
                let cheapest = Infinity;
                let currency = 'EUR';

                if (f.fares) {
                    f.fares.forEach((fare: any) => {
                        const price = fare.discountedPrice?.amount || fare.basePrice?.amount;
                        if (price < cheapest) {
                            cheapest = price;
                            currency = fare.discountedPrice?.currencyCode || fare.basePrice?.currencyCode;
                        }
                    });
                }

                if (cheapest === Infinity) return null;

                return {
                    carrier: 'Wizzair',
                    departureDate: f.departureDate,
                    arrivalDate: f.arrivalDate,
                    flightNumber: f.flightNumber,
                    price: {
                        value: cheapest,
                        currencyCode: currency
                    },
                    duration: '' // Calculate if needed
                };
            }).filter(Boolean);
        }

        return [];

    } catch (e) {
        console.error(`Error searching Wizzair ${origin}->${destination}`, e);
        return [];
    }
}
