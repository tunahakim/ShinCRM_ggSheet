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
  section('FBM sync - sổ chờ xác nhận và sổ lỗi đẩy');
  {
    const notices = [], resolved = [];
    const flow = workflowGas({ LOG_WARN: 'warn', noticeRaise: (notice) => { const moi = !notices.some((n) => n.title === notice.title); notices.push(notice); return moi; }, noticeResolve: (topic) => { resolved.push(topic); } }), F = flow.hop.FbmSync;
    const T = Date.UTC(2026, 10, 10, 8, 0), PHUT = 60000, tuoi = F.BUDGET.pendingPushStaleMinutes * PHUT;
    const pending = {
      'customer:CUS-1': { hSHIN: 'h1', sentAt: T, fbmId: '' },
      'customer:CUS-2': { hSHIN: 'h2', sentAt: T, fbmId: 'F2' },
      'customer:CUS-3': { hSHIN: 'h3', sentAt: T - tuoi - PHUT, fbmId: '' },
      'activity:ACT-9': { hSHIN: 'h9', sentAt: T, fbmId: 'A9' },
      'customer:CUS-4': { hSHIN: 'h4', sentAt: T - tuoi - PHUT, fbmId: 'F4' }
    };
    const local = { customer: [{ id: 'CUS-1', fbmHash: '' }, { id: 'CUS-2', fbmHash: 'h2' }, { id: 'CUS-3', fbmHash: '' }, { id: 'CUS-4', fbmHash: 'cu' }], activity: [] };
    const sweep = F.pendingSweep(pending, local, T, tuoi);
    check(so, 'pendingSweep: mồ côi là bản ghi đã xóa khỏi Sheet hoặc FBM đã giữ đúng bản gửi; bản ghi tạo khách mất phản hồi (chưa có dấu vân) không bao giờ mồ côi dù quá tuổi; quá tuổi chỉ để báo',
      [sweep.orphans.sort(), sweep.stale.sort()], [['activity:ACT-9', 'customer:CUS-2'], ['customer:CUS-3', 'customer:CUS-4']]);
    F.pendingPushesWrite(pending);
    const scan = { records: (entity) => local[entity] }, logs = [];
    F.pendingSweepApply(scan, logs, T);
    const sauLan1 = Object.keys(F.pendingPushesRead()).sort(), log1 = logs.map((l) => l.action);
    logs.length = 0;
    F.pendingSweepApply(scan, logs, T + PHUT);
    check(so, 'pendingSweepApply: xóa mồ côi trong một lần ghi, giữ mục quá tuổi và mục tạo khách mất phản hồi; thông báo quá tuổi chỉ ghi Log khi mới bật',
      [sauLan1, log1, logs.map((l) => l.action), notices.length, notices[0].topic], [['customer:CUS-1', 'customer:CUS-3', 'customer:CUS-4'], ['pending_push_orphans', 'pending_push_stale'], [], 2, 'fbm_pending_stale']);
    F.pendingPushesWrite({});
    F.pendingSweepApply(scan, logs, T);
    check(so, 'sổ chờ rỗng thì xóa hẳn khóa và gỡ thông báo quá tuổi', [flow.documentProperties.getProperty(F.PENDING_PUSHES_KEY), resolved.indexOf('fbm_pending_stale') >= 0], [null, true]);
  }
  {
    const F = workflowGas().hop.FbmSync, max = F.BUDGET.pushFailuresMax, hashes = {};
    for (let i = 0; i <= max; i += 1) { hashes['customer:CUS-' + i] = 'h' + i; }
    let ma = '';
    try { F.pushFailuresWrite({ hashes, details: {} }); } catch (err) { ma = err.code; }
    check(so, 'sổ lỗi đẩy vượt trần pushFailuresMax thì cổng ghi ném PUSH_FAILURES_OVER_CAP, không cắt bớt im lặng và không ghi gì', [ma, F.pushFailuresRead().hashes], ['PUSH_FAILURES_OVER_CAP', {}]);
  }
}

module.exports = { chay };
