const { dungHop, ghiO, TEP_NEN } = require('../lib/dung-hop');
const { trongLanChay } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

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

/** Trigger gắn cờ ô điều khiển cho một sheet `!` như khi người dùng sửa ô điều khiển. */
function gắnCờ(hop, name) {
  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ viewSheets: [name] }));
}

function tieuDe(result) {
  return (result.problems || []).map((problem) => problem.title);
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
    [result.ok, result.rows, [base.view.getRange(4, 1).getValue(), base.view.getRange(5, 1).getValue()].sort()],
    [true, 2, ['KH0001', 'KH0002']]);
  base.view.getRange(4, 1, 2, 2).setValues([['Dữ liệu sửa tay', 'Không phải nguồn'], ['Dòng cũ', 'Cũng không phải nguồn']]);
  base.nen.hop.renderViewSheet('!Lead');
  check(so, 'lượt vẽ không đọc ngược hàng 4 trở xuống làm nguồn sự thật',
    [base.view.getRange(4, 1).getValue(), base.view.getRange(5, 1).getValue()].sort(), ['KH0001', 'KH0002']);
  check(so, 'lượt vẽ không bật toast nhỏ ở Sheet và luôn nhả khóa', [base.nen.dem.toast, base.nen.stubs._khoa.dangGiu], [0, false]);

  // Vẽ đè: lọc thu hẹp còn một dòng, dòng thừa được ghi rỗng trong cùng lệnh ghi, không có lệnh xóa riêng.
  base.view.getRange(3, 2).setValue('Hai');
  const writesBefore = base.nen.dem.setValues;
  const narrowed = base.nen.hop.renderViewSheet('!Lead');
  check(so, 'vẽ đè: một dải cột là đúng một lệnh ghi, dòng thừa sau khi lọc thu hẹp thành ô rỗng',
    [narrowed.rows, base.view.getRange(4, 1).getValue(), base.view.getRange(5, 1, 1, 5).getValues()[0], base.nen.dem.setValues - writesBefore],
    [1, 'KH0002', ['', '', '', '', ''], 1]);
  base.view.getRange(3, 2).setValue('');
  base.nen.hop.renderViewSheet('!Lead');

  // Sổ vẽ: cũ/mới theo revision từng sheet, cờ ô điều khiển.
  const views = taoNen(['@CUS_MA_KH', '@CUS_TEN_CTY']);
  const hop = views.nen.hop;
  gieoHaiKhach(views.nen);
  const care = views.nen.book.insertSheet('!Chăm sóc');
  care.getRange(1, 1, 1, 2).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY']]);
  hop.renderViewSheet('!Lead');
  hop.renderViewSheet('!Chăm sóc');
  check(so, 'không còn đường vẽ mọi sheet quản trị một lượt', [typeof hop.renderAllManagedViews, typeof hop.inspectViewState], ['undefined', 'undefined']);
  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ customer: ['KH0001'], allViews: true }));
  check(so, 'signal dữ liệu kho làm mọi view thành cũ', [hop.viewIsStale('!Lead'), hop.viewIsStale('!Chăm sóc')], [true, true]);
  hop.renderViewSheet('!Lead');
  check(so, '(a) vẽ sheet A sau signal: A mới, B vẫn cũ', [hop.viewIsStale('!Lead'), hop.viewIsStale('!Chăm sóc')], [false, true]);
  const realPlan = hop.viewRenderPlan;
  hop.viewRenderPlan = function () {
    hop.reloadJournalAppend({ customer: ['KH0002'], allViews: true });
    return realPlan.apply(null, arguments);
  };
  const midRender = hop.renderViewSheet('!Chăm sóc');
  hop.viewRenderPlan = realPlan;
  check(so, '(b) revision tăng giữa lúc vẽ: lượt vẽ vẫn ghi xong nhưng sheet vẫn cũ',
    [midRender.ok, hop.viewIsStale('!Chăm sóc'), hop.viewIsStale('!Lead')], [true, true, true]);
  check(so, 'renderViewIfDirty vẽ sheet cũ, rồi lần sau bỏ qua',
    [hop.renderViewIfDirty('!Chăm sóc').skipped, hop.renderViewIfDirty('!Chăm sóc').skipped], [undefined, true]);
  gắnCờ(hop, '!Chăm sóc');
  check(so, 'cờ ô điều khiển làm đúng sheet đó cũ, không chạm sheet khác, không tô cam',
    [hop.viewIsStale('!Chăm sóc'), hop.viewLedgerEntry('!Chăm sóc').controls, hop.viewLedgerEntry('!Lead').controls, care.getTabColor()],
    [true, true, undefined, null]);
  const flagged = hop.renderViewIfDirty('!Chăm sóc');
  check(so, 'cờ ô điều khiển làm lời gọi kế tiếp vẽ lại và tắt cờ',
    [flagged.skipped, flagged.ok, hop.viewLedgerEntry('!Chăm sóc').controls, hop.viewIsStale('!Chăm sóc')], [undefined, true, undefined, false]);
  gắnCờ(hop, '!Mới chưa vẽ');
  check(so, 'cờ cho sheet chưa có mục không thêm mục rỗng vào sổ', hop.viewLedgerEntry('!Mới chưa vẽ'), null);
  hop.documentLockRun(() => hop.viewLedgerPrune(['!Lead']));
  check(so, 'dọn sổ bỏ tên không còn là sheet quản trị', [!!hop.viewLedgerEntry('!Lead'), hop.viewLedgerEntry('!Chăm sóc')], [true, null]);

  // Lỗi chặn vẽ: không chạm sheet, báo bằng khối, không note.
  const formula = taoNen(['@CUS_MA_KH', '@CUS_TEN_CTY', 'Ghi chú thường', '@CUS_SDT']);
  gieoHaiKhach(formula.nen);
  formula.nen.hop.renderViewSheet('!Lead');
  formula.view.getRange(5, 2).setFormula('=UPPER(A5)');
  formula.view.getRange(6, 4).setFormula('=A4');
  formula.view.getRange(4, 3).setValue('ghi chú tay');
  formula.view.getRange(3, 1).setValue('60..50');
  const beforeFormula = formula.view.getRange(4, 1, 3, 4).getValues();
  const formulaWrites = formula.nen.dem.setValues;
  const blocked = formula.nen.hop.renderViewSheet('!Lead');
  const formulaBlock = blocked.problems.filter((problem) => problem.title.indexOf('công thức') >= 0)[0];
  check(so, 'nhiều loại lỗi cùng lúc: mỗi loại một khối có tiêu đề và chi tiết',
    [blocked.ok, tieuDe(blocked).length, tieuDe(blocked)[0].indexOf('lọc') >= 0, blocked.problems[0].lines[0].indexOf('Ô A3') === 0], [false, 2, true, true]);
  check(so, 'lỗi công thức liệt kê theo cột: cột, số thứ tự, mã cột',
    formulaBlock.lines, ['Cột B, stt: 2, Mã cột: @CUS_TEN_CTY', 'Cột D, stt: 4, Mã cột: @CUS_SDT']);
  check(so, 'lỗi chặn vẽ không ghi ô nào, không đặt note nào, sheet vẫn cũ',
    [formula.view.getRange(4, 1, 3, 4).getValues(), formula.nen.dem.setValues - formulaWrites, formula.view.getRange(3, 2).getNote(), formula.nen.dem.setNotes || 0, formula.nen.hop.viewIsStale('!Lead')],
    [beforeFormula, 0, '', 0, true]);
  const again = formula.nen.hop.renderViewIfDirty('!Lead');
  check(so, 'đường Sidebar sau lượt hỏng: không thử lại, trả lại đúng các khối lỗi, không ghi sheet quản trị',
    [again.ok, again.skipped, tieuDe(again), formula.view.getRange(4, 1, 3, 4).getValues()], [false, true, tieuDe(blocked), beforeFormula]);
  formula.view.getRange(5, 2).setValue('');
  formula.view.getRange(6, 4).setValue('');
  formula.view.getRange(3, 1).setValue('');
  check(so, 'gỡ lỗi mà chưa có cờ (trigger chưa chạy) thì đường Sidebar vẫn bỏ qua', formula.nen.hop.renderViewIfDirty('!Lead').skipped, true);
  gắnCờ(formula.nen.hop, '!Lead');
  const fixed = formula.nen.hop.renderViewIfDirty('!Lead');
  check(so, 'trigger gắn cờ sau khi gỡ lỗi thì vẽ lại, sheet mới', [fixed.ok, fixed.problems, formula.nen.hop.viewIsStale('!Lead')], [true, [], false]);

  base.view.getRange(3, 5).setValue('60..50');
  base.view.getRange(3, 5).setNote('ghi chú riêng');
  base.view.getRange(4, 5).setValue('giữ nguyên');
  const badFilter = base.nen.hop.renderViewSheet('!Lead');
  check(so, 'cú pháp lọc sai dừng trước khi đụng sheet, chỉ đúng ô và nội dung lỗi',
    [badFilter.ok, badFilter.problems[0].lines[0].indexOf('Ô E3 (@ACT_GIA_TRI_HD)') === 0, badFilter.problems[0].lines[0].indexOf('Giá trị đầu lớn hơn') >= 0, base.view.getRange(4, 5).getValue()],
    [false, true, true, 'giữ nguyên']);
  check(so, 'lỗi lọc không đụng note người dùng và khóa được nhả', [base.view.getRange(3, 5).getNote(), base.nen.stubs._khoa.dangGiu], ['ghi chú riêng', false]);
  base.view.getRange(3, 5).setValue('');
  base.view.getRange(3, 3).setNote('⛔ ShinCRM: lỗi cũ\n\nGhi chú trước đó:\nghi chú của tôi');
  base.view.getRange(3, 4).setNote('⛔ ShinCRM: lỗi cũ không có ghi chú');
  const prepared = base.nen.hop.prepareViewSheet('!Lead');
  check(so, 'chuẩn bị view tự thêm đủ hai cột điều khiển còn thiếu và không trùng mã',
    [prepared.addedColumns, base.view.getRange(1, 1, 1, 2).getValues()[0], base.view.getRange(2, 1, 1, 2).getValues()[0]],
    [['@VIEW_SORT_COL', '@VIEW_SORT_LEVEL'], ['@VIEW_SORT_COL', '@VIEW_SORT_LEVEL'], ['Sắp xếp — mã cột', 'Sắp xếp — chiều']]);
  check(so, 'chuẩn bị dọn note ⛔ cũ (trả lại ghi chú người dùng), gắn bảng tra nhanh ô chưa có note, giữ note riêng',
    [base.view.getRange(3, 5).getNote(), base.view.getRange(3, 6).getNote().includes('SẮP XẾP:'), base.view.getRange(3, 7).getNote(), base.view.getRange(3, 1).getNote().indexOf('Chọn mã cột') === 0],
    ['ghi chú của tôi', true, 'ghi chú riêng', true]);
  check(so, 'dropdown sắp xếp chỉ phủ đúng 10 cấp từ hàng 4 đến 13',
    [base.view.getRange(4, 1).getDataValidation().criteria, base.view.getRange(13, 1).getDataValidation().criteria, base.view.getRange(14, 1).getDataValidation()],
    ['VALUE_IN_LIST', 'VALUE_IN_LIST', null]);
  const notesBefore = base.nen.dem.setNotes || 0;
  const labelWrites = base.nen.dem.setValues;
  check(so, 'chuẩn bị lần hai không thêm cột, không ghi note, không ghi nhãn vì không có gì đổi',
    [base.nen.hop.prepareViewSheet('!Lead').addedColumns, (base.nen.dem.setNotes || 0) - notesBefore, base.nen.dem.setValues - labelWrites, base.nen.stubs._khoa.dangGiu], [[], 0, 0, false]);
  const fresh = taoNen(['@CUS_MA_KH', 'Ghi chú thường', '@ACT_NGAY_LAM_VIEC']);
  fresh.nen.hop.prepareViewSheet('!Lead');
  check(so, 'chuẩn bị view đặt khuôn chữ cho hàng lọc dưới cột @ trước lượt vẽ đầu, không đụng cột thường và cột điều khiển',
    [3, 4, 5, 1].map((column) => fresh.view.getRange(3, column).getNumberFormat() === fresh.nen.hop.COLUMN_FORMAT_TEXT), [true, false, true, false]);

  base.view.getRange(14, 1, 1, 2).setValues([['@CUS_TEN_CTY', 'Tăng dần (A → Z)']]);
  check(so, 'chỉ đọc 10 cặp sắp xếp từ hàng 4 đến 13, bỏ qua hàng 14', base.nen.hop.viewControls(base.view).sortPairs.length, 10);

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
  sort.view.getRange(5, 3).setValue('@CUS_TEN_CTY');
  check(so, 'hàng sắp xếp thiếu một vế mà vế còn lại hợp lệ thì không phải lỗi', sort.nen.hop.renderViewSheet('!Lead').ok, true);
  sort.view.getRange(5, 3).setValue('@CUS_KHONG_CO');
  const halfBad = sort.nen.hop.renderViewSheet('!Lead');
  check(so, 'hàng sắp xếp thiếu một vế mà vế còn lại sai thì là lỗi sắp xếp của sheet',
    [halfBad.ok, tieuDe(halfBad), halfBad.problems[0].lines], [false, ['Quy tắc sắp xếp của sheet sai (hai cột sắp xếp, hàng 4–13)'], ['Không tìm thấy cột @CUS_KHONG_CO trong kho dữ liệu.']]);

  const missing = taoNen(['@CUS_MA_KH', '@CUS_KHONG_CO']);
  gieoHaiKhach(missing.nen);
  missing.view.getRange(4, 1, 1, 2).setValues([['cũ', 'không được xóa']]);
  const missingResult = missing.nen.hop.renderViewSheet('!Lead');
  check(so, 'mã CUS trên view không tồn tại trong kho thành khối lỗi hàng 1, chưa chạm ô nào, khóa được nhả',
    [missingResult.ok, tieuDe(missingResult), missingResult.problems[0].lines[0].indexOf('@CUS_KHONG_CO') >= 0, missing.view.getRange(4, 1, 1, 2).getValues(), missing.nen.stubs._khoa.dangGiu],
    [false, ['Hàng mã cột (hàng 1) sai'], true, [['cũ', 'không được xóa']], false]);

  const missingSort = taoNen(['@CUS_MA_KH']);
  gieoHaiKhach(missingSort.nen);
  ghiO(missingSort.nen, 'Config', 4, '@CFG_COT_MA', '@CUS_KHONG_CO');
  ghiO(missingSort.nen, 'Config', 4, '@CFG_COT_KIEU', 'TEXT');
  ghiO(missingSort.nen, 'Config', 4, '@CFG_SORT_COL', '@CUS_KHONG_CO');
  ghiO(missingSort.nen, 'Config', 4, '@CFG_SORT_LEVEL', 'Tăng dần (A → Z)');
  missingSort.view.getRange(4, 1).setValue('cũ');
  const missingSortResult = missingSort.nen.hop.renderViewSheet('!Lead');
  check(so, 'Sheet Schema không làm mã sort chung vắng trong kho thành hợp lệ; lỗi xảy ra trước khi ghi',
    [tieuDe(missingSortResult), missingSort.view.getRange(4, 1).getValue()], [['Sắp xếp chung trong Config sai'], 'cũ']);

  const duplicate = taoNen(['@CUS_MA_KH', '@CUS_MA_KH']);
  duplicate.view.getRange(4, 1, 1, 2).setValues([['cũ 1', 'cũ 2']]);
  const duplicateResult = duplicate.nen.hop.renderViewSheet('!Lead');
  check(so, 'mã @ trùng ở hàng 1 bị chặn trước khi vẽ và không xóa dữ liệu đang có',
    [duplicateResult.problems[0].lines[0].indexOf('xuất hiện hai lần') >= 0, duplicate.view.getRange(4, 1, 1, 2).getValues()], [true, [['cũ 1', 'cũ 2']]]);

  const created = dungHop({ sheets: ['Customer', 'Activity', 'Config', 'Category', 'Log'], tep: TEP_VIEW });
  const newView = created.hop.createViewSheet('Tổng quan');
  const newHeaders = created.book.getSheetByName('!Tổng quan').getRange(1, 1, 1, 13).getValues()[0];
  check(so, 'tạo view tự thêm dấu ! và dùng trường từ DATA_SCHEMA, gồm ghi chú khách, vẽ ngay và có mục trong sổ',
    [newView.sheetName, newView.ok, newHeaders, !!created.hop.viewLedgerEntry('!Tổng quan')],
    ['!Tổng quan', true, ['@VIEW_SORT_COL', '@VIEW_SORT_LEVEL', created.hop.DATA_SCHEMA.customer.id.code, created.hop.DATA_SCHEMA.customer.companyName.code,
      created.hop.DATA_SCHEMA.customer.contactPerson.code, created.hop.DATA_SCHEMA.customer.phone.code, created.hop.DATA_SCHEMA.customer.verifyStatus.code,
      created.hop.DATA_SCHEMA.customer.note.code, created.hop.DATA_SCHEMA.activity.workDate.code, created.hop.DATA_SCHEMA.activity.taskType.code,
      created.hop.DATA_SCHEMA.activity.content.code, created.hop.DATA_SCHEMA.activity.priority.code, created.hop.DATA_SCHEMA.activity.dueAt.code], true]);
}

