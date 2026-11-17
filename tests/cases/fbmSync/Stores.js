/**
 * Kho bền của đồng bộ FBM sau khi gộp: sổ tiến trình nền một khóa, kho kết nối, kho làm việc của lượt, sổ chờ xác nhận, sổ lỗi đẩy, hàm chuyển khóa cũ.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { napServer } = require('../../lib/load-gas');

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
    F.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: 'u1', username: 'A', accountName: 'Tai khoan A' } });
    F.stateRead = () => ({});
    F.connectionSave({ binding: {} });
    const sauGo = F.connectionRead();
    F.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: 'u2', username: 'B', accountName: 'Tai khoan B' } });
    const sauLienKetMoi = F.connectionRead();
    check(so, 'gỡ liên kết giữ dấu tài khoản vừa gỡ trong cùng khóa; liên kết mới bỏ dấu trong cùng lần ghi; chỉ có một khóa FBM_CONNECTION_V1',
      [sauGo.binding.userId || '', sauGo.clearedFrom.userId, sauLienKetMoi.binding.userId, Object.keys(sauLienKetMoi.clearedFrom).length, khoaFbm()],
      ['', 'u1', 'u2', 0, ['FBM_CONNECTION_V1']]);
    F.connectionWrite({ binding: {}, clearedFrom: {} });
    check(so, 'kho kết nối rỗng cả hai phần thì xóa hẳn khóa', khoaFbm(), []);
  }
  section('FBM sync - sổ lỗi đẩy');
  {
    const F = workflowGas().hop.FbmSync, max = F.BUDGET.pushFailuresMax, hashes = {};
    for (let i = 0; i <= max; i += 1) { hashes['customer:CUS-' + i] = 'h' + i; }
    let ma = '';
    try { F.pushFailuresWrite({ hashes, details: {} }); } catch (err) { ma = err.code; }
    check(so, 'sổ lỗi đẩy vượt trần pushFailuresMax thì cổng ghi ném PUSH_FAILURES_OVER_CAP, không cắt bớt im lặng và không ghi gì', [ma, F.pushFailuresRead().hashes], ['PUSH_FAILURES_OVER_CAP', {}]);
  }
  section('FBM sync - hàm chuyển kho một lần fbmStoresMigrate');
  {
    const logs = [], flow = workflowGas({ logEvent: (e) => { logs.push(e); } }), F = flow.hop.FbmSync, kho = flow.documentProperties;
    napServer(flow.hop, 'fbm_sync/state/FbmStoresMigrate.js');
    const lienKet = { spreadsheetId: 'sheet-workflow', userId: 'u1', username: 'A', accountName: 'Tai khoan A' };
    const cu = {
      FBM_SYNC_DONE_CUSTOMER_FULL_SCAN: '1794300044222', FBM_SYNC_DONE_HEARTBEAT: '1794300100000',
      FBM_SYNC_RETRY_DETAIL_SCAN: JSON.stringify({ failures: 2, retryAt: 1794300900000 }),
      FBM_SYNC_CUSTOMER_BASELINE_V1: JSON.stringify({ total: 7, at: 1794300797986 }), FBM_SYNC_DETAIL_CURSOR_V1: JSON.stringify({ cus: 20075, at: 1794302080247 }),
      FBM_SYNC_BINDING_V1: JSON.stringify(lienKet), FBM_SYNC_PUSH_CLEAN_V1: '{}',
      FBM_SYNC_SEEN_CUSTOMER_ACTIVITY_READ_0: 'ff', FBM_SYNC_SEEN_CUSTOMER_ACTIVITY_READ_SHARDS: '1', FBM_SYNC_PENDING_PUSHES_V1: JSON.stringify({ 'customer:CUS-1': { hSHIN: 'h', sentAt: 1, fbmId: '' } })
    };
    Object.keys(cu).forEach((key) => kho.setProperty(key, cu[key]));
    const kq = flow.hop.fbmStoresMigrate(), so1 = F.processBookRead(), cuCon = Object.keys(kho.getProperties()).filter((key) => key in cu);
    check(so, 'chuyển kho: giữ đúng nghĩa khóa cũ (giờ chạy xong, lần thử lại, mốc khách, con trỏ Vòng xoay, liên kết), xóa khóa cũ, khóa dấu đẩy sạch, sổ chờ xác nhận đã bỏ và kho làm việc còn sót, ghi một dòng Log',
      [so1.customerFull.doneAt, so1.heartbeat.doneAt, so1.detail.failures, so1.detail.retryAt, so1.customerFull.baseline, so1.detail.cursor, F.bindingRead().userId, cuCon, kq.written.sort(), logs.filter((l) => l.action === 'fbmStoresMigrate').length],
      [1794300044222, 1794300100000, 2, 1794300900000, 7, 20075, 'u1', [], ['FBM_CONNECTION_V1', 'FBM_SYNC_PROCESS_BOOK_V1'], 1]);
    const anh = JSON.stringify(kho.getProperties()), kq2 = flow.hop.fbmStoresMigrate();
    check(so, 'chạy lại hàm chuyển không đổi gì trong kho', [JSON.stringify(kho.getProperties()) === anh, kq2.written, kq2.deleted, /không có gì/.test(kq2.report[0])], [true, [], [], true]);
    kho.setProperty('FBM_SYNC_DONE_HEARTBEAT', '5');
    flow.hop.fbmStoresMigrate();
    check(so, 'sổ mới đã có thì khóa cũ còn sót chỉ bị xóa, không đè sổ', [F.processBookRead().heartbeat.doneAt, kho.getProperty('FBM_SYNC_DONE_HEARTBEAT')], [1794300100000, null]);
  }
  {
    const flow = workflowGas(), F = flow.hop.FbmSync, kho = flow.documentProperties;
    napServer(flow.hop, 'fbm_sync/state/FbmStoresMigrate.js');
    kho.setProperty('FBM_SYNC_DONE_HEARTBEAT', '1');
    kho.setProperty('FBM_SYNC_DETAIL_CURSOR_V1', '{hỏng');
    let ma = '';
    try { flow.hop.fbmStoresMigrate(); } catch (err) { ma = err.code; }
    const conCu = [kho.getProperty('FBM_SYNC_DONE_HEARTBEAT'), kho.getProperty('FBM_SYNC_DETAIL_CURSOR_V1'), kho.getProperty('FBM_SYNC_PROCESS_BOOK_V1')];
    kho.setProperty('FBM_SYNC_DETAIL_CURSOR_V1', '{}');
    F.stateWrite(Object.assign(F.stateDefault(), { runId: 'r1', phase: 'pull_customer' }));
    let maChay = '';
    try { flow.hop.fbmStoresMigrate(); } catch (err) { maChay = err.code; }
    check(so, 'khóa cũ hỏng hoặc đang có lượt chạy: hàm chuyển ném có mã, chưa ghi sổ mới và khóa cũ còn nguyên',
      [ma, conCu, maChay, kho.getProperty('FBM_SYNC_DONE_HEARTBEAT'), kho.getProperty('FBM_SYNC_PROCESS_BOOK_V1')],
      ['DOCUMENT_PROPERTY_CORRUPT', ['1', '{hỏng', null], 'FBM_STORES_MIGRATE_RUN_ACTIVE', '1', null]);
  }
  section('FBM sync - kho làm việc sống trong một lượt');
  {
    const flow = workflowGas(), F = flow.hop.FbmSync, kho = flow.documentProperties, bang = F.RUN_WORK_STORES;
    const khoaLam = Object.keys(bang.bits).map((scope) => F.seenStorePrefix(scope) + '0').concat(bang.lists.map((prefix) => prefix + 'SHARDS'), bang.keys);
    const gieo = () => { khoaLam.forEach((key) => kho.setProperty(key, '1')); kho.setProperty(F.PUSH_FAILURES_KEY, '{"hashes":{},"details":{}}'); };
    const conLai = () => F.workStoreKeys(Object.keys(kho.getProperties()));
    const giu = () => [F.PUSH_FAILURES_KEY].filter((key) => kho.getProperty(key) !== null).length;
    gieo();
    F.withOrchestrationLock(() => { F.runOpen({ phase: 'pull_customer' }); });
    const sauMo = [conLai(), giu()];
    const ketLuan = Object.keys(F.RUN_VERDICTS).map((verdict) => {
      F.withOrchestrationLock(() => { F.stateWrite(F.runOpen({ phase: 'pull_customer' })); });
      gieo();
      F.withOrchestrationLock(() => { const st = F.stateRead(); F.runClose(st, verdict, {}); F.stateWrite(st); });
      return verdict + ':' + conLai().length + ':' + giu();
    });
    check(so, 'runOpen xóa kho làm việc sót của lượt trước, giữ sổ lỗi đẩy', sauMo, [[], 1]);
    let maLa = '';
    try { F.seenStoreKind('customer_khong_khai'); } catch (err) { maLa = err.code; }
    check(so, 'kho bit không khai trong RUN_WORK_STORES thì ném, không đoán loại mã theo tên', maLa, 'SEEN_STORE_UNKNOWN');
    check(so, 'mọi kết luận đóng lượt đều không để lại khóa kho làm việc nào, giữ sổ lỗi đẩy', ketLuan, Object.keys(F.RUN_VERDICTS).map((verdict) => verdict + ':0:1'));
  }
}

module.exports = { chay };
