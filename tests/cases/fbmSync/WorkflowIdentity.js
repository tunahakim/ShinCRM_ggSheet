/**
 * Danh tính và liên kết qua cả đường GAS -> executor thật -> GAS: tự điền chỉ nhận từ phiên FBM, kiểm liên kết dừng đúng bước, Đăng nhập thử không coi là xong nếu User grid lệch binding, xóa liên kết không đụng khóa đồng bộ.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { quaTrangLogin } = require('../../lib/fbm/trang-login');
const { tabGia, rawExecutor } = require('../../lib/fbm/tab-fbm-gia');
const { USER_BODY } = require('../../lib/fbm/tu-dang-nhap');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

/** Kết quả từng bước Đăng nhập thử nộp về như mọi response: lệnh `continue` của cửa lệnh. */
function noiDangNhap(hop, response) { return hop.FbmSync.controlDispatch('continue', { response }, 'relay'); }

async function chay(so) {
  section('FBM sync — tự điền danh tính, kiểm liên kết và Đăng nhập thử');
  const legacyAccount = workflowGas();
  legacyAccount.hop.FbmSync.configValue = (name) => name === 'FBM_ACCOUNT_NAME' ? 'Tên còn sót trong Config' : '';
  legacyAccount.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Lê Tuấn Anh' } });
  const ownerBeforeVerify = legacyAccount.hop.FbmSync.scriptSettings(legacyAccount.hop.FbmSync.stateRead()).accountName;
  const verifiedOwner = legacyAccount.hop.FbmSync.stateRead();
  legacyAccount.hop.FbmSync.sessionIdentityVerify(verifiedOwner, { userId: '2037', username: 'ANHLT', accountName: 'Lê Tuấn Anh' });
  legacyAccount.hop.FbmSync.stateWrite(verifiedOwner);
  check(so, 'owner lay tu phien da xac minh (chua xac minh thi rong), khong lay tu lien ket hay Config cu; Config cu khong the rebind hay khoa phien', [
    ownerBeforeVerify,
    legacyAccount.hop.FbmSync.scriptSettings(legacyAccount.hop.FbmSync.stateRead()).accountName,
    legacyAccount.hop.FbmSync.identityStatus({ userId: '2037', username: 'ANHLT', accountName: 'Lê Tuấn Anh' }).status,
    legacyAccount.hop.FbmSync.identityStatus({ userId: '2037', username: 'ANHLT', accountName: 'Tên còn sót trong Config' }).status
  ], ['', 'Lê Tuấn Anh', 'BOUND', 'REBIND_REQUIRED']);

  const engine = workflowGas();
  const started = engine.hop.FbmSync.runSlice(() => engine.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true }, engine.hop.FbmSync.stateRead()));
  const firstRequest = started.request;
  check(so, 'tu dong dien: GAS cap dung mot grid User va khong xin Authorized khong dung', [
    firstRequest.meta.kind, firstRequest.body.controller, firstRequest.body.type, firstRequest.body.authorized
  ], ['identity_user_grid', 'User', 0, undefined]);
  const transport = await tabGia().send(firstRequest, USER_BODY);
  check(so, 'tu dong dien: Extension chuyen nguyen envelope GAS toi FBM', [
    transport.sent.url, JSON.parse(transport.sent.body).controller, JSON.parse(transport.sent.body).cookie
  ], [firstRequest.url, 'User', '461020379855cFHN_CRM_App']);
  const finished = engine.hop.FbmSync.runSlice(() => engine.hop.FbmSync.continue(rawExecutor(transport.reply, firstRequest.id)));
  check(so, 'tu dong dien: GAS nhan response Extension va tra draft chua luu binding', [
    finished.ok, finished.request || null, engine.hop.FbmSync.statusView().phase, engine.hop.FbmSync.statusView().metadata.identityProbe, engine.hop.FbmSync.bindingRead().spreadsheetId || null
  ], [true, null, 'done', { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' }, null]);

  const incomplete = workflowGas();
  const incompleteStarted = incomplete.hop.FbmSync.runSlice(() => incomplete.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true }, incomplete.hop.FbmSync.stateRead()));
  const incompleteResult = incomplete.hop.FbmSync.runSlice(() => incomplete.hop.FbmSync.continue({
    ok: true, status: 200,
    body: JSON.stringify({ d: { TotalRowCount: 1, Rows: [[2037]], ViewPage: { Fields: [{ AliasName: 'id' }] } } }),
    transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: incompleteStarted.request.id }] }
  }));
  check(so, 'tu dong dien: FBM thieu nhan dien phai ket thuc loi ro rang, khong tu luu', [
    incompleteResult.ok, incompleteResult.code, incompleteResult.status.phase, incomplete.hop.FbmSync.bindingRead().spreadsheetId || null
  ], [false, 'IDENTITY_PROBE_INCOMPLETE', 'error', null]);

  const identityCheck = workflowGas();
  identityCheck.hop.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-000001', fbmId: 'FBM-1', fbmCustomerCode: 'ALT00010' }] : [];
  identityCheck.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
  const identityStarted = identityCheck.hop.FbmSync.runSlice(() => identityCheck.hop.FbmSync.start({ mode: 'check', scan: 'identity_check', origin: 'manual', manual: true }, identityCheck.hop.FbmSync.stateRead()));
  const identityProbe = await tabGia().send(identityStarted.request, USER_BODY);
  const identityAfterProbe = identityCheck.hop.FbmSync.runSlice(() => identityCheck.hop.FbmSync.continue(rawExecutor(identityProbe.reply, identityStarted.request.id)));
  const identityAuthorized = await tabGia().send(identityAfterProbe.request, JSON.stringify({ d: { Authorized: 'identity-auth' } }));
  const identityGridStep = identityCheck.hop.FbmSync.runSlice(() => identityCheck.hop.FbmSync.continue(rawExecutor(identityAuthorized.reply, identityAfterProbe.request.id)));
  const customerFields = ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ten_cv', 'ngay_gd', 'datetime0', 'xorder'];
  const customerRow = customerFields.map((field) => field === 'stt_rec_kh' ? 'FBM-1' : field === 'ma_kh' ? 'ALT00010' : '');
  const identityGrid = await tabGia().send(identityGridStep.request, JSON.stringify({ d: { TotalRowCount: 1, Rows: [customerRow], ViewPage: { Fields: customerFields.map((AliasName) => ({ AliasName })) } } }));
  const identityDone = identityCheck.hop.FbmSync.runSlice(() => identityCheck.hop.FbmSync.continue(rawExecutor(identityGrid.reply, identityGridStep.request.id)));
  check(so, 'kiem tra lien ket: chi quet Customer va tra tong hop n/N, khong cap Activity hoac ghi binding', [
    identityGridStep.request.meta.entity, identityDone.request || null, identityDone.status.phase,
    identityDone.status.metadata.identityCheck.total, identityDone.status.metadata.identityCheck.matched, identityDone.status.metadata.identityCheck.missing,
    !identityCheck.hop.FbmSync.bindingRead().spreadsheetId
  ], ['customer', null, 'done', 1, 1, 0, false]);

  // Kiểm liên kết với bản nháp chưa lưu: bước kiểm phiên so tài khoản FBM với bản nháp, không với liên kết đã lưu.
  const draftCheck = async (draft, savedName) => {
    const flow = workflowGas();
    flow.hop.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-000001', fbmId: 'FBM-1', fbmCustomerCode: 'ALT00010' }] : [];
    flow.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: savedName } });
    const started = flow.hop.FbmSync.runSlice(() => flow.hop.FbmSync.start({ mode: 'check', scan: 'identity_check', origin: 'manual', manual: true, identity: draft }, flow.hop.FbmSync.stateRead()));
    const probe = await tabGia().send(started.request, USER_BODY);
    return flow.hop.FbmSync.runSlice(() => flow.hop.FbmSync.continue(rawExecutor(probe.reply, started.request.id)));
  };
  const draftWrongName = await draftCheck({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anhhh' }, 'Le Tuan Anh');
  check(so, 'kiem tra lien ket: ban nhap sai Ten day du thi dung o buoc kiem phien va bao lech dung o Ten day du, khong quet Customer', [
    draftWrongName.ok, draftWrongName.code, draftWrongName.status.phase, draftWrongName.request || null, draftWrongName.status.lastError
  ], [false, 'SESSION_IDENTITY_MISMATCH', 'error', null, 'Thông tin liên kết đang nhập không khớp tài khoản FBM đang mở ở: Tên đầy đủ.']);
  const draftRight = await draftCheck({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' }, 'Ten Cu');
  check(so, 'kiem tra lien ket: lien ket da luu cu nhung ban nhap khop tai khoan FBM thi qua buoc kiem phien va sang xac thuc Customer',
    [draftRight.ok, draftRight.request && draftRight.request.meta.kind],
    [true, 'authorize']);

  const loginFlow = workflowGas();
  loginFlow.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
  loginFlow.hop.FbmSync.credentialWrite({ credentialRef: 'workflow-credential-ref', ciphertext: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'ANHLT' } });
  const loginStarted = loginFlow.hop.FbmSync.runSlice(() => loginFlow.hop.FbmSync.loginOpen('test', {}, loginFlow.hop.FbmSync.stateRead()));
  const afterLogin = quaTrangLogin((response) => noiDangNhap(loginFlow.hop, response), loginStarted.request, MA_HOP_DONG, null, { captures: { payloadCookie: '461020379855cFHN_CRM_App' } });
  const loginAuthorize = await tabGia().send(afterLogin.request, JSON.stringify({ d: { Authorized: 'login-auth' } }));
  const afterAuthorize = noiDangNhap(loginFlow.hop, rawExecutor(loginAuthorize.reply, afterLogin.request.id));
  const loginUser = await tabGia().send(afterAuthorize.request, USER_BODY);
  const loginDone = noiDangNhap(loginFlow.hop, rawExecutor(loginUser.reply, afterAuthorize.request.id));
  check(so, 'dang nhap thu: Login thanh cong phai qua authorize va User grid khop binding moi duoc bao thanh cong', [
    loginStarted.request.meta.kind, afterLogin.request.meta.kind, afterAuthorize.request.meta.kind,
    loginDone.ok, loginDone.code, loginDone.status.phase, loginDone.status.message
  ], ['login_step', 'authorize', 'identity_user_grid', true, 'LOGIN_OK', 'done', 'Đăng nhập thử thành công và đúng tài khoản FBM đã liên kết.']);

  const wrongLogin = workflowGas();
  wrongLogin.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
  wrongLogin.hop.FbmSync.credentialWrite({ credentialRef: 'workflow-credential-ref', ciphertext: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'ANHLT' } });
  const wrongStart = wrongLogin.hop.FbmSync.runSlice(() => wrongLogin.hop.FbmSync.loginOpen('test', {}, wrongLogin.hop.FbmSync.stateRead()));
  const wrongAfterLogin = quaTrangLogin((response) => noiDangNhap(wrongLogin.hop, response), wrongStart.request, MA_HOP_DONG, null, { captures: { payloadCookie: '461020379855cFHN_CRM_App' } });
  const wrongAuthorize = noiDangNhap(wrongLogin.hop, { ok: true, status: 200, body: JSON.stringify({ d: { Authorized: 'wrong-auth' } }), transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: wrongAfterLogin.request.id }] } });
  const wrongDone = noiDangNhap(wrongLogin.hop, {
    ok: true, status: 200,
    body: JSON.stringify({ d: { TotalRowCount: 1, Rows: [[2038, 'OTHER', 'Tai khoan khac']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] } } }),
    transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: wrongAuthorize.request.id }] }
  });
  check(so, 'dang nhap thu sai identity: khong coi la thanh cong va khong thay binding', [
    wrongDone.ok, wrongDone.code, wrongDone.status.phase, wrongLogin.hop.FbmSync.bindingRead().userId
  ], [false, 'LOGIN_IDENTITY_MISMATCH', 'error', '2037']);

  const binding = workflowGas();
  const bindingSaved = binding.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
  const bindingCleared = binding.hop.FbmSync.connectionSave({ binding: {} });
  check(so, 'xoa lien ket rong: chi xoa binding, giu Sheet va khoa dong bo thuong', [
    bindingSaved.ok, bindingCleared.code, binding.hop.FbmSync.bindingRead().spreadsheetId || null, bindingCleared.identityStatus.status
  ], [true, 'IDENTITY_BINDING_CLEARED', null, 'UNBOUND']);
  binding.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
  const activeBindingState = binding.hop.FbmSync.stateRead();
  activeBindingState.runId = 'binding-request'; activeBindingState.phase = 'checking_session'; activeBindingState.activeRequestId = 'request-binding';
  binding.hop.FbmSync.stateWrite(activeBindingState);
  const rejectedClear = binding.hop.FbmSync.connectionSave({ binding: {} });
  check(so, 'xoa lien ket bi chan khi request FBM dang bay',
    [rejectedClear.ok, rejectedClear.code, Boolean(binding.hop.FbmSync.bindingRead().spreadsheetId || null)],
    [false, 'SYNC_BUSY', true]);
}

module.exports = { chay };
