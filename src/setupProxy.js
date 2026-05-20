const { createProxyMiddleware } = require('http-proxy-middleware');

const VEGETATION_BASE_URL = 'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Biota/VegetationManagement/MapServer';
const VEGETATION_LAYERS = {
  pmav: 146,
  rvm: 109,
};
const PMAV_CATEGORY_LAYERS = {
  A: 141,
  B: 142,
  C: 143,
  R: 144,
  X: 145,
};

function sanitizeLotPlan(input) {
  if (!input) return null;
  return String(input).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

async function fetchVegetationWithRetry(url, retries = 3, delay = 700) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'FlyTheFarm-PMAV/1.0' },
      });
      if (!response.ok) throw new Error(`Queensland vegetation service returned HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

function buildVegetationQueryUrl(query) {
  const dataset = query.dataset === 'rvm' ? 'rvm' : 'pmav';
  const cleanCategory = query.category ? String(query.category).toUpperCase() : '';
  const layerId = cleanCategory ? PMAV_CATEGORY_LAYERS[cleanCategory] : VEGETATION_LAYERS[dataset];

  if (!layerId) {
    const error = new Error('Invalid vegetation dataset');
    error.statusCode = 400;
    throw error;
  }

  let whereClause = '1=1';
  if (query.lotplan) {
    const cleanLotPlan = sanitizeLotPlan(query.lotplan);
    if (!cleanLotPlan || cleanLotPlan.length < 4) {
      const error = new Error('Invalid lot/plan format. Expected format: 10SP234567');
      error.statusCode = 400;
      throw error;
    }
    whereClause = `lotplan='${cleanLotPlan}'`;
  }

  const params = new URLSearchParams({
    where: whereClause,
    outFields: '*',
    returnGeometry: 'true',
    f: 'geojson',
    outSR: '4326',
  });

  if (query.bbox) {
    params.set('geometry', String(query.bbox));
    params.set('geometryType', 'esriGeometryEnvelope');
    params.set('spatialRel', 'esriSpatialRelIntersects');
    params.set('inSR', '4326');
  } else if (query.geometry && query.geometryType) {
    params.set('geometry', String(query.geometry));
    params.set('geometryType', String(query.geometryType));
    params.set('spatialRel', 'esriSpatialRelIntersects');
    params.set('inSR', '4326');
  }

  return `${VEGETATION_BASE_URL}/${layerId}/query?${params.toString()}`;
}

module.exports = function (app) {
  app.get('/api/pmav', async (req, res) => {
    try {
      const url = buildVegetationQueryUrl(req.query);
      const data = await fetchVegetationWithRetry(url);
      return res.json(data);
    } catch (error) {
      const status = error.statusCode || 500;
      console.error('PMAV proxy error:', error);
      return res.status(status).json({
        error: status === 400
          ? error.message
          : 'Failed to query Queensland vegetation mapping. The government service may be temporarily unavailable.',
      });
    }
  });

  // Proxy for weed identification via Claude Vision API
  app.post('/api/identify-weed', async (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const { image, mimeType } = body;

        if (!image || !mimeType) {
          return res.status(400).json({ error: 'Missing image or mimeType' });
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey || apiKey === 'your_api_key_here') {
          return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
        }

        const knownWeeds = [
          'Blackberry', 'Madeira vine', 'Fireweed', 'Lantana', 'Serrated tussock',
          'African lovegrass', 'Chilean needle grass', 'Mimosa pigra', 'Parkinsonia',
          'Prickly acacia', 'Mesquite', 'African boxthorn', 'Prickly apple',
          'Water hyacinth', 'Salvinia', 'Cabomba', 'Hydrilla', 'Elodea',
          'Alligator weed', 'Tobacco tree', 'Calotropis', 'Rubber bush', 'Gorse',
          'Camphor laurel', 'Thistles', "Paterson's curse", 'Capeweed', 'Dock',
          'Sorrel', 'Bindweed', 'Rubber vine', 'Scotch thistle', 'Spear thistle',
          'Variegated thistle', 'Parthenium weed', 'Bellyache bush',
          'Giant Parramatta grass', 'Coolatai grass', 'Groundsel bush', 'Bitou bush',
          'Privet', 'Crofton weed', 'Mistflower', 'Cockspur thorn',
          'Mother of millions', 'Lippia',
        ];

        const prompt = `You are an expert Australian weed identification specialist. Analyse this photo and identify the plant/weed shown.

Our database contains these weeds: ${knownWeeds.join(', ')}.

Respond with ONLY valid JSON in this exact format:
{
  "identified": true/false,
  "weedName": "Name of the weed",
  "confidence": "high"/"medium"/"low",
  "description": "Brief 1-2 sentence description of what you see and why you identified it as this weed",
  "inDatabase": true/false,
  "searchTerm": "the best search term to use in our database"
}

If you cannot identify the plant or it's not a weed, set "identified" to false and explain in "description".
If the weed matches one in our database list, set "inDatabase" to true and "searchTerm" to the matching database name.
If it's a weed but not in our database, set "inDatabase" to false and still provide the weed name.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: mimeType,
                      data: image,
                    },
                  },
                  {
                    type: 'text',
                    text: prompt,
                  },
                ],
              },
            ],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Anthropic API error:', response.status, errorText);
          return res.status(response.status).json({ error: 'API request failed', details: errorText });
        }

        const data = await response.json();
        const text = data.content?.[0]?.text || '';

        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          return res.json(result);
        }

        return res.status(500).json({ error: 'Could not parse API response' });
      } catch (err) {
        console.error('Identify weed error:', err);
        return res.status(500).json({ error: err.message });
      }
    });
  });
};
