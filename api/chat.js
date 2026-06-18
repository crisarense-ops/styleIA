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
    if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada', debug: 'env vars: ' + Object.keys(process.env).filter(k=>k.includes('GEM')||k.includes('ANT')).join(',') });

    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
    }));

    if (geminiMessages[0]?.role === 'model') {
      geminiMessages.unshift({ role: 'user', parts: [{ text: 'Hola' }] });
    }

    const body = {
      system_instruction: { parts: [{ text: system || 'Eres una asistente.' }] },
      contents: geminiMessages,
      generationConfig: { maxOutputTokens: 600, temperature: 0.8 }
    };

    const models = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-pro'];
    const errors = [];

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const d = await r.json();
        
        if (r.ok && d.candidates?.[0]?.content?.parts?.[0]?.text) {
          return res.status(200).json({ text: d.candidates[0].content.parts[0].text, model });
        }
        errors.push(`${model}: ${d.error?.message || d.error?.status || r.status}`);
      } catch(e) {
        errors.push(`${model}: ${e.message}`);
      }
    }

    return res.status(500).json({ error: 'Todos fallaron', details: errors });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
