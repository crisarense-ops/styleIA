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
        const errMsg = d.error?.message || '';
        if (!errMsg.includes('credit') && !errMsg.includes('balance')) throw new Error(errMsg);
        console.log('Anthropic sin créditos, usando Gemini...');
      } catch(e) {
        console.log('Anthropic error:', e.message);
      }
    }

    // Gemini Flash 2.0 (modelo actual gratuito)
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'No API key configured' });

    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    // Asegurar que empieza con user
    if (geminiMessages[0]?.role === 'model') {
      geminiMessages.unshift({ role: 'user', parts: [{ text: 'Hola' }] });
    }

    const geminiBody = {
      system_instruction: { parts: [{ text: system || '' }] },
      contents: geminiMessages,
      generationConfig: { maxOutputTokens: 600, temperature: 0.8 }
    };

    // Probar modelos en orden hasta que uno funcione
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-pro'];
    
    for (const model of models) {
      const gr = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody) }
      );
      const gd = await gr.json();
      if (gr.ok && gd.candidates?.[0]?.content?.parts?.[0]?.text) {
        const text = gd.candidates[0].content.parts[0].text;
        console.log(`✓ ${model}: ${text.slice(0,50)}`);
        return res.status(200).json({ text });
      }
      console.log(`${model} falló:`, gd.error?.message || gr.status);
    }

    return res.status(500).json({ error: 'Todos los modelos fallaron' });

  } catch (e) {
    console.error('Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
