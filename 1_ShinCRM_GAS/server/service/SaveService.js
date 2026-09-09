/**
 * Hai đường ghi của sidebar: `saveRecord` và `deleteRecords`. Tài liệu 06.
 *
 * Tệp này là **vỏ bọc vào ra**, không phải nơi chứa luật ghi. Luật ghi nằm ở `WriteGate.gs` và `DeleteGate.gs`; ở đây chỉ có ba việc: bọc lời gọi bằng `runEntryPoint` để một lỗi bất kỳ vẫn tới `withFailureHandler` thay vì chết im, gắn thêm khối trạng thái bẩn vào phản hồi, và đo mili giây. Giữ ranh giới đó vì hai cửa kia phải gọi được từ chỗ khác — lệnh menu, chặng đồng bộ FBM — mà những chỗ đó không có `google.script.run` và không cần khối trạng thái bẩn.
 *
 * **Vì sao `saveRecord` nhận một bản ghi mà không nhận mảng.** Sidebar chỉ có một form mở tại một thời điểm, nên một lần bấm Lưu là một bản ghi. Mở cửa nhận mảng ở tầng này là mở một đường mà giao diện không có cách nào gọi tới, và đường không ai gọi thì không ai phát hiện lúc nó hỏng. Cửa ghi bên dưới vẫn nhận mảng vì lệnh menu và chặng đồng bộ cần, và ở đó chúng gọi thẳng `writeGateSave`.
 *
 * **Vì sao phản hồi mang `dirty`.** Người dùng có thể vừa sửa tay trên sheet trước khi bấm Lưu trong sidebar. Gắn khối trạng thái bẩn vào mọi phản hồi nghĩa là client biết ngay ở lần chạm máy chủ gần nhất, không phải hỏi thêm một vòng — mà một vòng chạm máy chủ ở đây tốn hai tới năm giây tiền đi đường.
 */

/** Nguồn ghi log của mọi đường trong tệp này. Giống `LoadService.gs`: sidebar gọi qua `google.script.run` nên nguồn là `sidebar` và kênh báo lỗi là ném lại. */
var SAVE_SOURCE = 'sidebar';

/**
 * Lưu một bản ghi. `record.id` rỗng là thêm mới, có mã là sửa dòng mang mã đó.
 *
 * Trả về `{ ok: true, entity, fields, rows, dirty, ms }` khi lưu được, hoặc `{ ok: false, entity, invalid, dirty, ms }` khi có trường không đạt. `rows` là **dòng đọc lại từ sheet**, không phải bản ghi client vừa gửi — client đổ nó vào `Store.upsertRecord` nên nó phải đủ mọi trường, kể cả mấy trường máy vừa điền.
 *
 * `invalid` là mảng `{ index, id, field, label, reason }`. Client tô đỏ đúng những `field` ấy rồi cuộn tới cái đầu tiên `[RÀNG BUỘC CỨNG]` tài liệu 06 Phần 4.
 */
function saveRecord(entity, record) {
  return runEntryPoint('saveRecord', SAVE_SOURCE, 'throw', function () {
    var batDau = Date.now();
    var ra = writeGateSave({ entity: entity, records: [record], source: 'user' });

    if (ra.ok && ra.fields && ra.rows) {
      var idAt = ra.fields.indexOf('id');
      if (idAt >= 0) { dirtyStateMarkRecords(ra.rows.map(function (row) { return row[idAt]; })); }
    }
    if (ra.ok) { saveMarkViewsAndMaybeRender(); }
    ra.dirty = dirtyStateRead();
    ra.selection = selectionSnapshot();
    ra.ms = Date.now() - batDau;
    return ra;
  });
}

/**
 * Xóa một hoặc nhiều bản ghi. Nhận mảng mã vì phép hoàn tác gom mấy lần bấm Xóa liền nhau thành một lời gọi.
 *
 * Trả về `{ ok: true, entity, hard, soft, reasons, dirty, ms }`. Client bỏ mọi mã trong `hard` khỏi bộ nhớ bằng `Store.removeRecord`, ghi đè mọi dòng trong `soft` bằng `Store.upsertRecord`, rồi hiện `reasons` nếu có — mỗi câu trong đó nói vì sao một bản ghi chỉ được xóa mềm.
 *
 * Đây là đường ghi duy nhất mà mảng đi tới tầng này, và nó khác `saveRecord` ở chỗ mảng mã có nguồn thật: dải hoàn tác đếm ngược một lần cho nhiều lần bấm.
 */
