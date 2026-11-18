/**
 * Ngân sách thời gian của GAS: khoảng nghỉ giữa hai request chụp vào state đầu lượt, hạn envelope theo ngân sách, trần lát tính từ lúc lời gọi bắt đầu, và DocumentProperties đầy trả lỗi rõ cho Sidebar và Log.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { datPhan } = require('../../lib/fbm/cai-dat-thu');
const { datState } = require('../../lib/fbm/dat-state');
const { taoKhoThuocTinh } = require('../../lib/gas/kho-thuoc-tinh');
const { taoSidebarDongBo } = require('../../lib/sidebar/bo-dong-bo');

async function chay(so) {
  section('FBM sync — khoảng nghỉ, hạn request và ngân sách lát GAS');
  const waitFlow = workflowGas({ extraFiles: ['server/gate/IdGate.js'] });
  datPhan(waitFlow.hop, 'run', { scopeLimited: false });
  datPhan(waitFlow.hop, 'run', { requestGapMinSeconds: 1, requestGapMaxSeconds: 3 });
  waitFlow.hop.FbmSync.runSlice(() => waitFlow.hop.FbmSync.start({ mode: 'read' }, waitFlow.hop.FbmSync.stateRead()));
  datPhan(waitFlow.hop, 'run', { requestGapMinSeconds: 5, requestGapMaxSeconds: 9 });
  datState(waitFlow.hop.FbmSync, { phase: 'pull_customer', cursor: { kind: 'customer_grid' }, activeRequestId: '', deadlineAt: 0 });
  const gapGrid = waitFlow.hop.FbmSync.sliceIssue(waitFlow.hop.FbmSync.stateRead(), waitFlow.hop.FbmSync.customerGridRequest({ type: 0, count: 50, gridPageIndex: -1, gridRefresh: false, scope: null }, waitFlow.hop.FbmSync.scriptSettings(waitFlow.hop.FbmSync.stateRead())));
  datState(waitFlow.hop.FbmSync, { activeRequestId: '', deadlineAt: 0 });
  const gapChunk = waitFlow.hop.FbmSync.sliceIssue(waitFlow.hop.FbmSync.stateRead(), { url: 'https://fbo.com.vn:8888/AppService/FastBusiness.ReportExtenderService.asmx/GetGridViewPage', body: '', meta: { kind: 'scan_chunk', job: { jobId: 'j', chunkIndex: 1 } } });
  const gapBudget = waitFlow.hop.FbmSync.BUDGET;
  check(so, 'Lượt chạy tay chụp khoảng cách giữa hai request FBM vào state đầu lượt và gửi kèm mọi envelope; đổi cài đặt giữa lượt chỉ áp lượt sau; hạn Extension cộng khoảng nghỉ dài nhất, trừ gói lấy từ RAM tab',
    [JSON.stringify(waitFlow.hop.FbmSync.stateRead().requestGap), JSON.stringify(gapGrid.meta.requestGap), gapGrid.meta.timeoutMs, gapChunk.meta.timeoutMs],
    ['{"minMs":1000,"maxMs":3000}', '{"minMs":1000,"maxMs":3000}', gapBudget.tabReadyMs + gapBudget.fetchMs + 3000, gapBudget.tabReadyMs + gapBudget.fetchMs]);
  const gapInvalid = waitFlow.hop.settingsSave({ fbm_run: { requestGapMinSeconds: 4, requestGapMaxSeconds: 2 } });
  const gapTooLong = waitFlow.hop.settingsSave({ fbm_run: { requestGapMinSeconds: 0, requestGapMaxSeconds: gapBudget.requestGapMaxSeconds + 1 } });
  check(so, 'Khoảng cách request FBM: tối đa nhỏ hơn tối thiểu hoặc vượt trần bị từ chối',
    [gapInvalid.ok, gapTooLong.ok],
    [false, false]);
  datPhan(waitFlow.hop, 'run', { requestGapMinSeconds: 0, requestGapMaxSeconds: 0 });
  datState(waitFlow.hop.FbmSync, { scan: 'full', requestGap: null, activeRequestId: '', deadlineAt: 0 });
  const gapNone = waitFlow.hop.FbmSync.sliceIssue(waitFlow.hop.FbmSync.stateRead(), waitFlow.hop.FbmSync.customerGridRequest({ type: 0, count: 50, gridPageIndex: -1, gridRefresh: false, scope: null }, waitFlow.hop.FbmSync.scriptSettings(waitFlow.hop.FbmSync.stateRead())));
  check(so, 'Mặc định 0 giây: envelope không mang khoảng nghỉ', gapNone.meta.requestGap, undefined);
  datState(waitFlow.hop.FbmSync, { activeRequestId: '', deadlineAt: 0 });
  const truocCap = Date.now();
  const loEnvelope = waitFlow.hop.FbmSync.sliceIssue(waitFlow.hop.FbmSync.stateRead(), { items: ['STT1', 'STT2'].map((stt) => waitFlow.hop.FbmSync.activityGridRequest(stt, { type: 0, count: 100, gridPageIndex: -1, gridRefresh: false }, waitFlow.hop.FbmSync.scriptSettings(waitFlow.hop.FbmSync.stateRead()))), meta: { kind: 'batch', entity: 'activity' } });
  const loState = waitFlow.hop.FbmSync.stateRead(), B = waitFlow.hop.FbmSync.BUDGET;
  check(so, 'GAS cấp envelope lô: hai phần tử, hạn Extension theo ngân sách, maxBytes, hạn Sidebar chờ GAS, deadlineAt thu hồi cộng đường về và đường lên', [
    loEnvelope.items.length, loEnvelope.url, loEnvelope.meta.kind, loEnvelope.meta.timeoutMs, loEnvelope.meta.batch.maxBytes, loEnvelope.meta.gasReplyMs, loState.activeRequestId === loEnvelope.id,
    loState.deadlineAt >= truocCap + loEnvelope.meta.timeoutMs + B.bridgeMs + B.gasTransitMs && loState.deadlineAt <= Date.now() + loEnvelope.meta.timeoutMs + B.bridgeMs + B.gasTransitMs
  ], [2, undefined, 'batch', B.tabReadyMs + 2 * B.fetchMs, B.batchMaxBytes, B.gasHardMs + B.gasTransitMs, true, true]);

  const deadlineLogs = [];
  const deadlineFlow = workflowGas({ logEvent: (event) => deadlineLogs.push(event), LOG_ERROR: 'error' });
  datState(deadlineFlow.hop.FbmSync, { runId: 'runtime-limit', phase: 'pull_customer', cursor: { kind: 'customer_grid', pageIndex: 4, pageValue: ['2026-09-20', 'CUS-000004'] }, activeRequestId: '', deadlineAt: Date.now() - 1 });
  // FBM-031: hạn của request vừa nhận đã qua nhưng lời gọi GAS mới bắt đầu thì vẫn cấp request kế; trần tính từ lúc lời gọi bắt đầu.
  deadlineFlow.hop.FbmSync.budgetCallBegin(Date.now());
  const notBlockedByRequestDeadline = deadlineFlow.hop.FbmSync.sliceIssue(deadlineFlow.hop.FbmSync.stateRead(), deadlineFlow.hop.FbmSync.customerGridRequest({ type: 1, scope: null, count: 3, gridPageIndex: 5, gridRefresh: false, sourceFields: deadlineFlow.hop.FbmSync.GRID_FIELDS.customer }, deadlineFlow.hop.FbmSync.scriptSettings(deadlineFlow.hop.FbmSync.stateRead())));
  check(so, 'trần thời gian GAS tính từ lúc lời gọi bắt đầu, không từ hạn request vừa nhận',
    [!!notBlockedByRequestDeadline, deadlineFlow.hop.FbmSync.stateRead().lastFailureCode],
    [true, '']);
  datState(deadlineFlow.hop.FbmSync, { phase: 'pull_customer', cursor: { kind: 'customer_grid', pageIndex: 4, pageValue: ['2026-09-20', 'CUS-000004'] }, activeRequestId: '', deadlineAt: 0 });
  deadlineFlow.hop.FbmSync.budgetCallBegin(Date.now() - deadlineFlow.hop.FbmSync.BUDGET.gasSoftMs - 1);
  const blockedByDeadline = deadlineFlow.hop.FbmSync.sliceIssue(deadlineFlow.hop.FbmSync.stateRead(), deadlineFlow.hop.FbmSync.customerGridRequest({ type: 1, scope: null, count: 3, gridPageIndex: 5, gridRefresh: false, sourceFields: deadlineFlow.hop.FbmSync.GRID_FIELDS.customer }, deadlineFlow.hop.FbmSync.scriptSettings(deadlineFlow.hop.FbmSync.stateRead())));
  const deadlineState = deadlineFlow.hop.FbmSync.stateRead();
  const deadlineStatus = deadlineFlow.hop.FbmSync.statusView();
  const deadlineLog = deadlineLogs.filter((line) => line.action === 'slice_limit').pop() || {};
  const deadlineUi = taoSidebarDongBo();
  deadlineUi.hop.fbmSyncPaint(deadlineStatus);
  check(so, 'lát GAS chạm trần dừng trước request kế tiếp, DTO Sidebar và Log giữ runId/phase/cursor', [
    blockedByDeadline, deadlineState.phase, deadlineState.lastFailureCode, deadlineState.cursor.pageIndex, deadlineState.activeRequestId,
    deadlineLog.action, deadlineLog.detail && deadlineLog.detail.runId, deadlineLog.detail && deadlineLog.detail.phase, deadlineLog.detail && deadlineLog.detail.cursor && deadlineLog.detail.cursor.kind,
    deadlineUi.content.textContent.indexOf('Tạm dừng') >= 0
  ], [null, 'paused', 'GAS_RUNTIME_LIMIT', 4, '', 'slice_limit', 'runtime-limit', 'pull_customer', 'customer_grid', true]);

  const quotaData = {}, quotaLogs = [];
  let quotaFull = false;
  const quotaBase = taoKhoThuocTinh(quotaData), quotaThrow = () => { if (quotaFull) { throw new Error('DocumentProperties quota exceeded'); } };
  const quotaProperties = Object.assign({}, quotaBase, {
    setProperty(key, value) { quotaThrow(); return quotaBase.setProperty(key, value); },
    setProperties(values, deleteAllOthers) { quotaThrow(); return quotaBase.setProperties(values, deleteAllOthers); }
  });
  const quotaFlow = workflowGas({ documentProperties: quotaProperties, logEvent: (event) => quotaLogs.push(event), LOG_ERROR: 'error' });
  datState(quotaFlow.hop.FbmSync, { runId: 'quota-run', phase: 'pull_customer', cursor: { kind: 'customer_grid', pageIndex: 7, pageValue: ['2026-09-20', 'CUS-000007'] }, metadata: {} });
  quotaFull = true;
  const quotaResult = quotaFlow.hop.FbmSync.controlDispatch('cancel', {});
  const quotaLog = quotaLogs.filter((item) => item.reason === 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED').slice(-1)[0] || quotaLogs.filter((item) => item.reason === 'FBM_DOCUMENT_PROPERTIES_QUOTA').slice(-1)[0] || {};
  const quotaUi = taoSidebarDongBo();
  quotaUi.hop.fbmSyncPaint(quotaResult.status);
  check(so, 'DocumentProperties đầy trả DTO lỗi Sidebar, giữ cursor và Log runId/phase/cursor', [
    quotaResult.ok, quotaResult.code, quotaResult.status && quotaResult.status.runId, quotaResult.status && quotaResult.status.phase,
    quotaFlow.hop.FbmSync.stateRead().cursor.kind, quotaLog.detail && quotaLog.detail.runId,
    quotaLog.detail && quotaLog.detail.phase, quotaLog.detail && quotaLog.detail.cursor && quotaLog.detail.cursor.kind,
    quotaUi.content.textContent.indexOf('DocumentProperties') >= 0 || quotaUi.content.textContent.indexOf('lưu trạng thái') >= 0
  ], [false, 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED', 'quota-run', 'error', 'customer_grid', 'quota-run', 'pull_customer', 'customer_grid', true]);
}

module.exports = { chay };
