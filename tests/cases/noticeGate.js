/**
 * Ca kiểm cổng thông báo `server/notice/NoticeGate.js`: mỗi việc một thông báo, hết theo cách hết của loại, không ném lỗi, không còn đường báo cũ. Tài liệu 10 Phần 8.
 */

const fs = require('fs');
const path = require('path');
const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

const GAS = path.join(__dirname, '..', '..', '1_ShinCRM_GAS');

function cacTep(thuMuc, goc) {
  return fs.readdirSync(thuMuc, { withFileTypes: true }).flatMap((muc) => {
    const day = path.join(thuMuc, muc.name);
    if (muc.isDirectory()) { return cacTep(day, goc); }
    return /\.(js|html)$/.test(muc.name) ? [path.relative(goc, day).split(path.sep).join('/')] : [];
  });
}

function docLog(nen) {
  nen.hop.flushLog();
  const sheet = nen.Log.sheet;
  const dau = nen.hop.SHEET_LAYOUT.Log.firstDataRow;
  if (sheet.getLastRow() < dau) { return []; }
  return sheet.getRange(dau, 1, sheet.getLastRow() - dau + 1, 9).getValues().map((row) => row.join('|'));
}

function chay(so) {
  section('Cổng thông báo — mỗi việc một thông báo, hết theo loại, không ném lỗi');
  let nen;
  try { nen = dungHop({ sheets: ['Config', 'Log'] }); } catch (err) { return ghiLoiNap(so, 'nạp cổng thông báo', err); }
  const hop = nen.hop;
  const khoa = (k) => nen.props['NOTICE:' + k];
  const loi = { topic: 'entry_failure', scope: 'shinOnEdit', source: 'core', title: 'Lỗi A', lines: ['Việc gây ra: shinOnEdit'] };

  check(so, 'phát lần đầu trả true và ghi một khóa riêng NOTICE:<topic>:<scope>', [hop.noticeRaise(loi), typeof khoa('entry_failure:shinOnEdit')], [true, 'string']);
  const ghiTruoc = nen.stubs._khoDem.ghi;
  check(so, 'phát lại đúng nội dung trả false và không ghi kho', [hop.noticeRaise(loi), nen.stubs._khoDem.ghi - ghiTruoc], [false, 0]);
  hop.noticeRaise(Object.assign({}, loi, { title: 'Lỗi B' }));
  check(so, 'cùng việc phát nội dung mới thì ghi đè, không thêm thông báo', [hop.noticeList().length, hop.noticeList()[0].title], [1, 'Lỗi B']);
  check(so, 'mức độ và cách hết lấy từ NOTICE_TOPICS, bên phát không tự chọn', [hop.noticeList()[0].level, hop.noticeList()[0].clear], ['error', 'on_success']);

  hop.noticeRaise({ topic: 'filter_reference', scope: '', source: 'core', title: 'Bảng tra' });
  hop.noticeRaise({ topic: 'memo_corrupt', scope: 'viewLedger', source: 'document_store', title: 'Bộ nhớ hỏng' });
  check(so, 'danh sách xếp lỗi trước, cảnh báo, rồi thông tin', hop.noticeList().map((n) => n.level), ['error', 'warning', 'info']);
  check(so, 'liệt kê không xóa thông báo', hop.noticeList().length, 3);

  check(so, 'giải đúng việc trả thông báo cũ rồi xóa khóa', [hop.noticeResolve('entry_failure', 'shinOnEdit').title, khoa('entry_failure:shinOnEdit')], ['Lỗi B', undefined]);
  check(so, 'giải việc không có thông báo trả null', hop.noticeResolve('entry_failure', 'shinOnEdit'), null);
  hop.noticeRaise(loi);
  check(so, 'bấm ✕ được cho mọi thông báo, cả loại tự hết', [hop.noticeDismiss('entry_failure:shinOnEdit'), hop.noticeDismiss('filter_reference:'), hop.noticeDismiss('khong:co'), hop.noticeDismiss('')], [true, true, false, false]);

  section('Cổng thông báo — runEntryPoint phát khi lỗi, tự gỡ khi chạy lại thành công');
  checkThrows(so, 'cửa vào lỗi vẫn ném lại cho bên gọi', () => hop.runEntryPoint('shinRenderCurrentView', 'core', () => { throw new Error('lỗi vẽ'); }), 'lỗi vẽ');
  check(so, 'lỗi cửa vào thành thông báo entry_failure theo tên cửa vào', [khoa('entry_failure:shinRenderCurrentView') !== undefined, hop.noticeList().filter((n) => n.scope === 'shinRenderCurrentView')[0].title], [true, 'lỗi vẽ']);
  hop.runEntryPoint('shinRenderCurrentView', 'core', () => true);
  check(so, 'chạy lại thành công thì thông báo tự hết', khoa('entry_failure:shinRenderCurrentView'), undefined);
  check(so, 'tự hết ghi một dòng Log "Đã hết lỗi"', docLog(nen).filter((r) => r.indexOf('Đã hết lỗi: lỗi vẽ') >= 0).length, 1);

  section('Cổng thông báo — kho hỏng, loại lạ, trần, che bí mật');
  nen.props['NOTICE:entry_failure:hong'] = '{không phải JSON';
  const sauHong = hop.noticeList();
  check(so, 'khóa hỏng bị xóa và thay bằng thông báo notice_corrupt, không ném',
    [nen.props['NOTICE:entry_failure:hong'], sauHong.some((n) => n.topic === 'notice_corrupt' && n.scope === 'entry_failure:hong')], [undefined, true]);
  hop.noticeDismiss('notice_corrupt:entry_failure:hong');

  check(so, 'loại lạ vẫn lưu (mức lỗi, bấm ✕ mới hết) và ghi Log để lộ chỗ gọi sai',
    [hop.noticeRaise({ topic: 'loai_la', scope: 'x', title: 't' }), hop.noticeList().filter((n) => n.topic === 'loai_la').map((n) => [n.level, n.clear])[0], docLog(nen).some((r) => r.indexOf('NOTICE_TOPIC_UNKNOWN') >= 0)],
    [true, ['error', 'dismiss'], true]);
  hop.noticeDismiss('loai_la:x');

  const dai = 'x'.repeat(hop.SETTINGS.NOTICE_CHARS_MAX + 100);
  hop.noticeRaise({ topic: 'entry_failure', scope: 'dai', title: 'token=abc123 hết hạn', lines: [dai, 'dòng sau'] });
  const thongBaoDai = hop.noticeList().filter((n) => n.scope === 'dai')[0];
  const tongChu = thongBaoDai.title.length + thongBaoDai.lines.slice(0, -1).join('').length + thongBaoDai.hint.length;
  check(so, 'chữ được che bí mật và cắt theo trần ký tự chung', [thongBaoDai.title.indexOf('abc123'), tongChu <= hop.SETTINGS.NOTICE_CHARS_MAX, /cắt bớt/.test(thongBaoDai.lines[thongBaoDai.lines.length - 1])], [-1, true, true]);
  hop.noticeDismiss('entry_failure:dai');

  for (let i = 0; i < hop.SETTINGS.NOTICE_MAX + 2; i += 1) { hop.noticeRaise({ topic: 'memo_corrupt', scope: 'k' + i, title: 't' + i }); }
  const conLai = Object.keys(nen.props).filter((k) => k.indexOf('NOTICE:') === 0);
  check(so, 'vượt trần số thông báo thì gỡ bớt, kho không phình', conLai.length <= hop.SETTINGS.NOTICE_MAX, true);

  const goc = hop.documentProps;
  hop.documentProps = () => { throw new Error('kho chết'); };
  check(so, 'kho không đọc được: bốn hàm cổng không ném, danh sách trả một thông báo notice_unreadable',
    [hop.noticeRaise(loi), hop.noticeResolve('a', 'b'), hop.noticeDismiss('a:b'), hop.noticeList().map((n) => n.topic)], [true, null, false, ['notice_unreadable']]);
  hop.documentProps = goc;

  section('Cổng thông báo — không còn đường báo cũ');
  const tep = cacTep(GAS, GAS).filter((rel) => rel.indexOf('server/') === 0 || rel.indexOf('fbm_sync/') === 0);
  const noi = (re) => tep.filter((rel) => re.test(fs.readFileSync(path.join(GAS, rel), 'utf8')));
  check(so, 'không tệp GAS nào còn kho chờ hay ba kênh cũ', noi(/LOG_PENDING|ERROR_CHANNEL|errorPendingPush|takePendingMessages|reportError\(|entryFailures/), []);
  // Hai hộp thoại hỏi ý (tạo sheet xem, đặt lại Config) chưa phải thông báo; mục bỏ Config và mục làm lại UI thay chúng.
  check(so, 'chỉ còn Menu.js dùng hộp thoại của Sheet', noi(/getUi\(\)\.alert|\.alert\(|\.prompt\(|\.toast\(/), ['server/entry/Menu.js']);
}

module.exports = { chay };
