/**
 * Ca kiểm luật ghi Log của `server/entry/EntryPoint.js` cho cửa vào Sidebar tự gọi: chỉ ghi khi lỗi chuyển trạng thái.
 *
 * Mỗi dòng Log là một lần ghi Sheet, kênh báo thay đổi đánh thức Sidebar hỏi lại; ghi lỗi trùng ở mỗi lần là vòng lặp tự nuôi. Nhưng Sidebar vẫn phải nhận lỗi mỗi lần, và cửa vào ngoài danh sách vẫn ghi mỗi lần.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

function docLog(nen) {
  const sheet = nen.Log.sheet;
  const dau = nen.hop.SHEET_LAYOUT.Log.firstDataRow;
  if (sheet.getLastRow() < dau) { return []; }
  return sheet.getRange(dau, 1, sheet.getLastRow() - dau + 1, 9).getValues().map((row) => row.join('|'));
}

function chay(so) {
  section('EntryPoint — cửa vào tự động ghi Log theo chuyển trạng thái');
  let nen;
  try { nen = dungHop({ sheets: ['Config', 'Log'] }); } catch (err) { return ghiLoiNap(so, 'nạp EntryPoint', err); }
  const hop = nen.hop;
  const goi = (name, fn) => hop.runEntryPoint(name, 'sidebar', 'throw', fn);
  const hong = (message) => () => { throw new Error(message); };
  const dem = (text) => docLog(nen).filter((row) => row.indexOf(text) >= 0).length;

  checkThrows(so, 'lỗi đầu tiên của cửa vào tự động vẫn ném cho Sidebar', () => goi('renderViewIfDirty', hong('lỗi A')), 'lỗi A');
  checkThrows(so, 'lỗi trùng vẫn ném cho Sidebar', () => goi('renderViewIfDirty', hong('lỗi A')), 'lỗi A');
  check(so, 'lỗi trùng của cửa vào tự động không thêm dòng Log', dem('lỗi A'), 1);

  checkThrows(so, 'lỗi đổi nội dung', () => goi('renderViewIfDirty', hong('lỗi B')), 'lỗi B');
  check(so, 'lỗi khác nội dung thì ghi một dòng mới', dem('lỗi B'), 1);

  goi('renderViewIfDirty', () => ({ ok: false, skipped: true, error: 'lỗi B' }));
  check(so, 'kết quả ok:false (báo lại lỗi cũ) không tính là hết lỗi', dem('Đã hết lỗi'), 0);
  goi('renderViewIfDirty', () => ({ ok: true }));
  goi('renderViewIfDirty', () => ({ ok: true }));
  check(so, 'thành công sau lỗi ghi đúng một dòng hết lỗi, thành công tiếp không ghi gì', [dem('Đã hết lỗi: lỗi B'), dem('Đã hết lỗi')], [1, 1]);
  checkThrows(so, 'lỗi cũ quay lại sau khi đã hết', () => goi('renderViewIfDirty', hong('lỗi A')), 'lỗi A');
  check(so, 'lỗi quay lại sau khi đã hết thì ghi lại', dem('lỗi A'), 2);

  checkThrows(so, 'cửa vào khác trong danh sách có sổ riêng', () => goi('inspectViewState', hong('lỗi A')), 'lỗi A');
  check(so, 'mỗi cửa vào nhớ lỗi riêng', dem('lỗi A'), 3);

  checkThrows(so, 'cửa vào ngoài danh sách lần 1', () => goi('saveRecord', hong('lỗi C')), 'lỗi C');
  checkThrows(so, 'cửa vào ngoài danh sách lần 2', () => goi('saveRecord', hong('lỗi C')), 'lỗi C');
  check(so, 'cửa vào ngoài danh sách (người bấm, FBM) vẫn ghi mọi lần lỗi', dem('lỗi C'), 2);
}

module.exports = { chay };
