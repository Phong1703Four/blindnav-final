const fs = require('fs');
let content = fs.readFileSync('js/user-app.js', 'utf8');

// Fix 1: onDataConnected for Camera Share
content = content.replace(
  '      setTimeout(() => this.shareCameraToFamily(), 2000);',
  '      if (typeof BlindNavRTC !== \\'undefined\\' && BlindNavRTC.isConnected()) { this.shareCameraToFamily(); }'
);

content = content.replace(
  /      BlindNavRTC\.onRequestCamera = \(\) => {\s*console\.log\('📹 Family requesting camera feed'\);\s*this\.reshareCameraFeed\(\);\s*};/,
  '      BlindNavRTC.onRequestCamera = () => {\\n        console.log(\\'📹 Family requesting camera feed\\');\\n        this.reshareCameraFeed();\\n      };\\n      BlindNavRTC.onDataConnected = () => {\\n        if (this.cameraActive && this.cameraStream) this.shareCameraToFamily();\\n      };'
);

// Fix 2: callObj
content = content.replace(
  'if (typeof BlindNavRTC !== \\'undefined\\' && BlindNavRTC._incomingOfferSdp) {\\n      BlindNavRTC.answerCall(BlindNavRTC._incomingOfferSdp);',
  'if (typeof BlindNavRTC !== \\'undefined\\' && BlindNavRTC.callObj) {\\n      BlindNavRTC.answerCall();'
);

content = content.replace(
  /if \(BlindNavRTC\._incomingOfferSdp && !document\.getElementById\('call-overlay'\)\?\.classList\.contains\('active'\)\) {/,
  'if (typeof BlindNavRTC !== \\'undefined\\' && BlindNavRTC.callObj && !document.getElementById(\\'call-overlay\\')?.classList.contains(\\'active\\')) {'
);
content = content.replace(
  /this\.showIncomingCall\(\{ callerName: 'Con Lan' \}\);/,
  'this.showIncomingCall({ callerName: I18n.t(\\'user.family\\') });'
);

// Fix 3: Strings
content = content.replace(/'Bố'/g, "I18n.t('user.defaultBlindUser')");
content = content.replace(/'Bạn'/g, "I18n.t('user.you')");
content = content.replace(/msg\.sender \|\| 'Con Lan'/g, "msg.sender || I18n.t('user.family')");
content = content.replace(/msg\.text \|\| 'Tin nhắn mới'/g, "msg.text || I18n.t('user.newMessage')");
content = content.replace(/'Con Lan'/g, "I18n.t('user.family')");

content = content.replace(/'📍 Đang gửi vị trí GPS\.\.\.'/g, "I18n.t('user.sosStep1Active')");
content = content.replace(/'✅ Đã gửi vị trí GPS'/g, "I18n.t('user.sosStep1Done')");
content = content.replace(/'📞 Đang gọi cho Con Lan\.\.\.'/g, "I18n.t('user.sosStep2Active')");
content = content.replace(/'✅ Đang gọi cho Con Lan'/g, "I18n.t('user.sosStep2Done')");
content = content.replace(/'🔊 Ghi âm môi trường đang bật'/g, "I18n.t('user.sosStep3Done')");
content = content.replace(/'Đang kết nối cuộc gọi với Con Lan\.'/g, "I18n.t('user.sosSpeaking')");
content = content.replace(/'⚠️ Không thể gọi video — đã gửi SMS'/g, "I18n.t('user.sosStep2Fail')");
content = content.replace(/'✅ Đã thông báo người thân'/g, "I18n.t('user.sosStep3Fail')");
content = content.replace(/'Bố ơi, con đang theo dõi bố trên app\. Bố đi cẩn thận nhé! 💙'/g, "I18n.t('user.trackingMsg1')");
content = content.replace(/'Đường Hàng Bông đang sửa, bố đi đường Phủ Doãn nhé\.'/g, "I18n.t('user.trackingMsg2')");

fs.writeFileSync('js/user-app.js', content);
