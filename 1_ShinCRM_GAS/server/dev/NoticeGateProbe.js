/**
 * Nghiệm thu DEV cổng thông báo trên DocumentProperties thật: phát, phát lại cùng nội dung không ghi, đổi nội dung, gỡ, bỏ, và đo phí một lần `getProperties()` lạnh (phí mà `runEntryPoint` trả khi kiểm gỡ thông báo ở lượt không đụng kho).
 * Chỉ dùng phạm vi riêng `probeNoticeGate`, tự dọn khóa của mình.
 */
function probeNoticeGate() {
  var report = [];
  var real = documentStoreReal();
  var started = Date.now();
  var all = real.getProperties();
  report.push('getProperties lạnh: ' + (Date.now() - started) + ' ms, ' + Object.keys(all).length + ' khóa');

  documentStoreBegin();
  try {
    var input = { topic: 'entry_failure', scope: 'probeNoticeGate', source: 'core', title: 'Lỗi thử của probeNoticeGate, không phải lỗi thật.', lines: ['Việc gây ra: probeNoticeGate'] };
    report.push('Phát lần đầu (true): ' + noticeRaise(input));
    report.push('Phát lại cùng nội dung (false): ' + noticeRaise(input));
    report.push('Đổi nội dung (true): ' + noticeRaise(Object.assign({}, input, { title: 'Lỗi thử đổi nội dung.' })));
    var mine = noticeList().filter(function (notice) { return notice.scope === 'probeNoticeGate'; });
    report.push('Có trong danh sách: ' + mine.length + ' · ' + JSON.stringify(mine[0]));
    var resolved = noticeResolve('entry_failure', 'probeNoticeGate');
    report.push('Gỡ trả câu cũ: ' + (resolved && resolved.title));
    report.push('Gỡ lần hai (null): ' + noticeResolve('entry_failure', 'probeNoticeGate'));
    noticeRaise(input);
    report.push('Bấm ✕ (true): ' + noticeDismiss(noticeKey('entry_failure', 'probeNoticeGate')));
  } finally {
    documentStoreEnd();
  }
  report.push('Khóa còn sót trong kho thật: ' + JSON.stringify(real.getProperty(NOTICE_KEY_PREFIX + noticeKey('entry_failure', 'probeNoticeGate'))));
  report.forEach(function (line) { Logger.log(line); });
  return report;
}
