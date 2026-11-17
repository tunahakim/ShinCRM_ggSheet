/** Liên kết tài khoản FBM của file, đối chiếu danh tính đang chạy và bảng kiểm ID Customer. Ánh xạ bản ghi FBM sang schema nội bộ nằm ở `RecordMap.js`. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Kho kết nối một khóa `{ binding, clearedFrom }`: liên kết Spreadsheet ↔ tài khoản FBM và dấu tài khoản vừa gỡ (chặn liên kết sang tài khoản khác khi Sheet còn dữ liệu). Không lưu cookie hay mật khẩu. */
FbmSync.CONNECTION_KEY = 'FBM_CONNECTION_V1';
FbmSync.CONNECTION_OLD_KEYS = ['FBM_SYNC_BINDING_V1', 'FBM_SYNC_BINDING_CLEAR_V1'];
/** Cổng đọc duy nhất của kho kết nối; hỏng thì ném có mã, không coi như chưa liên kết (trả rỗng mở đường đọc khách không lọc quyền và hiện sai "chưa liên kết"). */
FbmSync.connectionRead = function () {
  var stored = FbmSync.mergedStoreRead(FbmSync.CONNECTION_KEY, 'Kho kết nối tài khoản FBM', FbmSync.CONNECTION_OLD_KEYS) || {}, pick = function (value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; };
  return { binding: pick(stored.binding), clearedFrom: pick(stored.clearedFrom) };
};
/** Cổng ghi duy nhất của kho kết nối: cả hai phần rỗng thì xóa khóa. */
FbmSync.connectionWrite = function (connection) {
  var binding = connection.binding || {}, clearedFrom = connection.clearedFrom || {};
  return FbmSync.propertyJsonWrite(FbmSync.CONNECTION_KEY, binding.spreadsheetId || clearedFrom.spreadsheetId ? { binding: binding, clearedFrom: clearedFrom } : null);
};
/** Không đọc được file thì ném cho cửa vào ghi Log: trả rỗng làm mọi phép so Spreadsheet bị bỏ qua và lưu được liên kết của file khác. */
FbmSync.currentSpreadsheetId = function () {
  return String(shinOpenBook().getId() || '');
};
/** Bản lưu thô của liên kết. */
FbmSync.bindingRead = function () { return FbmSync.connectionRead().binding; };
/** Bốn trường nhận diện ở dạng chuẩn; giữ nguyên văn (không trim, không đổi hoa thường) vì mọi phép đối chiếu so nguyên văn. */
FbmSync.identityNormalize = function (value) {
  var input = value && typeof value === 'object' ? value : {};
  return { spreadsheetId: String(input.spreadsheetId || ''), userId: String(input.userId || ''), username: String(input.username || ''), accountName: String(input.accountName || '') };
};
/** Danh tính tài khoản đã liên kết: giá trị chủ dự án khai báo, chỉ dùng để đối chiếu với danh tính đọc từ FBM. Request nghiệp vụ dùng danh tính phiên đã xác minh (`sessionVerifiedIdentity`), không dùng giá trị này. */
FbmSync.boundIdentity = function () {
  return FbmSync.identityNormalize(FbmSync.bindingRead());
};
/**
 * Phép so danh tính duy nhất: trả lý do lệch giữa danh tính kỳ vọng và danh tính đang chạy, so nguyên văn (không trim, không đổi hoa thường).
 * So mọi trường mà danh tính đang chạy có mặt (`undefined` là bên gọi không muốn so trường đó), kể cả khi trường kỳ vọng trống: liên kết cũ thiếu tên đăng nhập phải ra lệch chứ không ra khớp. SpreadsheetId đang chạy trống thì không so, vì trống nghĩa là không đọc được file.
 */
