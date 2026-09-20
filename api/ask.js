// Vercel serverless function - GROQ proxy
// Reads API keys from GROQ_KEYS env var (comma-separated)

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, prompt, model: requestedModel } = req.body || {};
  const promptText = text || prompt;

  if (!promptText || typeof promptText !== 'string') {
    return res.status(400).json({ error: 'Missing text' });
  }

  // Get API keys from env var (set GROQ_KEYS as comma-separated in Vercel)
  const keysEnv = process.env.GROQ_KEYS || '';
  const API_KEYS = keysEnv.split(',').map(k => k.trim()).filter(Boolean);

  if (API_KEYS.length === 0) {
    return res.status(500).json({ error: 'No GROQ API keys configured. Set GROQ_KEYS env var.' });
  }

  // Model priority with correct Groq model IDs
  const MODELS = requestedModel
    ? [requestedModel]
    : ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

  let lastError = null;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
      const apiKey = API_KEYS[attempt];
      try {
        const groqRes = await fetch(GROQ_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'user', content: promptText }
            ],
            temperature: 0.1,
            max_tokens: 256,
          }),
        });

        if (groqRes.status === 429 || groqRes.status === 403) {
          lastError = `HTTP ${groqRes.status}`;
          continue;
        }

        if (groqRes.status === 400) {
          const errData = await groqRes.json().catch(() => ({}));
          lastError = `HTTP 400: ${JSON.stringify(errData)}`;
          continue;
        }

        if (groqRes.status >= 500) {
          lastError = `HTTP ${groqRes.status}`;
          continue;
        }

        if (!groqRes.ok) {
          const errText = await groqRes.text();
          lastError = `HTTP ${groqRes.status}: ${errText}`;
          continue;
        }

        const data = await groqRes.json();

        if (!data.choices || !data.choices[0]) {
          lastError = 'No choices in response';
          continue;
        }

        let content = data.choices[0].message?.content || '';

        // Extract answer after ===ANSWER=== if present
        if (content.includes('===ANSWER===')) {
          content = content.split('===ANSWER===')[1].trim();
        }

        return res.status(200).json({
          answer: content,
          model: model,
        });
      } catch (e) {
        lastError = e.message || String(e);
        continue;
      }
    }
  }

  return res.status(500).json({
    error: `All keys and models failed. Last error: ${lastError}`
  });
}
