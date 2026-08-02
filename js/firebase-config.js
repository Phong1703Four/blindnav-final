/* ============================================
   Firebase Configuration & Realtime Sync
   BlindNav — Ultimate Edition (Solve for Tomorrow)
   ============================================ */

const FirebaseConfig = {
  // ═══ YOUR FIREBASE CONFIGURATION GOES HERE ═══
  config: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "000000",
    appId: "YOUR_APP_ID"
  },

  app: null,
  db: null,
  isConnected: false,
  deviceId: null, // The 6-digit PIN
  role: null, // 'user' or 'family'
  
  // Listeners dictionary to keep track and cleanup
  activeListeners: {},

  init() {
    if (this.config.apiKey === "YOUR_API_KEY") {
      console.log('⚠️ Firebase not configured. Please add your config in js/firebase-config.js');
      return false;
    }

    try {
      if (typeof firebase === 'undefined') {
        console.warn('⚠️ Firebase SDK missing.');
        return false;
      }
      
      // Initialize only if not already initialized
      if (!firebase.apps.length) {
        this.app = firebase.initializeApp(this.config);
      } else {
        this.app = firebase.app();
      }
      this.db = firebase.database();
      
      // Monitor connection state
      this.db.ref('.info/connected').on('value', (snap) => {
        this.isConnected = snap.val() === true;
        console.log(`🔥 Firebase RTDB: ${this.isConnected ? 'Connected' : 'Disconnected'}`);
        if (this.isConnected && this.deviceId && this.role) {
          this.setupPresence();
        }
      });
      return true;
    } catch (err) {
      console.error('❌ Firebase init error:', err);
      return false;
    }
  },

  /**
   * Pair the device using a 6-digit PIN
   */
  async pairDevice(pin, role) {
    if (!this.db) return false;
    this.deviceId = pin;
    this.role = role;
    
    const deviceRef = this.db.ref(`devices/${this.deviceId}`);
    
    if (role === 'user') {
      // Blind user creates the session
      await deviceRef.set({
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        battery: 100,
        sos_state: 'idle',
        connection_status: 'online',
        last_active: firebase.database.ServerValue.TIMESTAMP
      });
      this.setupPresence();
    } else {
      // Family checks if session exists
      const snap = await deviceRef.once('value');
      if (!snap.exists()) {
        throw new Error('Mã PIN không tồn tại hoặc thiết bị chưa bật.');
      }
    }
    
    // Start listening to critical states
    this.startGlobalListeners();
    return true;
  },

  /**
   * Handle online/offline presence
   */
  setupPresence() {
    if (!this.deviceId || !this.role) return;
    const myPresenceRef = this.db.ref(`devices/${this.deviceId}/presence/${this.role}`);
    
    // Set to offline when disconnected
    myPresenceRef.onDisconnect().set({
      status: 'offline',
      last_changed: firebase.database.ServerValue.TIMESTAMP
    });
    
    // Set to online right now
    myPresenceRef.set({
      status: 'online',
      last_changed: firebase.database.ServerValue.TIMESTAMP
    });
    
    // Also update last_active for the device
    if (this.role === 'user') {
      this.db.ref(`devices/${this.deviceId}/connection_status`).onDisconnect().set('offline');
      this.db.ref(`devices/${this.deviceId}/connection_status`).set('online');
    }
  },

  /**
   * Update device state (GPS, battery, etc.)
   */
  updateState(path, value) {
    if (!this.db || !this.deviceId) return;
    return this.db.ref(`devices/${this.deviceId}/${path}`).set(value);
  },

  /**
   * Send a voice message (base64)
   */
  sendVoiceMessage(base64Audio, duration) {
    if (!this.db || !this.deviceId) return;
    const msgRef = this.db.ref(`devices/${this.deviceId}/voice_messages`).push();
    return msgRef.set({
      sender: this.role,
      audioData: base64Audio,
      duration: duration,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      played: false
    });
  },

  /**
   * Start listening to relevant data nodes
   */
  startGlobalListeners() {
    if (!this.db || !this.deviceId) return;
    const baseRef = this.db.ref(`devices/${this.deviceId}`);

    // Listen to full device state
    this.activeListeners['state'] = baseRef.on('value', (snap) => {
      const data = snap.val();
      if (data && typeof App !== 'undefined' && App.onFirebaseStateUpdate) {
        App.onFirebaseStateUpdate(data);
      }
      if (data && typeof UserApp !== 'undefined' && UserApp.onFirebaseStateUpdate) {
        UserApp.onFirebaseStateUpdate(data);
      }
    });

    // Listen to new voice messages
    this.activeListeners['messages'] = baseRef.child('voice_messages')
      .orderByChild('played').equalTo(false)
      .on('child_added', (snap) => {
        const msg = snap.val();
        if (msg.sender !== this.role) {
          // It's a new message for me
          this.handleIncomingVoiceMessage(snap.key, msg);
        }
      });
  },

  handleIncomingVoiceMessage(key, msg) {
    // Mark as played immediately so it doesn't loop
    this.db.ref(`devices/${this.deviceId}/voice_messages/${key}/played`).set(true);
    
    // Pass to UI/Audio Manager
    if (typeof AudioManager !== 'undefined') {
      AudioManager.playBase64Audio(msg.audioData);
    }
    
    // Trigger toast
    if (typeof App !== 'undefined') {
      App.showToast(`🔊 Tin nhắn thoại mới (${msg.duration}s)`, 'info');
    }
  },

  stopAllListeners() {
    if (!this.db || !this.deviceId) return;
    const baseRef = this.db.ref(`devices/${this.deviceId}`);
    baseRef.off('value', this.activeListeners['state']);
    baseRef.child('voice_messages').off('child_added', this.activeListeners['messages']);
  }
};
