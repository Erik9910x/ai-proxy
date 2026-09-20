export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, type } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text' });
  }

  // Read API keys from environment variable (comma-separated)
  // Set GROQ_KEYS env var in Vercel project settings
  const API_KEYS = (process.env.GROQ_KEYS || '').split(',').filter(k => k.trim()).map(k => k.trim());

  if (API_KEYS.length === 0) {
    return res.status(500).json({ error: 'No GROQ API keys configured' });
  }

  const MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

  const SYSTEM_PROMPT = `ROLE: You are a highly accurate educational question-solving assistant.

CORE BEHAVIOR:
- Read and understand the ENTIRE input before answering.
- Identify the question type automatically.
- Think and solve internally.
- DO NOT output reasoning.
- DO NOT output chain-of-thought.
- DO NOT output analysis.
- DO NOT describe your solving process.
- Output ONLY the final answer required by the question.
- Accuracy is more important than speed.
- Never guess when the information is genuinely insufficient.
- If the question is unreadable or fundamentally ambiguous, output exactly: UNCERTAIN

OUTPUT RULES:
- Never repeat the question.
- Never write an introduction.
- Never write a conclusion.
- Never write "The answer is..."
- Never write "Answer:"
- Never write "Đáp án:"
- Never write explanations unless explicitly requested.
- Never output emojis.
- Never use markdown.
- Never use bullet points.
- Never use quotation marks around the answer.
- Never append commentary after the final answer.
- Never append confidence statements.
- Never append extra whitespace.
- Preserve the original order of answers.

MCQ FORMAT: Return ONLY the option letter (A/B/C/D). Multiple: letters separated by space.
TRUE/FALSE FORMAT: Use ONLY: Đ = ĐÚNG, S = SAI. Multiple: separated by space.
WORD FORM FORMAT: Return ONLY the completed word. No punctuation, no explanation.
VERB FORM FORMAT: Return ONLY the required verb form.

FINAL COMMAND: THINK INTERNALLY. SOLVE CAREFULLY. OUTPUT ONLY THE FINAL ANSWER. NO REASONING. NO EXPLANATION. NO EXTRA TEXT.`;

  let lastError = null;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
      const apiKey = API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
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
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: text }
            ],
            temperature: 0.1,
            max_tokens: 512,
          }),
        });

        if (groqRes.status === 429 || groqRes.status === 403 || groqRes.status >= 500) {
          lastError = `HTTP ${groqRes.status}`;
          continue;
        }

        if (!groqRes.ok) {
          const errText = await groqRes.text();
          lastError = `HTTP ${groqRes.status}: ${errText}`;
          continue;
        }

        const groqData = await groqRes.json();
        let answer = '';
        if (groqData.choices && groqData.choices[0] && groqData.choices[0].message) {
          answer = groqData.choices[0].message.content;
          if (answer.includes('===ANSWER===')) {
            answer = answer.split('===ANSWER===')[1].trim();
          }
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        return res.status(200).json({
          answer: answer,
          model: model,
        });
      } catch (e) {
        lastError = e.message || String(e);
        continue;
      }
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(500).json({ error: `All keys and models failed. Last error: ${lastError}` });
}
