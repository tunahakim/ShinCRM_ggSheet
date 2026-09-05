/**
 * Ca kiểm cho `client/schema/schemaAccess.html`: cửa đọc bảng khai trường, dựng bằng Proxy.
 *
 * Việc của nó là biến một lỗi **im lặng** thành một lỗi **ồn ào** — gõ `Schema.customer.taxNo` thì phải nổ ngay tại dòng đó, kèm tên đúng, chứ không trả `undefined` để dòng sau nổ vì một lý do khác.
 *
 * Nhưng cái bẫy này có một mép dao: ném với **mọi** tên không phải trường thì `console.log(Schema.customer)` và `JSON.stringify` cũng nổ, vì chúng hỏi những tên máy như `Symbol.toStringTag` và `toJSON`. Một cái bẫy làm sập trình gỡ lỗi là cái bẫy sẽ bị ai đó tháo ra. Nên nửa số phép kiểm ở đây canh chiều ném, nửa còn lại canh chiều **cho đi qua**.
 */

const { dungClient } = require('../lib/dung-client');
const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('Cửa đọc bảng khai — tên gõ sai phải nổ ngay tại chỗ, còn tên máy thì phải đi qua');

  let hop;
  let DATA_SCHEMA;
  try {
    hop = dungClient({ tep: ['client/schema/schemaAccess.html'] });
    // Bảng khai thật lấy từ hộp máy chủ: kiểm cửa đọc trên bảng khai giả thì chỉ kiểm được chính bảng giả đó.
    DATA_SCHEMA = dungHop().hop.DATA_SCHEMA;
  } catch (err) {
    return ghiLoiNap(so, 'nạp được client/schema/schemaAccess.html và bảng khai thật', err);
  }

  const Schema = hop.buildSchema(DATA_SCHEMA);

  check(so, 'hai thực thể đọc ra bình thường', Object.keys(Schema).sort(), ['activity', 'customer']);
  check(so, 'trường có thật trả về đúng object mô tả',
    [Schema.customer.taxNumber.code, Schema.customer.taxNumber.label], ['@CUS_MST', 'Mã số thuế']);
  check(so, 'trường của thực thể thứ hai cũng vậy', Schema.activity.workDate.precision, 'day');

  // Chiều ném, kèm gợi ý. Ca thật gần như luôn là gõ thiếu đuôi hoặc viết tắt.
  checkThrows(so, 'tên trường gõ thiếu đuôi thì nổ ngay và đoán đúng tên đủ',
    () => Schema.customer.taxNo, 'Có phải bạn định gọi "taxNumber"?');
  checkThrows(so, 'lời lỗi nêu rõ đường dẫn tới chỗ gõ sai',
    () => Schema.customer.taxNo, 'Schema.customer không có trường "taxNo"');
  checkThrows(so, 'lời lỗi liệt kê các tên có thật để người sửa khỏi phải mở tệp khác',
    () => Schema.customer.taxNo, 'companyName');
  checkThrows(so, 'tên thực thể gõ sai thì nổ ở tầng thực thể, và nói là thiếu thực thể chứ không nói thiếu trường',
    () => Schema.khach, 'Schema không có thực thể "khach"');
  checkThrows(so, 'tầng thực thể cũng đoán tên gần nhất',
    () => Schema.custom, 'Có phải bạn định gọi "customer"?');
  checkThrows(so, 'tên chẳng giống gì thì vẫn nổ, chỉ là không kèm gợi ý',
    () => Schema.customer.zzz, 'không có trường "zzz"');
  check(so, 'không đoán bừa khi chẳng có tên nào giống', hop.schemaSuggest('zzz', ['companyName', 'phone']), '');

  // Chiều cho đi qua. Đây là nửa dễ bị bỏ quên, và bỏ quên nó thì cái bẫy tự làm mình bị tháo.
  let inRaDuoc = true;
  try { JSON.stringify(Schema.customer); } catch (err) { inRaDuoc = false; }
  check(so, 'JSON.stringify một thực thể không nổ — nó hỏi toJSON, và toJSON được đi qua', inRaDuoc, true);

  let doiChuoiDuoc = true;
  try { String(Schema.customer); } catch (err) { doiChuoiDuoc = false; }
  check(so, 'đổi sang chuỗi không nổ — nó hỏi Symbol.toPrimitive', doiChuoiDuoc, true);

  check(so, 'ký hiệu (symbol) đi qua và trả về đúng thứ object gốc có',
    typeof Schema.customer[Symbol.toStringTag], 'undefined');
  check(so, 'tên máy trong danh sách cho qua trả về undefined chứ không ném',
    hop.SCHEMA_PASS_THROUGH.map((ten) => { try { return typeof Schema.customer[ten]; } catch (err) { return 'NÉM'; } }).filter((x) => x === 'NÉM'),
    []);

  let duyetDuoc = true;
  try { Object.keys(Schema.customer).length; } catch (err) { duyetDuoc = false; }
  check(so, 'Object.keys duyệt được — bẫy chỉ ở get, không ở ownKeys', duyetDuoc, true);

  // Object mô tả một trường KHÔNG bọc: hỏi `.default` của trường không khai default là câu hỏi hợp lệ, đáp án đúng là "không có".
  check(so, 'đọc thuộc tính không khai của một trường trả về undefined, không ném — vì tầng trường không bọc',
    Schema.customer.companyName.default, undefined);
  check(so, 'trường không khai unique thì unique là undefined chứ không phải false bịa ra',
    Schema.customer.phone.unique, undefined);

  // Bọc đúng hai tầng, không bọc tầng ba: bọc sâu thêm là làm mọi chỗ đọc thuộc tính tùy chọn thành một cái bẫy.
  check(so, 'bọc đúng hai tầng — object mô tả trường vẫn là object thường',
    Object.keys(Schema.customer.taxNumber).indexOf('code') >= 0, true);

  return so;
}

module.exports = { chay };
