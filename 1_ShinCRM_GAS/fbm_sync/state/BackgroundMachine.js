/**
 * Kho máy chạy nền: GAS giữ đúng một máy được giao (mã máy Extension, tên, lúc giao, lần hỏi cuối). Chưa giao máy nào thì không máy nào chạy nền.
 * Tệp chỉ có công cụ đọc, ghi, kiểm và tính; người điều phối là lần hỏi của Extension (`heartbeatRun`) và lệnh giao/gỡ máy (`SettingsCommands.js`).
 * Mã máy do Extension tự sinh và giữ trong `chrome.storage.local`; tên máy do Sidebar gửi lúc giao, chỉ để người dùng nhận ra máy.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.BACKGROUND_MACHINE_KEY = 'FBM_BACKGROUND_MACHINE_V1';
FbmSync.MACHINE_NAME_MAX = 60;

/** Máy đang được giao; chưa giao thì `machineId` rỗng. Kho hỏng thì ném (không coi là chưa giao, vì "chưa giao" làm mọi máy dừng nền âm thầm). */
FbmSync.backgroundMachineRead = function () {
  var saved = FbmSync.documentPropertyJson(FbmSync.BACKGROUND_MACHINE_KEY, 'máy chạy nền') || {}, takeover = saved.takeover && typeof saved.takeover === 'object' ? saved.takeover : null;
  return {
    machineId: String(saved.machineId || ''), name: String(saved.name || ''), assignedAt: Number(saved.assignedAt || 0), lastAskAt: Number(saved.lastAskAt || 0),
    takeover: takeover ? { fromName: String(takeover.fromName || ''), fromMachineId: String(takeover.fromMachineId || ''), at: Number(takeover.at || 0) } : null
  };
};
/** Ghi máy được giao; máy không có mã là gỡ (xóa khóa). */
FbmSync.backgroundMachineWrite = function (machine) {
  return FbmSync.propertyJsonWrite(FbmSync.BACKGROUND_MACHINE_KEY, machine && machine.machineId ? machine : null);
};

/** Tên máy hiển thị: tên Sidebar gửi (cắt độ dài), trống thì lấy đuôi mã máy để vẫn phân biệt được hai máy. */
FbmSync.machineNameOf = function (name, machineId) {
  var text = String(name || '').replace(/\s+/g, ' ').trim().slice(0, FbmSync.MACHINE_NAME_MAX);
  return text || 'Máy ' + String(machineId || '').slice(-6);
};

/** Bản ghi máy được giao bằng tay (lệnh "Dùng máy này chạy nền"): bỏ dấu tự nhận cũ. */
FbmSync.machineAssigned = function (machineId, name, now) {
  return { machineId: String(machineId), name: FbmSync.machineNameOf(name, machineId), assignedAt: Number(now), lastAskAt: 0, takeover: null };
};
/** Bản ghi máy vừa tự nhận chạy nền thay máy im quá ngưỡng; giữ tên máy cũ để thông báo nói được nhận thay máy nào. */
FbmSync.machineTakenOver = function (previous, machineId, now) {
  return { machineId: String(machineId), name: FbmSync.machineNameOf('', machineId), assignedAt: Number(now), lastAskAt: Number(now), takeover: { fromName: previous.name, fromMachineId: previous.machineId, at: Number(now) } };
};

/** Máy được giao im quá ngưỡng: không hỏi GAS từ lúc giao hoặc lần hỏi cuối quá `silentMinutes`. Chưa giao máy thì không có máy nào để im. */
FbmSync.machineSilent = function (machine, now, silentMinutes) {
  if (!machine.machineId) { return false; }
  return Number(now) - Math.max(machine.lastAskAt, machine.assignedAt) > Number(silentMinutes) * 60000;
};

