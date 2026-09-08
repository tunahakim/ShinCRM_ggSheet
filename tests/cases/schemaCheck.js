/**
 * Nhóm ca kiểm của `checkSchema`, bộ tự kiểm bảng khai ở tài liệu 03 Phần 5.
 *
 * Hai phần, và phần thứ hai mới là phần đáng giá. Phần một: bảng khai thật phải sạch. Phần hai: mỗi luật phải thật sự bắt được lỗi khi cố tình làm hỏng một chỗ — vì một hàm kiểm chưa từng báo lỗi lần nào là một hàm chưa ai biết nó có chạy hay không.
 */

const { napServer, napClient, taoHopCat } = require('../lib/load-gas');
const { section, check, checkThrows, checkContains, ghiLoiNap } = require('../lib/assert');

/** Bản sao sâu của bảng khai, để làm hỏng một chỗ mà không đụng bản thật. Schema là dữ liệu thuần nên đi qua JSON là đủ. */
function banSao(schema) {
  return JSON.parse(JSON.stringify(schema));
}

function chay(so) {
  section('checkSchema — bộ tự kiểm bảng khai của tài liệu 03 Phần 5');

  let hop = null;
  let maCategory = null;
  try {
    hop = napServer(taoHopCat(), 'server/data/DataSchema.js', 'server/data/SheetLayout.js', 'fbm_sync/SyncSchema.js');
    napClient(hop, 'client/schema/schemaCheck.html');
    maCategory = hop.CATEGORY_COLUMNS.map((cot) => cot[0]);
  } catch (err) {
    return ghiLoiNap(so, 'nạp bảng khai và schemaCheck', err);
  }

  const ketQua = hop.checkSchema({ dataSchema: hop.DATA_SCHEMA });
  check(so, 'DATA_SCHEMA thật không có vấn đề nào', ketQua.problems, []);

  // Bảng kiểu ở tệp client là bản sao của bảng bên máy chủ. Đây là chỗ bắt lệch giữa hai bản.
  check(so, 'SCHEMA_CHECK_TYPES khớp DATA_TYPES', hop.SCHEMA_CHECK_TYPES, hop.DATA_TYPES);
  check(so, 'SCHEMA_CHECK_PRECISIONS khớp DATE_PRECISIONS', hop.SCHEMA_CHECK_PRECISIONS, hop.DATE_PRECISIONS);

  // Bỏ qua thì phải nói ra bỏ qua cái gì. Im lặng bỏ qua là cách chắc chắn nhất để có một bộ kiểm xanh mà chẳng kiểm gì.
  check(so, 'nói ra đủ sáu phép kiểm bị bỏ qua khi thiếu đầu vào', ketQua.skipped.length, 6);

  checkThrows(so, 'thiếu dataSchema thì ném lỗi chứ không trả về "không có vấn đề"',
    () => hop.checkSchema({}), 'cần dataSchema');

  /** Làm hỏng một chỗ trên bản sao rồi đòi `checkSchema` nêu ra đúng một câu chứa mẩu chữ cần thiết. */
  function batLoi(label, lamHong, mauChu) {
    const schema = banSao(hop.DATA_SCHEMA);
    lamHong(schema);
    checkContains(so, label, hop.checkSchema({ dataSchema: schema, categoryCodes: maCategory }).problems, mauChu);
  }

  batLoi('bắt được mã cột khai trùng ở hai trường',
    (s) => { s.customer.note.code = '@CUS_GHI_CHU'; s.customer.email.code = '@CUS_GHI_CHU'; }, 'khai ở hai chỗ');
  batLoi('bắt được mã cột sai dạng',
    (s) => { s.customer.email.code = '@cus.email'; }, 'sai dạng');
  batLoi('bắt được trường thiếu code',
    (s) => { delete s.customer.email.code; }, 'thiếu `code`');
  batLoi('bắt được trường thiếu label',
    (s) => { delete s.customer.email.label; }, 'thiếu `label`');
  batLoi('bắt được kiểu dữ liệu thứ năm',
    (s) => { s.customer.email.type = 'BOOLEAN'; }, 'phải là một trong');
  batLoi('bắt được SELECT có cả source lẫn options',
    (s) => { s.customer.province.options = ['Hà Nội']; }, 'có cả `source` lẫn `options`');
  batLoi('bắt được SELECT không có source cũng không có options',
    (s) => { delete s.customer.province.source; }, 'không có `source` cũng không có `options`');
  batLoi('bắt được DATE thiếu precision',
    (s) => { delete s.customer.bidClosingDate.precision; }, 'phải là day hoặc minute');
  batLoi('bắt được DATE có precision lạ',
    (s) => { s.customer.bidClosingDate.precision = 'giây'; }, 'phải là day hoặc minute');
  batLoi('bắt được trường không phải DATE mà có precision',
    (s) => { s.customer.email.precision = 'day'; }, 'không phải DATE nhưng có `precision`');
  batLoi('bắt được trường không phải SELECT mà có source',
    (s) => { s.customer.email.source = '@CAT_NHOM_KH'; }, 'không phải SELECT nhưng có');
  batLoi('bắt được source trỏ tới danh mục không có trên Category',
    (s) => { s.customer.province.source = '@CAT_KHONG_CO_THAT'; }, 'sheet Category không có mã cột đó');

  check(so, 'mọi source của DATA_SCHEMA đều trỏ tới mã có thật trên Category',
    hop.checkSchema({ dataSchema: hop.DATA_SCHEMA, categoryCodes: maCategory }).problems, []);
  check(so, 'đưa categoryCodes vào thì bớt một phép kiểm bị bỏ qua',
    hop.checkSchema({ dataSchema: hop.DATA_SCHEMA, categoryCodes: maCategory }).skipped.length, 5);

  // Ba bảng hàm soi rời nhau, vì `DEFAULTS` ở phía sidebar còn `NORMALIZERS` với `VALIDATORS` chỉ có một bản phía máy chủ. Đòi đủ cả ba mới chịu chạy — nếp cũ — thì bên nào gọi cũng thiếu, nên `normalize: 'codeLike'` gõ sai một chữ chưa từng bị ai bắt.
  const banTra = { DEFAULTS: { today: () => '' }, NORMALIZERS: { codeLike: () => '', newlineLf: () => '' }, VALIDATORS: { taxNumberFormat: () => '' } };
  check(so, 'đưa một bảng hàm thì soi đúng bảng đó, hai bảng còn lại mới bị bỏ qua',
    [hop.checkSchema({ dataSchema: hop.DATA_SCHEMA, functionTables: { DEFAULTS: banTra.DEFAULTS } }).skipped.length,
      hop.checkSchema({ dataSchema: hop.DATA_SCHEMA, functionTables: banTra }).skipped.length],
    [5, 3]);

  checkContains(so, 'tên hàm normalize gõ sai bị bắt, chứ không nằm im chờ tới chặng ghi',
    hop.checkSchema({ dataSchema: (() => { const s = banSao(hop.DATA_SCHEMA); s.customer.phone.normalize = 'codelike'; return s; })(), functionTables: banTra }).problems,
    'bảng NORMALIZERS không có hàm tên đó');

  checkContains(so, 'tên hàm validate gõ sai cũng bị bắt',
    hop.checkSchema({ dataSchema: (() => { const s = banSao(hop.DATA_SCHEMA); s.customer.taxNumber.validate = 'taxFormat'; return s; })(), functionTables: banTra }).problems,
    'bảng VALIDATORS không có hàm tên đó');

  // Luật cứng của tài liệu 02 Phần 8.1: không một cột thuần đồng bộ nào được lọt vào DATA_SCHEMA.
  // Bộ kiểm được đọc cả hai bảng; lõi thì không. Đây là chỗ duy nhất trong dự án so hai bảng với nhau.
  const maDongBo = [];
  Object.keys(hop.SYNC_SCHEMA).forEach((entity) => {
    const fields = hop.SYNC_SCHEMA[entity];
    Object.keys(fields).forEach((name) => maDongBo.push(fields[name].code));
  });

  const lotVao = [];
  Object.keys(hop.DATA_SCHEMA).forEach((entity) => {
    const fields = hop.DATA_SCHEMA[entity];
    Object.keys(fields).forEach((name) => {
      if (maDongBo.indexOf(fields[name].code) !== -1) { lotVao.push(entity + '.' + name); }
    });
  });

  check(so, 'đúng tám cột thuần đồng bộ trong SYNC_SCHEMA', maDongBo.length, 8);
  check(so, 'không một cột đồng bộ nào lọt vào DATA_SCHEMA', lotVao, []);

  section('schemaCheckUi — tên hành động, tên slot và đường dẫn trường của UI_SCHEMA');

  let hopUi = null;
  try {
    hopUi = napClient(taoHopCat(),
      'client/ui/icons.html', 'client/ui/uiBuilder.html', 'client/ui/screenBuild.html',
      'client/util/valueText.html', 'client/ui/renderEngine.html', 'client/ui/slots.html',
      'client/schema/uiSchema.html', 'client/ui/actions.html', 'client/schema/schemaCheck.html');
  } catch (err) {
    return ghiLoiNap(so, 'nạp bản khai bố cục cùng bảng hành động và bảng slot', err);
  }

  /** Đủ ba bảng khai giao diện, để phần kiểm bố cục thật sự chạy. */
  function soiUi(uiSchema) {
    return hopUi.checkSchema({ dataSchema: hop.DATA_SCHEMA, uiSchema: uiSchema, actions: hopUi.ACTIONS, slots: hopUi.SLOTS });
  }

  const uiThat = soiUi(hopUi.UI_SCHEMA);
  check(so, 'UI_SCHEMA thật không có vấn đề nào: mọi tên hành động, tên slot và đường dẫn trường đều tra được',
    uiThat.problems, []);

  // Đây là chỗ bịt lỗ của `Câu hỏi đêm.md` mục 6.4: `ingestCore` dò ba bảng giao diện bằng `typeof`, nên thiếu chúng thì phép kiểm rơi êm vào `skipped`. Phép kiểm này chốt rằng đưa đủ ba bảng vào thì nó ra khỏi `skipped` — nhờ vậy con số `skipped` mới nói được điều gì.
  check(so, 'đưa đủ ba bảng giao diện thì phần kiểm bố cục ra khỏi danh sách bỏ qua, còn lại đúng năm phép bị bỏ',
    [uiThat.skipped.length, uiThat.skipped.join(' | ').indexOf('UI_SCHEMA') !== -1], [5, false]);

  /** Làm hỏng một chỗ trên bản sao của `UI_SCHEMA` rồi đòi đúng một câu chứa mẩu chữ cần thiết. */
  function batLoiUi(label, lamHong, mauChu) {
    const ui = banSao(hopUi.UI_SCHEMA);
    lamHong(ui);
    checkContains(so, label, soiUi(ui).problems, mauChu);
  }

  batLoiUi('bắt được nút chữ trỏ tới hàm không có trong bảng ACTIONS, và gọi tên nút đúng như người dùng thấy',
    (u) => { u.customerForm.footer[0].action = 'saveFormNow'; },
    'LƯU DỮ LIỆU trỏ tới hàm "saveFormNow"');

  batLoiUi('bắt được nút glyph trỏ tới hàm không có trong bảng, và gọi tên bằng lời chỉ dẫn của nút',
    (u) => { u.view.header[3].action = 'reloadAllNow'; },
    'Nạp lại trỏ tới hàm "reloadAllNow"');

  batLoiUi('bắt được mục trong `titleActions` của card — vùng này đi qua `screenBar` đúng đường engine dùng nên cũng phải được soi',
    (u) => { u.view.body[1].titleActions[0].action = 'openActivityFormm'; },
    '"openActivityFormm"');

  batLoiUi('bắt được hành động gắn trên một trường chỉ-đọc — ô ghi chú trên form giao dịch bấm vào là mở form ghi chú',
    (u) => { u.activityForm.body[0].rows[6][0].action = 'openNoteFormm'; },
    'màn "activityForm" · customer.note trỏ tới hàm "openNoteFormm"');

  batLoiUi('bắt được mục menu trỏ tới hàm không có trong bảng, và gọi tên mục menu chứ không gọi tên nút mẹ',
    (u) => { u.view.header[4].menu[0].action = 'toggleAutoRenderViewx'; },
    'mục menu "Tự động cập nhật sheet sau khi lưu" trỏ tới hàm "toggleAutoRenderViewx"');

  batLoiUi('bắt được mục menu thiếu `action` — bấm vào không có gì xảy ra là loại lỗi im lặng nhất',
    (u) => { delete u.view.header[4].menu[0].action; },
    'mục menu "Tự động cập nhật sheet sau khi lưu" thiếu `action`');

  batLoiUi('bắt được mục menu thiếu `label`, vì nó hiện ra một dòng trắng bấm được',
    (u) => { delete u.view.header[4].menu[0].label; },
    'có mục menu thiếu `label`');

  batLoiUi('bắt được mục menu vừa là công tắc vừa mang `value`',
    (u) => { u.view.header[4].menu[0].value = 'all'; },
    'vừa là công tắc vừa mang `value`');

  batLoiUi('bắt được `menu` khai không phải mảng',
    (u) => { u.view.header[4].menu = 'khong-phai-mang'; },
    'màn "view" · Khác có `menu` không phải mảng');

  batLoiUi('bắt được mục menu không phải object',
    (u) => { u.view.header[4].menu[0] = 'Tự động cập nhật sheet sau khi lưu'; },
    'có mục menu không phải object');

  batLoiUi('bắt được tên slot gõ sai, và gọi tên card bằng tiêu đề người dùng đọc được',
    (u) => { u.view.body[1].elements = 'activityListt'; },
    'màn "view" · LỊCH SỬ LÀM VIỆC lấy nội dung từ slot "activityListt"');

  batLoiUi('bắt được trường không có trong DATA_SCHEMA, dù nó khai cụt và phải suy thực thể từ màn',
    (u) => { u.customerForm.body[0].rows[0] = ['companyNamee']; },
    'trỏ tới trường "customer.companyNamee" không có trong DATA_SCHEMA');

  batLoiUi('bắt được thực thể không có trong DATA_SCHEMA',
    (u) => { u.activityForm.body[0].rows[6] = [{ field: 'khachhang.note' }]; },
    'trỏ tới thực thể "khachhang" không có trong DATA_SCHEMA');

  batLoiUi('đường dẫn trường sai cú pháp thì kể lại lỗi của engine chứ không làm sập cả lượt kiểm',
    (u) => { u.customerForm.body[0].rows[0] = [{ field: 'a.b.c' }]; },
    'Đường dẫn trường "a.b.c" phải là');

  // Một màn không dịch được thì `schemaCheckUi` bắt lỗi rồi đi tiếp. Phép kiểm này chốt điều đó: hai màn hỏng thì hiện đủ hai câu, chứ không phải màn đầu làm im ba màn còn lại — và đó chính là lý do phần kiểm này báo cả danh sách thay vì ném lỗi ở chỗ đầu tiên.
  const uiHong = banSao(hopUi.UI_SCHEMA);
  uiHong.view.body = 'khong-phai-mang';
  delete uiHong.noteForm.entity;
  const vanHong = soiUi(uiHong).problems;
  check(so, 'một màn không dịch được không làm im các màn còn lại', [
    vanHong.filter((d) => d.indexOf('màn "view" không dịch được') === 0).length,
    vanHong.filter((d) => d.indexOf('màn "noteForm" không dịch được') === 0).length
  ], [1, 1]);
}

module.exports = { chay };
