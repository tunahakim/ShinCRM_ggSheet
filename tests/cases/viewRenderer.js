const { dungHop, ghiO, TEP_NEN } = require('../lib/dung-hop');
const { trongLanChay } = require('../lib/load-gas');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

const TEP_VIEW = TEP_NEN.concat([
  'server/view/FilterMessages.js',
  'server/view/FilterParser.js',
  'server/view/SortSpec.js',
  'server/view/ViewSheetSetup.js',
  'server/view/ViewSheetRenderer.js'
]);

function taoNen(headers) {
  const nen = dungHop({
    sheets: ['Customer', 'Activity', 'Config', 'Category', 'Log'],
    tep: TEP_VIEW
  });
  const view = nen.book.insertSheet('!Lead');
  view.getRange(1, 1, 1, headers.length).setValues([headers]);
  return { nen, view };
}

function gieoHaiKhach(nen) {
  ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'KH0001');
  ghiO(nen, 'Customer', 4, '@CUS_TEN_CTY', 'Mot');
  ghiO(nen, 'Customer', 5, '@CUS_MA_KH', 'KH0002');
  ghiO(nen, 'Customer', 5, '@CUS_TEN_CTY', 'Hai');
}

function gieoHaiGiaoDich(nen) {
  ghiO(nen, 'Activity', 4, '@ACT_MA_GD', 'GD0001');
  ghiO(nen, 'Activity', 4, '@ACT_MA_KH', 'KH0001');
  ghiO(nen, 'Activity', 4, '@ACT_NGAY_LAM_VIEC', '2026-03-01');
  ghiO(nen, 'Activity', 4, '@ACT_CONG_VIEC', 'Email');
  ghiO(nen, 'Activity', 5, '@ACT_MA_GD', 'GD0002');
  ghiO(nen, 'Activity', 5, '@ACT_MA_KH', 'KH0001');
  ghiO(nen, 'Activity', 5, '@ACT_NGAY_LAM_VIEC', '2026-03-02');
  ghiO(nen, 'Activity', 5, '@ACT_CONG_VIEC', 'Gọi điện');
  ghiO(nen, 'Activity', 5, '@ACT_TT_BAN_GHI', 'deleted');
  ghiO(nen, 'Activity', 6, '@ACT_MA_GD', 'GD0003');
  ghiO(nen, 'Activity', 6, '@ACT_MA_KH', 'KH0002');
  ghiO(nen, 'Activity', 6, '@ACT_NGAY_LAM_VIEC', '2026-03-03');
  ghiO(nen, 'Activity', 6, '@ACT_CONG_VIEC', 'Email');
}

