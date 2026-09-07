(function exposeInfiniteLofiWeatherController(globalScope) {
  function createWeatherController(options) {
    const {
      storage,
      statusTime,
      statusDate,
      statusWeather,
      modeSelect,
      cityInput,
      applyButton,
      privacyHint,
      weather,
      initialSettings,
      onSettingsChange = () => {},
      fetch: fetchImpl = globalScope.fetch.bind(globalScope),
      DOMParser: DOMParserType = globalScope.DOMParser,
      cacheKey = "infiniteLofiWeatherCache",
      refreshIntervalMs = 10 * 60 * 1000,
      hintRefreshIntervalMs = 60 * 1000,
      retryDelaysMs = [0, 1800]
    } = options;

    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    let settings = weather.normalizeWeatherSettings(initialSettings);
    let requestGeneration = 0;
    let activeRequestController = null;

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
      activeRequestController = controller;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`request failed: ${response.status}`);
        return await response.json();
      } finally {
        clearTimeout(timer);
        if (activeRequestController === controller) activeRequestController = null;
      }
    }

    function cancelActiveRequest() {
      activeRequestController?.abort();
      activeRequestController = null;
    }

    function getSourceKey() {
      return settings.mode === "city" ? `city:${settings.city.toLowerCase()}` : settings.mode;
    }

    async function fetchForecast(latitude, longitude, placeLabel) {
      const forecast = await fetchJsonWithTimeout(weather.buildForecastUrl(latitude, longitude), 7000);
      const temperature = Number(forecast?.current?.temperature_2m);
      const code = Number(forecast?.current?.weather_code);
      if (!Number.isFinite(temperature)) throw new Error("invalid weather payload");
      return `${placeLabel}: ${weather.weatherCodeToText(code)} ${Math.round(temperature)}°C`;
    }

    async function fetchViaAutomaticLocation() {
      const geo = await fetchJsonWithTimeout("https://ipapi.co/json/", 6000);
      const latitude = Number(geo?.latitude);
      const longitude = Number(geo?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("invalid geo location");
      }
      const city = typeof geo.city === "string" && geo.city.trim() ? geo.city.trim() : "Local";
      return await fetchForecast(latitude, longitude, city);
    }

    async function fetchViaCity() {
      if (!settings.city) throw new Error("city is required");
      const search = await fetchJsonWithTimeout(weather.buildGeocodingUrl(settings.city), 7000);
      const match = Array.isArray(search?.results) ? search.results[0] : null;
      const latitude = Number(match?.latitude);
      const longitude = Number(match?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("city not found");
      }
      const labelParts = [match?.name, match?.admin1 || match?.country]
        .filter((value) => typeof value === "string" && value.trim())
        .map((value) => value.trim());
      return await fetchForecast(latitude, longitude, labelParts.join(", ") || settings.city);
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
      if (cache.sourceKey !== getSourceKey()) return null;
      const text = sanitize(typeof cache.text === "string" ? cache.text : "");
      if (!text) return null;
      const updatedAt = Number(cache.updatedAt);
      return { text, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
    }

    function writeCachedWeather(text, updatedAt = Date.now()) {
      const normalized = sanitize(text);
      if (!normalized) return;
      storage.setItem(cacheKey, JSON.stringify({ text: normalized, updatedAt, sourceKey: getSourceKey() }));
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
      cancelActiveRequest();
      const generation = ++requestGeneration;
      if (settings.mode === "off") {
        if (statusWeather) statusWeather.textContent = "Weather off";
        return;
      }
      if (settings.mode === "city" && !settings.city) {
        if (statusWeather) statusWeather.textContent = "Enter a city";
        return;
      }

      const provider = settings.mode === "city" ? fetchViaCity : fetchViaAutomaticLocation;
      if (statusWeather) statusWeather.textContent = "Loading weather…";
      for (const delayMs of retryDelaysMs) {
        if (delayMs > 0) await wait(delayMs);
        if (generation !== requestGeneration) return;
        try {
          const text = sanitize(await provider());
          if (text && generation === requestGeneration) {
            const updatedAt = Date.now();
            if (statusWeather) statusWeather.textContent = formatDisplay(text, updatedAt);
            writeCachedWeather(text, updatedAt);
            return;
          }
        } catch {
          // Retry once, then use the matching cache or a clear unavailable state.
        }
      }
      if (generation !== requestGeneration) return;
      const cached = readCachedWeather();
      if (cached && statusWeather) {
        statusWeather.textContent = formatDisplay(cached.text, cached.updatedAt);
      } else if (statusWeather) {
        statusWeather.textContent = "Weather unavailable";
      }
    }

    function renderSettings() {
      if (modeSelect) modeSelect.value = settings.mode;
      if (cityInput) {
        cityInput.value = settings.city;
        cityInput.disabled = settings.mode !== "city";
      }
      if (applyButton) applyButton.disabled = settings.mode === "city" && !settings.city;
      if (privacyHint) {
        privacyHint.textContent =
          settings.mode === "auto"
            ? "Automatic mode sends your IP address to ipapi.co, then coordinates to Open-Meteo."
            : settings.mode === "city"
            ? "City mode sends only the city name and resulting coordinates to Open-Meteo."
            : "Weather is off. No weather or location requests are made.";
      }
    }

    function applySettings(nextSettings) {
      cancelActiveRequest();
      settings = weather.normalizeWeatherSettings(nextSettings);
      requestGeneration += 1;
      onSettingsChange({ ...settings });
      renderSettings();
      refreshWeatherHintFromCache();
      fetchWeatherText();
    }

    function applySettingsFromControls() {
      applySettings({ mode: modeSelect?.value, city: cityInput?.value });
    }

    function init() {
      updateClockDisplay();
      setInterval(updateClockDisplay, 1000);
      renderSettings();
      modeSelect?.addEventListener("change", () => {
        applySettings({ mode: modeSelect.value, city: cityInput?.value });
      });
      cityInput?.addEventListener("input", () => {
        if (applyButton) applyButton.disabled = !cityInput.value.trim();
      });
      cityInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") applySettingsFromControls();
      });
      applyButton?.addEventListener("click", applySettingsFromControls);
      if (settings.mode !== "off") refreshWeatherHintFromCache();
      setInterval(refreshWeatherHintFromCache, hintRefreshIntervalMs);
      fetchWeatherText();
      setInterval(fetchWeatherText, refreshIntervalMs);
    }

    return {
      applySettings,
      fetchWeatherText,
      getSettings: () => ({ ...settings }),
      init,
      readCachedWeather,
      updateClockDisplay
    };
  }

  const api = { createWeatherController };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiWeatherController = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
