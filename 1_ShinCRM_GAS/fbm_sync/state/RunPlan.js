/**
 * Dãy chặng của từng kiểu lượt: dữ liệu khai một chỗ, `runPlanOf` chỉ tra bảng. Kiểu hay mức quét không có trong bảng thì ném `SYNC_UNKNOWN_SCAN`, không rơi về một dãy mặc định (lỗi gõ không được biến thành một lượt khác).
 * `activity` là các lớp của chặng Giao dịch theo thứ tự: `list` xả danh sách đọc, `top` quét từ khách mới nhất xuống, `bulk` quét lớp 1, `rotation` vòng xoay chi tiết. `list` cuối vét khách các lớp trước mới đánh dấu.
 * `stages` là dãy chặng đầy đủ của kiểu lượt; chặng kế sau một chặng do `runPlanAfter` chọn (chỗ duy nhất), có chặng chỉ chạy khi chiều chạy cho phép (`RUN_STAGE_APPLIES`). Giữ phiên khai cả `record_push` và `customer_count` vì lượt nền chỉ đẩy khi cổng mở và chỉ đếm khách ở chiều lịch nền (`customerCountMode`); chặng kết thúc dãy thì `runStageNext` đóng lượt.
 * `label` là tên kiểu lượt duy nhất: nhãn lượt trong Log, tên tiến trình nền, menu `Mức quét` và lịch nền của Sidebar (nhận qua `runNames`) đều đọc ở đây.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.RUN_PLANS = {
  keepalive: { label: 'Giữ phiên FBM', stages: ['session', 'record_push', 'customer_count'] },
  'sync:full:quick': { label: 'Quét nhanh', stages: ['session', 'customer_scan', 'activity', 'record_reconcile', 'record_push', 'customer_count'], activity: ['list', 'top', 'list'] },
  'sync:full:deep': { label: 'Quét kỹ', stages: ['session', 'customer_scan', 'activity', 'record_reconcile', 'record_push', 'customer_count'], activity: ['list', 'top', 'bulk', 'list'] },
  'sync:full:all': { label: 'Quét toàn bộ', stages: ['session', 'customer_scan', 'activity', 'record_reconcile', 'record_push', 'customer_count'], activity: ['list'] },
  'sync:activity_bulk': { label: 'Lấy toàn bộ giao dịch', stages: ['session', 'activity', 'record_reconcile', 'record_push', 'customer_count'], activity: ['bulk', 'list'] },
  'sync:detail': { label: 'Vòng xoay giao dịch', stages: ['session', 'activity', 'record_reconcile', 'record_push', 'customer_count'], activity: ['rotation', 'list'] },
  conflict_refresh: { label: 'Đọc lại bản xung đột', stages: ['session', 'conflict_read'] },
  login_test: { label: 'Đăng nhập thử', stages: ['login'] },
  login_force: { label: 'Hủy phiên cũ', stages: ['login'] },
  identity_check: { label: 'Kiểm tra liên kết', stages: ['session', 'identity'] },
  identity_probe: { label: 'Dò tài khoản FBM', stages: ['session', 'identity'] }
};
/** Gói quét khi lượt quét `full` không nêu gói (lịch nền, chiều đẩy không có ô `Mức quét`). Gói nêu mà lạ thì vẫn là lỗi. */
FbmSync.SCAN_PACK_DEFAULT = 'quick';
/** Kiểu lượt mà lệnh `start` nhận qua tham số `scan`; mọi giá trị `scan` khác là mức quét của lượt `sync`. */
FbmSync.START_SCAN_KINDS = ['keepalive', 'identity_check', 'identity_probe'];

