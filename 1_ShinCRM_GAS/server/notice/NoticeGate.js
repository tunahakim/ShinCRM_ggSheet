/**
 * Cổng thông báo duy nhất: nơi nào cần báo gì cho người dùng chỉ gọi cổng này. Tài liệu 10 Phần 8.
 *
 * Lõi chỉ phát dữ liệu theo hợp đồng một thông báo; mỗi kênh (Sidebar, bot sau này) là adapter đọc `noticeList()` và tự hiện. Cổng không biết kênh nào đang đọc.
 *
 * Mỗi thông báo là một khóa DocumentProperties riêng `NOTICE:<key>`, không phải một danh sách chung: hai lượt chạy song song (trigger nền và Sidebar) phát hai thông báo khác nhau thì không có bước đọc – sửa – ghi chung nào để đè mất của nhau. Bản đọc kho của lần gọi đã lấy cả kho bằng một `getProperties()`, nên liệt kê và kiểm "đã có chưa" không tốn thêm lệnh.
 *
 * Bốn hàm cổng không bao giờ ném lỗi, vì chúng hay chạy ngay trong khối bắt lỗi; lỗi của chính cổng ghi `Log` và `console.error`. Không lấy `LockService`, cùng lý do với module log: khóa của dự án không tái nhập.
 */

var NOTICE_KEY_PREFIX = 'NOTICE:';

/** Khóa của một việc: một việc có đúng một thông báo. */
function noticeKey(topic, scope) {
  return String(topic || '') + ':' + String(scope === null || scope === undefined ? '' : scope);
}

/** Lỗi của chính cổng: ghi Log và console, không ném. */
function noticeFail(action, error, detail) {
  var reason = error && error.code ? error.code : errorMessage(error);
  try { console.error('NoticeGate ' + action + ': ' + errorMessage(error)); } catch (khongCoConsole) { /* console không có thì Log bên dưới vẫn ghi */ }
  logEvent({ source: 'notice', action: action, outcome: LOG_ERROR, reason: reason, detail: detail || {} });
}

/** Che bí mật rồi cắt chữ theo số ký tự còn được dùng. */
function noticeText(value, room) {
  var text = logMaskText(String(value === null || value === undefined ? '' : value));
  if (text.length > room) { text = text.slice(0, Math.max(0, room - 1)) + '…'; }
  return text;
}

/**
 * Dựng bản lưu từ đầu vào của bên phát. Loại lạ vẫn dựng (mức lỗi, bấm ✕ mới hết) để thông báo không mất, và ghi Log để lộ chỗ gọi sai.
 * Trần `NOTICE_CHARS_MAX` tính chung cho tiêu đề, các dòng và gợi ý, giữ mỗi khóa dưới giới hạn 9 KB của DocumentProperties.
 */
function noticeShape(input) {
  var topic = String(input.topic || '');
  var rule = Object.prototype.hasOwnProperty.call(NOTICE_TOPICS, topic) ? NOTICE_TOPICS[topic] : null;
  if (!rule) { noticeFail('raise', { code: 'NOTICE_TOPIC_UNKNOWN', message: 'Loại thông báo "' + topic + '" không có trong NOTICE_TOPICS.' }, { topic: topic }); }
  var room = SETTINGS.NOTICE_CHARS_MAX;
  var title = noticeText(input.title, room);
  room -= title.length;
  var lines = [];
  (Array.isArray(input.lines) ? input.lines : []).forEach(function (line) {
    if (room <= 0) { return; }
    var text = noticeText(line, room);
    room -= text.length;
    lines.push(text);
  });
  if (Array.isArray(input.lines) && lines.length < input.lines.length) { lines.push('… (còn nữa, đã cắt bớt)'); }
  var hint = room > 0 ? noticeText(input.hint, room) : '';
  var actions = (Array.isArray(input.actions) ? input.actions : []).map(function (item) {
    return { label: String(item && item.label || ''), action: String(item && item.action || '') };
  });
  return {
    key: noticeKey(topic, input.scope),
    topic: topic,
    scope: String(input.scope === null || input.scope === undefined ? '' : input.scope),
    level: rule ? rule.level : 'error',
    clear: rule ? rule.clear : 'dismiss',
    source: String(input.source || ''),
    title: title,
    lines: lines,
    hint: hint,
    actions: actions,
    at: logNow()
  };
}

/** Hai thông báo cùng nội dung (bỏ qua `at`): phát lại đúng nội dung cũ thì không ghi lại kho. */
function noticeSame(a, b) {
  var strip = function (notice) { var copy = Object.assign({}, notice); delete copy.at; return JSON.stringify(copy); };
  return strip(a) === strip(b);
}

/** Đọc một thông báo đã lưu; hỏng thì ném `DOCUMENT_PROPERTY_CORRUPT` cho bên gọi quyết. */
function noticeRead(props, storeKey) {
  return documentPropertyJson(props, storeKey, 'thông báo', 'object');
}

/** Vượt trần số thông báo thì gỡ cái cũ nhất. Chỉ chạy khi vừa thêm khóa mới. */
function noticeEnforceMax(props, all) {
  var keys = Object.keys(all).filter(function (key) { return key.indexOf(NOTICE_KEY_PREFIX) === 0; });
  if (keys.length <= SETTINGS.NOTICE_MAX) { return; }
  var dated = keys.map(function (key) {
    var at = '';
    try { at = noticeRead(props, key).at || ''; } catch (khoaHong) { at = ''; }
    return { key: key, at: String(at) };
  }).sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
  dated.slice(0, keys.length - SETTINGS.NOTICE_MAX).forEach(function (item) {
    props.deleteProperty(item.key);
    logEvent({ source: 'notice', action: 'evict', outcome: LOG_ERROR, reason: 'NOTICE_MAX_EXCEEDED', detail: { key: item.key } });
  });
}

