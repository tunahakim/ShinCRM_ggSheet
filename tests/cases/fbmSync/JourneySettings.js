/** Hành trình người dùng trên màn Cài đặt phiên của Sidebar Đồng bộ FBM: chế độ xem/sửa, lưu cài đặt, ô sai, lịch dày, khóa hỏng, chính sách tự đăng nhập. */
const { section, check } = require('../../lib/assert');
const { goiCaiDat } = require('../../lib/sidebar/fbm-cai-dat');
const { taoHanhTrinh, bamNut, doiChon, choVong, statusNghi } = require('../../lib/sidebar/hanh-trinh');

async function chay(so) {
  section('FBM sync — hành trình người dùng: Cài đặt phiên');
  const { hop, dom, content, calls } = taoHanhTrinh();
  hop.FBM_SYNC_CLIENT.active = true;
  hop.FBM_SYNC_CLIENT.statusReady = true;
  hop.FBM_SYNC_CLIENT.subscreen = 'settings';
  hop.FBM_SYNC_CLIENT.loginStatus = { configured: false };
  hop.FBM_SYNC_CLIENT.syncSettings = goiCaiDat({ fbm_background: { activityFullEnabled: true, activityFullMinutes: 30, detailMinutes: 60, detailCustomersPerRun: 50 } });
  hop.FBM_SYNC_CLIENT.lastStatus = statusNghi();
  hop.fbmSyncPaint(statusNghi());
  const settingsRoot = content.children[0];
  check(so, 'cài đặt phiên ở chế độ xem khóa toàn bộ control thân card', [
    dom.document.getElementById('fbm-sync-settings-master-switch').disabled,
    dom.document.getElementById('fbm-sync-run-on-startup').disabled,
    dom.document.getElementById('fbm-sync-background-switch').disabled,
    dom.document.getElementById('fbm-sync-process-heartbeat').disabled,
    dom.document.getElementById('fbm-sync-policy-auto-login').disabled,
    dom.document.getElementById('fbm-sync-policy-auto-open').disabled
  ], [true, true, true, true, true, true]);
  const moduleViewValue = dom.document.getElementById('fbm-sync-settings-master-switch').getAttribute('aria-pressed');
  const masterCallsBeforeModuleViewClick = calls.filter((item) => item.name === 'fbmSetMasterSwitch').length;
  bamNut(dom, dom.document.getElementById('fbm-sync-settings-master-switch'));
  check(so, 'switch module trong card ở chế độ xem không gọi GAS',
    [dom.document.getElementById('fbm-sync-settings-master-switch').getAttribute('aria-pressed'), calls.filter((item) => item.name === 'fbmSetMasterSwitch').length],
    [moduleViewValue, masterCallsBeforeModuleViewClick]);
  bamNut(dom, dom.document.getElementById('fbm-sync-config-module-edit'));
  bamNut(dom, dom.document.getElementById('fbm-sync-settings-master-switch'));
  check(so, 'switch module trong card ở chế độ sửa chỉ đổi draft',
    [dom.document.getElementById('fbm-sync-settings-master-switch').getAttribute('aria-pressed'), calls.filter((item) => item.name === 'fbmSetMasterSwitch').length],
    ['false', masterCallsBeforeModuleViewClick]);
  hop.fbmSyncConfigFinishEdit('module');
  bamNut(dom, dom.document.getElementById('fbm-sync-config-module-cancel'));
  const startupViewValue = dom.document.getElementById('fbm-sync-run-on-startup').getAttribute('aria-pressed');
  bamNut(dom, dom.document.getElementById('fbm-sync-run-on-startup'));
  check(so, 'click switch thân ở chế độ xem không đổi draft và không gọi GAS',
    [dom.document.getElementById('fbm-sync-run-on-startup').getAttribute('aria-pressed'), calls.filter((item) => item.name === 'fbmSaveExtensionConfig').length],
    [startupViewValue, 0]);
  bamNut(dom, dom.document.getElementById('fbm-sync-config-extension-edit'));
  let pollMinutes = dom.document.getElementById('fbm-extension-poll-minutes');
  pollMinutes.value = '17';
  dom.document.listeners.input({ target: pollMinutes });
  hop.fbmSyncPaint(Object.assign(statusNghi(), { message: 'Snapshot Cài đặt mới' }));
  check(so, 'snapshot GAS vá Cài đặt mà không ghi đè nhịp Extension người dùng đang sửa',
    [content.children[0] === settingsRoot, dom.document.getElementById('fbm-extension-poll-minutes') === pollMinutes, pollMinutes.value],
    [true, true, '17']);
  bamNut(dom, dom.document.getElementById('fbm-sync-config-extension-cancel'));
  pollMinutes = dom.document.getElementById('fbm-extension-poll-minutes');
  check(so, 'hủy cấu hình Extension khôi phục giá trị GAS và khóa lại ô nhập',
    [pollMinutes.value, pollMinutes.disabled, !!dom.document.getElementById('fbm-sync-config-extension-edit')],
    ['5', true, true]);
  bamNut(dom, dom.document.getElementById('fbm-sync-config-background-edit'));
  const activityMinutes = dom.document.getElementById('fbm-sync-process-activityFull-minutes');
  activityMinutes.value = '45';
  dom.document.listeners.input({ target: activityMinutes });
  hop.fbmSyncConfigState('background').needsRender = true;
  hop.fbmSyncPaint(Object.assign(statusNghi(), { message: 'Snapshot Lịch nền mới' }));
  check(so, 'Ô số phút Lịch nền đang sửa: thẻ vẽ lại từ bản nháp vẫn giữ số vừa gõ',
    [dom.document.getElementById('fbm-sync-process-activityFull-minutes') !== activityMinutes, dom.document.getElementById('fbm-sync-process-activityFull-minutes').value, hop.fbmSyncConfigDraftValue('background', 'activityFullMinutes', '')],
    [true, '45', '45']);
  hop.fbmSyncConfigCancelEdit('background', true);
  // Lưu cài đặt FBM: GAS báo ô sai thì tô đúng ô, hỏi xác nhận lịch dày, phần khóa hỏng chỉ còn nút đặt về mặc định.
  const keepCall = hop.callServer, keepNotice = hop.fbmSyncSetSettingsNotice, keepDecision = hop.uiDecisionOpen, keepSettings = hop.FBM_SYNC_CLIENT.syncSettings, sent = [], notices = [];
  hop.fbmSyncSetSettingsNotice = (card, kind, text) => { notices.push([card, kind, text]); };
  hop.callServer = (name, args) => { sent.push([name, args[0], args[1]]); return Promise.resolve({ ok: false, code: 'SETTINGS_INVALID', problems: [{ section: 'fbm_extension', field: 'pollMinutes', label: 'Chu kỳ hỏi GAS', reason: 'Chu kỳ hỏi GAS phải từ 1 đến 60 phút.' }] }); };
  bamNut(dom, dom.document.getElementById('fbm-sync-config-extension-edit'));
  const badPoll = dom.document.getElementById('fbm-extension-poll-minutes');
  badPoll.value = '0';
  bamNut(dom, dom.document.getElementById('fbm-sync-save-extension'));
  await choVong(); await choVong();
  check(so, 'GAS báo ô sai: gửi nguyên chuỗi ô, tô đỏ đúng ô, gộp lý do vào thông báo của card và vẫn ở chế độ sửa',
    [sent, badPoll.classList.contains('shin-input-error'), notices.map((item) => [item[0], item[1]]), notices[0] && notices[0][2].indexOf('phải từ 1 đến 60 phút') >= 0, hop.fbmSyncConfigIsEditing('extension')],
    [[['fbmSaveSettings', { fbm_extension: { pollMinutes: '0', runOnStartup: true } }, false]], true, [['extension', 'error']], true, true]);
  hop.fbmSyncConfigCancelEdit('extension', true);
  let lowAsked = 0;
  sent.length = 0; notices.length = 0;
  hop.uiDecisionOpen = () => { lowAsked += 1; return Promise.resolve(true); };
  hop.callServer = (name, args) => { sent.push([name, args[1]]); return Promise.resolve(sent.length === 1 ? { ok: false, code: 'SCHEDULE_LOW_CONFIRM', message: 'Chu kỳ dưới 5 phút sẽ chạy dày. Vẫn lưu?' } : { ok: true, settings: goiCaiDat(), status: statusNghi() }); };
  bamNut(dom, dom.document.getElementById('fbm-sync-config-background-edit'));
  bamNut(dom, dom.document.getElementById('fbm-sync-save-background'));
  await choVong(); await choVong(); await choVong();
  check(so, 'Lịch nền dày: GAS hỏi xác nhận, đồng ý thì gửi lại cùng gói kèm confirmLow rồi thoát chế độ sửa',
    [lowAsked, sent, hop.fbmSyncConfigIsEditing('background'), notices.map((item) => item[1])], [1, [['fbmSaveSettings', false], ['fbmSaveSettings', true]], false, ['success']]);
  sent.length = 0; notices.length = 0; lowAsked = 0;
  hop.uiDecisionOpen = () => { lowAsked += 1; return Promise.resolve(false); };
  hop.callServer = (name, args) => { sent.push([name, args[1]]); return Promise.resolve({ ok: false, code: 'SCHEDULE_LOW_CONFIRM', message: 'Chu kỳ dưới 5 phút sẽ chạy dày. Vẫn lưu?' }); };
  bamNut(dom, dom.document.getElementById('fbm-sync-config-background-edit'));
  bamNut(dom, dom.document.getElementById('fbm-sync-save-background'));
  await choVong(); await choVong(); await choVong();
  check(so, 'Lịch nền dày mà người dùng quay lại sửa: chỉ một lần gửi, không ghi, vẫn ở chế độ sửa',
    [lowAsked, sent, hop.fbmSyncConfigIsEditing('background'), notices.length], [1, [['fbmSaveSettings', false]], true, 0]);
  hop.fbmSyncConfigCancelEdit('background', true);
  hop.fbmSyncSetSettingsNotice = keepNotice;
  hop.FBM_SYNC_CLIENT.syncSettings = Object.assign(goiCaiDat({ fbm_extension: null }), { corrupt: [{ section: 'fbm_extension', label: 'Nhịp hỏi GAS của Extension', message: 'Khóa cài đặt bị hỏng.' }] });
  hop.fbmSyncPaint(statusNghi());
  const resetButton = dom.document.getElementById('fbm-sync-reset-fbm_extension');
  check(so, 'Phần cài đặt khóa hỏng: hiện lỗi kèm nút Đặt về mặc định, ô để trống và không sửa được',
    [!!resetButton, resetButton && resetButton.textContent, dom.document.getElementById('fbm-sync-settings-extension-notice-region').textContent.indexOf('Khóa cài đặt bị hỏng.') >= 0, dom.document.getElementById('fbm-extension-poll-minutes').value, !!content.querySelector('#fbm-sync-config-extension-edit')],
    [true, 'Đặt về mặc định', true, '', false]);
  sent.length = 0;
  hop.callServer = (name, args) => { sent.push([name, args[0]]); return Promise.resolve({ ok: true, settings: goiCaiDat(), status: statusNghi() }); };
  bamNut(dom, resetButton);
  await choVong(); await choVong(); await choVong();
  check(so, 'Bấm Đặt về mặc định gọi GAS đúng phần, nạp lại cài đặt GAS trả và bỏ lời báo lỗi',
    [sent, hop.FBM_SYNC_CLIENT.syncSettings.fbm_extension.pollMinutes, !!content.querySelector('#fbm-sync-reset-fbm_extension'), dom.document.getElementById('fbm-extension-poll-minutes').value],
    [[['fbmResetSettings', 'fbm_extension']], 5, false, '5']);
  hop.callServer = keepCall; hop.uiDecisionOpen = keepDecision; hop.FBM_SYNC_CLIENT.syncSettings = keepSettings;
  hop.fbmSyncPaint(statusNghi());
  bamNut(dom, dom.document.getElementById('fbm-sync-config-extension-edit'));
  pollMinutes = dom.document.getElementById('fbm-extension-poll-minutes');
  pollMinutes.value = '17';
  dom.document.listeners.input({ target: pollMinutes });
  check(so, 'Cài đặt phiên không còn vùng thông báo chung trên đầu màn',
    [dom.document.getElementById('fbm-sync-settings-message-region'), !!dom.document.getElementById('fbm-sync-settings-extension-notice-region'), !!dom.document.getElementById('fbm-sync-settings-background-notice-region'), !!dom.document.getElementById('fbm-sync-settings-login-notice-region')],
    [null, true, true, true]);
  hop.fbmSyncSetSettingsNotice('background', 'success', 'Đã nhận lượt scheduler customer; chờ Extension chuyển request.');
  check(so, 'Thông báo scheduler nằm trong đúng khối Lịch đồng bộ nền',
    [dom.document.getElementById('fbm-sync-settings-background-notice-region').textContent, dom.document.getElementById('fbm-sync-settings-background-notice-region').textContent.indexOf('Đã nhận lượt scheduler customer; chờ Extension chuyển request.') >= 0],
    ['Đã nhận lượt scheduler customer; chờ Extension chuyển request.', true]);
  const settingsActions = [];
  hop.fbmSyncSaveExtensionSettings = () => { settingsActions.push('extension'); return Promise.resolve(null); };
  hop.fbmSyncSaveBackgroundSettings = () => { settingsActions.push('background'); return Promise.resolve(null); };
  hop.fbmSyncSaveLoginPolicy = () => { settingsActions.push('login-policy'); return Promise.resolve(null); };
  hop.fbmSyncRotateRelay = () => { settingsActions.push('rotate-relay'); return Promise.resolve(null); };
  const toggles = ['fbm-sync-run-on-startup', 'fbm-sync-process-heartbeat', 'fbm-sync-process-customerFull', 'fbm-sync-process-activityFull', 'fbm-sync-process-detail', 'fbm-sync-policy-auto-login', 'fbm-sync-policy-auto-open', 'fbm-sync-policy-retry'];
  bamNut(dom, dom.document.getElementById('fbm-sync-save-extension'));
  hop.fbmSyncConfigFinishEdit('extension');
  bamNut(dom, dom.document.getElementById('fbm-sync-config-background-edit'));
  ['fbm-sync-process-heartbeat', 'fbm-sync-process-customerFull', 'fbm-sync-process-activityFull', 'fbm-sync-process-detail'].forEach((id) => bamNut(dom, dom.document.getElementById(id)));
  bamNut(dom, dom.document.getElementById('fbm-sync-save-background'));
  hop.fbmSyncConfigFinishEdit('background');
  hop.FBM_SYNC_CLIENT.loginStatus = { configured: true, credentialRef: 'policy-credential', public: { usernameHint: 'USERA' } };
  bamNut(dom, dom.document.getElementById('fbm-sync-config-loginPolicy-edit'));
  ['fbm-sync-policy-auto-login', 'fbm-sync-policy-auto-open', 'fbm-sync-policy-retry'].forEach((id) => bamNut(dom, dom.document.getElementById(id)));
  check(so, 'chinh sach tu dang nhap khoa hai muc con khi muc cha tat',
    [dom.document.getElementById('fbm-sync-policy-auto-login').disabled, dom.document.getElementById('fbm-sync-policy-auto-open').disabled, dom.document.getElementById('fbm-sync-policy-retry').disabled, dom.document.getElementById('fbm-sync-login-retry-minutes').disabled],
    [false, true, true, true]);
  bamNut(dom, dom.document.getElementById('fbm-sync-policy-auto-login'));
  check(so, 'bat lai muc cha mo khoa cac muc con',
    [dom.document.getElementById('fbm-sync-policy-auto-login').getAttribute('aria-pressed'), dom.document.getElementById('fbm-sync-policy-auto-open').disabled, dom.document.getElementById('fbm-sync-policy-retry').disabled, dom.document.getElementById('fbm-sync-login-retry-minutes').disabled],
    ['true', false, false, false]);
  bamNut(dom, dom.document.getElementById('fbm-sync-policy-retry'));
  check(so, 'tat retry khoa rieng chu ky thu lai',
    [dom.document.getElementById('fbm-sync-policy-retry').getAttribute('aria-pressed'), dom.document.getElementById('fbm-sync-login-retry-minutes').disabled],
    ['false', true]);
  bamNut(dom, dom.document.getElementById('fbm-sync-policy-retry'));
  check(so, 'bat retry mo khoa lai chu ky thu lai',
    [dom.document.getElementById('fbm-sync-policy-retry').getAttribute('aria-pressed'), dom.document.getElementById('fbm-sync-login-retry-minutes').disabled],
    ['true', false]);
  bamNut(dom, dom.document.getElementById('fbm-sync-save-login-policy'));
  hop.fbmSyncConfigFinishEdit('loginPolicy');
  bamNut(dom, dom.document.getElementById('fbm-sync-config-relay-edit'));
  bamNut(dom, dom.document.getElementById('fbm-sync-rotate-relay'));
  hop.fbmSyncConfigFinishEdit('relay');
  check(so, 'cai dat phien doi dung tung cong tac va gui tung lenh luu theo nut bam',
    settingsActions,
    ['extension', 'background', 'login-policy', 'rotate-relay']);
  const background = dom.document.getElementById('fbm-sync-background-switch');
  bamNut(dom, background);
  check(so, 'công tắc lịch nền trong chế độ xem không đổi',
    [background.getAttribute('aria-pressed'), background.className.indexOf('is-off') >= 0, background.disabled],
    ['true', false, true]);
  await choVong();
  check(so, 'cài đặt lịch nền chế độ xem không gửi GAS',
    [calls.filter((item) => item.name === 'fbmSetBackgroundSwitch').map((item) => item.args[0]), background.getAttribute('aria-pressed'), background.className.indexOf('is-off') >= 0, background.disabled],
    [[], 'true', false, true]);

}

module.exports = { chay };
