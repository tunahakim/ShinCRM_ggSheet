/**
 * Người điều phối hai lệnh của chế độ xử lý xung đột (`open_conflict`, `confirm_conflict`): đọc ô lượt một lần ở đầu lệnh rồi giao cho công cụ ở `Conflict.js` (hàng đợi, kiểm lệnh, cửa ghi chốt); công cụ không đọc ô lượt.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Lệnh `open_conflict`: mở bản ghi đầu hàng đợi bằng một lượt một chặng `conflict_refresh` (nhãn Tay · Đọc lại bản xung đột) và chỉ phát request đọc bản ghi FBM; diff tính khi response về. Request phải thuộc một lượt đang mở để lỗi đường truyền hay lệch hợp đồng đóng được qua `runClose`; lượt mới xác minh phiên lại từ đầu nên cổng phiên có thể hỏi phiên trước. Dấu trang mang đủ bản ghi đang chờ đọc, ô lượt không giữ bản người dùng xem.
 * Hàng đợi rỗng hoặc bản ghi đầu không có ID FBM thì không mở lượt, không phát request.
 */
FbmSync.runConflictOpenCommand = function () {
  if (!settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled')) { return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; chưa thể xử lý conflict.' }; }
  var state = FbmSync.stateRead();
  // Mở xung đột phải đọc FBM qua kênh duy nhất của phiên: lượt nền đang chạy thì để Sidebar hỏi người dùng dừng hay chờ, lượt tay thì báo chờ.
  if (FbmSync.runInProgress(state) && String(state.origin || '') === 'background') { return FbmSync.backgroundRunningResult(); }
  if (FbmSync.ACTIVE_PHASES.indexOf(String(state.phase || '')) >= 0) { return FbmSync.conflictFail('SYNC_RUNNING', 'Phiên đồng bộ đang chạy; chờ phiên dừng rồi mới xử lý xung đột.'); }
  var queue = FbmSync.conflictQueue(FbmSync.localScan());
  state.metadata.conflictCount = queue.length;
  if (!queue.length) {
    state.message = 'Không còn xung đột chờ quyết.';
    FbmSync.stateWrite(state);
    return { ok: true, empty: true, remaining: 0 };
  }
  var item = queue[0], request = FbmSync.conflictRefreshRequest(item.entity, item, FbmSync.scriptSettings(state));
  if (!request) { return FbmSync.conflictDropUnreadable(state, item.entity, item.id, 'không có ID FBM để đọc lại'); }
  var opened = FbmSync.runOpen({ origin: 'manual', kindLabel: FbmSync.RUN_PLANS.conflict_refresh.label, cursor: { kind: 'conflict_refresh', entity: item.entity, id: item.id, fbmId: String(item.fbmId || '') }, message: 'Đang đọc FBM để mở xung đột ' + item.id + '...' });
  opened.metadata.conflictCount = queue.length;
  return { ok: true, request: FbmSync.sliceIssue(opened, request), remaining: queue.length };
};

/**
 * Lệnh `confirm_conflict`: chốt theo ảnh chụp lúc mở, không đọc lại FBM. Kiểm lệnh (`conflictChoiceValidate`, thuần) rồi `conflictSettle` ghi trong một lần cầm khóa; phép so phía FBM (`snapshotMatch`) chạy trong khóa vì Activity cần ID FBM của dòng đọc lúc đó.
 * `input`: `entity`, `id`, `choice` (`fbm` / `shin` / `manual`), `merged` (lựa chọn từng trường `{ field: { choice, value } }`), `fbmValues` và `shinValues` (`{ field: value }` giá trị hai bên màn đang hiện của các trường lệch, theo tên trường FBM), `snapshot` (ảnh chụp trong DTO lúc mở).
 */
FbmSync.runConflictConfirmCommand = function (input) {
  if (!settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled')) { return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; chưa thể chốt conflict.' }; }
  var state = FbmSync.stateRead(), plan = FbmSync.conflictChoiceValidate(input || {});
  if (plan.code === 'CONFLICT_REOPEN') { return FbmSync.conflictReject(state, plan.entity, plan.id, plan.message); }
  if (!plan.ok) { return FbmSync.conflictFail(plan.code, plan.message); }
  var read = { entity: plan.entity, id: plan.id, gate: FbmSync.stateCategoryGate(state), latestHash: plan.openedHash, latestFor: function (local) { return FbmSync.snapshotLatest(local, plan.shotOld, plan.latestFbm); }, old: plan.old };
  return FbmSync.conflictSettle(state, read, function (local) { return Object.assign({}, local, plan.picks); }, 'Đã quyết conflict ' + plan.entity + ' ' + plan.id + ' theo ' + plan.choice + '.');
};
