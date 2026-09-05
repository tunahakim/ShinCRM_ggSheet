/**
 * Vỏ bọc chung của mọi cửa vào (entry point — hàm mà Google gọi để khởi động một lượt chạy). Tài liệu 10 Phần 8.
 *
 * Một lượt chạy Apps Script có ba việc phải làm ở rìa ngoài, và cả ba đều là loại việc mà quên một lần là mất dữ liệu chẩn đoán của đúng lượt chạy đáng xem nhất:
 *   1. **Nhả bộ đệm log**, kể cả khi lượt chạy đang đổ. Không nhả thì mọi dòng log của lượt đó chết trong RAM cùng lượt chạy.
 *   2. **Ghi dòng lỗi** với đủ `stack`, trước khi lỗi bay ra ngoài.
 *   3. **Hiện lỗi lên mắt người** theo kênh của đúng cửa vào đó.
 *
 * Trước khi có tệp này, việc số 1 phải gọi tay ở từng chỗ — và một luật cần người nhớ là một luật sẽ bị quên ở đúng cái cửa vào viết vội nhất. Bây giờ nó nằm trong `finally`, nên không ai phải nhớ nữa.
 *
 * **Ném lại chứ không nuốt.** Ghi log xong thì lỗi tiếp tục bay ra. Nuốt lỗi ở đây là biến một lượt chạy thất bại thành một lượt chạy trông như thành công, và với cửa sidebar thì `withFailureHandler` bên client sẽ không bao giờ chạy. Ném lại còn mua thêm email báo thực thi thất bại mà Google tự gửi.
 */

/**
 * Chạy phần ruột của một cửa vào trong vỏ bọc chuẩn.
 *
 * `name` là tên hành động ghi vào cột `Hành động` của sheet `Log`. `source` là nguồn theo bảng ở tài liệu 10 Phần 3. `channel` là kênh hiển thị theo bảng ở tài liệu 10 Phần 8, một trong `toast`, `alert`, `throw`, `pending`.
 *
 * **Không tự lấy `LockService`.** Khóa lấy ở tầng nghiệp vụ, nơi biết mình sắp ghi gì; lấy khóa ở đây là lấy khóa cho cả những lượt chỉ đọc, và khóa của dự án không tái nhập nên một lượt đọc giữ khóa sẽ chặn đúng lượt ghi đang chờ nó.
 */
function runEntryPoint(name, source, channel, fn) {
  try {
    return fn();
  } catch (err) {
    logEvent({
      source: source,
      action: name,
      outcome: LOG_ERROR,
      reason: errorMessage(err),
      detail: { stack: err && err.stack ? String(err.stack) : '(không có stack)' }
    });

    reportError(err, channel);
    throw err;
  } finally {
    flushLog();
  }
}

/** Phép nghiệm thu chạy được trên Google: chạy một cửa vào thành công và một cửa vào ném lỗi, rồi kiểm dòng log đã ra sheet chưa. */
function probeEntryPoint() {
  var report = [];
  var truoc = logGateWriteCount();

  var ok = runEntryPoint('probeEntryPoint', 'core', ERROR_CHANNEL_THROW, function () { return 'chạy xong'; });
  report.push('Cửa vào chạy xuôi trả về: "' + ok + '"');

  var daNem = false;
  try {
    runEntryPoint('probeEntryPointLoi', 'core', ERROR_CHANNEL_THROW, function () {
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
