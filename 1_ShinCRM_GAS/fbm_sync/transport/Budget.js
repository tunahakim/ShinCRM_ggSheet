/**
 * Ngân sách thời gian và kích thước của kênh GAS–Sidebar–Extension (Tài liệu 09/01 "Ngân sách một lượt").
 * Đây là nơi duy nhất giữ các con số: Sidebar và Extension không giữ bản sao mà đọc từ `meta` của envelope, nên ba bên luôn chờ theo cùng một công thức.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.BUDGET = {
  fetchMs: 10000,
  tabReadyMs: 15000,
  bridgeMs: 5000,
  // Mốc mềm phải chừa đủ chỗ cho phần ghi Sheet của lô cuối trước trần 6 phút.
  gasSoftMs: 300000,
  gasHardMs: 360000,
  gasTransitMs: 30000,
  // Đăng nhập là chuỗi fetch nối tiếp trong executor (trang gốc, salt, đơn vị, Login, trang tài khoản) rồi mở lại trang làm việc.
  loginFetches: 6,
  activityBatchCustomers: 50,
  // Giao dịch của một khách đọc trong một trang: chuyển trang giao dịch cần mô tả trang đang đứng mà chưa có mẫu FBM để kiểm, nên khách chạm trần được báo lỗi thay vì đọc thiếu âm thầm.
  activityCustomerRows: 1000,
  batchMaxBytes: 4 * 1024 * 1024,
  pushBatchRecords: 20,
  lookupMaxAgeMs: 300000,
  // Mỗi bản ghi lỗi đã tốn ít nhất một lần gọi FBM; chạm trần là lỗi hệ thống (danh mục, quyền, cấu hình) nên dừng chiều đẩy. Ba con số cùng giữ khóa lỗi đẩy dưới 9.000 byte.
  pushFailuresMax: 20,
  pushFailureDetailsMax: 10,
  pushFailureReasonChars: 160,
  // Việc quét (scan job): một request FBM lấy cả danh sách nên chờ lâu hơn request thường (bulk giao dịch đo khoảng 19 giây).
  scanFetchMs: 60000,
  // Số dòng mỗi request lấy danh sách toàn bộ khách; FBM báo nhiều hơn thì chuyển trang đến đủ, đặt nhỏ hay lớn chỉ khác số trang.
  scanCustomerRows: 10000,
  // Gói trả về GAS đo bằng byte UTF-8 của JSON đã serialize. Đo thật 2026-10-13: cả đường Sidebar lẫn relay nền qua 20 MB; trần cứng giữ ở một phần tư mức đó để chừa mạng chậm và giới hạn số dòng GAS xử lý trong một lần gọi.
  chunkTargetBytes: 4 * 1024 * 1024,
  chunkMaxBytes: 5 * 1024 * 1024,
  // Mất tab hoặc Extension mất việc quét thì chạy lại cả việc; quá số lần này là lỗi hệ thống, dừng và báo.
  scanJobRestarts: 2,
  // Trần ô "khoảng cách giữa hai request tới FBM"; Extension cũng không chờ quá con số này cho một request.
  requestGapMaxSeconds: 60
};

/** Hạn một lần fetch theo loại request; executor đọc từ `meta.fetchMs`, không giữ con số riêng. */
FbmSync.budgetFetchMs = function (meta) { return String(meta && meta.kind || '') === 'scan_job' ? FbmSync.BUDGET.scanFetchMs : FbmSync.BUDGET.fetchMs; };

/** Hạn Extension phải trả một envelope: chờ tab một lần, cộng mỗi request một lần fetch và khoảng nghỉ dài nhất trước nó; lấy gói từ RAM tab không gọi FBM nên không có khoảng nghỉ. */
FbmSync.budgetTimeoutMs = function (request, requestGap) {
  var budget = FbmSync.BUDGET, items = request && request.items ? request.items : [request || {}], total = budget.tabReadyMs, gapMs = Math.max(0, Number(requestGap && requestGap.maxMs || 0));
  items.forEach(function (item) {
    var meta = item && item.meta || {}, fetches = String(meta.kind || '') === 'login' ? budget.loginFetches : 1;
    total += (String(meta.kind || '') === 'scan_chunk' ? 0 : gapMs) + FbmSync.budgetFetchMs(meta) * fetches;
  });
  if (request && request.meta && request.meta.afterLoginUrl) { total += budget.tabReadyMs; }
  return total;
};

/** Hạn GAS thu hồi request đang bay: Extension hết hạn, cộng đường về Sidebar và đường lên GAS. */
FbmSync.budgetDeadlineAt = function (issuedAt, timeoutMs) { return Number(issuedAt) + Number(timeoutMs) + FbmSync.BUDGET.bridgeMs + FbmSync.BUDGET.gasTransitMs; };

/** Sidebar chờ Extension trả envelope bấy nhiêu: hạn của Extension cộng đường postMessage qua cửa sổ Sheets. */
FbmSync.budgetExtensionReplyMs = function (timeoutMs) { return Number(timeoutMs) + FbmSync.BUDGET.bridgeMs; };

/** Bên gửi response lên GAS (Sidebar, relay nền) chờ bấy nhiêu: GAS không chạy quá trần nền tảng. */
FbmSync.budgetGasReplyMs = function () { return FbmSync.BUDGET.gasHardMs + FbmSync.BUDGET.gasTransitMs; };

/** Mốc lời gọi GAS hiện tại bắt đầu; trần thời gian tính từ đây chứ không từ hạn của request (FBM-031). */
FbmSync.budgetCallBegin = function (now) { FbmSync._callStartedAt = Number(now || Date.now()); };
FbmSync.budgetCallExhausted = function (now) {
  var started = Number(FbmSync._callStartedAt || 0);
  return started > 0 && Number(now || Date.now()) - started >= FbmSync.BUDGET.gasSoftMs;
};