function chay(so) {
  section('ViewSheetRenderer — giao dịch sống gần nhất, cột động, lọc và sắp');
  let base;
  try {
    base = taoNen(['@CUS_MA_KH', '@CUS_TEN_CTY', '@ACT_NGAY_LAM_VIEC', '@ACT_CONG_VIEC', '@ACT_GIA_TRI_HD', 'Ghi chú thường']);
  } catch (err) { return ghiLoiNap(so, 'nạp ViewSheetRenderer', err); }
  gieoHaiKhach(base.nen);
  gieoHaiGiaoDich(base.nen);

  const result = base.nen.hop.renderViewSheet('!Lead');
  check(so, 'khách có giao dịch mới đã xóa mềm dùng lần sống trước đó', base.view.getRange(4, 4).getValue(), 'Email');
  check(so, 'khách chưa có giao dịch vẫn có thể hiện thành dòng',
    [result.rows, [base.view.getRange(4, 1).getValue(), base.view.getRange(5, 1).getValue()].sort()],
    [2, ['KH0001', 'KH0002']]);
  base.view.getRange(4, 1, 2, 2).setValues([['Dữ liệu sửa tay', 'Không phải nguồn'], ['Dòng cũ', 'Cũng không phải nguồn']]);
  base.nen.hop.renderViewSheet('!Lead');
  check(so, 'lượt vẽ không đọc ngược hàng 4 trở xuống làm nguồn sự thật',
    [base.view.getRange(4, 1).getValue(), base.view.getRange(5, 1).getValue()].sort(), ['KH0001', 'KH0002']);
  check(so, 'lượt vẽ không bật toast nhỏ ở Sheet và luôn nhả khóa', [base.nen.dem.toast, base.nen.stubs._khoa.dangGiu], [0, false]);

  const allViews = taoNen(['@CUS_MA_KH', '@CUS_TEN_CTY']);
  gieoHaiKhach(allViews.nen);
  const secondView = allViews.nen.book.insertSheet('!Chăm sóc');
  secondView.getRange(1, 1, 1, 2).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY']]);
  secondView.getRange(3, 2).setValue('60..50');
  const managed = allViews.nen.hop.renderAllManagedViews();
  const managedByName = {};
  managed.results.forEach((item) => { managedByName[item.sheetName] = item; });
  check(so, 'renderer thử tiếp mọi view và trả kết quả từng sheet khi một view lỗi',
    [managed.ok, managedByName['!Lead'].ok, managedByName['!Chăm sóc'].ok, managed.failed.length],
    [false, true, false, 1]);
  check(so, 'view lỗi vẫn cũ, view vẽ được thành mới, lỗi được ghi vào Log',
    [allViews.view.getRange(4, 1).getValue(), allViews.nen.hop.viewIsStale('!Lead'), allViews.nen.hop.viewIsStale('!Chăm sóc'),
      allViews.nen.hop.LOG_BUFFER.some((line) => JSON.stringify(line).indexOf('renderView') >= 0)],
    ['KH0002', false, true, true]);
  secondView.getRange(3, 2).setValue('');
  allViews.nen.hop.renderAllManagedViews(['!Chăm sóc']);

  // Mô hình cũ/mới theo revision từng sheet.
  trongLanChay(allViews.nen.hop, () => allViews.nen.hop.dirtyStateMarkSignal({ customer: ['KH0001'], allViews: true }));
  check(so, 'signal dữ liệu kho làm mọi view thành cũ', [allViews.nen.hop.viewIsStale('!Lead'), allViews.nen.hop.viewIsStale('!Chăm sóc')], [true, true]);
  allViews.nen.hop.renderViewSheet('!Lead');
  check(so, '(a) vẽ sheet A sau signal: A mới, B vẫn cũ', [allViews.nen.hop.viewIsStale('!Lead'), allViews.nen.hop.viewIsStale('!Chăm sóc')], [false, true]);
  const realGuard = allViews.nen.hop.viewAssertNoFormulas;
  allViews.nen.hop.viewAssertNoFormulas = function () {
    allViews.nen.hop.reloadJournalAppend({ customer: ['KH0002'], allViews: true });
    return realGuard.apply(null, arguments);
  };
  const midRender = allViews.nen.hop.renderViewSheet('!Chăm sóc');
  allViews.nen.hop.viewAssertNoFormulas = realGuard;
  check(so, '(b) revision tăng giữa lúc vẽ: lượt vẽ vẫn ghi xong nhưng sheet vẫn cũ',
    [midRender.ok, allViews.nen.hop.viewIsStale('!Chăm sóc'), allViews.nen.hop.viewIsStale('!Lead')], [true, true, true]);
  secondView.getRange(3, 2).setValue('60..50');
  try { allViews.nen.hop.renderViewSheet('!Chăm sóc'); } catch (ignore) {}
  check(so, '(c) lượt vẽ ném lỗi thì sheet vẫn cũ', allViews.nen.hop.viewIsStale('!Chăm sóc'), true);
  secondView.getRange(3, 2).setValue('');
  check(so, 'sửa lại ô lọc vừa làm hỏng lượt vẽ thì đường lấy metadata (controlsOnly) vẽ lại ngay, sheet thành mới',
    [allViews.nen.hop.renderViewIfDirty('!Chăm sóc', { controlsOnly: true }).skipped, allViews.nen.hop.viewIsStale('!Chăm sóc')], [undefined, false]);
  trongLanChay(allViews.nen.hop, () => allViews.nen.hop.dirtyStateMarkSignal({ customer: ['KH0002'], allViews: true }));
  check(so, 'đường lấy metadata (controlsOnly) không vẽ sheet cũ khi bộ điều khiển không đổi, sheet vẫn cũ',
    [allViews.nen.hop.renderViewIfDirty('!Chăm sóc', { controlsOnly: true }).skipped, allViews.nen.hop.viewIsStale('!Chăm sóc')], [true, true]);
  check(so, 'renderViewIfDirty vẽ sheet cũ dù bộ điều khiển không đổi, rồi lần sau bỏ qua',
    [allViews.nen.hop.renderViewIfDirty('!Chăm sóc').skipped, allViews.nen.hop.renderViewIfDirty('!Chăm sóc').skipped], [undefined, true]);

  // Bộ vẽ không được xóa công thức người dùng đặt trong cột ShinCRM tự vẽ.
  const formula = taoNen(['@CUS_MA_KH', '@CUS_TEN_CTY', 'Ghi chú thường']);
  gieoHaiKhach(formula.nen);
  formula.nen.hop.renderViewSheet('!Lead');
  formula.view.getRange(5, 2).setFormula('=UPPER(A5)');
  formula.view.getRange(4, 3).setValue('ghi chú tay');
  const beforeFormula = formula.view.getRange(4, 1, 2, 3).getValues();
  const writesBefore = formula.nen.dem.setValues;
  trongLanChay(formula.nen.hop, () => formula.nen.hop.dirtyStateMarkSignal({ customer: ['KH0001'], allViews: true }));
  checkThrows(so, 'gặp công thức trong cột @ từ hàng 4 thì dừng với lỗi chỉ đúng ô', () => formula.nen.hop.renderViewSheet('!Lead'), 'ô B5');
  check(so, 'không xóa hay ghi ô nào của sheet, gắn note ⛔ ở ô hàng lọc của cột đó, sheet vẫn cũ',
    [formula.view.getRange(4, 1, 2, 3).getValues(), formula.nen.dem.setValues - writesBefore, formula.view.getRange(3, 2).getNote().indexOf('⛔ ShinCRM:') === 0,
      formula.view.getRange(3, 2).getNote().indexOf('B5') >= 0, formula.nen.hop.viewIsStale('!Lead')],
    [beforeFormula, 0, true, true, true]);
  const sidebarAgain = formula.nen.hop.renderViewIfDirty('!Lead');
  check(so, 'đường Sidebar sau lượt hỏng vì công thức: không thử lại, trả lỗi cũ chỉ đúng ô kèm metadata, không ghi Sheet',
    [sidebarAgain.ok, sidebarAgain.skipped, sidebarAgain.error.indexOf('ô B5') >= 0, sidebarAgain.viewMeta.filterColumns, formula.nen.dem.setValues - writesBefore],
    [false, true, true, [1, 2], 0]);
  formula.view.getRange(5, 2).setValue('');
  const afterBlocker = formula.nen.hop.renderViewIfDirty('!Lead');
  check(so, 'gỡ công thức ở ô chặn thì đường Sidebar tự vẽ lại (dấu vân tay không đổi) và tự gỡ note ⛔',
    [afterBlocker.ok, afterBlocker.skipped, formula.view.getRange(3, 2).getNote(), formula.nen.hop.viewIsStale('!Lead')], [true, undefined, '', false]);

  check(so, 'metadata chỉ nhận cột có mã @ ở hàng lọc', result.viewMeta.filterColumns, [1, 2, 3, 4, 5]);
  base.view.getRange(3, 6).setValue('chữ dưới cột thường');
  check(so, 'đổi hàng 3 dưới cột thường không làm dấu vân tay view thay đổi', base.nen.hop.renderViewIfDirty('!Lead').skipped, true);

  check(so, 'đầu vào không đổi thì chỉ đọc metadata, không vẽ thừa', base.nen.hop.renderViewIfDirty('!Lead').skipped, true);
  base.view.getRange(3, 2).setValue('Hai');
  const beforeRender = base.nen.hop.inspectViewState('!Lead', base.nen.hop.viewLedgerEntry('!Lead').revision);
  check(so, 'cửa kiểm nhẹ nhận ra đầu vào đổi nhưng chưa tự vẽ', [beforeRender.changed, beforeRender.needsRender], [false, true]);
  const afterFilter = base.nen.hop.renderViewIfDirty('!Lead');
  check(so, 'hàng lọc đổi trước khi trigger chạy vẫn bị dấu vân tay phát hiện và dựng view mới',
    [afterFilter.rows, base.view.getRange(4, 1).getValue()],
    [1, 'KH0002']);
  check(so, 'lượt vẽ phủ lại cả dòng dữ liệu cũ thừa sau khi filter thu hẹp',
    base.view.getRange(5, 1, 1, 5).getValues()[0], ['', '', '', '', '']);
  check(so, 'vẽ xong tăng phiên bản để sidebar biết view đã đổi', afterFilter.viewMeta.revision > result.viewMeta.revision, true);
  base.view.getRange(3, 2).setValue('');
  base.nen.hop.renderViewIfDirty('!Lead');

  base.view.getRange(3, 5).setValue('60..50');
  base.view.getRange(3, 5).setNote('ghi chú riêng');
  base.view.getRange(4, 5).setValue('giữ nguyên');
  checkThrows(so, 'cú pháp lọc sai dừng trước khi đụng sheet', () => base.nen.hop.renderViewSheet('!Lead'), 'Giá trị đầu lớn hơn');
  check(so, 'nội dung cũ còn nguyên khi cú pháp lọc sai', base.view.getRange(4, 5).getValue(), 'giữ nguyên');
  check(so, 'lỗi lọc được neo vào đúng ô mà không làm mất note người dùng',
    [base.view.getRange(3, 5).getNote().indexOf('⛔ ShinCRM:') === 0, base.view.getRange(3, 5).getNote().includes('ghi chú riêng')], [true, true]);
  check(so, 'khóa được nhả cả khi parser ném lỗi', base.nen.stubs._khoa.dangGiu, false);
  base.view.getRange(3, 5).setValue('');
  base.nen.hop.renderViewSheet('!Lead');
  check(so, 'vẽ thành công chỉ xóa note lỗi và trả lại note người dùng', base.view.getRange(3, 5).getNote(), 'ghi chú riêng');
  const prepared = base.nen.hop.prepareViewSheet('!Lead');
  check(so, 'chuẩn bị view tự thêm đủ hai cột điều khiển còn thiếu và không trùng mã',
    [prepared.addedColumns, base.view.getRange(1, 1, 1, 2).getValues()[0]],
    [['@VIEW_SORT_COL', '@VIEW_SORT_LEVEL'], ['@VIEW_SORT_COL', '@VIEW_SORT_LEVEL']]);
  check(so, 'lệnh chuẩn bị gắn bảng tra nhanh đầy đủ vào ô hàng 3 chưa có note',
    base.view.getRange(3, 3).getNote().includes('SẮP XẾP:'), true);
  check(so, 'dropdown sắp xếp chỉ phủ đúng 10 cấp từ hàng 4 đến 13',
    [base.view.getRange(4, 1).getDataValidation().criteria, base.view.getRange(13, 1).getDataValidation().criteria, base.view.getRange(14, 1).getDataValidation()],
    ['VALUE_IN_LIST', 'VALUE_IN_LIST', null]);
  check(so, 'chuẩn bị lần hai không thêm cột điều khiển trùng',
    base.nen.hop.prepareViewSheet('!Lead').addedColumns, []);
  const fresh = taoNen(['@CUS_MA_KH', 'Ghi chú thường', '@ACT_NGAY_LAM_VIEC']);
  fresh.nen.hop.prepareViewSheet('!Lead');
  check(so, 'chuẩn bị view đặt khuôn chữ cho hàng lọc dưới cột @ trước lượt vẽ đầu, không đụng cột thường và cột điều khiển',
    [3, 4, 5, 1].map((column) => fresh.view.getRange(3, column).getNumberFormat() === fresh.nen.hop.COLUMN_FORMAT_TEXT), [true, false, true, false]);

  base.view.getRange(14, 1, 1, 2).setValues([['@CUS_TEN_CTY', 'Tăng dần (A → Z)']]);
  check(so, 'parser cục bộ dùng cùng trần 10 cấp nên bỏ qua hàng 14',
    base.nen.hop.viewReadSortPairs(base.view, base.nen.hop.viewHeaderMap(base.nen.hop.viewSetupHeader(base.view), '!Lead'), 4, 14).length, 10);

  const leadingZero = taoNen(['@CUS_MST']);
  ghiO(leadingZero.nen, 'Customer', 4, '@CUS_MA_KH', 'KH0001');
  ghiO(leadingZero.nen, 'Customer', 4, '@CUS_MST', '0100000658');
  leadingZero.nen.hop.renderViewSheet('!Lead');
  check(so, 'cột chữ trên view được đặt khuôn trước khi ghi nên giữ nguyên số 0 đầu',
    [leadingZero.view.getRange(4, 1).getValue(), leadingZero.view.getRange(4, 1).getNumberFormat()],
    ['0100000658', '@']);

  const custom = taoNen(['@CUS_MA_KH', '@CUS_DOANH_THU']);
  gieoHaiKhach(custom.nen);
  const customCol = custom.nen.Customer.codes.length + 1;
  custom.nen.Customer.sheet.getRange(1, customCol).setValue('@CUS_DOANH_THU');
  custom.nen.Customer.sheet.getRange(4, customCol).setValue('20');
  custom.nen.Customer.sheet.getRange(5, customCol).setValue('3');
  ghiO(custom.nen, 'Config', 4, '@CFG_COT_MA', '@CUS_DOANH_THU');
  ghiO(custom.nen, 'Config', 4, '@CFG_COT_KIEU', 'NUMBER');
  ghiO(custom.nen, 'Config', 4, '@CFG_SORT_COL', '@CUS_DOANH_THU');
  ghiO(custom.nen, 'Config', 4, '@CFG_SORT_LEVEL', 'Tăng dần (A → Z)');
  custom.nen.hop.renderViewSheet('!Lead');
  check(so, 'cột người dùng ngoài DATA_SCHEMA được chép và sắp theo kiểu Sheet Schema',
    custom.view.getRange(4, 1, 2, 2).getValues(), [['KH0002', 3], ['KH0001', 20]]);
  check(so, 'cột kho không khai kiểu mặc định là TEXT',
    custom.nen.hop.viewFieldMaps({}, ['@CUS_COT_MOI'])['@CUS_COT_MOI'].type, 'TEXT');

  const sort = taoNen(['@CUS_MA_KH', '@CUS_TEN_CTY', '@VIEW_SORT_COL', '@VIEW_SORT_LEVEL']);
  gieoHaiKhach(sort.nen);
  gieoHaiGiaoDich(sort.nen);
  ghiO(sort.nen, 'Config', 4, '@CFG_SORT_COL', '@CUS_TEN_CTY');
  ghiO(sort.nen, 'Config', 4, '@CFG_SORT_LEVEL', 'Tăng dần (A → Z)');
  sort.nen.hop.renderViewSheet('!Lead');
  check(so, 'sort chung từ Config được dùng khi sheet không có cặp riêng', sort.view.getRange(4, 1).getValue(), 'KH0002');
  sort.view.getRange(4, 3, 1, 2).setValues([['@ACT_NGAY_LAM_VIEC', 'Tăng dần (A → Z)']]);
  sort.nen.hop.renderViewSheet('!Lead');
  check(so, 'sort riêng đè Config và dùng được cột kho không hiển thị', sort.view.getRange(4, 1).getValue(), 'KH0001');

  const missing = taoNen(['@CUS_MA_KH', '@CUS_KHONG_CO']);
  gieoHaiKhach(missing.nen);
  missing.view.getRange(4, 1, 1, 2).setValues([['cũ', 'không được xóa']]);
  checkThrows(so, 'mã CUS trên view không tồn tại trong kho làm lượt vẽ thất bại',
    () => missing.nen.hop.renderViewSheet('!Lead'), '@CUS_KHONG_CO');
  check(so, 'lỗi mã nguồn xảy ra trước clearContent và khóa vẫn được nhả',
    [missing.view.getRange(4, 1, 1, 2).getValues(), missing.nen.stubs._khoa.dangGiu], [[['cũ', 'không được xóa']], false]);

  const missingSort = taoNen(['@CUS_MA_KH']);
  gieoHaiKhach(missingSort.nen);
  ghiO(missingSort.nen, 'Config', 4, '@CFG_COT_MA', '@CUS_KHONG_CO');
  ghiO(missingSort.nen, 'Config', 4, '@CFG_COT_KIEU', 'TEXT');
  ghiO(missingSort.nen, 'Config', 4, '@CFG_SORT_COL', '@CUS_KHONG_CO');
  ghiO(missingSort.nen, 'Config', 4, '@CFG_SORT_LEVEL', 'Tăng dần (A → Z)');
  missingSort.view.getRange(4, 1).setValue('cũ');
  checkThrows(so, 'Sheet Schema không làm mã sort vắng trong kho trở thành hợp lệ',
    () => missingSort.nen.hop.renderViewSheet('!Lead'), '@CUS_KHONG_CO');
  check(so, 'lỗi sort chung cũng xảy ra trước khi xóa dữ liệu', missingSort.view.getRange(4, 1).getValue(), 'cũ');

  const duplicate = taoNen(['@CUS_MA_KH', '@CUS_MA_KH']);
  duplicate.view.getRange(4, 1, 1, 2).setValues([['cũ 1', 'cũ 2']]);
  checkThrows(so, 'mã @ trùng ở hàng 1 bị chặn trước khi vẽ',
    () => duplicate.nen.hop.renderViewSheet('!Lead'), 'xuất hiện hai lần');
  check(so, 'lỗi mã trùng không xóa dữ liệu đang có', duplicate.view.getRange(4, 1, 1, 2).getValues(), [['cũ 1', 'cũ 2']]);

  const created = dungHop({ sheets: ['Customer', 'Activity', 'Config', 'Category', 'Log'], tep: TEP_VIEW });
  const newView = created.hop.createViewSheet('Tổng quan');
  const newHeaders = created.book.getSheetByName('!Tổng quan').getRange(1, 1, 1, 13).getValues()[0];
  check(so, 'tạo view tự thêm dấu ! và dùng trường từ DATA_SCHEMA, gồm ghi chú khách',
    [newView.sheetName, newHeaders],
    ['!Tổng quan', ['@VIEW_SORT_COL', '@VIEW_SORT_LEVEL', created.hop.DATA_SCHEMA.customer.id.code, created.hop.DATA_SCHEMA.customer.companyName.code,
      created.hop.DATA_SCHEMA.customer.contactPerson.code, created.hop.DATA_SCHEMA.customer.phone.code, created.hop.DATA_SCHEMA.customer.verifyStatus.code,
      created.hop.DATA_SCHEMA.customer.note.code, created.hop.DATA_SCHEMA.activity.workDate.code, created.hop.DATA_SCHEMA.activity.taskType.code,
      created.hop.DATA_SCHEMA.activity.content.code, created.hop.DATA_SCHEMA.activity.priority.code, created.hop.DATA_SCHEMA.activity.dueAt.code]]);
}

