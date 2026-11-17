/** Màn Tài khoản FBM của Sidebar: kiểm liên kết, lấy nhận diện và tự điền, cổng cầu nối Extension, gửi cấu hình kết nối một lần mỗi vòng đời. GAS quyết kết quả (`identityResult`); Sidebar chỉ gửi lệnh, đặt câu của GAS vào thẻ và báo lỗi chưa tới GAS. */
const { taoSidebarDongBo, dongBao } = require('../../lib/sidebar/bo-dong-bo');
const { section, check, ghiLoiNap } = require('../../lib/assert');
const { statusGas } = require('../../lib/fbm/status-gas');

/** Sidebar có status đầu tiên, kho dòng báo thật, cầu nối còn sống và Extension trả lời mã máy. */
function taoBo() {
  const bo = taoSidebarDongBo();
  const { hop } = bo;
  hop.FBM_SYNC_CLIENT.subscreen = 'account';
  hop.fbmSyncPaint = () => undefined;
  hop.callServer = () => Promise.reject(new Error('Sidebar gọi thẳng callServer, phải đi qua fbmSyncCommand'));
  hop.fbmSyncExtensionRpc = (action) => Promise.resolve(action === 'CRM_FBM_MACHINE_ID' ? { machineId: 'may-A' } : { accepted: true });
  return bo;
}

const theLienKet = (hop) => { const n = hop.FBM_SYNC_CLIENT.accountNotices && hop.FBM_SYNC_CLIENT.accountNotices.identity; return n ? [n.kind, n.message] : null; };

const binding = { spreadsheetId: 'sheet-1', userId: 'u-1', username: 'an', accountName: 'An FBM' };
function daLienKet(hop) { hop.FBM_SYNC_CLIENT.identityStatus = { status: 'BOUND', binding: Object.assign({}, binding) }; }

async function testKiemLienKet(so) {
  const thieu = taoBo().hop, goi = [];
  thieu.fbmSyncCommand = (name) => { goi.push(name); return Promise.resolve({ ok: true }); };
  thieu.FBM_SYNC_CLIENT.identityStatus = { status: 'NONE', binding: { spreadsheetId: 'sheet-1', userId: '', username: 'an', accountName: '' } };
  const kq = await thieu.fbmSyncCheckIdentity();
  check(so, 'kiểm liên kết thiếu ô: báo ở thẻ Liên kết, không gọi GAS, không ghi Log, không đổi chế độ',
    [kq, goi, theLienKet(thieu)[0], thieu.FBM_SYNC_CLIENT.mode, dongBao(thieu)], [null, [], 'error', 'read', []]);

  const ok = taoBo().hop, ghi = [];
  daLienKet(ok);
  ok.fbmSyncDrive = (command, payload, task) => { ghi.push([command, payload.kind, payload.identity, task]); return Promise.resolve({ ok: true, status: Object.assign(statusGas({ phase: 'done' }), { identityResult: { tone: 'success', text: 'Liên kết khớp 12/12.' } }) }); };
  ok.fbmSyncCommand = (name) => { ghi.push(name); return Promise.resolve({ ok: true, identity: { status: 'BOUND', binding } }); };
  await ok.fbmSyncCheckIdentity();
  check(so, 'kiểm liên kết đủ ô: gửi đúng nhận diện đang hiện, đặt nguyên câu identityResult của GAS vào thẻ rồi nạp lại trạng thái liên kết',
    [ghi[0], theLienKet(ok), ghi[1], ok.FBM_SYNC_CLIENT.identityAction, ok.FBM_SYNC_CLIENT.identityLastAction], [['start', 'identity_check', binding, 'identity'], ['success', 'Liên kết khớp 12/12.'], 'status', '', 'check']);

  const hong = taoBo().hop, log = [];
  daLienKet(hong);
  hong.fbmSyncDrive = () => Promise.resolve({ ok: false, code: 'FBM_TAB_NOT_FOUND', error: 'Không thấy tab FBM', status: statusGas({ phase: 'error', lastError: 'Không thấy tab FBM' }) });
  hong.fbmSyncCommand = (name, payload) => { log.push(name === 'client_error' ? [name, payload.action] : name); return Promise.resolve({ ok: true }); };
  await hong.fbmSyncCheckIdentity();
  check(so, 'GAS không trả identityResult: lỗi hợp đồng mang chữ GAS, hiện ở thẻ Liên kết và dòng báo, ghi Log một lần, nút mở lại',
    [theLienKet(hong), dongBao(hong), log, hong.FBM_SYNC_CLIENT.identityAction], [['error', 'Không thấy tab FBM'], ['fbmClient:Không thấy tab FBM'], [['client_error', 'identity_check']], '']);
}

