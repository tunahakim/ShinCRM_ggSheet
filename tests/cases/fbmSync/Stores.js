/**
 * Kho bền của đồng bộ FBM sau khi gộp: sổ tiến trình nền một khóa, kho kết nối, kho làm việc của lượt, sổ chờ xác nhận, sổ lỗi đẩy, hàm chuyển khóa cũ.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

function chay(so) {
  section('FBM sync - sổ tiến trình nền một khóa');
  {
    const flow = workflowGas(), F = flow.hop.FbmSync;
    flow.documentProperties.setProperty('FBM_SYNC_DONE_HEARTBEAT', '1');
    let ma = '';
    try { F.processBookRead(); } catch (err) { ma = err.code; }
    check(so, 'còn khóa lịch nền cũ mà sổ chưa có: cổng đọc ném FBM_STORES_MIGRATION_PENDING, không đọc thành sổ rỗng (đọc rỗng thì mọi tiến trình chạy lại, mất mốc khách)', ma, 'FBM_STORES_MIGRATION_PENDING');
    flow.documentProperties.deleteProperty('FBM_SYNC_DONE_HEARTBEAT');
    check(so, 'Sheet mới chưa có sổ và không có khóa cũ: sổ rỗng, mốc khách null, con trỏ -1', [F.processBookRead().heartbeat.doneAt, F.processBookRead().customerFull.baseline, F.processBookRead().detail.cursor], [0, null, -1]);
  }
  {
    const F = workflowGas().hop.FbmSync;
    const goc = F.processBookRead(), anh = JSON.stringify(goc), T = Date.UTC(2026, 10, 10, 8, 0);
    const loi1 = F.processBookMark(goc, 'customerFull', 'failed', T), loi2 = F.processBookMark(loi1.book, 'customerFull', 'failed', T), xong = F.processBookMark(loi2.book, 'customerFull', 'done', T + 1);
    let ma = '';
    try { F.processBookMark(goc, 'khongCo', 'done', T); } catch (err) { ma = err.code; }
    check(so, 'processBookMark là hàm thuần: không sửa sổ đầu vào; lỗi liền nhân đôi giờ thử lại; xong thì xóa lỗi; tên tiến trình lạ thì ném',
      [JSON.stringify(goc) === anh, [loi1.failures, loi1.minutes, loi2.failures, loi2.minutes], loi2.book.customerFull.retryAt === T + loi2.minutes * 60000, [xong.book.customerFull.doneAt, xong.book.customerFull.failures, xong.book.customerFull.retryAt], ma],
      [true, [1, 5, 2, 10], true, [T + 1, 0, 0], 'PROCESS_KIND_UNKNOWN']);
    const ghi = [];
    const docGoc = F.processBookWrite;
    F.processBookWrite = (book) => { ghi.push(book); return docGoc(book); };
    const dong = (done) => { const st = { metadata: { customerTotal: 77, rotationCursor: 4512.0 } }; F.runMarksCommit(st, done); return Object.keys(st.metadata).length; };
    const conLoi = dong(false), soLanLoi = ghi.length, conXong = dong(true);
    F.processBookWrite = docGoc;
    check(so, 'Mốc số khách và con trỏ Vòng xoay: lượt không xong không ghi sổ; lượt xong ghi cả hai trong một lần ghi sổ; cả hai lần đều xóa mốc tạm khỏi metadata',
      [conLoi, soLanLoi, conXong, ghi.length, F.processBookRead().customerFull.baseline, F.processBookRead().detail.cursor], [0, 0, 0, 1, 77, 4512]);
  }
  section('FBM sync - kho kết nối một khóa');
  {
    const flow = workflowGas(), F = flow.hop.FbmSync, kho = flow.documentProperties;
    kho.setProperty('FBM_SYNC_BINDING_V1', JSON.stringify({ spreadsheetId: 'sheet-workflow', userId: 'u1', username: 'A', accountName: 'Tai khoan A' }));
    let ma = '';
    try { F.bindingRead(); } catch (err) { ma = err.code; }
    kho.deleteProperty('FBM_SYNC_BINDING_V1');
    check(so, 'còn khóa liên kết cũ mà kho kết nối chưa có: đọc liên kết ném FBM_STORES_MIGRATION_PENDING, không hiện "chưa liên kết"', ma, 'FBM_STORES_MIGRATION_PENDING');
    const khoaFbm = () => Object.keys(kho.getProperties()).filter((key) => /BINDING|CONNECTION/.test(key));
    F.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: 'u1', username: 'A', accountName: 'Tai khoan A' });
    F.stateRead = () => ({});
    F.bindingClear();
    const sauGo = F.connectionRead();
    F.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: 'u2', username: 'B', accountName: 'Tai khoan B' });
    const sauLienKetMoi = F.connectionRead();
    check(so, 'gỡ liên kết giữ dấu tài khoản vừa gỡ trong cùng khóa; liên kết mới bỏ dấu trong cùng lần ghi; chỉ có một khóa FBM_CONNECTION_V1',
      [sauGo.binding.userId || '', sauGo.clearedFrom.userId, sauLienKetMoi.binding.userId, Object.keys(sauLienKetMoi.clearedFrom).length, khoaFbm()],
      ['', 'u1', 'u2', 0, ['FBM_CONNECTION_V1']]);
    F.connectionWrite({ binding: {}, clearedFrom: {} });
    check(so, 'kho kết nối rỗng cả hai phần thì xóa hẳn khóa', khoaFbm(), []);
  }
}

module.exports = { chay };
