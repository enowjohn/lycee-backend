const express = require('express');
const OpenAI = require('openai');

const router = express.Router();

// AI Chat endpoint - Using Groq API with OpenAI SDK
router.post('/chat', async (req, res) => {
  const { message, conversationHistory } = req.body;

  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return res.status(500).json({ error: 'Groq API key not configured' });
    }

    const openai = new OpenAI({
      apiKey: groqApiKey,
      baseURL: 'https://api.groq.com/openai/v1'
    });

    const systemPrompt = 'You are John Enow AI, a helpful educational assistant for students. Answer questions directly, clearly, and accurately. Provide explanations, formulas, definitions, and examples when helpful. Be concise but thorough. If asked for a formula, provide it clearly. If asked for a definition, give a clear, accurate definition. Help students understand concepts across all subjects.';

    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      ...(conversationHistory || []).map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      })),
      {
        role: 'user',
        content: message
      }
    ];

    console.log('Attempting Groq API call with OpenAI SDK...');
    const completion = await openai.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7
    });

    if (completion.choices && completion.choices[0]) {
      res.json({ response: completion.choices[0].message.content });
    } else {
      res.status(500).json({ error: 'Invalid response from Groq API' });
    }
  } catch (error) {
    console.error('Groq API error:', error.message);
    console.error('Groq API error details:', error);
    res.status(500).json({ error: 'Failed to get response from AI: ' + error.message });
  }
});

module.exports = router;
