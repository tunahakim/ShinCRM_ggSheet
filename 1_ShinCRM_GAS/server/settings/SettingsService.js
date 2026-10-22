/**
 * Người điều phối của cài đặt: lưu một phần, kiểm ngầm định của một kênh nhập, và dựng gói `config` cho Sidebar. Tài liệu 01 Phần 2.8.
 *
 * Các hàm ở đây không biết cách đọc kho hay cách kiểm; chúng gọi công cụ của `SettingsGate.js`, `SettingsKinds.js`, Category và cổng thông báo theo thứ tự.
 */

/**
 * Lưu một phần cài đặt: trong một lần cầm khóa tài liệu thì đọc giá trị đang lưu, phủ phần thay đổi, đọc Category khi phần cần, kiểm, ghi, rồi phát tín hiệu nạp lại `config` qua hậu xử lý chung của mọi lượt ghi.
 *
 * Trả `{ ok: true, values }` hoặc `{ ok: false, problems }` (không ghi gì). Không đạt không phải lỗi hệ thống: bên gọi hiện từng dòng cho người dùng sửa.
 */
function settingsSave(sectionName, patch) {
  var section = settingsSection(sectionName);
  // Thiếu hậu xử lý nạp lại thì dừng trước khi ghi, để không có cài đặt đã lưu mà Sidebar không được báo.
  writeCommitAssertAvailable();
  return documentLockRun(function () {
    var values = Object.assign(settingsRead(section), patch || {});
    var checked = settingsValidate(section, values, settingsNeedsCategory(section) ? { category: categoryReadAll() } : {});
    if (!checked.ok) { return { ok: false, problems: checked.problems }; }
    settingsWrite(section, checked.values);
    writeCommitAfterSuccess({ source: 'user', surface: 'config', entity: 'config' });
    return { ok: true, values: checked.values };
  }, 'Đang có thao tác khác giữ khóa tệp; thử lưu cài đặt lại sau ít giây.');
}

/**
 * Ngầm định gõ tay đã kiểm của một kênh nhập (phần kiểu `fieldDefaults`, trường tên `values`). `category` là Category đã đọc của lần gọi.
 *
 * Category có thể đổi sau khi lưu, nên mỗi lần dùng đều kiểm lại bằng đúng bộ kiểm lúc lưu: giá trị lệch bị bỏ khỏi kết quả (form không điền, lượt kéo không ghi) và phát thông báo `settings_stale` theo tên phần; khớp lại thì thông báo tự hết.
 */
function settingsDefaultsChecked(sectionName, category) {
  var section = settingsSection(sectionName);
  var result = settingsDefaultsCheck(settingsRead(section).values, section.fields.values, category);
  if (!result.problems.length) {
    noticeResolve('settings_stale', section.name);
    return result.values;
  }
  noticeRaise({
    topic: 'settings_stale',
    scope: section.name,
    source: section.owner,
    title: section.label + ': có giá trị không còn hợp lệ, đã bỏ qua',
    lines: result.problems.map(function (p) { return (p.entity && p.field ? p.entity + '.' + p.field + ': ' : '') + p.reason; }),
    hint: 'Chọn lại giá trị trong Cài đặt. Trong lúc chờ, giá trị lệch không được điền.'
  });
  return result.values;
}

/** Thông báo `LOG_TRACE` đang bật: phát khi bật, gỡ khi tắt. */
function settingsLogTraceNotice(mode) {
  if (mode === 'off') { noticeResolve('log_trace_on', ''); return; }
  noticeRaise({
    topic: 'log_trace_on',
    scope: '',
    source: 'core',
    title: 'Đang bật ghi log chi tiết (' + mode + ')',
    lines: ['Sheet Log có thể chứa dữ liệu khách nguyên văn.'],
    hint: 'Tắt sau khi kiểm tra xong, nhất là trước khi chia sẻ tệp.'
  });
}

/**
 * Gói `config` cho RAM Sidebar, giữ hợp đồng cũ `{ sheetSchema, defaults, counters, sort, params }` để Sidebar không đổi theo cách lưu. `defaults` là ngầm định khi nhập trên Sidebar đã kiểm, theo thực thể rồi tên trường. `category` là Category bên gọi đã đọc.
 */
function settingsReadAll(category) {
  var data = settingsRead(settingsSection('core_data'));
  var ops = settingsRead(settingsSection('core_ops'));
  settingsLogTraceNotice(ops[LOG_TRACE_SETTING]);
  return {
    sheetSchema: data.columnTypes,
    defaults: settingsDefaultsChecked('defaults_sidebar', category),
    counters: idGateCounterValues(),
    sort: data.sort,
    params: ops
  };
}

/**
 * Đường chữa cháy, chạy tay trong trình chỉnh sửa Apps Script khi Sidebar không mở được: in mọi phần cài đặt đang lưu ra nhật ký thực thi. Phần nào đọc lỗi thì in lỗi của phần đó và in tiếp phần sau.
 */
function shinSettingsShow() {
  return runEntryPoint('shinSettingsShow', 'core', function () {
    var report = [];
    settingsSectionList().forEach(function (section) {
      try {
        report.push(section.label + ' (' + settingsKey(section) + '): ' + JSON.stringify(settingsRead(section)));
      } catch (err) {
        report.push(section.label + ' (' + settingsKey(section) + '): LỖI ' + String(err && err.message || err));
      }
    });
    report.forEach(function (line) { Logger.log(line); });
    return report;
  });
}

/** Đường chữa cháy: tắt `LOG_TRACE` khi Sidebar không mở được để tắt từ màn Cài đặt. */
function shinLogTraceOff() {
  return runEntryPoint('shinLogTraceOff', 'core', function () {
    var patch = {};
    patch[LOG_TRACE_SETTING] = 'off';
    var saved = settingsSave('core_ops', patch);
    if (!saved.ok) { throw new Error('Không tắt được LOG_TRACE: ' + saved.problems.map(function (p) { return p.reason; }).join(' ')); }
    settingsLogTraceNotice('off');
    return saved;
  });
}
