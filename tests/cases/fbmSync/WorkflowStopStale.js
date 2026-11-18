/**
 * Các đường cắt lượt: Dừng hoặc tắt khi request đang bay, response về muộn bị loại và ghi Log, HTML lỗi fail-closed, lỗi cầu nối tay, DTO Sidebar không lộ bí mật, lượt kẹt chỉ được thu hồi ở cửa mở lượt.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas, noiLat } = require('../../lib/fbm/hop-dong-bo');
const { datCongTac } = require('../../lib/fbm/cai-dat-thu');
const { datState } = require('../../lib/fbm/dat-state');
const { TRANG_FBM_THU } = require('../../lib/load-gas');
const { USER_BODY } = require('../../lib/fbm/tu-dang-nhap');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

async function chay(so) {
  section('FBM sync — Dừng, tắt, response cũ và lượt kẹt');
  const htmlFailureFlow = workflowGas();
  const htmlLogs = [];
  htmlFailureFlow.hop.LOG_OK = 'ok'; htmlFailureFlow.hop.LOG_ERROR = 'error'; htmlFailureFlow.hop.LOG_CONFLICT = 'conflict';
  htmlFailureFlow.hop.logEvent = (event) => htmlLogs.push(event);
  htmlFailureFlow.hop.logTrace = () => {};
  const htmlStarted = htmlFailureFlow.hop.FbmSync.runSlice(() => htmlFailureFlow.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true }, htmlFailureFlow.hop.FbmSync.stateRead()));
  let htmlResult = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const requestId = htmlFailureFlow.hop.FbmSync.stateRead().activeRequestId;
    htmlResult = noiLat(htmlFailureFlow.hop.FbmSync, { ok: true, status: 200, body: '<html><h1>500 Internal Server Error</h1></html>', transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId }] } });
    if (!htmlResult.request) { break; }
  }
  const htmlState = htmlFailureFlow.hop.FbmSync.stateRead();
  check(so, 'HTML lỗi qua continuation bị fail-closed, giữ cursor, đóng các bước mở và ghi Log lỗi',
    [htmlStarted.request.meta.kind, htmlResult.ok, htmlResult.request || null, htmlState.phase, htmlState.lastFailureCode, htmlState.cursor.kind, htmlLogs.map((event) => event.action + '|' + event.outcome)],
    ['identity_user_grid', false, null, 'error', 'PARSE_ERROR', 'identity_user_grid', ['session_finished|error', 'sync_session_finished|error']]);
  const stopAfterResponse = workflowGas();
  stopAfterResponse.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
  datState(stopAfterResponse.hop.FbmSync, { session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const stopStarted = stopAfterResponse.hop.FbmSync.runSlice(() => stopAfterResponse.hop.FbmSync.start({ mode: 'read', origin: 'manual', manual: true }, stopAfterResponse.hop.FbmSync.stateRead()));
  const stopNow = stopAfterResponse.hop.FbmSync.runStopCommand('any');
  const stopState = stopAfterResponse.hop.FbmSync.stateRead();
  const stopped = stopAfterResponse.hop.FbmSync.runSlice(() => stopAfterResponse.hop.FbmSync.continue({
    ok: true, status: 200, body: USER_BODY,
    transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ stage: 'executor_response_sent', requestId: stopStarted.request.id }] }
  }));
  check(so, 'Dừng khi request đọc đang bay: đóng lượt ngay, response về sau (kể cả lô bị Extension cắt dở) bị loại, không cấp request, không ghi gì vào state', [
    stopNow.code || '', stopAfterResponse.hop.FbmSync.statusView().phase, stopState.runId === stopStarted.status.runId, JSON.stringify(stopState.cursor), stopped.ok, stopped.code, stopped.request || null, JSON.stringify(stopAfterResponse.hop.FbmSync.stateRead()) === JSON.stringify(stopState)
  ], ['SYNC_STOPPED', 'paused', true, '{}', false, 'STALE_RESPONSE', null, true]);

  const masterOff = workflowGas();
  masterOff.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
  datState(masterOff.hop.FbmSync, { session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const masterStarted = masterOff.hop.FbmSync.runSlice(() => masterOff.hop.FbmSync.start({ mode: 'read', origin: 'manual', manual: true }, masterOff.hop.FbmSync.stateRead()));
  datCongTac(masterOff.hop, false);
  const masterStopped = masterOff.hop.FbmSync.runSlice(() => masterOff.hop.FbmSync.continue({
    ok: true, status: 200, body: USER_BODY,
    transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ stage: 'executor_response_sent', requestId: masterStarted.request.id }] }
  }));
  check(so, 'tắt khi request đang bay: đóng lượt',
    [masterStopped.request || null, masterStopped.status.phase, masterOff.hop.FbmSync.runInProgress(masterOff.hop.FbmSync.stateRead())],
    [null, 'paused', false]);

  const dto = workflowGas();
  const privateState = dto.hop.FbmSync.stateRead();
  privateState.session.cookie = 'private-cookie-FHN_CRM_App';
  privateState.session.customerAuthorized = 'private-authorized';
  privateState.metadata.lookups = { hidden: 'private-lookup' };
  dto.hop.FbmSync.stateWrite(privateState);
  const publicStatus = dto.hop.FbmSync.statusView();
  check(so, 'DTO Sidebar: khong lo cookie, Authorized, lookup noi bo qua bien gioi UI', [
    JSON.stringify(publicStatus).indexOf('private-cookie') < 0,
    JSON.stringify(publicStatus).indexOf('private-authorized') < 0,
    JSON.stringify(publicStatus).indexOf('private-lookup') < 0
  ], [true, true, true]);

  const disabled = workflowGas();
  datCongTac(disabled.hop, false);
  const blocked = disabled.hop.FbmSync.runSlice(() => disabled.hop.FbmSync.start({ mode: 'read' }, disabled.hop.FbmSync.stateRead()));
  check(so, 'cong tac tong tat: GAS khong cap envelope FBM moi',
    [blocked.ok, blocked.code, blocked.request || null],
    [false, 'SYNC_DISABLED', null]);

  const stale = workflowGas();
  const staleStarted = stale.hop.FbmSync.runSlice(() => stale.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true }, stale.hop.FbmSync.stateRead()));
  const staleLogs = [];
  stale.hop.logEvent = (event) => staleLogs.push(event);
  const staleResult = stale.hop.FbmSync.runSlice(() => stale.hop.FbmSync.continue({ ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: 'old-request' }] } }));
  check(so, 'response cu khong duoc phep mo bat ky buoc pipeline nao', [
    staleResult.ok, staleResult.code, stale.hop.FbmSync.stateRead().activeRequestId === staleStarted.request.id
  ], [false, 'STALE_RESPONSE', true]);
  const staleLog = staleLogs.find((event) => event.action === 'stale_response') || {};
  check(so, 'Response bị bỏ vì không thuộc request đang chờ: có dòng Log lỗi ghi mã request đang chờ và mã response, không ghi nội dung response', [
    staleLog.outcome, staleLog.detail && staleLog.detail.responseRequestId, staleLog.detail && staleLog.detail.activeRequestId === staleStarted.request.id, JSON.stringify(staleLog).indexOf('ANHLT') < 0
  ], ['error', 'old-request', true, true]);

  const manualTransport = workflowGas();
  const manualStarted = manualTransport.hop.FbmSync.runSlice(() => manualTransport.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true }, manualTransport.hop.FbmSync.stateRead()));
  const transportFailure = manualTransport.hop.FbmSync.runSlice(() => manualTransport.hop.FbmSync.transportFailureRun({ requestId: manualStarted.request.id, code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' }));
  check(so, 'loi bridge thu cong: GAS chi ghi nhan loi dung reservation, ket thuc ro rang va khong cap request moi', [
    transportFailure.ok, transportFailure.code, transportFailure.request || null, transportFailure.status.phase,
    transportFailure.status.lastError, manualTransport.hop.FbmSync.stateRead().activeRequestId
  ], [false, 'FBM_TAB_NOT_FOUND', null, 'error', 'Không tìm thấy tab FBM đang mở.', '']);

  const cancelling = workflowGas();
  const cancellingStarted = cancelling.hop.FbmSync.runSlice(() => cancelling.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true }, cancelling.hop.FbmSync.stateRead()));
  const cancelNow = cancelling.hop.FbmSync.runStopCommand('any');
  const cancelState = cancelling.hop.FbmSync.stateRead();
  check(so, 'Dừng khi request dò danh tính đang bay: xóa reservation và cursor ngay, nhớ mã request vừa đóng', [
    cancelling.hop.FbmSync.statusView().phase, cancelState.activeRequestId, JSON.stringify(cancelState.cursor), cancelState.closedRequestId === cancellingStarted.request.id
  ], ['paused', '', '{}', true]);

  const reloaded = workflowGas();
  const orphan = reloaded.hop.FbmSync.stateRead();
  orphan.runId = 'cancelled-orphan'; orphan.phase = 'checking_session'; orphan.cursor = { kind: 'identity_user_grid' };
  orphan.activeRequestId = 'orphan-request';
  orphan.updatedAt = Date.now() - reloaded.hop.FbmSync.STALE_RUN_MS - 1;
  orphan.lastProgressAt = orphan.updatedAt;
  reloaded.hop.FbmSync.stateWrite(orphan);
  reloaded.documentProperties.setProperty(reloaded.hop.FbmSync.STATE_KEY, JSON.stringify(orphan));
  const reloadedStatus = reloaded.hop.fbmCommand('status');
  // Đọc trạng thái chỉ đọc: lượt kẹt quá hạn chỉ được đóng ở cửa mở lượt, không đóng khi Sidebar mở lại.
  check(so, 'reload sau khi callback dừng bị mất: đọc trạng thái không ghi, phiên treo vẫn nguyên chờ cửa mở lượt thu hồi', [
    reloadedStatus.ok, reloadedStatus.status.phase, reloadedStatus.status.runId, reloaded.hop.FbmSync.stateRead().phase, reloaded.hop.FbmSync.stateRead().activeRequestId
  ], [true, 'checking_session', 'cancelled-orphan', 'checking_session', 'orphan-request']);
}

module.exports = { chay };
