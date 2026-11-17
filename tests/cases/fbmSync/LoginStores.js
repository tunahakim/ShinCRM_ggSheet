/** Hai kho đăng nhập (credential, dấu lần thử) và hàm chuyển một lần `fbmLoginMigrate` từ khóa gộp đời cũ. */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { napServer } = require('../../lib/load-gas');

const BAN_MA = { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ban-ma-gia-du-dai-K8' };
const CU = {
  FBM_LOGIN_CONFIG_V1: JSON.stringify({ configured: true, credentialRef: 'ref-cu-12345678', envelope: BAN_MA, public: { usernameHint: 'anhlt', database: 'FHN_CRM_App', unit: 'CTY', language: 'v' }, lastAttemptAt: 100, lastLoginAt: 50, nextRetryAt: 200, lastError: 'Sai mật khẩu', loginHalted: true }),
  FBM_AUTO_LOGIN_LAST_ATTEMPT_V1: '150'
};

function dung(khoaCu) {
  const logs = [], flow = workflowGas({ logEvent: (e) => { logs.push(e); } }), kho = flow.documentProperties;
  napServer(flow.hop, 'fbm_sync/state/FbmSettingsMigrate.js', 'fbm_sync/state/FbmStoresMigrate.js', 'fbm_sync/state/FbmLoginMigrate.js');
  Object.keys(khoaCu || {}).forEach((key) => kho.setProperty(key, khoaCu[key]));
  return { flow, F: flow.hop.FbmSync, kho, logs };
}
const ma = (fn) => { try { fn(); return ''; } catch (err) { return err.code || String(err.message); } };

function kiemChuyen(so) {
  section('FBM sync - kho đăng nhập tách đôi và hàm chuyển fbmLoginMigrate');
  const t = dung(CU);
  check(so, 'chưa chuyển: cổng đọc hai kho mới ném FBM_LOGIN_MIGRATION_PENDING, không đọc thành chưa cấu hình', [ma(() => t.F.credentialRead()), ma(() => t.F.loginAttemptRead())], ['FBM_LOGIN_MIGRATION_PENDING', 'FBM_LOGIN_MIGRATION_PENDING']);
  const kq = t.flow.hop.fbmLoginMigrate(), cred = t.F.credentialRead(), lan = t.F.loginAttemptRead();
  check(so, 'chuyển: credential giữ ref, bản mã, phần công khai; dấu lần thử lấy giờ thử muộn nhất, giữ khóa ngừng; xóa hai khóa cũ; một dòng Log',
    [cred.configured, cred.credentialRef, cred.ciphertext.ciphertext, cred.public.usernameHint, lan, t.kho.getProperty('FBM_LOGIN_CONFIG_V1'), t.kho.getProperty('FBM_AUTO_LOGIN_LAST_ATTEMPT_V1'), kq.written.sort(), t.logs.filter((l) => l.action === 'fbmLoginMigrate').length],
    [true, 'ref-cu-12345678', BAN_MA.ciphertext, 'anhlt', { lastAttemptAt: 150, lastLoginAt: 50, nextRetryAt: 200, lastError: 'Sai mật khẩu', loginHalted: true }, null, null, ['FBM_CREDENTIAL_V1', 'FBM_LOGIN_ATTEMPT_V1'], 1]);
  check(so, 'kết quả hàm chuyển không mang bản mã', JSON.stringify(kq).indexOf(BAN_MA.ciphertext), -1);
  const anh = JSON.stringify(t.kho.getProperties()), kq2 = t.flow.hop.fbmLoginMigrate();
  check(so, 'chạy lại hàm chuyển không đổi gì trong kho', [JSON.stringify(t.kho.getProperties()) === anh, kq2.written, kq2.deleted, /không có gì/.test(kq2.report[0])], [true, [], [], true]);

  const moi = dung(CU);
  moi.F.credentialWrite({ credentialRef: 'ref-moi-87654321', ciphertext: BAN_MA, public: { usernameHint: 'moi' } });
  moi.flow.hop.fbmLoginMigrate();
  check(so, 'kho mới đã có (lưu lại kết nối sau lần đẩy) thì giữ kho mới, chỉ xóa khóa cũ', [moi.F.credentialRead().credentialRef, moi.kho.getProperty('FBM_LOGIN_CONFIG_V1')], ['ref-moi-87654321', null]);

  const hong = dung({ FBM_LOGIN_CONFIG_V1: '{hỏng', FBM_AUTO_LOGIN_LAST_ATTEMPT_V1: '1' });
  const maHong = ma(() => hong.flow.hop.fbmLoginMigrate());
  const chinhSach = dung({ FBM_LOGIN_CONFIG_V1: JSON.stringify({ enabled: true, credentialRef: 'ref-cu-12345678', envelope: BAN_MA }) });
  const maChinhSach = ma(() => chinhSach.flow.hop.fbmLoginMigrate());
  const chay = dung(CU);
  chay.F.stateWrite(Object.assign(chay.F.stateDefault(), { runId: 'r1', phase: 'pull_customer' }));
  const maChay = ma(() => chay.flow.hop.fbmLoginMigrate());
  check(so, 'khóa cũ hỏng, còn chính sách tự đăng nhập hoặc đang có lượt chạy: ném có mã, chưa ghi kho mới, khóa cũ còn nguyên',
    [maHong, hong.kho.getProperty('FBM_LOGIN_CONFIG_V1'), hong.kho.getProperty('FBM_CREDENTIAL_V1'), maChinhSach, chinhSach.kho.getProperty('FBM_CREDENTIAL_V1'), !!chinhSach.kho.getProperty('FBM_LOGIN_CONFIG_V1'), maChay, !!chay.kho.getProperty('FBM_LOGIN_CONFIG_V1'), chay.kho.getProperty('FBM_LOGIN_ATTEMPT_V1')],
    ['DOCUMENT_PROPERTY_CORRUPT', '{hỏng', null, 'FBM_LOGIN_MIGRATE_SETTINGS_PENDING', null, true, 'FBM_STORES_MIGRATE_RUN_ACTIVE', true, null]);
}

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

function chay(so) { kiemChuyen(so); kiemKho(so); }

module.exports = { chay };
