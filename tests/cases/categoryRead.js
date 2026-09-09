/**
 * Ca kiểm cho `server/sheet/CategoryRead.js`: đọc sheet `Category` thành bảng "mã danh mục → danh sách giá trị".
 *
 * Ca quan trọng nhất ở đây là **cái bẫy `@CAT_CHO_PHEP_FBM`**. Nhận diện cột đi kèm bằng hậu tố `_FBM` một mình là một dòng code trông rất hợp lý và sai rất nặng: danh mục "Cho phép đẩy FBM" cũng kết thúc bằng `_FBM`, loại nó ra thì trường `allowFbmPush` mất sạch giá trị để chọn — mà đó là trường **bắt buộc ở cả hai thực thể**, nên form sẽ không lưu được bản ghi nào và nguyên nhân thì không hiện ra ở đâu. Phép kiểm này canh đúng luật đúng: bỏ hậu tố ra thì phần còn lại có phải một danh mục đã khai không.
 *
 * Điều thứ hai được canh, và nó bắc qua hai tệp: **mọi trường SELECT đều tìm được danh mục của mình**. Một `source` trỏ vào một mã không có trong `Category` thì danh sách chọn rỗng, người dùng không chọn được gì, và bảng khai vẫn trông đúng.
 *
 * Điều thứ ba: giá trị trùng thì **cảnh báo**, không ném lỗi — khác hẳn khóa trùng ở `Config`. Lý do khác nhau nằm ở chỗ hai hàng cùng khóa ở `Config` là hai câu trả lời cho một câu hỏi, còn hai giá trị trùng ở đây chỉ là một mục hiện hai lần trong danh sách chọn.
 */

