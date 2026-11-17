/** Lưu kết nối tài khoản FBM (`connectionSave`): GAS quyết giữ, lưu hay xóa credential từ nội dung form; mọi phép kiểm chạy trước lần ghi; ghi ba kho trong một `setProperties`; xóa hoặc thay credential thì trả mã khóa cũ cho Extension. */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { taoKhoThuocTinh } = require('../../lib/gas/kho-thuoc-tinh');

const LIEN_KET_A = { spreadsheetId: 'sheet-workflow', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' };
const LIEN_KET_B = { spreadsheetId: 'sheet-workflow', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' };
const banMa = (ref, user) => ({ username: user, credentialRef: ref, envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: user } });

function hop(options) {
  const data = {}, dem = { doc: 0, ghi: 0 }, kho = taoKhoThuocTinh(data, dem);
  kho.data = data;
  const g = workflowGas(Object.assign({ documentProperties: kho }, options || {}));
  return { F: g.hop.FbmSync, hop: g.hop, data, dem, luu: (payload) => g.hop.FbmSync.controlDispatch('save_credential', payload, 'sidebar') };
}

function chay(so) {
  section('FBM sync — Lưu kết nối tài khoản');
  const kiem = hop();
  check(so, 'liên kết thiếu trường, sai Spreadsheet, bản mã hỏng, mã tham chiếu hỏng, credential không có liên kết đều bị từ chối', [
    kiem.luu({ binding: { spreadsheetId: 'sheet-workflow', userId: 'user-a', username: '' } }).code,
    kiem.luu({ binding: Object.assign({}, LIEN_KET_A, { spreadsheetId: 'sheet-khac' }) }).code,
    kiem.luu({ binding: LIEN_KET_A, credential: { username: 'USERA', credentialRef: 'cred-a-123456', envelope: { iv: 'ngan', ciphertext: 'ngan' } } }).code,
    kiem.luu({ binding: LIEN_KET_A, credential: Object.assign(banMa('x', 'USERA')) }).code,
    kiem.luu({ binding: {}, credential: banMa('cred-a-123456', 'USERA') }).code,
    Object.keys(kiem.data).filter((k) => /CONNECTION|CREDENTIAL/.test(k))
  ], ['IDENTITY_BINDING_INCOMPLETE', 'SPREADSHEET_MISMATCH', 'LOGIN_ENVELOPE_INVALID', 'LOGIN_CREDENTIAL_REF_INVALID', 'IDENTITY_BINDING_REQUIRED', []]);

  const g = hop();
  g.F.loginAttemptWrite({ loginHalted: true, lastError: 'FBM báo sai tên đăng nhập hoặc mật khẩu.' });
  const truoc = g.dem.lenh.setProperties || 0;
  const luuMoi = g.luu({ binding: LIEN_KET_A, credential: banMa('cred-a-123456', 'USERA') });
  check(so, 'lưu credential mới: một lần setProperties, gỡ khóa ngừng tự đăng nhập, Sidebar không nhận bản mã, chưa có khóa cũ để xóa', [
    luuMoi.ok, (g.dem.lenh.setProperties || 0) - truoc, g.F.credentialRead().credentialRef, g.F.loginAttemptRead().loginHalted, luuMoi.login.ciphertext, JSON.stringify(luuMoi).includes('ciphertext-long-enough'), luuMoi.keyRefRemove
  ], [true, 1, 'cred-a-123456', false, undefined, false, '']);
  const thay = g.luu({ binding: LIEN_KET_A, credential: banMa('cred-a-999999', 'USERA') });
  check(so, 'thay credential bằng mã tham chiếu mới thì trả mã khóa cũ để Extension xóa', [thay.ok, g.F.credentialRead().credentialRef, thay.keyRefRemove], [true, 'cred-a-999999', 'cred-a-123456']);
  const giu = g.luu({ binding: LIEN_KET_A, credential: { username: 'USERA' } });
  const giuLienKet = g.F.controlDispatch('save_identity_binding', { binding: LIEN_KET_A }, 'sidebar');
  check(so, 'liên kết không đổi: form giữ username (không mật khẩu) hoặc lệnh chỉ lưu liên kết đều giữ credential', [giu.ok, giu.keyRefRemove, giuLienKet.ok, g.F.credentialRead().configured], [true, '', true, true]);
  const thieuMatKhau = g.luu({ binding: LIEN_KET_A, credential: { username: 'USERX' } });
  check(so, 'username khác bản lưu mà không có mật khẩu thì từ chối, không ghi gì', [thieuMatKhau.code, g.F.credentialRead().public.usernameHint], ['LOGIN_PASSWORD_REQUIRED', 'USERA']);
  const doiCoXacNhan = g.luu({ binding: Object.assign({}, LIEN_KET_A, { accountName: 'Tai khoan A moi' }), credential: { username: 'USERA' } });
  check(so, 'đổi liên kết mà form xác nhận đúng username của credential thì giữ credential', [doiCoXacNhan.ok, g.F.credentialRead().configured, doiCoXacNhan.keyRefRemove], [true, true, '']);
  const doiLienKet = g.F.controlDispatch('save_identity_binding', { binding: LIEN_KET_B }, 'sidebar');
  check(so, 'đổi sang tài khoản khác mà không xác nhận credential thì xóa credential (không đăng nhập B bằng mật khẩu A), ghi bản trống cùng lần ghi và trả mã khóa cũ', [
    doiLienKet.ok, g.F.bindingRead().userId, g.F.credentialRead().configured, g.data.FBM_CREDENTIAL_V1, doiLienKet.keyRefRemove, doiLienKet.login.configured
  ], [true, 'user-b', false, '{}', 'cred-a-999999', false]);
  g.luu({ binding: LIEN_KET_B, credential: banMa('cred-b-123456', 'USERB') });
  const xoa = g.luu({ binding: LIEN_KET_B, credential: { username: '' } });
  check(so, 'ô username trống thì xóa credential, giữ liên kết, trả mã khóa', [xoa.ok, g.F.bindingRead().userId, g.F.credentialRead().configured, xoa.keyRefRemove], [true, 'user-b', false, 'cred-b-123456']);
  const vao = g.F.sessionInputs({ cursor: { kind: 'session', resume: { cursor: { kind: 'customer_grid' } } } }, { ok: true, status: 200, body: '{"d":{"Authorized":false,"Rows":[]}}' });
  const cong = g.F.autoLoginGate(Object.assign({ attempt: vao.attempt, now: Date.now() }, vao.login));
  check(so, 'xóa credential rồi lượt nền gặp hết phiên: không tự đăng nhập, credential vẫn trống', [cong.ok, cong.code, g.F.credentialRead().configured, g.data.FBM_CREDENTIAL_V1], [false, 'AUTO_LOGIN_NOT_CONFIGURED', false, '{}']);
  g.luu({ binding: LIEN_KET_B, credential: banMa('cred-b-777777', 'USERB') });
  const go = g.luu({ binding: {} });
  check(so, 'gỡ liên kết thì xóa cả credential, ghi dấu tài khoản vừa gỡ', [go.code, g.F.bindingRead().spreadsheetId || '', g.F.connectionRead().clearedFrom.userId, g.F.credentialRead().configured, go.keyRefRemove], ['IDENTITY_BINDING_CLEARED', '', 'user-b', false, 'cred-b-777777']);

  const ban = hop();
  ban.luu({ binding: LIEN_KET_A, credential: banMa('cred-a-123456', 'USERA') });
  ban.F.runOpen({ phase: 'pull_customer' });
  const banLuu = ban.luu({ binding: LIEN_KET_B });
  check(so, 'lượt đang chạy thì không đổi kết nối, không ghi gì', [banLuu.code, ban.F.bindingRead().userId, ban.F.credentialRead().configured], ['SYNC_BUSY', 'user-a', true]);

  const conDuLieu = hop({ readLocal: () => [{ id: 'CUS-OLD', fbmId: 'FBM-OLD' }] });
  conDuLieu.luu({ binding: LIEN_KET_A });
  conDuLieu.luu({ binding: {} });
  const doiKhiConDuLieu = conDuLieu.luu({ binding: LIEN_KET_B });
  check(so, 'gỡ A rồi lưu B vẫn bị chặn khi Sheet còn dữ liệu đã liên kết', [doiKhiConDuLieu.ok, doiKhiConDuLieu.code], [false, 'REBIND_REQUIRED']);

  const sheetHong = hop();
  sheetHong.hop.FbmSync.currentSpreadsheetId = () => { throw new Error('Exception: Service Spreadsheets timed out'); };
  let loiSheet = '';
  try { sheetHong.F.connectionSave({ binding: LIEN_KET_A }); } catch (err) { loiSheet = String(err && err.message); }
  check(so, 'không đọc được Spreadsheet ID thì ném lỗi thật, không lưu liên kết', [/timed out/.test(loiSheet), sheetHong.F.bindingRead().spreadsheetId || ''], [true, '']);

  const hong = hop();
  hong.luu({ binding: LIEN_KET_A });
  hong.data.FBM_CONNECTION_V1 = '{hỏng';
  let maHong = '';
  try { hong.F.connectionSave({ binding: LIEN_KET_B }); } catch (err) { maHong = err.code; }
  check(so, 'kho kết nối hỏng thì ném DOCUMENT_PROPERTY_CORRUPT, không ghi đè kho hỏng', [maHong, hong.data.FBM_CONNECTION_V1], ['DOCUMENT_PROPERTY_CORRUPT', '{hỏng']);
}

module.exports = { chay };
