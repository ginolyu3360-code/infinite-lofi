(function exposeInfiniteLofiWeather(globalScope) {
  function weatherCodeToText(code) {
    if (code === 0) return "Clear";
    if ([1, 2].includes(code)) return "Partly Cloudy";
    if (code === 3) return "Cloudy";
    if ([45, 48].includes(code)) return "Fog";
    if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
    if ([95, 96, 99].includes(code)) return "Thunderstorm";
    return "Unknown";
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

  const api = { formatUpdatedAgo, sanitizeWeatherText, weatherCodeToText };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiWeather = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
