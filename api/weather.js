export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  let input = req.query.city || req.query.q || req.query.query || req.query.text || "";
  const lang = req.query.lang || "pt-BR";

  if (!input && req.query.command) {
    const match = req.query.command.trim().match(/^!clima\s+(.+)$/i);
    if (match) input = match[1].trim();
  }

  input = input.replace(/^!clima\s*/i, "").trim();

  if (!input) {
    return res.status(200).send("Use: !clima <cidade> — ex: !clima Goiania ou !clima Nova Fatima PR");
  }

  try {
    let lat, lon, displayName;

    // 1. Tenta achar no Brasil primeiro via Nominatim
    const brRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&countrycodes=br&format=json&limit=1&accept-language=pt-BR`,
      { headers: { "User-Agent": "ClimaTwitchBot/1.0 contact@clima.app" } }
    );
    const brData = await brRes.json();

    if (brData && brData.length > 0) {
      lat = parseFloat(brData[0].lat);
      lon = parseFloat(brData[0].lon);
      const parts = brData[0].display_name.split(",");
      // Pega cidade e estado (primeiros 2-3 campos)
      displayName = parts.slice(0, 2).join(",").trim();
    } else {
      // 2. Fallback: busca global (Tokyo, Lisboa, etc)
      const globalRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&limit=1&accept-language=pt-BR`,
        { headers: { "User-Agent": "ClimaTwitchBot/1.0 contact@clima.app" } }
      );
      const globalData = await globalRes.json();

      if (!globalData || globalData.length === 0) {
        return res.status(200).send(`Cidade "${input}" nao encontrada. Tente outro nome.`);
      }

      lat = parseFloat(globalData[0].lat);
      lon = parseFloat(globalData[0].lon);
      const parts = globalData[0].display_name.split(",");
      displayName = parts.slice(0, 2).join(",").trim();
    }

    // 3. Busca clima com as coordenadas
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m&timezone=auto`
    );
    const weatherData = await weatherRes.json();
    const current = weatherData.current;
    const temp = Math.round(current.temperature_2m);
    const humidity = current.relativehumidity_2m;
    const wind = Math.round(current.windspeed_10m);
    const desc = getDescription(current.weathercode, lang);

    return res.status(200).send(`Clima em ${displayName}: ${desc}, ${temp}C | Umidade: ${humidity}% | Vento: ${wind} km/h`);

  } catch (err) {
    return res.status(200).send("Erro ao buscar clima. Tente novamente.");
  }
}

function getDescription(code, lang) {
  const pt = {
    0: "ceu limpo", 1: "predominantemente limpo", 2: "parcialmente nublado",
    3: "nublado", 45: "neblina", 48: "neblina com geada",
    51: "garoa leve", 53: "garoa moderada", 55: "garoa intensa",
    61: "chuva leve", 63: "chuva moderada", 65: "chuva forte",
    71: "neve leve", 73: "neve moderada", 75: "neve intensa",
    80: "pancadas de chuva", 81: "chuva com trovoada", 82: "tempestade",
    95: "trovoada", 96: "trovoada com granizo", 99: "trovoada forte com granizo",
  };
  const en = {
    0: "clear sky", 1: "mainly clear", 2: "partly cloudy",
    3: "overcast", 61: "light rain", 63: "moderate rain",
    65: "heavy rain", 80: "rain showers", 95: "thunderstorm",
  };
  const dict = lang.startsWith("pt") ? pt : en;
  return dict[code] || dict[Math.floor(code / 10) * 10] || "tempo variavel";
}
