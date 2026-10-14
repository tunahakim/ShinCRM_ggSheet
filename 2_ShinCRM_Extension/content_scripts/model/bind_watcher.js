/* Nghe kênh đẩy `/bind` của Google Sheets để biết "vừa có thay đổi" mà không phải hỏi GAS theo nhịp.
 * Chỉ quan sát thô: không biết ô nào đổi, không giữ nội dung gói, không quyết định reload. Mỗi khung
 * chỉ được xếp vào một trong hai loại rồi báo cho cầu nối cùng trang: `signal` (có thể là thay đổi)
 * hoặc `alive` (nhiễu đã biết, chỉ chứng tỏ kênh còn sống). Kênh vừa mở cũng là `signal`, vì thay
 * đổi rơi vào khoảng kênh cũ chết – kênh mới mở không đi qua hook nào.
 *
 * Phải chạy MAIN world ở `document_start`: Sheets giữ tham chiếu `XMLHttpRequest` ngay khi nạp, vá
 * muộn là vô nghĩa. Vá prototype nên sống qua mọi lần Sheets tự mở lại kênh (khoảng 140 giây/lần).
 *
 * Bộ lọc là danh sách đen: chỉ bỏ `noop`, loại `10` (con trỏ người khác), loại `14` (hiện diện) và khung loại `1`
 * chỉ chở `{"THUMBNAIL":true}` (Google vẽ lại ảnh thu nhỏ của tệp, vài phút một lần). Loại `1` còn chở thứ khác
 * nên chỉ bỏ đúng dạng payload đó, không bỏ cả loại.
 * Có khóa `"c"`, loại lạ hay khung cắt dở không nhận dạng được đều là `signal` — báo nhầm chỉ tốn một
 * lời hỏi, bỏ sót là Sidebar giữ dữ liệu cũ. Không tách khung theo số độ dài đứng đầu: số đó đếm byte
 * UTF-8 còn chuỗi JavaScript đếm UTF-16, tiếng Việt sẽ làm lệch con trỏ; quét regex thì không lệch.
 *
 * Kèm sự thật thô để Sidebar tự quyết có hỏi GAS hay không: `sameSession` của lần mở kênh (mã phiên `SID`
 * trùng kênh trước) và `firstChunk`/`hasChange` của từng khung. Google tự gửi lại yêu cầu kênh khoảng 127
 * giây/lần trong cùng phiên, và khung đầu của lần đó thường không mang thay đổi; coi cả hai là tín hiệu thì
 * mỗi Sidebar hỏi GAS hai lần mỗi hai phút dù không ai sửa gì. Kênh cũ không kết thúc trước khi kênh mới
 * mở (đo 2026-10-14), nên không dựa vào khoảng hở thời gian mà dựa vào mã phiên.
 */
(function () {
  var SOURCE = 'SHINCRM_EXTENSION';
  var ACTION = 'CRM_BIND_EVENT';
  var NOISE_TYPES = { '10': true, '14': true, noop: true, thumbnail: true };
  var XHR = window.XMLHttpRequest;
  if (!XHR || !XHR.prototype || XHR.prototype.__shinBindWatched) { return; }

  var lastSid = '';

  function post(kind, facts) {
    var message = { source: SOURCE, action: ACTION, kind: kind };
    Object.keys(facts || {}).forEach(function (key) { message[key] = facts[key]; });
    try { window.postMessage(message, location.origin); } catch (postError) {}
  }

  function hasChange(chunk) {
    return /"c"\s*:/.test(chunk);
  }

  function isNoise(chunk) {
    if (hasChange(chunk)) { return false; }
    var found = [];
    var pattern = /\[\s*"noop"\s*\]|(\[\s*1\s*,\s*\d{10,}\s*,\s*\{\s*"THUMBNAIL"\s*:\s*true\s*\}\s*\])|\[\s*(\d+)\s*,\s*\d{10,}\s*,/g;
    var match;
    while ((match = pattern.exec(chunk)) !== null) { found.push(match[1] !== undefined ? 'thumbnail' : match[2] === undefined ? 'noop' : match[2]); }
    if (!found.length) { return false; }
    for (var i = 0; i < found.length; i++) {
      if (!NOISE_TYPES[found[i]]) { return false; }
    }
    return true;
  }

  var proto = XHR.prototype;
  var originalOpen = proto.open;
  var originalSend = proto.send;
  proto.__shinBindWatched = true;

  proto.open = function (method, url) {
    this.__shinBindMethod = method;
    this.__shinBindUrl = url;
    return originalOpen.apply(this, arguments);
  };

  proto.send = function () {
    var isChannel = /\/bind\b/.test(String(this.__shinBindUrl)) && String(this.__shinBindMethod || '').toUpperCase() === 'GET';
    if (isChannel) {
      var self = this;
      // `responseText` luôn trả cả phần đã nhận từ đầu; con trỏ giữ chỗ đã đọc để không xử lý lại.
      var consumed = 0;
      var firstChunk = true;
      var drain = function () {
        var text;
        try { text = self.responseText || ''; } catch (readError) { return; }
        if (text.length <= consumed) { return; }
        var chunk = text.slice(consumed);
        consumed = text.length;
        post(isNoise(chunk) ? 'alive' : 'signal', { firstChunk: firstChunk, hasChange: hasChange(chunk) });
        firstChunk = false;
      };
      this.addEventListener('readystatechange', function () { if (self.readyState >= 3) { drain(); } });
      this.addEventListener('progress', drain);
      this.addEventListener('load', drain);
      var sid = (String(this.__shinBindUrl).match(/[?&]SID=([^&#]+)/) || [])[1] || '';
      post('open', { sameSession: !!sid && sid === lastSid });
      lastSid = sid;
    }
    return originalSend.apply(this, arguments);
  };
}());