async function testLayNhanDien(so) {
  const chay = async (value) => {
    const { hop } = taoBo();
    hop.fbmSyncDrive = (command, payload) => Promise.resolve(value);
    hop.FBM_SYNC_CLIENT.identityDraft = { spreadsheetId: '', userId: '', username: '', accountName: '' };
    hop.fbmSyncCommand = () => Promise.resolve({ ok: true });
    const ket = await hop.fbmSyncAutoFill();
    return { ket, hop };
  };
  const probe = { spreadsheetId: 'sheet-1', userId: 'u-1', username: 'an', accountName: 'An FBM' };
  const duoc = await chay({ ok: true, status: statusGas({ phase: 'done', metadata: { identityProbe: probe } }) });
  check(so, 'tự điền đủ ô: thẻ báo thành công, trả IDENTITY_DRAFT_READY, chưa lưu liên kết (không gọi lệnh save_identity_binding)',
    [duoc.ket && duoc.ket.code, theLienKet(duoc.hop)],
    ['IDENTITY_DRAFT_READY', ['success', 'Đã lấy thông tin thành công và điền vào form.']]);
  const thieu = await chay({ ok: true, status: statusGas({ phase: 'done', metadata: { identityProbe: { spreadsheetId: 'sheet-1', userId: '', username: 'an', accountName: '' } } }) });
  check(so, 'tự điền mà tab FBM thiếu ô: báo lỗi ở thẻ, không trả bản nháp',
    [thieu.ket, theLienKet(thieu.hop)],
    [null, ['error', 'Không đọc đủ Spreadsheet ID, mã user hoặc tên tài khoản từ tab FBM.']]);
  const loi = await chay({ ok: false, code: 'FBM_LOGIN_REQUIRED', error: 'FBM chưa đăng nhập', status: statusGas({ phase: 'error', lastError: 'FBM chưa đăng nhập' }) });
  check(so, 'lượt GAS lỗi: thẻ hiện chữ lỗi của GAS, không vẽ status giả',
    [loi.ket && loi.ket.ok, theLienKet(loi.hop)],
    [false, ['error', 'FBM chưa đăng nhập']]);

  // Bản nháp từ lượt lấy nhận diện: điền ô còn trống, chỉ một lần cho cùng bộ giá trị, không điền khi người dùng không vừa bấm lấy nhận diện.
  const { hop } = taoBo();
  hop.FBM_SYNC_CLIENT.identityDraft = { spreadsheetId: '', userId: '', username: '', accountName: '' };
  const status = statusGas({ phase: 'done', metadata: { identityProbe: probe } });
  const khongBam = hop.fbmSyncApplyIdentityProbeDraft(status);
  hop.FBM_SYNC_CLIENT.identityLastAction = 'probe';
  const lanDau = hop.fbmSyncApplyIdentityProbeDraft(status), lanHai = hop.fbmSyncApplyIdentityProbeDraft(status);
  check(so, 'bản nháp nhận diện: không điền khi người dùng chưa bấm lấy nhận diện; điền đúng một lần cho cùng bộ giá trị',
    [khongBam, lanDau, lanHai, hop.FBM_SYNC_CLIENT.identityDraft],
    [false, true, false, probe]);
}

