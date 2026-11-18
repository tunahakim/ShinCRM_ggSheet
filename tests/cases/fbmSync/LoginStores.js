/** Hai kho đăng nhập (credential, dấu lần thử): ghi tách nhau, công cụ tính dấu lần thử. */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

const BAN_MA = { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ban-ma-gia-du-dai-K8' };
function dung(khoaCu) {
  const logs = [], flow = workflowGas({ logEvent: (e) => { logs.push(e); } }), kho = flow.documentProperties;
  Object.keys(khoaCu || {}).forEach((key) => kho.setProperty(key, khoaCu[key]));
  return { flow, F: flow.hop.FbmSync, kho, logs };
}
const ma = (fn) => { try { fn(); return ''; } catch (err) { return err.code || String(err.message); } };

function kiemKho(so) {
  const t = dung({}), F = t.F;
  check(so, 'kho trống: chưa cấu hình, dấu lần thử bằng không', [F.credentialRead().configured, F.loginAttemptRead()], [false, { lastAttemptAt: 0, lastLoginAt: 0, nextRetryAt: 0, lastError: '', loginHalted: false }]);
  F.credentialWrite({ credentialRef: 'ref-k-12345678', ciphertext: BAN_MA, public: {} });
  const cu = F.loginAttemptRead();
  F.credentialWrite(null);
  F.loginAttemptWrite(F.loginAttemptMark(cu, { kind: 'failure', message: 'Sai', halt: true }, 1000, 30));
  check(so, 'ghi dấu lần thử từ bản đọc trước khi credential bị xóa không khôi phục credential (xóa là ghi bản trống, cùng một lần setProperties)', [t.kho.getProperty('FBM_CREDENTIAL_V1'), F.credentialRead().configured, F.loginAttemptRead().loginHalted], ['{}', false, true]);
  const mark = (truoc, suKien) => F.loginAttemptMark(truoc, suKien, 10 * 60 * 1000, 30);
  const thu = mark({}, { kind: 'attempt', transportText: 'Mất kết nối' }), hong2 = mark(thu, { kind: 'failure', message: 'Sai', halt: true });
  check(so, 'công cụ tính dấu lần thử: thử ghi lý do đường truyền và hạn; hỏng giữ ngừng; lưu mới gỡ ngừng giữ hạn; thành công gỡ hết; xóa bỏ hạn; sự kiện lạ thì ném',
    [thu.lastError, thu.nextRetryAt, hong2.loginHalted, mark(hong2, { kind: 'saved' }).loginHalted, mark(hong2, { kind: 'saved' }).nextRetryAt, mark(hong2, { kind: 'success' }), mark(hong2, { kind: 'cleared' }).nextRetryAt, ma(() => mark({}, { kind: 'la' }))],
    ['Mất kết nối', 10 * 60 * 1000 + 30 * 60 * 1000, true, false, 40 * 60 * 1000, { lastAttemptAt: 10 * 60 * 1000, lastLoginAt: 10 * 60 * 1000, nextRetryAt: 0, lastError: '', loginHalted: false }, 0, 'LOGIN_ATTEMPT_EVENT_UNKNOWN']);
}

function chay(so) { kiemKho(so); }

module.exports = { chay };