/**
 * Lần hỏi này có được chạy nền không. `input`: `master`, `background` (hai công tắc), `machine` (máy được giao), `machineId` (máy hỏi), `now`, `silentMinutes`, `autoTakeover`, `credentialRef` (mã khóa giải mã mật khẩu FBM đã lưu), `keyRefs` (mã khóa Extension máy hỏi đang giữ).
 * Trả `{ verdict, code, reason }`: `assigned` (đúng máy), `takeover` (nhận thay máy im), hoặc từ chối `MASTER_OFF` / `BACKGROUND_OFF` / `MACHINE_NOT_ASSIGNED`. Chỉ tính, không ghi.
 * Tự nhận cần máy hỏi có khóa giải mã đúng mật khẩu đã lưu: máy không đăng nhập lại được FBM mà nhận việc thì lượt nền lỗi mãi.
 */
FbmSync.machineCheck = function (input) {
  var value = input || {}, machine = value.machine, asker = String(value.machineId || '');
  if (!value.master) { return { verdict: 'refused', code: 'MASTER_OFF', reason: 'master_off' }; }
  if (!value.background) { return { verdict: 'refused', code: 'BACKGROUND_OFF', reason: 'background_off' }; }
  if (machine.machineId && machine.machineId === asker) { return { verdict: 'assigned', code: '', reason: 'assigned' }; }
  if (!machine.machineId) { return { verdict: 'refused', code: 'MACHINE_NOT_ASSIGNED', reason: 'none_assigned' }; }
  if (!value.autoTakeover || !FbmSync.machineSilent(machine, value.now, value.silentMinutes)) { return { verdict: 'refused', code: 'MACHINE_NOT_ASSIGNED', reason: 'other_assigned' }; }
  var ref = String(value.credentialRef || ''), refs = Array.isArray(value.keyRefs) ? value.keyRefs.map(String) : [];
  if (!ref || refs.indexOf(ref) < 0) { return { verdict: 'refused', code: 'MACHINE_NOT_ASSIGNED', reason: 'no_key' }; }
  return { verdict: 'takeover', code: '', reason: 'takeover' };
};

/** Lý do từ chối máy hỏi, câu đọc được trong Log. */
FbmSync.MACHINE_REFUSED_TEXT = {
  none_assigned: 'chưa giao máy nào chạy nền',
  other_assigned: 'máy khác đang được giao chạy nền',
  no_key: 'máy được giao đã im quá ngưỡng nhưng Extension máy này không có khóa giải mã mật khẩu FBM nên không tự nhận'
};

/**
 * Bản xem máy chạy nền cho Sidebar: tên, lần hỏi cuối, có im quá ngưỡng không, và thông báo khi đồng bộ nền thật sự không chạy (chưa giao máy, máy giao im) hoặc máy vừa tự nhận. Công tắc nền tắt thì không thông báo: người dùng chủ động tắt.
 * `notice`: `{ code, text }` hoặc `null`; Sidebar hiện bằng `noticeSet` kèm liên kết tới màn cài đặt.
 */
FbmSync.machineView = function (machine, now, silentMinutes, backgroundOn) {
  var silent = FbmSync.machineSilent(machine, now, silentMinutes), notice = null;
  var takeoverRecent = !!machine.takeover && Number(now) - machine.takeover.at < Number(SETTINGS.FBM_MACHINE_TAKEOVER_NOTICE_HOURS) * 3600000;
  if (backgroundOn && !machine.machineId) { notice = { code: 'MACHINE_NOT_ASSIGNED', level: 'warning', text: 'Đồng bộ nền đang bật nhưng chưa giao máy nào chạy nền nên chưa máy nào chạy.' }; }
  else if (backgroundOn && silent) { notice = { code: 'MACHINE_SILENT', level: 'warning', text: 'Máy chạy nền "' + machine.name + '" không hỏi GAS quá ' + silentMinutes + ' phút; đồng bộ nền đang không chạy.' }; }
  else if (takeoverRecent) { notice = { code: 'BACKGROUND_MACHINE_TAKEOVER', level: 'info', text: 'Máy "' + machine.name + '" đã tự nhận chạy nền thay máy "' + machine.takeover.fromName + '" (máy đó im quá ngưỡng).' }; }
  return { assigned: !!machine.machineId, machineId: machine.machineId, name: machine.name, assignedAt: machine.assignedAt, lastAskAt: machine.lastAskAt, silent: silent, silentMinutes: Number(silentMinutes), takeover: machine.takeover, notice: notice };
};