function deleteRecords(entity, ids) {
  return runEntryPoint('deleteRecords', SAVE_SOURCE, 'throw', function () {
    var batDau = Date.now();
    var ra = deleteGateRemove({ entity: entity, ids: ids });

    if (ra.ok) {
      var changed = (ra.hard || []).concat(Object.keys(ra.reasons || {}));
      if (changed.length) { dirtyStateMarkRecords(changed); }
    }
    if (ra.ok) { saveMarkViewsAndMaybeRender(); }
    ra.dirty = dirtyStateRead();
    ra.selection = selectionSnapshot();
    ra.ms = Date.now() - batDau;
    return ra;
  });
}

function saveMarkViewsAndMaybeRender() {
  var book = shinOpenBook();
  var views = book.getSheets().map(function (sheet) { return sheet.getName(); }).filter(function (name) { return name.charAt(0) === '!'; });
  if (!views.length) { return; }
  dirtyStateMarkViewSheets(views);
  var prefs = userPrefsRead();
  var active = book.getActiveSheet();
  if (prefs.autoRenderView && active && views.indexOf(active.getName()) >= 0) { renderViewSheet(active.getName()); }
}

/**
 * Phép nghiệm thu chạy được trên Google: đi trọn một vòng thêm — sửa — xóa hẳn trên tệp thật, rồi tự dọn dấu vết.
 *
 * Nó **phải** tự dọn: một phép nghiệm thu để lại rác trên sheet thì lần chạy thứ hai đo trên một tệp khác lần đầu, và tới lần thứ mười thì không ai dám chạy nữa. Cuối hàm có phép kiểm rằng số hàng đã trở về đúng con số ban đầu — dọn mà không kiểm thì cũng chỉ là tin rằng đã dọn.
 *
 * Chạy bằng `node tests/gas.js probeSaveGate --push`.
 */
function probeSaveGate() {
  var report = [];
  var soHangDau = entityRowCount('customer');
  report.push('Trước khi thử: sheet Customer có ' + soHangDau + ' hàng dữ liệu');

  var them = saveRecord('customer', {
    id: '',
    companyName: 'THỬ CỬA GHI — xóa được',
    taxNumber: '0101243150',
    phone: '0912345678',
    leadSource: 'Tự tìm',
    verifyStatus: 'Chưa xác thực',
    allowFbmPush: 'Chưa cho phép'
  });
  report.push('Thêm: ok=' + them.ok + ', ' + them.ms + 'ms' + (them.ok ? '' : ', không đạt: ' + JSON.stringify(them.invalid)));
  if (!them.ok) { report.forEach(function (line) { Logger.log(line); }); return report; }

  var idAt = them.fields.indexOf('id');
  var ma = them.rows[0][idAt];
  report.push('  mã vừa cấp: ' + ma);
  report.push('  mã số thuế đọc lại: "' + them.rows[0][them.fields.indexOf('taxNumber')] + '" — còn số 0 đầu thì khuôn cột đang đúng');
  report.push('  mốc tạo đọc lại: "' + them.rows[0][them.fields.indexOf('createdAt')] + '"');

  var sua = saveRecord('customer', { id: ma, phone: '0987000111' });
  report.push('Sửa một trường: ok=' + sua.ok + ', ' + sua.ms + 'ms, điện thoại đọc lại: "' + sua.rows[0][sua.fields.indexOf('phone')] + '"');
  report.push('  tên công ty vẫn nguyên sau khi chỉ gửi một trường? ' + (sua.rows[0][sua.fields.indexOf('companyName')] === 'THỬ CỬA GHI — xóa được'));

  var trung = saveRecord('customer', { id: '', companyName: 'THỬ TRÙNG MST', taxNumber: '0101243150', leadSource: 'Tự tìm', verifyStatus: 'Chưa xác thực', allowFbmPush: 'Chưa cho phép' });
  report.push('Thêm bản ghi trùng mã số thuế: ok=' + trung.ok + ' (phải là false), lý do: ' + (trung.ok ? '(không có)' : trung.invalid[0].reason));

  var xoa = deleteRecords('customer', [ma]);
  report.push('Xóa: xóa hẳn ' + JSON.stringify(xoa.hard) + ', xóa mềm ' + Object.keys(xoa.reasons).length + ', ' + xoa.ms + 'ms');

  var soHangCuoi = entityRowCount('customer');
  report.push((soHangCuoi === soHangDau ? '✅' : '❌') + ' Sau khi dọn: ' + soHangCuoi + ' hàng, ban đầu ' + soHangDau + ' hàng');

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
