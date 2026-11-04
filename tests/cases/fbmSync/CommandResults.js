/**
 * Mọi lệnh trong bảng lệnh chạy qua đúng cửa lệnh `controlDispatch` như Sidebar và relay gọi thật, không ném và không để lọt bí mật phiên ngoài phong bì request. Các ca khác gọi thẳng hàm bên trong nên không thấy cửa ra; thiếu ca này thì nơi tạo kết quả thêm trường mới không ai biết cho tới khi người dùng bấm nút.
 * Bảng ca phải phủ đủ bảng lệnh, mọi loại lượt của `start` và mọi phần cài đặt của đồng bộ (trừ ngầm định kéo FBM, cần Category, và công tắc tổng, đi qua `set_master`): thêm lệnh, loại lượt hay phần cài đặt mà quên ca thì test đỏ.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { datCongTac } = require('../../lib/fbm/cai-dat-thu');

/** Hộp cát đủ tệp cho mọi lệnh (lưu cài đặt chung đổi mã ra khách qua cổng mã, `trace_read` đọc sổ bước). */
const HOP = { extraFiles: ['server/gate/IdGate.js', 'fbm_sync/diagnostic/Trace.js'], LOG_WARN: 'warn' };

/** Mở lượt nhận dạng rồi để máy A nhận phong bì, cho các lệnh cần lượt đang chờ response. */
function luotDangCho(FbmSync) {
  FbmSync.controlDispatch('start', { kind: 'identity_probe', machineId: 'may-A' });
  return FbmSync.controlDispatch('heartbeat', { trigger: 'run_now', machineId: 'may-A' }, 'relay').request;
}

/** Mỗi ca: `ten` hiện trong báo cáo, `lenh`, `payload` (hoặc hàm dựng payload từ FbmSync), `kenh`, `chuan` chuẩn bị state trước. */
const dangNhapDaLuu = (F) => { F.loginConfigRead = () => ({ configured: true, credentialRef: 'cred-test-1234', username: 'nguoi-thu' }); };

/** Giá trị bí mật phiên đặt vào ô lượt trước mỗi lệnh; ngoài `request` (body gửi FBM cần chúng) không được xuất hiện ở đâu trong kết quả. */
const BI_MAT = { cookie: 'bi-mat-cookie-7f3a', customerAuthorized: 'bi-mat-customer-9c1d', activityAuthorized: 'bi-mat-activity-2b8e' };