function demLog(nen, text) {
  const log = nen.book.getSheetByName('Log');
  if (!log || log.getLastRow() < 1) { return 0; }
  return log.getRange(1, 1, log.getLastRow(), 9).getValues().filter((row) => JSON.stringify(row).indexOf(text) >= 0).length;
}

/** Vòng điều khiển phải hội tụ: lượt vẽ hỏng không được tự thử lại, ghi Log ở mỗi lần Sidebar bị đánh thức. */
function chaySoTrangThai(so) {
  section('ViewLedger — lượt vẽ hỏng không tự đánh thức thành vòng lặp');
  let t;
  try { t = taoNen(['@CUS_MA_KH', '@CUS_TEN_CTY', '@ACT_NGAY_LAM_VIEC']); } catch (err) { return ghiLoiNap(so, 'nạp ViewLedger', err); }
  const hop = t.nen.hop;
  gieoHaiKhach(t.nen);
  gieoHaiGiaoDich(t.nen);
  hop.renderViewSheet('!Lead');
  const loiDau = () => { hop.flushLog(); return demLog(t.nen, '60..50'); };

  t.view.getRange(3, 2).setValue('60..50');
  gắnCờ(hop, '!Lead');
  const first = hop.renderViewIfDirty('!Lead');
  check(so, 'lượt có cờ đầu tiên gặp ô lọc sai thì trả khối lỗi chỉ đúng ô (không ném) và ghi một dòng Log',
    [first.ok, first.problems[0].lines[0].indexOf('Ô B3') === 0, loiDau()], [false, true, 1]);

  const writes = t.nen.dem.setValues;
  const again = hop.renderViewIfDirty('!Lead');
  check(so, 'đánh thức lại với cùng dữ liệu: không thử, không Log, không ghi Sheet; trả lại khối lỗi để Sidebar hiện',
    [again.ok, again.skipped, again.problems.length, loiDau(), t.nen.dem.setValues - writes], [false, true, 1, 1, 0]);

  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ customer: ['KH0001'], allViews: true }));
  check(so, 'dữ liệu kho đổi thì thử lại; lỗi y hệt không thêm dòng Log', [hop.renderViewIfDirty('!Lead').skipped, loiDau()], [undefined, 1]);

  const entry = hop.viewLedgerEntry('!Lead');
  hop.viewLedgerWrite('!Lead', Object.assign({}, entry, { at: entry.at - hop.SETTINGS.VIEW_FAILED_RETRY_MS }));
  check(so, 'lượt hỏng quá VIEW_FAILED_RETRY_MS thì tự thử lại một lần, lượt kế tiếp lại bỏ qua',
    [hop.renderViewIfDirty('!Lead').skipped, hop.renderViewIfDirty('!Lead').skipped], [undefined, true]);
  check(so, 'bấm làm mới luôn thử dù sổ nói lượt trước đã hỏng', hop.renderViewSheet('!Lead').skipped, undefined);

  t.view.getRange(3, 2).setValue('70..80');
  gắnCờ(hop, '!Lead');
  hop.renderViewIfDirty('!Lead');
  hop.flushLog();
  check(so, 'lỗi khác nội dung thì ghi một dòng Log mới', demLog(t.nen, '70..80'), 1);

  t.view.getRange(3, 2).setValue('');
  gắnCờ(hop, '!Lead');
  const fixed = hop.renderViewIfDirty('!Lead');
  hop.flushLog();
  check(so, 'sửa ô lọc rồi có cờ thì vẽ lại, sheet mới, Log ghi một dòng hết lỗi',
    [fixed.ok, fixed.rows, hop.viewIsStale('!Lead'), demLog(t.nen, 'hết lỗi')], [true, 2, false, 1]);

  // Ô lọc bị Sheets tự đổi thành ngày trước khi hàng lọc có khuôn chữ.
  t.view.getRange(3, 3).setValue(new Date(2026, 2, 3));
  gắnCờ(hop, '!Lead');
  const dated = hop.renderViewIfDirty('!Lead');
  check(so, 'ô lọc kiểu ngày lọc đúng ngày người gõ, được ghi lại thành chữ, hàng lọc có khuôn chữ',
    [dated.ok, dated.rows, t.view.getRange(4, 1).getValue(), t.view.getRange(3, 3).getValue(), t.view.getRange(3, 3).getNumberFormat()],
    [true, 1, 'KH0002', '2026-03-03', hop.COLUMN_FORMAT_TEXT]);
  check(so, 'ghi lại chữ do chính GAS ghi nên không sinh lượt vẽ thứ hai', hop.renderViewIfDirty('!Lead').skipped, true);
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
  const vẽHết = () => { hop.renderViewSheet('!Lead'); hop.renderViewSheet('!Chăm sóc'); };
  vẽHết();
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

  const realPlan = hop.viewRenderPlan;
  hop.viewRenderPlan = function () { trongLanChay(hop, () => hop.dirtyStateMarkSignal({ customer: ['KH0002'], allViews: true })); return realPlan.apply(this, arguments); };
  hop.renderViewSheet('!Chăm sóc');
  hop.viewRenderPlan = realPlan;
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
  vẽHết();
  hop.viewRenderPlan = function () { throw new Error('lượt vẽ thử hỏng'); };
  const hong = hop.renderViewSheet('!Chăm sóc');
  hop.viewRenderPlan = realPlan;
  check(so, 'lỗi ngoài dự kiến cũng thành khối lỗi, tô cam sheet đó, sheet khác vẫn giữ màu',
    [hong.ok, tieuDe(hong), hong.problems[0].lines, hop.viewIsStale('!Chăm sóc'), care.getTabColor(), base.view.getTabColor()],
    [false, ['Lỗi khi vẽ sheet'], ['lượt vẽ thử hỏng'], true, '#ff9900', null]);
  hop.renderViewSheet('!Chăm sóc');
  check(so, 'vẽ lại thành công sau lượt hỏng trả đúng màu gốc', care.getTabColor(), '#00ff00');

  // Lưu từ Sidebar khi đứng ở sheet ! và công tắc bật: sheet đang xem sẽ được vẽ ngay nên không tô.
  vẽHết();
  base.nen.book.setActiveSheet(base.view);
  const luuSidebar = (source) => trongLanChay(hop, () => hop.writeCommitAfterSuccess({ source: source, surface: 'record', entity: 'customer', recordIds: ['KH0001'] }));
  luuSidebar('user');
  check(so, 'lưu từ Sidebar, công tắc bật: không tô sheet ! đang xem, vẫn tô sheet ! khác', [base.view.getTabColor(), care.getTabColor()], [null, '#ff9900']);
  vẽHết();
  hop.userPrefsWrite('autoRenderView', false);
  luuSidebar('user');
  const tatNum = [base.view.getTabColor(), care.getTabColor()];
  hop.userPrefsWrite('autoRenderView', true);
  vẽHết();
  luuSidebar('pull');
  check(so, 'công tắc tắt, hoặc lượt ghi nền (đồng bộ) thì tô cả sheet đang đứng',
    [tatNum, [base.view.getTabColor(), care.getTabColor()]], [['#ff9900', '#ff9900'], ['#ff9900', '#ff9900']]);
}

module.exports = { chay: (so) => { chay(so); chaySoTrangThai(so); chayTabCam(so); } };
