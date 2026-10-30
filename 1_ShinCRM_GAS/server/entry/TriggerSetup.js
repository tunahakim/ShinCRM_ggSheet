/**
 * Nơi duy nhất cài trigger cài đặt (installable trigger) của ShinCRM. Tài liệu 07 Phần 3.
 *
 * **Chỉ chủ tệp được cài.** Google cho mỗi tài khoản chỉ thấy trigger của chính mình, còn trigger sửa ô thì chạy với mọi lần sửa của bất kỳ ai. Người khác tự cài là thêm một bộ trigger thứ hai, mỗi lần sửa ô bị ghi nhận nhiều lần và tốn hạn mức chạy trigger của nhiều người. Trigger của chủ tệp cũng không mất khi một nhân viên mất quyền vào tệp.
 *
 * Giới hạn không bịt được: người khác không nhìn thấy trigger của chủ tệp nên không phát hiện được trigger bị mất; trigger mất chỉ được cài lại ở lần chủ tệp mở Sidebar kế tiếp. Trigger mở tệp chạy dưới tên chủ tệp nên mỗi lần ai mở tệp cũng là một lần kiểm.
 *
 * Mỗi trigger đúng một bản: thiếu thì cài, thừa (hai lần mở Sidebar cài cùng lúc) thì xóa bớt, nên không cần khóa tài liệu ở đường mở Sidebar.
 */

/** Trigger cài đặt bắt buộc, theo tên hàm xử lý → loại sự kiện trên bảng tính. */
var INSTALLED_TRIGGERS = { shinAutoShowSidebar: 'onOpen', shinOnEdit: 'onEdit', shinOnChange: 'onChange' };

/** Kiểm thuần: từ tên hàm của các trigger người đang chạy thấy, ra trigger cần cài và số bản thừa cần xóa của từng trigger. */
function triggerNeeds(handlers) {
  var counts = {};
  handlers.forEach(function (handler) { counts[handler] = (counts[handler] || 0) + 1; });
  var install = [], extra = {};
  Object.keys(INSTALLED_TRIGGERS).forEach(function (handler) {
    var count = counts[handler] || 0;
    if (count === 0) { install.push(handler); }
    if (count > 1) { extra[handler] = count - 1; }
  });
  return { install: install, extra: extra, empty: install.length === 0 && Object.keys(extra).length === 0 };
}

/** Đọc email chủ tệp và email người đang chạy, viết thường để so. Tệp trong Drive dùng chung không có chủ: `ownerEmail` rỗng. */
function triggerIdentityRead(book) {
  var owner = book.getOwner();
  return {
    ownerEmail: owner ? String(owner.getEmail() || '').toLowerCase() : '',
    userEmail: String(Session.getEffectiveUser().getEmail() || '').toLowerCase()
  };
}

/** Kiểm thuần: người đang chạy có phải chủ tệp không. Không xác định được một trong hai thì ném lỗi có mã, vì đoán sai hướng nào cũng hỏng (cài trùng hoặc không ai cài). */
function triggerOwnerCheck(identity) {
  if (!identity.ownerEmail) {
    throw Object.assign(new Error('Không xác định được chủ tệp (tệp nằm trong Drive dùng chung?) nên không cài được trigger theo dõi sửa ô.'), { code: 'TRIGGER_OWNER_UNKNOWN' });
  }
  if (!identity.userEmail) {
    throw Object.assign(new Error('Không đọc được email người đang dùng nên không biết có phải chủ tệp không.'), { code: 'TRIGGER_USER_UNKNOWN' });
  }
  return identity.ownerEmail === identity.userEmail;
}

/** Ghi trigger theo kết quả kiểm: xóa bản thừa (giữ bản đầu), cài bản thiếu. Trả số bản đã xóa. */
function triggerApply(book, triggers, needs) {
  var kept = {}, removed = 0;
  triggers.forEach(function (trigger) {
    var handler = trigger.getHandlerFunction();
    if (!needs.extra[handler]) { return; }
    if (!kept[handler]) { kept[handler] = true; return; }
    ScriptApp.deleteTrigger(trigger);
    removed += 1;
  });
  needs.install.forEach(function (handler) {
    ScriptApp.newTrigger(handler).forSpreadsheet(book)[INSTALLED_TRIGGERS[handler]]().create();
  });
  return removed;
}

/**
 * Người điều phối: đảm bảo mỗi trigger bắt buộc có đúng một bản của chủ tệp.
 * Đủ cả thì trả ngay, không đọc danh tính (lần mở Sidebar thường của chủ tệp không tốn thêm lệnh). Người khác chủ tệp thì trả `skipped` và không ghi gì.
 * Cài trigger sửa ô thì chụp hàng 1 mọi sheet, vì trigger đối chiếu hàng 1 với bản chụp này (Tài liệu 07 Phần 3.1).
 */
function triggersEnsure() {
  var book = shinOpenBook();
  var triggers = ScriptApp.getProjectTriggers();
  var needs = triggerNeeds(triggers.map(function (trigger) { return trigger.getHandlerFunction(); }));
  if (needs.empty) { return { ok: true, installed: [], removed: 0 }; }
  if (!triggerOwnerCheck(triggerIdentityRead(book))) { return { ok: true, skipped: 'not_owner', installed: [], removed: 0 }; }
  var removed = triggerApply(book, triggers, needs);
  if (needs.install.indexOf('shinOnEdit') >= 0) { book.getSheets().forEach(function (sheet) { shinHeaderSnapshotWrite(sheet); }); }
  logEvent({ source: 'core', action: 'triggersEnsure', outcome: LOG_OK, reason: 'Trigger của chủ tệp: cài ' + (needs.install.join(', ') || 'không') + '; xóa ' + removed + ' bản thừa.' });
  return { ok: true, installed: needs.install, removed: removed };
}

/** Nghiệm thu DEV: trigger người chạy đang thấy và người chạy có phải chủ tệp không. Chỉ đọc. */
function probeTriggerState() {
  var handlers = ScriptApp.getProjectTriggers().map(function (trigger) { return trigger.getHandlerFunction(); });
  var identity = triggerIdentityRead(shinOpenBook());
  return Object.keys(INSTALLED_TRIGGERS).map(function (handler) {
    return handler + ': ' + handlers.filter(function (name) { return name === handler; }).length + ' bản';
  }).concat([
    'Tất cả handler: ' + handlers.join(', '),
    'Người chạy là chủ tệp: ' + (identity.ownerEmail !== '' && identity.ownerEmail === identity.userEmail)
  ]);
}
