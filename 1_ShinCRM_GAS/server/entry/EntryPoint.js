/**
 * Vỏ bọc chung của mọi cửa vào (entry point — hàm mà Google gọi để khởi động một lượt chạy). Tài liệu 10 Phần 8.
 *
 * Một lượt chạy Apps Script có ba việc phải làm ở rìa ngoài, và cả ba đều là loại việc mà quên một lần là mất dữ liệu chẩn đoán của đúng lượt chạy đáng xem nhất:
 *   1. **Nhả bộ đệm log**, kể cả khi lượt chạy đang đổ. Không nhả thì mọi dòng log của lượt đó chết trong RAM cùng lượt chạy.
 *   2. **Ghi dòng lỗi** với đủ `stack`, trước khi lỗi bay ra ngoài.
 *   3. **Phát thông báo lỗi** qua cổng thông báo (`server/notice/NoticeGate.js`), để mọi kênh hiện được.
 *
 * Trước khi có tệp này, việc số 1 phải gọi tay ở từng chỗ — và một luật cần người nhớ là một luật sẽ bị quên ở đúng cái cửa vào viết vội nhất. Bây giờ nó nằm trong `finally`, nên không ai phải nhớ nữa.
 *
 * **Ném lại chứ không nuốt.** Ghi log xong thì lỗi tiếp tục bay ra. Nuốt lỗi ở đây là biến một lượt chạy thất bại thành một lượt chạy trông như thành công, và với cửa sidebar thì `withFailureHandler` bên client sẽ không bao giờ chạy. Ném lại còn mua thêm email báo thực thi thất bại mà Google tự gửi.
 */

/**
 * Cửa vào Sidebar tự gọi định kỳ, không do người bấm: chỉ ghi Log khi thông báo lỗi của cửa vào mới xuất hiện hoặc đổi nội dung, và một dòng khi hết lỗi.
 * Vì sao: mỗi dòng Log là một lần ghi Sheet, kênh báo thay đổi đánh thức Sidebar hỏi lại; ghi lỗi trùng ở mỗi lần là tự nuôi vòng lặp. Sidebar vẫn nhận lỗi mỗi lần nên không có lỗi im lặng.
 * Không gồm cửa vào FBM: luật đồng bộ FBM đòi mọi lỗi vào Log.
 */
var ENTRY_POINT_LOG_ON_CHANGE = ['probeSelectionAndReload', 'getReloadState', 'reloadRecords', 'renderViewIfDirty'];

/** Cửa vào lỗi: phát thông báo của chính cửa vào (Tài liệu 10 Phần 8) rồi ghi Log theo luật ở trên. */
function entryFail(name, source, err) {
  var changed = noticeRaise({ topic: 'entry_failure', scope: name, source: source, title: errorMessage(err), lines: ['Việc gây ra: ' + name], hint: 'Chi tiết ở sheet Log. Thông báo tự mất khi việc này chạy lại thành công.' });
  if (!changed && ENTRY_POINT_LOG_ON_CHANGE.indexOf(name) >= 0) { return; }
  logEvent({ source: source, action: name, outcome: LOG_ERROR, reason: errorMessage(err), detail: Object.assign({ code: err && err.code ? String(err.code) : '' }, err && err.detail && typeof err.detail === 'object' ? err.detail : {}, { stack: err && err.stack ? String(err.stack) : '(không có stack)' }) });
}

/**
 * Đuôi `runEntryPoint` gắn vào thông báo lỗi khi lỗi đã nằm trong sheet `Log` (vừa nhả ra Sheet, hoặc là lỗi lặp của cửa vào tự gọi đã ghi từ lần trước).
 * Vì sao cần: `withFailureHandler` của Sidebar nhận cả lỗi Google chặn trước khi code chạy (chưa cấp quyền, trình duyệt nhiều tài khoản), và lúc đó chưa có dòng Log nào. Chỉ thông báo lỗi đi được tới Sidebar, nên dấu phải nằm trong chữ. Sidebar đọc dấu qua `SIDEBAR_SERVER_DATA.entry`, không chép lại chuỗi.
 */