const { dungHop, ghiO } = require('../lib/dung-hop');
const { section, check, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('Danh mục — cái bẫy hậu tố _FBM, và giá trị trùng thì cảnh báo chứ không chặn');

  let nen;
  try {
    nen = dungHop({ sheets: ['Category'] });
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/sheet/CategoryRead.js', err);
  }

  const hop = nen.hop;
  const hangDau = hop.SHEET_FIRST_DATA_ROW;

  // Bảng chân lý của phép nhận diện. Ca thứ hai là ca đã nêu ở đầu tệp; ba ca sau canh việc luật không bị nới ra thành "cứ _FBM là cột đi kèm".
  check(so, '@CAT_TINH_THANH_FBM là cột đi kèm vì bỏ hậu tố ra vẫn còn một danh mục đã khai',
    hop.categoryIsCompanion('@CAT_TINH_THANH_FBM'), true);
  check(so, '@CAT_CHO_PHEP_FBM KHÔNG phải cột đi kèm — đây là cái bẫy làm rỗng allowFbmPush',
    hop.categoryIsCompanion('@CAT_CHO_PHEP_FBM'), false);
  check(so, 'mã không có hậu tố thì không phải cột đi kèm', hop.categoryIsCompanion('@CAT_TINH_THANH'), false);
  check(so, 'đúng bằng hậu tố mà không có phần gốc thì không phải cột đi kèm', hop.categoryIsCompanion('_FBM'), false);
  check(so, 'hậu tố đúng nhưng phần gốc chưa khai thì vẫn là danh mục thật', hop.categoryIsCompanion('@CAT_LA_LUNG_FBM'), false);
  check(so, 'companion không khai trong CATEGORY_COLUMNS phải bị bỏ qua', hop.categoryIsCompanion('@CAT_NHOM_KH_FBM'), false);

  const ma = hop.categoryCodes();
  check(so, '13 cột khai trừ 4 cột đi kèm còn 9 danh mục thật',
    [hop.CATEGORY_COLUMNS.length, ma.length], [13, 9]);
  check(so, '@CAT_CHO_PHEP_FBM có mặt trong danh sách danh mục thật', ma.indexOf('@CAT_CHO_PHEP_FBM') >= 0, true);
  check(so, 'không một mã đi kèm nào lọt vào danh sách danh mục thật', ma.filter(hop.categoryIsCompanion), []);

  // Ca rỗng: sheet mới dựng, chưa ai gõ giá trị nào. Vẫn phải đủ khóa, vì client hỏi thẳng `categories[source]`.
  const rong = hop.categoryReadAll();
  check(so, 'sheet trắng vẫn trả về đủ 9 khóa, mỗi khóa một mảng rỗng',
    [Object.keys(rong.categories).length, Object.keys(rong.categories).every((code) => JSON.stringify(rong.categories[code]) === '[]')],
    [9, true]);
  check(so, 'sheet trắng không sinh cảnh báo nào', rong.warnings, []);
  check(so, 'không một cột đi kèm nào thành khóa trong kết quả',
    Object.keys(rong.categories).filter(hop.categoryIsCompanion), []);

  // Phép kiểm bắc qua hai tệp: mọi trường SELECT của cả hai thực thể phải tìm được danh mục của mình.
  const thieuNguon = [];
  Object.keys(hop.DATA_SCHEMA).forEach((entity) => {
    const fields = hop.DATA_SCHEMA[entity];
    Object.keys(fields).forEach((name) => {
      const spec = fields[name];
      if (spec.source && !Object.prototype.hasOwnProperty.call(rong.categories, spec.source)) {
        thieuNguon.push(entity + '.' + name + ' → ' + spec.source);
      }
    });
  });
  check(so, 'mọi trường SELECT có source đều tìm được danh mục của mình trong Category', thieuNguon, []);

  // Mỗi danh mục là một cột chạy dọc độc lập: cột dài cột ngắn khác nhau, và hàng trắng giữa cột chỉ là hàng trắng
  // của riêng cột đó. Không có khái niệm "hàng" ở sheet này, nên bỏ hàng trắng KHÔNG được làm mất giá trị bên dưới.
  ghiO(nen, 'Category', hangDau, '@CAT_TINH_THANH', 'Hà Nội');
  ghiO(nen, 'Category', hangDau + 2, '@CAT_TINH_THANH', '  Đà Nẵng  ');
  ghiO(nen, 'Category', hangDau + 3, '@CAT_TINH_THANH', 'Cần Thơ');
  ghiO(nen, 'Category', hangDau, '@CAT_UU_TIEN', 'Cao');
  ghiO(nen, 'Category', hangDau + 1, '@CAT_UU_TIEN', 'Thấp');
  ghiO(nen, 'Category', hangDau, '@CAT_TINH_THANH_FBM', '01. Hà Nội #');

  const doc = hop.categoryReadAll();
  check(so, 'hàng trắng giữa cột chỉ bị bỏ qua, giá trị bên dưới vẫn đọc được',
    doc.categories['@CAT_TINH_THANH'], ['Hà Nội', 'Đà Nẵng', 'Cần Thơ']);
  check(so, 'hai cột dài ngắn khác nhau là chuyện thường', doc.categories['@CAT_UU_TIEN'], ['Cao', 'Thấp']);
  check(so, 'danh mục chưa ai gõ vẫn là mảng rỗng chứ không mất khóa', doc.categories['@CAT_NHOM_KH'], []);
  check(so, 'giá trị của cột đi kèm KHÔNG bị đọc vào — nó thuộc Giai đoạn 3',
    Object.prototype.hasOwnProperty.call(doc.categories, '@CAT_TINH_THANH_FBM'), false);
  check(so, 'đọc cả sheet chỉ tốn một lệnh đọc nên chưa sinh cảnh báo nào', doc.warnings, []);

  // Giá trị trùng. Kể cả trùng sau khi cắt khoảng trắng — với người dùng thì "Hà Nội" và "Hà Nội " là một.
  ghiO(nen, 'Category', hangDau + 5, '@CAT_TINH_THANH', 'Hà Nội ');
  ghiO(nen, 'Category', hangDau + 6, '@CAT_TINH_THANH', 'Cần Thơ');

  const trung = hop.categoryReadAll();
  check(so, 'giá trị trùng chỉ giữ lại một, danh sách chọn vẫn dùng được ngay',
    trung.categories['@CAT_TINH_THANH'], ['Hà Nội', 'Đà Nẵng', 'Cần Thơ']);
  check(so, 'trùng thì sinh đúng một dòng cảnh báo, nêu tên danh mục và cả hai giá trị bị trùng',
    [trung.warnings.length, trung.warnings[0].indexOf('@CAT_TINH_THANH') >= 0, trung.warnings[0].indexOf('Hà Nội, Cần Thơ') >= 0],
    [1, true, true]);

  return so;
}

module.exports = { chay };