const CA = [
  { lenh: 'start', ten: 'start sync', payload: { kind: 'sync', mode: 'check', machineId: 'may-A' } },
  { lenh: 'start', ten: 'start identity_check', payload: { kind: 'identity_check', machineId: 'may-A' } },
  { lenh: 'start', ten: 'start identity_probe', payload: { kind: 'identity_probe', machineId: 'may-A' } },
  { lenh: 'start', ten: 'start login_test', payload: { kind: 'login_test', credentialRef: 'cred-test-1234', machineId: 'may-A' }, chuan: dangNhapDaLuu },
  { lenh: 'start', ten: 'start login_force', payload: { kind: 'login_force', machineId: 'may-A' }, chuan: (F) => { dangNhapDaLuu(F); F.statePatch({ loginForceOffered: true }); } },
  { lenh: 'heartbeat', ten: 'heartbeat nhận lượt', kenh: 'relay', payload: { trigger: 'run_now', machineId: 'may-A' }, chuan: (F) => { F.controlDispatch('start', { kind: 'identity_probe', machineId: 'may-A' }); } },
  { lenh: 'heartbeat', ten: 'heartbeat chuông không có lượt', kenh: 'relay', payload: { trigger: 'alarm', machineId: 'may-A' } },
  { lenh: 'continue', ten: 'continue nộp response', kenh: 'relay', payload: (F) => { const request = luotDangCho(F); return { machineId: 'may-A', response: { ok: true, status: 200, body: '{"d":{}}', transport: { contract: F.protocol.contract }, trace: [{ stage: 'fbm_tab_replied', requestId: request.id }] } }; } },
  { lenh: 'continue', ten: 'continue nộp lỗi', kenh: 'relay', payload: (F) => { const request = luotDangCho(F); return { machineId: 'may-A', error: { requestId: request.id, code: 'FBM_TAB_MISSING', message: 'Không thấy tab FBM.' } }; } },
  { lenh: 'cancel', ten: 'cancel lượt đang chạy', chuan: (F) => { luotDangCho(F); } },
  { lenh: 'stop_background', ten: 'stop_background' },
  { lenh: 'approve_push', ten: 'approve_push không có gì chờ', payload: { machineId: 'may-A' } },
  { lenh: 'open_conflict', ten: 'open_conflict không có xung đột', payload: { machineId: 'may-A' } },
  { lenh: 'confirm_conflict', ten: 'confirm_conflict không có xung đột', payload: { entity: 'customer', id: 'CUS-1', choice: 'shin' } },
  { lenh: 'save_settings', phan: 'run', ten: 'lưu tham số phiên', payload: { patches: { fbm_run: { approvalThreshold: 5, scopeLimited: true, scopeCodes: 'ALT00010' }, fbm_master: { enabled: true } } } },
  { lenh: 'save_settings', phan: 'run', ten: 'lưu tham số phiên sai ngưỡng', payload: { patches: { fbm_run: { approvalThreshold: -1 } } } },
  { lenh: 'save_settings', phan: 'run', ten: 'lưu tham số phiên sai mã khách', payload: { patches: { fbm_run: { scopeCodes: 'ALT 00010!' } } } },
  { lenh: 'save_settings', phan: 'run', ten: 'lưu tham số phiên sai khoảng nghỉ request', payload: { patches: { fbm_run: { requestGapMinSeconds: 5, requestGapMaxSeconds: 1 } } } },
  { lenh: 'save_settings', phan: 'account', ten: 'lưu cấu hình tài khoản', payload: { patches: { fbm_account: { customerPrefix: 'ALT', customerCodeLength: '8' } } } },
  { lenh: 'save_settings', phan: 'account', ten: 'lưu cấu hình tài khoản thiếu cặp', payload: { patches: { fbm_account: { customerPrefix: 'ALT', customerCodeLength: '' } } } },
  { lenh: 'save_settings', phan: 'extension', ten: 'lưu nhịp Extension', payload: { patches: { fbm_extension: { pollMinutes: 5, runOnStartup: true } } } },
  { lenh: 'save_settings', phan: 'extension', ten: 'lưu nhịp Extension sai', payload: { patches: { fbm_extension: { pollMinutes: 'x', runOnStartup: true } } } },
  { lenh: 'save_settings', phan: 'background', ten: 'lưu lịch nền', payload: { patches: { fbm_background: { heartbeatMinutes: 5, customerFullMinutes: 60 } } } },
  { lenh: 'save_settings', phan: 'background', ten: 'lưu lịch nền chạy dày chưa xác nhận', payload: { patches: { fbm_background: { customerFullEnabled: true, customerFullMinutes: 1 } } } },
  { lenh: 'save_settings', phan: 'background', ten: 'lưu lịch nền sai', payload: { patches: { fbm_background: { heartbeatMinutes: 'x' } } } },
  { lenh: 'save_settings', phan: 'loginPolicy', ten: 'lưu chính sách tự đăng nhập', payload: { patches: { fbm_login_policy: { enabled: false, autoOpenTab: true, retryEnabled: true, retryMinutes: 30 } } } },
  { lenh: 'reset_settings', phan: 'run', ten: 'đặt tham số phiên về mặc định', payload: { section: 'fbm_run' } },
  { lenh: 'set_master', ten: 'set_master', payload: { enabled: true } },
  { lenh: 'set_background', ten: 'set_background', payload: { enabled: false } },
  { lenh: 'save_identity_binding', ten: 'save_identity_binding', payload: { binding: {} } },
  { lenh: 'save_credential', ten: 'save_credential thiếu dữ liệu', payload: {} },
  { lenh: 'repair_login_username', ten: 'repair_login_username', payload: { credentialRef: 'cred-test-1234', username: 'nguoi-thu' }, chuan: dangNhapDaLuu },
  { lenh: 'reset_state', ten: 'reset_state' },
  { lenh: 'retry_push_failures', ten: 'retry_push_failures không có lỗi đẩy' },
  { lenh: 'retry_push_failures', ten: 'retry_push_failures mở lại nhóm lỗi', chuan: (F) => { F.pushFailuresWrite({ hashes: { 'customer:CUS-1': 'h1' }, details: {} }); F.recordChange = (plan) => plan({ read: (entity) => entity === 'customer' ? [{ id: 'CUS-1' }] : [], busy: () => ({}) }); } },
  { lenh: 'client_error', ten: 'client_error', payload: { message: 'Sidebar báo lỗi thử.', action: 'sidebar_error' } },
  { lenh: 'relay_config', ten: 'relay_config', chuan: (F) => { F.relayUrlStored = () => 'https://script.test/exec'; } },
  { lenh: 'relay_rotate_key', ten: 'relay_rotate_key', chuan: (F) => { F.relayUrlStored = () => 'https://script.test/exec'; } },
  { lenh: 'relay_switch_log', ten: 'relay_switch_log', payload: { decision: 'keep', fromSpreadsheetId: 'sheet-cu' } },
  { lenh: 'status', ten: 'status' },
  { lenh: 'trace_read', ten: 'trace_read' }
];

