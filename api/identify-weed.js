const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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

function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return {};
}

function approximateBase64Bytes(value) {
  return Math.ceil((value.length * 3) / 4);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, mimeType } = getJsonBody(req);

    if (!image || !mimeType) {
      return res.status(400).json({ error: 'Missing image or mimeType' });
    }

    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mimeType)) {
      return res.status(400).json({ error: 'Unsupported image type' });
    }

    if (approximateBase64Bytes(image) > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'Image must be under 4MB for production identification.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

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
      return res.status(response.status).json({ error: 'API request failed' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({ error: 'Could not parse API response' });
    }

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error('Identify weed error:', error);
    return res.status(500).json({ error: 'Failed to identify weed' });
  }
};
