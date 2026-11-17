/** Kiểm cổng phiên đóng lỗi an toàn: tự đăng nhập tắt, request ghi không tự gửi lại, không tìm thấy tab FBM, lỗi nội bộ và chính sách tự đăng nhập. */
const { section, check } = require('../../lib/assert');
const { datPhan, docPhan } = require('../../lib/fbm/cai-dat-thu');
const { noiNen, dungHopGiuPhien, batLogCong } = require('../../lib/fbm/tu-dang-nhap');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const { datState } = require('../../lib/fbm/dat-state');

async function chay(so) {
  section('FBM sync - auto-login: cổng phiên fail-closed');
  const { hop: heartbeat } = dungHopGiuPhien();
  const gateLogs = batLogCong(heartbeat);
  let gateFlushes = 0;
  heartbeat.flushLog = () => { gateFlushes += 1; };
  datState(heartbeat.FbmSync, { runId: '', phase: 'checking_session', mode: 'read', cursor: { kind: 'authorize_customer' }, activeRequestId: '', deadlineAt: 0, session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const validRead = heartbeat.FbmSync.sliceIssue(heartbeat.FbmSync.stateRead(), { url: 'https://fbm.test/read', body: { read: true }, meta: { kind: 'grid' } });
  datState(heartbeat.FbmSync, { activeRequestId: '', phase: 'push', mode: 'push', cursor: { kind: 'push_wait', operation: 'customer_edit_save' }, session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const validWrite = heartbeat.FbmSync.sliceIssue(heartbeat.FbmSync.stateRead(), { url: 'https://fbm.test/write', body: { write: true }, meta: { kind: 'customer_edit_save' } });
  check(so, 'session hop le khong doi hanh vi ca doc va ghi',
    [validRead.meta.kind, validWrite.meta.kind, validRead.meta.openFbmContext, validWrite.meta.openFbmContext, gateLogs.length],
    ['grid', 'customer_edit_save', undefined, undefined, 0]);

  datPhan(heartbeat, 'loginPolicy', { enabled: false, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });
  datState(heartbeat.FbmSync, { runId: 'closed-gate', phase: 'checking_session', mode: 'read', cursor: { kind: 'authorize_customer' }, activeRequestId: '', deadlineAt: 0, session: { expired: true }, lastFailureCode: '', lastError: '' });
  const closedGateProbe = heartbeat.FbmSync.sliceIssue(heartbeat.FbmSync.stateRead(), { url: 'https://fbm.test/blocked', body: {}, meta: { kind: 'blocked_read' } });
  const closedGate = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: false, status: 500, body: '\ufffd\ufffd\ufffd', transport: { contract: MA_HOP_DONG, trace: [{ requestId: closedGateProbe.id }] } }));
  check(so, 'cổng fail-closed khi tự đăng nhập tắt: lượt đóng lỗi qua runFail mang mã chặn, không tạm dừng',
    [closedGate && closedGate.ok, closedGate && closedGate.code, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().lastFailureCode, gateLogs.some((event) => event.action === 'session_gate_blocked')],
    [false, 'AUTO_LOGIN_NOT_CONFIGURED', 'error', 'AUTO_LOGIN_NOT_CONFIGURED', true]);

  datState(heartbeat.FbmSync, { runId: 'write-expired', phase: 'push', mode: 'push', cursor: { kind: 'push_wait', operation: 'customer_edit_save' }, activeRequestId: '', deadlineAt: 0, session: { expired: true } });
  const blockedWriteProbe = heartbeat.FbmSync.sliceIssue(heartbeat.FbmSync.stateRead(), { url: 'https://fbm.test/write-blocked', body: {}, meta: { kind: 'customer_edit_save' } });
  const blockedWrite = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: false, status: 500, body: '\ufffd\ufffd\ufffd', transport: { contract: MA_HOP_DONG, trace: [{ requestId: blockedWriteProbe.id }] } }));
  check(so, 'request ghi khong duoc tu dong gui lai khi session het han',
    [blockedWrite && blockedWrite.code, blockedWrite && blockedWrite.request, heartbeat.FbmSync.stateRead().lastFailureCode, heartbeat.FbmSync.stateRead().phase],
    ['SESSION_EXPIRED_AT_WRITE', null, 'SESSION_EXPIRED_AT_WRITE', 'paused']);

  datPhan(heartbeat, 'loginPolicy', { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });

  datPhan(heartbeat, 'loginPolicy', { autoOpenTab: true });
  heartbeat.FbmSync.credentialWrite({ credentialRef: 'cred-heartbeat-123', ciphertext: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt', database: 'FHN_CRM_App', unit: 'CTY' } });
  datState(heartbeat.FbmSync, { runId: 'no-tab-run', phase: 'checking_session', mode: 'read', cursor: { kind: 'customer_count' }, activeRequestId: 'tab-request-1', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const noTabRetry = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.transportFailureRun({ requestId: 'tab-request-1', code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' }));
  const retryId = noTabRetry.request && noTabRetry.request.id;
  const noTabFinal = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.transportFailureRun({ requestId: retryId, code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' }));
  check(so, 'no-tab chi retry mot lan theo policy va co log loi',
    [noTabRetry.ok, noTabRetry.code, noTabRetry.request.meta.openFbmContext !== undefined, noTabFinal.ok, noTabFinal.code, heartbeat.FbmSync.stateRead().phase, gateLogs.filter((event) => event.action === 'transport_retry' || event.action === 'transport_failure').length >= 2],
    [true, 'FBM_TAB_RETRY_REQUEST_READY', true, false, 'FBM_TAB_NOT_FOUND', 'error', true]);
  datPhan(heartbeat, 'loginPolicy', { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });
  datState(heartbeat.FbmSync, { runId: 'no-tab-closed', phase: 'checking_session', cursor: { kind: 'customer_count' }, activeRequestId: 'tab-request-closed', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const noTabClosed = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.transportFailureRun({ requestId: 'tab-request-closed', code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' }));
  check(so, 'no-tab bi chan ngay khi policy tu mo tab tat',
    [noTabClosed.ok, noTabClosed.request, noTabClosed.code, heartbeat.FbmSync.stateRead().phase],
    [false, null, 'FBM_TAB_NOT_FOUND', 'error']);
  check(so, 'log session gate khong chua bi mat hoac payload nhay cam',
    /password|cookie|envelope|authorized/i.test(JSON.stringify(gateLogs)),
    false);
  datPhan(heartbeat, 'loginPolicy', { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });
  datState(heartbeat.FbmSync, { runId: 'network-failure', phase: 'checking_session', mode: 'read', activeRequestReplay: false, cursor: { kind: 'customer_count' }, activeRequestId: 'network-request', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const networkFailure = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.transportFailureRun({ requestId: 'network-request', code: 'FBM_TRANSPORT_UNAVAILABLE', message: 'Relay timeout.' }));
  check(so, 'loi mang transport ket thuc huu han; dong Log vao bo dem, cua vao ghi mot lan cuoi loi goi (EntryPointGate kiem) nen Sidebar dong van co Log',
    [networkFailure.ok, networkFailure.code, heartbeat.FbmSync.stateRead().phase, gateLogs.some((event) => event.action === 'transport_failure'), gateFlushes === 0],
    [false, 'FBM_TRANSPORT_UNAVAILABLE', 'error', true, true]);

  // Công cụ đọc của chặng phiên ném lỗi (kho credential hỏng): lát bắt, đóng lượt lỗi và ghi Log; không request nào được phát, Log không chứa bí mật.
  const savedCredentialRead = heartbeat.FbmSync.credentialRead;
  heartbeat.FbmSync.credentialRead = () => { const loi = new Error('Kho credential hỏng.'); loi.code = 'LOGIN_STORE_CORRUPT'; throw loi; };
  datState(heartbeat.FbmSync, { runId: 'gate-exception', phase: 'checking_session', mode: 'read', cursor: { kind: 'session', cause: 'issue', resume: { cursor: { kind: 'customer_count' }, phase: 'checking_session', entity: '' }, replay: false, probeRetried: false, pageReloaded: false }, activeRequestId: 'gate-exception-request', deadlineAt: Date.now() + 1000, session: { expired: true } });
  let gateExceptionCode = '';
  try { noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"Authorized":false,"Rows":[]}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'gate-exception-request' }] } }); } catch (error) { gateExceptionCode = String(error.code || ''); }
  heartbeat.FbmSync.credentialRead = savedCredentialRead;
  check(so, 'công cụ đọc của chặng phiên ném lỗi thì lát đóng lượt lỗi đúng mã và ném tiếp (cửa vào ghi Log), không phát request, lý do lỗi hiện cho người dùng, Log không chứa bí mật',
    [gateExceptionCode, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().lastFailureCode, heartbeat.FbmSync.stateRead().activeRequestId, /Kho credential hỏng/.test(String(heartbeat.FbmSync.stateRead().lastError || '')), /password|cookie|envelope|authorized/i.test(JSON.stringify(gateLogs))],
    ['LOGIN_STORE_CORRUPT', 'error', 'LOGIN_STORE_CORRUPT', '', true, false]);

  // FBM-029: sự kiện cổng không kết thúc phiên vẫn có dòng Log riêng dù phiên có sổ bước; ghi state lỗi thì ném lên lát.
  const stepBookState = heartbeat.FbmSync.stateRead();
  Object.assign(stepBookState, { runId: 'step-book-expired', phase: 'pull_customer', metadata: Object.assign({}, stepBookState.metadata, { businessSteps: { pull_customer: { status: 'running' } } }) });
  heartbeat.FbmSync.stateWrite(stepBookState);
  const logsBeforeExpired = gateLogs.length, savedLogStatus = heartbeat.FbmSync.logStatus, savedStatusView = heartbeat.FbmSync.statusView;
  heartbeat.FbmSync.logStatus = () => {}; // như logStatus thật với phiên có sổ bước: không ghi snapshot
  heartbeat.FbmSync.statusView = () => ({ runId: 'step-book-expired' });
  heartbeat.FbmSync.transportFailureRecord(heartbeat.FbmSync.stateRead(), 'SESSION_EXPIRED', 'Phiên FBM đã hết hạn; cổng đang xử lý đăng nhập lại an toàn.', 'session_expired');
  heartbeat.FbmSync.logStatus = savedLogStatus; heartbeat.FbmSync.statusView = savedStatusView;
  const expiredLog = gateLogs.slice(logsBeforeExpired).find((event) => event.action === 'session_expired');
  check(so, 'FBM-029: phiên có sổ bước gặp "Phiên FBM đã hết hạn" (chưa kết thúc phiên) vẫn có dòng Log lỗi mang lý do và mã',
    [!!expiredLog, expiredLog && expiredLog.reason, expiredLog && expiredLog.detail.code, heartbeat.FbmSync.stateRead().phase], [true, 'Phiên FBM đã hết hạn; cổng đang xử lý đăng nhập lại an toàn.', 'SESSION_EXPIRED', 'pull_customer']);
  const savedGateStateWrite = heartbeat.FbmSync.stateWrite;
  heartbeat.FbmSync.stateWrite = () => { const error = new Error('Không thể lưu state đồng bộ vào DocumentProperties.'); error.code = 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED'; throw error; };
  let gateWriteError = null;
  try { heartbeat.FbmSync.transportFailureRecord(heartbeat.FbmSync.stateRead(), 'FBM_TAB_NOT_FOUND', 'Không tìm thấy tab FBM.', 'transport_retry'); } catch (error) { gateWriteError = error; }
  heartbeat.FbmSync.stateWrite = savedGateStateWrite;
  check(so, 'FBM-029: cổng phiên ghi state lỗi thì ném FBM_DOCUMENT_PROPERTIES_WRITE_FAILED lên lát, không nuốt',
    gateWriteError && gateWriteError.code,
    'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED');
  const savedTransportPolicy = heartbeat.FbmSync.transportPolicy;
  heartbeat.FbmSync.transportPolicy = () => { throw new Error('secret-internal'); };
  datState(heartbeat.FbmSync, { runId: 'gate-transport-exception', phase: 'checking_session', mode: 'read', cursor: { kind: 'customer_count' }, activeRequestId: 'gate-transport-request', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const gateTransportException = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.transportFailureRun({ requestId: 'gate-transport-request', code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' }));
  check(so, 'exception cong trong nhanh no-tab cung thu hoi reservation',
    [gateTransportException, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().activeRequestId, heartbeat.FbmSync.stateRead().lastFailureCode],
    [null, 'error', '', 'FBM_SESSION_GATE_EXCEPTION']);
  heartbeat.FbmSync.transportPolicy = savedTransportPolicy;
  check(so, 'lỗi nội bộ ở bảng lỗi đường truyền ghi Log an toàn, không lộ chữ lỗi gốc',
    /secret-internal/.test(JSON.stringify(gateLogs)),
    false);
  datState(heartbeat.FbmSync, { runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0 });
  const policy = datPhan(heartbeat, 'loginPolicy', { enabled: true, autoOpenTab: true, retryEnabled: false, retryMinutes: 45 });
  check(so, 'chinh sach auto-login chi luu mot noi va cong khai dung metadata',
    [policy.autoOpenTab, policy.retryEnabled, policy.retryMinutes, heartbeat.FbmSync.credentialRead().ciphertext.ciphertext],
    [true, false, 45, 'ciphertext-long-enough']);
  const credentialUpdate = heartbeat.FbmSync.credentialWrite({ credentialRef: 'cred-heartbeat-456', ciphertext: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt' } });
  const credentialPolicy = docPhan(heartbeat, 'loginPolicy');
  check(so, 'lưu lại credential không đặt lại chính sách tự mở tab và retry',
    [!!credentialUpdate.credentialRef, credentialPolicy.autoOpenTab, credentialPolicy.retryEnabled, credentialPolicy.retryMinutes],
    [true, true, false, 45]);
  datPhan(heartbeat, 'loginPolicy', { enabled: false, autoOpenTab: true, retryEnabled: true, retryMinutes: 45 });
  check(so, 'tat muc cha thi tuy chon tu mo tab khong con hieu luc',
    heartbeat.FbmSync.transportPolicy().autoOpenTab,
    false);
}

module.exports = { chay };
