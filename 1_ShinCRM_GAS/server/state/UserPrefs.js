/**
 * Ba núm chọn của sidebar, nhớ ở `PropertiesService.getUserProperties()`. Tài liệu 07 Phần 6, tài liệu 04 Phần 2, tài liệu 03 Phần 8.
 *
 * **`[RÀNG BUỘC CỨNG]`** tài liệu 07:125: đúng một chỗ nhớ, đọc một lần lúc mở sidebar trong lượt nạp vốn đã có, ghi một lần lúc bấm. Không khai ngầm định ở sheet `Config` — giá trị đã nhớ chính là ngầm định.
 *
 * `UserProperties` chứ không `DocumentProperties`: đây là thói dùng của một người, không phải trạng thái của tệp. Cùng tệp mở bằng hai tài khoản thì mỗi bên giữ núm riêng.
 */

/** Bảng khai ba núm: khóa lưu, kiểu, ngầm định, và với núm nhiều nấc thì cả tập giá trị hợp lệ. Thêm một núm là thêm một dòng ở đây. */
var USER_PREFS = {
  followSelection: { key: 'prefFollowSelection', type: 'bool', fallback: true },
  autoRenderView: { key: 'prefAutoRenderView', type: 'bool', fallback: true },
  activityView: { key: 'prefActivityView', type: 'enum', fallback: 'active', values: ['all', 'active', 'deleted'] }
};

/**
 * Một núm: chuỗi đã lưu thành giá trị đúng kiểu. Chưa lưu, hoặc lưu giá trị lạ, đều trả về ngầm định.
 *
 * Cả hai kiểu đối xử với giá trị lạ giống nhau — về ngầm định — nên luật phát biểu được thành một câu. Chỉ `userPrefsWrite` ghi vào kho này và nó kiểm trước khi ghi, nên giá trị lạ chỉ xuất hiện khi có người sửa tay `UserProperties`.
 */
function userPrefsOne(props, name) {
  var khai = USER_PREFS[name];
  var raw = props.getProperty(khai.key);
  if (raw === null || raw === undefined || raw === '') { return khai.fallback; }

  if (khai.type === 'bool') {
    if (String(raw) === 'true') { return true; }
    return String(raw) === 'false' ? false : khai.fallback;
  }

  return khai.values.indexOf(String(raw)) === -1 ? khai.fallback : String(raw);
}

/**
 * Cả ba núm. Trả về `{ followSelection, autoRenderView, activityView }`.
 *
 * **Không bao giờ ném lỗi**, cùng lý do như `dirtyStateRead`: hàm này nằm trên đường nạp lõi, nên nó hỏng là cả lượt mở sidebar hỏng. Không đọc được thì trả về ba ngầm định, và ba ngầm định là chiều an toàn — chúng chỉ đổi *khi nào vẽ* và *xem phần nào*, không đổi dữ liệu nào.
 */
function userPrefsRead() {
  var out = {};
  var names = Object.keys(USER_PREFS);

  try {
    var props = PropertiesService.getUserProperties();
    names.forEach(function (name) { out[name] = userPrefsOne(props, name); });
  } catch (khongDocDuocProps) {
    names.forEach(function (name) { out[name] = USER_PREFS[name].fallback; });
  }

  return out;
}

/**
 * Ghi một núm rồi trả về cả khối. Đây là cửa vào mà sidebar gọi lúc người dùng bấm.
 *
 * Trả về cả khối chứ không phải riêng núm vừa ghi, để client thay nguyên khối và không bao giờ có hai nguồn lệch nhau. Tên núm sai hay giá trị sai thì ném lỗi — khác hẳn chiều đọc, vì ở đây lỗi là do code gọi sai, không phải do dữ liệu cũ.
 */
function userPrefsWrite(name, value) {
  return runEntryPoint('userPrefsWrite', 'sidebar', 'throw', function () {
    var khai = USER_PREFS[name];
    if (!khai) {
      throw new Error('Không có núm chọn "' + name + '". Các núm hiện có: ' + Object.keys(USER_PREFS).join(', ') + '.');
    }

    var luu;
    if (khai.type === 'bool') {
      if (value !== true && value !== false) {
        throw new Error('Núm "' + name + '" là công tắc bật tắt nên chỉ nhận `true` hoặc `false`, nhận được: ' + JSON.stringify(value) + '.');
      }
      luu = value ? 'true' : 'false';
    } else {
      if (khai.values.indexOf(value) === -1) {
        throw new Error('Núm "' + name + '" chỉ nhận một trong ' + khai.values.join(', ') + ', nhận được: ' + JSON.stringify(value) + '.');
      }
      luu = value;
    }

    PropertiesService.getUserProperties().setProperty(khai.key, luu);

    logTrace({
      source: 'sidebar',
      action: 'userPrefsWrite',
      outcome: LOG_OK,
      reason: 'Ghi núm chọn',
      detail: { num: name, giaTri: luu }
    });

    return { ok: true, prefs: userPrefsRead(), dirty: dirtyStateRead() };
  });
}

/** Phép nghiệm thu chạy được trên Google: đọc khối, ghi thử một núm nhiều nấc, đọc lại, rồi trả về giá trị ban đầu. */
function probeUserPrefs() {
  var truoc = userPrefsRead();
  var report = ['probeUserPrefs — ba núm chọn của sidebar', '  khối ban đầu: ' + JSON.stringify(truoc)];

  var thu = truoc.activityView === 'all' ? 'deleted' : 'all';
  var sau = userPrefsWrite('activityView', thu).prefs;
  report.push('  ghi activityView = ' + thu + ' → đọc lại: ' + sau.activityView + (sau.activityView === thu ? ' (đạt)' : ' (KHÔNG ĐẠT)'));

  userPrefsWrite('activityView', truoc.activityView);
  report.push('  đã trả về giá trị ban đầu: ' + userPrefsRead().activityView);

  report.forEach(function (line) { Logger.log(line); });
  return report.join('\n');
}
