const DEFAULT_GEOCODING_BASE_URL = 'https://nominatim.openstreetmap.org';
const AUSTRALIAN_BOUNDS = { minLat: -44, maxLat: -10, minLng: 112, maxLng: 154 };
const STATE_CODES = new Map([
  ['new south wales', 'NSW'], ['nsw', 'NSW'], ['victoria', 'VIC'], ['vic', 'VIC'],
  ['queensland', 'QLD'], ['qld', 'QLD'], ['south australia', 'SA'], ['sa', 'SA'],
  ['western australia', 'WA'], ['wa', 'WA'], ['tasmania', 'TAS'], ['tas', 'TAS'],
  ['northern territory', 'NT'], ['nt', 'NT'],
  ['australian capital territory', 'ACT'], ['act', 'ACT'],
]);

function getQuery(req) {
  const query = Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q;
  return typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : '';
}

function mapResult(result) {
  const lat = Number(result?.lat);
  const lng = Number(result?.lon);
  const label = String(result?.display_name || '').trim();
  if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)
    || lat < AUSTRALIAN_BOUNDS.minLat || lat > AUSTRALIAN_BOUNDS.maxLat
    || lng < AUSTRALIAN_BOUNDS.minLng || lng > AUSTRALIAN_BOUNDS.maxLng) return null;

  const details = result.address && typeof result.address === 'object' ? result.address : {};
  const road = String(details.road || details.pedestrian || details.path || '').trim();
  const houseNumber = String(details.house_number || '').trim();
  const address = [houseNumber, road].filter(Boolean).join(' ') || String(details.name || '').trim();
  const locality = String(details.city || details.town || details.village || details.suburb || details.municipality || '').trim();
  const state = STATE_CODES.get(String(details.state || details.state_code || '').trim().toLowerCase()) || '';

  return {
    label,
    address,
    locality,
    state,
    postcode: String(details.postcode || '').trim(),
    lat,
    lng,
    type: String(result.type || result.addresstype || 'address'),
  };
}

module.exports = async function geocodeHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const query = getQuery(req);
  if (query.length < 3 || query.length > 160) {
    return res.status(400).json({ error: 'Enter an Australian address between 3 and 160 characters.' });
  }

  const baseUrl = (process.env.GEOCODING_BASE_URL || DEFAULT_GEOCODING_BASE_URL).replace(/\/$/, '');
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'au',
    limit: '5',
  });

  try {
    const response = await fetch(`${baseUrl}/search?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-AU,en;q=0.8',
        'User-Agent': 'FlyTheFarm/1.0 (+https://flythefarm.com.au; contact: ben@flythefarm.com.au)',
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding provider returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const results = Array.isArray(data) ? data.map(mapResult).filter(Boolean) : [];

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ results });
  } catch (error) {
    console.error('Address geocoding error:', error);
    return res.status(502).json({ error: 'Address search is temporarily unavailable. Try again shortly.' });
  }
};
