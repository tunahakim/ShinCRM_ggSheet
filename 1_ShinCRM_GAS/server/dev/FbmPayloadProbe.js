/** Kích thước gói (MB) thử ở `fbmProbePayloadBudget`; lớn dần để thấy chỗ GAS bắt đầu chậm hoặc vỡ. */
var FBM_PERF_PAYLOAD_SIZES_MB = [0.5, 1, 5, 10, 20];

/**
 * Đo GAS xử lý một gói Activity cỡ 0,5–20 MB: giải JSON, tính hash từng bản ghi, dựng bảng id → hash. Không gọi FBM, không ghi gì.
 * Bản ghi nhân bản từ Activity thật của Sheet DEV (đổi id) để kích thước và hình dạng giống thật. Chỉ đo phía GAS; thời gian truyền gói từ Sidebar lên GAS phải đo ở lượt chạy thật.
 * GAS không có API đọc bộ nhớ, nên cỡ nào vỡ thì báo lỗi đúng cỡ đó và dừng, các cỡ trước vẫn có số.
 */
function fbmProbePayloadBudget() {
  var templates = FbmSync.readLocal('activity').filter(function (record) { return record.fbmId; });
  if (!templates.length) { return 'Sheet DEV chưa có Activity nào có mã FBM để làm mẫu.'; }
  var gate = FbmSync.readCategoryGate(), lines = ['Mẫu: ' + templates.length + ' Activity thật trên Sheet DEV'];
  for (var s = 0; s < FBM_PERF_PAYLOAD_SIZES_MB.length; s++) {
    var targetBytes = FBM_PERF_PAYLOAD_SIZES_MB[s] * 1024 * 1024, step = 'dựng gói';
    try {
      var t0 = Date.now(), records = [], bytes = 2, i = 0;
      while (bytes < targetBytes) {
        var copy = JSON.parse(JSON.stringify(templates[i % templates.length]));
        copy.fbmId = String(copy.fbmId) + '-' + i;
        records.push(copy);
        bytes += JSON.stringify(copy).length + 1;
        i++;
      }
      var text = JSON.stringify(records);
      records = null;
      var t1 = Date.now(); step = 'giải JSON';
      var parsed = JSON.parse(text);
      var t2 = Date.now(); step = 'tính hash';
      var map = {};
      parsed.forEach(function (record) { map[record.fbmId] = FbmSync.hash(record, 'activity', gate); });
      var t3 = Date.now();
      lines.push(FBM_PERF_PAYLOAD_SIZES_MB[s] + ' MB: ' + parsed.length + ' bản ghi, ' + Math.round(text.length / parsed.length) + ' B/bản ghi | giải JSON ' + (t2 - t1) + ' ms | hash + bảng id→hash ' + (t3 - t2) + ' ms (' + Math.round((t3 - t2) * 1000 / parsed.length) + ' µs/bản ghi) | dựng gói thử ' + (t1 - t0) + ' ms');
      text = null; parsed = null; map = null;
    } catch (error) {
      lines.push(FBM_PERF_PAYLOAD_SIZES_MB[s] + ' MB: VỠ lúc ' + step + ' — ' + String(error && error.message || error));
      break;
    }
  }
  return lines;
}
