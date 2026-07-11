const DEFAULT_GEOCODING_BASE_URL = 'https://nominatim.openstreetmap.org';

function getQuery(req) {
  const query = Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q;
  return typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : '';
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
    const results = Array.isArray(data)
      ? data.map((result) => ({
          label: String(result.display_name || '').trim(),
          lat: Number(result.lat),
          lng: Number(result.lon),
          type: String(result.type || result.addresstype || 'address'),
        })).filter((result) => result.label && Number.isFinite(result.lat) && Number.isFinite(result.lng))
      : [];

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ results });
  } catch (error) {
    console.error('Address geocoding error:', error);
    return res.status(502).json({ error: 'Address search is temporarily unavailable. Try again shortly.' });
  }
};
