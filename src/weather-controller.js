(function exposeInfiniteLofiWeatherController(globalScope) {
  function createWeatherController(options) {
    const {
      storage,
      statusTime,
      statusDate,
      statusWeather,
      weather,
      fetch: fetchImpl = globalScope.fetch.bind(globalScope),
      DOMParser: DOMParserType = globalScope.DOMParser,
      cacheKey = "infiniteLofiWeatherCache",
      refreshIntervalMs = 10 * 60 * 1000,
      hintRefreshIntervalMs = 60 * 1000,
      retryDelaysMs = [0, 1800, 5000]
    } = options;

    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    function parseStoredJson(fallback = null) {
      try {
        const raw = storage.getItem(cacheKey);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    }

    function sanitize(rawText) {
      return weather.sanitizeWeatherText(rawText, (html) => {
        const parsed = new DOMParserType().parseFromString(html, "text/html");
        return parsed.body?.textContent || "";
      });
    }

    async function fetchJsonWithTimeout(url, timeoutMs = 6000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`request failed: ${response.status}`);
        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    }

    async function fetchTextWithTimeout(url, timeoutMs = 6000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`request failed: ${response.status}`);
        return (await response.text()).trim();
      } finally {
        clearTimeout(timer);
      }
    }

    async function fetchViaOpenMeteo() {
      const geo = await fetchJsonWithTimeout("https://ipapi.co/json/", 6000);
      const latitude = Number(geo?.latitude);
      const longitude = Number(geo?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("invalid geo location");
      }
      const city = typeof geo.city === "string" && geo.city.trim() ? geo.city.trim() : "Local";
      const forecast = await fetchJsonWithTimeout(
        `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=temperature_2m,weather_code&timezone=auto`,
        7000
      );
      const temperature = Number(forecast?.current?.temperature_2m);
      const code = Number(forecast?.current?.weather_code);
      if (!Number.isFinite(temperature)) throw new Error("invalid weather payload");
      return `${city}: ${weather.weatherCodeToText(code)} ${Math.round(temperature)}°C`;
    }

    async function fetchViaWttr() {
      return await fetchTextWithTimeout("https://wttr.in/?format=%l:+%c+%t", 7000);
    }

    function formatDisplay(text, updatedAt) {
      const safeText = sanitize(text);
      if (!safeText) return "";
      const age = weather.formatUpdatedAgo(updatedAt);
      return age ? `${safeText} · ${age}更新` : safeText;
    }

    function readCachedWeather() {
      const cache = parseStoredJson(null);
      if (!cache || typeof cache !== "object") return null;
      const text = sanitize(typeof cache.text === "string" ? cache.text : "");
      if (!text) return null;
      const updatedAt = Number(cache.updatedAt);
      return { text, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
    }

    function writeCachedWeather(text, updatedAt = Date.now()) {
      const normalized = sanitize(text);
      if (!normalized) return;
      storage.setItem(cacheKey, JSON.stringify({ text: normalized, updatedAt }));
    }

    function refreshWeatherHintFromCache() {
      const cached = readCachedWeather();
      if (cached && statusWeather) statusWeather.textContent = formatDisplay(cached.text, cached.updatedAt);
    }

    function updateClockDisplay() {
      const now = new Date();
      if (statusTime) {
        statusTime.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      }
      if (statusDate) statusDate.textContent = now.toLocaleDateString();
    }

    async function fetchWeatherText() {
      const providers = [fetchViaOpenMeteo, fetchViaWttr];
      for (const delayMs of retryDelaysMs) {
        if (delayMs > 0) await wait(delayMs);
        for (const provider of providers) {
          try {
            const text = sanitize(await provider());
            if (text) {
              const updatedAt = Date.now();
              if (statusWeather) statusWeather.textContent = formatDisplay(text, updatedAt);
              writeCachedWeather(text, updatedAt);
              return;
            }
          } catch {
            // Try the next provider or retry round.
          }
        }
      }
      const cached = readCachedWeather();
      if (cached && statusWeather) {
        statusWeather.textContent = formatDisplay(cached.text, cached.updatedAt);
      } else if (statusWeather) {
        statusWeather.textContent = "Weather unavailable";
      }
    }

    function init() {
      updateClockDisplay();
      setInterval(updateClockDisplay, 1000);
      refreshWeatherHintFromCache();
      setInterval(refreshWeatherHintFromCache, hintRefreshIntervalMs);
      fetchWeatherText();
      setInterval(fetchWeatherText, refreshIntervalMs);
    }

    return { fetchWeatherText, init, readCachedWeather, updateClockDisplay };
  }

  const api = { createWeatherController };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiWeatherController = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
