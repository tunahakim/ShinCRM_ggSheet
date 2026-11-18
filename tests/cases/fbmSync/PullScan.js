/** Mở việc quét và trang kéo: cursor và state không phình, mô tả trang FBM, tiến trình lượt, xét khách vắng, mốc số khách chỉ ghi khi lượt đóng xong. */
const { trongLat } = require('../../lib/fbm/hop-dong-bo');
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer, TEP_KHUNG_LUOT } = require('../../lib/load-gas');
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');
const { hopKeoVe } = require('../../lib/fbm/hop-keo');
const { luoiDaCat } = require('../../lib/fbm/tab-fbm-gia');

async function chay(so) {
  section('FBM sync — Mở việc quét và trang kéo');
  const builders = hopKeoVe();
  let bulkState = { mode: 'read', scan: 'activity_bulk', phase: 'pull_activity', entity: 'activity', metadata: {}, cursor: {} };
  builders.FbmSync.stateRead = () => bulkState;
  builders.FbmSync.stateWrite = (next) => { bulkState = next; return next; };
  builders.FbmSync.readLocal = () => [{ id: 'ACT-000001', fbmId: 'F-LOCAL', recordStatus: 'active' }];
  const bulkStart = builders.FbmSync.beginActivityBulkPull(bulkState, builders.FbmSync.scriptSettings(bulkState));
  check(so, 'Lấy toàn bộ giao dịch mở một việc quét chỉ giữ FBM ID đã có trên Sheet, có trần cỡ response, không gắn Customer; cursor không mang danh sách id',
    [bulkState.cursor.kind, bulkState.cursor.entity, bulkStart.meta.kind, bulkStart.meta.job.keepIds, bulkStart.meta.job.maxResponseBytes, bulkStart.body.externalKey.some((item) => item.Name === 'stt_rec'), JSON.stringify(bulkState.cursor).indexOf('F-LOCAL')],
    ['scan_job', 'activity', 'scan_job', ['F-LOCAL'], 64 * 1024 * 1024, false, -1]);

  // Danh sách khách lấy trọn bằng việc quét; cursor không mang danh sách khách nên state không phình theo số khách (lỗi thật: 1.312 khách làm state 76 KB).
  let pageState = { mode: 'read', scan: 'full', phase: 'lookup', metadata: {}, session: {}, cursor: {} };
  builders.FbmSync.stateRead = () => pageState;
  builders.FbmSync.stateWrite = (next) => { pageState = next; return next; };
  builders.FbmSync.prepareCategoryGate = () => {};
  builders.FbmSync.seenStoreBegin = () => {};
  builders.FbmSync.readLocal = () => [];
  const firstPage = trongLat(builders.FbmSync, () => builders.FbmSync.beginCustomerPull(pageState), pageState);
  check(so, 'quét toàn bộ lấy cả danh sách khách bằng một việc quét có số dòng mỗi request theo cấu hình, Extension cắt gói',
    [pageState.cursor.kind, pageState.cursor.count, firstPage.meta.kind, firstPage.body.count, firstPage.meta.job.chunkMaxBytes],
    ['customer_scan', builders.FbmSync.BUDGET.scanCustomerRows, 'scan_job', builders.FbmSync.BUDGET.scanCustomerRows, builders.FbmSync.BUDGET.chunkMaxBytes]);
  // Cursor cửa ghi giữ tối đa một lô mã khách. stt_rec_kh của FBM là 'A' + 9 chữ số.
  const pageRows = builders.FbmSync.BUDGET.activityBatchCustomers;
  const fullPage = Array.from({ length: pageRows }, (_, i) => ({ sttRec: 'A' + String(100000000 + i) }));
  pageState.cursor = { kind: 'activity_grid', layer: 'list', customers: fullPage.map((item) => item.sttRec), batchId: 'b'.repeat(40) };
  const cursorBytes = Buffer.byteLength(JSON.stringify(pageState.cursor));
  check(so, 'cursor một lô cửa ghi đầy vẫn dưới nửa trần DocumentProperty và không chép đôi danh sách mã',
    [cursorBytes < builders.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT / 2, pageState.cursor.customerIds, pageState.cursor.customers.length],
    [true, undefined, pageRows]);
  // Cả state (không chỉ cursor) của một trang đầy cộng lastError dài nhất phải chừa khoảng trống dưới trần một khóa kho: nhánh lỗi ghi thêm lastError mà chạm trần thì lỗi quota che mất lỗi thật.
  const khoState = {};
  const stateHop = taoHopCat({ FbmSync: {}, PropertiesService: taoPropertiesService({ doc: khoState }) });
  napServer(stateHop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/state/PropertyBuffer.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/report/Report.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/read/ActivityLayers.js');
  const macDinh = stateHop.FbmSync.stateDefault();
  const loiDaiNhat = 'Đ'.repeat(240);
  stateHop.FbmSync.stateWrite(Object.assign(macDinh, {
    runId: 'run-dai', phase: 'pull_activity', entity: 'activity', cursor: pageState.cursor, lastError: loiDaiNhat, message: loiDaiNhat, lastFailureCode: 'FBM_DOCUMENT_PROPERTIES_QUOTA',
    session: Object.assign(macDinh.session, { cookie: 'c'.repeat(300), userId: 'u'.repeat(20), accountUsername: 'tai-khoan', accountName: 'Tên tài khoản FBM' }),
    metadata: Object.assign(macDinh.metadata, {
      customerFields: Array.from({ length: 30 }, (_, i) => 'truong_' + i), activityFields: Array.from({ length: 20 }, (_, i) => 'truong_gd_' + i),
      businessSteps: { run: { at: 1, detail: 'b'.repeat(1400) } }, preflightIssues: [{ code: 'FBM_X', severity: 'warn', scope: 'fbm_sync', message: 'Cảnh báo '.repeat(40), blocking: false }],
      customerScan: { total: 1312, seen: 50 },
      // Hai thứ này từng nằm trong state và đẩy nó lên 8,9/9 KB; cửa ghi state phải bỏ chúng.
      preview: { customers: Array.from({ length: 10 }, () => ({ code: 'M'.repeat(32), name: 'Tên khách '.repeat(16), fbmId: 'A100000000' })), activities: [], truncated: true },
      preflight: { ok: true, issues: [{ code: 'FBM_X', message: 'Cảnh báo '.repeat(40) }], hashSummary: { checked: 1312 } }
    })
  }));
  const stateBytes = Buffer.byteLength(khoState[stateHop.FbmSync.STATE_KEY] || '');
  check(so, 'state một trang Customer đầy (cả lô giao dịch của trang) cộng lastError dài nhất dưới 70% trần một khóa kho, không chứa bản xem trước và preflight đầy đủ',
    [stateBytes > 0 && stateBytes < stateHop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT * 0.7 ? 'dưới 70%' : stateBytes + ' byte'], ['dưới 70%']);
  // Mẫu số tiến trình là số khách của lượt (FBM đã lọc theo phạm vi), tử số là số khách đã quét xong; số bản ghi nhận được không chen vào.
  const tienTrinh = { scan: 'full', mode: 'read', metadata: {}, counts: { completed: 0 }, progress: { done: 0, total: builders.FbmSync.customerScanRecord(null, Array.from({ length: 50 }, () => ({})), 50, null).total } };
  builders.FbmSync.progressCustomersDone(tienTrinh, 3);
  tienTrinh.counts.completed = 1312;
  check(so, 'tiến trình lượt 50 khách là x/50 theo khách đã quét xong', tienTrinh.progress, { done: 3, total: 50 });
  // Chuỗi mong đợi lấy từ request chuyển trang do giao diện FBM gửi (bắt 2026-10-08). Dòng thứ hai mang ngày FBM thật trả cho A000080085 (18:00 UTC ngày 27): giao diện ghi 20260928, tức phải tính theo giờ Việt Nam.
  const customerFields = builders.FbmSync.GRID_FIELDS.customer, dongFbm = builders.FbmSync.rowsToRecords('customer', await luoiDaCat(builders.FbmSync, 'customer', customerFields, [
    customerFields.map((field) => ({ stt_rec_kh: 'A000079388', ngay_gd: '/Date(1787101200000)/', datetime0: '/Date(1787156031523)/', xorder: '000000000345' })[field] || ''),
    customerFields.map((field) => ({ stt_rec_kh: 'A000080085', ngay_gd: '/Date(1790532000000)/', datetime0: '/Date(1790298817497)/', xorder: '000000000311' })[field] || '')
  ], 1312));
  check(so, 'mô tả trang đang đứng gửi FBM khớp đúng chuỗi giao diện FBM gửi khi chuyển trang Customer', (({ firstItem, lastItem }) => [firstItem, lastItem])(builders.FbmSync.customerPageOf(dongFbm.rows, false)),
    ['2026081920260819000000000345A000079388', '2026092820260925000000000311A000080085']);
  // Khách chưa có giao dịch FBM trả ngày 01/01/1999 là 915123600000; giao diện FBM gửi lại 915148800000 (cộng 7 giờ, bắt 2026-10-08). Gửi nguyên thì FBM trả trang rỗng ở khách thứ 1.000/1.312.
  const dongChuaGd = builders.FbmSync.rowsToRecords('customer', await luoiDaCat(builders.FbmSync, 'customer', customerFields, [
    customerFields.map((field) => ({ stt_rec_kh: 'A000069569', ngay_gd: '/Date(915123600000)/', datetime0: '/Date(1751273601493)/', xorder: '000000010624' })[field] || '')
  ], 1312)).rows[0];
  check(so, 'khóa trang Customer cộng 7 giờ vào ngày như giao diện FBM gửi, chuỗi mô tả trang vẫn là ngày Việt Nam', [builders.FbmSync.customerPageValue(dongChuaGd), builders.FbmSync.customerPageItem(dongChuaGd)],
    [['/Date(915148800000)/', '/Date(1751298801493)/', '000000010624', 'A000069569'], '1999010120250630000000010624A000069569']);
  // Lượt dừng sớm (phân trang Customer hỏng) mà vẫn xét khách vắng thì mọi khách chưa quét tới bị coi là vắng (gặp thật: 1.262/1.312 khách).
  const marked = [];
  const savedScanEnd = { absent: builders.FbmSync.customerAbsentMark, read: builders.FbmSync.processBookRead, write: builders.FbmSync.processBookWrite };
  builders.FbmSync.customerAbsentMark = () => { marked.push('vắng'); };
  builders.FbmSync.processBookRead = () => builders.FbmSync.processBookShape(null);
  builders.FbmSync.processBookWrite = (book) => { marked.push(book.customerFull.baseline === 1312 ? 'mốc' : 'sổ khác'); };
  const scanOf = (pages, scopeNew) => pages.reduce((scan, grid, i) => builders.FbmSync.customerScanRecord(i === 0 ? null : scan, grid.rows, grid.total, i === 0 ? scopeNew : null), null);
  const finishOf = (scan) => { const st = { runId: 'scan-run', mode: 'read', metadata: {} }, patch = { metadata: {}, logs: [] }; marked.length = 0; let code = ''; try { builders.FbmSync.customerScanFinish(st, scan, patch); } catch (error) { code = error.code; } return [code, marked.slice(), patch.metadata.customerTotal === undefined ? null : patch.metadata.customerTotal, patch]; };
  const scanRun = (pages) => finishOf(scanOf(pages)).slice(0, 3);
  const rowsOf = (n) => Array.from({ length: n }, () => ({}));
  check(so, 'chỉ xét khách vắng khi đã nhận đủ số khách FBM báo ở trang đầu; dừng ở 50/1312 hoặc FBM không báo tổng thì chặng ném FBM_SCAN_INCOMPLETE, chưa đánh dấu vắng, chưa có số khách mốc',
    [scanRun([{ total: 1312, rows: rowsOf(50) }, { total: 0, rows: [] }]), scanRun([{ total: 0, rows: rowsOf(50) }]), scanRun([{ total: 60, rows: rowsOf(50) }, { total: 0, rows: rowsOf(10) }]), scanRun([{ total: 0, rows: [] }])],
    [['FBM_SCAN_INCOMPLETE', [], null], ['FBM_SCAN_INCOMPLETE', [], null], ['', ['vắng'], 60], ['', ['vắng'], 0]]);
  // Mốc số khách chỉ ghi khi lượt đóng xong: lượt hỏng sau bước quét khách mà đã ghi mốc thì lần đếm sau thấy khớp, bỏ quét và khách chưa đọc bị bỏ qua.
  const closeWith = (verdict) => { const st = { runId: 'close-run', mode: 'read', phase: 'pull_activity', metadata: { customerTotal: 1312 }, session: {}, cursor: {} }; marked.length = 0; builders.FbmSync.runClose(st, verdict, { message: 'x' }); return [marked.slice(), 'customerTotal' in st.metadata]; };
  check(so, 'mốc số khách chỉ ghi khi lượt đóng xong; lượt lỗi, hủy hay dừng giữa chừng giữ mốc cũ; đóng xong thì số tạm bị xóa để lần đóng kế không ghi lại',
    [closeWith('done'), closeWith('error'), closeWith('cancelled')], [[['mốc'], false], [[], false], [[], false]]);
  const scopeFinish = finishOf(scanOf([{ total: 2, rows: [{ ma_kh: 'ALT00010' }] }, { total: 0, rows: [{ ma_kh: 'ALT00099' }] }], ['ALT0010', 'alt00099']));
  check(so, 'Mã khách chỉ định chưa có trên Sheet mà danh sách khách FBM không trả về (gộp mọi trang, không phân biệt hoa thường) thành cảnh báo không chặn kèm dòng Log, chặng vẫn xét vắng và kết thúc',
    [(scopeFinish[3].metadata.preflightIssues || []).map((item) => [item.code, item.blocking, /ALT0010\b/.test(item.message), /00099/.test(item.message)]), scopeFinish[3].logs.map((line) => line.action), scopeFinish[1]],
    [[['FBM_SCOPE_CODE_NOT_ON_FBM', false, true, false]], ['scope_code_not_on_fbm'], ['vắng']]);
  builders.FbmSync.customerAbsentMark = savedScanEnd.absent; builders.FbmSync.processBookRead = savedScanEnd.read; builders.FbmSync.processBookWrite = savedScanEnd.write;

  return so;
}

module.exports = { chay };
