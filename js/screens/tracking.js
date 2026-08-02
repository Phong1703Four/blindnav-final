/* ============================================
   Màn hình 1 — Theo dõi GPS — FULL INTERACTIVE
   i18n Integrated
   ============================================ */

const TrackingScreen = {
  map: null,
  marker: null,
  pathLine: null,
  activeRouteLine: null,
  activeRouteLandmarks: [],
  initialized: false,

  init() {
    if (!this.initialized) {
      this.initMap();
      this.renderStatusBar();
      this.renderLocationInfo();
      this.setupQuickActions();
      this.initialized = true;
    }
    this.updateStatusHeader();
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 300);
  },

  setupQuickActions() {
    document.getElementById('qa-active-route')?.addEventListener('click', () => this.showActiveRoute());
    document.getElementById('qa-history')?.addEventListener('click', () => this.showTodayHistory());
    document.getElementById('qa-geofence')?.addEventListener('click', () => this.showGeofenceEditor());
    // Connection lost banner contact button
    document.getElementById('connection-lost-contact-btn')?.addEventListener('click', () => {
      App.simulateCall(BlindNavData.glasses.pairedUser);
    });
  },

  initMap() {
    const mapEl = document.getElementById('tracking-map');
    if (!mapEl || this.map) return;
    const loc = BlindNavData.glasses.location;
    this.map = L.map('tracking-map', { zoomControl: false, attributionControl: false }).setView([loc.lat, loc.lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(this.map);

    const personIcon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="width:40px;height:40px;background:linear-gradient(135deg,#1A73E8,#0D47A1);border-radius:50%;border:3px solid white;box-shadow:0 4px 12px rgba(26,115,232,0.4);display:flex;align-items:center;justify-content:center;font-size:18px;color:white;">👤</div>`,
      iconSize: [40, 40], iconAnchor: [20, 20]
    });
    this.marker = L.marker([loc.lat, loc.lng], { icon: personIcon }).addTo(this.map);
    const trailCoords = BlindNavData.gpsTrail.map(p => [p.lat, p.lng]);
    this.pathLine = L.polyline(trailCoords, { color: '#1A73E8', weight: 4, opacity: 0.35, dashArray: '8, 8' }).addTo(this.map);

    BlindNavData.geofences.forEach(geo => {
      const circle = L.circle([geo.lat, geo.lng], { radius: geo.radius, color: '#1A73E8', fillColor: '#1A73E8', fillOpacity: 0.07, weight: 2, dashArray: '6, 4' }).addTo(this.map);
      circle._geoId = geo.id;
    });

    document.getElementById('map-center-btn')?.addEventListener('click', () => {
      const l = BlindNavData.glasses.location;
      this.map.setView([l.lat, l.lng], 16, { animate: true });
    });
    document.getElementById('community-fab-btn')?.addEventListener('click', () => App.showCommunityScreen());
  },

  updatePosition(loc) {
    if (this.marker) this.marker.setLatLng([loc.lat, loc.lng]);
    if (this.pathLine) {
      const coords = this.pathLine.getLatLngs();
      coords.push(L.latLng(loc.lat, loc.lng));
      if (coords.length > 100) coords.shift();
      this.pathLine.setLatLngs(coords);
    }
    // Automatically pan the map to the real location of the blind user
    if (this.map) {
      this.map.setView([loc.lat, loc.lng], 16, { animate: true });
    }
    this.renderStatusBar();
    this.renderLocationInfo();
    this.updateStatusHeader();
  },

  updateStatusHeader() {
    const status = BlindNavData.glasses.status;
    const name = BlindNavData.glasses.pairedUser;
    const dot = document.getElementById('header-status-dot');
    const text = document.getElementById('header-status-text');
    if (!dot || !text) return;
    dot.className = 'status-dot';
    if (status.connectionStatus === 'active') { dot.classList.add('active'); text.textContent = I18n.t('app.statusActive', { name }); }
    else if (status.connectionStatus === 'off') { dot.classList.add('offline'); text.textContent = I18n.t('app.statusOff', { name }); }
    else { dot.classList.add('lost'); text.textContent = I18n.t('app.statusLost', { name }); }
  },

  renderStatusBar() {
    const status = BlindNavData.glasses.status;
    const battery = Math.round(status.battery);
    
    // Update sidebar battery
    const sidebarBatteryText = document.getElementById('sidebar-battery-text');
    const sidebarBatteryFill = document.getElementById('sidebar-battery-fill');
    if (sidebarBatteryText) sidebarBatteryText.textContent = `${battery}%`;
    if (sidebarBatteryFill) {
      sidebarBatteryFill.style.width = `${battery}%`;
      sidebarBatteryFill.style.backgroundColor = battery < 20 ? '#FF6B6B' : '#4ADE80';
    }

    // Update top bar battery
    const topBatteryText = document.getElementById('top-battery-text');
    if (topBatteryText) {
      topBatteryText.textContent = `🔋 ${battery}%`;
      topBatteryText.style.color = battery < 20 ? '#FF6B6B' : '#4ADE80';
    }

    // Update top bar signal
    const topSignalText = document.getElementById('top-signal-text');
    if (topSignalText) {
      const signalMap = { good: 'tracking.signalGood', medium: 'tracking.signalMedium', weak: 'tracking.signalWeak', lost: 'tracking.signalLost' };
      const sigColorMap = { good: '#4ADE80', medium: '#FBBF24', weak: '#FF6B6B', lost: '#FF4B4B' };
      topSignalText.textContent = `📶 ${I18n.t(signalMap[status.signal] || 'tracking.signalGood')}`;
      topSignalText.style.color = sigColorMap[status.signal] || '#4ADE80';
    }
  },

  renderLocationInfo() {
    const loc = BlindNavData.glasses.location;
    const addressEl = document.getElementById('current-address');
    const speedEl = document.getElementById('current-speed');
    const timeEl = document.getElementById('time-outside');
    if (addressEl) addressEl.textContent = loc.address;
    if (speedEl) speedEl.textContent = I18n.t('tracking.speedInfo', { speed: loc.speed, heading: loc.heading });
    if (timeEl) timeEl.textContent = I18n.t('tracking.timeOutsideInfo', { time: loc.timeOutside });
  },

  // ═══════ INTERACTIVE: Show Active Route on Map ═══════
  showActiveRoute() {
    const route = BlindNavData.routes[0]; // First route is active
    // Clear previous
    if (this.activeRouteLine) { this.map.removeLayer(this.activeRouteLine); }
    this.activeRouteLandmarks.forEach(m => this.map.removeLayer(m));
    this.activeRouteLandmarks = [];

    const coords = route.waypoints.map(w => [w.lat, w.lng]);
    this.activeRouteLine = L.polyline(coords, { color: route.color, weight: 5, opacity: 0.8 }).addTo(this.map);

    route.landmarks.forEach(lm => {
      const icon = L.divIcon({
        className: 'lm-marker',
        html: `<div style="width:28px;height:28px;background:${lm.alertLevel === 'warning' ? '#F59E0B' : '#1A73E8'};border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:13px;">${lm.alertLevel === 'warning' ? '⚠️' : 'ℹ️'}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14]
      });
      const m = L.marker([lm.lat, lm.lng], { icon }).addTo(this.map).bindPopup(`<b>${lm.note}</b><br>${I18n.t('tracking.alertBefore', { m: lm.alertDistance })}`);
      this.activeRouteLandmarks.push(m);
    });

    // Add start/end
    const startIcon = L.divIcon({ className:'', html:`<div style="width:24px;height:24px;background:#1D9E75;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;color:white;font-weight:700;">A</div>`, iconSize:[24,24], iconAnchor:[12,12] });
    const endIcon = L.divIcon({ className:'', html:`<div style="width:24px;height:24px;background:#E24B4A;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;color:white;font-weight:700;">B</div>`, iconSize:[24,24], iconAnchor:[12,12] });
    this.activeRouteLandmarks.push(L.marker(coords[0], { icon: startIcon }).addTo(this.map));
    this.activeRouteLandmarks.push(L.marker(coords[coords.length - 1], { icon: endIcon }).addTo(this.map));

    this.map.fitBounds(this.activeRouteLine.getBounds(), { padding: [40, 40] });

    App.showModal(I18n.t('tracking.routeModal', { name: route.name }), `
      <div style="padding:0 20px 20px;">
        <div style="display:flex;gap:16px;margin-bottom:16px;">
          <div style="flex:1;text-align:center;padding:12px;background:var(--color-bg);border-radius:12px;">
            <div style="font-size:1.5rem;font-weight:800;color:var(--color-primary);">${route.distance}</div>
            <div style="font-size:0.75rem;color:var(--color-text-secondary);">${I18n.t('tracking.km')}</div>
          </div>
          <div style="flex:1;text-align:center;padding:12px;background:var(--color-bg);border-radius:12px;">
            <div style="font-size:1.5rem;font-weight:800;color:var(--color-success);">~${route.duration}</div>
            <div style="font-size:0.75rem;color:var(--color-text-secondary);">${I18n.t('tracking.minutes')}</div>
          </div>
          <div style="flex:1;text-align:center;padding:12px;background:var(--color-bg);border-radius:12px;">
            <div style="font-size:1.5rem;font-weight:800;color:var(--color-warning);">${route.landmarks.length}</div>
            <div style="font-size:0.75rem;color:var(--color-text-secondary);">${I18n.t('tracking.landmarks')}</div>
          </div>
        </div>
        <p style="font-size:0.875rem;color:var(--color-text-secondary);margin-bottom:16px;">${I18n.t('tracking.routeShowing')}</p>
        <button class="btn btn-outline btn-block" onclick="TrackingScreen.hideActiveRoute(); App.closeModal();">${I18n.t('tracking.hideRoute')}</button>
      </div>
    `);
  },

  hideActiveRoute() {
    if (this.activeRouteLine) { this.map.removeLayer(this.activeRouteLine); this.activeRouteLine = null; }
    this.activeRouteLandmarks.forEach(m => this.map.removeLayer(m));
    this.activeRouteLandmarks = [];
    const loc = BlindNavData.glasses.location;
    this.map.setView([loc.lat, loc.lng], 16, { animate: true });
  },

  // ═══════ INTERACTIVE: Today's History Timeline ═══════
  showTodayHistory() {
    const events = [
      { time: '07:30', icon: '🏠', title: I18n.t('tracking.historyLeaveHome'), desc: I18n.t('tracking.homeZone') },
      { time: '07:48', icon: '🚶', title: I18n.t('tracking.historyWalkOn'), desc: I18n.t('tracking.walkObstacles', { km: '0.6', count: 4 }) },
      { time: '08:05', icon: '🏪', title: I18n.t('tracking.historyArrive'), desc: I18n.t('tracking.historyStay', { min: 25 }) },
      { time: '08:30', icon: '🚶', title: I18n.t('tracking.historyLeaveMarket'), desc: I18n.t('tracking.historyRedLight', { km: '0.5', count: 2 }) },
      { time: '08:50', icon: '💊', title: I18n.t('tracking.historyPharmacy'), desc: I18n.t('tracking.historyStay', { min: 10 }) },
      { time: '09:05', icon: '🏠', title: I18n.t('tracking.historyReturnHome'), desc: I18n.t('tracking.historyTotal', { km: '1.4', min: 95 }) },
      { time: '14:00', icon: '🏠', title: I18n.t('tracking.historyLeave2'), desc: I18n.t('tracking.homeZone') },
      { time: '14:15', icon: '📍', title: I18n.t('tracking.historyCurrentPos'), desc: BlindNavData.glasses.location.address }
    ];

    let html = '<div style="padding: 0 20px 20px;">';
    html += `<div style="font-size:0.8125rem;color:var(--color-text-tertiary);margin-bottom:16px;">${I18n.t('tracking.todayDate', { date: new Date().toLocaleDateString(I18n.currentLang === 'vi' ? 'vi-VN' : 'en-US') })}</div>`;
    events.forEach((ev, i) => {
      const isLast = i === events.length - 1;
      html += `
        <div style="display:flex;gap:12px;position:relative;">
          <div style="display:flex;flex-direction:column;align-items:center;width:40px;flex-shrink:0;">
            <div style="font-size:0.6875rem;font-weight:600;color:var(--color-text-secondary);margin-bottom:4px;">${ev.time}</div>
            <div style="width:32px;height:32px;border-radius:50%;background:${isLast ? 'var(--color-primary)' : 'var(--color-bg)'};display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">${ev.icon}</div>
            ${!isLast ? '<div style="width:2px;flex:1;background:var(--color-border-light);margin:4px 0;"></div>' : ''}
          </div>
          <div style="flex:1;padding-bottom:${isLast ? '0' : '16px'};">
            <div style="font-weight:600;font-size:0.9375rem;${isLast ? 'color:var(--color-primary);' : ''}">${ev.title}</div>
            <div style="font-size:0.8125rem;color:var(--color-text-secondary);">${ev.desc}</div>
          </div>
        </div>
      `;
    });
    html += '</div>';

    App.showModal(I18n.t('tracking.historyTitle'), html);
  },

  // ═══════ INTERACTIVE: Geofence Editor ═══════
  showGeofenceEditor() {
    let geoHtml = '<div style="padding: 0 20px 20px;">';
    geoHtml += `<p style="font-size:0.875rem;color:var(--color-text-secondary);margin-bottom:16px;">${I18n.t('tracking.geoDesc')}</p>`;

    BlindNavData.geofences.forEach((geo, i) => {
      const actionText = geo.action === 'notify_and_call' ? I18n.t('tracking.geoActionNotifyCall') : I18n.t('tracking.geoActionNotify');
      geoHtml += `
        <div style="background:var(--color-bg);border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid var(--color-border-light);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="font-weight:600;font-size:1rem;">🛡️ ${geo.name}</div>
            <label class="toggle-switch" style="transform:scale(0.85);">
              <input type="checkbox" ${geo.enabled ? 'checked' : ''} onchange="TrackingScreen.toggleGeofence('${geo.id}', this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div style="font-size:0.8125rem;color:var(--color-text-secondary);">${I18n.t('tracking.geoRadius', { r: geo.radius })}</div>
          <div style="font-size:0.8125rem;color:var(--color-text-secondary);">${I18n.t('tracking.geoAction', { action: actionText })}</div>
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-outline" style="flex:1;height:36px;font-size:0.8125rem;" onclick="TrackingScreen.editGeofence('${geo.id}')">${I18n.t('tracking.geoEdit')}</button>
            <button class="btn btn-outline" style="flex:1;height:36px;font-size:0.8125rem;color:var(--color-danger);border-color:var(--color-danger);" onclick="TrackingScreen.removeGeofence('${geo.id}')">${I18n.t('tracking.geoDelete')}</button>
          </div>
        </div>
      `;
    });

    geoHtml += `<button class="btn btn-primary btn-block btn-lg" onclick="TrackingScreen.addNewGeofence()">${I18n.t('tracking.geoAdd')}</button>`;
    geoHtml += '</div>';

    App.showModal(I18n.t('geofence.title'), geoHtml);
  },

  toggleGeofence(id, enabled) {
    const geo = BlindNavData.geofences.find(g => g.id === id);
    if (geo) {
      geo.enabled = enabled;
      App.showToast(enabled ? I18n.t('tracking.geoEnabled') : I18n.t('tracking.geoDisabled'), enabled ? 'success' : 'info');
    }
  },

  editGeofence(id) {
    const geo = BlindNavData.geofences.find(g => g.id === id);
    if (!geo) return;

    App.showModal(I18n.t('tracking.geoEditTitle', { name: geo.name }), `
      <div style="padding: 0 20px 20px;">
        <label style="display:block;margin-bottom:12px;">
          <span style="font-size:0.875rem;font-weight:600;display:block;margin-bottom:6px;">${I18n.t('tracking.geoNameLabel')}</span>
          <input type="text" id="geo-name-input" value="${geo.name}" style="width:100%;padding:12px;border:2px solid var(--color-border);border-radius:10px;font-size:1rem;">
        </label>
        <label style="display:block;margin-bottom:12px;">
          <span style="font-size:0.875rem;font-weight:600;display:block;margin-bottom:6px;">${I18n.t('tracking.geoRadiusLabel')}</span>
          <input type="range" id="geo-radius-input" min="100" max="5000" step="100" value="${geo.radius}" 
            oninput="document.getElementById('geo-radius-display').textContent=this.value+'m'"
            style="width:100%;accent-color:var(--color-primary);">
          <div style="text-align:center;font-weight:700;color:var(--color-primary);font-size:1.125rem;" id="geo-radius-display">${geo.radius}m</div>
        </label>
        <label style="display:block;margin-bottom:20px;">
          <span style="font-size:0.875rem;font-weight:600;display:block;margin-bottom:6px;">${I18n.t('tracking.geoWhenLeave')}</span>
          <select id="geo-action-input" style="width:100%;padding:12px;border:2px solid var(--color-border);border-radius:10px;font-size:1rem;">
            <option value="notify" ${geo.action === 'notify' ? 'selected' : ''}>${I18n.t('tracking.geoActionNotify')}</option>
            <option value="notify_and_call" ${geo.action === 'notify_and_call' ? 'selected' : ''}>${I18n.t('tracking.geoActionNotifyCall')}</option>
          </select>
        </label>
        <button class="btn btn-primary btn-block btn-lg" onclick="TrackingScreen.saveGeofence('${geo.id}')">${I18n.t('common.save')}</button>
      </div>
    `);
  },

  saveGeofence(id) {
    const geo = BlindNavData.geofences.find(g => g.id === id);
    if (!geo) return;
    geo.name = document.getElementById('geo-name-input')?.value || geo.name;
    geo.radius = parseInt(document.getElementById('geo-radius-input')?.value) || geo.radius;
    geo.action = document.getElementById('geo-action-input')?.value || geo.action;
    App.closeModal();
    App.showToast(I18n.t('tracking.geoSaved'), 'success');
    // Refresh map circles
    this.refreshGeofenceCircles();
  },

  removeGeofence(id) {
    const idx = BlindNavData.geofences.findIndex(g => g.id === id);
    if (idx > -1) {
      BlindNavData.geofences.splice(idx, 1);
      App.closeModal();
      App.showToast(I18n.t('tracking.geoDeleted'), 'info');
      this.refreshGeofenceCircles();
    }
  },

  addNewGeofence() {
    App.showModal(I18n.t('tracking.geoAddTitle'), `
      <div style="padding: 0 20px 20px;">
        <p style="font-size:0.875rem;color:var(--color-text-secondary);margin-bottom:16px;">${I18n.t('tracking.geoAddDesc')}</p>
        <label style="display:block;margin-bottom:12px;">
          <span style="font-size:0.875rem;font-weight:600;display:block;margin-bottom:6px;">${I18n.t('tracking.geoNameLabel')}</span>
          <input type="text" id="new-geo-name" placeholder="${I18n.t('tracking.geoNewName')}" style="width:100%;padding:12px;border:2px solid var(--color-border);border-radius:10px;font-size:1rem;">
        </label>
        <label style="display:block;margin-bottom:12px;">
          <span style="font-size:0.875rem;font-weight:600;display:block;margin-bottom:6px;">${I18n.t('tracking.geoRadiusLabel')}</span>
          <input type="range" id="new-geo-radius" min="100" max="5000" step="100" value="500"
            oninput="document.getElementById('new-geo-radius-val').textContent=this.value+'m'"
            style="width:100%;accent-color:var(--color-primary);">
          <div style="text-align:center;font-weight:700;color:var(--color-primary);" id="new-geo-radius-val">500m</div>
        </label>
        <label style="display:block;margin-bottom:20px;">
          <span style="font-size:0.875rem;font-weight:600;display:block;margin-bottom:6px;">${I18n.t('tracking.geoActionLabel')}</span>
          <select id="new-geo-action" style="width:100%;padding:12px;border:2px solid var(--color-border);border-radius:10px;font-size:1rem;">
            <option value="notify">${I18n.t('tracking.geoActionNotify')}</option>
            <option value="notify_and_call">${I18n.t('tracking.geoActionNotifyCall')}</option>
          </select>
        </label>
        <button class="btn btn-primary btn-block btn-lg" onclick="TrackingScreen.saveNewGeofence()">✅ ${I18n.t('tracking.geoAdd')}</button>
      </div>
    `);
  },

  saveNewGeofence() {
    const name = document.getElementById('new-geo-name')?.value || I18n.t('tracking.geoNewName');
    const radius = parseInt(document.getElementById('new-geo-radius')?.value) || 500;
    const action = document.getElementById('new-geo-action')?.value || 'notify';
    BlindNavData.geofences.push({
      id: 'geo_' + Date.now(),
      name: name,
      lat: BlindNavData.glasses.location.lat,
      lng: BlindNavData.glasses.location.lng,
      radius: radius,
      action: action,
      enabled: true
    });
    App.closeModal();
    App.showToast(I18n.t('tracking.geoCreated', { name }), 'success');
    this.refreshGeofenceCircles();
  },

  refreshGeofenceCircles() {
    if (!this.map) return;
    // Remove old circles
    this.map.eachLayer(layer => { if (layer instanceof L.Circle) this.map.removeLayer(layer); });
    // Add new
    BlindNavData.geofences.forEach(geo => {
      if (geo.enabled) {
        L.circle([geo.lat, geo.lng], { radius: geo.radius, color: '#1A73E8', fillColor: '#1A73E8', fillOpacity: 0.07, weight: 2, dashArray: '6, 4' }).addTo(this.map);
      }
    });
  }
};
