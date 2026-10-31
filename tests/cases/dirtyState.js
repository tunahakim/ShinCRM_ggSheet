/**
 * Ca kiểm cho `server/state/DirtyState.js`: sổ nhật ký nạp lại và danh sách thay đổi chờ ghi nhận của một lần chạy (07A mục 1a, mục 4).
 *
 * Điều được canh: sổ chỉ ghi thêm (không có đường xóa tín hiệu khiến Sidebar khác mất thay đổi), cắt sổ luôn nâng `floor` để Sidebar tụt lại biết mình mất dấu, mỗi lần đổ giỏ chỉ một lệnh ghi kho, và chuyển đổi từ cờ đời cũ đẩy mọi Sidebar đang mở nạp lõi đúng một lần.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows } = require('../lib/assert');
const { trongLanGoi } = require('../lib/gas/lan-goi');

/** Bọc kho thuộc tính tài liệu để đếm từng loại lệnh. */
function demLenhKho(hop) {
  const dem = {};
  const goc = hop.PropertiesService.getDocumentProperties;
  hop.PropertiesService.getDocumentProperties = () => {
    const that = goc();
    const boc = {};
    Object.keys(that).forEach((ten) => { boc[ten] = function () { dem[ten] = (dem[ten] || 0) + 1; return that[ten].apply(that, arguments); }; });
    return boc;
  };
  return dem;
}

