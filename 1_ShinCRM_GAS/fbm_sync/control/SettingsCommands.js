/**
 * Người điều phối các lệnh cài đặt của đồng bộ FBM (`save_settings`, `set_master`, `set_background`, `reset_settings`) và gói cài đặt cho màn đồng bộ. Mọi lần ghi đi qua `settingsSave`/`settingsReset` của cổng cài đặt chung; ở đây chỉ thêm các bước kiểm cần dữ liệu ngoài phần cài đặt (danh sách khách cho phạm vi, xác nhận chu kỳ dày) và việc đi kèm (dừng lượt khi tắt công tắc).
 *
 * Lưu nhiều phần trong một gói: phần nào không đạt thì cả gói không ghi, nên công tắc tổng gửi kèm tham số phiên sai không đổi được.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Phần cài đặt của `fbm_sync`; lệnh từ Sidebar chỉ được chạm các phần này. */
FbmSync.settingsOwnSection = function (name) {
  var section = settingsSection(name);
  if (section.owner !== 'fbm_sync') {
    var foreign = new Error('Phần cài đặt "' + name + '" không thuộc đồng bộ FBM.');
    foreign.code = 'SETTINGS_SECTION_UNKNOWN';
    throw foreign;
  }
  return section;
};

/**
 * Công cụ kiểm (thuần): mã khách ShinCRM trong danh sách phải có trên Sheet. Trả dòng đổi mã (để Sidebar hiện mã → khách) và lỗi nếu có; mã FBM chưa có trên Sheet là khách mới bên FBM nên hợp lệ.
 */
FbmSync.scopeCodesCheck = function (codes, customers) {
  var lines = FbmSync.scopeResolve(codes, customers).lines;
  var notFound = lines.filter(function (line) { return line.status === 'not_found'; }).map(function (line) { return line.code; });
  return { lines: lines, problem: notFound.length ? { section: FbmSync.SETTING_SECTIONS.run, field: 'scopeCodes', label: 'Danh sách khách chỉ định', reason: 'Không tìm thấy mã khách ShinCRM trên Sheet Customer: ' + notFound.join(', ') + '. Danh sách đang lưu giữ nguyên.' } : null };
};

/** Công cụ kiểm (thuần): tiến trình nền khác Giữ phiên đang bật mà chu kỳ dưới `SETTINGS.FBM_SCHEDULE_LOW_MINUTES` thì trả câu hỏi xác nhận; không thì rỗng. */
FbmSync.scheduleLowQuestion = function (values) {
  var lowMinutes = Number(SETTINGS.FBM_SCHEDULE_LOW_MINUTES), section = settingsSection(FbmSync.SETTING_SECTIONS.background);
  var low = FbmSync.SCHEDULE_KINDS.filter(function (kind) { return kind !== 'heartbeat' && values[kind + 'Enabled'] && values[kind + 'Minutes'] < lowMinutes; })
    .map(function (kind) { return section.fields[kind + 'Enabled'].label + ' ' + values[kind + 'Minutes'] + ' phút'; });
  return low.length ? 'Chu kỳ dưới ' + lowMinutes + ' phút sẽ chạy dày, tốn hạn mức FBM và GAS: ' + low.join(', ') + '. Vẫn lưu?' : '';
};

/**
 * Lệnh `save_settings` (chạy trong khóa điều phối): `{ patches: { tên phần: phần thay đổi }, confirmLow }`, giá trị ô gửi nguyên chuỗi người dùng gõ.
 * Kiểm từng phần trên giá trị đang lưu phủ phần thay đổi → kiểm phạm vi khách với Sheet Customer khi đổi danh sách → hỏi xác nhận khi lịch nền chạy dày → `settingsSave` cả gói → công tắc tổng vừa tắt thì áp điều kiện dừng ngay trong khóa.
 * Không đạt trả `{ ok: false, code: 'SETTINGS_INVALID', problems }` và ghi Log; chưa xác nhận trả `{ ok: false, code: 'SCHEDULE_LOW_CONFIRM', message }`, chưa ghi gì.
 */