/** Phát hoặc ghi đè thông báo của một việc. Trả `true` khi thông báo mới hoặc đổi nội dung (và khi cổng lỗi: thà ghi Log thừa còn hơn mất lỗi). */
function noticeRaise(input) {
  try {
    var props = documentProps();
    var notice = noticeShape(input || {});
    var storeKey = NOTICE_KEY_PREFIX + notice.key;
    var old = null;
    try { old = noticeRead(props, storeKey); } catch (khoaHong) {
      if (khoaHong.code !== 'DOCUMENT_PROPERTY_CORRUPT') { throw khoaHong; }
      // Khóa hỏng của chính việc này: ghi đè bằng bản mới là đủ, không cần báo thêm một thông báo hỏng.
      logEvent({ source: 'notice', action: 'raise', outcome: LOG_ERROR, reason: khoaHong.code, detail: { key: storeKey } });
    }
    if (old && noticeSame(old, notice)) { return false; }
    props.setProperty(storeKey, JSON.stringify(notice));
    if (!old) { noticeEnforceMax(props, props.getProperties()); }
    return true;
  } catch (error) {
    noticeFail('raise', error, { topic: String(input && input.topic || ''), scope: String(input && input.scope || '') });
    return true;
  }
}

/** Việc vừa chạy thành công: gỡ thông báo của nó nếu có. Trả thông báo cũ (để bên gọi ghi "đã hết lỗi") hoặc `null`. */
function noticeResolve(topic, scope) {
  try {
    var props = documentProps();
    var storeKey = NOTICE_KEY_PREFIX + noticeKey(topic, scope);
    if (props.getProperty(storeKey) === null) { return null; }
    var old;
    try { old = noticeRead(props, storeKey); } catch (khoaHong) {
      if (khoaHong.code !== 'DOCUMENT_PROPERTY_CORRUPT') { throw khoaHong; }
      old = { title: '(thông báo cũ không đọc được)' };
    }
    props.deleteProperty(storeKey);
    return old;
  } catch (error) {
    noticeFail('resolve', error, { topic: String(topic), scope: String(scope || '') });
    return null;
  }
}

/** Người dùng bấm ✕. Thông báo nào cũng bỏ được. Trả `true` khi có khóa để gỡ. */
function noticeDismiss(key) {
  try {
    var props = documentProps();
    var storeKey = NOTICE_KEY_PREFIX + String(key || '');
    if (!key || props.getProperty(storeKey) === null) { return false; }
    props.deleteProperty(storeKey);
    return true;
  } catch (error) {
    noticeFail('dismiss', error, { key: String(key || '') });
    return false;
  }
}

/**
 * Danh sách cho adapter: lỗi trước, trong cùng mức thì mới trước. Danh sách không bị xóa khi trả; thông báo chỉ hết theo `clear`.
 * Khóa hỏng thì ghi Log, xóa khóa và thay bằng thông báo `notice_corrupt`. Không đọc được kho thì trả một thông báo `notice_unreadable` không lưu.
 */
function noticeList() {
  try {
    var props = documentProps();
    var all = props.getProperties();
    var list = [];
    Object.keys(all).forEach(function (storeKey) {
      if (storeKey.indexOf(NOTICE_KEY_PREFIX) !== 0) { return; }
      try {
        list.push(noticeRead(props, storeKey));
      } catch (khoaHong) {
        if (khoaHong.code !== 'DOCUMENT_PROPERTY_CORRUPT') { throw khoaHong; }
        logEvent({ source: 'notice', action: 'list', outcome: LOG_ERROR, reason: khoaHong.code, detail: { key: storeKey } });
        props.deleteProperty(storeKey);
        var scope = storeKey.slice(NOTICE_KEY_PREFIX.length);
        noticeRaise({ topic: 'notice_corrupt', scope: scope, source: 'notice', title: 'Một thông báo trong kho bị hỏng nên đã bị xóa.', lines: ['Khóa: ' + scope], hint: 'Chi tiết lỗi gốc vẫn ở sheet Log.' });
        list.push(noticeRead(props, NOTICE_KEY_PREFIX + noticeKey('notice_corrupt', scope)));
      }
    });
    return list.sort(function (a, b) {
      var level = (NOTICE_LEVEL_ORDER[a.level] === undefined ? 0 : NOTICE_LEVEL_ORDER[a.level]) - (NOTICE_LEVEL_ORDER[b.level] === undefined ? 0 : NOTICE_LEVEL_ORDER[b.level]);
      if (level) { return level; }
      return a.at < b.at ? 1 : a.at > b.at ? -1 : 0;
    });
  } catch (error) {
    noticeFail('list', error, {});
    var fallback = noticeShape({ topic: 'notice_unreadable', scope: '', source: 'notice', title: 'Không đọc được kho thông báo: ' + errorMessage(error), hint: 'Chi tiết ở sheet Log. Thông báo này tự mất khi đọc lại được.' });
    return [fallback];
  }
}
