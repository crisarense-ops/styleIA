export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lat, lon, days = 0, hour } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat/lon required' });

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FMadrid&forecast_days=7`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('open-meteo error ' + r.status);
    const d = await r.json();

    const diaIdx = parseInt(days) || 0;
    const horaObj = parseInt(hour) || null;
    let t, ll = false;

    const ahora = new Date();
    const fechaObj = new Date(ahora);
    fechaObj.setDate(ahora.getDate() + diaIdx);
    const fechaStr = fechaObj.toISOString().split('T')[0];

    if (horaObj !== null) {
      // Temperatura a hora específica del día objetivo
      const targetTime = `${fechaStr}T${String(horaObj).padStart(2,'0')}:00`;
      const idx = d.hourly.time.findIndex(t => t === targetTime);
      if (idx >= 0) {
        t = Math.round(d.hourly.temperature_2m[idx]);
        ll = (d.hourly.precipitation_probability[idx] || 0) > 40;
      }
    }
    
    if (t === undefined) {
      if (diaIdx === 0 && horaObj === null) {
        // Hora actual
        const horaActual = ahora.getHours();
        const idx = d.hourly.time.findIndex(t => {
          const h = new Date(t);
          return h.toDateString() === ahora.toDateString() && h.getHours() >= horaActual;
        });
        t = Math.round(d.hourly.temperature_2m[Math.max(0, idx)]);
        ll = (d.hourly.precipitation_probability[Math.max(0, idx)] || 0) > 40;
      } else {
        // Media del día
        const dayIdx = d.daily.time.findIndex(f => f === fechaStr);
        if (dayIdx >= 0) {
          t = Math.round((d.daily.temperature_2m_max[dayIdx] + d.daily.temperature_2m_min[dayIdx]) / 2);
          ll = (d.daily.precipitation_probability_max[dayIdx] || 0) > 40;
        } else {
          t = 20;
        }
      }
    }

    const cond = t >= 30 ? 'muy caluroso' : t >= 25 ? 'caluroso' : t >= 20 ? 'templado' : t >= 12 ? 'fresco' : 'frío';
    const cuando = diaIdx === 0 ? 'hoy' : diaIdx === 1 ? 'mañana' : 'próximamente';
    const horaStr = horaObj ? ` a las ${horaObj}h` : '';

    return res.status(200).json({ t, ll, cond, cuando, hora: horaObj, info: `${cuando}${horaStr}: ${t}°C` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
