const { napRieng } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('Ngôn ngữ lọc và sắp xếp — parser thuần, không chạm sheet');
  let hop;
  try { hop = napRieng('server/util/TextNormalize.js'); } catch (err) { return ghiLoiNap(so, 'nạp normalizeText', err); }
  try {
    const parser = napRieng('server/util/TextNormalize.js');
    const view = require('../lib/load-gas').taoHopCat({ normalizeText: parser.normalizeText });
    require('../lib/load-gas').napServer(view, 'server/view/FilterMessages.js', 'server/view/FilterParser.js', 'server/view/SortSpec.js');
    hop = view;
  } catch (err) { return ghiLoiNap(so, 'nạp parser bộ lọc/sắp xếp', err); }

  const text = { type: 'TEXT', code: '@CUS_TEN_CTY' };
  const positive = hop.filterParseCell('Hà Nội; Hải Phòng; <>Công ty A', text);
  check(so, 'TEXT tách OR dương và AND âm', [positive.terms.length, positive.errors.length], [3, 0]);
  check(so, 'TEXT khớp chuỗi đã chuẩn hóa', hop.filterCellMatches('Hà Nội', positive, text), true);
  check(so, 'phủ định loại đúng giá trị bị cấm', hop.filterCellMatches('Công ty A tại Hà Nội', positive, text), false);
  check(so, 'nháy kép rỗng là lọc ô rỗng', hop.filterCellMatches('', hop.filterParseCell('""', text), text), true);

  const number = { type: 'NUMBER', code: '@CUS_GIA_TRI' };
  check(so, 'NUMBER hỗ trợ bằng, so sánh và khoảng', [
    hop.filterCellMatches(50, hop.filterParseCell('50', number), number),
    hop.filterCellMatches(60, hop.filterParseCell('>=50', number), number),
    hop.filterCellMatches(55, hop.filterParseCell('50..60', number), number)
  ], [true, true, true]);
  check(so, 'khoảng ngược báo lỗi thay vì lọc sai', hop.filterParseCell('60..50', number).errors.length, 1);

  const date = { type: 'DATE', code: '@ACT_NGAY_LAM_VIEC' };
  check(so, 'DATE cắt theo độ chi tiết người dùng gõ', hop.filterCellMatches('2026-03-10 14:30', hop.filterParseCell('2026-03-10', date, new Date(2026, 2, 10, 15)), date), true);
  check(so, 'DATE nhận từ khóa tương đối', hop.filterParseCell('today..+3', date, new Date(2026, 2, 10, 15)).errors.length, 0);

  const fields = { '@CUS_TEN_CTY': text, '@CUS_GIA_TRI': number };
  const sort = hop.sortSpecParse([{ col: '@CUS_GIA_TRI', level: 'Giảm dần (Z → A)' }], fields);
  check(so, 'sort nhận chiều tiếng Việt và mã cột hợp lệ', [sort.specs.length, sort.errors.length, sort.specs[0].direction], [1, 0, 'desc']);
  check(so, 'sort từ chối mã cột ngoài kho', hop.sortSpecParse([{ col: '@CFG_X', level: 'tăng' }], fields).errors.length, 1);
  const cmp = hop.sortSpecComparator([{ code: '@CUS_GIA_TRI', direction: 'asc', field: number }]);
  check(so, 'ô rỗng luôn xếp cuối', cmp({ '@CUS_GIA_TRI': '' }, { '@CUS_GIA_TRI': 2 }) > 0, true);
}

module.exports = { chay };
