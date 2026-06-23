export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, system } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'No messages' });

    // 1. Intentar Anthropic
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
        const msg = d.error?.message || '';
        if (!msg.includes('credit') && !msg.includes('balance')) throw new Error(msg);
      } catch(e) { console.log('Anthropic:', e.message); }
    }

    // 2. Intentar Groq (gratis, rápido)
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const groqMessages = system 
          ? [{ role: 'system', content: system }, ...messages]
          : messages;
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: groqMessages,
            max_tokens: 600,
            temperature: 0.9
          })
        });
        const d = await r.json();
        if (r.ok) return res.status(200).json({ text: d.choices?.[0]?.message?.content || '' });
        console.log('Groq error:', d.error?.message);
      } catch(e) { console.log('Groq:', e.message); }
    }

    // 3. Intentar Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const geminiMessages = messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
        }));
        if (geminiMessages[0]?.role === 'model') geminiMessages.unshift({ role: 'user', parts: [{ text: 'Hola' }] });
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ system_instruction: { parts: [{ text: system || '' }] }, contents: geminiMessages, generationConfig: { maxOutputTokens: 600 } }) }
        );
        const d = await r.json();
        if (r.ok && d.candidates?.[0]?.content?.parts?.[0]?.text) {
          return res.status(200).json({ text: d.candidates[0].content.parts[0].text });
        }
      } catch(e) { console.log('Gemini:', e.message); }
    }

    return res.status(500).json({ error: 'Todas las APIs fallaron. Configura GROQ_API_KEY en Vercel.' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
