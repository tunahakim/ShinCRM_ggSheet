/**
 * Ca kiểm cho `server/state/DirtyState.js`: khối trạng thái bẩn đính kèm **mọi** phản hồi máy chủ.
 *
 * Điều được canh ở đây là **hàm này không bao giờ ném lỗi**. Nó nằm trên đường phản hồi của mọi lời gọi, nên nó nổ là cả sidebar nổ — và nổ vì một dấu ngoặc thiếu ở một khóa mà người ta sửa bằng tay lúc gỡ lỗi thì càng vô lý. Vì thế phép kiểm đưa vào đủ loại rác: JSON hỏng, JSON đúng nhưng không phải mảng, `PropertiesService` gãy hẳn.
 *
 * Chiều rỗng cũng được canh: khối rỗng nghĩa là "không biết có gì bẩn", dẫn tới không vẽ lại gì cả. Đó là chiều an toàn, còn chiều nguy hiểm là đoán bừa ra một danh sách bẩn rồi đi ghi đè dữ liệu.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows } = require('../lib/assert');
const { trongLanChay } = require('../lib/load-gas');

function chay(so) {
  section('Trạng thái bẩn — khối này không được phép ném lỗi, vì nó nằm trên mọi đường phản hồi');

  const nenRong = dungHop({ sheets: ['Config', 'Log'] });
  check(so, 'ba khóa khai đúng tên thuộc tính của DocumentProperties',
    nenRong.hop.DIRTY_KEYS,
    { records: 'dirtyRecords', config: 'dirtyConfig', all: 'dirtyAll' });

  check(so, 'tệp mới chưa ai ghi gì thì cả ba đều rỗng, không phải undefined',
    nenRong.hop.dirtyStateRead(),
    { records: [], config: false, all: false });

  // Đường đọc bình thường: JSON mảng, đúng thứ chiều ghi ở chặng làm mới sẽ ghi ra.
  const nen = dungHop({
    sheets: ['Config', 'Log'],
    props: {
      dirtyRecords: '["KH0001","KH0007"]',
      dirtyConfig: 'true',
      dirtyAll: 'false'
    }
  });

  check(so, 'JSON mảng đọc ra đúng mảng đó',
    nen.hop.dirtyStateRead(),
    { records: ['KH0001', 'KH0007'], config: true, all: false });

  // Ba dạng rác khác nhau, cả ba đều phải ra mảng rỗng hoặc danh sách đọc được, tuyệt đối không ném.
  const rac = [
    ['chuỗi rỗng', '', []],
    ['JSON thiếu ngoặc đóng thì rơi về tách theo dấu phẩy', '["KH0001", "KH0002"', ['["KH0001"', '"KH0002"']],
    ['danh sách gõ tay bằng dấu phẩy, cắt khoảng trắng hai đầu', ' KH0001 , KH0002 ,, KH0003 ', ['KH0001', 'KH0002', 'KH0003']],
    ['JSON đúng cú pháp nhưng là object thì coi như không có gì', '{"KH0001":true}', []],
    ['JSON đúng cú pháp nhưng là số thì cũng vậy', '42', []],
    ['một mã trần không có ngoặc kép nào', 'KH0009', ['KH0009']]
  ];

  rac.forEach((ca) => {
    const hop = dungHop({ sheets: ['Config', 'Log'], props: { dirtyRecords: ca[1] } }).hop;
    check(so, 'dirtyRecords — ' + ca[0], hop.dirtyStateRead().records, ca[2]);
  });

  // Hai cờ boolean so bằng đúng chuỗi 'true'. Nới ra thành "chuỗi nào cũng tính là bật" thì một ô gõ chữ `false` sẽ bật cờ.
  const co = [
    ['true', true],
    ['false', false],
    ['TRUE', false],
    ['1', false],
    ['', false]
  ];

  co.forEach((ca) => {
    const hop = dungHop({ sheets: ['Config', 'Log'], props: { dirtyConfig: ca[0] } }).hop;
    check(so, 'dirtyConfig "' + ca[0] + '" thành ' + ca[1] + ' — chỉ đúng chuỗi true mới là bật', hop.dirtyStateRead().config, ca[1]);
  });

  // Ca tệ nhất: `PropertiesService` gãy hẳn. Đây là ca không dựng được bằng cách truyền props, nên thay hẳn thứ toàn cục đó.
  const nenGay = dungHop({ sheets: ['Config', 'Log'] });
  nenGay.hop.PropertiesService = {
    getDocumentProperties: function () { throw new Error('Đọc thuộc tính tài liệu thất bại'); }
  };

  check(so, 'PropertiesService gãy hẳn thì trả khối rỗng chứ không ném — đây là chiều an toàn',
    nenGay.hop.dirtyStateRead(),
    { records: [], config: false, all: false });

  // Ca gãy nửa đường: mở được nhưng `getProperty` nổ ở khóa thứ hai.
  const nenNua = dungHop({ sheets: ['Config', 'Log'] });
  nenNua.hop.PropertiesService = {
    getDocumentProperties: function () {
      return {
        getProperty: function (key) {
          if (key === 'dirtyRecords') { throw new Error('Khóa này đọc không được'); }
          return null;
        }
      };
    }
  };

  check(so, 'gãy ở giữa lượt đọc cũng ra khối rỗng, không ra khối nửa vời',
    nenNua.hop.dirtyStateRead(),
    { records: [], config: false, all: false });

  // Phép nghiệm thu chạy trên Google: bốn dòng, dòng đầu là mốc cũ của view.
  const bao = nen.hop.probeDirtyState();
  check(so, 'probeDirtyState in đúng bốn dòng',
    bao,
    ['viewsStaleRevision: 0 · sổ sheet quản trị: {}', 'dirtyRecords: 2 mã', 'dirtyConfig: true', 'dirtyAll: false']);

  check(so, 'probeDirtyState trên tệp mới nói rõ là rỗng chứ in ra khoảng trắng',
    nenRong.hop.probeDirtyState(),
    ['viewsStaleRevision: 0 · sổ sheet quản trị: {}', 'dirtyRecords: rỗng', 'dirtyConfig: false', 'dirtyAll: false']);

  const ghi = dungHop({ sheets: ['Config', 'Log'] });
  check(so, 'đánh dấu mã bản ghi hợp nhất và bỏ mã rỗng',
    trongLanChay(ghi.hop, () => ghi.hop.dirtyStateMarkRecords(['KH0001', 'KH0001', '', 'KH0002'])) && ghi.hop.dirtyStateRead().records,
    ['KH0001', 'KH0002']);
  trongLanChay(ghi.hop, () => ghi.hop.dirtyStateMarkConfig());
  check(so, 'đánh dấu Config bật đúng cờ', ghi.hop.dirtyStateRead().config, true);
  check(so, 'vượt ngưỡng chuyển sang cờ toàn bộ và bỏ danh sách mã',
    (function () {
      const hop = dungHop({ sheets: ['Config', 'Log'] }).hop;
      hop.SETTINGS.DIRTY_RECORD_LIMIT = 2;
      trongLanChay(hop, () => hop.dirtyStateMarkRecords(['A', 'B', 'C']));
      return hop.dirtyStateRead();
    }()),
    { records: [], config: false, all: true });
  check(so, 'xóa cờ theo nhóm không đụng nhóm còn lại',
    (function () {
      const hop = dungHop({ sheets: ['Config', 'Log'] }).hop;
      trongLanChay(hop, () => { hop.dirtyStateMarkConfig(); hop.dirtyStateMarkAll(); });
      return hop.dirtyStateClear({ all: true });
    }()),
    { records: [], config: true, all: false });

  section('Giỏ thay đổi — một lần chạy GAS phát đúng một tín hiệu');

  const gio = dungHop({ sheets: ['Config', 'Log'], props: { reloadRevision: '4' } }).hop;
  trongLanChay(gio, () => {
    gio.dirtyStateMarkRecords(['KH0001']);
    gio.dirtyStateMarkRecords(['KH0002']);
    gio.dirtyStateMarkConfig();
    check(so, 'trong lần chạy, dấu nằm trong giỏ, chưa tăng revision', gio.reloadStateRead().revision, 4);
  });
  check(so, 'một lần chạy đánh dấu ba lần chỉ tăng revision một lần, đủ mọi dấu',
    [gio.reloadStateRead().revision, gio.reloadStateRead().records, gio.reloadStateRead().config], [5, ['KH0001', 'KH0002'], true]);

  const ngoai = dungHop({ sheets: ['Config', 'Log'] }).hop;
  checkThrows(so, 'đánh dấu ngoài lần chạy (thiếu runEntryPoint) ném lỗi to, không im lặng mất dấu',
    () => ngoai.dirtyStateMarkRecords(['KH0001']), 'ngoài runEntryPoint');

  const loi = dungHop({ sheets: ['Config', 'Log'], props: { reloadRevision: '1' } }).hop;
  let daNem = false;
  try {
    trongLanChay(loi, () => { loi.dirtyStateMarkRecords(['KH0009']); throw new Error('lỗi sau khi đã ghi'); });
  } catch (e) { daNem = true; }
  check(so, 'lần chạy lỗi sau khi đã ghi vẫn đổ giỏ: Sidebar vẫn được báo phần đã xuống Sheet',
    [daNem, loi.reloadStateRead().revision, loi.reloadStateRead().records], [true, 2, ['KH0009']]);

  const long = dungHop({ sheets: ['Config', 'Log'], props: { reloadRevision: '1' } }).hop;
  trongLanChay(long, () => {
    trongLanChay(long, () => long.dirtyStateMarkRecords(['KH0001']));
    check(so, 'cửa vào lồng trong cửa vào không đổ giỏ ở lớp trong', long.reloadStateRead().revision, 1);
    long.dirtyStateMarkRecords(['KH0002']);
  });
  check(so, 'lớp ngoài cùng đổ một lần cho cả hai lớp', [long.reloadStateRead().revision, long.reloadStateRead().records], [2, ['KH0001', 'KH0002']]);

  const rong = dungHop({ sheets: ['Config', 'Log'], props: { reloadRevision: '3' } }).hop;
  trongLanChay(rong, () => rong.dirtyStateMarkDecision({ signal: { records: [] } }));
  check(so, 'lần chạy không có thay đổi không tăng revision', rong.reloadStateRead().revision, 3);

  check(so, 'lượt nạp toàn bộ nhận ba cờ dữ liệu nhưng giữ nguyên mốc cũ của sheet quản trị',
    (function () {
      const hop = dungHop({
        sheets: ['Config', 'Log'],
        props: { viewsStaleRevision: '5', dirtyRecords: '["KH0001"]', dirtyConfig: 'true', dirtyAll: 'false' }
      }).hop;
      const consumed = hop.dirtyStateTakeFullReload();
      return [consumed, hop.dirtyStateRead(), hop.reloadStateRead().viewsStaleRevision];
    }()),
    [
      { records: ['KH0001'], config: true, all: false },
      { records: [], config: false, all: false },
      5
    ]);

  check(so, 'lượt nạp lõi thất bại trả lại cờ đã nhận mà không xóa cờ mới phát sinh',
    (function () {
      const hop = dungHop({ sheets: ['Config', 'Log'], props: { dirtyRecords: '["KH0001"]', dirtyConfig: 'true' } }).hop;
      trongLanChay(hop, () => {
        const consumed = hop.dirtyStateTakeFullReload();
        hop.dirtyStateMarkRecords(['KH0002']);
        hop.dirtyStateRestoreFullReload(consumed);
      });
      return hop.dirtyStateRead();
    }()),
    { records: ['KH0002', 'KH0001'], config: true, all: false });

  const revision = dungHop({ sheets: ['Config', 'Log'], props: { reloadRevision: '7', reloadChangedAt: '1234', dirtyRecords: '["KH0001"]' } });
  check(so, 'reloadStateRead giữ revision, changedAt và scope records',
    revision.hop.reloadStateRead(),
    { revision: 7, changedAt: 1234, records: ['KH0001'], entities: [], category: false, config: false, schema: false, allCore: false, all: false, viewsStaleRevision: 0 });
  check(so, 'clear records sai revision không được xóa signal',
    revision.hop.dirtyStateClearRecords(['KH0001'], 6).records,
    ['KH0001']);
  check(so, 'clear records đúng revision mới xóa signal',
    revision.hop.dirtyStateClearRecords(['KH0001'], 7).records,
    []);

  const stale = dungHop({ sheets: ['Config', 'Log'], props: { reloadRevision: '7' } }).hop;
  stale.viewLedgerWrite('!Lead', { data: 7, ok: true });
  stale.viewLedgerWrite('!Chăm sóc', { data: 7, ok: true });
  trongLanChay(stale, () => stale.dirtyStateMarkSignal({ records: ['KH0001'], allViews: true }));
  const afterRecord = stale.reloadStateRead();
  check(so, 'signal dữ liệu kho nâng mốc cũ bằng đúng revision vừa tăng, mọi sheet đã vẽ trước đó thành cũ',
    [afterRecord.revision, afterRecord.viewsStaleRevision, stale.viewIsStale('!Lead'), stale.viewIsStale('!Chăm sóc')],
    [8, 8, true, true]);
  stale.viewLedgerWrite('!Lead', { data: 8, ok: true });
  check(so, 'vẽ một sheet chỉ làm sheet đó mới, sheet khác vẫn cũ',
    [stale.viewIsStale('!Lead'), stale.viewIsStale('!Chăm sóc')], [false, true]);
  stale.viewLedgerWrite('!Lead', { data: 8, ok: false, error: 'lỗi lọc', at: 0 });
  check(so, 'lượt thử hỏng ở đúng dữ liệu mới nhất vẫn là sheet cũ (tab giữ cam, Sidebar báo)', stale.viewIsStale('!Lead'), true);
  check(so, 'sheet chưa từng vẽ là cũ kể cả khi chưa có signal nào',
    dungHop({ sheets: ['Config', 'Log'] }).hop.viewIsStale('!Mới'), true);
  const onlyRecords = dungHop({ sheets: ['Config', 'Log'], props: { reloadRevision: '3', viewsStaleRevision: '2' } }).hop;
  trongLanChay(onlyRecords, () => onlyRecords.dirtyStateMarkSignal({ records: ['KH0001'], allViews: false }));
  check(so, 'signal không mang allViews không đụng mốc cũ của view', onlyRecords.reloadStateRead().viewsStaleRevision, 2);
  check(so, 'quyết định không có signal không bỏ gì vào giỏ và trả false',
    dungHop({ sheets: ['Config', 'Log'] }).hop.dirtyStateMarkDecision({ signal: { records: [] } }), false);

  return so;
}

module.exports = { chay };
