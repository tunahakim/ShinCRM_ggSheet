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
  batchMaxBytes: 4 * 1024 * 1024,
  pushBatchRecords: 20,
  lookupMaxAgeMs: 300000
};

/** Hạn Extension phải trả một envelope: chờ tab một lần, cộng mỗi request một lần fetch và thời gian chờ GAS yêu cầu. */
FbmSync.budgetTimeoutMs = function (request) {
  var budget = FbmSync.BUDGET, items = request && request.items ? request.items : [request || {}], total = budget.tabReadyMs;
  items.forEach(function (item) {
    var meta = item && item.meta || {}, fetches = String(meta.kind || '') === 'login' ? budget.loginFetches : 1;
    total += Math.max(0, Number(meta.waitMs || 0)) + budget.fetchMs * fetches;
  });
  if (request && request.meta && request.meta.afterLoginUrl) { total += budget.tabReadyMs; }
  return total;
};

/** Hạn GAS thu hồi request đang bay: Extension hết hạn, cộng đường về Sidebar và đường lên GAS. */
FbmSync.budgetDeadlineAt = function (issuedAt, timeoutMs) { return Number(issuedAt) + Number(timeoutMs) + FbmSync.BUDGET.bridgeMs + FbmSync.BUDGET.gasTransitMs; };

/** Bên gửi response lên GAS (Sidebar, relay nền) chờ bấy nhiêu: GAS không chạy quá trần nền tảng. */
FbmSync.budgetGasReplyMs = function () { return FbmSync.BUDGET.gasHardMs + FbmSync.BUDGET.gasTransitMs; };

/** Mốc lời gọi GAS hiện tại bắt đầu; trần thời gian tính từ đây chứ không từ hạn của request (FBM-031). */
FbmSync.budgetCallBegin = function (now) { FbmSync._callStartedAt = Number(now || Date.now()); };
FbmSync.budgetCallExhausted = function (now) {
  var started = Number(FbmSync._callStartedAt || 0);
  return started > 0 && Number(now || Date.now()) - started >= FbmSync.BUDGET.gasSoftMs;
};
