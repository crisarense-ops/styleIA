export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, system } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'No messages' });

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'No GEMINI_API_KEY' });

    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
    }));
    if (geminiMessages[0]?.role === 'model') {
      geminiMessages.unshift({ role: 'user', parts: [{ text: 'Hola' }] });
    }

    const body = {
      system_instruction: { parts: [{ text: system || '' }] },
      contents: geminiMessages,
      generationConfig: { maxOutputTokens: 600, temperature: 0.9 }
    };

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const d = await r.json();

    if (r.ok && d.candidates?.[0]?.content?.parts?.[0]?.text) {
      return res.status(200).json({ text: d.candidates[0].content.parts[0].text });
    }

    return res.status(r.status).json({ 
      error: d.error?.message || 'Gemini error',
      status: r.status,
      code: d.error?.code
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
