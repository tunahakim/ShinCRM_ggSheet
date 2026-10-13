/** Lấy toàn bộ giao dịch (lớp 1): việc quét chỉ giữ id đã có trên Sheet, quá lớn thì chia cửa sổ ngày trong lượt, ứng viên "không thấy" của chế độ cửa sổ được đọc lại theo id trước khi gắn cờ. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { section, check } = require('../../lib/assert');
const { scanHarness } = require('./ScanJob');

const EXECUTOR = path.join(__dirname, '..', '..', '..', '2_ShinCRM_Extension', 'content_scripts', 'fbm_sync', 'executor.js');
const gd = (i, endDate, extra) => Object.assign({ id: 'A-FBM-C' + i, details: 'Gọi FBM-C' + i, end_date: endDate, owner: 'Owner', datetime0: endDate + 'T03:00:00', line_nbr: 1 }, extra || {});

/**
 * Lượt đầu "Quét toàn bộ" để Sheet có đủ khách và giao dịch, rồi đổi FBM bằng `doi` và chạy lượt "Quét kỹ".
 * FBM giả là một danh sách dùng chung cho đọc theo khách, lấy toàn bộ và đọc lại theo id; `fbm.moi` (nếu có) thay danh sách theo số lần lấy toàn bộ.
 */
async function luotKy(ngay, doi, options, hooks) {
  const fbm = { list: ngay.map((date, k) => gd(k + 1, date)), moi: null, lan: 0 };
  const xem = () => (fbm.moi ? fbm.moi(fbm.lan) : fbm.list);
  const opt = Object.assign({ customers: ngay.length, budget: { activityTopScanQuietStreak: 1 } }, options || {}, {
    fbmActivities: () => { const list = xem(); return list; },
    activityFor: (key) => xem().filter((item) => item.id === 'A-' + key)
  });
  const h = scanHarness(opt);
  await h.run({ pack: 'all' });
  if (doi) { doi(fbm); }
  ['activityCustomers', 'kinds', 'jobs', 'errors', 'rechecks', 'bulkFilters'].forEach((key) => { h.trace[key].length = 0; });
  h.logs.length = 0;
  const end = await h.run(Object.assign({ pack: 'deep', beforeSend: (request) => { if (request.meta.kind === 'scan_job' && request.meta.entity === 'activity') { fbm.lan += 1; } } }, hooks || {}));
  const act = (i) => h.local.activity.find((item) => item.fbmId === 'A-FBM-C' + i) || {};
  const jobs = h.trace.jobs.filter((job) => /:activity:/.test(job.jobId));
  return { h, end, fbm, act, jobs, state: h.F.stateRead(), log: (action) => h.logs.filter((event) => event.action === action) };
}

/** Executor thật với một `fetch` tùy ý, để kiểm đường đọc dần có trần cỡ. */
function executorWith(fetchImpl) {
  let listener = null;
  const context = {
    console: { log() {}, warn() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout, Blob, Response, TextDecoder, TextEncoder, DecompressionStream: undefined, Uint8Array,
    document: { documentElement: { innerHTML: '<script>var payload={"cookie":"safeFHN_CRM_App"};</script>', textContent: '' } },
    fetch: fetchImpl,
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; }, removeListener() {} } } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(EXECUTOR, 'utf8'), context, { filename: EXECUTOR });
  return (request) => new Promise((resolve) => listener({ type: 'FBM_EXECUTE_V2', request }, null, resolve));
}
const scanReq = (job) => ({ id: 'R-1', url: 'https://fbm.test/AppService/Grid', body: { controller: 'zccrAccountTask' }, meta: { kind: 'scan_job', fetchMs: 5000, job: Object.assign({ jobId: 'J-1', fields: ['id', 'details'], idField: 'id', keepIds: null, chunkTargetBytes: 4096, chunkMaxBytes: 8192, maxResponseBytes: 10000 }, job) } });

