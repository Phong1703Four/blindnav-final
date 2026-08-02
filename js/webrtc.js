/* ============================================
   BlindNav WebRTC + PeerJS
   Liên lạc thời gian thực giữa 2 thiết bị (Internet)
   Samsung Solve for Tomorrow 2026
   ============================================ */

const BlindNavRTC = {
  // ── State ──
  peer: null,
  conn: null, // DataConnection
  callObj: null, // MediaConnection for Audio/Video call
  cameraCallObj: null, // MediaConnection for Camera feed
  localStream: null,
  remoteStream: null,
  role: null, // 'user' (blind) or 'family'
  myId: null,
  targetId: null,
  callState: 'idle', // idle | calling | ringing | connected | ended
  callTimer: null,
  callDuration: 0,
  peerConnection: null,
  pendingCandidates: [],

  // ── Callbacks ──
  onCallStateChange: null,
  onRemoteStream: null,
  onMessage: null,
  onCallTimer: null,
  onCameraFeed: null,
  onSOSAlert: null,
  onRequestCamera: null,
  onDataConnected: null,

  /**
   * Initialize for User (Blind)
   */
  initAsUser(code) {
    this.role = 'user';
    this.myId = `ss-blindnav-user-${code}`;
    this.targetId = `ss-blindnav-family-${code}`;
    this._startPeerJS();
  },

  /**
   * Initialize for Family
   */
  initAsFamily(code) {
    this.role = 'family';
    this.myId = `ss-blindnav-family-${code}`;
    this.targetId = `ss-blindnav-user-${code}`;
    this._startPeerJS();
  },

  _startPeerJS() {
    // Destroy old peer if exists
    if (this.peer) {
      try { this.peer.destroy(); } catch(e) {}
    }

    this.peer = new Peer(this.myId, {
      debug: 1,
      config: {
        'iceServers': [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', (id) => {
      console.log(`📡 PeerJS connected. My ID: ${id}`);
      this.connectToTarget();
      // Retry every 5s
      this._retryInterval = setInterval(() => {
        if (!this.conn || !this.conn.open) {
          this.connectToTarget();
        }
      }, 5000);
    });

    this.peer.on('connection', (conn) => {
      console.log('🔗 Incoming data connection from', conn.peer);
      this._setupDataConnection(conn);
    });

    this.peer.on('call', (call) => {
      if (call.metadata && call.metadata.type === 'camera') {
        // Camera feed — answer automatically
        call.answer();
        call.on('stream', (remoteStream) => {
          console.log('📹 Camera stream received via PeerJS');
          if (this.onCameraFeed) this.onCameraFeed(remoteStream);
        });
      } else {
        // Voice/Video call — need to answer with local stream
        console.log('📞 Incoming WebRTC call via PeerJS');
        this.callObj = call;
        this._setCallState('ringing');
        
        // Auto-answer for blind user side (accessibility)
        if (this.role === 'user') {
          setTimeout(() => this._answerPeerCall(), 2000);
        }
      }
    });

    this.peer.on('error', (err) => {
      console.warn('PeerJS error:', err.type, err.message);
      if (err.type === 'unavailable-id') {
        // ID taken — add random suffix and retry
        console.warn('ID taken, retrying with suffix...');
        const suffix = Math.floor(Math.random() * 1000);
        this.myId = this.myId + '-' + suffix;
        setTimeout(() => this._startPeerJS(), 1000);
      }
    });

    this.peer.on('disconnected', () => {
      console.warn('📡 PeerJS disconnected. Reconnecting...');
      try { this.peer.reconnect(); } catch(e) {}
    });
  },

  connectToTarget() {
    if (!this.peer || this.peer.disconnected || this.peer.destroyed) return;
    if (this.conn && this.conn.open) return;

    console.log(`🔄 Attempting to connect to ${this.targetId}...`);
    try {
      const conn = this.peer.connect(this.targetId, { reliable: true });
      this._setupDataConnection(conn);
    } catch(e) {
      console.warn('Connect error:', e);
    }
  },

  _setupDataConnection(conn) {
    if (this.conn && this.conn.open && this.conn.peer === conn.peer) return;

    this.conn = conn;

    this.conn.on('open', () => {
      console.log(`✅ Data connection established with ${this.conn.peer}`);
      this.send({ type: 'presence', role: this.role, status: 'online' });
      if (this.onDataConnected) this.onDataConnected();
    });

    this.conn.on('data', (data) => {
      this._onData(data);
    });

    this.conn.on('close', () => {
      console.log(`❌ Data connection closed`);
      this.conn = null;
    });

    this.conn.on('error', (err) => {
      console.warn('DataConnection error:', err);
    });
  },

  /**
   * Send data via PeerJS DataConnection
   */
  send(data) {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send({ ...data, from: this.role, ts: Date.now() });
        return true;
      } catch (e) {
        console.warn('PeerJS Data send error:', e);
        return false;
      }
    }
    return false;
  },

  /**
   * Handle incoming data
   */
  _onData(data) {
    if (data.from === this.role) return;

    switch (data.type) {
      // ── Presence ──
      case 'presence':
        console.log(`👤 ${data.role} is ${data.status}`);
        if (data.role === 'user' && data.status === 'online' && this.role === 'family') {
          setTimeout(() => this.send({ type: 'request-camera' }), 2000);
        }
        break;

      // ── Messaging & Updates ──
      case 'text-message':
      case 'voice-message':
      case 'obstacle-update':
      case 'location-update':
        if (this.onMessage) this.onMessage(data);
        break;

      // ── SOS ──
      case 'sos-alert':
      case 'sos-cancel':
      case 'sos-resolved':
      case 'reverse-sos':
        if (this.onSOSAlert) this.onSOSAlert(data);
        break;

      // ── Camera request ──
      case 'request-camera':
        if (this.onRequestCamera) this.onRequestCamera();
        break;

      // ── Call Signaling ──
      case 'call-ringing':
        this._setCallState('ringing');
        break;
      case 'call-hangup':
        this._handleHangup();
        break;
    }
  },

  // ═══════════════════════════════════════════
  // VIDEO/AUDIO CALL — PeerJS MediaConnection
  // ═══════════════════════════════════════════

  /**
   * Start a call (caller side) — uses PeerJS call()
   */
  async startCall(existingStream = null) {
    try {
      this._setCallState('calling');

      if (existingStream) {
        this.localStream = existingStream;
      } else {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      }

      // Use PeerJS call() which handles WebRTC internally
      this.callObj = this.peer.call(this.targetId, this.localStream);
      
      this.callObj.on('stream', (remoteStream) => {
        console.log('📞 Remote stream received');
        this.remoteStream = remoteStream;
        if (this.onRemoteStream) this.onRemoteStream(remoteStream);
        this._setCallState('connected');
        this._startCallTimer();
      });

      this.callObj.on('close', () => {
        this._handleHangup();
      });

      this.callObj.on('error', (err) => {
        console.error('Call error:', err);
        this._handleHangup();
      });

      // Notify the other side
      this.send({ type: 'call-ringing' });
      console.log('📞 Call started via PeerJS');
    } catch (err) {
      console.error('❌ Start call error:', err);
      this._setCallState('ended');
    }
  },

  /**
   * Answer an incoming PeerJS call
   */
  async _answerPeerCall() {
    if (!this.callObj) return;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      this.callObj.answer(this.localStream);

      this.callObj.on('stream', (remoteStream) => {
        console.log('📞 Remote stream received (answerer)');
        this.remoteStream = remoteStream;
        if (this.onRemoteStream) this.onRemoteStream(remoteStream);
        this._setCallState('connected');
        this._startCallTimer();
      });

      this.callObj.on('close', () => {
        this._handleHangup();
      });

      console.log('✅ Call answered via PeerJS');
    } catch (err) {
      console.error('❌ Answer call error:', err);
      this._setCallState('ended');
    }
  },

  /**
   * Legacy answerCall method (for compatibility)
   */
  async answerCall() {
    return this._answerPeerCall();
  },

  /**
   * End call
   */
  endCall() {
    this.send({ type: 'call-hangup' });
    this._handleHangup();
  },

  _handleHangup() {
    if (this.callObj) {
      try { this.callObj.close(); } catch(e) {}
      this.callObj = null;
    }

    if (this.localStream && this.role === 'family') {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    this._stopCallTimer();
    this._setCallState('ended');
    setTimeout(() => this._setCallState('idle'), 1500);
    console.log('📴 Call ended');
  },

  // ═══════════════════════════════════════════
  // CAMERA FEED SHARING — One-way (User → Family)
  // ═══════════════════════════════════════════

  async shareCameraFeed(cameraStream) {
    if (!this.peer || this.peer.disconnected || this.peer.destroyed) return;

    try {
      if (this.cameraCallObj) {
        try { this.cameraCallObj.close(); } catch(e) {}
      }

      this.cameraCallObj = this.peer.call(this.targetId, cameraStream, {
        metadata: { type: 'camera' }
      });

      this.cameraCallObj.on('error', (err) => {
        console.warn('Camera share error:', err);
      });

      console.log('📹 Camera feed shared to family via PeerJS');
    } catch (err) {
      console.error('Camera share error:', err);
    }
  },

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  _setCallState(state) {
    this.callState = state;
    console.log(`📞 Call state → ${state}`);
    if (this.onCallStateChange) this.onCallStateChange(state);
  },

  _startCallTimer() {
    this.callDuration = 0;
    this._stopCallTimer();
    this.callTimer = setInterval(() => {
      this.callDuration++;
      if (this.onCallTimer) {
        const m = Math.floor(this.callDuration / 60).toString().padStart(2, '0');
        const s = (this.callDuration % 60).toString().padStart(2, '0');
        this.onCallTimer(`${m}:${s}`);
      }
    }, 1000);
  },

  _stopCallTimer() {
    if (this.callTimer) {
      clearInterval(this.callTimer);
      this.callTimer = null;
    }
  },

  /**
   * Check if data connection is open
   */
  isConnected() {
    return this.conn && this.conn.open;
  }
};
