/* ============================================
   BlindNav i18n — Internationalization
   8 Languages Support
   ============================================ */

const I18n = {
  STORAGE_KEY: 'blindnav-lang',
  currentLang: 'vi',
  translations: {}, // Will be populated dynamically

  availableLangs: [
    { code: 'vi', name: '🇻🇳 Tiếng Việt' },
    { code: 'en', name: '🇬🇧 English' },
    { code: 'ru', name: '🇷🇺 Русский' },
    { code: 'es', name: '🇪🇸 Español' },
    { code: 'hi', name: '🇮🇳 हिन्दी' },
    { code: 'zh', name: '🇨🇳 中文' },
    { code: 'ko', name: '🇰🇷 한국어' },
    { code: 'ja', name: '🇯🇵 日本語' }
  ],

  async init() {
    // Determine language from localStorage or browser settings
    const savedLang = localStorage.getItem(this.STORAGE_KEY);
    if (savedLang && this.availableLangs.some(l => l.code === savedLang)) {
      this.currentLang = savedLang;
    } else {
      const browserLang = navigator.language.slice(0, 2);
      if (this.availableLangs.some(l => l.code === browserLang)) {
        this.currentLang = browserLang;
      }
    }

    await this.loadTranslations(this.currentLang);
    this.translatePage();
    this.setupLanguageSelector();
    return true;
  },

  async loadTranslations(langCode) {
    try {
      const response = await fetch(`locales/${langCode}.json`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      this.translations = await response.json();
      this.currentLang = langCode;
      localStorage.setItem(this.STORAGE_KEY, langCode);
    } catch (error) {
      console.error('Failed to load translations:', error);
      // Fallback to english if something fails
      if (langCode !== 'en') {
        await this.loadTranslations('en');
      }
    }
  },

  async setLanguage(langCode) {
    if (langCode === this.currentLang) return;
    await this.loadTranslations(langCode);
    this.translatePage();
    
    // Update voice settings UI to match new lang
    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast(this.t('langSelect.set').replace('{lang}', langCode.toUpperCase()), 'success');
    }
  },

  t(key) {
    return this.translations[key] || key;
  },

  translatePage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (this.translations[key]) {
        el.innerHTML = this.translations[key];
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (this.translations[key]) {
        el.placeholder = this.translations[key];
      }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (this.translations[key]) {
        el.title = this.translations[key];
      }
    });
  },

  setupLanguageSelector() {
    const container = document.getElementById('language-selector-container');
    if (!container) return;

    let html = `<select id="app-language-select" class="premium-select">`;
    this.availableLangs.forEach(lang => {
      html += `<option value="${lang.code}" ${this.currentLang === lang.code ? 'selected' : ''}>${lang.name}</option>`;
    });
    html += `</select>`;

    container.innerHTML = html;
    
    document.getElementById('app-language-select').addEventListener('change', (e) => {
      this.setLanguage(e.target.value);
    });
  }
};
