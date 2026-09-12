(function exposeInfiniteLofiWeather(globalScope) {
  const WEATHER_MODES = ["off", "auto", "city"];

  function normalizeWeatherSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const mode = WEATHER_MODES.includes(source.mode) ? source.mode : "off";
    const city = typeof source.city === "string"
      ? source.city.replace(/\s+/g, " ").trim().slice(0, 80)
      : "";
    return { mode, city };
  }

  function buildForecastUrl(latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new TypeError("Valid latitude and longitude are required");
    }
    return `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,weather_code&timezone=auto`;
  }

  function buildGeocodingUrl(city, language = "en") {
    const normalized = normalizeWeatherSettings({ mode: "city", city }).city;
    if (!normalized) {
      throw new TypeError("A city is required");
    }
    const normalizedLanguage = typeof language === "string" && language ? language.split("-")[0] : "en";
    return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(normalized)}&count=1&language=${encodeURIComponent(normalizedLanguage)}&format=json`;
  }

  function weatherCodeToKey(code) {
    if (code === 0) return "clear";
    if ([1, 2].includes(code)) return "partlyCloudy";
    if (code === 3) return "cloudy";
    if ([45, 48].includes(code)) return "fog";
    if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
    if ([95, 96, 99].includes(code)) return "thunderstorm";
    return "unknown";
  }

  function weatherCodeToText(code) {
    return ({ clear: "Clear", partlyCloudy: "Partly Cloudy", cloudy: "Cloudy", fog: "Fog", drizzle: "Drizzle", rain: "Rain", snow: "Snow", thunderstorm: "Thunderstorm", unknown: "Unknown" })[weatherCodeToKey(code)];
  }

  function sanitizeWeatherText(rawText, htmlToText) {
    if (typeof rawText !== "string") {
      return "";
    }
    let text = rawText.trim();
    if (!text) {
      return "";
    }

    const htmlLike = /<!doctype|<html|<head|<body|<style|<script|<div|<span|<pre/i.test(text);
    if (htmlLike) {
      if (typeof htmlToText !== "function") {
        return "";
      }
      try {
        text = String(htmlToText(text) || "").trim();
      } catch {
        return "";
      }
    }

    const candidates = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const weatherLine = candidates.find((line) => /°\s*[CF]|[+\-]?\d+\s*°/.test(line));
    const picked = weatherLine || candidates[0] || "";
    return picked && picked.length <= 120 ? picked : "";
  }

  function formatUpdatedAgo(updatedAt, now = Date.now()) {
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
      return "";
    }
    const minutes = Math.floor(Math.max(0, now - updatedAt) / (60 * 1000));
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    const date = new Date(updatedAt);
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  }

  const api = {
    WEATHER_MODES,
    buildForecastUrl,
    buildGeocodingUrl,
    formatUpdatedAgo,
    normalizeWeatherSettings,
    sanitizeWeatherText,
    weatherCodeToKey,
    weatherCodeToText
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiWeather = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
