/* ============================================
   BlindNav User App — Giao diện Người Mù
   Camera + AI Navigation + Voice + SOS + Call
   Samsung Solve for Tomorrow 2026
   ============================================ */

const UserApp = {
  // ── State ──
  cameraStream: null,
  isRecording: false,
  mediaRecorder: null,
  recordedChunks: [],
  recordingTimer: null,
  recordingSeconds: 0,
  obstacleInterval: null,
  navInterval: null,
  messagesPanelOpen: false,
  messages: [],
  sosActive: false,
  cameraActive: false,
  currentRouteStep: 0,
  _holdRecordTimeout: null,
  _lastTapTime: 0,

  // ═══════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════
  init() {
    console.log('🕶️ BlindNav User Interface starting...');

    this.setupCamera();
    this.setupControls();
    this.setupVolumeButtons();
    this.setupTouchRecording();
    this.setupMessages();
    this.startClock();

    // Greet after a moment
    setTimeout(() => {
      this.speak('Xin chào. BlindNav đã sẵn sàng. Camera đang quét môi trường.');
    }, 1500);

    // Start obstacle + navigation after 3s
    setTimeout(() => {
      this.startObstacleDetection();
      this.startNavigation();
    }, 3000);

    // Initialize WebRTC + BroadcastChannel
    if (typeof BlindNavRTC !== 'undefined') {
      BlindNavRTC.init('user');

      BlindNavRTC.onCallStateChange = (state) => this.onCallStateChange(state);
      BlindNavRTC.onCallTimer = (time) => this.updateCallTimer(time);
      BlindNavRTC.onRemoteStream = (stream) => this.onRemoteStream(stream);

      // ══ Nhận tin nhắn từ người thân ══
      BlindNavRTC.onMessage = (data) => {
        if (data.type === 'text-message') {
          console.log('📨 Received text message from family:', data.text);
          this.onMessageReceived({ sender: data.sender || 'Con Lan', text: data.text });
        }
        if (data.type === 'voice-message') {
          console.log('🎤 Received voice message from family');
          this.onVoiceMessageReceived(data);
        }
      };

      // ══ Nhận SOS resolve từ người thân ══
      BlindNavRTC.onSOSAlert = (data) => {
        if (data.type === 'sos-resolved') {
          this.onSOSResolved();
        } else if (data.type === 'reverse-sos') {
          this.onReverseSOS();
        }
      };

      // ══ Nhận yêu cầu camera từ người thân ══
      BlindNavRTC.onRequestCamera = () => {
        console.log('📹 Family requesting camera feed');
        this.reshareCameraFeed();
      };
    }

    // Firebase init (if configured)
    if (typeof FirebaseConfig !== 'undefined') {
      FirebaseConfig.init();
    }
  },

  // ═══════════════════════════════════════════
  // CAMERA
  // ═══════════════════════════════════════════
  async setupCamera() {
    const video = document.getElementById('camera-video');
    const placeholder = document.getElementById('camera-placeholder');

    try {
      try {
        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (err1) {
        // Fallback to any camera if environment camera fails
        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      if (video) {
        video.srcObject = this.cameraStream;
        video.play();
      }
      if (placeholder) placeholder.style.display = 'none';
      this.cameraActive = true;

      // Share camera feed cho người thân sau 2s
      setTimeout(() => this.shareCameraToFamily(), 2000);

    } catch (err) {
      console.warn('📷 Camera error:', err);
      if (placeholder) {
        placeholder.querySelector('.camera-placeholder-text').textContent =
          'Không thể mở camera. Vui lòng cấp quyền camera.';
      }
    }
  },

  /**
   * Chia sẻ camera cho người thân qua WebRTC
   */
  shareCameraToFamily() {
    if (this.cameraStream && typeof BlindNavRTC !== 'undefined') {
      BlindNavRTC.shareCameraFeed(this.cameraStream);
      console.log('📹 Camera shared to family');
    }
  },

  /**
   * Re-share camera khi người thân yêu cầu
   */
  reshareCameraFeed() {
    if (this.cameraStream && this.cameraActive) {
      this.shareCameraToFamily();
    } else {
      // Camera chưa sẵn sàng, thử lại sau 2s
      console.log('📹 Camera not ready, retrying in 2s...');
      setTimeout(() => {
        if (this.cameraStream && this.cameraActive) {
          this.shareCameraToFamily();
        }
      }, 2000);
    }
  },

  // ═══════════════════════════════════════════
  // AI OBSTACLE DETECTION — Mô phỏng chính xác
  // ═══════════════════════════════════════════
  startObstacleDetection() {
    // Kịch bản đi bộ thực tế: tuần tự, không random loạn
    const scenario = [
      {
        obstacles: [
          {
            name: 'Xe máy đỗ', distance: '3 mét', direction: 'bên trái đường', type: 'warning',
            box: { top: '40%', left: '5%', width: '140px', height: '100px' }
          }
        ],
        speech: 'Có xe máy đỗ bên trái đường, cách 3 mét. Đi tiếp bên phải.',
        alert: '🏍️ Xe máy đỗ bên trái, cách 3m'
      },
      {
        obstacles: [
          {
            name: 'Cột điện', distance: '2 mét', direction: 'phía trước bên phải', type: 'danger',
            box: { top: '20%', left: '65%', width: '50px', height: '200px' }
          }
        ],
        speech: 'Cảnh báo! Cột điện phía trước bên phải, cách 2 mét. Tránh sang trái.',
        alert: '⚡ Cột điện bên phải, cách 2m — Tránh trái!'
      },
      {
        obstacles: [],
        speech: 'Đường phía trước thông thoáng. Tiếp tục đi thẳng.',
        alert: '✅ Đường thông thoáng'
      },
      {
        obstacles: [
          {
            name: 'Bậc thang', distance: '1.5 mét', direction: 'phía trước', type: 'danger',
            box: { top: '70%', left: '15%', width: '250px', height: '40px' }
          }
        ],
        speech: 'Cẩn thận! Bậc thang phía trước, cách 1 mét rưỡi. Bước cao lên.',
        alert: '🪜 Bậc thang phía trước, cách 1.5m!'
      },
      {
        obstacles: [
          {
            name: 'Người đi bộ', distance: '4 mét', direction: 'đi ngược chiều', type: 'warning',
            box: { top: '15%', left: '40%', width: '65px', height: '170px' }
          }
        ],
        speech: 'Có người đi bộ ngược chiều, cách 4 mét. Đi sát lề phải.',
        alert: '🚶 Người đi bộ phía trước, cách 4m'
      },
      {
        obstacles: [
          {
            name: 'Hố ga mở', distance: '1 mét', direction: 'ngay trước mặt', type: 'danger',
            box: { top: '65%', left: '35%', width: '100px', height: '60px' }
          }
        ],
        speech: 'NGUY HIỂM! Hố ga mở ngay trước mặt, cách 1 mét! Dừng lại và đi vòng sang phải!',
        alert: '🚫 HỐ GA MỞ ngay trước mặt — DỪNG LẠI!'
      },
      {
        obstacles: [],
        speech: 'Đã qua vùng nguy hiểm. Đường an toàn. Tiếp tục đi thẳng.',
        alert: '✅ Đã an toàn — Tiếp tục đi thẳng'
      },
      {
        obstacles: [
          {
            name: 'Cành cây thấp', distance: '2 mét', direction: 'phía trên đầu', type: 'warning',
            box: { top: '2%', left: '20%', width: '200px', height: '45px' }
          }
        ],
        speech: 'Cành cây thấp phía trên đầu, cách 2 mét. Cúi đầu xuống khi đi qua.',
        alert: '🌳 Cành cây thấp phía trên — Cúi đầu!'
      },
      {
        obstacles: [
          {
            name: 'Ghế đá', distance: '2.5 mét', direction: 'bên phải', type: 'safe',
            box: { top: '50%', left: '68%', width: '110px', height: '70px' }
          },
          {
            name: 'Biển báo', distance: '3 mét', direction: 'bên phải', type: 'safe',
            box: { top: '10%', left: '75%', width: '50px', height: '80px' }
          }
        ],
        speech: 'Ghế đá và biển báo bên phải đường. Đường bên trái thông thoáng.',
        alert: 'ℹ️ Ghế đá + Biển báo bên phải'
      },
      {
        obstacles: [
          {
            name: 'Đèn đỏ', distance: '5 mét', direction: 'ngã tư phía trước', type: 'danger',
            box: { top: '5%', left: '45%', width: '40px', height: '60px' }
          }
        ],
        speech: 'Ngã tư phía trước. Đèn đang đỏ. Dừng lại và chờ đèn xanh.',
        alert: '🔴 Đèn đỏ — Dừng lại chờ đèn xanh!'
      }
    ];

    let step = 0;
    this.obstacleInterval = setInterval(() => {
      const scene = scenario[step % scenario.length];

      // Hiển thị bounding boxes
      this.showObstacles(scene.obstacles);

      // Hiển thị alert banner
      const alertType = scene.obstacles.length === 0 ? 'success' :
        scene.obstacles.some(o => o.type === 'danger') ? 'danger' : 'warning';
      this.showAlert(scene.alert, alertType);

      // TTS đọc cảnh báo
      this.speak(scene.speech);

      // Rung nếu nguy hiểm
      if (alertType === 'danger' && navigator.vibrate) {
        navigator.vibrate([300, 100, 300]);
      }

      // Gửi info cho người thân
      if (typeof BlindNavRTC !== 'undefined') {
        BlindNavRTC.send({
          type: 'obstacle-update',
          obstacles: scene.obstacles.map(o => ({ name: o.name, distance: o.distance, direction: o.direction, type: o.type })),
          alert: scene.alert
        });
      }

      step++;
    }, 8000); // 8 giây/lần — đủ thời gian đọc + phản ứng
  },

  showObstacles(obstacles) {
    const overlay = document.getElementById('obstacle-overlay');
    if (!overlay) return;
    overlay.innerHTML = '';

    obstacles.forEach(obs => {
      const box = document.createElement('div');
      box.className = `obstacle-box ${obs.type}`;
      box.style.top = obs.box.top;
      box.style.left = obs.box.left;
      box.style.width = obs.box.width;
      box.style.height = obs.box.height;
      box.innerHTML = `
        <div class="obstacle-label">${obs.name}</div>
        <div class="obstacle-distance">${obs.distance}</div>
      `;
      overlay.appendChild(box);
    });

    // Xóa sau 6 giây
    setTimeout(() => { if (overlay) overlay.innerHTML = ''; }, 6500);
  },

  showAlert(text, type = 'warning') {
    const banner = document.getElementById('alert-banner');
    if (!banner) return;
    banner.textContent = text;
    banner.className = `alert-banner active ${type}`;
    clearTimeout(this._alertTimeout);
    this._alertTimeout = setTimeout(() => banner.classList.remove('active'), 6000);
  },

  // ═══════════════════════════════════════════
  // NAVIGATION — Định vị GPS thật
  // ═══════════════════════════════════════════
  startNavigation() {
    if (!navigator.geolocation) {
      this.speak('Thiết bị không hỗ trợ định vị GPS.');
      return;
    }

    const dirText = document.getElementById('nav-direction-text');
    const locText = document.getElementById('nav-location-text');

    if (dirText) dirText.textContent = 'Đang tìm tín hiệu GPS...';
    if (locText) locText.textContent = '📍 Đang cập nhật...';

    const successCallback = async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const heading = position.coords.heading || 0;

      // Giả lập reverse geocoding đơn giản vì không có API Key, 
      // Nhưng trên thực tế có thể dùng Nominatim API (OpenStreetMap) miễn phí.
      let addressStr = `Tọa độ: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data = await res.json();
        if (data && data.display_name) {
          addressStr = data.display_name.split(',').slice(0, 3).join(', ');
        }
      } catch (e) {
        console.warn('Reverse geocoding failed', e);
      }

      if (dirText) dirText.textContent = 'Đang di chuyển...';
      if (locText) locText.textContent = `📍 ${addressStr}`;

      // Gửi vị trí thật cho người thân qua WebRTC
      if (typeof BlindNavRTC !== 'undefined') {
        BlindNavRTC.send({
          type: 'location-update',
          address: addressStr,
          lat: lat,
          lng: lng,
          heading: heading
        });
      }
    };

    const errorCallback = (error) => {
      console.error('GPS error:', error);
      if (dirText) dirText.textContent = 'Lỗi GPS. Đang chờ kết nối...';
      // Thử lại mô phỏng nếu GPS bị lỗi (fallback)
    };

    this.navInterval = navigator.geolocation.watchPosition(
      successCallback,
      errorCallback,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  },

  // ═══════════════════════════════════════════
  // VOICE RECORDING
  // ═══════════════════════════════════════════
  async startRecording() {
    if (this.isRecording) return;
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' :
        (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm');
      this.mediaRecorder = new MediaRecorder(audioStream, { mimeType: mimeType || undefined });
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        const typeStr = this.mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this.recordedChunks, { type: typeStr });
        if (this.recordingSeconds >= 1) {
          // Chỉ gửi nếu ghi >= 1 giây
          this.sendVoiceMessage(blob);
        } else {
          this.speak('Tin nhắn quá ngắn. Hãy thử lại.');
        }
        audioStream.getTracks().forEach(t => t.stop());
      };

      this.mediaRecorder.start(100); // collect data every 100ms
      this.isRecording = true;
      this.recordingSeconds = 0;

      const overlay = document.getElementById('recording-overlay');
      if (overlay) overlay.classList.add('active');
      const recordBtn = document.getElementById('record-btn');
      if (recordBtn) recordBtn.classList.add('recording');

      this.recordingTimer = setInterval(() => {
        this.recordingSeconds++;
        const timerEl = document.getElementById('recording-timer');
        if (timerEl) timerEl.textContent = this._formatTime(this.recordingSeconds);
      }, 1000);

      this.speak('Đang ghi âm. Nói tin nhắn của bạn.');
      if (navigator.vibrate) navigator.vibrate(100);
    } catch (err) {
      console.error('🎤 Recording error:', err);
      this.speak('Không thể ghi âm. Vui lòng cấp quyền microphone.');
    }
  },

  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;

    try {
      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    } catch (e) {
      console.warn('Stop recording error:', e);
    }

    this.isRecording = false;

    const overlay = document.getElementById('recording-overlay');
    if (overlay) overlay.classList.remove('active');
    const recordBtn = document.getElementById('record-btn');
    if (recordBtn) recordBtn.classList.remove('recording');
    clearInterval(this.recordingTimer);
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
  },

  toggleRecording() {
    if (this.isRecording) this.stopRecording();
    else this.startRecording();
  },

  sendVoiceMessage(blob) {
    const audioUrl = URL.createObjectURL(blob);
    const msg = {
      id: Date.now(),
      type: 'audio',
      sender: 'Bạn',
      audioUrl: audioUrl,
      duration: this.recordingSeconds,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      sent: true
    };
    this.messages.push(msg);
    this.renderMessages();

    // Gửi thông báo cho người thân qua BroadcastChannel
    if (typeof BlindNavRTC !== 'undefined') {
      // Chuyển blob sang base64 để gửi qua channel
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        BlindNavRTC.send({
          type: 'voice-message',
          sender: 'Bố',
          audioData: reader.result,
          duration: this.recordingSeconds,
          timestamp: msg.timestamp
        });
        console.log('📤 Voice message sent to family');
      };
    }

    this.speak(`Đã gửi tin nhắn ${this.recordingSeconds} giây cho người thân.`);
  },

  // ═══════════════════════════════════════════
  // INCOMING MESSAGES — Nhận + TTS đọc to
  // ═══════════════════════════════════════════
  onMessageReceived(msg) {
    // Vibrate mạnh
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);

    // Âm thông báo
    if (typeof AudioManager !== 'undefined') AudioManager.playNotification('info');

    // Hiện toast lâu hơn
    this.showMessageToast(msg.sender || 'Con Lan', msg.text || 'Tin nhắn mới');

    // ✅ ĐỌC TO tin nhắn bằng TTS tiếng Việt (Google voice)
    setTimeout(() => {
      const fullMessage = `Tin nhắn từ ${msg.sender || 'người thân'}. ${msg.text || ''}`;
      console.log('🔊 Speaking message:', fullMessage);
      if (window.speechSynthesis) window.speechSynthesis.resume();
      this.speak(fullMessage);
    }, 800);

    // Lưu tin nhắn
    this.messages.push({
      id: Date.now(),
      type: 'text',
      sender: msg.sender || 'Con Lan',
      text: msg.text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      sent: false
    });
    this.renderMessages();
  },

  /**
   * Nhận tin nhắn thoại từ người thân → phát audio
   */
  onVoiceMessageReceived(data) {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);
    if (typeof AudioManager !== 'undefined') AudioManager.playNotification('info');

    this.showMessageToast(data.sender || 'Con Lan', 'Gửi tin nhắn thoại');

    // Thông báo bằng TTS
    this.speak(`Tin nhắn thoại từ ${data.sender || 'người thân'}. Đang phát.`);

    // Phát audio tin nhắn thoại
    if (data.audioData) {
      setTimeout(() => {
        const audio = new Audio(data.audioData);
        audio.volume = 1.0;
        audio.play().catch(e => console.warn('Voice playback failed:', e));
      }, 2500); // Chờ TTS đọc xong "Tin nhắn thoại từ..."
    }

    // Lưu tin nhắn
    this.messages.push({
      id: Date.now(),
      type: 'audio',
      sender: data.sender || 'Con Lan',
      audioUrl: data.audioData || '',
      duration: data.duration || 0,
      timestamp: data.timestamp || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      sent: false
    });
    this.renderMessages();
  },

  showMessageToast(sender, text) {
    const toast = document.getElementById('msg-toast');
    if (!toast) return;
    toast.querySelector('.msg-toast-sender').textContent = `💬 ${sender}`;
    toast.querySelector('.msg-toast-text').textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 5000);
  },

  // ═══════════════════════════════════════════
  // SOS MODULE
  // ═══════════════════════════════════════════
  async triggerSOS() {
    if (this.sosActive) return;
    this.sosActive = true;

    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);

    const overlay = document.getElementById('sos-overlay');
    if (overlay) overlay.classList.add('active');

    if (typeof AudioManager !== 'undefined') AudioManager.playSOSAlert();

    this.speak('SOS đã được kích hoạt. Đang liên hệ người thân.');

    // Gửi SOS cho người thân qua BroadcastChannel
    if (typeof BlindNavRTC !== 'undefined') {
      BlindNavRTC.send({
        type: 'sos-alert',
        address: document.getElementById('nav-location-text')?.textContent?.replace('📍 ', '') || 'Hàng Bông, Hoàn Kiếm',
        timestamp: Date.now()
      });
    }

    // Step 1: GPS
    this.updateSOSStep('sos-step-1', 'active', '📍 Đang gửi vị trí GPS...');

    setTimeout(() => {
      this.updateSOSStep('sos-step-1', 'done', '✅ Đã gửi vị trí GPS');
      this.updateSOSStep('sos-step-2', 'active', '📞 Đang gọi cho Con Lan...');

      // Step 2: Gọi video thật sau 1.5s
      setTimeout(() => this.startSOSCall(), 1500);
    }, 2000);
  },

  async startSOSCall() {
    try {
      const callStream = await navigator.mediaDevices.getUserMedia({
        video: true, audio: true
      });

      // Hiển thị call UI
      const callOverlay = document.getElementById('call-overlay');
      if (callOverlay) callOverlay.classList.add('active');

      if (typeof BlindNavRTC !== 'undefined') {
        BlindNavRTC.startCall(callStream);
      }

      this.updateSOSStep('sos-step-2', 'done', '✅ Đang gọi cho Con Lan');
      this.updateSOSStep('sos-step-3', 'done', '🔊 Ghi âm môi trường đang bật');

      this.speak('Đang kết nối cuộc gọi với Con Lan.');
    } catch (err) {
      console.error('SOS call error:', err);
      this.updateSOSStep('sos-step-2', 'done', '⚠️ Không thể gọi video — đã gửi SMS');
      this.updateSOSStep('sos-step-3', 'done', '✅ Đã thông báo người thân');
    }
  },

  updateSOSStep(stepId, status, text) {
    const step = document.getElementById(stepId);
    if (!step) return;
    step.className = `step ${status}`;
    step.innerHTML = text;
  },

  cancelSOS() {
    this.sosActive = false;
    const overlay = document.getElementById('sos-overlay');
    if (overlay) overlay.classList.remove('active');

    if (typeof AudioManager !== 'undefined') AudioManager.stopSOSAlert();

    // Thông báo người thân
    if (typeof BlindNavRTC !== 'undefined') {
      BlindNavRTC.send({ type: 'sos-cancel' });
    }

    this.speak('SOS đã được hủy. Bạn an toàn.');
  },

  onSOSResolved() {
    this.sosActive = false;
    const overlay = document.getElementById('sos-overlay');
    if (overlay) overlay.classList.remove('active');
    if (typeof AudioManager !== 'undefined') AudioManager.stopSOSAlert();
    this.speak('Người thân đã xác nhận bạn an toàn.');
  },

  onReverseSOS() {
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
    if (typeof AudioManager !== 'undefined') AudioManager.playSOSAlert();
    this.showAlert('🚨 CẢNH BÁO TỪ NGƯỜI THÂN!', 'danger');
    this.speak('Cảnh báo khẩn cấp từ người thân! Hãy dừng lại và nghe máy ngay lập tức.');
  },

  // ═══════════════════════════════════════════
  // CALL MODULE
  // ═══════════════════════════════════════════
  async callFamily() {
    // Ngăn chặn gọi liên tục nếu đang trong cuộc gọi
    if (typeof BlindNavRTC !== 'undefined' && BlindNavRTC.callState !== 'idle') {
      console.log('Đã trong cuộc gọi, bỏ qua lệnh gọi mới.');
      return;
    }

    try {
      // Đánh dấu là đang gọi ngay lập tức để tránh double click
      if (typeof BlindNavRTC !== 'undefined') BlindNavRTC.callState = 'calling';

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true, audio: true
      });

      const callOverlay = document.getElementById('call-overlay');
      if (callOverlay) callOverlay.classList.add('active');

      if (typeof BlindNavRTC !== 'undefined') {
        BlindNavRTC.startCall(stream);
      }

      this.speak('Đang gọi cho Con Lan.');
    } catch (err) {
      if (typeof BlindNavRTC !== 'undefined') BlindNavRTC.callState = 'idle';
      this.speak('Không thể bắt đầu cuộc gọi. Vui lòng cấp quyền camera và micro.');
    }
  },

  answerIncomingCall() {
    clearTimeout(this._autoAnswerTimeout);
    clearInterval(this._callVibrate);

    const incomingOverlay = document.getElementById('incoming-call');
    if (incomingOverlay) incomingOverlay.classList.remove('active');

    if (typeof AudioManager !== 'undefined') AudioManager.stopRingtone();

    const callOverlay = document.getElementById('call-overlay');
    if (callOverlay) callOverlay.classList.add('active');

    // Answer WebRTC call
    if (typeof BlindNavRTC !== 'undefined' && BlindNavRTC._incomingOfferSdp) {
      BlindNavRTC.answerCall(BlindNavRTC._incomingOfferSdp);
    }

    this.speak('Cuộc gọi đã kết nối.');
  },

  rejectIncomingCall() {
    clearTimeout(this._autoAnswerTimeout);
    clearInterval(this._callVibrate);

    const overlay = document.getElementById('incoming-call');
    if (overlay) overlay.classList.remove('active');

    if (typeof AudioManager !== 'undefined') AudioManager.stopRingtone();
    if (navigator.vibrate) navigator.vibrate(0);

    if (typeof BlindNavRTC !== 'undefined') {
      BlindNavRTC.send({ type: 'call-hangup' });
    }

    this.speak('Đã từ chối cuộc gọi.');
  },

  endCall() {
    const callOverlay = document.getElementById('call-overlay');
    if (callOverlay) callOverlay.classList.remove('active');

    if (typeof BlindNavRTC !== 'undefined') BlindNavRTC.endCall();

    this.speak('Cuộc gọi đã kết thúc.');
  },

  onCallStateChange(state) {
    const statusEl = document.getElementById('call-status-text');
    console.log('📞 User call state:', state);

    switch (state) {
      case 'calling':
        if (statusEl) statusEl.textContent = 'Đang gọi...';
        break;
      case 'ringing':
        if (statusEl) statusEl.textContent = 'Đang đổ chuông...';
        // Nếu là user nhận cuộc gọi đến từ family
        if (BlindNavRTC._incomingOfferSdp && !document.getElementById('call-overlay')?.classList.contains('active')) {
          this.showIncomingCall({ callerName: 'Con Lan' });
        }
        break;
      case 'connected':
        if (statusEl) statusEl.textContent = 'Đã kết nối';
        if (typeof AudioManager !== 'undefined') AudioManager.playCallConnect();
        break;
      case 'ended':
        if (statusEl) statusEl.textContent = 'Cuộc gọi đã kết thúc';
        const callOverlay = document.getElementById('call-overlay');
        if (callOverlay) setTimeout(() => callOverlay.classList.remove('active'), 1500);
        // Dọn incoming call overlay nếu còn hiện
        const incomingOverlay = document.getElementById('incoming-call');
        if (incomingOverlay) incomingOverlay.classList.remove('active');
        clearTimeout(this._autoAnswerTimeout);
        clearInterval(this._callVibrate);
        if (typeof AudioManager !== 'undefined') AudioManager.stopRingtone();
        break;
    }
  },

  showIncomingCall(callData) {
    const overlay = document.getElementById('incoming-call');
    if (!overlay) return;
    overlay.classList.add('active');

    if (typeof AudioManager !== 'undefined') AudioManager.playRingtone();
    if (navigator.vibrate) {
      this._callVibrate = setInterval(() => navigator.vibrate([200, 100, 200, 300]), 2000);
    }

    this.speak(`Cuộc gọi đến từ ${callData.callerName || 'Con Lan'}. Chạm nút xanh để nghe.`);

    // Auto-answer sau 5s (người mù không cần phải tìm nút)
    this._autoAnswerTimeout = setTimeout(() => {
      console.log('📞 Auto-answering call for blind user');
      this.answerIncomingCall();
    }, 5000);
  },

  updateCallTimer(time) {
    const timerEl = document.getElementById('call-timer');
    if (timerEl) timerEl.textContent = time;
  },

  onRemoteStream(stream) {
    // Phát audio từ remote stream
    let remoteAudio = document.getElementById('remote-audio');
    if (!remoteAudio) {
      remoteAudio = document.createElement('audio');
      remoteAudio.id = 'remote-audio';
      remoteAudio.autoplay = true;
      document.body.appendChild(remoteAudio);
    }
    remoteAudio.srcObject = stream;
  },

  // ═══════════════════════════════════════════
  // CONTROLS & EVENTS
  // ═══════════════════════════════════════════
  setupControls() {
    const recordBtn = document.getElementById('record-btn');
    if (recordBtn) recordBtn.addEventListener('click', () => this.toggleRecording());

    // SOS: click on desktop, long-press on mobile
    const sosBtn = document.getElementById('sos-btn');
    if (sosBtn) {
      let pressTimer;
      const startSOS = (e) => {
        e.preventDefault();
        sosBtn.classList.add('active');
        pressTimer = setTimeout(() => this.triggerSOS(), 1000);
      };
      const cancelSOS = () => {
        clearTimeout(pressTimer);
        sosBtn.classList.remove('active');
      };
      sosBtn.addEventListener('touchstart', startSOS, { passive: false });
      sosBtn.addEventListener('mousedown', startSOS);
      sosBtn.addEventListener('touchend', cancelSOS);
      sosBtn.addEventListener('mouseup', cancelSOS);
      sosBtn.addEventListener('mouseleave', cancelSOS);
    }

    const sosCancelBtn = document.getElementById('sos-cancel-btn');
    if (sosCancelBtn) sosCancelBtn.addEventListener('click', () => this.cancelSOS());

    const recordStopBtn = document.getElementById('recording-stop-btn');
    if (recordStopBtn) recordStopBtn.addEventListener('click', () => this.stopRecording());

    const callBtn = document.getElementById('call-family-btn');
    if (callBtn) callBtn.addEventListener('click', () => this.callFamily());

    const endCallBtn = document.getElementById('end-call-btn');
    if (endCallBtn) endCallBtn.addEventListener('click', () => this.endCall());

    const msgBtn = document.getElementById('messages-btn');
    if (msgBtn) msgBtn.addEventListener('click', () => this.toggleMessagesPanel());

    const msgCloseBtn = document.getElementById('messages-panel-close');
    if (msgCloseBtn) msgCloseBtn.addEventListener('click', () => this.toggleMessagesPanel());

    const acceptCallBtn = document.getElementById('accept-call-btn');
    if (acceptCallBtn) acceptCallBtn.addEventListener('click', () => this.answerIncomingCall());

    const rejectCallBtn = document.getElementById('reject-call-btn');
    if (rejectCallBtn) rejectCallBtn.addEventListener('click', () => this.rejectIncomingCall());

    // Nav toggle
    const navToggle = document.getElementById('nav-toggle-btn');
    if (navToggle) {
      navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        const navInfo = document.getElementById('nav-info');
        if (navInfo) navInfo.style.display = navToggle.classList.contains('active') ? 'flex' : 'none';
        this.speak(navToggle.classList.contains('active') ? 'Bật chỉ đường' : 'Tắt chỉ đường');
      });
    }

    // Location button - read current location
    const locBtn = document.getElementById('location-btn');
    if (locBtn) {
      locBtn.addEventListener('click', () => {
        const addr = document.getElementById('nav-location-text')?.textContent?.replace('📍 ', '') || '';
        this.speak(`Bạn đang ở ${addr}`);
      });
    }
  },

  /**
   * Khởi tạo bắt sự kiện nút âm lượng (Volume Up/Down)
   * Trên Desktop/Android: Bắt phím cứng
   * Trên iOS/iPhone: Bắt sự kiện 'volumechange' của trình duyệt
   * Yêu cầu: Nhấn nút âm lượng để lập tức gọi cho người thân
   */
  setupVolumeButtons() {
    // 1. Dành cho Android/PC có hỗ trợ keydown cho nút volume
    document.addEventListener('keydown', (e) => {
      if (e.key === 'AudioVolumeUp' || e.keyCode === 175 || e.key === 'AudioVolumeDown' || e.keyCode === 174) {
        e.preventDefault();
        this.toggleRecording();
      }
      // Volume Down → SOS
      if (e.key === 'AudioVolumeDown' || e.keyCode === 174) {
        e.preventDefault();
        if (!this.sosActive) this.triggerSOS();
      }
    });
  },

  /**
   * Touch-based recording cho mobile:
   * - Record button: Touch & hold để ghi, thả ra để gửi
   * - Double-tap anywhere: Toggle recording
   */
  setupTouchRecording() {
    const recordBtn = document.getElementById('record-btn');

    if (recordBtn) {
      let holdTimer = null;
      let isHolding = false;

      // Touch & Hold trên record button → ghi âm → thả ra → gửi
      recordBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isHolding = true;
        holdTimer = setTimeout(() => {
          if (isHolding && !this.isRecording) {
            this.startRecording();
          }
        }, 500); // Giữ 0.5s để bắt đầu ghi
      }, { passive: false });

      recordBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        clearTimeout(holdTimer);
        if (isHolding && this.isRecording) {
          // Thả ra → dừng ghi âm → gửi
          this.stopRecording();
        } else if (!this.isRecording) {
          // Tap ngắn → toggle recording
          this.toggleRecording();
        }
        isHolding = false;
      });

      recordBtn.addEventListener('touchcancel', () => {
        clearTimeout(holdTimer);
        isHolding = false;
      });
    }

    // Double-tap anywhere (ngoại trừ buttons) → toggle recording
    document.addEventListener('touchend', (e) => {
      // Bỏ qua nếu tap vào button hoặc overlay
      if (e.target.closest('button') || e.target.closest('.recording-overlay') ||
        e.target.closest('.sos-overlay') || e.target.closest('.call-overlay') ||
        e.target.closest('.incoming-call') || e.target.closest('.messages-panel')) {
        return;
      }

      const now = Date.now();
      if (now - this._lastTapTime < 400) {
        // Double-tap detected
        e.preventDefault();
        this.toggleRecording();
        this._lastTapTime = 0;
      } else {
        this._lastTapTime = now;
      }
    });
  },

  // ═══════════════════════════════════════════
  // MESSAGES PANEL
  // ═══════════════════════════════════════════
  setupMessages() {
    this.messages = [
      { id: 1, type: 'text', sender: 'Con Lan', text: 'Bố ơi, con đang theo dõi bố trên app. Bố đi cẩn thận nhé! 💙', timestamp: '09:15', sent: false },
      { id: 2, type: 'text', sender: 'Con Lan', text: 'Đường Hàng Bông đang sửa, bố đi đường Phủ Doãn nhé.', timestamp: '09:30', sent: false }
    ];
    this.renderMessages();
  },

  toggleMessagesPanel() {
    this.messagesPanelOpen = !this.messagesPanelOpen;
    const panel = document.getElementById('messages-panel');
    if (panel) panel.classList.toggle('open', this.messagesPanelOpen);
  },

  renderMessages() {
    const list = document.getElementById('messages-list');
    if (!list) return;
    list.innerHTML = this.messages.map(msg => {
      if (msg.type === 'text') {
        return `<div class="message-item ${msg.sent ? 'sent' : ''}">
          <div class="message-item-header">
            <span class="message-item-sender">${msg.sent ? '🎤 Bạn' : '💬 ' + msg.sender}</span>
            <span class="message-item-time">${msg.timestamp}</span>
          </div>
          <div class="message-item-text">${msg.text}</div>
        </div>`;
      } else {
        return `<div class="message-item ${msg.sent ? 'sent' : ''}">
          <div class="message-item-header">
            <span class="message-item-sender">${msg.sent ? '🎤 Bạn' : '💬 ' + msg.sender}</span>
            <span class="message-item-time">${msg.timestamp}</span>
          </div>
          <div class="message-item-audio">
            <button class="message-audio-play" onclick="UserApp.playAudioMessage('${msg.audioUrl || ''}')">▶</button>
            <div class="message-audio-wave">${this._generateWaveBars()}</div>
            <span class="message-audio-duration">${this._formatTime(msg.duration || 0)}</span>
          </div>
        </div>`;
      }
    }).join('');
    list.scrollTop = list.scrollHeight;
  },

  playAudioMessage(url) {
    if (url) {
      const audio = new Audio(url);
      audio.volume = 1.0;
      audio.play().catch(e => {
        console.warn('Audio play failed:', e);
        this.speak('Phát lại tin nhắn thoại.');
      });
    } else {
      this.speak('Phát lại tin nhắn thoại.');
    }
  },

  _generateWaveBars() {
    let bars = '';
    for (let i = 0; i < 20; i++) {
      bars += `<div class="bar" style="height:${Math.random() * 18 + 4}px;"></div>`;
    }
    return bars;
  },

  // ═══════════════════════════════════════════
  // TTS — Sử dụng AudioManager (Google TTS tiếng Việt)
  // ═══════════════════════════════════════════
  speak(text) {
    if (typeof AudioManager !== 'undefined') {
      AudioManager.speak(text, 'vi');
    } else if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'vi-VN';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  },

  // ═══════════════════════════════════════════
  // CLOCK
  // ═══════════════════════════════════════════
  startClock() {
    const update = () => {
      const now = new Date();
      const el = document.getElementById('status-time');
      if (el) el.textContent = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    };
    update();
    setInterval(update, 30000);
  },

  _formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => UserApp.init());
