/** Đường báo lỗi phía trình duyệt của màn đồng bộ: dòng báo và nút Bỏ, cửa báo lỗi duy nhất, Sidebar không tự hủy lượt, lỗi Extension có và không có chỗ chờ. */
const { taoSidebarDongBo, dongBao } = require('../../lib/sidebar/bo-dong-bo');
const { section, check, ghiLoiNap } = require('../../lib/assert');
const { statusGas, stateDangChay } = require('../../lib/fbm/status-gas');
const { bamNut, choVong } = require('../../lib/sidebar/hanh-trinh');
/** Sidebar chỉ được gọi GAS qua `fbmSyncCommand`; gọi thẳng `callServer` là lỗi. */
const CAM_GOI_THANG = () => Promise.reject(new Error('Sidebar gọi thẳng callServer, phải đi qua fbmSyncCommand'));


async function testDongBaoVaGo(so) {
  // Dòng báo `fbmClient` hiện ở vùng báo đầu màn (dòng đáy ẩn khi màn FBM giữ khung); nút Bỏ gỡ đúng các khóa của màn.
  const { hop, dom } = taoSidebarDongBo();
  const info = dom.document.getElementById('sidebar-info');
  hop.fbmSyncInstall();
  hop.FBM_SYNC_CLIENT.active = true;
  hop.FBM_SYNC_CLIENT.lastStatus = statusGas({ phase: 'idle' });
  hop.fbmSyncRenderShell(hop.FBM_SYNC_CLIENT.lastStatus);
  hop.fbmSyncNotice('error', 'Lỗi do thử');
  const nutBo = () => dom.document.getElementById('fbm-sync-notice-dismiss');
  check(so, 'dòng báo hiện ở vùng báo đầu màn kèm nút Bỏ, vùng báo hết ẩn',
    [dongBao(hop), info.hidden, info.textContent.indexOf('Lỗi do thử') >= 0, !!nutBo()],
    [['fbmClient:Lỗi do thử'], false, true, true]);
  hop.NOTICES.fbmExtension = { line: 'Extension báo', blocks: [{ variant: 'error', title: 'Extension', lines: ['Extension báo'] }] };
  hop.fbmSyncRenderShellWarning(hop.FBM_SYNC_CLIENT.lastStatus);
  bamNut(dom, nutBo());
  await choVong();
  check(so, 'bấm Bỏ gỡ cả dòng báo của màn lẫn dòng báo Extension rồi ẩn vùng báo',
    [dongBao(hop), info.hidden],
    [[], true]);
  hop.fbmSyncNotice('error', 'Lỗi thứ hai');
  hop.fbmSyncNotice('error', '');
  check(so, 'text rỗng thì gỡ dòng báo', [dongBao(hop), info.hidden], [[], true]);
}

async function testDuongBaoLoi(so) {
  // Cửa báo lỗi duy nhất: hiện ở dòng báo và ghi Log, không vẽ status giả; ghi Log hỏng thì lý do hiện thêm cạnh lỗi gốc.
  const { hop } = taoSidebarDongBo();
  const ghi = [], ve = [];
  hop.fbmSyncPaint = (status) => { ve.push(status); };
  hop.callServer = CAM_GOI_THANG; hop.fbmSyncCommand = (name, payload) => { ghi.push([name, payload.message, payload.action]); return Promise.resolve({ ok: true }); };
  await hop.fbmSyncReportError(new Error('EXTENSION_DOWN'), 'Bridge failed', 'bridge');
  await hop.fbmSyncReportError(new Error('EXTENSION_DOWN'), 'Bridge failed', 'bridge');
  check(so, 'báo lỗi hiện ở dòng báo, ghi Log mỗi lần với đúng việc, không vẽ status giả và không dedupe vĩnh viễn',
    [dongBao(hop), ghi, ve.length],
    [['fbmClient:EXTENSION_DOWN'], [['client_error', 'EXTENSION_DOWN', 'bridge'], ['client_error', 'EXTENSION_DOWN', 'bridge']], 0]);

  hop.callServer = CAM_GOI_THANG; hop.fbmSyncCommand = (name) => (name === 'client_error' ? Promise.reject(new Error('GAS không nhận Log')) : Promise.resolve({}));
  const ketLog = await hop.fbmSyncLogClientError(new Error('Lỗi gốc'), '', 'log_down');
  check(so, 'ghi Log lỗi Sidebar hỏng thì kết quả mang mã GAS_LOG_FAILED và lý do',
    [ketLog.code, ketLog.message.indexOf('GAS không nhận Log') >= 0],
    ['GAS_LOG_FAILED', true]);
  await hop.fbmSyncReportError(new Error('Lỗi gốc'), '', 'log_down');
  check(so, 'ghi Log hỏng thì dòng báo mang cả lỗi gốc lẫn lý do ghi Log hỏng',
    [hop.NOTICES.fbmClient.blocks[0].lines[0], hop.NOTICES.fbmClient.blocks[0].lines[1].indexOf('GAS không nhận Log') >= 0],
    ['Lỗi gốc', true]);
}

