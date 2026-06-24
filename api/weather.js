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

    // Função auxiliar para buscar no Nominatim
    const nominatimSearch = async (query, countryCode) => {
      const params = new URLSearchParams({
        q: query,
        format: "json",
        limit: "5",
        "accept-language": "pt-BR",
        addressdetails: "1",
      });
      if (countryCode) params.set("countrycodes", countryCode);

      const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: {
          "User-Agent": "ClimaTwitchBot/1.0",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });
      return r.json();
    };

    // 1. Busca no Brasil primeiro
    let results = await nominatimSearch(input, "br");

    if (!results || results.length === 0) {
      // 2. Tenta com ", Brasil" no final
      results = await nominatimSearch(input + ", Brasil", "br");
    }

    if (!results || results.length === 0) {
      // 3. Busca global (para cidades fora do Brasil)
      results = await nominatimSearch(input, null);
    }

    if (!results || results.length === 0) {
      return res.status(200).send(`"${input}" nao encontrado. Tente: !clima Goiania ou !clima Nova Fatima PR`);
    }

    const best = results[0];
    lat = parseFloat(best.lat);
    lon = parseFloat(best.lon);

    // Monta nome de exibição a partir do addressdetails
    const addr = best.address || {};
    const cidade = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
    const estado = addr.state || "";
    const pais = addr.country || "";

    if (cidade && estado) {
      displayName = `${cidade}, ${estado}`;
    } else if (cidade && pais) {
      displayName = `${cidade}, ${pais}`;
    } else {
      // fallback: primeiros campos do display_name
      displayName = best.display_name.split(",").slice(0, 2).join(",").trim();
    }

    // Busca clima
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m&timezone=auto`
    );
    const weatherData = await weatherRes.json();

    if (!weatherData.current) {
      return res.status(200).send("Erro ao buscar clima. Tente novamente.");
    }

    const current = weatherData.current;
    const temp = Math.round(current.temperature_2m);
    const humidity = current.relativehumidity_2m;
    const wind = Math.round(current.windspeed_10m);
    const desc = getDescription(current.weathercode, lang);

    return res.status(200).send(
      `Clima em ${displayName}: ${desc}, ${temp}C | Umidade: ${humidity}% | Vento: ${wind} km/h`
    );

  } catch (err) {
    console.error(err);
    return res.status(200).send("Erro interno. Tente novamente em instantes.");
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
