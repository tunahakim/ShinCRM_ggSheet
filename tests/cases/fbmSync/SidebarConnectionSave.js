/** Lưu kết nối tài khoản FBM trên Sidebar: chặn nhập thiếu trước khi gọi GAS, hỏi khi lệch username, giữ bản nháp khi mã hóa lỗi, thứ tự xóa credential GAS trước Extension sau, mọi lỗi hệ thống hiện Sidebar và ghi Log. */
const { section, check } = require('../../lib/assert');
const { taoSidebarDongBo: taoBoTest } = require('../../lib/sidebar/bo-dong-bo');
/** Sidebar chỉ được gọi GAS qua `fbmSyncCommand`; gọi thẳng `callServer` là lỗi. */
const CAM_GOI_THANG = () => Promise.reject(new Error('Sidebar gọi thẳng callServer, phải đi qua fbmSyncCommand'));

async function chay(so) {
  section('FBM sync — Sidebar: lưu kết nối tài khoản');
  const { hop, dom } = taoBoTest();
  const calls = [], logs = [], notices = [], errors = [];
  hop.FBM_SYNC_CLIENT.identityDraft = { spreadsheetId: 'sheet-a', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' };
  hop.FBM_SYNC_CLIENT.identityStatus = { status: 'BOUND', binding: Object.assign({}, hop.FBM_SYNC_CLIENT.identityDraft) };
  hop.FBM_SYNC_CLIENT.loginStatus = { enabled: true };
  hop.FBM_SYNC_CLIENT.subscreen = 'account';
  hop.fbmSyncSetAccountNotice = (area, level, message) => { notices.push({ area, level, message }); };
  const paintError = hop.fbmSyncReportError;
  hop.fbmSyncReportError = (error, message) => { errors.push(String(message || error || '')); return paintError(error, message); };
  hop.fbmSyncPaint = () => {};
  hop.fbmSyncStatusOnce = () => Promise.resolve({ phase: 'idle' });
  hop.fbmSyncConfigFinishEdit = () => {};
  hop.callServer = CAM_GOI_THANG; hop.fbmSyncCommand = (name, payload) => { if (name === 'client_error') { logs.push({ name, payload }); return Promise.resolve({ ok: true }); } calls.push({ name, payload }); return Promise.resolve({ ok: true, binding: hop.FBM_SYNC_CLIENT.identityDraft, identityStatus: hop.FBM_SYNC_CLIENT.identityStatus, login: hop.FBM_SYNC_CLIENT.loginStatus }); };
  const add = (id, value) => { const input = dom.document.createElement('input'); input.id = id; input.value = value; dom.root.appendChild(input); return input; };
  const spreadsheet = add('fbm-identity-spreadsheet', 'sheet-a');
  add('fbm-identity-user', 'user-a'); add('fbm-identity-username', 'USERA'); add('fbm-identity-account', 'Tai khoan A');
  const username = add('fbm-login-username', '');
  const password = add('fbm-login-password', '');
  const button = dom.document.createElement('button');

  spreadsheet.value = 'sheet-a'; dom.document.getElementById('fbm-identity-user').value = '';
  await hop.fbmSyncSaveConnection(button);
  check(so, 'client chặn identity thiếu trường trước khi gọi GAS, chỉ hiện ở card, không ghi Log',
    [calls.length, button.disabled, notices[0] && notices[0].area, logs.length, errors.length],
    [0, false, 'identity', 0, 0]);

  dom.document.getElementById('fbm-identity-user').value = 'user-a'; username.value = 'USERA'; password.value = '';
  await hop.fbmSyncSaveConnection(button);
  check(so, 'client chặn username không đi cùng password',
    [calls.length, button.disabled, notices[1] && notices[1].area],
    [0, false, 'login']);

  password.value = 'secret'; username.value = 'USERB';
  hop.uiDecisionOpen = () => Promise.resolve(false);
  await hop.fbmSyncSaveConnection(button);
  check(so, 'client hiện popup và cho hủy khi credential lệch username liên kết',
    [calls.length, button.disabled, notices[2] && notices[2].area, notices[2] && notices[2].level],
    [0, false, 'login', 'warning']);

  hop.uiDecisionOpen = () => Promise.resolve(true);
  hop.fbmSyncEncryptCredentials = () => Promise.reject(new Error('ENCRYPT_FAIL'));
  await hop.fbmSyncSaveConnection(button);
  check(so, 'client vẫn cho lưu sau khi xác nhận lệch, nhưng giữ bản nháp khi mã hóa lỗi',
    [calls.length, button.disabled, password.value, notices.some((item) => String(item.message).indexOf('ENCRYPT_FAIL') >= 0)],
    [0, false, 'secret', true]);

  password.value = ''; username.value = '';
  await hop.fbmSyncSaveConnection(button);
  check(so, 'client lưu identity không credential: chỉ gửi nội dung form, không gửi kiểu lưu (GAS quyết giữ hay xóa)',
    [calls.length, calls[0] && calls[0].name, calls[0] && JSON.stringify(calls[0].payload.credential), button.disabled],
    [1, 'save_credential', '{"username":""}', false]);

  username.value = 'USERA'; password.value = 'secret';
  hop.fbmSyncEncryptCredentials = () => Promise.resolve({ credentialRef: 'cred-client-123', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERA' } });
  await hop.fbmSyncSaveConnection(button);
  check(so, 'client gửi credential đã mã hóa đúng payload và xóa password sau save',
    [calls.length, calls[1] && 'mode' in calls[1].payload.credential, calls[1] && calls[1].payload.credential.credentialRef, calls[1] && calls[1].payload.credential.username, password.value],
    [2, false, 'cred-client-123', 'USERA', '']);
  hop.FBM_SYNC_CLIENT.loginStatus = { enabled: true, configured: true, credentialRef: 'cred-client-123', public: { usernameHint: 'USERB' } };
  username.value = 'USERB'; password.value = '';
  await hop.fbmSyncSaveConnection(button);
  hop.FBM_SYNC_CLIENT.loginStatus = { enabled: true, configured: true, credentialRef: 'cred-marker-123', public: { usernameHint: 'USERA' } };
  username.value = 'USERA'; password.value = '********';
  hop.FBM_SYNC_CLIENT.configEdits = { connection: { editing: true, snapshot: {}, draft: {} } };
  hop.FBM_SYNC_CLIENT.loginDraft.username = 'USERA';
  hop.fbmSyncLoginPasswordEnterDraft(password);
  const passwordAfterFocus = password.value;
  hop.fbmSyncBlurLoginPassword(password);
  const passwordAfterBlur = password.value;
  hop.FBM_SYNC_CLIENT.loginDraft.username = 'OTHER';
  hop.fbmSyncSyncLoginPasswordState();
  const passwordAfterUsernameChange = password.value;
  hop.FBM_SYNC_CLIENT.loginDraft.username = 'USERA';
  hop.fbmSyncSyncLoginPasswordState();
  check(so, 'password marker focus blur va username realtime dung state machine',
    [passwordAfterFocus, passwordAfterBlur, passwordAfterUsernameChange, password.value],
    ['', '********', '', '********']);
  let encryptedMarker = false;
  hop.fbmSyncEncryptCredentials = () => { encryptedMarker = true; return Promise.reject(new Error('marker must preserve')); };
  await hop.fbmSyncSaveConnection(button);
  check(so, 'marker password không bị gửi như password mới: chỉ gửi username đã lưu để GAS giữ credential',
    [calls.length, calls[3] && JSON.stringify(calls[3].payload.credential), encryptedMarker],
    [4, '{"username":"USERA"}', false]);
  hop.FBM_SYNC_CLIENT.lastStatus = { usernameDisplay: { text: '', unavailable: true } };
  username.value = ''; password.value = '';
  await hop.fbmSyncSaveConnection(button);
  check(so, 'GAS báo username đã lưu không đọc được (usernameDisplay.unavailable) thì chặn lưu/xóa âm thầm',
    [calls.length, notices[notices.length - 1] && notices[notices.length - 1].area, notices[notices.length - 1] && notices[notices.length - 1].level],
    [4, 'login', 'error']);
  hop.FBM_SYNC_CLIENT.lastStatus = { usernameDisplay: { text: 'USERA', unavailable: false } };
  const deleteOrder = [];
  hop.fbmSyncConfirmCredentialDelete = () => Promise.resolve(true);
  hop.fbmSyncClearCredentialInExtension = (ref) => { deleteOrder.push('extension:' + ref); return Promise.resolve({ ok: true }); };
  hop.callServer = CAM_GOI_THANG; hop.fbmSyncCommand = (name, payload) => { if (name === 'save_credential') { deleteOrder.push('gas'); } calls.push({ name, payload }); return Promise.resolve({ ok: true, binding: hop.FBM_SYNC_CLIENT.identityStatus.binding, identityStatus: hop.FBM_SYNC_CLIENT.identityStatus, login: { configured: false, enabled: false }, keyRefRemove: 'cred-marker-123' }); };
  await hop.fbmSyncDeleteLoginCredential(button);
  check(so, 'xóa credential: GAS xóa bản mã trước rồi Sidebar xóa đúng khóa GAS trả về ở Extension (ngược lại thì GAS còn bản mã mà mất khóa)',
    [deleteOrder, JSON.stringify(calls[calls.length - 1].payload.credential), hop.FBM_SYNC_CLIENT.loginStatus.configured],
    [['gas', 'extension:cred-marker-123'], '{"username":""}', false]);
  hop.FBM_SYNC_CLIENT.loginStatus = { enabled: true, configured: true, credentialRef: 'cred-retry-123', public: { usernameHint: 'USERA' } };
  const gasFailOrder = [];
  hop.fbmSyncClearCredentialInExtension = () => { gasFailOrder.push('extension'); return Promise.resolve({ ok: true }); };
  hop.callServer = CAM_GOI_THANG; hop.fbmSyncCommand = (name, payload) => { if (name === 'client_error') { logs.push({ name, payload }); return Promise.resolve({ ok: true }); } if (name === 'save_credential') { gasFailOrder.push('gas'); return Promise.resolve({ ok: false, code: 'SYNC_BUSY', message: 'Đang có phiên đồng bộ' }); } calls.push({ name, payload }); return Promise.resolve({ ok: true }); };
  await hop.fbmSyncDeleteLoginCredential(button);
  check(so, 'GAS từ chối xóa thì không đụng khóa ở Extension và báo lỗi',
    [gasFailOrder, hop.FBM_SYNC_CLIENT.loginStatus.configured, notices[notices.length - 1] && notices[notices.length - 1].level],
    [['gas'], true, 'error']);
  const keyFailOrder = [];
  hop.fbmSyncClearCredentialInExtension = () => { keyFailOrder.push('extension'); return Promise.reject(new Error('EXTENSION_CLEAR_FAILED')); };
  hop.fbmSyncLogClientError = (error, reason, action) => { keyFailOrder.push('log:' + action); return Promise.resolve(null); };
  hop.callServer = CAM_GOI_THANG; hop.fbmSyncCommand = (name, payload) => { if (name === 'save_credential') { keyFailOrder.push('gas'); } calls.push({ name, payload }); return Promise.resolve({ ok: true, binding: hop.FBM_SYNC_CLIENT.identityStatus.binding, identityStatus: hop.FBM_SYNC_CLIENT.identityStatus, login: { configured: false, enabled: false }, keyRefRemove: 'cred-retry-123' }); };
  await hop.fbmSyncDeleteLoginCredential(button);
  check(so, 'GAS đã xóa mà Extension không xóa được khóa cũ thì vẫn áp kết quả, ghi Log và cảnh báo (khóa thừa vô hại vì không còn bản mã)',
    [keyFailOrder, hop.FBM_SYNC_CLIENT.loginStatus.configured, notices.some((item) => item.level === 'warning' && /EXTENSION_CLEAR_FAILED/.test(item.message))],
    [['gas', 'extension', 'log:credential_key_remove'], false, true]);
  check(so, 'client cho lưu identity lệch và chỉ gửi username khi password để trống',
    [calls[2] && JSON.stringify(calls[2].payload.credential), password.value],
    ['{"username":"USERB"}', '']);
  check(so, 'mọi lỗi hệ thống khi lưu kết nối đều hiện Sidebar và ghi Sheet Log (lỗi nhập sai không tính)',
    [errors.length, logs.length >= errors.length, logs.every((item) => item.name === 'client_error')],
    [2, true, true]);
}

module.exports = { chay };