function chay(so) {
  section('Sổ nhật ký nạp lại — đọc và chuyển đổi từ cờ đời cũ');

  check(so, 'tệp mới tinh: sổ ảo revision 0, chưa ghi',
    dungHop({ sheets: ['Log'] }).hop.reloadJournalRead(),
    { rev: 0, floor: 0, changedAt: 0, entries: [], stored: false });

  const cu = dungHop({ sheets: ['Log'], props: { reloadRevision: '7', dirtyRecords: '["KH0001"]', dirtyConfig: 'true', reloadChangedAt: '99' } });
  check(so, 'tệp còn cờ đời cũ: sổ ảo rev = floor = revision cũ + 1, nên Sidebar đang mở (nhớ 7) tụt dưới floor và nạp lõi',
    [cu.hop.reloadJournalRead().rev, cu.hop.reloadJournalRead().floor, cu.hop.reloadDecisionForState({ journal: cu.hop.reloadJournalRead(), lastSeenRevision: 7 }).ram.mode],
    [8, 8, 'fullCore']);
  trongLanGoi(cu.hop, () => cu.hop.dirtyStateMarkSignal({ customer: ['KH0002'] }));
  check(so, 'lần ghi đầu: sổ thành thật ở revision 9, floor giữ 8, khóa đời cũ bị xóa hết',
    [cu.hop.reloadJournalRead().rev, cu.hop.reloadJournalRead().floor, cu.hop.reloadJournalRead().stored, cu.hop.RELOAD_LEGACY_KEYS.filter((key) => cu.props[key] !== undefined)],
    [9, 8, true, []]);

  const hong = dungHop({ sheets: ['Log'], props: { reloadJournal: '{"rev":' } }).hop;
  checkThrows(so, 'sổ hỏng thì báo lỗi to, không đoán là không có gì đổi', () => hong.reloadStateRead(), 'bị hỏng');

  section('Danh sách thay đổi chờ ghi nhận — một lần chạy GAS ghi đúng một dòng sổ');

  const gio = dungHop({ sheets: ['Log'] });
  trongLanGoi(gio.hop, () => gio.hop.dirtyStateMarkSignal({ customer: ['KH0000'] }));
  const dem = demLenhKho(gio.hop);
  trongLanGoi(gio.hop, () => {
    gio.hop.dirtyStateMarkSignal({ customer: ['KH0001', 'KH0001', ''] });
    gio.hop.dirtyStateMarkSignal({ customer: ['KH0002'], activity: ['GD0001'] });
    gio.hop.dirtyStateMarkSignal({ config: true });
    check(so, 'trong lần chạy, dấu nằm trong danh sách chờ, chưa tăng revision', gio.hop.reloadStateRead().revision, 1);
  });
  const dong = gio.hop.reloadJournalRead().entries.slice(-1)[0];
  check(so, 'ba lần đánh dấu thành một dòng sổ: mã theo từng thực thể, khử trùng, bỏ mã rỗng, kèm cờ',
    [gio.hop.reloadStateRead().revision, dong.r, dong.customer, dong.activity, dong.config, dong.category], [2, 2, ['KH0001', 'KH0002'], ['GD0001'], true, undefined]);
  check(so, 'ghi nhận thay đổi chỉ một lệnh ghi kho (sổ và mốc view cùng một lệnh), không lệnh xóa nào',
    [dem.setProperties || 0, dem.setProperty || 0, dem.deleteProperty || 0], [1, 0, 0]);
  trongLanGoi(gio.hop, () => gio.hop.dirtyStateMarkSignal({ customer: ['KH0003'], allViews: true }));
  check(so, 'dấu allViews nâng mốc cũ của view bằng revision vừa ghi trong cùng một lệnh ghi; chưa có sheet ! nào đang mới thì không ghi màu gốc tab',
    [gio.hop.reloadStateRead().viewsStaleRevision, dem.setProperties, dem.setProperty || 0, dem.deleteProperty || 0, !!gio.props.viewTabTint], [3, 2, 0, 0, false]);

  checkThrows(so, 'đánh dấu ngoài lần chạy (thiếu runEntryPoint) ném lỗi to, không im lặng mất dấu',
    () => dungHop({ sheets: ['Log'] }).hop.dirtyStateMarkSignal({ customer: ['KH0001'] }), 'ngoài runEntryPoint');

  const loi = dungHop({ sheets: ['Log'] }).hop;
  let daNem = false;
  try {
    trongLanGoi(loi, () => { loi.dirtyStateMarkSignal({ customer: ['KH0009'] }); throw new Error('lỗi sau khi đã ghi'); });
  } catch (e) { daNem = true; }
  check(so, 'lần chạy lỗi sau khi đã ghi vẫn ghi nhận thay đổi: Sidebar vẫn được báo phần đã xuống Sheet',
    [daNem, loi.reloadStateRead().revision, loi.reloadJournalRead().entries[0].customer], [true, 1, ['KH0009']]);

  const long = dungHop({ sheets: ['Log'] }).hop;
  trongLanGoi(long, () => {
    trongLanGoi(long, () => long.dirtyStateMarkSignal({ customer: ['KH0001'] }));
    check(so, 'cửa vào lồng trong cửa vào không ghi nhận ở lớp trong', long.reloadStateRead().revision, 0);
    long.dirtyStateMarkSignal({ customer: ['KH0002'] });
  });
  check(so, 'lớp ngoài cùng ghi nhận một lần cho cả hai lớp', [long.reloadStateRead().revision, long.reloadJournalRead().entries[0].customer], [1, ['KH0001', 'KH0002']]);

  const rong = dungHop({ sheets: ['Log'] }).hop;
  check(so, 'quyết định không có signal không thêm gì vào danh sách chờ và trả false',
    trongLanGoi(rong, () => rong.dirtyStateMarkDecision({ signal: { records: [] } })), false);
  check(so, 'lần chạy không có thay đổi không tăng revision', rong.reloadStateRead().revision, 0);

  const quyet = dungHop({ sheets: ['Log'] }).hop;
  checkThrows(so, 'signal có mã bản ghi mà thiếu thực thể thì ném lỗi: không có đường ghi mã không rõ sheet',
    () => trongLanGoi(quyet, () => quyet.dirtyStateMarkDecision({ signal: { records: ['KH0001'] } })), 'thiếu thực thể');
  trongLanGoi(quyet, () => quyet.dirtyStateMarkDecision({ signal: { records: ['GD0001'], recordEntity: 'activity', entities: ['customer'], schema: true } }));
  check(so, 'signal ánh xạ đúng phần: mã về đúng thực thể, entities thành cả sheet, schema thành lõi',
    quyet.reloadJournalRead().entries.slice(-1)[0], { r: 1, t: quyet.reloadJournalRead().changedAt, customer: true, activity: ['GD0001'], core: true });

  section('Giới hạn sổ — cắt dòng cũ nhất, floor nâng theo');

  const nguong = dungHop({ sheets: ['Log'] }).hop;
  nguong.SETTINGS.RELOAD_JOURNAL_PART_IDS = 2;
  trongLanGoi(nguong, () => nguong.dirtyStateMarkSignal({ customer: ['A', 'B', 'C'], activity: ['X'] }));
  check(so, 'một phần quá ngưỡng mã chỉ phần đó lên cả sheet, phần kia giữ danh sách',
    [nguong.reloadJournalRead().entries[0].customer, nguong.reloadJournalRead().entries[0].activity], [true, ['X']]);

  const dong3 = dungHop({ sheets: ['Log'] }).hop;
  dong3.SETTINGS.RELOAD_JOURNAL_MAX_ENTRIES = 3;
  for (let i = 1; i <= 5; i += 1) { trongLanGoi(dong3, () => dong3.dirtyStateMarkSignal({ customer: ['KH' + i] })); }
  const so3 = dong3.reloadJournalRead();
  check(so, 'vượt số dòng thì cắt dòng cũ nhất, floor bằng revision của dòng vừa cắt',
    [so3.rev, so3.floor, so3.entries.map((entry) => entry.r)], [5, 2, [3, 4, 5]]);

  const nenByte = dungHop({ sheets: ['Log'] });
  const byte = nenByte.hop;
  byte.SETTINGS.RELOAD_JOURNAL_MAX_BYTES = 200;
  for (let i = 1; i <= 6; i += 1) { trongLanGoi(byte, () => byte.dirtyStateMarkSignal({ customer: ['KHACH-HANG-' + i] })); }
  const soByte = byte.reloadJournalRead();
  check(so, 'vượt dung lượng thì cắt tới khi vừa, floor là revision dòng cắt cuối',
    [nenByte.props.reloadJournal.length <= 200, soByte.floor, soByte.entries[0].r - 1], [true, soByte.floor, soByte.floor]);
  byte.SETTINGS.RELOAD_JOURNAL_MAX_BYTES = 10;
  trongLanGoi(byte, () => byte.dirtyStateMarkSignal({ customer: ['KH-CUOI'] }));
  check(so, 'dòng mới nhất luôn ở lại dù một mình nó đã quá dung lượng', byte.reloadJournalRead().entries.map((entry) => entry.r), [7]);

  section('Mốc cũ của sheet quản trị');

  const stale = dungHop({ sheets: ['Log'] }).hop;
  stale.viewLedgerWrite('!Lead', { data: 0, ok: true });
  stale.viewLedgerWrite('!Chăm sóc', { data: 0, ok: true });
  trongLanGoi(stale, () => stale.dirtyStateMarkSignal({ customer: ['KH0001'], allViews: true }));
  check(so, 'signal dữ liệu kho làm mọi sheet đã vẽ trước đó thành cũ',
    [stale.reloadStateRead().viewsStaleRevision, stale.viewIsStale('!Lead'), stale.viewIsStale('!Chăm sóc')], [1, true, true]);
  stale.viewLedgerWrite('!Lead', { data: 1, ok: true });
  check(so, 'vẽ một sheet chỉ làm sheet đó mới, sheet khác vẫn cũ', [stale.viewIsStale('!Lead'), stale.viewIsStale('!Chăm sóc')], [false, true]);
  stale.viewLedgerWrite('!Lead', { data: 1, ok: false, error: 'lỗi lọc', at: 0 });
  check(so, 'lượt thử hỏng ở đúng dữ liệu mới nhất vẫn là sheet cũ (tab giữ cam, Sidebar báo)', stale.viewIsStale('!Lead'), true);
  check(so, 'sheet chưa từng vẽ là cũ kể cả khi chưa có signal nào', dungHop({ sheets: ['Log'] }).hop.viewIsStale('!Mới'), true);
  trongLanGoi(stale, () => stale.dirtyStateMarkSignal({ customer: ['KH0002'] }));
  check(so, 'signal không mang allViews không đụng mốc cũ của view', stale.reloadStateRead().viewsStaleRevision, 1);

  check(so, 'probeDirtyState in được trên tệp mới', dungHop({ sheets: ['Log'] }).hop.probeDirtyState()[0].indexOf('revision: 0') === 0, true);

  return so;
}

module.exports = { chay };