async function testCauNoi(so) {
  // Cầu nối vắng: ping rồi chờ ACK trong hạn; ACK đến kịp thì đi tiếp, không thì ném lỗi rõ để nơi gọi báo qua cửa lỗi.
  const vang = taoBo().hop, ping = [];
  vang.sheetLinkExtensionAlive = () => false;
  vang.sheetLinkHandshakePing = () => { ping.push(1); };
  vang.sheetLinkMs = () => 3000;
  const cho = vang.fbmSyncRequireBridge().then(() => 'tiep', (error) => error.message);
  const daPing = ping.length, hen = vang.timers.length;
  vang.timers[0].fn();
  const loi = await cho;
  check(so, 'cầu nối vắng: ping ngay, chờ đúng một đồng hồ, hết hạn thì ném lỗi tải lại Extension',
    [daPing, hen, loi],
    [1, 1, 'Chưa nhận được bắt tay từ Extension. Hãy tải lại Extension rồi mở lại tab FBM.']);

  const tre = taoBo().hop;
  tre.sheetLinkExtensionAlive = () => false;
  tre.sheetLinkHandshakePing = () => {};
  tre.sheetLinkMs = () => 3000;
  const dung = tre.fbmSyncRequireBridge().then(() => 'tiep', (error) => error.message);
  tre.fbmSyncNotifyBridgeReady();
  check(so, 'ACK đến trong hạn: lệnh đi tiếp, đồng hồ chờ bị hủy',
    [await dung, tre.timers[0].cleared === true],
    ['tiep', true]);

  const song = taoBo().hop, pings = [];
  song.sheetLinkExtensionAlive = () => true;
  song.sheetLinkHandshakePing = () => { pings.push(1); };
  const chiu = await song.fbmSyncRequireBridge();
  check(so, 'cầu nối còn sống: đi thẳng, không ping, không đồng hồ',
    [chiu, pings.length, song.timers.length],
    [null, 0, 0]);
}

