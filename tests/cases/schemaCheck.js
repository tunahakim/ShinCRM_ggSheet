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
  check(so, 'nói ra đủ bốn phép kiểm bị bỏ qua khi thiếu đầu vào', ketQua.skipped.length, 4);

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
    hop.checkSchema({ dataSchema: hop.DATA_SCHEMA, categoryCodes: maCategory }).skipped.length, 3);

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
}

module.exports = { chay };
