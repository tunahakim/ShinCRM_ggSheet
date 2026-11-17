/** Kiểm cách GAS đọc câu trả lời Login của FBM (`d`): một bảng duy nhất, lượt bị từ chối đóng lỗi qua cổng phiên, sai mật khẩu hoặc câu trả lời chưa gặp thì ngừng tự đăng nhập, dòng Log ghi trước khi lượt đóng. */
const { section, check } = require('../../lib/assert');
const { workflowGas, trongLat } = require('../../lib/fbm/hop-dong-bo');
const { datState } = require('../../lib/fbm/dat-state');

const MA_THONG_TIN = 'cred-login-reply';

/** Hộp đã lưu thông tin đăng nhập; mỗi dòng Log ghi kèm việc lượt còn mở lúc ghi hay không. */
function hopDangNhap() {
  const logs = [];
  const { hop } = workflowGas({ logEvent: (line) => logs.push(Object.assign({ open: F.runInProgress(F.stateRead()) }, line)), LOG_WARN: 'warn' });
  const F = hop.FbmSync;
  F.credentialWrite({ credentialRef: MA_THONG_TIN, ciphertext: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt' } });
  return { F, logs };
}

/** Nộp body cho bước Login của lượt đăng nhập qua chặng chung (`CURSOR_TABLE.login`). `cursor` là các trường ô lượt (mục đích, bản nháp...). */
function nopLogin(F, body, cursor, origin) {
  datState(F, { runId: 'login-' + Math.random().toString(36).slice(2), origin: origin, phase: 'checking_session', cursor: F.loginCursorOpen(Object.assign({ step: 'login', facts: { salt: 'ab12cd34', database: 'FHN_CRM_App', unit: 'CTY' } }, cursor)), activeRequestId: '', deadlineAt: 0, session: { expired: true } });
  return trongLat(F, () => F.stageRun(F.cursorTable('login'), F.stateRead(), { ok: true, status: 200, body: body }));
}
/** Lượt tự đăng nhập đang chờ trả lời Login; `manual` là lượt người dùng bấm. */
function traLoi(F, body, manual) {
  return nopLogin(F, body, { purpose: 'auto', manual: !!manual, afterLogin: { cursor: { kind: 'customer_grid' } } }, manual ? 'manual' : 'background');
}

/** Hỏi cổng tự đăng nhập của lượt bấm tay bằng đúng đầu vào chặng phiên đọc khi phiên chết. */
function congTay(F) {
  const vao = F.sessionInputs({ cursor: { kind: 'session', resume: { cursor: { kind: 'customer_grid' } } } }, { ok: true, status: 200, body: '{"d":{"Authorized":false,"Rows":[]}}' });
  return F.autoLoginGate(Object.assign({ attempt: vao.attempt, now: Date.now(), manual: true }, vao.login));
}
/** Ghi một sự kiện vào sổ lần thử qua đúng cổng ghi. */
function ghiLanThu(F, event) { F.loginAttemptWrite(F.loginAttemptMark(F.loginAttemptRead(), event, Date.now(), 30)); }

async function chay(so) {
  section('FBM sync — LoginReply: đọc câu trả lời Login của FBM');

  const bang = hopDangNhap().F;
  check(so, 'bảng câu trả lời: true vào được, false sai mật khẩu, "Duplicate" còn phiên cũ, mọi giá trị khác là chưa gặp, lỗi gọi là lỗi đường truyền', [
    bang.loginReplyReason({ ok: true }, true), bang.loginReplyReason({ ok: true }, false), bang.loginReplyReason({ ok: true }, 'Duplicate'), bang.loginReplyReason({ ok: true }, null), bang.loginReplyReason({ ok: true }, 'abcdefghi'), bang.loginReplyReason({ ok: true }, true, true), bang.loginReplyReason({ ok: false }, true)
  ], ['accepted', 'credentials', 'oldSession', 'unknown', 'unknown', 'unknown', 'transport']);

  // Gặp thật 2026-11-01: sai mật khẩu FBM trả {"d":false}.
  const sai = hopDangNhap();
  const ketQua = traLoi(sai.F, '{"d":false}');
  const dongLoi = sai.logs.filter((line) => line.action === 'login_failure')[0] || {};
  check(so, 'sai mật khẩu chạy nền: lượt đóng lỗi, dòng Log ghi lúc lượt còn mở, báo đúng lý do và máy ngừng tự đăng nhập, không mở nút hủy phiên cũ', [
    ketQua.code, sai.F.stateRead().phase, sai.F.runInProgress(sai.F.stateRead()), dongLoi.open, sai.F.stateRead().message.indexOf('FBM báo sai tên đăng nhập hoặc mật khẩu. Máy ngừng tự đăng nhập') > 0, Object.assign({}, sai.F.credentialRead(), sai.F.loginAttemptRead()).loginHalted, sai.F.statusView().actions.forceLogin
  ], ['AUTO_LOGIN_FAILED', 'error', false, true, true, true, false]);
  check(so, 'đã ngừng thì chặn cả lượt bấm tay (mỗi lần bấm là một lần gửi lại mật khẩu sai) và nói lý do lần trước; lưu lại thông tin đăng nhập thì mở lại', [
    congTay(sai.F).code, sai.F.autoLoginBlockMessage('AUTO_LOGIN_HALTED', null, sai.F.loginAttemptRead().lastError).indexOf('Lý do lần trước: FBM báo sai tên đăng nhập') > 0,
    (() => { const cu = Object.assign({}, sai.F.credentialRead(), sai.F.loginAttemptRead()); const luu = sai.F.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: 'u-1', username: 'anhlt', accountName: 'Anh' }, credential: { username: cu.public.usernameHint, credentialRef: cu.credentialRef, envelope: cu.ciphertext, public: cu.public } }); if (!luu.ok) { throw new Error(luu.code); } return [Object.assign({}, sai.F.credentialRead(), sai.F.loginAttemptRead()).loginHalted, congTay(sai.F).ok]; })()
  ], ['AUTO_LOGIN_HALTED', true, [false, true]]);
  ghiLanThu(sai.F, { kind: 'failure', message: 'FBM báo sai tên đăng nhập hoặc mật khẩu.', halt: true });
  ghiLanThu(sai.F, { kind: 'success' });
  check(so, 'đăng nhập được (đăng nhập thử hoặc hủy phiên cũ thành công) thì mở lại tự đăng nhập', Object.assign({}, sai.F.credentialRead(), sai.F.loginAttemptRead()).loginHalted, false);

  // Gặp thật 2026-11-01: còn phiên cũ thì FBM trả {"d":"Duplicate"}.
  const cu = hopDangNhap();
  traLoi(cu.F, '{"d":"Duplicate"}');
  check(so, 'còn phiên cũ chạy nền: lượt đóng lỗi, không ngừng tự đăng nhập mà hẹn chu kỳ thử lại, mở nút hủy phiên cũ', [
    cu.F.stateRead().phase, Object.assign({}, cu.F.credentialRead(), cu.F.loginAttemptRead()).loginHalted, cu.F.stateRead().message.indexOf('còn giữ phiên đăng nhập cũ') > 0, cu.F.stateRead().message.indexOf('Chạy nền tự thử lại sau 30 phút') > 0, cu.F.statusView().actions.forceLogin
  ], ['error', false, true, true, true]);

  // Gặp thật 2026-10-07: FBM trả {"d":null}; câu trả lời chưa gặp không được đoán thành phiên cũ hay sai mật khẩu.
  const la = hopDangNhap();
  traLoi(la.F, '{"d":null}');
  const nenText = la.F.stateRead().message;
  traLoi(la.F, '{"d":"Locked"}', true);
  const tayText = la.F.stateRead().message, dongLa = la.logs.filter((line) => line.action === 'login_failure');
  check(so, 'câu trả lời chưa gặp: báo chưa gặp và ngừng tự đăng nhập; lượt bấm tay không hứa tự thử lại mà chỉ cách xem trên tab FBM; không mở nút hủy phiên cũ; Log ghi dạng của d và mã chữ ngắn', [
    nenText.indexOf('câu trả lời chưa gặp') > 0, nenText.indexOf('Máy ngừng tự đăng nhập') > 0, tayText.indexOf('Đăng nhập thử') > 0, tayText.indexOf('tự thử lại') < 0, la.F.statusView().actions.forceLogin, Object.assign({}, la.F.credentialRead(), la.F.loginAttemptRead()).loginHalted, dongLa.map((line) => line.detail.response.dType + ':' + (line.detail.response.dCode || ''))
  ], [true, true, true, true, false, true, ['null:', 'string:Locked']]);

  // Đăng nhập thử bằng bản nháp chưa lưu không chứng minh thông tin đã lưu sai.
  const nhap = hopDangNhap();
  nopLogin(nhap.F, '{"d":false}', { purpose: 'test', draft: { credentialRef: 'cred-draft-other', ciphertext: { iv: '123456789012', ciphertext: 'ciphertext-long-enough' } } }, 'manual');
  check(so, 'đăng nhập thử bằng bản nháp bị báo sai mật khẩu: báo cho người dùng nhưng không ngừng tự đăng nhập bằng thông tin đã lưu', [nhap.F.stateRead().message.indexOf('Đăng nhập thử không thành công: FBM báo sai') === 0, Object.assign({}, nhap.F.credentialRead(), nhap.F.loginAttemptRead()).loginHalted], [true, false]);
}

module.exports = { chay };
