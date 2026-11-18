/** Kiểm liên kết Customer và probe danh tính: chỉ đọc grid cần thiết, nhận diện đủ mã số và tên, thiếu dòng User thì báo lỗi rõ. */
const { trongLat } = require('../../lib/fbm/hop-dong-bo');
const { section, check } = require('../../lib/assert');
const { TRANG_FBM_THU } = require('../../lib/load-gas');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const { hopKeoVe } = require('../../lib/fbm/hop-keo');

function chay(so) {
  section('FBM sync — Kiểm liên kết Customer và probe danh tính');
  const builders = hopKeoVe();
  const identityCheckState = { session: { userId: '2037', accountName: 'ANHLT' }, metadata: {} };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-1', fbmId: 'FBM-1', fbmCustomerCode: 'ALT00010' }, { id: 'CUS-2', fbmId: 'FBM-2', fbmCustomerCode: 'ALT00011' }];
  builders.FbmSync.identityCheckBegin(identityCheckState);
  builders.FbmSync.identityCheckPage(identityCheckState, [{ stt_rec_kh: 'FBM-1' }, { stt_rec_kh: 'FBM-OTHER' }]);
  const identityCheckResult = builders.FbmSync.identityCheckFinish(identityCheckState);
  const identityCheckRequest = builders.FbmSync.identityCheckCustomerRequest({ type: 0 }, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead()));
  check(so, 'Kiem tra lien ket Customer chi doc ID da lien ket va tra n/N',
    [identityCheckResult.total, identityCheckResult.matched, identityCheckResult.missing, identityCheckResult.missingSample[0].fbmId, identityCheckRequest.body.externalKey.some((item) => item.Name === 'ma_kh'), identityCheckRequest.body.sortExpression],
    [2, 1, 1, 'FBM-2', false, 'stt_rec_kh']);
  // Tới bước kết của chặng xác thực Customer thì phiên đã qua cổng (đã xác minh).
  let identityFlowState = { mode: 'check', scan: 'identity_check', runId: 'identity-check-run', phase: 'checking_session', cursor: { kind: 'authorize_customer' }, session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', identityVerified: true, sessionId: 'phien-thu', identitySessionId: 'phien-thu' }, metadata: {} };
  builders.FbmSync.stateRead = () => identityFlowState;
  // Như bản của lát: trả đúng đối tượng được ghi (bổ field thiếu từ mặc định tại chỗ), để công cụ đang cầm bản đó không thành bản cũ.
  builders.FbmSync.stateWrite = (next) => {
    var fallback = builders.FbmSync.stateDefault();
    Object.keys(fallback).forEach((key) => { if (!(key in next)) { next[key] = fallback[key]; } });
    next.session = Object.assign(fallback.session, next.session || {});
    next.metadata = Object.assign(fallback.metadata, next.metadata || {});
    next.counts = Object.assign(fallback.counts, next.counts || {});
    identityFlowState = next;
    return identityFlowState;
  };
  const identityStarted = trongLat(builders.FbmSync, () => builders.FbmSync.authorizeEnd(identityFlowState, { entity: 'customer' }), identityFlowState);
  check(so, 'Identity check sau authorize chi mo Customer grid, khong mo Activity',
    [identityStarted.request.meta.kind, identityFlowState.scan, identityFlowState.phase, identityFlowState.metadata.identityCheck.total],
    ['grid', 'identity_check', 'pull_customer', 2]);
  identityFlowState = { mode: 'check', scan: 'identity_probe', session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: false, activityAuthorized: false }, metadata: {} };
  identityFlowState.runId = ''; identityFlowState.phase = 'idle'; identityFlowState.cursor = {};
  const identityProbeStarted = builders.FbmSync.runSlice(() => builders.FbmSync.start({ mode: 'check', scan: 'identity_probe' }, builders.FbmSync.stateRead()));
  const identityUserRequest = identityProbeStarted.request;
  check(so, 'Identity probe chi doc User grid, khong lay Authorized thua',
    [identityProbeStarted.ok, identityUserRequest.meta.kind, identityFlowState.phase, identityFlowState.cursor.kind, identityUserRequest.body.controller],
    [true, 'identity_user_grid', 'checking_session', 'identity_user_grid', 'User']);
  const identityProbeFinished = builders.FbmSync.runSlice(() => builders.FbmSync.continue({ d: { TotalRowCount: 1, Rows: [[2037, 'ANHLT', 'Le Tuan Anh']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] }, Authorized: true }, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: identityUserRequest.id }] } }));
  check(so, 'Identity probe nhan dien du ma so va ten day du, cho xac nhan luu',
    [identityProbeFinished.ok, identityFlowState.phase, identityFlowState.cursor, identityFlowState.metadata.identityProbe.userId, identityFlowState.metadata.identityProbe.accountName],
    [true, 'done', {}, '2037', 'Le Tuan Anh']);
  // FBM trả grid User thiếu danh tính: lượt đọc danh tính đóng lỗi có mã (kết quả nghiệp vụ), không ném lỗi GAS và không phát request kế.
  identityFlowState = { mode: 'check', scan: 'identity_probe', session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: false, activityAuthorized: false }, metadata: {} };
  identityFlowState.runId = ''; identityFlowState.phase = 'idle'; identityFlowState.cursor = {};
  const thieuStarted = builders.FbmSync.runSlice(() => builders.FbmSync.start({ mode: 'check', scan: 'identity_probe' }, builders.FbmSync.stateRead()));
  const thieu = builders.FbmSync.runSlice(() => builders.FbmSync.continue({ d: { TotalRowCount: 0, Rows: [], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] } }, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: thieuStarted.request.id }] } }));
  check(so, 'lượt đọc danh tính gặp grid User thiếu dòng thì đóng lỗi IDENTITY_PROBE_INCOMPLETE, không phát request',
    [thieuStarted.request.meta.kind, thieu.ok, thieu.code, thieu.request, identityFlowState.phase, identityFlowState.lastFailureCode],
    ['identity_user_grid', false, 'IDENTITY_PROBE_INCOMPLETE', null, 'error', 'IDENTITY_PROBE_INCOMPLETE']);
  check(so, 'Identity probe thieu dong User thi fail ro rang',
    builders.FbmSync.identityUser({ d: { Rows: [], ViewPage: { Fields: [{ AliasName: 'id' }] } } }).code,
    'IDENTITY_PROBE_INCOMPLETE');

  return so;
}

module.exports = { chay };
