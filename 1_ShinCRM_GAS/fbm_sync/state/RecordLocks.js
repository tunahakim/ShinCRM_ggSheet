/** Cầu nối khóa record giữa Sidebar và cửa ghi đồng bộ. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
/** Đánh dấu record bắt đầu được người dùng chỉnh sửa, không ghi đè khóa sync khác revision. */
FbmSync.editBegin = function (entity, id, revision) {
  var state = FbmSync.stateRead(), key = String(entity) + ':' + String(id), current = state.locks[key];
  if (current && current.owner === 'sync') { return { ok: false, code: 'RECORD_BUSY', message: 'Bản ghi đang được đồng bộ; bản nháp được giữ nguyên.' }; }
  if (current && String(current.revision || '') !== String(revision || '')) { return { ok: false, code: 'RECORD_BUSY', message: 'Bản ghi đang được đồng bộ; bản nháp được giữ nguyên.' }; }
  return FbmSync.lockRecord(entity, id, revision, 'user');
};
/** Xóa đánh dấu chỉnh sửa khi form kết thúc. */
FbmSync.editEnd = function (entity, id) {
  var state = FbmSync.stateRead(), key = String(entity) + ':' + String(id);
  if (state.locks[key] && state.locks[key].owner && state.locks[key].owner !== 'user') { return state; }
  return FbmSync.unlockRecord(entity, id);
};
/** Chặn lưu mù nếu revision đã khác lúc form được mở. */
FbmSync.saveAllowed = function (entity, id, revision) {
  var state = FbmSync.stateRead();
  var lock = state.locks[String(entity) + ':' + String(id)];
  if (lock && lock.owner === 'sync') { return { ok: false, code: 'RECORD_BUSY', message: 'Bản ghi đang được đồng bộ; hãy lưu lại sau khi đồng bộ xong.' }; }
  if (!lock || String(lock.revision || '') === String(revision || '')) { return { ok: true }; }
  return { ok: false, code: 'RECORD_BUSY', message: 'Bản ghi đang được đồng bộ. Bản nháp được giữ nguyên, hãy tải lại sau khi đồng bộ xong.' };
};
/** API bắt đầu khóa từ Sidebar. */
function fbmSyncEditBegin(entity, id, revision) { return FbmSync.editBegin(entity, id, revision); }
/** API kết thúc khóa từ Sidebar. */
function fbmSyncEditEnd(entity, id) { return FbmSync.editEnd(entity, id); }
/** API kiểm tra revision trước khi SaveService ghi Sheet. */
function fbmSyncSaveAllowed(entity, id, revision) { return FbmSync.saveAllowed(entity, id, revision); }
