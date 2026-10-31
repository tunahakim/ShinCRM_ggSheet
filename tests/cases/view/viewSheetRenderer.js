/** `server/view/ViewSheetRenderer.js`: vẽ sheet quản trị theo giao dịch sống gần nhất, cột động, lọc và sắp, ô điều khiển hỏng thì không vẽ. */

const { section, check, ghiLoiNap } = require('../../lib/assert');
const { taoNenView, gieoHaiKhach, gieoHaiGiaoDich, ganCoView, tieuDeVanDe, TEP_VIEW } = require('../../lib/view/nen-view');
const { dungHop, ghiO } = require('../../lib/dung-hop');
const { trongLanGoi } = require('../../lib/gas/lan-goi');

function chay(so) {
  section('ViewSheetRenderer — giao dịch sống gần nhất, cột động, lọc và sắp');
  let base;
  try {
    base = taoNenView(['@CUS_MA_KH', '@CUS_TEN_CTY', '@ACT_NGAY_LAM_VIEC', '@ACT_CONG_VIEC', '@ACT_GIA_TRI_HD', 'Ghi chú thường']);
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
  const docTruoc = Object.assign({}, base.nen.dem.doc);
  base.nen.hop.renderViewSheet('!Lead');
  const doc = base.nen.dem.doc;
  check(so, 'mỗi sheet một yêu cầu đọc: lượt vẽ tốn 3 lệnh đọc giá trị (vài hàng đầu sheet `!`, Customer, Activity; cài đặt đọc từ kho), 1 getLastRow của sheet `!`, không getLastColumn nào',
    [doc.getValues - docTruoc.getValues, doc.getLastRow - docTruoc.getLastRow, doc.getLastColumn - docTruoc.getLastColumn], [3, 1, 0]);

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
  const views = taoNenView(['@CUS_MA_KH', '@CUS_TEN_CTY']);
  const hop = views.nen.hop;
  gieoHaiKhach(views.nen);
  const care = views.nen.book.insertSheet('!Chăm sóc');
  care.getRange(1, 1, 1, 2).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY']]);
  hop.renderViewSheet('!Lead');
  hop.renderViewSheet('!Chăm sóc');
  check(so, 'không còn đường vẽ mọi sheet quản trị một lượt', [typeof hop.renderAllManagedViews, typeof hop.inspectViewState], ['undefined', 'undefined']);
  trongLanGoi(hop, () => hop.dirtyStateMarkSignal({ customer: ['KH0001'], allViews: true }));
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
  ganCoView(hop, '!Chăm sóc');
  check(so, 'cờ ô điều khiển làm đúng sheet đó cũ, không chạm sheet khác, không tô cam',
    [hop.viewIsStale('!Chăm sóc'), hop.viewLedgerEntry('!Chăm sóc').controls, hop.viewLedgerEntry('!Lead').controls, care.getTabColor()],
    [true, true, undefined, null]);
  const flagged = hop.renderViewIfDirty('!Chăm sóc');
  check(so, 'cờ ô điều khiển làm lời gọi kế tiếp vẽ lại và tắt cờ',
    [flagged.skipped, flagged.ok, hop.viewLedgerEntry('!Chăm sóc').controls, hop.viewIsStale('!Chăm sóc')], [undefined, true, undefined, false]);
  ganCoView(hop, '!Mới chưa vẽ');
  check(so, 'cờ cho sheet chưa có mục không thêm mục rỗng vào sổ', hop.viewLedgerEntry('!Mới chưa vẽ'), null);
  hop.documentLockRun(() => hop.viewLedgerPrune(['!Lead']));
  check(so, 'dọn sổ bỏ tên không còn là sheet quản trị', [!!hop.viewLedgerEntry('!Lead'), hop.viewLedgerEntry('!Chăm sóc')], [true, null]);

  // Lỗi chặn vẽ: không chạm sheet, báo bằng khối, không note.
  const formula = taoNenView(['@CUS_MA_KH', '@CUS_TEN_CTY', 'Ghi chú thường', '@CUS_SDT']);
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
    [blocked.ok, tieuDeVanDe(blocked).length, tieuDeVanDe(blocked)[0].indexOf('lọc') >= 0, blocked.problems[0].lines[0].indexOf('Ô A3') === 0], [false, 2, true, true]);
  check(so, 'lỗi công thức liệt kê theo cột: cột, số thứ tự, mã cột',
    formulaBlock.lines, ['Cột B, stt: 2, Mã cột: @CUS_TEN_CTY', 'Cột D, stt: 4, Mã cột: @CUS_SDT']);
  check(so, 'lỗi chặn vẽ không ghi ô nào, không đặt note nào, sheet vẫn cũ',
    [formula.view.getRange(4, 1, 3, 4).getValues(), formula.nen.dem.setValues - formulaWrites, formula.view.getRange(3, 2).getNote(), formula.nen.dem.setNotes || 0, formula.nen.hop.viewIsStale('!Lead')],
    [beforeFormula, 0, '', 0, true]);
  const again = formula.nen.hop.renderViewIfDirty('!Lead');
  check(so, 'đường Sidebar sau lượt hỏng: không thử lại, trả lại đúng các khối lỗi, không ghi sheet quản trị',
    [again.ok, again.skipped, tieuDeVanDe(again), formula.view.getRange(4, 1, 3, 4).getValues()], [false, true, tieuDeVanDe(blocked), beforeFormula]);
  formula.view.getRange(5, 2).setValue('');
  formula.view.getRange(6, 4).setValue('');
  formula.view.getRange(3, 1).setValue('');
  check(so, 'gỡ lỗi mà chưa có cờ (trigger chưa chạy) thì đường Sidebar vẫn bỏ qua', formula.nen.hop.renderViewIfDirty('!Lead').skipped, true);
  ganCoView(formula.nen.hop, '!Lead');
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
  const fresh = taoNenView(['@CUS_MA_KH', 'Ghi chú thường', '@ACT_NGAY_LAM_VIEC']);
  fresh.nen.hop.prepareViewSheet('!Lead');
  check(so, 'chuẩn bị view đặt khuôn chữ cho hàng lọc dưới cột @ trước lượt vẽ đầu, không đụng cột thường và cột điều khiển',
    [3, 4, 5, 1].map((column) => fresh.view.getRange(3, column).getNumberFormat() === fresh.nen.hop.COLUMN_FORMAT_TEXT), [true, false, true, false]);

  base.view.getRange(14, 1, 1, 2).setValues([['@CUS_TEN_CTY', 'Tăng dần (A → Z)']]);
  check(so, 'chỉ đọc 10 cặp sắp xếp từ hàng 4 đến 13, bỏ qua hàng 14', base.nen.hop.viewReadInputs(base.view, base.view.getName()).sortPairs.length, 10);

  const leadingZero = taoNenView(['@CUS_MST']);
  ghiO(leadingZero.nen, 'Customer', 4, '@CUS_MA_KH', 'KH0001');
  ghiO(leadingZero.nen, 'Customer', 4, '@CUS_MST', '0100000658');
  leadingZero.nen.hop.renderViewSheet('!Lead');
  check(so, 'cột chữ trên view được đặt khuôn trước khi ghi nên giữ nguyên số 0 đầu',
    [leadingZero.view.getRange(4, 1).getValue(), leadingZero.view.getRange(4, 1).getNumberFormat()],
    ['0100000658', '@']);

  const custom = taoNenView(['@CUS_MA_KH', '@CUS_DOANH_THU']);
  gieoHaiKhach(custom.nen);
  const customCol = custom.nen.Customer.codes.length + 1;
  custom.nen.Customer.sheet.getRange(1, customCol).setValue('@CUS_DOANH_THU');
  custom.nen.Customer.sheet.getRange(4, customCol).setValue('20');
  custom.nen.Customer.sheet.getRange(5, customCol).setValue('3');
  custom.nen.props['SETTINGS:core_data'] = JSON.stringify({ columnTypes: { '@CUS_DOANH_THU': 'NUMBER' }, sort: [{ col: '@CUS_DOANH_THU', level: 'asc' }] });
  custom.nen.hop.renderViewSheet('!Lead');
  check(so, 'cột người dùng ngoài DATA_SCHEMA được chép và sắp theo kiểu Sheet Schema',
    custom.view.getRange(4, 1, 2, 2).getValues(), [['KH0002', 3], ['KH0001', 20]]);
  check(so, 'cột kho không khai kiểu mặc định là TEXT',
    custom.nen.hop.viewFieldMaps({}, ['@CUS_COT_MOI'])['@CUS_COT_MOI'].type, 'TEXT');

  const sort = taoNenView(['@CUS_MA_KH', '@CUS_TEN_CTY', '@VIEW_SORT_COL', '@VIEW_SORT_LEVEL']);
  gieoHaiKhach(sort.nen);
  gieoHaiGiaoDich(sort.nen);
  sort.nen.props['SETTINGS:core_data'] = JSON.stringify({ columnTypes: {}, sort: [{ col: '@CUS_TEN_CTY', level: 'asc' }] });
  sort.nen.hop.renderViewSheet('!Lead');
  check(so, 'sắp xếp chung trong Cài đặt được dùng khi sheet không có cặp riêng', sort.view.getRange(4, 1).getValue(), 'KH0002');
  sort.view.getRange(4, 3, 1, 2).setValues([['@ACT_NGAY_LAM_VIEC', 'Tăng dần (A → Z)']]);
  sort.nen.hop.renderViewSheet('!Lead');
  check(so, 'sort riêng đè sắp xếp chung và dùng được cột kho không hiển thị', sort.view.getRange(4, 1).getValue(), 'KH0001');
  sort.view.getRange(5, 3).setValue('@CUS_TEN_CTY');
  check(so, 'hàng sắp xếp thiếu một vế mà vế còn lại hợp lệ thì không phải lỗi', sort.nen.hop.renderViewSheet('!Lead').ok, true);
  sort.view.getRange(5, 3).setValue('@CUS_KHONG_CO');
  const halfBad = sort.nen.hop.renderViewSheet('!Lead');
  check(so, 'hàng sắp xếp thiếu một vế mà vế còn lại sai thì là lỗi sắp xếp của sheet',
    [halfBad.ok, tieuDeVanDe(halfBad), halfBad.problems[0].lines], [false, ['Quy tắc sắp xếp của sheet sai (hai cột sắp xếp, hàng 4–13)'], ['Không tìm thấy cột @CUS_KHONG_CO trong kho dữ liệu.']]);

  const missing = taoNenView(['@CUS_MA_KH', '@CUS_KHONG_CO']);
  gieoHaiKhach(missing.nen);
  missing.view.getRange(4, 1, 1, 2).setValues([['cũ', 'không được xóa']]);
  const missingResult = missing.nen.hop.renderViewSheet('!Lead');
  check(so, 'mã CUS trên view không tồn tại trong kho thành khối lỗi hàng 1, chưa chạm ô nào, khóa được nhả',
    [missingResult.ok, tieuDeVanDe(missingResult), missingResult.problems[0].lines[0].indexOf('@CUS_KHONG_CO') >= 0, missing.view.getRange(4, 1, 1, 2).getValues(), missing.nen.stubs._khoa.dangGiu],
    [false, ['Hàng mã cột (hàng 1) sai'], true, [['cũ', 'không được xóa']], false]);

  const missingSort = taoNenView(['@CUS_MA_KH']);
  gieoHaiKhach(missingSort.nen);
  missingSort.nen.props['SETTINGS:core_data'] = JSON.stringify({ columnTypes: { '@CUS_KHONG_CO': 'TEXT' }, sort: [{ col: '@CUS_KHONG_CO', level: 'asc' }] });
  missingSort.view.getRange(4, 1).setValue('cũ');
  const missingSortResult = missingSort.nen.hop.renderViewSheet('!Lead');
  check(so, 'kiểu cột tự thêm không làm mã sort chung vắng trong kho thành hợp lệ; lỗi xảy ra trước khi ghi',
    [tieuDeVanDe(missingSortResult), missingSort.view.getRange(4, 1).getValue()], [['Sắp xếp chung trong Cài đặt sai'], 'cũ']);

  const duplicate = taoNenView(['@CUS_MA_KH', '@CUS_MA_KH']);
  duplicate.view.getRange(4, 1, 1, 2).setValues([['cũ 1', 'cũ 2']]);
  const duplicateResult = duplicate.nen.hop.renderViewSheet('!Lead');
  check(so, 'mã @ trùng ở hàng 1 bị chặn trước khi vẽ và không xóa dữ liệu đang có',
    [duplicateResult.problems[0].lines[0].indexOf('xuất hiện hai lần') >= 0, duplicate.view.getRange(4, 1, 1, 2).getValues()], [true, [['cũ 1', 'cũ 2']]]);

  const created = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Log'], tep: TEP_VIEW });
  const newView = created.hop.createViewSheet('Tổng quan');
  const newHeaders = created.book.getSheetByName('!Tổng quan').getRange(1, 1, 1, 13).getValues()[0];
  check(so, 'tạo view tự thêm dấu ! và dùng trường từ DATA_SCHEMA, gồm ghi chú khách, vẽ ngay và có mục trong sổ',
    [newView.sheetName, newView.ok, newHeaders, !!created.hop.viewLedgerEntry('!Tổng quan')],
    ['!Tổng quan', true, ['@VIEW_SORT_COL', '@VIEW_SORT_LEVEL', created.hop.DATA_SCHEMA.customer.id.code, created.hop.DATA_SCHEMA.customer.companyName.code,
      created.hop.DATA_SCHEMA.customer.contactPerson.code, created.hop.DATA_SCHEMA.customer.phone.code, created.hop.DATA_SCHEMA.customer.verifyStatus.code,
      created.hop.DATA_SCHEMA.customer.note.code, created.hop.DATA_SCHEMA.activity.workDate.code, created.hop.DATA_SCHEMA.activity.taskType.code,
      created.hop.DATA_SCHEMA.activity.content.code, created.hop.DATA_SCHEMA.activity.priority.code, created.hop.DATA_SCHEMA.activity.dueAt.code], true]);
}

module.exports = { chay: chay };
