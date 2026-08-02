const fs = require('fs');
const path = require('path');

const i18nContent = fs.readFileSync(path.join(__dirname, 'js/i18n.js'), 'utf8');

// A bit hacky but it works to extract the object:
const sandbox = {};
// Evaluate the I18n object
eval(i18nContent + '\n sandbox.I18n = I18n;');

const translations = sandbox.I18n.translations;

const localesDir = path.join(__dirname, 'locales');
if (!fs.existsSync(localesDir)) {
  fs.mkdirSync(localesDir);
}

const langs = ['vi', 'en', 'ru', 'es', 'hi', 'zh', 'ko', 'ja'];

langs.forEach(lang => {
  // If we have it, use it. Otherwise, use English as fallback for now
  let data = translations[lang];
  if (!data) {
    data = translations['en'];
  }
  
  fs.writeFileSync(
    path.join(localesDir, `${lang}.json`),
    JSON.stringify(data, null, 2),
    'utf8'
  );
  console.log(`Created ${lang}.json`);
});

console.log('All locales generated.');
