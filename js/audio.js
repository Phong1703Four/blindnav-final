/* ============================================
   BlindNav Audio Manager
   Âm thanh cuộc gọi & Giọng đọc AI
   Google TTS tiếng Việt + SpeechSynthesis fallback
   ============================================ */

const AudioManager = {
  audioCtx: null,
  currentOscillators: [],
  isRinging: false,
  isSOS: false,
  ringtoneInterval: null,

  // ── Initialize AudioContext (must be called after user gesture) ──
  getContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  },

  // ═══════════════════════════════════════════
  // RINGTONE — Tiếng chuông cuộc gọi
  // ═══════════════════════════════════════════
  playRingtone() {
    if (this.isRinging) return;
    this.isRinging = true;
    
    const playRingCycle = () => {
      if (!this.isRinging) return;
      // Ring pattern: two short tones with pause (like Vietnamese phone ring)
      this._playTone(440, 0.4, 0.3); // A4
      setTimeout(() => {
        if (!this.isRinging) return;
        this._playTone(480, 0.4, 0.3); // slightly higher
      }, 500);
    };

    playRingCycle();
    this.ringtoneInterval = setInterval(playRingCycle, 2000);
  },

  stopRingtone() {
    this.isRinging = false;
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    this._stopAll();
  },

  // ═══════════════════════════════════════════
  // SOS ALERT — Âm báo khẩn cấp
  // ═══════════════════════════════════════════
  playSOSAlert() {
    if (this.isSOS) return;
    this.isSOS = true;
    let count = 0;
    const maxBeeps = 6;

    const beepCycle = () => {
      if (!this.isSOS || count >= maxBeeps) {
        this.isSOS = false;
        return;
      }
      // Urgent high-pitched beep
      this._playTone(880, 0.15, 0.5);
      setTimeout(() => {
        if (!this.isSOS) return;
        this._playTone(660, 0.15, 0.5);
      }, 200);
      count++;
      setTimeout(beepCycle, 600);
    };

    beepCycle();

    // Also speak SOS message after beeps
    setTimeout(() => {
      const lang = (typeof I18n !== 'undefined') ? I18n.currentLang : 'vi';
      const msg = lang === 'vi' 
        ? 'Cảnh báo! Bố vừa bấm SOS. Vui lòng kiểm tra ngay.' 
        : 'Alert! Dad just pressed SOS. Please check immediately.';
      this.speak(msg, lang);
    }, 2500);
  },

  stopSOSAlert() {
    this.isSOS = false;
    this._stopAll();
    this.stopSpeaking();
  },

  // ═══════════════════════════════════════════
  // NOTIFICATION — Âm thông báo ngắn
  // ═══════════════════════════════════════════
  playNotification(type = 'info') {
    const freq = type === 'success' ? 880 : type === 'danger' ? 330 : 660;
    this._playTone(freq, 0.12, 0.2);
    if (type === 'success') {
      setTimeout(() => this._playTone(1100, 0.1, 0.15), 150);
    }
  },

  // ═══════════════════════════════════════════
  // CALL CONNECT — Âm kết nối cuộc gọi
  // ═══════════════════════════════════════════
  playCallConnect() {
    this._playTone(523, 0.15, 0.2); // C5
    setTimeout(() => this._playTone(659, 0.15, 0.2), 150); // E5
    setTimeout(() => this._playTone(784, 0.2, 0.25), 300); // G5
  },

  // ═══════════════════════════════════════════
  // CALL END — Âm kết thúc cuộc gọi
  // ═══════════════════════════════════════════
  playCallEnd() {
    this._playTone(784, 0.15, 0.2); // G5
    setTimeout(() => this._playTone(523, 0.2, 0.2), 200); // C5
  },

  // ═══════════════════════════════════════════
  // TEXT-TO-SPEECH — Giọng Google Dịch tiếng Việt
  // Fallback SpeechSynthesis nếu Google TTS fail
  // ═══════════════════════════════════════════
  _ttsQueue: [],
  _ttsPlaying: false,
  _currentTtsAudio: null,
  _userInteracted: false,

  /**
   * Đánh dấu user đã tương tác (cần cho autoplay policy)
   */
  markUserInteraction() {
    this._userInteracted = true;
    // Resume AudioContext nếu bị suspended
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  },

  /**
   * Đọc text bằng giọng Google Translate tiếng Việt
   * Tự động chia nhỏ text dài thành các đoạn <= 200 ký tự
   * Fallback sang SpeechSynthesis nếu Google TTS không khả dụng
   */
  speak(text, lang = 'vi') {
    if (!text || !text.trim()) return;

    // Dừng audio đang phát
    this.stopSpeaking();

    // Chia text thành các đoạn nhỏ (Google TTS giới hạn ~200 ký tự)
    const chunks = this._splitText(text.trim(), 190);
    
    // Thêm vào hàng đợi
    chunks.forEach(chunk => {
      this._ttsQueue.push({ text: chunk, lang: lang });
    });

    // Bắt đầu phát
    this._playNextTts();
  },

  /**
   * Phát đoạn TTS tiếp theo trong hàng đợi
   * Thử Google TTS trước, fallback SpeechSynthesis
   */
  _playNextTts() {
    if (this._ttsPlaying || this._ttsQueue.length === 0) return;

    this._ttsPlaying = true;
    const item = this._ttsQueue.shift();
    const langCode = item.lang === 'vi' ? 'vi' : 'en';

    // Thử Google TTS trước
    this._tryGoogleTts(item.text, langCode)
      .then(success => {
        if (!success) {
          // Fallback sang SpeechSynthesis
          console.log('🔄 Falling back to SpeechSynthesis');
          this._ttsPlaying = false;
          this._speakFallback(item.text, item.lang);
          // Tiếp tục hàng đợi sau khi fallback speech kết thúc
        }
      })
      .catch(() => {
        this._ttsPlaying = false;
        this._speakFallback(item.text, item.lang);
      });
  },

  /**
   * Thử phát bằng Google Translate TTS
   * @returns {Promise<boolean>} true nếu thành công
   */
  _tryGoogleTts(text, langCode) {
    return new Promise((resolve) => {
      try {
        // Google Translate TTS URL
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${langCode}&client=tw-ob&q=${encodeURIComponent(text)}`;
        
        const audio = new Audio();
        this._currentTtsAudio = audio;

        // Điều chỉnh tốc độ
        const speedMap = { 'Rất chậm': 0.7, 'Chậm': 0.85, 'Bình thường': 1.0, 'Nhanh': 1.2,
                           'Very slow': 0.7, 'Slow': 0.85, 'Normal': 1.0, 'Fast': 1.2 };
        const currentSpeed = (typeof BlindNavData !== 'undefined') 
          ? (BlindNavData?.settings?.voice?.speed || 'Bình thường') 
          : 'Bình thường';
        audio.playbackRate = speedMap[currentSpeed] || 1.0;

        // Volume
        audio.volume = ((typeof BlindNavData !== 'undefined' ? BlindNavData?.settings?.voice?.volume : 80) || 80) / 100;

        let resolved = false;

        audio.onended = () => {
          if (resolved) return;
          resolved = true;
          this._ttsPlaying = false;
          this._currentTtsAudio = null;
          setTimeout(() => this._playNextTts(), 150);
          resolve(true);
        };

        audio.onerror = () => {
          if (resolved) return;
          resolved = true;
          console.warn('Google TTS error (CORS or network), will fallback');
          this._currentTtsAudio = null;
          resolve(false);
        };

        // Bắt lỗi khi không thể play do Autoplay Policy
        audio.src = url;
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
          playPromise.catch((e) => {
            if (resolved) return;
            resolved = true;
            console.warn('Google TTS Autoplay blocked or failed:', e);
            this._currentTtsAudio = null;
            resolve(false);
          });
        }

        // Timeout: nếu sau 3s không phát được, fallback luôn
        setTimeout(() => {
          if (resolved) return;
          if (audio.paused && audio.currentTime === 0) {
            resolved = true;
            console.warn('Google TTS timed out, fallback to SpeechSynthesis');
            this._currentTtsAudio = null;
            resolve(false);
          }
        }, 3000);

      } catch (e) {
        console.warn('Google TTS exception:', e);
        resolve(false);
      }
    });
  },

  /**
   * Dừng tất cả TTS
   */
  stopSpeaking() {
    // Dừng Google TTS audio
    if (this._currentTtsAudio) {
      try {
        this._currentTtsAudio.pause();
        this._currentTtsAudio.currentTime = 0;
      } catch(e) {}
      this._currentTtsAudio = null;
    }
    this._ttsQueue = [];
    this._ttsPlaying = false;

    // Dừng cả SpeechSynthesis (nếu đang dùng fallback)
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  },

  /**
   * Chia text thành các đoạn nhỏ theo câu/dấu phẩy
   */
  _splitText(text, maxLen) {
    if (text.length <= maxLen) return [text];

    const chunks = [];
    // Chia theo dấu câu trước
    const sentences = text.split(/(?<=[.!?।।])\s+/);
    let current = '';

    for (const sentence of sentences) {
      if (sentence.length > maxLen) {
        // Câu quá dài → chia theo dấu phẩy
        if (current) { chunks.push(current.trim()); current = ''; }
        const parts = sentence.split(/(?<=[,;:])\s+/);
        for (const part of parts) {
          if ((current + ' ' + part).trim().length > maxLen) {
            if (current) chunks.push(current.trim());
            current = part;
          } else {
            current = (current + ' ' + part).trim();
          }
        }
      } else if ((current + ' ' + sentence).trim().length > maxLen) {
        if (current) chunks.push(current.trim());
        current = sentence;
      } else {
        current = (current + ' ' + sentence).trim();
      }
    }
    if (current) chunks.push(current.trim());

    return chunks.length > 0 ? chunks : [text.substring(0, maxLen)];
  },

  /**
   * Fallback: SpeechSynthesis (nếu Google TTS không hoạt động)
   * Dùng giọng tiếng Việt có sẵn trên hệ thống
   */
  _speakFallback(text, lang = 'vi') {
    if (!window.speechSynthesis) {
      this._ttsPlaying = false;
      setTimeout(() => this._playNextTts(), 100);
      return;
    }
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    utterance.rate = 0.9;
    utterance.volume = 0.9;
    utterance.pitch = 1.0;
    
    // Tìm giọng tiếng Việt
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang.startsWith('vi'));
    if (viVoice) utterance.voice = viVoice;
    
    utterance.onend = () => {
      this._ttsPlaying = false;
      setTimeout(() => this._playNextTts(), 150);
    };
    
    utterance.onerror = () => {
      this._ttsPlaying = false;
      setTimeout(() => this._playNextTts(), 100);
    };
    
    window.speechSynthesis.speak(utterance);
  },

  // Speak a sample for testing in settings
  speakSample(lang = 'vi') {
    const samples = {
      vi: 'Xin chào. Đây là giọng đọc AI của BlindNav. Phía trước có vật cản, hãy đi sang bên trái.',
      en: 'Hello. This is BlindNav AI voice. There is an obstacle ahead, please move to the left.'
    };
    this.speak(samples[lang] || samples.vi, lang);
  },

  // Check if TTS supports Vietnamese
  checkVietnameseSupport() {
    return true; // Luôn hỗ trợ vì dùng Google TTS + SpeechSynthesis fallback
  },

  // ═══════════════════════════════════════════
  // INTERNAL — Tone generator
  // ═══════════════════════════════════════════
  _playTone(frequency, duration, volume = 0.3) {
    try {
      const ctx = this.getContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      
      // Smooth envelope to avoid clicks
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration + 0.05);
      
      this.currentOscillators.push(oscillator);
      oscillator.onended = () => {
        this.currentOscillators = this.currentOscillators.filter(o => o !== oscillator);
      };
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  },

  /**
   * Play audio from Base64 data URL
   */
  playBase64Audio(base64Data) {
    if (!base64Data) return;
    try {
      const audio = new Audio(base64Data);
      audio.volume = 1.0;
      audio.play().catch(e => {
        console.warn('Base64 audio playback failed:', e);
        // Fallback: try with AudioContext
        this._playBase64WithContext(base64Data);
      });
    } catch(e) {
      console.warn('playBase64Audio error:', e);
    }
  },

  _playBase64WithContext(base64Data) {
    try {
      const ctx = this.getContext();
      // Extract the base64 content after the comma
      const base64 = base64Data.split(',')[1];
      if (!base64) return;
      const raw = atob(base64);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      ctx.decodeAudioData(arr.buffer, (buffer) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      });
    } catch(e) {
      console.warn('AudioContext fallback failed:', e);
    }
  },

  _stopAll() {
    this.currentOscillators.forEach(osc => {
      try { osc.stop(); } catch(e) {}
    });
    this.currentOscillators = [];
  }
};

// Pre-load voices as fallback
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
  // Force load voices
  window.speechSynthesis.getVoices();
}

// Mark user interaction on first touch/click (needed for autoplay policy)
document.addEventListener('click', () => AudioManager.markUserInteraction(), { once: true });
document.addEventListener('touchstart', () => AudioManager.markUserInteraction(), { once: true });
