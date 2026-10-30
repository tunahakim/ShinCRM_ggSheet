/**
 * Cửa vào từ phía người dùng: thực đơn trên thanh menu của Sheet, và lệnh mở sidebar. Tài liệu 04 Phần 3, tài liệu 10 Phần 8.
 *
 * **Tên tệp khi đẩy lên Google là cả đường dẫn.** `client/Sidebar.html` ở máy trở thành tệp tên `client/Sidebar` trên Google, nên mọi lời gọi `createTemplateFromFile` và `include` phải ghi đủ đường dẫn, không được ghi tên cụt. Ghi tên cụt là lỗi đã từng xảy ra ở dự án cũ, và nó chỉ lộ ra lúc chạy thật chứ không lộ lúc đẩy code.
 *
 * **Luồng mở tệp dựng menu và mở sidebar.** `onOpen` là trigger đơn (simple trigger — trigger Google tự gọi, chạy với quyền hạn hẹp) nên chỉ dựng thực đơn; `shinAutoShowSidebar` là trigger cài đặt có quyền UI để mở sidebar. Cả hai không ghép việc phụ vào đây. Lệnh menu không bật hộp thoại báo lỗi: lỗi đi qua cổng thông báo (`runEntryPoint`) và Sidebar hiện khi đọc `notices`.
 */

/** Tên thực đơn trên thanh menu. */
var MENU_TITLE = 'ShinCRM';

/**
 * Trigger đơn Google gọi mỗi lần tệp được mở. Chỉ dựng menu vì trigger đơn không có quyền `Ui.showSidebar`.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU_TITLE)
    .addItem('Mở bảng làm việc', 'shinShowSidebar')
    .addSeparator()
    .addItem('Tạo sheet quản trị mới…', 'shinCreateViewSheet')
    .addItem('Làm mới dữ liệu sheet quản trị đang mở', 'shinRenderCurrentView')
    .addItem('Chuẩn bị sheet quản trị', 'shinPrepareCurrentView')
    .addItem('Bảng tra nhanh cú pháp lọc', 'shinShowFilterQuickReference')
    .addToUi();

}

/** Trigger cài đặt mở sidebar khi tệp được mở. Lỗi hiện ở Sidebar lần mở sau qua cổng thông báo. */
function shinAutoShowSidebar() {
  return runEntryPoint('shinAutoShowSidebar', 'core', sidebarOpen);
}

/**
 * Người điều phối mở Sidebar: đảm bảo trigger của chủ tệp rồi dựng khung.
 * Cài trigger hỏng không chặn việc mở Sidebar: lỗi đi qua cổng thông báo và ghi Log khi thông báo mới xuất hiện hoặc đổi nội dung, để mỗi lần mở không ghi trùng một dòng. Người khác chủ tệp không gỡ được thông báo, vì họ không thấy trigger của chủ tệp.
 */
function sidebarOpen() {
  try {
    var result = triggersEnsure();
    if (!result.skipped) { noticeResolve('trigger_setup', ''); }
  } catch (err) {
    var changed = noticeRaise({ topic: 'trigger_setup', scope: '', source: 'core', title: errorMessage(err), lines: ['Sửa trực tiếp trên Sheet sẽ không tự cập nhật vào Sidebar cho tới khi trigger được cài.'], hint: 'Chủ tệp mở lại Sidebar để thử cài lại. Chi tiết ở sheet Log.' });
    if (changed) { logEvent({ source: 'core', action: 'triggersEnsure', outcome: LOG_ERROR, reason: errorMessage(err), detail: { code: err && err.code ? String(err.code) : '', stack: err && err.stack ? String(err.stack) : '(không có stack)' } }); }
  }
  return sidebarShow();
}

function shinRenderCurrentView(source) {
  return runEntryPoint('shinRenderCurrentView', source === 'sidebar' ? 'sidebar' : 'core', function () {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    // Lỗi vẽ đã vào sổ vẽ và Log; Sidebar hiện khối lỗi khi đứng ở sheet đó, dù lượt vẽ chạy từ menu hay từ Sidebar.
    return renderViewSheet(sheet.getName());
  });
}

function shinPrepareCurrentView() {
  return runEntryPoint('shinPrepareCurrentView', 'core', function () {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    return prepareViewSheet(sheet.getName());
  });
}

function shinCreateViewSheet() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt('Tạo sheet quản trị mới', 'Nhập tên sheet. ShinCRM sẽ tự thêm dấu ! ở đầu nếu bạn không nhập.', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) { return { ok: false, cancelled: true }; }
  return runEntryPoint('shinCreateViewSheet', 'core', function () {
    return createViewSheet(answer.getResponseText());
  });
}

function shinShowFilterQuickReference() {
  return runEntryPoint('shinShowFilterQuickReference', 'core', function () {
    // Hiện ở Sidebar qua cổng thông báo, không bật hộp thoại (Tài liệu 10 Phần 8).
    noticeRaise({ topic: 'filter_reference', scope: '', source: 'core', title: 'Bảng tra nhanh cú pháp lọc', lines: FILTER_QUICK_REFERENCE.split('\n') });
    return true;
  });
}

/**
 * Lệnh menu mở sidebar, qua cùng người điều phối với trigger mở tệp.
 *
 * Hàm này **không nạp dữ liệu**. Nó chỉ dựng khung; sidebar tự gọi `loadCore` qua `google.script.run` sau khi khung đã hiện. Tách như vậy vì thời gian nạp thuộc về sidebar, nơi có chỗ vẽ chỉ báo tiến trình — còn nếu nạp ở đây thì người dùng bấm menu rồi ngồi nhìn một khoảng trống vài giây không có gì báo là hệ thống đang chạy.
 */
function shinShowSidebar() {
  return runEntryPoint('shinShowSidebar', 'core', sidebarOpen);
}

/** Dựng khung sidebar và hiện nó. Dùng chung cho lệnh menu và trigger mở tệp. */
function sidebarShow() {
  var html = HtmlService.createTemplateFromFile('client/Sidebar')
    .evaluate()
    .setTitle(MENU_TITLE);
  SpreadsheetApp.getUi().showSidebar(html);
  return true;
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
