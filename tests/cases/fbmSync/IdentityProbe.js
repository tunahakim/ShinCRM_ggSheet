/** Kiểm liên kết Customer và probe danh tính: chỉ đọc grid cần thiết, nhận diện đủ mã số và tên, thiếu dòng User thì báo lỗi rõ. */
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
  let identityFlowState = { mode: 'check', scan: 'identity_check', session: { cookie: '461020379855cFHN_CRM_App', userId: '2037' }, metadata: {} };
  builders.FbmSync.stateRead = () => identityFlowState;
  builders.FbmSync.stateWrite = (next) => {
    var fallback = builders.FbmSync.stateDefault();
    identityFlowState = Object.assign(fallback, next || {}, {
      session: Object.assign(fallback.session, next && next.session || {}),
      metadata: Object.assign(fallback.metadata, next && next.metadata || {}),
      counts: Object.assign(fallback.counts, next && next.counts || {})
    });
    return identityFlowState;
  };
  builders.FbmSync.extractAuthorized = () => 'auth-customer';
  const identityStarted = builders.FbmSync.authContinue('customer', { map: {} });
  check(so, 'Identity check sau authorize chi mo Customer grid, khong mo Activity',
    [identityStarted.meta.kind, identityFlowState.scan, identityFlowState.phase, identityFlowState.metadata.identityCheck.total],
    ['grid', 'identity_check', 'pull_customer', 2]);
  identityFlowState = { mode: 'check', scan: 'identity_probe', session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: false, activityAuthorized: false }, metadata: {} };
  identityFlowState.runId = ''; identityFlowState.phase = 'idle'; identityFlowState.cursor = {};
  const identityProbeStarted = builders.FbmSync.start({ mode: 'check', scan: 'identity_probe' });
  const identityUserRequest = identityProbeStarted.request;
  check(so, 'Identity probe chi doc User grid, khong lay Authorized thua',
    [identityProbeStarted.ok, identityUserRequest.meta.kind, identityFlowState.phase, identityFlowState.cursor.kind, identityUserRequest.body.controller],
    [true, 'identity_user_grid', 'checking_session', 'identity_user_grid', 'User']);
  const identityProbeFinished = builders.FbmSync.continue({ d: { TotalRowCount: 1, Rows: [[2037, 'ANHLT', 'Le Tuan Anh']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] }, Authorized: true }, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: identityUserRequest.id }] } });
  check(so, 'Identity probe nhan dien du ma so va ten day du, cho xac nhan luu',
    [identityProbeFinished.ok, identityFlowState.phase, identityFlowState.cursor, identityFlowState.metadata.identityProbe.userId, identityFlowState.metadata.identityProbe.accountName],
    [true, 'done', {}, '2037', 'Le Tuan Anh']);
  check(so, 'Identity probe thieu dong User thi fail ro rang',
    builders.FbmSync.identityUser({ d: { Rows: [], ViewPage: { Fields: [{ AliasName: 'id' }] } } }).code,
    'IDENTITY_PROBE_INCOMPLETE');

  return so;
}

module.exports = { chay };
