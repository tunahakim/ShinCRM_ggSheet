/** Đường lỗi của service worker không được im: chuông hỏi GAS, phục hồi cầu nối tab Sheets, lịch thử lại học từ GAS, hỏi GAS lúc mở trình duyệt. */
const { section, check } = require('../../lib/assert');
const { workerNap, chayLuot, SHEET } = require('../../lib/fbm/worker-nap');

const nghi = (ms) => new Promise((resolve) => setTimeout(resolve, ms || 0));
const oLoi = (st) => st.storage.fbmExtensionFailure && [st.storage.fbmExtensionFailure.command, st.storage.fbmExtensionFailure.code];
const loiSidebar = (st) => st.statuses.filter((item) => item.failure).map((item) => [item.spreadsheetId, item.failure.code]);

async function chuong(so) {
  const sai = workerNap({ gas() { throw new Error('không được gọi'); } });
  sai.ctx.scheduleGasPoll({ pollMinutes: 0 });
  await nghi(5);
  check(so, 'Nhịp hỏi GAS không đặt được (0 phút): ghi ô lỗi hộp đen ALARM_MINUTES_INVALID và báo Sidebar của đúng Sheet', [oLoi(sai.st), loiSidebar(sai.st)], [['alarm', 'ALARM_MINUTES_INVALID'], [[SHEET, 'ALARM_MINUTES_INVALID']]]);
  // Chờ worker đặt chuông lúc khởi động xong rồi mới cho Chrome hỏng; đặt lại cùng nhịp hai lần: lần sau vẫn thử tạo (không tưởng chuông đã có).
  const hong = workerNap({ gas() { throw new Error('không được gọi'); } });
  await nghi(5);
  hong.ctx.gasPollAlarmKnown = false;
  hong.ctx.chrome.alarms.create = () => { throw new Error('Alarm quota'); };
  hong.ctx.scheduleGasPoll({ pollMinutes: 5 });
  hong.ctx.scheduleGasPoll({ pollMinutes: 5 });
  await nghi(5);
  check(so, 'Chrome không tạo được chuông: ghi ô lỗi ALARM_CREATE_FAILED và báo Sidebar, lần sau không coi chuông là đã đặt', [oLoi(hong.st), loiSidebar(hong.st), hong.ctx.gasPollAlarmKnown], [['alarm', 'ALARM_CREATE_FAILED'], [[SHEET, 'ALARM_CREATE_FAILED'], [SHEET, 'ALARM_CREATE_FAILED']], false]);
}

async function cauNoiSheets(so) {
  const hoi = workerNap({ gas() { throw new Error('không được gọi'); } });
  hoi.ctx.chrome.tabs.query = () => Promise.reject(new Error('tabs bị khóa'));
  await hoi.ctx.recoverSheetsBridges();
  check(so, 'Không hỏi được danh sách tab Sheets: ghi ô lỗi SHEETS_TAB_QUERY_FAILED, không ném ra ngoài', oLoi(hoi.st), ['sheets_bridge', 'SHEETS_TAB_QUERY_FAILED']);
  const nap = workerNap({ gas() { throw new Error('không được gọi'); } });
  const cham = [];
  nap.ctx.chrome.tabs.query = () => Promise.resolve([{ id: 1, url: 'https://docs.google.com/spreadsheets/d/' + SHEET + '/edit' }, { id: 2, url: 'https://docs.google.com/spreadsheets/d/sheet-khac/edit' }, { id: 3, url: 'https://docs.google.com/spreadsheets/d/' + SHEET + '/edit', discarded: true }]);
  nap.ctx.ensureSheetsBridge = (tabId) => { cham.push(tabId); return Promise.reject(new Error('Bridge Google Sheet không trả lời sau khi nạp.')); };
  await nap.ctx.recoverSheetsBridges();
  check(so, 'Nạp lại cầu nối hỏng: chỉ chạm tab đang thức của đúng Sheet đã cấu hình, ghi ô lỗi SHEETS_BRIDGE_NOT_READY', [cham, oLoi(nap.st)], [[1], ['sheets_bridge', 'SHEETS_BRIDGE_NOT_READY']]);
}

async function lichThuLai(so) {
  // Worker vừa khởi động chưa biết lịch: lần gọi hỏng không thử lại, chuông sau là lần thử lại.
  let lanMoi = 0;
  const moi = workerNap({ gas() { lanMoi += 1; throw new Error('NETWORK_DOWN'); } });
  await chayLuot(moi.ctx, []);
  // Lần đầu GAS trả `retryMs`; lượt sau Sidebar không gửi lịch mà lần hỏng vẫn thử lại theo lịch đã học.
  let lan = 0;
  const hoc = workerNap({ gas() { lan += 1; if (lan === 2) { throw new Error('NETWORK_BLIP'); } return { ok: true, request: null, status: { runId: 'H' + lan, phase: 'done' }, retryMs: [5] }; } });
  await chayLuot(hoc.ctx, []);
  const ketQua = (await chayLuot(hoc.ctx, [])).ketQua;
  check(so, 'Lịch thử lại học từ câu trả lời GAS: chưa học thì không thử lại; đã học thì lần hỏng thử lại một lần theo lịch và lượt xong', [lanMoi, lan, ketQua && ketQua.ok], [1, 3, true]);
}

async function moTrinhDuyet(so) {
  const chuaCauHinh = workerNap({ storage: { fbmWebAppUrl: undefined, fbmPollStopped: true }, gas() { throw new Error('không được gọi'); } });
  delete chuaCauHinh.st.storage.fbmWebAppUrl;
  await chuaCauHinh.ctx.askOnOpen('startup');
  check(so, 'Mở trình duyệt khi chưa có cấu hình relay: xóa cờ tắt chuông, không gọi GAS', [chuaCauHinh.st.storage.fbmPollStopped, chuaCauHinh.st.bodies.length], [false, 0]);
  const coCauHinh = workerNap({ gas() { return { ok: true, request: null, status: { runId: '', phase: 'idle' } }; } });
  await coCauHinh.ctx.askOnOpen('startup');
  await (coCauHinh.ctx.relayLoopFlight || Promise.resolve());
  check(so, 'Mở trình duyệt khi đã có cấu hình: hỏi GAS đúng một lần bằng heartbeat mang lý do startup', coCauHinh.st.bodies.map((body) => [body.command, body.payload.trigger]), [['heartbeat', 'startup']]);
  const hong = workerNap({ gas() { throw new Error('không được gọi'); } });
  hong.ctx.pollReopen = () => Promise.reject(Object.assign(new Error('storage hỏng'), { code: 'STORAGE_WRITE_FAILED' }));
  await hong.ctx.askOnOpen('install');
  check(so, 'Hỏi GAS lúc cài Extension hỏng giữa chừng: ghi ô lỗi hộp đen mang lý do install và mã thật', oLoi(hong.st), ['install', 'STORAGE_WRITE_FAILED']);
}

async function chay(so) {
  section('FBM sync — đường lỗi của service worker');
  await chuong(so);
  await cauNoiSheets(so);
  await lichThuLai(so);
  await moTrinhDuyet(so);
}

module.exports = { chay };
