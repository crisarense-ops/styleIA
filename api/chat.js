export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, system } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'No messages' });

    // Intentar Anthropic primero
    const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.api_antropic;
    if (anthropicKey) {
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            system,
            messages
          })
        });
        const d = await r.json();
        if (r.ok) return res.status(200).json({ text: d.content?.[0]?.text || '' });
        if (d.error?.type !== 'invalid_request_error' || !d.error?.message?.includes('credit')) throw new Error(d.error?.message);
        console.log('Anthropic sin créditos, usando Gemini...');
      } catch(e) {
        console.log('Anthropic falló:', e.message);
      }
    }

    // Fallback: Gemini Flash (gratuito)
    const geminiKey = process.env.GEMINI_API_KEY || 'AIzaSyBypx1hSZiRLXqmO96HGesznwGlRqCuY_4';
    
    // Convertir mensajes al formato Gemini
    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const geminiBody = {
      system_instruction: { parts: [{ text: system || '' }] },
      contents: geminiMessages,
      generationConfig: { maxOutputTokens: 600, temperature: 0.7 }
    };

    const gr = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody) }
    );

    const gd = await gr.json();
    if (!gr.ok) return res.status(gr.status).json({ error: gd.error?.message || 'Gemini error' });
    
    const text = gd.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ text });

  } catch (e) {
    console.error('Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
