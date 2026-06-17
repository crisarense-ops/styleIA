export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, system } = req.body;
    
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.api_antropic;
    
    // Log para diagnóstico
    console.log('API key present:', !!apiKey);
    console.log('API key prefix:', apiKey ? apiKey.substring(0, 15) + '...' : 'MISSING');
    console.log('Messages count:', messages?.length);
    
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured', debug: 'No ANTHROPIC_API_KEY found' });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: system || 'Eres una estilista personal.',
        messages
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, JSON.stringify(data));
      return res.status(response.status).json({ 
        error: data.error?.message || 'Anthropic error',
        status: response.status,
        type: data.error?.type
      });
    }
    
    const text = data.content?.[0]?.text || '';
    console.log('Response length:', text.length);
    return res.status(200).json({ text });

  } catch (e) {
    console.error('Handler error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
