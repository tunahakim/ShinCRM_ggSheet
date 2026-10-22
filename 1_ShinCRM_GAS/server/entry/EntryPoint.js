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
  logEvent({ source: source, action: name, outcome: LOG_ERROR, reason: errorMessage(err), detail: { stack: err && err.stack ? String(err.stack) : '(không có stack)' } });
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
function runEntryPoint(name, source, fn) {
  var trace = typeof fbmTraceBoundary === 'function' && /^fbm/i.test(String(name || ''));
  // Mốc đo DEV (server/dev/FbmPerfProbe.js); gỡ thư mục dev thì hàm không tồn tại và dòng này không làm gì. Tham số thứ tư là đối số gốc của cửa vào.
  var perf = typeof devPerfBegin === 'function' ? devPerfBegin(name, arguments[3]) : null;
  var failed = false, result;
  // Bản đọc DocumentProperties sống đúng một lần gọi (server/state/DocumentStore.js): mở đầu tiên, đóng cuối cùng (sau `flushLog`). Phạm vi riêng của đồng bộ FBM (gom trace) mở trước mốc trace đầu tiên để mốc đó cũng được gom.
  documentStoreBegin();
  pendingChangesBegin();
  var buffered = trace && typeof fbmCallBegin === 'function';
  if (buffered) { fbmCallBegin(); }
  if (trace) { fbmTraceBoundary('gas_entered', name); }
  try {
    result = fn();
    // Kết quả `ok: false` là cửa vào báo lại lỗi cũ chứ chưa hết lỗi.
    if (!(result && result.ok === false)) { entryRecover(name, source); }
    return result;
  } catch (err) {
    failed = true;
    if (trace) { fbmTraceBoundary('gas_failed', name, err); }
    entryFail(name, source, err);
    throw err;
  } finally {
    // Ghi nhận thay đổi trước khi nhả log, kể cả khi lần chạy đã lỗi sau khi ghi một phần: dữ liệu đã xuống Sheet thì Sidebar phải được báo. Ghi nhận hỏng thì ghi Log và báo người dùng; lần chạy đang thành công thì thành lỗi.
    try {
      pendingChangesEnd();
    } catch (basketErr) {
      if (failed) {
        logEvent({ source: source, action: name, outcome: LOG_ERROR, reason: errorMessage(basketErr), detail: { stack: basketErr && basketErr.stack ? String(basketErr.stack) : '(không có stack)' } });
      } else {
        failed = true;
        entryFail(name, source, basketErr);
        throw basketErr;
      }
    }
    if (trace) { fbmTraceBoundary('before_flush', name); }
    try {
      flushLog();
    } finally {
      if (trace) { fbmTraceBoundary('after_flush', name); if (!failed) { fbmTraceBoundary('gas_returned', name); } }
      try { if (buffered) { fbmCallEnd(); } } finally { documentStoreEnd(); }
      if (perf) { devPerfEnd(perf, failed); }
    }
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
  report.push('Số lệnh ghi sheet Log tăng thêm: ' + (logGateWriteCount() - truoc) + ' (mỗi lượt gọi runEntryPoint nhả một lần)');

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
