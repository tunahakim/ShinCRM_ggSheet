/* Nghe kênh đẩy `/bind` của Google Sheets để biết "vừa có thay đổi" mà không phải hỏi GAS theo nhịp.
 * Chỉ quan sát thô: không biết ô nào đổi, không giữ nội dung gói, không quyết định reload. Mỗi khung
 * chỉ được xếp vào một trong hai loại rồi báo cho cầu nối cùng trang: `signal` (có thể là thay đổi)
 * hoặc `alive` (nhiễu đã biết, chỉ chứng tỏ kênh còn sống). Kênh vừa mở cũng là `signal`, vì thay
 * đổi rơi vào khoảng kênh cũ chết – kênh mới mở không đi qua hook nào.
 *
 * Phải chạy MAIN world ở `document_start`: Sheets giữ tham chiếu `XMLHttpRequest` ngay khi nạp, vá
 * muộn là vô nghĩa. Vá prototype nên sống qua mọi lần Sheets tự mở lại kênh (khoảng 140 giây/lần).
 *
 * Bộ lọc là danh sách đen: chỉ bỏ `noop`, loại `10` (con trỏ người khác) và loại `14` (hiện diện).
 * Có khóa `"c"`, loại lạ hay khung cắt dở không nhận dạng được đều là `signal` — báo nhầm chỉ tốn một
 * lời hỏi, bỏ sót là Sidebar giữ dữ liệu cũ. Không tách khung theo số độ dài đứng đầu: số đó đếm byte
 * UTF-8 còn chuỗi JavaScript đếm UTF-16, tiếng Việt sẽ làm lệch con trỏ; quét regex thì không lệch.
 */
(function () {
  var SOURCE = 'SHINCRM_EXTENSION';
  var ACTION = 'CRM_BIND_EVENT';
  var NOISE_TYPES = { '10': true, '14': true, noop: true };
  var XHR = window.XMLHttpRequest;
  if (!XHR || !XHR.prototype || XHR.prototype.__shinBindWatched) { return; }

  function post(kind) {
    try { window.postMessage({ source: SOURCE, action: ACTION, kind: kind }, location.origin); } catch (postError) {}
  }

  function isNoise(chunk) {
    if (/"c"\s*:/.test(chunk)) { return false; }
    var found = [];
    var pattern = /\[\s*"noop"\s*\]|\[\s*(\d+)\s*,\s*\d{10,}\s*,/g;
    var match;
    while ((match = pattern.exec(chunk)) !== null) { found.push(match[1] === undefined ? 'noop' : match[1]); }
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
      var drain = function () {
        var text;
        try { text = self.responseText || ''; } catch (readError) { return; }
        if (text.length <= consumed) { return; }
        var chunk = text.slice(consumed);
        consumed = text.length;
        post(isNoise(chunk) ? 'alive' : 'signal');
      };
      this.addEventListener('readystatechange', function () { if (self.readyState >= 3) { drain(); } });
      this.addEventListener('progress', drain);
      this.addEventListener('load', drain);
      post('open');
    }
    return originalSend.apply(this, arguments);
  };
}());
