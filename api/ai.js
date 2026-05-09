// ════════════════════════════════════════════════════════════
//  NutriApp — Proxy seguro para Anthropic API
//  La clave ANTHROPIC_API_KEY nunca sale del servidor.
//  Configúrala en Vercel → Settings → Environment Variables.
// ════════════════════════════════════════════════════════════

module.exports = async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { type: 'invalid_request_error', message: 'Method not allowed' } });
  }

  // Leer clave del entorno de Vercel
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: {
        type: 'api_error',
        message: 'ANTHROPIC_API_KEY no configurada. Ve a Vercel → Settings → Environment Variables y añádela.'
      }
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    return res.status(500).json({
      error: { type: 'api_error', message: err.message }
    });
  }
};
