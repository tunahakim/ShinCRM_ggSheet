/**
 * Người điều phối của cài đặt: lưu một phần, kiểm ngầm định của một kênh nhập, và dựng gói `config` cho Sidebar. Tài liệu 01 Phần 2.8.
 *
 * Các hàm ở đây không biết cách đọc kho hay cách kiểm; chúng gọi công cụ của `SettingsGate.js`, `SettingsKinds.js`, Category và cổng thông báo theo thứ tự.
 */

/**
 * Lưu một hay nhiều phần cài đặt trong một gói `{ tên phần: phần thay đổi }`: trong một lần cầm khóa tài liệu thì đọc giá trị đang lưu của từng phần, phủ phần thay đổi, đọc Category một lần khi có phần cần, kiểm hết mọi phần, rồi mới ghi. Một phần không đạt thì cả gói không ghi gì, nên không có nửa gói đã lưu.
 *
 * Trả `{ ok: true, values: { tên phần: giá trị } }` hoặc `{ ok: false, problems }` (mỗi dòng `{ section, field, label, reason }`). Không đạt không phải lỗi hệ thống: bên gọi hiện từng dòng cho người dùng sửa. Phần có `sidebarConfig` nằm trong gói `config` của Sidebar nên lưu xong phát tín hiệu nạp lại qua hậu xử lý chung.
 */
function settingsSave(patches) {
  var sections = Object.keys(patches || {}).map(settingsSection);
  if (!sections.length) { throw new Error('settingsSave cần ít nhất một phần cài đặt.'); }
  var reload = sections.some(function (section) { return section.sidebarConfig === true; });
  // Thiếu hậu xử lý nạp lại thì dừng trước khi ghi, để không có cài đặt đã lưu mà Sidebar không được báo.
  if (reload) { writeCommitAssertAvailable(); }
  return documentLockRun(function () {
    var category = null, values = {}, problems = [];
    sections.forEach(function (section) {
      var needsCategory = settingsNeedsCategory(section);
      if (needsCategory && !category) { category = categoryReadAll(); }
      var checked = settingsValidate(section, Object.assign(settingsRead(section), patches[section.name] || {}), needsCategory ? { category: category } : {});
      checked.problems.forEach(function (p) { problems.push(Object.assign({ section: section.name }, p)); });
      values[section.name] = checked.values;
    });
    if (problems.length) { return { ok: false, problems: problems }; }
    sections.forEach(function (section) { settingsWrite(section, values[section.name]); });
    if (reload) { writeCommitAfterSuccess({ source: 'user', surface: 'config', entity: 'config' }); }
    return { ok: true, values: values };
  }, 'Đang có thao tác khác giữ khóa tệp; thử lưu cài đặt lại sau ít giây.');
}

/** Đặt một phần về mặc định (xóa khóa): lối thoát khi khóa hỏng. Trong khóa tài liệu như mọi lần ghi cài đặt. */
function settingsReset(sectionName) {
  var section = settingsSection(sectionName);
  if (section.sidebarConfig === true) { writeCommitAssertAvailable(); }
  return documentLockRun(function () {
    settingsClear(section);
    if (section.sidebarConfig === true) { writeCommitAfterSuccess({ source: 'user', surface: 'config', entity: 'config' }); }
    return { ok: true, section: section.name };
  }, 'Đang có thao tác khác giữ khóa tệp; thử đặt lại cài đặt sau ít giây.');
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
    var saved = settingsSave({ core_ops: patch });
    if (!saved.ok) { throw new Error('Không tắt được LOG_TRACE: ' + saved.problems.map(function (p) { return p.reason; }).join(' ')); }
    settingsLogTraceNotice('off');
    return saved;
  });
}