var ENTRY_LOGGED_MARK = ' [đã ghi vào sheet Log]';
var SIDEBAR_SERVER_DATA_PROVIDERS = typeof SIDEBAR_SERVER_DATA_PROVIDERS !== 'undefined' ? SIDEBAR_SERVER_DATA_PROVIDERS : {};
SIDEBAR_SERVER_DATA_PROVIDERS.entry = function () { return { loggedMark: ENTRY_LOGGED_MARK }; };

/** Gắn dấu đã ghi Log; cửa vào lồng nhau không gắn hai lần. */
function entryMarkLogged(err) {
  var message = String(err.message || '');
  if (message.slice(-ENTRY_LOGGED_MARK.length) !== ENTRY_LOGGED_MARK) { err.message = message + ENTRY_LOGGED_MARK; }
  return err;
}

/** Cửa vào chạy thành công: gỡ thông báo lỗi của nó; có gỡ thì ghi một dòng hết lỗi. Kho đã nằm trong bản đọc của lần gọi nên lượt không có lỗi cũ không tốn lệnh ghi nào. */
function entryRecover(name, source) {
  var previous = noticeResolve('entry_failure', name);
  if (previous) { logEvent({ source: source, action: name, outcome: LOG_OK, reason: 'Đã hết lỗi: ' + previous.title }); }
}

/**
 * Chạy phần ruột của một cửa vào trong vỏ bọc chuẩn.
 *
 * `name` là tên hành động ghi vào cột `Hành động` của sheet `Log` và là phạm vi của thông báo lỗi. `source` là nguồn theo bảng ở tài liệu 10 Phần 3. Không có tham số kênh: lõi không biết kênh nào sẽ hiện lỗi, mọi cửa vào báo qua cổng thông báo (tài liệu 01 mục 1.4).
 *
 * **Không tự lấy `LockService`.** Khóa lấy ở tầng nghiệp vụ, nơi biết mình sắp ghi gì; lấy khóa ở đây là lấy khóa cho cả những lượt chỉ đọc, và khóa của dự án không tái nhập nên một lượt đọc giữ khóa sẽ chặn đúng lượt ghi đang chờ nó.
 */
/**
 * Phạm vi riêng của một nhánh nghiệp vụ quanh mỗi cửa vào, đăng ký theo `source`: `{ begin(), end(), boundary(stage, name, error) }`. Nhánh nào cần thì tự đăng ký ở tệp của nhánh đó; lõi không đoán theo tên hàm và không biết nhánh nào tồn tại.
 * Khai báo dạng `var ... typeof` vì GAS nạp tệp không theo thứ tự cố định: tệp đăng ký có thể chạy trước tệp này.
 */
var ENTRY_POINT_SCOPES = typeof ENTRY_POINT_SCOPES !== 'undefined' ? ENTRY_POINT_SCOPES : {};

