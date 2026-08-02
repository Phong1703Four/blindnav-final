/* ============================================
   BlindNav App Controller — FULL INTERACTIVE
   i18n + Audio Integrated
   ============================================ */

const App = {
  currentTab: 'tracking',
  
  init() {
    // Initialize theme first, then i18n
    if (typeof ThemeManager !== 'undefined') ThemeManager.init();
    if (typeof I18n !== 'undefined') I18n.init();
    this.setupNavigation();
    this.setupSidebarNavigation();
    this.setupHeaderMenu();
    this.setupResizeHandler();
    this.switchTab('tracking');
    this.startGlassesSimulation();
  },

  async connectPairingCode() {
    const code = document.getElementById('family-pairing-input').value.trim();
    if (code.length === 6 && !isNaN(code)) {
      document.getElementById('family-pairing-error').style.display = 'none';
      
      try {
        // Try Firebase (optional — works without config)
        if (typeof FirebaseConfig !== 'undefined') {
          const fbOk = FirebaseConfig.init();
          if (fbOk) {
            await FirebaseConfig.pairDevice(code, 'family');
            console.log('✅ Firebase paired as family');
          }
        }
        
        // Always init PeerJS (primary channel)
        if (typeof BlindNavRTC !== 'undefined') {
          BlindNavRTC.initAsFamily(code);
        }

        // Setup FamilyCallManager callbacks AFTER BlindNavRTC is initialized
        if (typeof FamilyCallManager !== 'undefined') {
          FamilyCallManager.setupCallbacks();
        }
        
        document.getElementById('family-pairing-overlay').style.display = 'none';
        this.showToast(I18n.t('app.statusActive').replace('{name}', 'Bố'), 'success');
      } catch (err) {
        document.getElementById('family-pairing-error').innerText = err.message || 'Lỗi kết nối.';
        document.getElementById('family-pairing-error').style.display = 'block';
      }
    } else {
      document.getElementById('family-pairing-error').innerText = 'Mã không hợp lệ. Vui lòng kiểm tra lại.';
      document.getElementById('family-pairing-error').style.display = 'block';
    }
  },

  // ── Tab Navigation ──
  setupNavigation() {
    document.querySelectorAll('.tab-item').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        if (tabName) this.switchTab(tabName);
      });
    });
  },

  // ── Sidebar Navigation (Desktop) ──
  setupSidebarNavigation() {
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        const tabName = item.dataset.tab;
        if (tabName) this.switchTab(tabName);
      });
    });
  },

  switchTab(tabName) {
    const communityScreen = document.getElementById('screen-community');
    if (communityScreen && tabName !== 'community') {
      communityScreen.classList.remove('active');
    }

    // Remove active from all screens first
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });

    // Sync mobile tab bar
    document.querySelectorAll('.tab-item').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    // Sync desktop sidebar
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tabName);
      if (item.dataset.tab === 'sos' && tabName !== 'sos') {
        item.classList.add('sidebar-sos');
      }
    });

    const targetScreen = document.getElementById(`screen-${tabName}`);
    if (targetScreen) {
      targetScreen.classList.add('active');
      // Smooth animation
      targetScreen.style.animation = 'none';
      targetScreen.offsetHeight; // trigger reflow
      targetScreen.style.animation = 'screenFadeIn 0.4s ease-out';
    }

    this.currentTab = tabName;
    this.onScreenEnter(tabName);
  },

  onScreenEnter(tabName) {
    switch(tabName) {
      case 'tracking': if (typeof TrackingScreen !== 'undefined') TrackingScreen.init(); break;
      case 'routes': if (typeof RoutesScreen !== 'undefined') RoutesScreen.init(); break;
      case 'sos': if (typeof SOSScreen !== 'undefined') SOSScreen.init(); break;
      case 'stats': if (typeof StatsScreen !== 'undefined') StatsScreen.init(); break;
      case 'settings': if (typeof SettingsScreen !== 'undefined') SettingsScreen.init(); break;
      case 'community': if (typeof CommunityScreen !== 'undefined') CommunityScreen.init(); break;
    }
  },

  showCommunityScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(t => t.classList.remove('active'));
    const sidebarCommunity = document.getElementById('sidebar-community');
    if (sidebarCommunity) sidebarCommunity.classList.add('active');
    const cs = document.getElementById('screen-community');
    if (cs) { cs.classList.add('active'); this.currentTab = 'community'; this.onScreenEnter('community'); }
  },

  goBackFromCommunity() { this.switchTab('tracking'); },

  // ── Resize Handler ──
  setupResizeHandler() {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (this.currentTab === 'tracking' && typeof TrackingScreen !== 'undefined' && TrackingScreen.map) {
          TrackingScreen.map.invalidateSize();
        }
        if (this.currentTab === 'community' && typeof CommunityScreen !== 'undefined' && CommunityScreen.map) {
          CommunityScreen.map.invalidateSize();
        }
      }, 250);
    });
  },

  // ── Header Menu ──
  setupHeaderMenu() {
    const menuBtn = document.getElementById('header-menu-btn');
    const phoneBtn = document.getElementById('header-call-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showHeaderMenu();
      });
    }
    if (phoneBtn) {
      phoneBtn.onclick = null;
      phoneBtn.removeAttribute('onclick');
      phoneBtn.addEventListener('click', () => this.simulateCall(BlindNavData.glasses.pairedUser));
    }
  },

  showHeaderMenu() {
    const name = BlindNavData.glasses.pairedUser;
    this.showModal(I18n.t('menu.title'), `
      <div style="padding: 0;">
        <div class="list-item" onclick="App.simulateCall('${name}'); App.closeModal();">
          <div class="list-item-icon" style="background:var(--color-primary-light);">📞</div>
          <div class="list-item-content">
            <div class="list-item-title">${I18n.t('menu.call', { name })}</div>
            <div class="list-item-desc">${I18n.t('menu.callDesc')}</div>
          </div>
        </div>
        <div class="list-item" onclick="App.sendMessage(); App.closeModal();">
          <div class="list-item-icon" style="background:var(--color-success-light);">💬</div>
          <div class="list-item-content">
            <div class="list-item-title">${I18n.t('menu.sendMsg')}</div>
            <div class="list-item-desc">${I18n.t('menu.sendMsgDesc', { name })}</div>
          </div>
        </div>
        <div class="list-item" onclick="SettingsScreen.showMedicalProfile(); App.closeModal();">
          <div class="list-item-icon" style="background:var(--color-danger-light);">🏥</div>
          <div class="list-item-content">
            <div class="list-item-title">${I18n.t('menu.medicalProfile')}</div>
            <div class="list-item-desc">${I18n.t('menu.medicalProfileDesc')}</div>
          </div>
        </div>
        <div class="list-item" onclick="App.shareLocation(); App.closeModal();">
          <div class="list-item-icon" style="background:var(--color-warning-light);">📤</div>
          <div class="list-item-content">
            <div class="list-item-title">${I18n.t('menu.shareLocation')}</div>
            <div class="list-item-desc">${I18n.t('menu.shareLocationDesc')}</div>
          </div>
        </div>
      </div>
    `);
  },

  simulateCall(name) {
    if (typeof AudioManager !== 'undefined') AudioManager.playRingtone();

    this.showModal('', `
      <div style="text-align:center; padding: 40px 20px;">
        <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#1D9E75,#15724F);margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:2rem;animation: pulse-dot 2s infinite;">📞</div>
        <div style="font-size:1.25rem;font-weight:700;margin-bottom:8px;">${I18n.t('call.calling', { name })}</div>
        <div style="color:var(--color-text-secondary);margin-bottom:30px;">${I18n.t('call.viaSpeaker')}</div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button class="btn btn-danger btn-lg" onclick="App.endCall();" style="flex:1;max-width:180px;">
            ${I18n.t('call.end')}
          </button>
        </div>
      </div>
    `, false);
  },

  endCall() {
    if (typeof AudioManager !== 'undefined') {
      AudioManager.stopRingtone();
      AudioManager.playCallEnd();
    }
    this.closeModal();
    this.showToast(I18n.t('app.callEnded'), 'info');
  },

  sendMessage() {
    const name = BlindNavData.glasses.pairedUser;
    this.showModal(I18n.t('msg.title'), `
      <div style="padding: 0 20px 20px;">
        <p style="color:var(--color-text-secondary);margin-bottom:16px;font-size:0.9375rem;">${I18n.t('msg.desc', { name })}</p>
        <textarea id="voice-msg-input" placeholder="${I18n.t('msg.placeholder')}" style="width:100%;height:100px;border:2px solid var(--color-border);border-radius:12px;padding:12px;font-size:1rem;font-family:inherit;resize:none;"></textarea>
        <button class="btn btn-primary btn-block btn-lg" style="margin-top:16px;" onclick="App.doSendMessage();">${I18n.t('msg.send')}</button>
      </div>
    `);
  },

  doSendMessage() {
    const msg = document.getElementById('voice-msg-input')?.value;
    if (msg && msg.trim()) {
      // Send via PeerJS to blind user
      if (typeof BlindNavRTC !== 'undefined') {
        BlindNavRTC.send({
          type: 'text-message',
          sender: 'Con Lan',
          text: msg.trim()
        });
      }
      // Also send via Firebase if available
      if (typeof FirebaseConfig !== 'undefined' && FirebaseConfig.db && FirebaseConfig.deviceId) {
        FirebaseConfig.updateState('text_messages/' + Date.now(), {
          sender: 'family',
          text: msg.trim(),
          timestamp: Date.now()
        });
      }
      // Speak locally
      if (typeof AudioManager !== 'undefined') {
        AudioManager.speak(msg, I18n.currentLang);
      }
      this.closeModal();
      this.showToast(I18n.t('app.msgSent', { name: BlindNavData.glasses.pairedUser }), 'success');
    } else {
      const input = document.getElementById('voice-msg-input');
      if (input) input.style.borderColor = 'var(--color-danger)';
    }
  },

  shareLocation() {
    const loc = BlindNavData.glasses.location;
    const name = BlindNavData.glasses.pairedUser;
    const url = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
    if (navigator.share) {
      navigator.share({ title: I18n.t('app.locationOf', { name }), text: I18n.t('app.isAt', { name }) + loc.address, url: url });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        this.showToast(I18n.t('app.copiedLocation'), 'success');
      }).catch(() => {
        this.showModal(I18n.t('share.title'), `
          <div style="padding:0 20px 20px;">
            <p style="margin-bottom:12px;">${I18n.t('app.isAt', { name })}<strong>${loc.address}</strong></p>
            <input type="text" value="${url}" readonly style="width:100%;padding:12px;border:2px solid var(--color-border);border-radius:8px;font-size:0.875rem;" onclick="this.select()">
            <p style="margin-top:8px;font-size:0.8125rem;color:var(--color-text-tertiary);">${I18n.t('app.tapToCopy')}</p>
          </div>
        `);
      });
    }
  },

  // ── Glasses Simulation ──
  startGlassesSimulation() {
    // Waiting for real GPS data from blind user via PeerJS/Firebase
  },

  // ── SOS Alert ──
  triggerSOS() {
    const overlay = document.getElementById('sos-alert-overlay');
    if (overlay) {
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
      if (typeof AudioManager !== 'undefined') AudioManager.playSOSAlert();
      if (typeof SOSScreen !== 'undefined') SOSScreen.startSOSSequence();
    }
  },

  dismissSOS() {
    const overlay = document.getElementById('sos-alert-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
    if (typeof AudioManager !== 'undefined') AudioManager.stopSOSAlert();
  },

  // ═══════════════════════════════════════
  // DYNAMIC MODAL SYSTEM
  // ═══════════════════════════════════════
  showModal(title, bodyHtml, showHeader = true) {
    let overlay = document.getElementById('dynamic-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'dynamic-modal';
      overlay.className = 'modal-overlay';
      overlay.innerHTML = '<div class="modal-content"></div>';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) App.closeModal();
      });
      document.body.appendChild(overlay);
    }
    const content = overlay.querySelector('.modal-content');
    content.innerHTML = `
      <div class="modal-handle"></div>
      ${showHeader ? `
        <div class="modal-header">
          <div class="modal-title">${title}</div>
          <button class="modal-close" onclick="App.closeModal()">✕</button>
        </div>
      ` : ''}
      <div class="modal-body">${bodyHtml}</div>
    `;
    requestAnimationFrame(() => overlay.classList.add('active'));
  },

  closeModal() {
    const overlay = document.getElementById('dynamic-modal');
    if (overlay) overlay.classList.remove('active');
  },

  // ── Toast ──
  showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    if (typeof AudioManager !== 'undefined') {
      AudioManager.playNotification(type === 'success' ? 'success' : type === 'danger' ? 'danger' : 'info');
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = message;
    toast.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      max-width: 380px; padding: 14px 22px;
      background: ${type === 'success' ? '#1D9E75' : type === 'danger' ? '#E24B4A' : '#1A73E8'};
      color: white; border-radius: 14px; font-size: 0.9375rem; font-weight: 600;
      z-index: 9999; box-shadow: 0 10px 30px rgba(0,0,0,0.25);
      animation: fadeInUp 0.3s ease; text-align: center;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  },

  // ═══════════════════════════════════════
  // FIREBASE REALTIME SYNC
  // ═══════════════════════════════════════
  onFirebaseStateUpdate(data) {
    if (!data) return;

    // Update connection status
    const isOnline = data.connection_status === 'online';
    const statusText = document.getElementById('header-status-text');
    const statusDot = document.getElementById('header-status-dot');
    if (statusText) statusText.textContent = isOnline ? I18n.t('app.statusActive').replace('{name}', 'Bố') : I18n.t('app.statusLost').replace('{name}', 'Bố');
    if (statusDot) {
      statusDot.className = 'status-dot';
      if (isOnline) statusDot.classList.add('active');
    }

    // Update Battery
    if (data.battery !== undefined) {
      const batFill = document.getElementById('battery-fill');
      const batVal = document.getElementById('battery-value');
      const sidebarBat = document.getElementById('sidebar-battery');
      if (batFill) batFill.style.width = data.battery + '%';
      if (batVal) batVal.textContent = data.battery + '%';
      if (sidebarBat) sidebarBat.textContent = data.battery + '%';
    }

    // Update Location
    if (data.location) {
      if (typeof TrackingScreen !== 'undefined' && TrackingScreen.map) {
        TrackingScreen.updateGlassesLocation(data.location.lat, data.location.lng, data.location.heading || 0);
      }
      const addressEl = document.getElementById('current-address');
      const speedEl = document.getElementById('current-speed');
      if (addressEl) addressEl.textContent = data.location.address || `${data.location.lat}, ${data.location.lng}`;
      if (speedEl) speedEl.textContent = `🚶 ${data.location.speed || 0} km/h · Hướng: ${data.location.heading || 0}°`;
    }

    // Update SOS state
    if (data.sos_state) {
      if (data.sos_state === 'active') {
        this.triggerSOS();
      } else if (data.sos_state === 'idle' || data.sos_state === 'resolved') {
        this.dismissSOS();
      }
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