/** `kind`, `scan`, `scanPack` → `{ key, kind, scan, scanPack, label, stages, activity }`. `scan` trống của lượt `sync` là `full`. */
FbmSync.runPlanOf = function (kind, scan, scanPack) {
  var runKind = String(kind || ''), runScan = runKind === 'sync' ? String(scan || 'full') : '', pack = runScan === 'full' ? String(scanPack || FbmSync.SCAN_PACK_DEFAULT) : '';
  var key = runKind === 'sync' ? ['sync', runScan].concat(pack ? [pack] : []).join(':') : runKind;
  var plan = Object.prototype.hasOwnProperty.call(FbmSync.RUN_PLANS, key) ? FbmSync.RUN_PLANS[key] : null;
  if (!plan) {
    var error = new Error('Không có dãy chặng cho lượt "' + runKind + '"' + (runScan ? ', mức quét "' + runScan + '"' : '') + (pack ? ', gói "' + pack + '"' : '') + '.');
    error.code = 'SYNC_UNKNOWN_SCAN';
    throw error;
  }
  return { key: key, kind: runKind, scan: runScan || runKind, scanPack: pack, label: plan.label, stages: plan.stages.slice(), activity: (plan.activity || []).slice() };
};
/** Tham số `scan` của lệnh `start` → dãy chặng: `scan` là kiểu lượt riêng hoặc mức quét của lượt `sync`. */
FbmSync.runPlanOfStart = function (scan, scanPack) {
  var value = String(scan || '');
  return FbmSync.START_SCAN_KINDS.indexOf(value) >= 0 ? FbmSync.runPlanOf(value) : FbmSync.runPlanOf('sync', value, scanPack);
};
/** Dãy chặng của lượt đang mở, dựng lại từ mức quét và gói đã chụp trong ô lượt. */
FbmSync.runPlanOfState = function (state) { return FbmSync.runPlanOfStart(state.scan, state.scanPack); };
/**
 * Tên lượt cho Sidebar, dữ liệu thuần: các mức quét của lượt `full` theo thứ tự bảng, gói mặc định, và các tiến trình nền theo thứ tự `SCHEDULE_KINDS`.
 * Sidebar nhận nó lúc dựng khung (`sidebarServerData`) nên không gõ lại tên hay mã nào; thêm mức quét hay tiến trình ở GAS là Sidebar có ngay.
 */
FbmSync.runNames = function () {
  var prefix = 'sync:full:';
  var packs = Object.keys(FbmSync.RUN_PLANS).filter(function (key) { return key.indexOf(prefix) === 0; }).map(function (key) { return { value: key.slice(prefix.length), label: FbmSync.RUN_PLANS[key].label }; });
  var processes = FbmSync.SCHEDULE_KINDS.map(function (kind) { return { key: kind, label: FbmSync.scheduleLabel(kind) }; });
  return { packs: packs, packDefault: FbmSync.SCAN_PACK_DEFAULT, processes: processes };
};
var SIDEBAR_SERVER_DATA_PROVIDERS = typeof SIDEBAR_SERVER_DATA_PROVIDERS !== 'undefined' ? SIDEBAR_SERVER_DATA_PROVIDERS : {};
SIDEBAR_SERVER_DATA_PROVIDERS.fbm_sync = function () { return FbmSync.runNames(); };
/** Vị trí kế sau `index` trong một dãy (`-1` là chưa bắt đầu); hết dãy thì `-1`. Dùng cho dãy chặng và dãy lớp của chặng Giao dịch. */
FbmSync.runPlanNext = function (sequence, index) {
  var next = Number(index) + 1;
  return next < (sequence || []).length ? next : -1;
};
/**
 * Điều kiện chạy của từng chặng theo ô lượt (chiều chạy): chặng không đủ điều kiện thì bị bỏ qua, không có chỗ nào khác rẽ nhánh theo chiều. `session` là chặng mở đầu nên luôn đủ điều kiện.
 * Chặng đọc (`customer_scan`, `activity`) bỏ khi chiều Chỉ đẩy; `record_push` chỉ khi chiều ghi được FBM; `customer_count` chỉ khi chiều đếm ghi được Sheet. `record_reconcile` chưa là chặng riêng (đối soát làm theo từng trang trong chặng đọc) nên chưa mở.
 */
FbmSync.RUN_STAGE_APPLIES = {
  session: function () { return true; },
  customer_scan: function (state) { return state.mode !== 'push'; },
  activity: function (state) { return state.mode !== 'push'; },
  record_reconcile: function () { return false; },
  record_push: function (state) { return FbmSync.canWriteFbm(state.mode); },
  customer_count: function (state) { return FbmSync.customerCountApplies(FbmSync.customerCountMode(state)); }
};
/** Chặng kế sau `stage` trong dãy của lượt, đã bỏ chặng không đủ điều kiện; `''` khi hết dãy. Thuần: không đọc kho, không mở gì. */
FbmSync.runPlanAfter = function (state, stage) {
  var stages = FbmSync.runPlanOfState(state).stages, at = stages.indexOf(stage);
  if (at < 0) { var missing = new Error('Chặng "' + stage + '" không nằm trong dãy chặng của lượt "' + String(state.scan || '') + '".'); missing.code = 'RUN_STAGE_UNKNOWN'; throw missing; }
  for (var index = FbmSync.runPlanNext(stages, at); index >= 0; index = FbmSync.runPlanNext(stages, index)) {
    var applies = FbmSync.RUN_STAGE_APPLIES[stages[index]];
    if (!applies) { var unknown = new Error('Chặng "' + stages[index] + '" không có điều kiện trong RUN_STAGE_APPLIES.'); unknown.code = 'RUN_STAGE_UNKNOWN'; throw unknown; }
    if (applies(state)) { return stages[index]; }
  }
  return '';
};
