/** `server/view/ViewLedger.js`: sổ trạng thái vẽ của sheet quản trị; lượt vẽ hỏng không tự đánh thức thành vòng lặp và mỗi lỗi chỉ ghi Log một lần. */

const { section, check, ghiLoiNap } = require('../../lib/assert');
const { taoNenView, gieoHaiKhach, gieoHaiGiaoDich, ganCoView } = require('../../lib/view/nen-view');
const { trongLanGoi } = require('../../lib/gas/lan-goi');
const { docLog } = require('../../lib/gas/doc-log');

/** Số dòng Log chứa `text`. */
const demLog = (nen, text) => docLog(nen, { noi: '|' }).filter((dong) => dong.indexOf(text) >= 0).length;

/** Vòng điều khiển phải hội tụ: lượt vẽ hỏng không được tự thử lại, ghi Log ở mỗi lần Sidebar bị đánh thức. */
function chay(so) {
  section('ViewLedger — lượt vẽ hỏng không tự đánh thức thành vòng lặp');
  let t;
  try { t = taoNenView(['@CUS_MA_KH', '@CUS_TEN_CTY', '@ACT_NGAY_LAM_VIEC']); } catch (err) { return ghiLoiNap(so, 'nạp ViewLedger', err); }
  const hop = t.nen.hop;
  gieoHaiKhach(t.nen);
  gieoHaiGiaoDich(t.nen);
  hop.renderViewSheet('!Lead');
  const loiDau = () => { hop.flushLog(); return demLog(t.nen, '60..50'); };

  t.view.getRange(3, 2).setValue('60..50');
  ganCoView(hop, '!Lead');
  const first = hop.renderViewIfDirty('!Lead');
  check(so, 'lượt có cờ đầu tiên gặp ô lọc sai thì trả khối lỗi chỉ đúng ô (không ném) và ghi một dòng Log',
    [first.ok, first.problems[0].lines[0].indexOf('Ô B3') === 0, loiDau()], [false, true, 1]);

  const writes = t.nen.dem.setValues;
  const again = hop.renderViewIfDirty('!Lead');
  check(so, 'đánh thức lại với cùng dữ liệu: không thử, không Log, không ghi Sheet; trả lại khối lỗi để Sidebar hiện',
    [again.ok, again.skipped, again.problems.length, loiDau(), t.nen.dem.setValues - writes], [false, true, 1, 1, 0]);

  trongLanGoi(hop, () => hop.dirtyStateMarkSignal({ customer: ['KH0001'], allViews: true }));
  check(so, 'dữ liệu kho đổi thì thử lại; lỗi y hệt không thêm dòng Log', [hop.renderViewIfDirty('!Lead').skipped, loiDau()], [undefined, 1]);

  const entry = hop.viewLedgerEntry('!Lead');
  hop.viewLedgerWrite('!Lead', Object.assign({}, entry, { at: entry.at - hop.SETTINGS.VIEW_FAILED_RETRY_MS }));
  check(so, 'lượt hỏng quá VIEW_FAILED_RETRY_MS thì tự thử lại một lần, lượt kế tiếp lại bỏ qua',
    [hop.renderViewIfDirty('!Lead').skipped, hop.renderViewIfDirty('!Lead').skipped], [undefined, true]);
  check(so, 'bấm làm mới luôn thử dù sổ nói lượt trước đã hỏng', hop.renderViewSheet('!Lead').skipped, undefined);

  t.view.getRange(3, 2).setValue('70..80');
  ganCoView(hop, '!Lead');
  hop.renderViewIfDirty('!Lead');
  hop.flushLog();
  check(so, 'lỗi khác nội dung thì ghi một dòng Log mới', demLog(t.nen, '70..80'), 1);

  t.view.getRange(3, 2).setValue('');
  ganCoView(hop, '!Lead');
  const fixed = hop.renderViewIfDirty('!Lead');
  hop.flushLog();
  check(so, 'sửa ô lọc rồi có cờ thì vẽ lại, sheet mới, Log ghi một dòng hết lỗi',
    [fixed.ok, fixed.rows, hop.viewIsStale('!Lead'), demLog(t.nen, 'hết lỗi')], [true, 2, false, 1]);

  // Ô lọc bị Sheets tự đổi thành ngày trước khi hàng lọc có khuôn chữ.
  t.view.getRange(3, 3).setValue(new Date(2026, 2, 3));
  ganCoView(hop, '!Lead');
  const dated = hop.renderViewIfDirty('!Lead');
  check(so, 'ô lọc kiểu ngày lọc đúng ngày người gõ, được ghi lại thành chữ, hàng lọc có khuôn chữ',
    [dated.ok, dated.rows, t.view.getRange(4, 1).getValue(), t.view.getRange(3, 3).getValue(), t.view.getRange(3, 3).getNumberFormat()],
    [true, 1, 'KH0002', '2026-03-03', hop.COLUMN_FORMAT_TEXT]);
  check(so, 'ghi lại chữ do chính GAS ghi nên không sinh lượt vẽ thứ hai', hop.renderViewIfDirty('!Lead').skipped, true);
}

module.exports = { chay: chay };
