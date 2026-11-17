/** Hủy phiên cũ rồi chạy tiếp: GAS nhớ lượt FBM vừa chặn vì còn phiên cũ và tự quyết sau khi đăng nhập ép thành công (lượt đồng bộ tay không đẩy thì mở lại đúng loại đó, nối mã lượt qua `follows`; lượt đẩy, lượt nền, Đăng nhập thử thì chỉ đăng nhập). Sidebar không tự mở lượt. */
const { section, check } = require('../../lib/assert');
const { workflowGas, trongLat } = require('../../lib/fbm/hop-dong-bo');
const { datState } = require('../../lib/fbm/dat-state');

function hopDangNhap() {
  const { hop } = workflowGas({ logEvent() {}, LOG_WARN: 'warn' });
  const F = hop.FbmSync;
  F.credentialWrite({ credentialRef: 'cred-force-resume', ciphertext: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt' } });
  return F;
}
/** Lượt `luot` (nguồn, chiều, mức quét, gói) đang ở bước Login của mục đích `purpose`, FBM trả còn phiên cũ. */
function biChan(F, luot, purpose) {
  datState(F, Object.assign({ runId: 'chan-' + Math.random().toString(36).slice(2), phase: 'checking_session', activeRequestId: '', deadlineAt: 0, session: { expired: true },
    cursor: F.loginCursorOpen({ purpose: purpose || 'auto', step: 'login', facts: { salt: 'ab12cd34', database: 'FHN_CRM_App', unit: 'CTY' }, afterLogin: { cursor: { kind: 'customer_grid' } } }) }, luot));
  return trongLat(F, () => F.stageRun(F.cursorTable('login'), F.stateRead(), { ok: true, status: 200, body: '{"d":"Duplicate"}' }));
}
/** Bấm Hủy phiên cũ rồi FBM nhận đăng nhập: trả `[mã lượt đăng nhập ép, kết quả]`. */
function huyPhienCu(F) {
  const mo = F.runSlice(() => F.loginOpen('force', {}, F.stateRead()));
  const runId = F.stateRead().runId;
  return [mo.ok, runId, trongLat(F, () => F.loginEnd(F.stateRead(), { ok: true }))];
}

function chay(so) {
  section('FBM sync — Hủy phiên cũ rồi chạy tiếp');
  const doc = hopDangNhap();
  biChan(doc, { origin: 'manual', mode: 'read', scan: 'full', scanPack: 'quick' });
  check(so, 'lượt đồng bộ tay chỉ đọc bị chặn vì còn phiên cũ: mở nút hủy phiên cũ và nhớ đúng chiều, gói của lượt bị chặn',
    [doc.statusView().actions.forceLogin, doc.stateRead().loginForceResume], [true, { mode: 'read', pack: 'quick' }]);
  const [moDoc, maDangNhap, tiep] = huyPhienCu(doc);
  check(so, 'hủy phiên cũ xong thì GAS mở lại lượt đồng bộ tay cùng chiều và gói, mã lượt mới nối mã lượt đăng nhập để Sidebar chờ tiếp; nút hủy phiên đóng lại',
    [moDoc, tiep.ok, !!tiep.request, doc.stateRead().origin, doc.stateRead().mode, doc.stateRead().scanPack, doc.stateRead().runId !== maDangNhap, doc.statusView().follows === maDangNhap, doc.stateRead().loginForceOffered, doc.stateRead().loginForceResume],
    [true, true, true, 'manual', 'read', 'quick', true, true, false, null]);

  const day = hopDangNhap();
  biChan(day, { origin: 'manual', mode: 'write', scan: 'full', scanPack: 'quick' });
  const [, maDay, ketDay] = huyPhienCu(day);
  check(so, 'lượt bị chặn có đẩy lên FBM: chỉ đăng nhập, không mở lượt đẩy (phải duyệt lại trên dữ liệu lúc đó), báo bấm Đồng bộ lại',
    [ketDay.code, ketDay.request, day.stateRead().runId, day.stateRead().phase, /Bấm Đồng bộ lại/.test(ketDay.message)], ['LOGIN_OK', null, maDay, 'done', true]);

  const nen = hopDangNhap();
  biChan(nen, { origin: 'background', process: 'customerFull', mode: 'read', scan: 'full', scanPack: 'quick' });
  const [, maNen, ketNen] = huyPhienCu(nen);
  check(so, 'lượt nền bị chặn: hủy phiên cũ chỉ đăng nhập, lượt nền tự chạy lại theo lịch', [nen.stateRead().runId === maNen, ketNen.code, ketNen.request], [true, 'LOGIN_OK', null]);

  const thu = hopDangNhap();
  biChan(thu, { origin: 'manual', mode: 'read' }, 'test');
  const [moThu, maThu, ketThu] = huyPhienCu(thu);
  check(so, 'Đăng nhập thử bị chặn: hủy phiên cũ chỉ đăng nhập và kết thúc LOGIN_OK', [moThu, ketThu.code, ketThu.request, thu.stateRead().runId === maThu, /Bấm Đồng bộ lại/.test(ketThu.message)], [true, 'LOGIN_OK', null, true, false]);

  const kiem = hopDangNhap();
  biChan(kiem, { origin: 'manual', mode: 'check', scan: 'identity_check' });
  check(so, 'lượt kiểm tra liên kết bị chặn: không có lượt đồng bộ để mở lại', kiem.stateRead().loginForceResume, null);
}

module.exports = { chay };
