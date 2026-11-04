/** Kiểm cổng Web App relay của GAS: khóa, Sheet, mã giao thức, danh sách lệnh relay, ghi địa chỉ Web App, Log qua vỏ runEntryPoint. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer, TEP_KHUNG_LUOT } = require("../../lib/load-gas");
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');

async function chay(so) {
  section("FBM sync — cổng Web App relay");
  // ScriptProperties giả có thật kho; `relayContextUrl` là địa chỉ ScriptApp trả trong ngữ cảnh đang chạy. Khóa relay ở DocumentProperties.
  const relayScriptStore = {};
  const relayScriptCount = { doc: 0, ghi: 0 };
  const relayDocStore = { FBM_RELAY_KEY_V1: 'relay-test-key' };
  let relayContextUrl = 'https://script.google.com/macros/s/relay-dep/exec';
  const relay = taoHopCat({
    FbmSync: {},
    PropertiesService: taoPropertiesService({ doc: relayDocStore, script: relayScriptStore, demScript: relayScriptCount }),
    ScriptApp: { getService: () => ({ getUrl: () => relayContextUrl }), getScriptId: () => 'script-relay-test' },
    shinOpenBook: () => ({ getId: () => 'sheet-relay-test' }),
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (text) => ({ text: text, setMimeType() { return this; } }) },
    LOG_ERROR: 'error', errorMessage: (err) => String(err && err.message || err)
  });
  // Bộ ghi Log giả: đếm dòng đệm và số lần xả để chốt cổng nhịp nền đi qua đúng vỏ runEntryPoint (FBM-034).
  const relayLog = { lines: [], flushes: 0, reports: [] };
  relay.logEvent = (entry) => { relayLog.lines.push(entry); };
  relay.flushLog = () => { relayLog.flushes += 1; return 0; };
  relay.noticeRaise = (notice) => { relayLog.reports.push([notice.title, notice.topic]); return true; };
  relay.noticeResolve = () => null;
  napServer(relay, 'server/state/DirtyState.js', 'server/entry/EntryPoint.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/report/Report.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/control/ControlPort.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/write/SheetSave.js');
  // Cửa lệnh giả: phần này chỉ kiểm cổng HTTP (khóa, Sheet, mã giao thức, danh sách lệnh relay, Log); cửa lệnh thật kiểm ở Control.
  const relayDispatched = [];
  relay.FbmSync.controlDispatch = (command, input, channel) => { relayDispatched.push([command, channel]); return { ok: true, code: 'RELAY_TEST_DONE', request: null, status: {} }; };
  Object.assign(relay.FbmSync, { currentSpreadsheetId: () => 'sheet-relay-test' });
  const contract = relay.FbmSync.protocol.contract;
  const relayConfigError = () => { try { relay.FbmSync.relayConfig(); return ''; } catch (err) { return String(err.message); } };
  check(so, 'Chưa có địa chỉ Web App đã ghi: không cấp cấu hình relay, báo rõ phải mở link Web App một lần',
    /Chưa có địa chỉ Web App/.test(relayConfigError()),
    true);
  relayScriptStore[relay.FbmSync.RELAY_URL_KEY] = JSON.stringify({ url: 'https://script.google.com/macros/s/cua-script-goc/exec', scriptId: 'script-goc' });
  check(so, 'Địa chỉ Web App mang theo từ script gốc (bản sao Sheet) bị bỏ qua: vẫn không cấp cấu hình',
    /Chưa có địa chỉ Web App/.test(relayConfigError()),
    true);
  delete relayScriptStore[relay.FbmSync.RELAY_URL_KEY];
  relay.doPost({ postData: { contents: JSON.stringify({ key: 'sai-khoa', contract, spreadsheetId: 'sheet-relay-test', command: 'heartbeat', payload: {} }) } });
  check(so, 'Lời gọi Web App sai khóa không ghi địa chỉ', relayScriptCount.ghi, 0);
  const rejectedProbe = JSON.parse(relay.doPost({ postData: { contents: JSON.stringify({ key: 'relay-test-key', contract, spreadsheetId: 'sheet-relay-test', command: 'probe', payload: {} }) } }).text);
  check(so, 'Web App từ chối lệnh ngoài danh sách relay (probe) và không gọi cửa lệnh',
    [rejectedProbe.ok, rejectedProbe.code, rejectedProbe.request || null, relayDispatched.length],
    [false, 'RELAY_COMMAND_REJECTED', null, 0]);
  const configAfterPost = relay.FbmSync.relayConfig();
  check(so, 'Lời gọi Web App qua khóa ghi đúng địa chỉ Web App đang chạy; Sidebar cấp đúng địa chỉ đó và khóa relay cho Extension',
    [configAfterPost.url, configAfterPost.key, Object.keys(relayScriptStore)],
    ['https://script.google.com/macros/s/relay-dep/exec', 'relay-test-key', [relay.FbmSync.RELAY_URL_KEY]]);
  relayContextUrl = 'https://script.google.com/macros/s/head-only/dev';
  check(so, 'Ngữ cảnh không phải Web App /exec (Sidebar, @HEAD) không ghi được địa chỉ',
    (() => { try { relay.FbmSync.relayUrlRecord(relay.PropertiesService.getScriptProperties()); return 'ghi'; } catch (err) { return /\/exec/.test(err.message); } })(),
    true);
  relayContextUrl = 'https://script.google.com/macros/s/relay-dep/exec';
  const pageOpen = relay.doGet({ parameter: {} });
  check(so, 'Mở link Web App trên trình duyệt: báo đã ghi địa chỉ; địa chỉ không đổi thì không ghi lại ScriptProperties',
    [/đã ghi địa chỉ/.test(pageOpen.text), relayScriptCount.ghi],
    [true, 1]);
  relay.devRunnerGet = (event) => ({ text: 'runner:' + event.parameter.fn });
  check(so, 'Lời gọi mang token chuyển cho cửa chạy hàm lúc phát triển',
    relay.doGet({ parameter: { token: 't', fn: 'x' } }).text,
    'runner:x');
  delete relay.devRunnerGet;
  // FBM-034: nhịp nền chạy cả khi Sidebar đóng, nên lỗi chỉ còn Log và tin chờ ở Sidebar lần mở sau; doPost không qua runEntryPoint thì Log mất.
  const relayPost = (body) => JSON.parse(relay.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
  // Địa chỉ đã ghi từ trên nên các lời gọi dưới không thêm dòng Log; đếm lại từ đầu.
  relayLog.lines = []; relayLog.flushes = 0; relayLog.reports = [];
  const relayOk = relayPost({ key: 'relay-test-key', contract, spreadsheetId: 'sheet-relay-test', command: 'heartbeat', payload: { trigger: 'alarm', machineId: 'may-A' } });
  check(so, 'FBM-034: nhịp nền thành công đi đúng một lệnh relay vào cửa lệnh với nguồn relay và xả bộ đệm Log đúng một lần',
    [relayOk.code, relayDispatched, relayLog.flushes],
    ['RELAY_TEST_DONE', [['heartbeat', 'relay']], 1]);
  relay.FbmSync.controlDispatch = () => { throw new Error('Lỗi đọc state thử nghiệm'); };
  const relayBoom = relayPost({ key: 'relay-test-key', contract, spreadsheetId: 'sheet-relay-test', command: 'heartbeat', payload: { machineId: 'may-A' } });
  const boomLine = relayLog.lines.filter((line) => line.action === 'fbmRelay')[0] || {};
  check(so, 'FBM-034: exception trong nhịp nền có dòng Log lỗi action fbmRelay, được xả ra Sheet, đẩy tin chờ cho Sidebar và vẫn trả JSON lỗi cho Extension',
    [relayBoom.ok, relayBoom.error, boomLine.outcome, boomLine.reason, relayLog.flushes, relayLog.reports], [false, 'Lỗi đọc state thử nghiệm', 'error', 'Lỗi đọc state thử nghiệm', 2, [['Lỗi đọc state thử nghiệm', 'entry_failure']]]);
  const mismatch = relayPost({ key: 'relay-test-key', contract, spreadsheetId: 'sheet-khac', command: 'heartbeat', payload: {} });
  check(so, 'FBM-034: Extension gửi nhịp nền cho bảng tính khác thì có dòng Log lỗi và tin chờ, không xử lý nhịp',
    [mismatch.ok, mismatch.code, relayLog.lines.length, relayLog.reports.length, relayLog.lines[1] && relayLog.lines[1].reason.indexOf('bảng tính khác') >= 0],
    [false, 'RELAY_SPREADSHEET_MISMATCH', 2, 2, true]);
  const oldExtension = relayPost({ key: 'relay-test-key', contract: 'ban-cu', spreadsheetId: 'sheet-relay-test', command: 'heartbeat', payload: {} });
  check(so, 'Extension khác bản giao thức gọi nhịp nền thì từ chối với EXTENSION_PROTOCOL_MISMATCH, có dòng Log lỗi và lời nhắc tải lại Extension',
    [oldExtension.ok, oldExtension.code, relayLog.lines.length, /tải lại Extension/.test(oldExtension.error)],
    [false, 'EXTENSION_PROTOCOL_MISMATCH', 3, true]);
  const intruder = relayPost({ key: 'sai-khoa', contract, spreadsheetId: 'sheet-relay-test', command: 'heartbeat', payload: {} });
  const badJson = relayPost('{"key":"relay-test-key", hỏng');
  check(so, 'FBM-034: khóa sai hoặc JSON hỏng bị từ chối mà không ghi Log (người lạ không đẩy trôi được Log thật) và câu trả về không trích nội dung gửi lên',
    [intruder.error, badJson.error, JSON.stringify(badJson).indexOf('relay-test-key') < 0, relayLog.lines.length, relayLog.flushes],
    ['unauthorized', 'invalid_json', true, 3, 4]);
}

module.exports = { chay };
