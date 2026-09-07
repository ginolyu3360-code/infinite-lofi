const test = require("node:test");
const assert = require("node:assert/strict");

const weather = require("../src/weather");
const { createWeatherController } = require("../src/weather-controller");

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

test("keeps weather network access disabled when weather is off", async () => {
  let requestCount = 0;
  const statusWeather = { textContent: "" };
  const controller = createWeatherController({
    storage: createMemoryStorage(),
    statusWeather,
    weather,
    initialSettings: { mode: "off" },
    fetch: async () => {
      requestCount += 1;
      throw new Error("weather should not request the network while off");
    },
    retryDelaysMs: [0]
  });

  await controller.fetchWeatherText();
  assert.equal(requestCount, 0);
  assert.equal(statusWeather.textContent, "Weather off");
});

test("city weather uses Open-Meteo without IP geolocation", async () => {
  const requestedUrls = [];
  const statusWeather = { textContent: "" };
  const controller = createWeatherController({
    storage: createMemoryStorage(),
    statusWeather,
    weather,
    initialSettings: { mode: "city", city: "Hong Kong" },
    fetch: async (url) => {
      requestedUrls.push(url);
      if (url.startsWith("https://geocoding-api.open-meteo.com/")) {
        return {
          ok: true,
          json: async () => ({
            results: [{ name: "Hong Kong", country: "China", latitude: 22.3, longitude: 114.2 }]
          })
        };
      }
      return {
        ok: true,
        json: async () => ({ current: { temperature_2m: 28.4, weather_code: 1 } })
      };
    },
    retryDelaysMs: [0]
  });

  await controller.fetchWeatherText();
  assert.equal(requestedUrls.length, 2);
  assert.equal(requestedUrls.some((url) => url.includes("ipapi.co")), false);
  assert.match(statusWeather.textContent, /Hong Kong, China: Partly Cloudy 28°C/);
});