async function testKhongTuHuy(so) {
  // Lượt thuộc GAS: lỗi phía trình duyệt không làm Sidebar tự gửi lệnh Dừng.
  const { hop } = taoSidebarDongBo();
  const calls = [];
  hop.setTimeout = () => 1; hop.clearTimeout = () => {};
  hop.fbmSyncExtensionRpc = (action) => Promise.resolve(action === 'CRM_FBM_MACHINE_ID' ? { machineId: 'may-A' } : { accepted: true });
  hop.callServer = CAM_GOI_THANG; hop.fbmSyncCommand = (name) => { calls.push(name); return Promise.resolve(name === 'start' ? { ok: true, runId: 'run-9', relayRetryMs: [], status: statusGas(stateDangChay({ runId: 'run-9' })) } : {}); };
  hop.FBM_SYNC_CLIENT.active = true;
  const luot = hop.fbmSyncRun('read');
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  hop.fbmSyncStatusReceived({ failure: { code: 'GAS_CALL_FAILED', message: 'GAS trả 404' } });
  await luot;
  check(so, 'lỗi Extension báo lên khi có chỗ chờ: Sidebar báo lỗi và ghi Log, không gửi lệnh Dừng cho GAS',
    [calls.indexOf('cancel'), calls.indexOf('client_error') >= 0, typeof hop.fbmSyncCancelAfterError, hop.FBM_SYNC_CLIENT.runWaiter], [-1, true, 'undefined', null]);
  check(so, 'lỗi Extension hiện ở dòng báo kèm mã và chữ gốc',
    /GAS_CALL_FAILED.*GAS trả 404/.test(dongBao(hop)[0]),
    true);
}

async function testLoiExtensionKhongCoChoCho(so) {
  // Lỗi Extension khi không có lượt tay đang chờ: dòng báo riêng của Extension và ghi Log; status về sau gỡ dòng báo đó.
  const { hop } = taoSidebarDongBo();
  const log = [];
  hop.callServer = CAM_GOI_THANG; hop.fbmSyncCommand = (name, payload) => { log.push(name === 'status' ? [name] : [name, payload.action]); return Promise.resolve(name === 'status' ? { status: statusGas({ phase: 'idle' }) } : { ok: true }); };
  hop.fbmSyncStatusReceived({ failure: { code: 'FBM_TAB_NOT_FOUND', httpStatus: 0, message: 'Không thấy tab FBM' } });
  await choVong();
  check(so, 'lỗi Extension không có chỗ chờ: hỏi GAS trạng thái lượt ngay một lần (đèn icon ⟳ không chờ đồng hồ im), hiện ở khóa fbmExtension và ghi Log extension_failure',
    [dongBao(hop).map((d) => d.split(':')[0]), log, hop.NOTICES.fbmExtension.blocks[0].title], [['fbmExtension'], [['status'], ['client_error', 'extension_failure']], 'Extension đồng bộ FBM báo lỗi']);
  hop.FBM_SYNC_CLIENT.active = true;
  hop.fbmSyncStatusReceived({ status: statusGas({ phase: 'idle' }) });
  check(so, 'status relay về thì gỡ dòng báo Extension', dongBao(hop), []);
}

async function chay(so) {
  section('FBM sync — Sidebar: dòng báo và đường báo lỗi');
  try { taoSidebarDongBo(); } catch (error) { return ghiLoiNap(so, 'nạp renderer Sidebar Đồng bộ FBM', error); }
  await testDongBaoVaGo(so);
  await testDuongBaoLoi(so);
  await testKhongTuHuy(so);
  await testLoiExtensionKhongCoChoCho(so);
}

module.exports = { chay };
