/* ============================================
   BlindNav Theme Manager
   Giao diện Sáng / Tối
   ============================================ */

const ThemeManager = {
  STORAGE_KEY: 'blindnav-theme',

  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      this.set(saved, false);
    } else {
      // Force dark mode as default for the new dashboard
      this.set('dark', false);
    }

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved === 'system') {
        this.set(e.matches ? 'dark' : 'light', false);
      }
    });

    this._updateToggleIcon();
  },

  get() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  },

  set(theme, save = true) {
    document.documentElement.setAttribute('data-theme', theme);
    if (save) {
      localStorage.setItem(this.STORAGE_KEY, theme);
    }
    this._updateToggleIcon();
    // Update meta theme-color for mobile browsers
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme === 'dark' ? '#0F1117' : '#FFFFFF';
  },

  toggle() {
    const current = this.get();
    const next = current === 'dark' ? 'light' : 'dark';
    this.set(next);
    return next;
  },

  setSystem() {
    localStorage.setItem(this.STORAGE_KEY, 'system');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.set(prefersDark ? 'dark' : 'light', false);
    localStorage.setItem(this.STORAGE_KEY, 'system');
  },

  getPreference() {
    return localStorage.getItem(this.STORAGE_KEY) || 'system';
  },

  isDark() {
    return this.get() === 'dark';
  },

  _updateToggleIcon() {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      const isDark = this.isDark();
      btn.textContent = isDark ? '☀️' : '🌙';
      btn.title = isDark 
        ? ((typeof I18n !== 'undefined' && I18n.currentLang === 'en') ? 'Light mode' : 'Chế độ sáng')
        : ((typeof I18n !== 'undefined' && I18n.currentLang === 'en') ? 'Dark mode' : 'Chế độ tối');
    }
  }
};