FbmSync.identityMismatches = function (expected, runtime) {
  var want = expected || {}, got = runtime || {}, reasons = [];
  if (got.spreadsheetId && String(got.spreadsheetId) !== String(want.spreadsheetId || '')) { reasons.push('spreadsheet_mismatch'); }
  [['userId', 'user_mismatch'], ['username', 'username_mismatch'], ['accountName', 'account_mismatch']].forEach(function (pair) {
    if (got[pair[0]] !== undefined && String(got[pair[0]]) !== String(want[pair[0]] || '')) { reasons.push(pair[1]); }
  });
  return reasons;
};
/** Tên ô liên kết (đúng nhãn trên màn Tài khoản) cho từng lý do lệch, để người dùng biết sửa ô nào. */
FbmSync.IDENTITY_MISMATCH_LABELS = { spreadsheet_mismatch: 'Spreadsheet ID', user_mismatch: 'Mã số user FBM', username_mismatch: 'Tên đăng nhập FBM', account_mismatch: 'Tên đầy đủ' };
FbmSync.identityMismatchLabels = function (reasons) {
  return (reasons || []).map(function (reason) { return FbmSync.IDENTITY_MISMATCH_LABELS[reason] || String(reason); }).join(', ');
};
/** Bản nháp kỳ vọng có thể điền dở (đăng nhập thử trước khi lưu liên kết): chỉ đưa vào phép so các trường bản nháp đã điền. */
FbmSync.identityFilledFields = function (expected, runtime) {
  var want = expected || {}, got = runtime || {}, picked = {};
  ['spreadsheetId', 'userId', 'username', 'accountName'].forEach(function (name) { if (want[name]) { picked[name] = got[name]; } });
  return picked;
};
/**
 * So danh tính trích từ trang FBM (`pageIdentity`) với danh tính kỳ vọng (liên kết hoặc bản nháp đăng nhập thử). Liên kết phải khớp cả grid User lẫn trang; hàm này là phép so phía trang, phép so phía grid là `identityStatus`/`identityMismatches`.
 * Chỉ so trường kỳ vọng có giá trị (trang không có tên đăng nhập). Trang thiếu giá trị thì trả `reload` khi chưa tải lại, `missing` khi đã tải lại; không đoán, không bỏ qua.
 */
FbmSync.pageIdentityCheck = function (expected, page, reloaded) {
  var want = FbmSync.identityNormalize(expected), got = page || {}, fields = ['userId', 'accountName'].filter(function (name) { return !!want[name]; });
  if (!fields.length) { return { status: 'ok', reasons: [] }; }
  var missing = fields.filter(function (name) { return !String(got[name] || ''); });
  if (missing.length) { return { status: reloaded === true ? 'missing' : 'reload', reasons: missing }; }
  var picked = {};
  fields.forEach(function (name) { picked[name] = String(got[name]); });
  var reasons = FbmSync.identityMismatches(want, picked);
  return { status: reasons.length ? 'mismatch' : 'ok', reasons: reasons };
};
/** Trạng thái liên kết của file đang chạy, kèm đối chiếu danh tính đang chạy (nếu đưa vào) với liên kết qua `identityMismatches`. */
FbmSync.identityStatus = function (runtime) {
  var actual = String((runtime && runtime.spreadsheetId) || FbmSync.currentSpreadsheetId() || ''), current = FbmSync.bindingRead(), incoming = runtime || {};
  var reasons = [];
  // Chỉ khi chưa có liên kết mới cần biết Sheet đã có ID FBM chưa; đã liên kết thì không đọc cả Sheet Customer/Activity mỗi lần Sidebar mở.
  if (!current.spreadsheetId) { if (FbmSync.bindingHasLinkedData()) { reasons.push('missing_binding_with_linked_data'); } }
  else { reasons = reasons.concat(FbmSync.identityMismatches(current, Object.assign({}, incoming, { spreadsheetId: actual }))); }
  var status = reasons.length ? 'REBIND_REQUIRED' : (current.spreadsheetId ? 'BOUND' : 'UNBOUND');
  return { ok: status !== 'REBIND_REQUIRED', status: status, code: status === 'REBIND_REQUIRED' ? 'REBIND_REQUIRED' : '', spreadsheetId: actual, binding: { spreadsheetId: current.spreadsheetId || '', userId: current.userId || '', username: current.username || '', accountName: current.accountName || '' }, reasons: reasons };
};
FbmSync.identityPreflight = function (mode) {
  var status = FbmSync.identityStatus(), identityRecovery = mode === 'identity_check' || mode === 'identity_probe';
  var blocking = !identityRecovery && status.status !== 'BOUND';
  var message = status.status === 'UNBOUND'
    ? 'Chưa có liên kết tài khoản FBM. Hãy tự động điền hoặc nhập thông tin rồi lưu liên kết trước khi chạy đồng bộ.'
    : status.status === 'REBIND_REQUIRED'
      ? 'Cần kiểm tra lại liên kết tài khoản FBM trước khi chạy đồng bộ.'
      : '';
  return { status: status, blocking: blocking, message: message };
};

