/**
 * Cửa vào từ phía người dùng: thực đơn trên thanh menu của Sheet, và lệnh mở sidebar. Tài liệu 04 Phần 3, tài liệu 10 Phần 8.
 *
 * **Tên tệp khi đẩy lên Google là cả đường dẫn.** `client/Sidebar.html` ở máy trở thành tệp tên `client/Sidebar` trên Google, nên mọi lời gọi `createTemplateFromFile` và `include` phải ghi đủ đường dẫn, không được ghi tên cụt. Ghi tên cụt là lỗi đã từng xảy ra ở dự án cũ, và nó chỉ lộ ra lúc chạy thật chứ không lộ lúc đẩy code.
 *
 * **`onOpen` dựng thực đơn trước, làm mọi việc khác sau.** Đây là trigger đơn (simple trigger — trigger Google tự gọi, chạy với quyền hạn hẹp), nên vài dịch vụ có thể ném lỗi ở đây mà không ném ở chỗ khác. Nếu một việc phụ như nhả kho chờ ném lỗi trước khi thực đơn được dựng thì người dùng mất **đường vào duy nhất** của cả hệ thống — và mất đường vào thì không còn cách nào tự sửa. Nên thứ tự ở đây là một quyết định, không phải chuyện tình cờ.
 */

/** Tên thực đơn trên thanh menu. */
var MENU_TITLE = 'ShinCRM';

/**
 * Trigger đơn Google gọi mỗi lần tệp được mở.
 *
 * Dựng thực đơn xong mới nhả kho chờ, và phần nhả nằm trong vỏ bọc riêng để một lỗi ở đó không kéo theo thực đơn. Kênh hiển thị ở đây là `toast` theo bảng tài liệu 10 Phần 8, vì `getUi().alert()` không dùng được trong trigger.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU_TITLE)
    .addItem('Mở bảng làm việc', 'shinShowSidebar')
    .addToUi();

  // Nuốt lỗi ở đây là đúng, và đây là chỗ duy nhất trong dự án được nuốt: `runEntryPoint` đã ghi
  // dòng log và đã hiện toast trước khi ném, nên cái bị chặn lại chỉ là việc ném tiếp. Nếu để nó
  // ném thì mỗi lần mở tệp Google lại gắn cờ "thực thi thất bại" và gửi email, chỉ vì một việc
  // phụ — còn dòng chẩn đoán thì vẫn nằm nguyên trên sheet `Log`.
  try {
    runEntryPoint('onOpen', 'core', ERROR_CHANNEL_TOAST, function () {
      return flushPendingToast();
    });
  } catch (err) {
    // đã ghi log và đã hiện ở trong vỏ bọc
  }
}

/**
 * Mở sidebar. Đây là lệnh menu nên kênh báo lỗi là `getUi().alert()` — được phép vì chính người dùng vừa bấm.
 *
 * Hàm này **không nạp dữ liệu**. Nó chỉ dựng khung; sidebar tự gọi `loadCore` qua `google.script.run` sau khi khung đã hiện. Tách như vậy vì thời gian nạp thuộc về sidebar, nơi có chỗ vẽ chỉ báo tiến trình — còn nếu nạp ở đây thì người dùng bấm menu rồi ngồi nhìn một khoảng trống vài giây không có gì báo là hệ thống đang chạy.
 */
function shinShowSidebar() {
  return runEntryPoint('shinShowSidebar', 'core', ERROR_CHANNEL_ALERT, function () {
    var html = HtmlService.createTemplateFromFile('client/Sidebar')
      .evaluate()
      .setTitle(MENU_TITLE);

    SpreadsheetApp.getUi().showSidebar(html);
    return true;
  });
}

/**
 * Nhét nội dung một tệp html khác vào chỗ gọi, dùng trong thẻ scriptlet của template.
 *
 * Tham số là **cả đường dẫn không có đuôi**: `include('client/style/tokens')`, không phải `include('tokens')`.
 */
function include(path) {
  return HtmlService.createHtmlOutputFromFile(path).getContent();
}

/** Phép nghiệm thu chạy được trên Google: dựng khung sidebar mà không mở nó, để biết template có lỗi cú pháp hay thiếu tệp include hay không. */
function probeSidebarTemplate() {
  var report = [];
  var html = HtmlService.createTemplateFromFile('client/Sidebar').evaluate().getContent();

  report.push('Dựng được khung sidebar: ' + html.length + ' ký tự');
  ['sidebar-header', 'sidebar-progress', 'sidebar-info', 'sidebar-body', 'sidebar-footer'].forEach(function (id) {
    report.push('  có vùng ' + id + '? ' + (html.indexOf('id="' + id + '"') >= 0));
  });
  report.push('  đã nhét khối biến CSS? ' + (html.indexOf('--shin-') >= 0));
  report.push('  đã nhét kho RAM? ' + (html.indexOf('function storeReset') >= 0));

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
