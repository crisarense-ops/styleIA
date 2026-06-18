export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, system } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'No messages' });

    // Anthropic primero
    const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.api_antropic;
    if (anthropicKey) {
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, system, messages })
        });
        const d = await r.json();
        if (r.ok) return res.status(200).json({ text: d.content?.[0]?.text || '' });
        if (!d.error?.message?.includes('credit') && !d.error?.message?.includes('balance')) throw new Error(d.error?.message);
      } catch(e) { console.log('Anthropic:', e.message); }
    }

    // Gemini con retry
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'No API key' });

    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
    }));
    if (geminiMessages[0]?.role === 'model') geminiMessages.unshift({ role: 'user', parts: [{ text: 'Hola' }] });

    const body = {
      system_instruction: { parts: [{ text: system || '' }] },
      contents: geminiMessages,
      generationConfig: { maxOutputTokens: 600, temperature: 0.8 }
    };

    // Intentar gemini-2.0-flash con 2 reintentos si hay rate limit
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      const d = await r.json();

      if (r.ok && d.candidates?.[0]?.content?.parts?.[0]?.text) {
        return res.status(200).json({ text: d.candidates[0].content.parts[0].text });
      }

      // Rate limit — esperar y reintentar
      if (d.error?.message?.includes('quota') || d.error?.message?.includes('retry')) {
        const waitMs = attempt === 0 ? 2000 : attempt === 1 ? 5000 : 10000;
        console.log(`Rate limit, esperando ${waitMs}ms...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      // Otro error — salir
      return res.status(500).json({ error: d.error?.message || 'Gemini error' });
    }

    return res.status(500).json({ error: 'Rate limit — intenta en unos segundos' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