function demLog(nen, text) {
  const log = nen.book.getSheetByName('Log');
  if (!log || log.getLastRow() < 1) { return 0; }
  return log.getRange(1, 1, log.getLastRow(), 9).getValues().filter((row) => JSON.stringify(row).indexOf(text) >= 0).length;
}

/** Vòng điều khiển phải hội tụ: lượt vẽ hỏng không được tự thử lại, ghi note, ghi Log ở mỗi lần Sidebar bị đánh thức. */
function chaySoTrangThai(so) {
  section('ViewLedger — lượt vẽ hỏng không tự đánh thức thành vòng lặp');
  let t;
  try { t = taoNen(['@CUS_MA_KH', '@CUS_TEN_CTY', '@ACT_NGAY_LAM_VIEC']); } catch (err) { return ghiLoiNap(so, 'nạp ViewLedger', err); }
  const hop = t.nen.hop;
  gieoHaiKhach(t.nen);
  gieoHaiGiaoDich(t.nen);
  hop.renderViewSheet('!Lead');
  let notes = 0;
  const realNote = hop.viewSetErrorNote;
  hop.viewSetErrorNote = function () { notes += 1; return realNote.apply(null, arguments); };

  t.view.getRange(3, 2).setValue('60..50');
  checkThrows(so, 'lượt tự động đầu tiên gặp ô lọc sai thì báo lỗi chỉ đúng ô', () => hop.renderViewIfDirty('!Lead'), 'B3');
  check(so, 'lượt hỏng đầu tiên ghi một note ⛔ và một dòng Log', [notes, demLog(t.nen, '60..50')], [1, 1]);

  const writes = t.nen.dem.setValues;
  const again = hop.renderViewIfDirty('!Lead');
  const inspect = hop.inspectViewState('!Lead', hop.viewLedgerEntry('!Lead').revision);
  check(so, 'đánh thức lại với cùng dữ liệu và ô điều khiển: không thử, không note, không Log, không ghi Sheet; trả lỗi cũ kèm metadata để Sidebar thôi xin vẽ',
    [again.ok, again.skipped, !!again.error, !!again.viewMeta, inspect.needsRender, notes, demLog(t.nen, '60..50'), t.nen.dem.setValues - writes],
    [false, true, true, true, false, 1, 1, 0]);

  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ customer: ['KH0001'], allViews: true }));
  checkThrows(so, 'dữ liệu kho đổi thì thử lại và vẫn báo lỗi cho Sidebar', () => hop.renderViewIfDirty('!Lead'), 'B3');
  check(so, 'lỗi y hệt lượt trước: không ghi note lần hai, không thêm dòng Log', [notes, demLog(t.nen, '60..50')], [1, 1]);

  const entry = hop.viewLedgerEntry('!Lead');
  hop.viewLedgerWrite('!Lead', Object.assign({}, entry, { at: entry.at - hop.SETTINGS.VIEW_FAILED_RETRY_MS }));
  checkThrows(so, 'lượt hỏng quá VIEW_FAILED_RETRY_MS thì tự thử lại một lần', () => hop.renderViewIfDirty('!Lead'), 'B3');
  check(so, 'thử lại vẫn hỏng đúng lỗi cũ: lượt kế tiếp lại bỏ qua', hop.renderViewIfDirty('!Lead').skipped, true);
  checkThrows(so, 'bấm làm mới luôn thử dù sổ nói đầu vào này đã hỏng', () => hop.renderViewSheet('!Lead'), 'B3');

  t.view.getRange(3, 2).setValue('70..80');
  checkThrows(so, 'lỗi khác nội dung là chuyển trạng thái', () => hop.renderViewIfDirty('!Lead'), 'B3');
  check(so, 'lỗi mới thì ghi note mới và một dòng Log mới', [notes, demLog(t.nen, '70..80')], [2, 1]);

  t.view.getRange(3, 2).setValue('');
  const fixed = hop.renderViewIfDirty('!Lead');
  check(so, 'sửa ô lọc thì vẽ lại, gỡ note ⛔, sheet mới; Log ghi một dòng hết lỗi',
    [fixed.ok, fixed.rows, t.view.getRange(3, 2).getNote(), hop.viewIsStale('!Lead'), demLog(t.nen, 'Đã hết lỗi')], [true, 2, '', false, 1]);
  let clears = 0;
  const realClear = hop.viewClearErrorNotes;
  hop.viewClearErrorNotes = function () { clears += 1; return realClear.apply(null, arguments); };
  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ customer: ['KH0001'], allViews: true }));
  hop.renderViewIfDirty('!Lead');
  hop.viewClearErrorNotes = realClear;
  check(so, 'vẽ thành công liên tiếp không dò gỡ note lần nữa', clears, 0);

  // Ô lọc bị Sheets tự đổi thành ngày trước khi hàng lọc có khuôn chữ.
  t.view.getRange(3, 3).setValue(new Date(2026, 2, 3));
  const dated = hop.renderViewIfDirty('!Lead');
  check(so, 'ô lọc kiểu ngày lọc đúng ngày người gõ, được ghi lại thành chữ, hàng lọc có khuôn chữ',
    [dated.ok, dated.rows, t.view.getRange(4, 1).getValue(), t.view.getRange(3, 3).getValue(), t.view.getRange(3, 3).getNumberFormat()],
    [true, 1, 'KH0002', '2026-03-03', hop.COLUMN_FORMAT_TEXT]);
  check(so, 'ghi lại chữ không đổi dấu vân tay nên không sinh lượt vẽ thứ hai', hop.renderViewIfDirty('!Lead', { controlsOnly: true }).skipped, true);
}

