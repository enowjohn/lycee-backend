const express = require('express');
const OpenAI = require('openai');

const router = express.Router();

// ============================================================
// AI Chat endpoint - Using Groq API with OpenAI SDK
//
// If this returns 500s, check the server logs — the error handling below
// prints a specific diagnosis for the most common failure modes: missing
// GROQ_API_KEY, invalid/revoked key, wrong/decommissioned model, rate
// limiting. Get a key at https://console.groq.com/keys and see currently
// supported models at https://console.groq.com/docs/models
// ============================================================

const GROQ_MODEL = 'openai/gpt-oss-20b';

router.post('/chat', async (req, res) => {
  const { message, conversationHistory } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'A non-empty "message" field is required.' });
  }

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    console.error('GROQ_API_KEY is missing from environment variables.');
    return res.status(500).json({ error: 'The AI service is not configured on the server. Please contact the site administrator.' });
  }

  const openai = new OpenAI({ apiKey: groqApiKey, baseURL: 'https://api.groq.com/openai/v1' });

  const systemPrompt = 'You are John Enow AI, a helpful educational assistant for students. Answer questions directly, clearly, and accurately. Provide explanations, formulas, definitions, and examples when helpful. Be concise but thorough. If asked for a formula, provide it clearly. If asked for a definition, give a clear, accurate definition. Help students understand concepts across all subjects.';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(Array.isArray(conversationHistory) ? conversationHistory : []).map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    })),
    { role: 'user', content: message }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      max_tokens: 2000,
      temperature: 0.7
    });

    const reply = completion?.choices?.[0]?.message?.content;
    if (!reply) {
      console.error('Groq API returned an unexpected response shape:', JSON.stringify(completion));
      return res.status(500).json({ error: 'The AI service returned an empty response. Please try again.' });
    }

    return res.json({ response: reply });
  } catch (error) {
    const code = error?.code || error?.error?.code;
    const status = error?.status;

    console.error('--- Groq API error ---');
    console.error('status:', status, '| code:', code);
    console.error('message:', error.message);

    if (code === 'invalid_api_key' || status === 401) {
      console.error(
        'DIAGNOSIS: GROQ_API_KEY is invalid or revoked.\n' +
        'Fix: generate a new key at https://console.groq.com/keys, update .env, restart the server.'
      );
      return res.status(500).json({ error: 'The AI service is not configured correctly (invalid API key). Please contact the site administrator.' });
    }

    if (code === 'model_not_found' || code === 'model_decommissioned' || status === 404) {
      console.error(
        `DIAGNOSIS: The model "${GROQ_MODEL}" is not available on this account.\n` +
        'Fix: check https://console.groq.com/docs/models and update GROQ_MODEL in this file.'
      );
      return res.status(500).json({ error: 'The AI service is temporarily using an unsupported model. Please contact the site administrator.' });
    }

    if (status === 429) {
      console.error('DIAGNOSIS: Rate limit hit on the Groq account.');
      return res.status(429).json({ error: 'The AI service is busy right now. Please try again in a moment.' });
    }

    console.error('Full error object:', error);
    return res.status(500).json({ error: 'Failed to get a response from the AI service. Please try again.' });
  }
});

module.exports = router;
