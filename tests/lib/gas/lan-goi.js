/**
 * Chạy một đoạn code trong "một lần gọi GAS" của hộp cát, bằng chính cửa vào thật `runEntryPoint` (`server/entry/EntryPoint.js`).
 *
 * Vì sao không tự viết begin/end: bản tự viết cũ chỉ mở sổ thay đổi mà quên bản đọc DocumentProperties, trong khi cửa vào thật mở cả hai, nhả Log và gỡ lỗi cũ. Test chạy trong một lần gọi khác thật là test kiểm một hệ không tồn tại. Gọi cửa thật thì cửa đổi gì test đổi theo.
 *
 * Hộp chưa nạp `server/entry/EntryPoint.js` thì ném lỗi rõ, không lùi về bản tự viết.
 */

const TEN_LAN_GOI = 'lanGoiThu';

function trongLanGoi(hop, fn) {
  if (typeof hop.runEntryPoint !== 'function') {
    throw new Error('Hộp cát chưa nạp server/entry/EntryPoint.js nên không chạy được một lần gọi thật. Nạp tệp đó (có sẵn trong TEP_NEN của tests/lib/dung-hop.js).');
  }
  return hop.runEntryPoint(TEN_LAN_GOI, 'core', fn);
}

module.exports = { trongLanGoi, TEN_LAN_GOI };
