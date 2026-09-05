/**
 * Ca kiểm của `client/ram/prefs.html` — ba núm chọn phía client. Tài liệu 07 Phần 6, tài liệu 03 Phần 8.
 *
 * Trọng tâm là ba điều dễ lệch: ngầm định phía client phải khớp ngầm định phía máy chủ (lệch thì lần mở đầu tiên hiện một nấc, bấm một cái là nhảy sang nấc khác mà không ai bấm gì), gói cũ thiếu khối núm không được làm sập lượt mở, và `activityView` ba nấc không được lật như công tắc.
 */

const { napClient, taoHopCat, docTep, catRuotScript } = require('../lib/load-gas');
const { stripComments } = require('../lib/strip-comments');
const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('prefs — ba núm chọn trong RAM sidebar');

  let hop;
  let mayChu;
  try {
    hop = napClient(taoHopCat(), 'client/ram/prefs.html');
    mayChu = dungHop().hop.USER_PREFS;
  } catch (err) {
    return ghiLoiNap(so, 'nạp prefs', err);
  }

  check(so, 'ba núm đúng như bảng khai phía máy chủ, không thiếu không thừa',
    hop.PREFS_NAMES.slice().sort(), Object.keys(mayChu).sort());

  // Ngầm định hai bên phải khớp: lệch thì lần mở đầu tiên hiện một nấc rồi tự nhảy sang nấc khác.
  check(so, 'ngầm định của client khớp từng núm với fallback của máy chủ',
    hop.PREFS_NAMES.map((n) => hop.Prefs[n]), hop.PREFS_NAMES.map((n) => mayChu[n].fallback));

  check(so, 'ba nấc của chế độ xem đúng tập giá trị máy chủ nhận',
    hop.PREFS_ACTIVITY_VIEWS, mayChu.activityView.values);

  // Ingest: gói đầy đủ, gói thiếu núm, gói vắng hẳn.
  hop.prefsReset();
  check(so, 'nhận khối núm từ loadCore thì cả ba đổi theo máy chủ',
    (() => { const p = hop.prefsIngest({ followSelection: false, autoRenderView: false, activityView: 'all' }); return [p.followSelection, p.autoRenderView, p.activityView]; })(),
    [false, false, 'all']);

  hop.prefsReset();
  hop.prefsIngest({ activityView: 'deleted' });
  check(so, 'gói thiếu núm thì núm thiếu giữ ngầm định, không thành undefined',
    [hop.Prefs.followSelection, hop.Prefs.autoRenderView, hop.Prefs.activityView], [true, true, 'deleted']);

  hop.prefsReset();
  hop.prefsIngest(undefined);
  check(so, 'gói vắng hẳn khối núm vẫn giữ ba ngầm định — gói cũ không làm sập lượt mở',
    [hop.Prefs.followSelection, hop.Prefs.autoRenderView, hop.Prefs.activityView], [true, true, 'active']);

  hop.prefsReset();
  hop.prefsIngest({ followSelection: undefined });
  check(so, 'núm mang undefined coi như không khai, giữ ngầm định', hop.Prefs.followSelection, true);

  // prefsSet: đổi RAM ngay, và trả về đủ thứ để ACTIONS gửi lên máy chủ.
  hop.prefsReset();
  check(so, 'đổi núm trả về tên, giá trị và cả khối để bên hành động gửi đi',
    (() => { const r = hop.prefsSet('autoRenderView', false); return [r.name, r.value, r.prefs === hop.Prefs]; })(),
    ['autoRenderView', false, true]);
  check(so, 'đổi núm ăn ngay vào RAM, không đợi máy chủ xác nhận', hop.Prefs.autoRenderView, false);

  check(so, 'đặt chế độ xem sang một nấc hợp lệ thì ăn', hop.prefsSet('activityView', 'deleted').value, 'deleted');

  // prefsToggle: chỉ hai công tắc bật tắt.
  hop.prefsReset();
  check(so, 'lật công tắc hai lần thì về chỗ cũ',
    [hop.prefsToggle('followSelection').value, hop.prefsToggle('followSelection').value], [false, true]);

  checkThrows(so, 'lật chế độ xem thì chặn và chỉ đúng hàm phải gọi',
    () => hop.prefsToggle('activityView'), 'prefsSet');
  checkThrows(so, 'tên núm lạ thì chặn và kể tên ba núm',
    () => hop.prefsSet('tuDungThem', true), 'Ba núm');
  checkThrows(so, 'công tắc bật tắt không nhận chuỗi "true"',
    () => hop.prefsSet('followSelection', 'true'), 'chỉ nhận `true` hoặc `false`');
  checkThrows(so, 'chế độ xem không nhận nấc lạ, và câu lỗi kể ba nấc',
    () => hop.prefsSet('activityView', 'archived'), 'all, active, deleted');

  check(so, 'lời gọi bị chặn không làm bẩn RAM', [hop.Prefs.followSelection, hop.Prefs.activityView], [true, 'active']);

  // Tệp phải nạp được trong hộp cát không có DOM cũng không có google.script.run. Quét phần mã, không quét docstring — docstring giải thích chỗ này cố ý không gọi máy chủ.
  check(so, 'phần mã không gọi máy chủ và không chạm DOM — việc gửi là của ACTIONS',
    /google\.script|document\./.test(stripComments(catRuotScript(docTep('client/ram/prefs.html'), 'prefs'))), false);
}

module.exports = { chay };
