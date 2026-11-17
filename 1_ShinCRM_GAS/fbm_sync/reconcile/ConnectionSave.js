/**
 * Lưu kết nối tài khoản FBM: liên kết Spreadsheet ↔ tài khoản và credential (bản mã mật khẩu) trong một lần, cho cả lệnh lưu liên kết lẫn lệnh lưu kết nối của màn Tài khoản.
 * Mọi phép kiểm chạy trước lần ghi đầu tiên, rồi ba kho (kết nối, credential, dấu lần thử) ghi qua cổng của chúng trong khóa điều phối: lớp đệm gộp thành một `setProperties`, nên không có trạng thái nửa liên kết B nửa credential A và không cần hoàn tác tay.
 * GAS quyết giữ, lưu hay xóa credential từ nội dung form; Sidebar không gửi "kiểu lưu".
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Công cụ kiểm: lượt đang chạy hoặc request đang bay thì không được đổi kết nối giữa lượt. Trả kết quả từ chối, hoặc `null`. */
FbmSync.runOpenCheck = function (state, message) {
  if (!state || (!state.activeRequestId && !FbmSync.runInProgress(state))) { return null; }
  return { ok: false, code: 'SYNC_BUSY', message: message };
};

FbmSync.IDENTITY_FIELDS = ['spreadsheetId', 'userId', 'username', 'accountName'];

/** Công cụ kiểm (thuần): liên kết gửi lên trống hết (gỡ liên kết) hoặc đủ bốn trường và đúng file đang chạy. Tên đầy đủ giữ nguyên văn vì phép so danh tính so nguyên văn. */
FbmSync.bindingValidate = function (binding, actualSpreadsheetId) {
  var value = binding || {}, identity = {
    spreadsheetId: String(value.spreadsheetId || '').trim(), userId: String(value.userId || '').trim(), username: String(value.username || '').trim(), accountName: String(value.accountName || '')
  };
  var filled = FbmSync.IDENTITY_FIELDS.filter(function (name) { return !!identity[name]; }).length;
  if (!filled) { return { ok: true, empty: true, identity: identity }; }
  if (filled < FbmSync.IDENTITY_FIELDS.length) { return { ok: false, code: 'IDENTITY_BINDING_INCOMPLETE', message: 'Thiếu SpreadsheetId, mã số user, tên đăng nhập hoặc tên đầy đủ FBM.' }; }
  if (identity.spreadsheetId !== String(actualSpreadsheetId || '')) { return { ok: false, code: 'SPREADSHEET_MISMATCH', message: 'SpreadsheetId liên kết không khớp file đang chạy.' }; }
  return { ok: true, empty: false, identity: identity };
};

/** Công cụ kiểm (thuần): phần credential của form. `undefined` (lệnh chỉ lưu liên kết) thì không có form. Có bản mã thì bản mã và mã tham chiếu phải hợp lệ; GAS không bao giờ nhận mật khẩu bản rõ. */
FbmSync.credentialValidate = function (credential) {
  if (credential === undefined || credential === null) { return { ok: true, present: false }; }
  var value = credential, username = String(value.username || '').trim(), envelope = value.envelope;
  if (!envelope) { return { ok: true, present: true, username: username, next: null }; }
  if (typeof envelope !== 'object' || String(envelope.ciphertext || '').length < 16 || String(envelope.iv || '').length < 8) {
    return { ok: false, code: 'LOGIN_ENVELOPE_INVALID', message: 'Thông tin đăng nhập chưa được mã hóa hợp lệ.' };
  }
  var ref = String(value.credentialRef || '').trim();
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(ref)) { return { ok: false, code: 'LOGIN_CREDENTIAL_REF_INVALID', message: 'Thiếu mã tham chiếu thông tin đăng nhập.' }; }
  var pub = value.public && typeof value.public === 'object' ? value.public : {};
  return { ok: true, present: true, username: username, next: { credentialRef: ref, ciphertext: envelope, public: { usernameHint: String(pub.usernameHint || '').slice(0, 80), database: String(pub.database || '').slice(0, 80), unit: String(pub.unit || '').slice(0, 40), language: String(pub.language || 'v').slice(0, 8) } } };
};

/** Liên kết cũ thiếu tên đăng nhập được bổ sung tên đăng nhập mà các trường khác giữ nguyên: cùng tài khoản, không phải đổi liên kết. Thuần. */
FbmSync.bindingCanUpgradeUsername = function (previous, next) {
  var oldValue = previous || {}, newValue = next || {};
  return !!oldValue.spreadsheetId && !String(oldValue.username || '') && !!String(newValue.username || '') &&
    String(oldValue.spreadsheetId) === String(newValue.spreadsheetId || '') &&
    String(oldValue.userId || '') === String(newValue.userId || '') &&
    String(oldValue.accountName || '') === String(newValue.accountName || '');
};
/** Liên kết gửi lên có khác liên kết đang lưu (so nguyên văn bốn trường). Thuần. */
FbmSync.bindingDiffers = function (previous, identity) {
  var old = previous || {};
  return FbmSync.IDENTITY_FIELDS.some(function (name) { return String(old[name] || '') !== String(identity[name] || ''); });
};

/** Đọc Sheet lỗi thì ném: coi như "có dữ liệu" sẽ hiện lý do sai "cần liên kết lại" thay cho lỗi thật. */
FbmSync.bindingHasLinkedData = function () {
  return ['customer', 'activity'].some(function (entity) {
    return (FbmSync.readLocal(entity) || []).some(function (record) {
      return String(record && record.fbmId || '').trim() && String(record.recordStatus || 'active') !== 'deleted';
    });
  });
};