FbmSync.settingsSaveCommand = function (input) {
  var patches = input.patches || {}, names = Object.keys(patches), problems = [], merged = {};
  names.forEach(function (name) {
    var section = FbmSync.settingsOwnSection(name), checked = settingsValidate(section, Object.assign(settingsRead(section), patches[name]), {});
    checked.problems.forEach(function (p) { problems.push(Object.assign({ section: name }, p)); });
    merged[name] = settingsEffective(section, checked.values);
  });
  var run = FbmSync.SETTING_SECTIONS.run, scopeLines = null;
  if (!problems.length && patches[run] && patches[run].scopeCodes !== undefined) {
    var scope = FbmSync.scopeCodesCheck(merged[run].scopeCodes, FbmSync.readLocal('customer'));
    scopeLines = FbmSync.scopeLengthMark(scope.lines, settingsValues(FbmSync.SETTING_SECTIONS.account));
    if (scope.problem) { problems.push(scope.problem); }
  }
  if (problems.length) { return FbmSync.settingsRejected(problems, scopeLines); }
  var question = merged[FbmSync.SETTING_SECTIONS.background] && input.confirmLow !== true ? FbmSync.scheduleLowQuestion(merged[FbmSync.SETTING_SECTIONS.background]) : '';
  if (question) { return { ok: false, code: 'SCHEDULE_LOW_CONFIRM', message: question }; }
  var saved = settingsSave(patches);
  if (!saved.ok) { return FbmSync.settingsRejected(saved.problems, scopeLines); }
  if (merged[FbmSync.SETTING_SECTIONS.master] && merged[FbmSync.SETTING_SECTIONS.master].enabled === false) { FbmSync.stopPendingApply(); }
  FbmSync.scopeLengthWarn(scopeLines);
  return { ok: true, scopeLines: scopeLines, settings: FbmSync.settingsView(), status: FbmSync.statusView() };
};

/** Từ chối lưu phải để lại dấu ở Log, không chỉ hiện ở Sidebar. */
FbmSync.settingsRejected = function (problems, scopeLines) {
  logEvent({ source: 'fbm_sync', action: 'settings_save', outcome: LOG_ERROR, reason: problems.map(function (p) { return p.reason; }).join(' '), detail: { fields: problems.map(function (p) { return p.section + '.' + p.field; }) } });
  return { ok: false, code: 'SETTINGS_INVALID', problems: problems, scopeLines: scopeLines, message: 'Chưa lưu cài đặt: ' + problems.map(function (p) { return p.reason; }).join(' ') };
};

/** Mã FBM chưa có trên Sheet, đúng tiền tố mà khác độ dài đã cài: vẫn lưu, chỉ cảnh báo vào Log. */
FbmSync.scopeLengthWarn = function (scopeLines) {
  var odd = (scopeLines || []).filter(function (line) { return line.lengthExpected; }).map(function (line) { return line.code; });
  if (!odd.length) { return; }
  logEvent({ source: 'fbm_sync', action: 'settings_save', outcome: LOG_WARN, reason: 'Mã khách chỉ định đúng tiền tố mã FBM nhưng khác độ dài đã cài: ' + odd.join(', ') + '. Vẫn lưu; kiểm tra lại nếu gõ thiếu hoặc thừa ký tự.', detail: { codes: odd } });
};

/** Lệnh `set_master` (ngoài khóa): ghi công tắc qua cổng cài đặt rồi, khi tắt, đi đúng tiến trình Dừng với kết luận `disabled`. */
FbmSync.masterSwitchCommand = function (enabled) {
  var patches = {};
  patches[FbmSync.SETTING_SECTIONS.master] = { enabled: enabled === true };
  var saved = settingsSave(patches);
  if (!saved.ok) { return FbmSync.settingsRejected(saved.problems, null); }
  var stop = enabled === true ? null : FbmSync.runStopCommand('master');
  return { ok: true, enabled: enabled === true, code: stop ? stop.code : '', status: FbmSync.statusView() };
};

/** Lệnh `set_background` (trong khóa): bật/tắt lịch nền qua cổng cài đặt. */
FbmSync.backgroundSwitchCommand = function (enabled) {
  var patches = {};
  patches[FbmSync.SETTING_SECTIONS.background] = { enabled: enabled === true };
  var saved = settingsSave(patches);
  if (!saved.ok) { return FbmSync.settingsRejected(saved.problems, null); }
  return { ok: true, enabled: enabled === true, settings: FbmSync.settingsView(), status: FbmSync.statusView() };
};