async function chay(so) {
  section('FBM sync — lấy toàn bộ giao dịch bằng việc quét giữ id, chia cửa sổ ngày');

  // Một lần lấy: FBM có thêm giao dịch lạ, một giao dịch sửa nội dung, một giao dịch đã xóa.
  const mot = await luotKy(['2026-09-20', '2026-09-20', '2026-09-20', '2026-09-20', '2026-09-20', '2026-09-20'], (fbm) => {
    fbm.list = fbm.list.filter((item) => item.id !== 'A-FBM-C5').map((item) => (item.id === 'A-FBM-C6' ? Object.assign({}, item, { details: 'Đã sửa trên FBM' }) : item));
    fbm.list.push(Object.assign(gd(99, '2026-09-21'), { id: 'A-LA' }));
  });
  check(so, 'Lấy toàn bộ giao dịch giữ đúng id có trên Sheet: FBM trả 6 dòng (có 1 giao dịch lạ) thì chỉ 5 về GAS, giao dịch lạ không vào Sheet; sửa trên FBM được đối soát; giao dịch đã xóa bị gắn cờ "không thấy" sau khi nhận đủ', [
    mot.state.phase, mot.jobs.map((job) => [job.rowCount, job.keptCount]), mot.act(6).content, mot.act(5).syncStatus, mot.h.local.activity.some((item) => item.fbmId === 'A-LA'), mot.h.trace.activityCustomers.indexOf('FBM-C6') < 0 && mot.h.trace.activityCustomers.indexOf('FBM-C5') < 0, mot.log('activity_bulk_done').length
  ], ['done', [[6, 5]], 'Đã sửa trên FBM', mot.h.F.SYNC_STATUS.missing, false, true, 1]);

  // Ghi Sheet lỗi ở gói thứ hai: lượt dừng trước khi nhận đủ nên không giao dịch nào bị gắn cờ.
  let hongGhi = false;
  const ghiLoi = await luotKy(['2026-09-20', '2026-09-20', '2026-09-20', '2026-09-20'], (fbm) => {
    hongGhi = true;
    fbm.list = fbm.list.filter((item) => item.id !== 'A-FBM-C1').map((item) => Object.assign({}, item, { details: item.details + ' ' + 'x'.repeat(3000) }));
  }, { budget: { activityTopScanQuietStreak: 1, chunkTargetBytes: 6000 }, failWrite: (request) => hongGhi && request.entity === 'activity' && (request.records || []).some((record) => /Gọi FBM-C4/.test(JSON.stringify(record))) }, { afterError: () => null });
  check(so, 'Ghi Sheet lỗi giữa việc quét giao dịch: chưa nhận đủ gói thì giao dịch vắng không bị gắn cờ "không thấy"', [
    ghiLoi.jobs.length && ghiLoi.jobs[0].chunkCount > 1, ghiLoi.h.trace.errors.length > 0, ghiLoi.act(1).syncStatus === ghiLoi.h.F.SYNC_STATUS.missing
  ], [true, true, false]);

  // Quá trần cỡ response: chia cửa sổ 90 ngày trong lượt; hai cửa sổ liền nhau không nhận trùng giao dịch ngày biên.
  const ngayCuaSo = ['2026-03-01', '2026-05-29', '2026-05-30', '2026-08-01', '2026-09-20', '2026-09-25'];
  const dai = (fbm) => { fbm.list = fbm.list.map((item) => Object.assign({}, item, { details: item.details + ' ' + 'x'.repeat(2000) })); };
  const cuaSo = await luotKy(ngayCuaSo, dai, { budget: { activityTopScanQuietStreak: 1, scanMaxResponseBytes: 9000 } });
  const loc = cuaSo.h.trace.bulkFilters.slice(1);
  check(so, 'Lấy cả khoảng quá 64 MB (trần thu nhỏ trong test): Extension báo FBM_SCAN_TOO_LARGE, GAS chia cửa sổ ngay trong lượt và vẫn chốt lượt', [
    cuaSo.state.phase, cuaSo.h.trace.errors[0], cuaSo.log('activity_bulk_window').length, cuaSo.h.trace.bulkFilters[0], loc.length >= 3
  ], ['done', 'FBM_SCAN_TOO_LARGE', 1, '', true]);
  check(so, 'Hai cửa sổ liền nhau không chồng ngày biên: cửa sổ đầu đến 29/05, cửa sổ sau từ 30/05; tổng dòng giữ lại qua các cửa sổ đúng 6, không giao dịch nào bị gắn cờ', [
    loc[0], loc[1].indexOf('end_date:>=30/05/2026'), cuaSo.jobs.reduce((sum, job) => sum + job.keptCount, 0), cuaSo.h.local.activity.filter((item) => item.syncStatus === cuaSo.h.F.SYNC_STATUS.missing).length, cuaSo.h.trace.rechecks.length
  ], ['end_date:<=29/05/2026', 0, 6, 0, 0]);

  // Chế độ cửa sổ: giao dịch đổi ngày giữa hai cửa sổ lọt cả hai, nên được đọc lại theo id; giao dịch đã xóa thật mới bị gắn cờ, FBM lỗi khi đọc lại thì không kết luận.
  const doiNgay = await luotKy(ngayCuaSo, (fbm) => {
    dai(fbm);
    const goc = fbm.list.filter((item) => item.id !== 'A-FBM-C5');
    fbm.moi = (lan) => goc.map((item) => (item.id === 'A-FBM-C2' ? Object.assign({}, item, { end_date: lan <= 2 ? '2026-06-10' : '2026-05-20' }) : item));
  }, { budget: { activityTopScanQuietStreak: 1, scanMaxResponseBytes: 9000 } });
  check(so, 'Chế độ cửa sổ: giao dịch đổi ngày giữa hai cửa sổ không bị gắn cờ vì được đọc lại theo id; giao dịch đã xóa sau khi đọc lại mới bị gắn cờ', [
    doiNgay.state.phase, doiNgay.h.trace.rechecks.slice().sort(), doiNgay.act(2).syncStatus === doiNgay.h.F.SYNC_STATUS.missing, doiNgay.act(5).syncStatus
  ], ['done', ['A-FBM-C2', 'A-FBM-C5'], false, doiNgay.h.F.SYNC_STATUS.missing]);

  const docLaiLoi = await luotKy(ngayCuaSo, (fbm) => { dai(fbm); fbm.list = fbm.list.filter((item) => item.id !== 'A-FBM-C5'); }, { budget: { activityTopScanQuietStreak: 1, scanMaxResponseBytes: 9000 }, recheckFail: (id) => id === 'A-FBM-C5' });
  check(so, 'FBM lỗi khi đọc lại một ứng viên: không gắn cờ "không thấy", lỗi lên Sidebar (danh sách lỗi) và Sheet Log', [
    docLaiLoi.state.phase, docLaiLoi.act(5).syncStatus === docLaiLoi.h.F.SYNC_STATUS.missing, (docLaiLoi.state.metadata.customerErrors || { total: 0 }).total, docLaiLoi.log('activity_customer_failed').length
  ], ['done', false, 1, 1]);

  // Hết hạn fetch khi lấy cả khoảng cũng chia cửa sổ; lỗi mạng chung không đổi cách lấy.
  const hetHan = await luotKy(ngayCuaSo, null, {}, { fail: (request) => (request.meta.kind === 'scan_job' && request.meta.entity === 'activity' && !(request.body.filter || []).some((item) => /<=|>=\d{2}\/\d{2}\/\d{4}/.test(item)) ? 'FBM_FETCH_TIMEOUT' : '') });
  const mang = await luotKy(ngayCuaSo, null, {}, { fail: (request) => (request.meta.kind === 'scan_job' && request.meta.entity === 'activity' ? 'FBM_TRANSPORT_UNAVAILABLE' : '') });
  check(so, 'Hết hạn fetch khi lấy cả khoảng: chia cửa sổ và chốt lượt; lỗi mạng chung: dừng lỗi như request thường, không chia cửa sổ, không gắn cờ', [
    hetHan.state.phase, hetHan.log('activity_bulk_window').length, mang.state.phase, mang.state.lastFailureCode, mang.log('activity_bulk_window').length, mang.h.local.activity.filter((item) => item.syncStatus === mang.h.F.SYNC_STATUS.missing).length
  ], ['done', 1, 'error', 'FBM_TRANSPORT_UNAVAILABLE', 0, 0]);

  // FBM trả ít dòng hơn tổng nó báo: lấy cả khoảng thì chia cửa sổ; một cửa sổ vẫn thiếu thì dừng lỗi, không gắn cờ.
  const thieu = await luotKy(ngayCuaSo, (fbm) => { fbm.list = fbm.list.filter((item) => item.id !== 'A-FBM-C5'); }, { fbmRowCap: 1 });
  check(so, 'FBM trả thiếu dòng: chuyển sang cửa sổ, cửa sổ vẫn thiếu thì dừng lỗi FBM_SCAN_INCOMPLETE báo Sidebar và Log, không giao dịch nào bị gắn cờ', [
    thieu.state.phase, thieu.state.lastFailureCode, thieu.log('activity_bulk_window').length, thieu.log('activity_bulk_failed').length, thieu.act(5).syncStatus === thieu.h.F.SYNC_STATUS.missing, String(thieu.state.lastError || '').length > 0
  ], ['error', 'FBM_SCAN_INCOMPLETE', 1, 1, false, true]);

  // Lượt nền chỉ lấy toàn bộ giao dịch: sau khi chốt "không thấy" thì sang tìm khách có giao dịch mới hơn mốc trên Sheet.
  const nen = await luotKy(['2026-09-20', '2026-09-20'], (fbm) => { fbm.list = fbm.list.filter((item) => item.id !== 'A-FBM-C2'); }, {}, { startOptions: { scan: 'activity_bulk' }, afterError: () => null });
  const sauBulk = nen.h.trace.kinds.slice(nen.h.trace.kinds.indexOf('scan_job:activity') + 1);
  check(so, 'Lượt nền lấy toàn bộ giao dịch: không đọc danh sách khách, chốt "không thấy" rồi mới sang request tìm khách có giao dịch mới', [
    nen.h.trace.kinds.filter((kind) => kind === 'scan_job').length, nen.log('activity_bulk_done').length, nen.act(2).syncStatus, sauBulk[0]
  ], [0, 1, nen.h.F.SYNC_STATUS.missing, 'activity_catchup_customer_grid']);

  // Sheet chưa có giao dịch FBM nào: Quét kỹ không gọi FBM lấy toàn bộ giao dịch.
  const trong = scanHarness({ customers: 2, activityFor: () => [] });
  await trong.run({ pack: 'deep' });
  check(so, 'Sheet chưa có giao dịch FBM nào: Quét kỹ không mở việc quét giao dịch, vẫn chốt lượt', [trong.F.stateRead().phase, trong.trace.kinds.filter((kind) => kind === 'scan_job:activity').length], ['done', 0]);

  // Extension: trần cỡ response đọc dần và dừng sớm; response không phải bảng mà lớn hơn một gói không về GAS.
  let docLan = 0;
  const lon = executorWith(() => Promise.resolve({ ok: true, status: 200, headers: { get: () => 'application/json' }, body: { getReader: () => ({ read: () => { docLan += 1; return Promise.resolve(docLan > 100 ? { done: true } : { done: false, value: new Uint8Array(4000) }); }, cancel() {} }) } }));
  const lonReply = await lon(scanReq({}));
  check(so, 'Executor đọc dần response việc quét: vượt trần cỡ thì dừng đọc ngay, báo FBM_SCAN_TOO_LARGE, không gửi thân response', [lonReply.code, docLan, lonReply.result === undefined], ['FBM_SCAN_TOO_LARGE', 3, true]);
  const raw = (body) => () => Promise.resolve({ ok: true, status: 200, headers: { get: () => 'text/html' }, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer) });
  const rac = await executorWith(raw('<html>' + 'x'.repeat(9000) + '</html>'))(scanReq({ maxResponseBytes: 0 }));
  const nho = await executorWith(raw('<html>đăng nhập</html>'))(scanReq({}));
  check(so, 'Executor: response việc quét không phải bảng mà lớn hơn một gói báo FBM_SCAN_UNPARSEABLE; trang nhỏ (đăng nhập, Bugs) vẫn về nguyên để GAS phân loại phiên', [rac.code, rac.result === undefined, nho.result && nho.result.body], ['FBM_SCAN_UNPARSEABLE', true, '<html>đăng nhập</html>']);
}

module.exports = { chay };