/**
 * Công cụ tính (thuần): kế hoạch ghi của lần lưu kết nối. `input`: `connection` (kho kết nối đang lưu), `saved` (credential đang lưu), `binding` (kết quả `bindingValidate`), `form` (kết quả `credentialValidate`), `linked` (Sheet còn dữ liệu đã liên kết; chỉ có nghĩa khi liên kết đổi), `now`.
 * Credential là mật khẩu của một tài khoản: liên kết đổi sang tài khoản khác mà form không xác nhận đúng username của credential đang lưu thì xóa, để không đăng nhập tài khoản B bằng mật khẩu A.
 * Trả `{ ok, connection, credential: { value, event } | null, keyRefRemove, cleared }`; `credential: null` là giữ nguyên kho credential và dấu lần thử.
 */
FbmSync.connectionPlan = function (input) {
  var previous = input.connection.binding || {}, cleared = input.connection.clearedFrom || {}, saved = input.saved, form = input.form, identity = input.binding.identity, now = Number(input.now);
  var savedRef = saved.configured ? String(saved.credentialRef) : '', remove = function () { return savedRef ? { value: null, event: 'cleared' } : null; };
  if (input.binding.empty) {
    if (form.present && form.next) { return { ok: false, code: 'IDENTITY_BINDING_REQUIRED', message: 'Phải có nhận diện tài khoản trước khi lưu credential.' }; }
    var clearedFrom = previous.spreadsheetId ? { spreadsheetId: String(previous.spreadsheetId), userId: String(previous.userId || ''), username: String(previous.username || ''), accountName: String(previous.accountName || ''), clearedAt: now } : cleared;
    return { ok: true, cleared: true, connection: { binding: {}, clearedFrom: clearedFrom }, credential: remove(), keyRefRemove: savedRef };
  }
  var upgrade = FbmSync.bindingCanUpgradeUsername(previous, identity), changed = FbmSync.bindingDiffers(previous, identity) && !upgrade;
  if (changed && input.linked && (previous.spreadsheetId || cleared.spreadsheetId)) {
    return { ok: false, code: 'REBIND_REQUIRED', message: 'Spreadsheet còn dữ liệu đã liên kết FBM; xử lý dữ liệu cũ rồi kiểm tra lại trước khi đổi tài khoản.' };
  }
  var connection = { binding: Object.assign({}, identity, { updatedAt: now }), clearedFrom: {} };
  if (form.present && form.next) {
    var replaced = savedRef && savedRef !== form.next.credentialRef ? savedRef : '';
    return { ok: true, connection: connection, credential: { value: form.next, event: 'saved' }, keyRefRemove: replaced };
  }
  var confirmed = form.present && !!form.username && !!savedRef && form.username === saved.public.usernameHint;
  if (form.present && form.username && !confirmed) { return { ok: false, code: 'LOGIN_PASSWORD_REQUIRED', message: 'Đã nhập username nhưng chưa có mật khẩu tương ứng.' }; }
  var drop = (form.present && !form.username) || (changed && !confirmed);
  return { ok: true, connection: connection, credential: drop ? remove() : null, keyRefRemove: drop ? savedRef : '' };
};

/**
 * Người điều phối lưu kết nối (chạy trong khóa điều phối). `input.binding` là bốn trường liên kết (trống hết là gỡ liên kết); `input.credential` là nội dung form đăng nhập `{ username, credentialRef?, envelope?, public? }`, vắng mặt khi chỉ lưu liên kết.
 * Xóa hoặc thay credential thì GAS xóa bản mã ngay trong lần ghi này rồi trả `keyRefRemove` để Sidebar chuyển lệnh xóa khóa cho Extension: thứ tự ngược lại thì Extension mất khóa mà GAS còn bản mã, lượt sau giải mã hỏng.
 */
FbmSync.connectionSave = function (input) {
  var value = input || {};
  var busy = FbmSync.runOpenCheck(FbmSync.stateRead(), 'Đang có phiên đồng bộ; hãy dừng phiên trước khi đổi liên kết tài khoản.');
  if (busy) { return busy; }
  var binding = FbmSync.bindingValidate(value.binding, FbmSync.currentSpreadsheetId());
  if (!binding.ok) { return binding; }
  var form = FbmSync.credentialValidate(value.credential);
  if (!form.ok) { return form; }
  var connection = FbmSync.connectionRead(), now = Date.now();
  var linked = !binding.empty && FbmSync.bindingDiffers(connection.binding, binding.identity) ? FbmSync.bindingHasLinkedData() : false;
  var plan = FbmSync.connectionPlan({ connection: connection, saved: FbmSync.credentialRead(), binding: binding, form: form, linked: linked, now: now });
  if (!plan.ok) { return plan; }
  FbmSync.connectionWrite(plan.connection);
  if (plan.credential) {
    FbmSync.credentialWrite(plan.credential.value);
    FbmSync.loginAttemptWrite(FbmSync.loginAttemptMark(FbmSync.loginAttemptRead(), { kind: plan.credential.event }, now, 0));
  }
  var saved = plan.connection.binding;
  return {
    ok: true, code: plan.cleared ? 'IDENTITY_BINDING_CLEARED' : '',
    message: plan.cleared ? 'Đã hủy liên kết tài khoản. Đồng bộ bị khóa cho đến khi liên kết lại.' : '',
    binding: saved.spreadsheetId ? { spreadsheetId: saved.spreadsheetId, userId: saved.userId, username: saved.username, accountName: saved.accountName, updatedAt: saved.updatedAt } : {},
    identityStatus: FbmSync.identityStatus(), login: FbmSync.credentialPublicView(), keyRefRemove: plan.keyRefRemove || ''
  };
};
