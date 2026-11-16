/** Cổng phiên ở bước phát request và chặng phiên: thứ tự cổng, lệnh ghi nghi phiên, nối lại lượt dở, dựng lại request sau khi phiên vừa xác minh. */
const { section, check } = require('../../lib/assert');
const { workflowGas, noiLat } = require('../../lib/fbm/hop-dong-bo');
const { TRANG_FBM_THU } = require('../../lib/load-gas');

const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const NGUOI_DUNG = { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' };
const PHIEN_SONG = '{"d":{"TotalRowCount":1,"Rows":[[2037,"ANHLT","Le Tuan Anh"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}';
const LUOI_KHACH = { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 };

/** Hộp có liên kết đã xác nhận và một lượt đọc đang chạy ở `cursor`, phiên chưa xác minh. */
function hopLuot(cursor, patch) {
  const { hop } = workflowGas();
  const F = hop.FbmSync;
  F.bindingWrite(NGUOI_DUNG);
  F.stateWrite(Object.assign(F.runOpen({ phase: 'pull_customer' }), { entity: 'customer', cursor: cursor }, patch || {}));
  return F;
}
/** Trả lời request đang chờ bằng response `body` qua lát (như lệnh `continue`). */
function traLoi(F, body, status) {
  return noiLat(F, { ok: (status || 200) === 200, status: status || 200, body: body, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: F.stateRead().activeRequestId }] } });
}

async function chay(so) {
  section('FBM sync — cổng phiên và chặng phiên');

  // Hết ngân sách lời gọi xét trước cổng phiên: lượt tạm dừng ở đúng cursor nghiệp vụ, không để lại cursor phiên mà lần chạy sau phải gỡ.
  const ngan = hopLuot(LUOI_KHACH);
  ngan._callStartedAt = Date.now() - ngan.BUDGET.gasSoftMs - 1000;
  const nganKetQua = ngan.cursorIssue();
  ngan._callStartedAt = 0;
  check(so, 'hết ngân sách khi cổng phiên sắp mở: tạm dừng, giữ cursor nghiệp vụ, không phát request', [nganKetQua && nganKetQua.request || null, ngan.stateRead().phase, ngan.stateRead().cursor.kind, ngan.stateRead().activeRequestId], [null, 'paused', 'customer_grid', '']);

  // Phiên chưa xác minh: request gửi đi là request hỏi phiên; phiên sống đúng tài khoản thì dựng lại request nghiệp vụ bằng danh tính vừa xác minh (lọc quyền theo mã người dùng).
  const mo = hopLuot(LUOI_KHACH);
  const hoi = mo.cursorIssue();
  const tiep = traLoi(mo, PHIEN_SONG);
  const khoaLoc = JSON.stringify(tiep.request && tiep.request.body && tiep.request.body.externalKey || []);
  check(so, 'cổng mở trước request nghiệp vụ; phiên sống thì nối lại đúng cursor cũ và request mang mã người dùng vừa xác minh', [hoi.meta.kind, tiep.ok, tiep.request && tiep.request.meta.kind, mo.stateRead().cursor.kind, mo.stateRead().session.identityVerified, khoaLoc.indexOf("GetCustomerValidate('2037')") >= 0], ['session_probe', true, 'grid', 'customer_grid', true, true]);

  // Lệnh ghi (request không gửi lại được) gặp phản hồi đáng ngờ: probe thấy phiên sống vẫn dừng, vì FBM có thể đã nhận lệnh.
  const ghi = hopLuot({ kind: 'push_wait', operation: 'customer_edit_save' }, { phase: 'push', activeRequestReplay: false });
  ghi.sessionSuspectRun(ghi.stateRead(), 'Phản hồi FBM đáng ngờ khi chờ lệnh ghi.');
  const ghiCursor = ghi.stateRead().cursor;
  const ghiKetQua = traLoi(ghi, PHIEN_SONG);
  check(so, 'lệnh ghi nghi phiên: mở chặng phiên không gửi lại, probe sống thì dừng SESSION_SUSPECTED_LIVE và không phát request', [ghiCursor.kind, ghiCursor.cause, ghiCursor.replay, ghiKetQua.ok, ghiKetQua.code, ghiKetQua.request, ghi.stateRead().phase], ['session', 'suspected', false, false, 'SESSION_SUSPECTED_LIVE', null, 'error']);

  // Lệnh ghi đang chờ mà phiên chết: tạm dừng giữ cursor ghi, không tự đăng nhập để gửi lại.
  const chet = hopLuot({ kind: 'push_wait', operation: 'customer_edit_save' }, { phase: 'push', activeRequestReplay: false });
  chet.sessionSuspectRun(chet.stateRead(), 'Phản hồi FBM đáng ngờ khi chờ lệnh ghi.');
  const chetKetQua = traLoi(chet, '{"d":{"TotalRowCount":0,"Rows":null,"ViewPage":null,"Authorized":false}}');
  check(so, 'phiên chết khi đang chờ lệnh ghi: tạm dừng SESSION_EXPIRED_AT_WRITE, không gửi đăng nhập', [chetKetQua.code, chetKetQua.request, chet.stateRead().phase], ['SESSION_EXPIRED_AT_WRITE', null, 'paused']);

  // Bấm chạy khi lượt vừa dừng giữa chừng: cursor khai `resumable: false` thì báo bận; đang ở chặng phiên thì gửi lại chính request hỏi phiên, không mở chặng phiên lồng.
  const dangNhap = hopLuot(ghi.loginCursorOpen({ purpose: 'auto', afterLogin: { cursor: LUOI_KHACH } }), { phase: 'checking_session' });
  const phien = hopLuot({ kind: 'session', cause: 'issue', resume: { cursor: LUOI_KHACH, phase: 'pull_customer', entity: 'customer' }, replay: false, probeRetried: false, pageReloaded: false }, { phase: 'checking_session' });
  const phienLai = phien.startRun({ origin: 'manual', manual: true, mode: 'read' });
  check(so, 'nối lượt dở: lượt đăng nhập không nối mù; chặng phiên gửi lại request hỏi phiên với nguyên chỗ quay về', [
    dangNhap.startRun({ origin: 'manual', manual: true, mode: 'read' }).code, phienLai.ok, phienLai.request && phienLai.request.meta.kind, phien.stateRead().cursor.kind, phien.stateRead().cursor.resume.cursor.kind
  ], ['SYNC_BUSY', true, 'session_probe', 'session', 'customer_grid']);
}

module.exports = { chay };