async function chay(so) {
  section('FBM sync — kết quả mọi lệnh qua cửa ra');
  const mau = workflowGas(HOP).hop.FbmSync;
  const thieu = Object.keys(mau.COMMANDS).filter((lenh) => !CA.some((ca) => ca.lenh === lenh))
    .concat(Object.keys(mau.START_KINDS).filter((kind) => !CA.some((ca) => ca.lenh === 'start' && ca.payload.kind === kind)).map((kind) => 'start ' + kind))
    .concat(Object.keys(mau.SETTING_SECTIONS).filter((phan) => phan !== 'pullDefaults' && phan !== 'master' && !CA.some((ca) => ca.phan === phan)).map((phan) => 'cài đặt ' + phan));
  check(so, 'bảng ca phủ đủ mọi lệnh, mọi loại lượt của start và mọi mục cài đặt', thieu, []);

  const lo = [], nem = [];
  CA.forEach((ca) => {
    const { hop } = workflowGas(HOP);
    const F = hop.FbmSync, logs = [];
    hop.logEvent = (line) => { logs.push(line); };
    datCongTac(hop, true);
    try {
      if (ca.chuan) { ca.chuan(F); }
      const payload = typeof ca.payload === 'function' ? ca.payload(F) : (ca.payload || {});
      F.statePatch({ session: Object.assign({}, F.stateRead().session, BI_MAT) });
      logs.length = 0;
      const ketQua = Object.assign({}, F.controlDispatch(ca.lenh, payload, ca.kenh));
      delete ketQua.request;
      const chu = JSON.stringify(ketQua);
      Object.keys(BI_MAT).forEach((khoa) => { if (chu.indexOf(BI_MAT[khoa]) >= 0) { lo.push(ca.ten + ': ' + khoa); } });
    } catch (error) {
      nem.push(ca.ten + ': ' + String(error && (error.code || error.message)));
    }
  });
  check(so, 'không lệnh nào ném lỗi khi chạy qua cửa lệnh', nem, []);
  check(so, 'không lệnh nào để lọt bí mật phiên FBM ra ngoài phong bì request', lo, []);
}

module.exports = { chay };
