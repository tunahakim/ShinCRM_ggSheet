/**
 * Đo trần đường truyền gói lớn của việc quét: gói đệm vô nghĩa đi đúng hai đường của gói `scan_chunk` — Extension → Sidebar → GAS (lượt chạy tay) và Extension → Web App (lượt nền).
 * Không chạm FBM, không ghi Sheet ngoài Log; Log chỉ ghi cỡ và thời gian, không ghi gói.
 * Sidebar điều phối bằng `client/dev/transportProbe.html`. Xóa cùng thư mục `server/dev/` trước khi chạy thật.
 */

/** Cỡ gói đem đo, tăng dần; đường nào lỗi ở cỡ nào thì dừng đường đó, cỡ lỗi đầu tiên là trần. */
var TRANSPORT_PROBE_SIZES_MB = [1, 5, 10, 20];

/** Kế hoạch đo do GAS cấp để Sidebar không giữ bản sao con số: các cỡ gói và hạn chờ một lần gửi (bằng hạn chờ GAS của lượt đồng bộ). */
function fbmTransportProbePlan() {
  return runEntryPoint('fbmTransportProbePlan', 'sidebar', 'throw', function () {
    return { ok: true, sizesBytes: TRANSPORT_PROBE_SIZES_MB.map(function (mb) { return mb * 1024 * 1024; }), timeoutMs: FbmSync.budgetGasReplyMs() };
  });
}

/** Đường lượt chạy tay: Sidebar gửi gói Extension vừa trả về. */
function fbmTransportProbe(input) {
  return runEntryPoint('fbmTransportProbe', 'sidebar', 'throw', function () { return fbmTransportProbeReceive('sidebar', input || {}); });
}

/** Đường lượt nền: `doPost` đã kiểm khóa relay rồi mới chuyển vào đây. */
function fbmTransportProbeRelay(body) { return fbmTransportProbeReceive('relay', body || {}); }

function fbmTransportProbeReceive(route, input) {
  var receivedBytes = String(input.padding || '').length, sizeBytes = Number(input.sizeBytes || 0), ok = receivedBytes === sizeBytes;
  logEvent({ source: 'fbm_sync', action: 'transport_probe', outcome: ok ? LOG_OK : LOG_ERROR, reason: 'Đo đường truyền ' + route + ': GAS nhận ' + fbmTransportProbeMb(receivedBytes) + ' / ' + fbmTransportProbeMb(sizeBytes), detail: { route: route, sizeBytes: sizeBytes, receivedBytes: receivedBytes } });
  return ok ? { ok: true, receivedBytes: receivedBytes } : { ok: false, code: 'TRANSPORT_PROBE_TRUNCATED', error: 'GAS nhận thiếu gói: ' + receivedBytes + '/' + sizeBytes + ' byte.', receivedBytes: receivedBytes };
}

/** Một dòng Log tổng kết mỗi đường; lỗi phía trình duyệt (GAS không nhận được gì) chỉ có ở đây. */
function fbmTransportProbeReport(results) {
  return runEntryPoint('fbmTransportProbeReport', 'sidebar', 'throw', function () {
    var rows = Array.isArray(results) ? results : [], lines = [];
    ['sidebar', 'relay'].forEach(function (route) {
      var own = rows.filter(function (item) { return item && item.route === route; });
      if (!own.length) { return; }
      var failed = own.filter(function (item) { return !item.ok; })[0];
      var times = own.filter(function (item) { return item.ok; }).map(function (item) { return fbmTransportProbeMb(item.sizeBytes) + ' ' + (Number(item.ms || 0) / 1000).toFixed(1) + ' giây'; }).join('; ');
      var line = 'Đường ' + route + ': ' + (times || 'không cỡ nào qua') + (failed ? '. Lỗi đầu tiên ở ' + fbmTransportProbeMb(failed.sizeBytes) + ': ' + String(failed.code || '') + ' ' + String(failed.error || '').slice(0, 200) : '. Qua hết các cỡ đã đo.');
      lines.push(line);
      logEvent({ source: 'fbm_sync', action: 'transport_probe_summary', outcome: failed ? LOG_WARN : LOG_OK, reason: line, detail: { route: route, firstFailBytes: failed ? Number(failed.sizeBytes || 0) : 0 } });
    });
    return { ok: true, lines: lines };
  });
}

function fbmTransportProbeMb(bytes) { return (Number(bytes || 0) / 1024 / 1024).toFixed(1).replace(/\.0$/, '') + ' MB'; }
