const BASE_URL = 'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Biota/VegetationManagement/MapServer';

const LAYERS = {
  pmav: 146,
  rvm: 109,
};

const CATEGORY_LAYERS = {
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

async function fetchWithRetry(url, retries = 3, delay = 700) {
  let lastError;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'FlyTheFarm-PMAV/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Queensland vegetation service returned HTTP ${response.status}`);
      }

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

function buildQueryUrl({ dataset, category, lotplan, bbox, geometry, geometryType }) {
  const cleanCategory = category ? String(category).toUpperCase() : '';
  const layerId = cleanCategory ? CATEGORY_LAYERS[cleanCategory] : LAYERS[dataset];

  if (!layerId) {
    throw new Error('Invalid vegetation dataset');
  }

  let whereClause = '1=1';
  if (lotplan) {
    const cleanLotPlan = sanitizeLotPlan(lotplan);
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

  if (bbox) {
    params.set('geometry', String(bbox));
    params.set('geometryType', 'esriGeometryEnvelope');
    params.set('spatialRel', 'esriSpatialRelIntersects');
    params.set('inSR', '4326');
  } else if (geometry && geometryType) {
    params.set('geometry', String(geometry));
    params.set('geometryType', String(geometryType));
    params.set('spatialRel', 'esriSpatialRelIntersects');
    params.set('inSR', '4326');
  }

  return `${BASE_URL}/${layerId}/query?${params.toString()}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dataset = req.query.dataset === 'rvm' ? 'rvm' : 'pmav';
    const url = buildQueryUrl({
      dataset,
      category: req.query.category,
      lotplan: req.query.lotplan,
      bbox: req.query.bbox,
      geometry: req.query.geometry,
      geometryType: req.query.geometryType,
    });

    const data = await fetchWithRetry(url);
    return res.status(200).json(data);
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('PMAV proxy error:', error);
    return res.status(status).json({
      error: status === 400
        ? error.message
        : 'Failed to query Queensland vegetation mapping. The government service may be temporarily unavailable.',
    });
  }
};
