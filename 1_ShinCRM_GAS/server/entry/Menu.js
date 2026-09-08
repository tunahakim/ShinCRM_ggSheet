/**
 * Cửa vào từ phía người dùng: thực đơn trên thanh menu của Sheet, và lệnh mở sidebar. Tài liệu 04 Phần 3, tài liệu 10 Phần 8.
 *
 * **Tên tệp khi đẩy lên Google là cả đường dẫn.** `client/Sidebar.html` ở máy trở thành tệp tên `client/Sidebar` trên Google, nên mọi lời gọi `createTemplateFromFile` và `include` phải ghi đủ đường dẫn, không được ghi tên cụt. Ghi tên cụt là lỗi đã từng xảy ra ở dự án cũ, và nó chỉ lộ ra lúc chạy thật chứ không lộ lúc đẩy code.
 *
 * **`onOpen` chỉ dựng thực đơn.** Đây là trigger đơn (simple trigger — trigger Google tự gọi, chạy với quyền hạn hẹp), nên không ghép việc phụ như nhả kho lỗi vào đây. Kho lỗi được đưa qua `loadCore` khi sidebar đã có kênh hộp thoại lớn để hiển thị.
 */

/** Tên thực đơn trên thanh menu. */
var MENU_TITLE = 'ShinCRM';

/**
 * Trigger đơn Google gọi mỗi lần tệp được mở. Chỉ dựng menu; trigger nền không tự bật thông báo nhỏ của Google Sheets.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU_TITLE)
    .addItem('Mở bảng làm việc', 'shinShowSidebar')
    .addSeparator()
    .addItem('Làm mới dữ liệu sheet quản trị đang mở', 'shinRenderCurrentView')
    .addItem('Làm mới dữ liệu tất cả sheet quản trị', 'shinRenderAllViews')
    .addItem('Chuẩn bị sheet quản trị', 'shinPrepareCurrentView')
    .addItem('Bảng tra nhanh cú pháp lọc', 'shinShowFilterQuickReference')
    .addToUi();

}

function shinRenderCurrentView(source) {
  var fromSidebar = source === 'sidebar';
  return runEntryPoint('shinRenderCurrentView', fromSidebar ? 'sidebar' : 'core', fromSidebar ? ERROR_CHANNEL_THROW : ERROR_CHANNEL_ALERT, function () {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    return renderViewSheet(sheet.getName());
  });
}

function shinRenderAllViews() {
  return runEntryPoint('shinRenderAllViews', 'core', ERROR_CHANNEL_ALERT, function () {
    return renderAllViewSheets();
  });
}

function shinPrepareCurrentView() {
  return runEntryPoint('shinPrepareCurrentView', 'core', ERROR_CHANNEL_ALERT, function () {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    return prepareViewSheet(sheet.getName());
  });
}

function shinShowFilterQuickReference() {
  return runEntryPoint('shinShowFilterQuickReference', 'core', ERROR_CHANNEL_ALERT, function () {
    SpreadsheetApp.getUi().alert('Bảng tra nhanh cú pháp lọc', FILTER_QUICK_REFERENCE, SpreadsheetApp.getUi().ButtonSet.OK);
    return true;
  });
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