async function testCauHinhKetNoi(so) {
  const config = { url: 'https://script.example/exec', key: 'k', spreadsheetId: 'sheet-1', extension: {} };
  const dung = () => {
    const { hop } = taoBo();
    const ghi = { goi: [], rpc: [] };
    hop.window.top = {};
    hop.sheetLinkExtensionAlive = () => true;
    hop.fbmSyncCommand = (name, payload) => { ghi.goi.push(name === 'relay_switch_log' ? name + ':' + payload.decision + ',' + payload.fromSpreadsheetId : name); return Promise.resolve(name === 'relay_config' ? config : { ok: true }); };
    hop.fbmSyncExtensionRpc = (action, fields) => { ghi.rpc.push([action, fields.config && fields.config.switchFrom]); return Promise.resolve(true); };
    ghi.hop = hop;
    return ghi;
  };
  const mot = dung();
  await mot.hop.fbmSyncPrepareRelayForSidebarOpen();
  await mot.hop.fbmSyncPrepareRelayForSidebarOpen();
  check(so, 'cấu hình kết nối chỉ gửi sang Extension một lần mỗi vòng đời Sidebar, đánh dấu đã cấu hình và giữ bản gửi',
    [mot.goi, mot.rpc.length, mot.hop.FBM_SYNC_CLIENT.relayConfigured, mot.hop.FBM_SYNC_CLIENT.relayConfig === config],
    [['relay_config'], 1, true, true]);

  const doi = dung(), hoi = [];
  let lan = 0;
  doi.hop.fbmSyncExtensionRpc = (action, fields) => {
    doi.rpc.push([action, fields.config.switchFrom]);
    lan += 1;
    if (lan === 1) { const error = new Error('đang bận'); error.code = 'RELAY_SPREADSHEET_SWITCH_REQUIRED'; error.currentSpreadsheetId = 'sheet-khac'; return Promise.reject(error); }
    return Promise.resolve(true);
  };
  doi.hop.window.uiDecisionOpen = (opts) => { hoi.push([opts.title, opts.cancelLabel, opts.confirmLabel]); return Promise.resolve(true); };
  await doi.hop.fbmSyncPrepareRelayForSidebarOpen();
  check(so, 'Extension đang đồng bộ nền cho Sheet khác: hỏi bằng popup chung; đồng ý thì ghi Log lựa chọn và gửi lại kèm switchFrom đúng Sheet đang giữ',
    [hoi, doi.goi.filter((n) => n.indexOf('relay_switch_log') === 0), doi.rpc], [[['Extension đang đồng bộ nền cho Sheet khác', 'Giữ Sheet cũ', 'Chuyển sang Sheet này']], ['relay_switch_log:switch,sheet-khac'], [['CRM_FBM_CONFIG', ''], ['CRM_FBM_CONFIG', 'sheet-khac']]]);

  const giu = dung();
  let lanGiu = 0;
  giu.hop.fbmSyncExtensionRpc = (action, fields) => { lanGiu += 1; giu.rpc.push([action, fields.config.switchFrom]); const error = new Error('bận'); error.code = 'RELAY_SPREADSHEET_SWITCH_REQUIRED'; error.currentSpreadsheetId = 'sheet-khac'; return Promise.reject(error); };
  giu.hop.window.uiDecisionOpen = () => Promise.resolve(false);
  await giu.hop.fbmSyncPrepareRelayForSidebarOpen();
  check(so, 'người dùng giữ Sheet cũ: chỉ một lần gửi, ghi Log lựa chọn keep, không phải lỗi nên không ghi Log lỗi và không báo ở dòng báo',
    [lanGiu, giu.goi.filter((n) => n.indexOf('relay_switch_log') === 0), giu.goi.some((n) => n.indexOf('client_error') === 0), dongBao(giu.hop), giu.hop.FBM_SYNC_CLIENT.relayConfigured],
    [1, ['relay_switch_log:keep,sheet-khac'], false, [], false]);

  const hong = dung();
  hong.hop.fbmSyncExtensionRpc = () => Promise.resolve(false);
  await hong.hop.fbmSyncPrepareRelayForSidebarOpen();
  check(so, 'Extension không xác nhận đã lưu: báo lỗi ở dòng báo và ghi Log, không đánh dấu đã cấu hình',
    [dongBao(hong.hop), hong.goi.some((n) => n.indexOf('client_error') === 0), hong.hop.FBM_SYNC_CLIENT.relayConfigured],
    [['fbmClient:Extension không xác nhận đã lưu cấu hình kết nối.'], true, false]);

  const lai = dung();
  await lai.hop.fbmSyncPrepareRelayForSidebarOpen();
  lai.hop.SHEET_LINK_EXTENSION_SESSION = 'phien-1'; lai.hop.fbmSyncNotifyBridgeReady();
  const truoc = lai.rpc.length;
  lai.hop.SHEET_LINK_EXTENSION_SESSION = 'phien-2'; lai.hop.fbmSyncNotifyBridgeReady();
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'Extension tải lại (phiên cầu nối đổi): gửi lại bản đang giữ để lấy lại xác nhận, không gọi GAS thêm; lần nhận phiên đầu không gửi lại',
    [truoc, lai.rpc.length, lai.goi.filter((n) => n === 'relay_config').length],
    [1, 2, 1]);
}

async function chay(so) {
  section('FBM sync — Sidebar: Tài khoản FBM, cầu nối Extension, cấu hình kết nối');
  try { taoSidebarDongBo(); } catch (error) { return ghiLoiNap(so, 'nạp renderer Sidebar Đồng bộ FBM', error); }
  await testKiemLienKet(so);
  await testLayNhanDien(so);
  await testCauNoi(so);
  await testCauHinhKetNoi(so);
}

module.exports = { chay };