function chayTabCam(so) {
  section('ViewTabTint — tab cam khi sheet quản trị cũ, trả màu gốc khi vẽ xong');
  let base;
  try {
    base = taoNen(['@CUS_MA_KH', '@CUS_TEN_CTY']);
  } catch (err) { return ghiLoiNap(so, 'nạp ViewTabTint', err); }
  const hop = base.nen.hop;
  gieoHaiKhach(base.nen);
  const care = base.nen.book.insertSheet('!Chăm sóc');
  care.getRange(1, 1, 1, 2).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY']]);
  hop.renderAllManagedViews();
  care.setTabColor('#00ff00');
  const ghi = () => trongLanChay(hop, () => hop.writeCommitAfterSuccess({ source: 'sidebar', surface: 'record', entity: 'customer', recordIds: ['KH0001'] }));

  ghi();
  check(so, 'chuyển sạch sang cũ: mọi sheet ! tô cam một lần, sheet kho không bị chạm',
    [base.view.getTabColor(), care.getTabColor(), base.view._tabColors.length, care._tabColors.length, base.nen.book.getSheetByName('Customer')._tabColors.length],
    ['#ff9900', '#ff9900', 1, 2, 0]);
  ghi();
  check(so, 'signal thứ hai khi sheet vẫn cũ không gọi setTabColor', [base.view._tabColors.length, care._tabColors.length], [1, 2]);

  hop.renderViewSheet('!Lead');
  check(so, 'vẽ xong trả "không màu" cho sheet vừa vẽ, sheet chưa vẽ giữ cam',
    [base.view.getTabColor(), base.view._tabColors.length, care.getTabColor()], [null, 2, '#ff9900']);

  const realGuard = hop.viewAssertNoFormulas;
  hop.viewAssertNoFormulas = function () { trongLanChay(hop, () => hop.dirtyStateMarkSignal({ customer: ['KH0002'], allViews: true })); return realGuard.apply(this, arguments); };
  hop.renderViewSheet('!Chăm sóc');
  hop.viewAssertNoFormulas = realGuard;
  check(so, 'signal đến giữa lượt vẽ để sheet vẫn cũ thì không trả màu', [hop.viewIsStale('!Chăm sóc'), care.getTabColor()], [true, '#ff9900']);
  hop.renderViewSheet('!Chăm sóc');
  check(so, 'vẽ lại xong trả đúng màu người dùng tự đặt', care.getTabColor(), '#00ff00');

  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ customer: ['KH0001'], allViews: true }));
  check(so, 'ghi nhận thay đổi cuối lần chạy (tự lấy khóa) tô lại sheet vừa thành cũ sau khi đã trả màu và nhả khóa',
    [base.view.getTabColor(), care.getTabColor(), base.nen.stubs._khoa.dangGiu], ['#ff9900', '#ff9900', false]);
  const before = base.nen.book.getSheets().map((sheet) => sheet._tabColors.length);
  trongLanChay(hop, () => {});
  check(so, 'lần chạy không có thay đổi không quét sheet nào để tô',
    base.nen.book.getSheets().map((sheet) => sheet._tabColors.length), before);

  // Mọi sheet ! đang cũ: lần ghi tiếp theo không có sheet nào chuyển trạng thái nên không được chạm Sheet để tô.
  const dem = { getTabColor: 0, getSheets: 0 };
  const realGetSheets = base.nen.book.getSheets;
  base.nen.book.getSheets = function () { dem.getSheets += 1; return realGetSheets.apply(this, arguments); };
  const realGetTab = [base.view.getTabColor, care.getTabColor];
  base.view.getTabColor = function () { dem.getTabColor += 1; return realGetTab[0](); };
  care.getTabColor = function () { dem.getTabColor += 1; return realGetTab[1](); };
  ghi();
  base.nen.book.getSheets = realGetSheets;
  base.view.getTabColor = realGetTab[0];
  care.getTabColor = realGetTab[1];
  check(so, 'lần ghi khi không có sheet ! nào đang mới không đọc màu tab, không liệt kê sheet', dem, { getTabColor: 0, getSheets: 0 });

  // Người dùng tự tô tab lúc sheet đang cũ (Google không báo): vẽ xong giữ màu đó làm màu gốc, không đè bằng màu đã cất.
  care.setTabColor('#123456');
  hop.renderViewSheet('!Chăm sóc');
  check(so, 'người dùng tự đổi màu tab lúc sheet cũ: vẽ xong giữ màu người dùng, xóa màu gốc đã cất',
    [care.getTabColor(), Object.prototype.hasOwnProperty.call(hop.viewTabTintRead(), String(care.getSheetId()))], ['#123456', false]);
  care.setTabColor('#00ff00');

  // Lượt vẽ hỏng làm sheet thành cũ (sổ vẽ ghi ok:false) nên tab phải cam, kể cả khi trước đó sheet đang mới.
  hop.renderAllManagedViews();
  const hongGuard = hop.viewAssertNoFormulas;
  hop.viewAssertNoFormulas = function () { throw new Error('lượt vẽ thử hỏng'); };
  try { hop.renderViewSheet('!Chăm sóc'); } catch (ignore) { /* lượt vẽ hỏng là điều đang thử */ }
  hop.viewAssertNoFormulas = hongGuard;
  check(so, 'lượt vẽ hỏng tô cam sheet đó, sheet khác vẫn giữ màu', [hop.viewIsStale('!Chăm sóc'), care.getTabColor(), base.view.getTabColor()], [true, '#ff9900', null]);
  hop.renderViewSheet('!Chăm sóc');
  check(so, 'vẽ lại thành công sau lượt hỏng trả đúng màu gốc', care.getTabColor(), '#00ff00');


  // Lưu từ Sidebar khi đứng ở sheet ! và công tắc bật: sheet đang xem sẽ được vẽ ngay nên không tô.
  hop.renderAllManagedViews();
  base.nen.book.setActiveSheet(base.view);
  const luuSidebar = (source) => trongLanChay(hop, () => hop.writeCommitAfterSuccess({ source: source, surface: 'record', entity: 'customer', recordIds: ['KH0001'] }));
  luuSidebar('user');
  check(so, 'lưu từ Sidebar, công tắc bật: không tô sheet ! đang xem, vẫn tô sheet ! khác', [base.view.getTabColor(), care.getTabColor()], [null, '#ff9900']);
  hop.renderAllManagedViews();
  hop.userPrefsWrite('autoRenderView', false);
  luuSidebar('user');
  const tatNum = [base.view.getTabColor(), care.getTabColor()];
  hop.userPrefsWrite('autoRenderView', true);
  hop.renderAllManagedViews();
  luuSidebar('pull');
  check(so, 'công tắc tắt, hoặc lượt ghi nền (đồng bộ) thì tô cả sheet đang đứng',
    [tatNum, [base.view.getTabColor(), care.getTabColor()]], [['#ff9900', '#ff9900'], ['#ff9900', '#ff9900']]);
}

module.exports = { chay: (so) => { chay(so); chaySoTrangThai(so); chayTabCam(so); } };
