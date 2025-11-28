
const fetch = globalThis.fetch;

async function testAirports() {
    console.log('Testing Airports API...');
    try {
        const res = await fetch('https://www.ryanair.com/api/views/locate/5/airports/en/active');
        if (!res.ok) throw new Error(`Status: ${res.status}`);
        const data = await res.json();
        console.log(`Success! Found ${data.length} airports.`);
        console.log(JSON.stringify(data[0], null, 2));
        return data;
    } catch (e) {
        console.error('Failed to fetch airports:', e.message);
    }
}

async function testAvailability() {
    console.log('Testing Availability API...');
    const date = '2025-12-10';
    const origin = 'DUB';
    const dest = 'STN';

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    };

    // Try Booking API again with headers
    try {
        console.log('Attempting Booking API with headers...');
        const url = `https://www.ryanair.com/api/booking/v4/en-gb/availability?ADT=1&TEEN=0&CHD=0&INF=0&DateOut=${date}&DateIn=&Origin=${origin}&Destination=${dest}&RoundTrip=false`;
        const res = await fetch(url, { headers });
        if (res.ok) {
            const data = await res.json();
            console.log('Success (Booking API)!');
            return;
        } else {
            console.log(`Booking API failed with ${res.status}`);
        }
    } catch (e) {
        console.error('Booking API error:', e.message);
    }


    // Try Farfnd API v4
    try {
        console.log('Attempting Farfnd API v4...');
        const url = `https://services-api.ryanair.com/farfnd/v4/oneWayFares?departureAirportIataCode=${origin}&arrivalAirportIataCode=${dest}&outboundDepartureDateFrom=${date}&outboundDepartureDateTo=${date}&currency=EUR`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`Status: ${res.status}`);
        const data = await res.json();
        console.log('Success (Farfnd API v4)!');
        console.log(`Fares found: ${data.fares.length}`);
        if (data.fares.length > 0) {
            const fare = data.fares[0];
            console.log(`Sample Price: ${fare.outbound.price.value} ${fare.outbound.price.currencyCode}`);
        }
    } catch (e) {
        console.error('Failed to fetch farfnd v4:', e.message);
    }
}


async function testRoutes() {
    console.log('Testing Routes API...');
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };
        const res = await fetch('https://www.ryanair.com/api/views/locate/searchWidget/routes/en/airport/DUB', { headers });
        if (!res.ok) throw new Error(`Status: ${res.status}`);
        const data = await res.json();
        console.log(`Success! Found ${Object.keys(data).length} routes (or keys).`);
        // console.log(JSON.stringify(data[0], null, 2)); // It might be a map or list
        if (Array.isArray(data) && data.length > 0) {
            console.log(JSON.stringify(data[0], null, 2));
        }
    } catch (e) {
        console.error('Failed to fetch routes:', e.message);
    }
}

async function main() {
    await testAirports();
    await testRoutes();
    await testAvailability();
}


main();
