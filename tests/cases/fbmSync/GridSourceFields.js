/**
 * Trang lưới không tiêu đề cắt cột theo vị trí tính từ tên cột gốc: thiếu tên cột gốc hoặc thiếu cột cần thì phải ném lỗi có mã trước khi gửi request, không dựng lệnh cắt theo vị trí đoán.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

const maLoi = (fn) => { try { fn(); return ''; } catch (error) { return String(error && error.code || 'KHONG_MA:' + (error && error.message)); } };

function chay(so) {
  section('FBM sync — lưới không tiêu đề cần tên cột gốc');
  const F = workflowGas().hop.FbmSync;
  const cot = ['ma_kh', 'ten_kh'];
  check(so, 'gridKeep trang không tiêu đề thiếu tên cột gốc (không có, rỗng, sai kiểu): ném FBM_GRID_SOURCE_FIELDS_MISSING',
    [undefined, [], null, 'ma_kh'].map((nguon) => maLoi(() => F.gridKeep(cot, false, nguon))),
    ['FBM_GRID_SOURCE_FIELDS_MISSING', 'FBM_GRID_SOURCE_FIELDS_MISSING', 'FBM_GRID_SOURCE_FIELDS_MISSING', 'FBM_GRID_SOURCE_FIELDS_MISSING']);
  check(so, 'gridKeep: tên cột gốc thiếu cột cần thì FBM_GRID_SHAPE_CHANGED; đủ cột thì cắt theo vị trí kèm số cột gốc; trang có tiêu đề cắt theo tên và không cần tên cột gốc',
    [maLoi(() => F.gridKeep(cot, false, ['ma_kh'])), F.gridKeep(cot, false, ['x', 'ten_kh', 'ma_kh']), F.gridKeep(cot, true, undefined)],
    ['FBM_GRID_SHAPE_CHANGED', { positions: [2, 1], width: 3 }, { fields: cot }]);

  // Dựng request thật: thiếu tên cột gốc thì không có request nào ra khỏi GAS.
  const cai = Object.assign({}, F.scriptSettings(F.stateRead()), { userId: 'u1' });
  const dung = (sourceFields) => F.customerGridRequest({ type: 1, scope: null, count: 3, gridPageIndex: 5, gridRefresh: false, sourceFields }, cai);
  check(so, 'dựng request đọc lưới khách không tiêu đề: thiếu tên cột gốc ném FBM_GRID_SOURCE_FIELDS_MISSING, có thì ra lệnh cắt theo vị trí',
    [maLoi(() => dung(undefined)), dung(F.GRID_FIELDS.customer).meta.keep.width],
    ['FBM_GRID_SOURCE_FIELDS_MISSING', F.GRID_FIELDS.customer.length]);
}

module.exports = { chay };
