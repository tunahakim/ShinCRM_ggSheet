/**
 * Cửa vào duy nhất của Sidebar cho đồng bộ FBM: Sidebar gửi tên lệnh và gói dữ liệu có tên trường, cửa lệnh `FbmSync.controlDispatch` tra bảng lệnh, giữ khóa và trả bản công khai. Tên lệnh làm nhãn Log và vết của lời gọi.
 * Kênh do cửa vào đặt, không lấy từ payload: Sidebar luôn là `sidebar`, hàm dò DEV đi `fbmCommandRun_` với kênh `dev`; relay đi lối riêng ở `EntryPoints.js`. Hậu tố `_` làm hàm thành riêng tư nên `google.script.run` không gọi được, Sidebar không tự xưng kênh khác được.
 * Nguồn `fbm_sync` bật phạm vi riêng của đồng bộ (gom DocumentProperties, ghi vết) qua `ENTRY_POINT_SCOPES` đăng ký ở cuối tệp.
 */
function fbmCommand(command, payload) { return fbmCommandRun_(command, payload, 'sidebar'); }
function fbmCommandRun_(command, payload, channel) {
  var name = String(command || '');
  return runEntryPoint(name, 'fbm_sync', function () { return FbmSync.controlDispatch(name, payload || {}, channel === 'dev' ? 'dev' : 'sidebar'); }, payload);
}

/** Phạm vi riêng của đồng bộ quanh mỗi cửa vào nguồn `fbm_sync`: gom DocumentProperties một lần gọi và ghi mốc vết. Không lưu response FBM vào vết. Lúc đóng, dòng Log của request bị bỏ mà không có trả lời (phát hiện ở cửa ghi ô lượt) được ghi trước khi ghi trace. */
var ENTRY_POINT_SCOPES = typeof ENTRY_POINT_SCOPES !== 'undefined' ? ENTRY_POINT_SCOPES : {};
ENTRY_POINT_SCOPES.fbm_sync = {
  begin: function () { if (FbmSync.propertyBufferBegin()) { FbmSync.budgetCallBegin(); FbmSync.logContextNote(null); } },
  end: function () { FbmSync.requestWatchTake().forEach(function (entry) { logEvent(entry); }); FbmSync.propertyBufferEnd(); },
  boundary: function (stage, name, error) { FbmSync.traceEvent(FbmSync.callStateSeen(), stage, { operation: String(name || ''), error: error ? String(error && error.message || error) : '', stack: error && error.stack ? String(error.stack) : '' }); }
};
