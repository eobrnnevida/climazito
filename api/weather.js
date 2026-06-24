export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  let city = req.query.city || req.query.q || req.query.query || req.query.text || "";
  const lang = req.query.lang || "pt-BR";

  if (!city && req.query.command) {
    const match = req.query.command.trim().match(/^!clima\s+(.+)$/i);
    if (match) city = match[1].trim();
  }

  city = city.replace(/^!clima\s*/i, "").trim();

  if (!city) {
    return res.status(200).send("Use: !clima <cidade> ou !clima <cidade> <estado> — ex: !clima nova fatima PR");
  }

  try {
    // Tenta buscar com count=5 para pegar variações e priorizar Brasil
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=pt&format=json`
    );
    const geoData = await geoRes.json();

    if (!geoData.results || geoData.results.length === 0) {
      // Tenta com Nominatim (OpenStreetMap) como fallback para cidades pequenas
      const nominatimRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city + ", Brasil")}&format=json&limit=1&accept-language=pt-BR`,
        { headers: { "User-Agent": "ClimaTwitchBot/1.0" } }
      );
      const nominatimData = await nominatimRes.json();

      if (!nominatimData || nominatimData.length === 0) {
        return res.status(200).send(`Cidade "${city}" nao encontrada. Tente: !clima nova fatima PR`);
      }

      const { lat, lon, display_name } = nominatimData[0];
      const shortName = display_name.split(",").slice(0, 2).join(",").trim();
      return await getWeather(parseFloat(lat), parseFloat(lon), shortName, lang, res);
    }

    // Prioriza resultado do Brasil se houver
    const brasil = geoData.results.find(r => r.country_code === "BR");
    const result = brasil || geoData.results[0];
    const { latitude, longitude, name, admin1, country } = result;
    const cityName = admin1 ? `${name}, ${admin1}` : `${name}, ${country}`;

    return await getWeather(latitude, longitude, cityName, lang, res);

  } catch (err) {
    return res.status(200).send("Erro ao buscar clima. Tente novamente.");
  }
}

async function getWeather(lat, lon, cityName, lang, res) {
  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m&timezone=auto`
  );
  const weatherData = await weatherRes.json();
  const current = weatherData.current;
  const temp = Math.round(current.temperature_2m);
  const humidity = current.relativehumidity_2m;
  const wind = Math.round(current.windspeed_10m);
  const desc = getDescription(current.weathercode, lang);
  return res.status(200).send(`Clima em ${cityName}: ${desc}, ${temp}C | Umidade: ${humidity}% | Vento: ${wind} km/h`);
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