/** Lệnh `reset_settings` (trong khóa): đặt một phần cài đặt FBM về mặc định, lối thoát khi khóa của phần đó hỏng. Ghi Log vì đây là xóa cài đặt người dùng đã đặt. */
FbmSync.settingsResetCommand = function (input) {
  var section = FbmSync.settingsOwnSection(String(input.section || ''));
  settingsReset(section.name);
  logEvent({ source: 'fbm_sync', action: 'settings_reset', outcome: LOG_WARN, reason: 'Đã đặt "' + section.label + '" về mặc định theo yêu cầu người dùng.', detail: { section: section.name } });
  return { ok: true, settings: FbmSync.settingsView(), status: FbmSync.statusView() };
};

/**
 * Gói cài đặt cho màn đồng bộ: giá trị hiệu lực của từng phần theo tên phần, cộng `spreadsheetId`. Phần nào khóa hỏng thì giá trị là `null` và có một dòng trong `corrupt` (tên phần, nhãn, lời báo) để Sidebar hiện lỗi kèm nút "Đặt về mặc định"; mỗi lần đọc thấy hỏng đều ghi Log.
 */
FbmSync.settingsView = function () {
  var view = { spreadsheetId: FbmSync.currentSpreadsheetId(), corrupt: [] };
  settingsSectionList().filter(function (section) { return section.owner === 'fbm_sync'; }).forEach(function (section) {
    try { view[section.name] = settingsValues(section.name); } catch (err) {
      if (!err || err.code !== 'DOCUMENT_PROPERTY_CORRUPT') { throw err; }
      view[section.name] = null;
      view.corrupt.push({ section: section.name, label: section.label, message: String(err.message) });
      logEvent({ source: 'fbm_sync', action: 'settings_read', outcome: LOG_ERROR, reason: String(err.message), detail: { section: section.name } });
    }
  });
  return view;
};

/** Lệnh `assign_background_machine` (trong khóa): giao máy Sidebar đang mở chạy nền (`machineId` Extension máy đó tự sinh, `name` Sidebar dựng để người dùng nhận ra máy). Thay máy cũ nếu có; ghi Log vì đổi máy là đổi nơi đồng bộ nền chạy. */
FbmSync.backgroundMachineAssignCommand = function (input) {
  var machineId = String(input.machineId || '');
  if (!machineId) { var missing = new Error('Chưa có mã máy Extension: máy này chưa cài Extension ShinCRM hoặc Extension chưa chạy.'); missing.code = 'MACHINE_ID_REQUIRED'; throw missing; }
  var previous = FbmSync.backgroundMachineRead(), machine = FbmSync.backgroundMachineWrite(FbmSync.machineAssigned(machineId, input.name, Date.now()));
  logEvent({ source: 'fbm_sync', action: 'background_machine_assign', outcome: LOG_OK, reason: 'Giao máy "' + machine.name + '" chạy đồng bộ nền' + (previous.machineId && previous.machineId !== machineId ? ' thay máy "' + previous.name + '".' : '.'), detail: { machineId: machine.machineId, fromMachineId: previous.machineId } });
  return { ok: true, status: FbmSync.statusView() };
};

/** Lệnh `release_background_machine` (trong khóa): gỡ máy chạy nền; từ lần hỏi kế, không máy nào chạy nền tới khi giao máy mới. */
FbmSync.backgroundMachineReleaseCommand = function () {
  var previous = FbmSync.backgroundMachineRead();
  FbmSync.backgroundMachineWrite(null);
  logEvent({ source: 'fbm_sync', action: 'background_machine_release', outcome: LOG_WARN, reason: previous.machineId ? 'Đã gỡ máy "' + previous.name + '" khỏi chạy nền; chưa máy nào chạy đồng bộ nền.' : 'Gỡ máy chạy nền khi chưa giao máy nào.', detail: { machineId: previous.machineId } });
  return { ok: true, status: FbmSync.statusView() };
};
