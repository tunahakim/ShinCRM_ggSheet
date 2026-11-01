/** Kiểm cách GAS đọc câu trả lời Login của FBM (`d`): một bảng duy nhất, lượt bị từ chối đóng lỗi qua cổng phiên, sai mật khẩu hoặc câu trả lời chưa gặp thì ngừng tự đăng nhập, dòng Log ghi trước khi lượt đóng. */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

const MA_THONG_TIN = 'cred-login-reply';

/** Hộp đã lưu thông tin đăng nhập; mỗi dòng Log ghi kèm việc lượt còn mở lúc ghi hay không. */
function hopDangNhap() {
  const logs = [];
  const { hop } = workflowGas({ logEvent: (line) => logs.push(Object.assign({ open: F.runInProgress(F.stateRead()) }, line)), LOG_WARN: 'warn' });
  const F = hop.FbmSync;
  F.loginConfigSave({ credentialRef: MA_THONG_TIN, enabled: true, envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt' } });
  return { F, logs };
}

/** Lượt đang chờ trả lời Login rồi nộp body; `manual` là lượt người dùng bấm. */
function traLoi(F, body, manual) {
  F.statePatch({ runId: 'login-' + Math.random().toString(36).slice(2), origin: manual ? 'manual' : 'background', phase: 'checking_session', cursor: { kind: 'login', purpose: 'auto', manual: !!manual, testOnly: false, credentialRef: MA_THONG_TIN, resumeCursor: { kind: 'customer_grid' } }, activeRequestId: '', deadlineAt: 0, session: { expired: true } });
  return F.loginAdapterContinue(F.stateRead(), F.stateRead().cursor, { ok: true, status: 200, body: body });
}

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
    ketQua.code, sai.F.stateRead().phase, sai.F.runInProgress(sai.F.stateRead()), dongLoi.open, sai.F.stateRead().message.indexOf('FBM báo sai tên đăng nhập hoặc mật khẩu. Máy ngừng tự đăng nhập') > 0, sai.F.loginConfigRead().loginHalted, sai.F.statusView().forceLoginOffered
  ], ['AUTO_LOGIN_FAILED', 'error', false, true, true, true, false]);
  check(so, 'đã ngừng thì chặn cả lượt bấm tay (mỗi lần bấm là một lần gửi lại mật khẩu sai) và nói lý do lần trước; lưu lại thông tin đăng nhập thì mở lại', [
    sai.F.autoLoginCanAttempt(null, { manual: true }).code, sai.F.autoLoginBlockMessage('AUTO_LOGIN_HALTED').indexOf('Lý do lần trước: FBM báo sai tên đăng nhập') > 0,
    (() => { const cu = sai.F.loginConfigRead(); sai.F.loginConfigSave({ credentialRef: cu.credentialRef, envelope: cu.envelope, public: cu.public }); return [sai.F.loginConfigRead().loginHalted, sai.F.autoLoginCanAttempt(null, { manual: true }).ok]; })()
  ], ['AUTO_LOGIN_HALTED', true, [false, true]]);
  sai.F.autoLoginMarkFailure('FBM báo sai tên đăng nhập hoặc mật khẩu.', true);
  sai.F.autoLoginMarkSuccess();
  check(so, 'đăng nhập được (đăng nhập thử hoặc hủy phiên cũ thành công) thì mở lại tự đăng nhập', sai.F.loginConfigRead().loginHalted, false);

  // Gặp thật 2026-11-01: còn phiên cũ thì FBM trả {"d":"Duplicate"}.
  const cu = hopDangNhap();
  traLoi(cu.F, '{"d":"Duplicate"}');
  check(so, 'còn phiên cũ chạy nền: lượt đóng lỗi, không ngừng tự đăng nhập mà hẹn chu kỳ thử lại, mở nút hủy phiên cũ', [
    cu.F.stateRead().phase, cu.F.loginConfigRead().loginHalted, cu.F.stateRead().message.indexOf('còn giữ phiên đăng nhập cũ') > 0, cu.F.stateRead().message.indexOf('Chạy nền tự thử lại sau 30 phút') > 0, cu.F.statusView().forceLoginOffered
  ], ['error', false, true, true, true]);

  // Gặp thật 2026-10-07: FBM trả {"d":null}; câu trả lời chưa gặp không được đoán thành phiên cũ hay sai mật khẩu.
  const la = hopDangNhap();
  traLoi(la.F, '{"d":null}');
  const nenText = la.F.stateRead().message;
  traLoi(la.F, '{"d":"Locked"}', true);
  const tayText = la.F.stateRead().message, dongLa = la.logs.filter((line) => line.action === 'login_failure');
  check(so, 'câu trả lời chưa gặp: báo chưa gặp và ngừng tự đăng nhập; lượt bấm tay không hứa tự thử lại mà chỉ cách xem trên tab FBM; không mở nút hủy phiên cũ; Log ghi dạng của d và mã chữ ngắn', [
    nenText.indexOf('câu trả lời chưa gặp') > 0, nenText.indexOf('Máy ngừng tự đăng nhập') > 0, tayText.indexOf('Đăng nhập thử') > 0, tayText.indexOf('tự thử lại') < 0, la.F.statusView().forceLoginOffered, la.F.loginConfigRead().loginHalted, dongLa.map((line) => line.detail.response.dType + ':' + (line.detail.response.dCode || ''))
  ], [true, true, true, true, false, true, ['null:', 'string:Locked']]);

  // Đăng nhập thử bằng bản nháp chưa lưu không chứng minh thông tin đã lưu sai.
  const nhap = hopDangNhap();
  nhap.F.statePatch({ runId: 'login-draft', origin: 'manual', phase: 'checking_session', cursor: { kind: 'login', purpose: 'test', testOnly: true, credentialRef: 'cred-draft-other' }, activeRequestId: '', deadlineAt: 0, session: { expired: true } });
  nhap.F.loginAdapterContinue(nhap.F.stateRead(), nhap.F.stateRead().cursor, { ok: true, status: 200, body: '{"d":false}' });
  check(so, 'đăng nhập thử bằng bản nháp bị báo sai mật khẩu: báo cho người dùng nhưng không ngừng tự đăng nhập bằng thông tin đã lưu', [nhap.F.stateRead().message.indexOf('Đăng nhập thử không thành công: FBM báo sai') === 0, nhap.F.loginConfigRead().loginHalted], [true, false]);
}

module.exports = { chay };