/** Chuẩn bị bảng đối chiếu ID Customer mà không đưa danh sách lên Sidebar. */
FbmSync.identityCheckBegin = function (state) {
  var local = typeof FbmSync.readLocal === 'function' ? FbmSync.readLocal('customer') : [], sample = [], target = state.identityTarget || {};
  (local || []).forEach(function (record) {
    var fbmId = String(record && record.fbmId || '').trim();
    if (!fbmId || String(record.recordStatus || 'active') === 'deleted' || FbmSync.isTemporaryRecord('customer', record)) { return; }
    if (sample.length < 50) { sample.push({ id: String(record.id || ''), code: String(record.fbmCustomerCode || ''), fbmId: fbmId, seen: false }); }
  });
  state.metadata = state.metadata || {};
  state.metadata.identityCheck = {
    total: (local || []).filter(function (record) {
      return String(record && record.fbmId || '').trim() && String(record.recordStatus || 'active') !== 'deleted' && !FbmSync.isTemporaryRecord('customer', record);
    }).length,
    matched: 0, scanned: 0, pages: 0, missing: 0, missingSample: [], sample: sample,
    spreadsheetId: String(target.spreadsheetId || ''), userId: String(target.userId || state.session && state.session.userId || ''), username: String(target.username || ''), accountName: String(target.accountName || state.session && state.session.accountName || '')
  };
  return state.metadata.identityCheck;
};

/** Ghi nhận một trang Customer cho luồng kiểm tra, không ghi Sheet/FBM. */
FbmSync.identityCheckPage = function (state, rows) {
  var result = state.metadata && state.metadata.identityCheck || {}, page = rows || [], local = typeof FbmSync.readLocal === 'function' ? FbmSync.readLocal('customer') : [], localById = {};
  (local || []).forEach(function (record) {
    var fbmId = String(record && record.fbmId || '').trim();
    if (fbmId && String(record.recordStatus || 'active') !== 'deleted' && !FbmSync.isTemporaryRecord('customer', record)) { localById[fbmId] = record; }
  });
  page.forEach(function (row) {
    var fbmId = String(row && row.stt_rec_kh || '').trim();
    if (!fbmId) { return; }
    result.scanned = Number(result.scanned || 0) + 1;
    if (localById[fbmId]) { result.matched = Number(result.matched || 0) + 1; }
    (result.sample || []).forEach(function (item) { if (item.fbmId === fbmId) { item.seen = true; } });
  });
  result.pages = Number(result.pages || 0) + 1;
  state.metadata.identityCheck = result;
  return result;
};

/** Chốt tổng hợp n/N và mẫu dòng local không còn thấy bên FBM. */
FbmSync.identityCheckFinish = function (state) {
  var result = state.metadata && state.metadata.identityCheck || {}, sample = result.sample || [];
  result.total = Number(result.total || 0);
  result.matched = Math.min(result.total, Number(result.matched || 0));
  result.missing = Math.max(0, result.total - result.matched);
  result.missingSample = sample.filter(function (item) { return !item.seen; }).slice(0, 20).map(function (item) {
    return { id: item.id, code: item.code, fbmId: item.fbmId };
  });
  delete result.sample;
  state.metadata.identityCheck = result;
  return result;
};
