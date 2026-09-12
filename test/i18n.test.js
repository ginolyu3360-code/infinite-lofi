const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ENGLISH,
  SUPPORTED_LANGUAGES,
  TRANSLATIONS,
  createI18n,
  normalizeLanguage
} = require("../src/i18n");

test("supports the seven requested display languages", () => {
  assert.deepEqual(
    SUPPORTED_LANGUAGES.map(({ code }) => code),
    ["zh-CN", "zh-TW", "en", "ja", "fr", "ko", "es"]
  );
  for (const { code } of SUPPORTED_LANGUAGES) {
    assert.deepEqual(Object.keys(TRANSLATIONS[code]).sort(), Object.keys(ENGLISH).sort());
  }
});

test("normalizes regional language aliases and falls back safely", () => {
  assert.equal(normalizeLanguage("zh-Hant"), "zh-TW");
  assert.equal(normalizeLanguage("zh_SG"), "zh-CN");
  assert.equal(normalizeLanguage("fr-CA"), "fr");
  assert.equal(normalizeLanguage("de"), "en");
});

test("switches text, locale, interpolation, and document language immediately", () => {
  const textNode = { dataset: { i18n: "keys.language" }, textContent: "" };
  const titleNode = {
    dataset: { i18nTitle: "nav.openKeys" },
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  const documentElement = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  const root = {
    documentElement,
    querySelectorAll(selector) {
      return {
        "[data-i18n]": [textNode],
        "[data-i18n-title]": [titleNode],
        "[data-i18n-aria-label]": [],
        "[data-i18n-placeholder]": []
      }[selector] || [];
    }
  };
  const language = createI18n("en");
  language.setLanguage("ja");
  language.applyDocument(root);
  assert.equal(documentElement.attributes.lang, "ja");
  assert.equal(textNode.textContent, "表示言語");
  assert.equal(titleNode.attributes.title, "キーボードショートカットを開く");
  assert.equal(language.getLocale(), "ja");
  assert.equal(language.t("tasks.capacity", { count: 4, max: 100 }), "4 / 100 タスク");
});

test("keeps native language names stable in every interface language", () => {
  assert.deepEqual(
    SUPPORTED_LANGUAGES.map(({ label }) => label),
    ["简体中文", "繁體中文", "English", "日本語", "Français", "한국어", "Español"]
  );
});