function runEntryPoint(name, source, fn) {
  var scope = Object.prototype.hasOwnProperty.call(ENTRY_POINT_SCOPES, source) ? ENTRY_POINT_SCOPES[source] : null;
  // Mốc đo DEV (server/dev/FbmPerfProbe.js); gỡ thư mục dev thì hàm không tồn tại và dòng này không làm gì. Tham số thứ tư là đối số gốc của cửa vào.
  var perf = typeof devPerfBegin === 'function' ? devPerfBegin(name, arguments[3]) : null;
  var failed = false, thrown = null, result;
  // Bản đọc DocumentProperties sống đúng một lần gọi (server/state/DocumentStore.js): mở đầu tiên, đóng cuối cùng (sau `flushLog`). Phạm vi riêng của nhánh mở trước mốc đầu tiên để mốc đó cũng được gom.
  documentStoreBegin();
  pendingChangesBegin();
  if (scope) { scope.begin(); scope.boundary('gas_entered', name); }
  try {
    result = fn();
    // Kết quả `ok: false` là cửa vào báo lại lỗi cũ chứ chưa hết lỗi.
    if (!(result && result.ok === false)) { entryRecover(name, source); }
    return result;
  } catch (caught) {
    // Giá trị ném không phải đối tượng thì không gắn được dấu vào thông báo; bọc lại để mọi lỗi đi cùng một hợp đồng. Không dùng `instanceof Error`: lỗi từ ngữ cảnh khác (dịch vụ Google, hộp test) vẫn là lỗi.
    var err = caught && typeof caught === 'object' ? caught : new Error(String(caught));
    failed = true;
    thrown = err;
    if (scope) { scope.boundary('gas_failed', name, err); }
    entryFail(name, source, err);
    throw err;
  } finally {
    // Ghi nhận thay đổi trước khi nhả log, kể cả khi lần chạy đã lỗi sau khi ghi một phần: dữ liệu đã xuống Sheet thì Sidebar phải được báo. Ghi nhận hỏng thì ghi Log và báo người dùng; lần chạy đang thành công thì thành lỗi, nhưng chỉ ném sau khi Log đã nhả.
    var closeErr = null;
    try {
      pendingChangesEnd();
    } catch (basketErr) {
      if (failed) {
        logEvent({ source: source, action: name, outcome: LOG_ERROR, reason: errorMessage(basketErr), detail: { stack: basketErr && basketErr.stack ? String(basketErr.stack) : '(không có stack)' } });
      } else {
        failed = true;
        entryFail(name, source, basketErr);
        closeErr = basketErr;
      }
    }
    // Đóng phạm vi nhánh (ghi trace, dòng Log nhánh dồn tới cuối lời gọi) trước lần nhả Log duy nhất, để dòng Log nó sinh ra cũng ra Sheet. Đóng hỏng thì báo như lỗi cửa vào nhưng không đổi kết quả: việc của lời gọi đã xong.
    try {
      if (scope) {
        if (!failed) { scope.boundary('gas_returned', name); }
        try { scope.end(); } catch (endErr) { entryFail(name, source, endErr); }
      }
      flushLog();
      // Log đã ra Sheet mới gắn dấu; `flushLog` ném thì lỗi của nó thay lỗi gốc và không mang dấu, nên Sidebar sẽ tự ghi.
      if (thrown) { entryMarkLogged(thrown); }
      if (closeErr) { entryMarkLogged(closeErr); }
    } finally {
      documentStoreEnd();
      if (perf) { devPerfEnd(perf, failed); }
    }
    if (closeErr) { throw closeErr; }
  }
}

/** Phép nghiệm thu chạy được trên Google: chạy một cửa vào thành công và một cửa vào ném lỗi, rồi kiểm dòng log đã ra sheet chưa. */
function probeEntryPoint() {
  var report = [];
  var truoc = logGateWriteCount();

  var ok = runEntryPoint('probeEntryPoint', 'core', function () { return 'chạy xong'; });
  report.push('Cửa vào chạy xuôi trả về: "' + ok + '"');

  var daNem = false;
  try {
    runEntryPoint('probeEntryPointLoi', 'core', function () {
      throw new Error('Lỗi cố ý của probeEntryPoint — không phải sự cố thật.');
    });
  } catch (err) {
    daNem = true;
    report.push('Cửa vào có lỗi đã ném lại (không nuốt): ' + errorMessage(err));
  }

  report.push('Có ném lại không? ' + daNem + ' (phải là true)');

  // Lỗi cố ý đã mở thông báo trên Sidebar; chạy lại cùng việc cho thành công để đường tự gỡ thật dọn nó, không để thông báo giả treo mãi.
  runEntryPoint('probeEntryPointLoi', 'core', function () { return 'chạy lại xong'; });
  var conTreo = noticeList().some(function (notice) { return notice.topic === 'entry_failure' && notice.scope === 'probeEntryPointLoi'; });
  report.push('Chạy lại thành công đã gỡ thông báo lỗi cố ý? ' + !conTreo + ' (phải là true)');
  report.push('Số lệnh ghi sheet Log tăng thêm: ' + (logGateWriteCount() - truoc) + ' (mỗi lượt gọi runEntryPoint nhả một lần)');

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
