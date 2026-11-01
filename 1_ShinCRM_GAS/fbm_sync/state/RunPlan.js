/**
 * Dãy chặng của từng kiểu lượt: dữ liệu khai một chỗ, `runPlanOf` chỉ tra bảng. Kiểu hay mức quét không có trong bảng thì ném `SYNC_UNKNOWN_SCAN`, không rơi về một dãy mặc định (lỗi gõ không được biến thành một lượt khác).
 * `activity` là các lớp của chặng Giao dịch theo thứ tự: `list` xả danh sách đọc, `top` quét từ khách mới nhất xuống, `bulk` quét lớp 1, `rotation` vòng xoay chi tiết. `list` cuối vét khách các lớp trước mới đánh dấu.
 * Chặng cũ còn tự nối nhau; bảng hiện quyết mức quét hợp lệ và các lớp của chặng Giao dịch.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.RUN_PLANS = {
  keepalive: { stages: ['session'] },
  'sync:full:quick': { stages: ['session', 'customer_scan', 'activity', 'record_reconcile', 'record_push', 'customer_count'], activity: ['list', 'top', 'list'] },
  'sync:full:deep': { stages: ['session', 'customer_scan', 'activity', 'record_reconcile', 'record_push', 'customer_count'], activity: ['list', 'top', 'bulk', 'list'] },
  'sync:full:all': { stages: ['session', 'customer_scan', 'activity', 'record_reconcile', 'record_push', 'customer_count'], activity: ['list'] },
  'sync:activity_bulk': { stages: ['session', 'activity', 'record_reconcile', 'record_push'], activity: ['bulk', 'list'] },
  'sync:detail': { stages: ['session', 'activity', 'record_reconcile', 'record_push'], activity: ['rotation', 'list'] },
  conflict_refresh: { stages: ['session', 'conflict_read'] },
  login_test: { stages: ['login'] },
  login_force: { stages: ['login'] },
  identity_check: { stages: ['session', 'identity'] },
  identity_probe: { stages: ['session', 'identity'] }
};
/** Gói quét khi lượt quét `full` không nêu gói (lịch nền, chiều đẩy không có ô `Mức quét`). Gói nêu mà lạ thì vẫn là lỗi. */
FbmSync.SCAN_PACK_DEFAULT = 'quick';
/** Kiểu lượt mà lệnh `start` nhận qua tham số `scan`; mọi giá trị `scan` khác là mức quét của lượt `sync`. */
FbmSync.START_SCAN_KINDS = ['keepalive', 'identity_check', 'identity_probe'];

/** `kind`, `scan`, `scanPack` → `{ key, kind, scan, scanPack, stages, activity }`. `scan` trống của lượt `sync` là `full`. */
FbmSync.runPlanOf = function (kind, scan, scanPack) {
  var runKind = String(kind || ''), runScan = runKind === 'sync' ? String(scan || 'full') : '', pack = runScan === 'full' ? String(scanPack || FbmSync.SCAN_PACK_DEFAULT) : '';
  var key = runKind === 'sync' ? ['sync', runScan].concat(pack ? [pack] : []).join(':') : runKind;
  var plan = Object.prototype.hasOwnProperty.call(FbmSync.RUN_PLANS, key) ? FbmSync.RUN_PLANS[key] : null;
  if (!plan) {
    var error = new Error('Không có dãy chặng cho lượt "' + runKind + '"' + (runScan ? ', mức quét "' + runScan + '"' : '') + (pack ? ', gói "' + pack + '"' : '') + '.');
    error.code = 'SYNC_UNKNOWN_SCAN';
    throw error;
  }
  return { key: key, kind: runKind, scan: runScan || runKind, scanPack: pack, stages: plan.stages.slice(), activity: (plan.activity || []).slice() };
};
/** Tham số `scan` của lệnh `start` → dãy chặng: `scan` là kiểu lượt riêng hoặc mức quét của lượt `sync`. */
FbmSync.runPlanOfStart = function (scan, scanPack) {
  var value = String(scan || '');
  return FbmSync.START_SCAN_KINDS.indexOf(value) >= 0 ? FbmSync.runPlanOf(value) : FbmSync.runPlanOf('sync', value, scanPack);
};
/** Dãy chặng của lượt đang mở, dựng lại từ mức quét và gói đã chụp trong ô lượt. */
FbmSync.runPlanOfState = function (state) { return FbmSync.runPlanOfStart(state.scan, state.scanPack); };
/** Vị trí kế sau `index` trong một dãy chặng (`-1` là chưa bắt đầu); hết dãy thì `-1`. */
FbmSync.runPlanNext = function (sequence, index) {
  var next = Number(index) + 1;
  return next < (sequence || []).length ? next : -1;
};
