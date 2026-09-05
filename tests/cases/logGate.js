/**
 * Ca kiểm kỷ luật bộ đệm và số lệnh ghi của `server/log/LogGate.js`. Tài liệu 10 Phần 2 tới Phần 6.
 *
 * Nhóm ca này đứng được là nhờ tệp Sheet giả **tự đếm** từng lệnh `setValues` và `deleteRows`. Nhờ vậy luật "cả lượt chỉ tốn một lệnh ghi" không còn là lời hứa đọc từ con số do chính `LogGate` tự báo, mà là con số đếm từ phía tệp Sheet — nghĩa là cách hỏng kinh điển (ghi từng dòng trong vòng lặp) bị bắt tại đây, thay vì bị phát hiện qua hóa đơn hạn mức sau này.
 *
 * Luật che bí mật nằm ở `logMask.js`, không nằm ở đây.
 */

const { dungHop } = require('../lib/dung-hop');
const { formatDateGia } = require('../lib/gas-stubs');
const { section, check, ghiLoiNap } = require('../lib/assert');

/** Ngày hôm nay theo đúng khuôn khóa dọn log, để phép kiểm chặn được phép quét tuổi log khi nó không phải thứ đang kiểm. */
function homNay() {
  return formatDateGia(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
}

/** Hộp cát có cả `Config` và `Log`, kèm khóa dọn log đã đặt sẵn cho hôm nay. */
function dungLog(thamSo, props) {
  return dungHop({
    sheets: ['Config', 'Log'],
    thamSo: thamSo,
    props: Object.assign({ LOG_LAST_CLEANUP: homNay() }, props || {})
  });
}

/** Đọc các dòng dữ liệu của sheet `Log` giả, mỗi dòng là mảng chín ô. */
function docLog(nen) {
  const sheet = nen.Log.sheet;
  const dau = nen.hop.SHEET_LAYOUT.Log.firstDataRow;
  if (sheet.getLastRow() < dau) { return []; }
  return sheet.getRange(dau, 1, sheet.getLastRow() - dau + 1, 9).getValues();
}

/** Nhồi sẵn dòng vào cuối sheet `Log`. Mỗi phần tử là cặp `[ô Lúc, ô Lý do]` — hai ô duy nhất mà luật cắt log đọc tới. */
function nhoiLog(nen, dong) {
  const sheet = nen.Log.sheet;
  const dau = Math.max(sheet.getLastRow() + 1, nen.hop.SHEET_LAYOUT.Log.firstDataRow);
  const rows = dong.map((cap) => [cap[0], 'core', 'cleanup', '✅ ok', '', '', cap[1], '', '']);
  sheet.getRange(dau, 1, rows.length, 9).setValues(rows);
}

function chay(so) {
  section('Cửa ghi log — bộ đệm, số lệnh ghi, và hai trần cắt log');

  let nen;
  try {
    nen = dungLog();
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/log/LogGate.js', err);
  }

  check(so, 'chín ô đúng thứ tự cột của tài liệu 10 Phần 2',
    nen.hop.logRowCells({ at: '2026-09-05 13:04:05', seq: 1, source: 'core', action: 'save', outcome: '✅ ok', entity: 'customer', recordId: 'CUS-000001', reason: 'Lưu khách', cycleId: 'CYC-1', detail: 'x' }),
    ['2026-09-05 13:04:05', 'core', 'save', '✅ ok', 'customer', 'CUS-000001', 'Lưu khách', 'CYC-1', 'x']);
  check(so, 'khóa tùy chọn không truyền thì ra ô rỗng, không ra chữ "undefined"',
    nen.hop.logRowCells({ at: 'x', source: 'core', action: 'save', outcome: '✅ ok', reason: 'r' }),
    ['x', 'core', 'save', '✅ ok', '', '', 'r', '', '']);

  // Đây là phép kiểm đắt giá nhất của tệp: ba dòng trong một lượt phải ra đúng ba dòng và tốn ĐÚNG MỘT lệnh ghi.
  // Con số lệnh ghi lấy từ bộ đếm của tệp Sheet giả, không lấy từ con số mà LogGate tự báo — nên nó kiểm được cả cách hỏng
  // là ghi từng dòng một trong vòng lặp, cách hỏng không để lại dấu vết nào ngoài hóa đơn hạn mức.
  const motLuot = dungLog();
  const ghiTruoc = motLuot.dem.setValues;
  ['một', 'hai', 'ba'].forEach((thu) => motLuot.hop.logEvent({ source: 'core', action: 'save', outcome: '✅ ok', reason: 'dòng ' + thu }));
  motLuot.hop.logTrace({ source: 'core', action: 'save', outcome: '✅ ok', reason: 'DÒNG VẾT bị bỏ' });
  const daGhi = motLuot.hop.flushLog();
  const bangLuot = docLog(motLuot);

  check(so, 'ba dòng trong một lượt: nhả ra đúng ba dòng', daGhi, 3);
  check(so, 'ba dòng trong một lượt: sheet Log có đúng ba dòng, đúng thứ tự xảy ra',
    bangLuot.map((dong) => dong[6]), ['dòng một', 'dòng hai', 'dòng ba']);
  check(so, 'ba dòng trong một lượt: tốn ĐÚNG MỘT lệnh setValues (đếm từ phía tệp Sheet)',
    motLuot.dem.setValues - ghiTruoc, 1);
  check(so, 'bộ đếm lệnh ghi của chính LogGate cũng nói đúng một lệnh', motLuot.hop.logGateWriteCount(), 1);
  check(so, 'lượt chạy trơn thì dòng vết KHÔNG ra sheet',
    bangLuot.some((dong) => String(dong[6]).indexOf('DÒNG VẾT') !== -1), false);
  check(so, 'nhả bộ đệm rỗng thì không tốn lệnh ghi nào', [motLuot.hop.flushLog(), motLuot.dem.setValues - ghiTruoc], [0, 1]);

  // Vòng đệm vết ra sheet khi lượt chạy có lỗi. Đây là điểm đáng giá nhất của thiết kế: các bước dẫn tới lỗi có sẵn
  // mà không phải bật gì trước đó, nên một lỗi phía FBM không tái tạo được vẫn còn vết để đọc.
  const coLoi = dungLog();
  coLoi.hop.logTrace({ source: 'core', action: 'sync', outcome: '✅ ok', reason: 'vết 1' });
  coLoi.hop.logTrace({ source: 'core', action: 'sync', outcome: '✅ ok', reason: 'vết 2' });
  coLoi.hop.logEvent({ source: 'core', action: 'sync', outcome: '❌ error', reason: 'dòng lỗi' });
  const soDongLoi = coLoi.hop.flushLog();
  check(so, 'lượt chạy có lỗi thì vết ra sheet kèm dòng lỗi, đúng thứ tự nhân quả',
    [soDongLoi, docLog(coLoi).map((dong) => dong[6]).join(' | ')],
    [3, 'vết 1 | vết 2 | dòng lỗi']);

  const tran = dungLog();
  for (let i = 1; i <= 250; i += 1) { tran.hop.logTrace({ source: 'core', action: 'sync', outcome: '✅ ok', reason: 'vết ' + i }); }
  const ghiTruocTran = tran.dem.setValues;
  tran.hop.logEvent({ source: 'core', action: 'sync', outcome: '❌ error', reason: 'dòng lỗi' });
  const soDongTran = tran.hop.flushLog();
  check(so, 'vòng đệm vết giữ đúng LOG_TRACE_BUFFER dòng gần nhất, cũ nhất bị đẩy ra trước',
    [soDongTran, docLog(tran)[0][6], docLog(tran)[99][6]],
    [101, 'vết 151', 'vết 250']);
  check(so, 'ghi 101 dòng vẫn chỉ tốn một lệnh ghi', tran.dem.setValues - ghiTruocTran, 1);

  // Dòng vết bị bỏ vẫn phải có trong console. Đây là lưới cuối: lượt chạy bị Google giết giữa đường thì sheet không có gì,
  // mà console thì còn — nên phản chiếu ra console là thứ duy nhất còn lại của một lượt chạy đứt đoạn.
  check(so, 'mọi dòng đều được phản chiếu ra console, kể cả dòng vết không ra sheet',
    [motLuot.daConsole.length, motLuot.daConsole[3].indexOf('DÒNG VẾT bị bỏ') !== -1],
    [4, true]);

  // Luật 3 của tệp: không kiểm giá trị của bên gọi. Đưa vào một chuỗi thay vì một đối tượng thì vẫn phải ghi được,
  // vì đổi một dòng log lấy một lượt chạy chết là đổi lỗ.
  const saiKieu = dungLog();
  saiKieu.hop.logEvent('quên bọc trong đối tượng');
  check(so, 'bên gọi đưa vào chuỗi thay vì đối tượng thì vẫn ghi được, không ném lỗi',
    [saiKieu.hop.flushLog(), docLog(saiKieu)[0][6]], [1, 'quên bọc trong đối tượng']);

  // Ca hỏng có thật và hay xảy ra nhất: chủ tệp xóa hoặc đổi tên sheet Log. Phải tự dựng lại, không được làm chết lượt chạy.
  const mat = dungHop({ sheets: ['Config'], props: { LOG_LAST_CLEANUP: homNay() } });
  mat.hop.logEvent({ source: 'core', action: 'save', outcome: '✅ ok', reason: 'sau khi dựng lại' });
  const soDongMat = mat.hop.flushLog();
  const logMoi = mat.book.getSheetByName('Log');
  check(so, 'mất sheet Log thì tự dựng lại kèm hàng tiêu đề và dòng đóng băng',
    [soDongMat, mat.dem.insertSheet, logMoi === null ? 'không dựng' : logMoi.getRange(1, 1, 1, 9).getValues()[0][0], logMoi && logMoi.getFrozenRows()],
    [1, 1, 'Lúc', 1]);
  check(so, 'dựng lại thì có nói ra bằng console.error, vì lịch sử log trước đó đã mất',
    mat.daConsole.some((dong) => dong.indexOf('error') === 0 && dong.indexOf('dựng lại') !== -1), true);

  // Luật 2 của tệp: không bao giờ ném lỗi ra ngoài. Ở đây tệp Sheet giả bị làm cho không dựng nổi sheet Log.
  const hong = dungHop({ sheets: ['Config'], props: { LOG_LAST_CLEANUP: homNay() } });
  hong.book.insertSheet = () => { throw new Error('giả vờ Google chặn việc dựng sheet'); };
  hong.hop.logEvent({ source: 'core', action: 'save', outcome: '✅ ok', reason: 'ghi vào chỗ hỏng' });
  let ketQuaHong;
  try { ketQuaHong = hong.hop.flushLog(); } catch (err) { ketQuaHong = 'ĐÃ NÉM LỖI: ' + err; }
  check(so, 'ghi log thất bại thì trả về 0 và im lặng, không ném lỗi lên chỗ gọi', ketQuaHong, 0);
  check(so, 'thất bại vẫn nói ra bằng console.error để còn dò được',
    hong.daConsole.some((dong) => dong.indexOf('flushLog thất bại') !== -1), true);

  // Trần số dòng: cắt cũ nhất trước, bằng ĐÚNG MỘT lệnh deleteRows dù cắt bao nhiêu dòng.
  // Đã đo trên sheet thật: xóa 1 dòng mất 309 ms, xóa 1.000 dòng mất 374 ms — chi phí phẳng, nên gộp một lệnh là đúng.
  const tranDong = dungLog();
  tranDong.hop.SETTINGS.LOG_MAX_ROWS = 5;
  nhoiLog(tranDong, [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ['2026-09-05 08:00:0' + i, 'cũ ' + i]));
  const xoaTruoc = tranDong.dem.deleteRows;
  tranDong.hop.logEvent({ source: 'core', action: 'save', outcome: '✅ ok', reason: 'mới 1' });
  tranDong.hop.logEvent({ source: 'core', action: 'save', outcome: '✅ ok', reason: 'mới 2' });
  tranDong.hop.flushLog();
  check(so, 'quá trần số dòng thì cắt cũ nhất trước, giữ lại đúng LOG_MAX_ROWS dòng mới nhất',
    docLog(tranDong).map((dong) => dong[6]), ['cũ 6', 'cũ 7', 'cũ 8', 'mới 1', 'mới 2']);
  check(so, 'cắt năm dòng chỉ tốn một lệnh deleteRows', tranDong.dem.deleteRows - xoaTruoc, 1);

  // Trần tuổi dòng. Hộp cát này KHÔNG đặt sẵn khóa dọn log, nên phép quét được phép chạy.
  const tuoi = dungHop({ sheets: ['Config', 'Log'] });
  nhoiLog(tuoi, [['2020-01-01 00:00:00', 'cũ 1'], ['2020-01-02 00:00:00', 'cũ 2'], ['2020-01-03 00:00:00', 'cũ 3']]);
  const xoaTruocTuoi = tuoi.dem.deleteRows;
  tuoi.hop.logEvent({ source: 'core', action: 'save', outcome: '✅ ok', reason: 'mới' });
  tuoi.hop.flushLog();
  check(so, 'dòng cũ hơn LOG_RETENTION_DAYS ngày bị xóa, dòng mới ở lại',
    [docLog(tuoi).map((dong) => dong[6]).join(' | '), tuoi.dem.deleteRows - xoaTruocTuoi], ['mới', 1]);
  check(so, 'quét xong thì đặt khóa ngày vào DocumentProperties', tuoi.props.LOG_LAST_CLEANUP, homNay());

  // Khóa ngày phải thật sự chặn. Nếu không thì mỗi lần nhả log là một lần đọc cả cột `Lúc` — trả tiền cho một việc
  // ngày nào cũng chỉ cần làm một lần. Ba dòng cũ thêm vào sau đây phải còn nguyên.
  nhoiLog(tuoi, [['2020-02-01 00:00:00', 'cũ 4']]);
  tuoi.hop.logEvent({ source: 'core', action: 'save', outcome: '✅ ok', reason: 'mới 2' });
  tuoi.hop.flushLog();
  check(so, 'trong cùng một ngày thì không quét tuổi lần thứ hai',
    docLog(tuoi).map((dong) => dong[6]), ['mới', 'cũ 4', 'mới 2']);

  // Không đoán được ngày của một dòng thì không có quyền xóa nó — kể cả khi dòng ngay sau nó rõ ràng là quá cũ.
  const oLucRong = dungHop({ sheets: ['Config', 'Log'] });
  nhoiLog(oLucRong, [['', 'không có ô Lúc'], ['2020-01-01 00:00:00', 'cũ 1']]);
  const xoaTruocRong = oLucRong.dem.deleteRows;
  oLucRong.hop.logEvent({ source: 'core', action: 'save', outcome: '✅ ok', reason: 'mới' });
  oLucRong.hop.flushLog();
  check(so, 'gặp ô Lúc rỗng hoặc sai khuôn thì dừng cắt, không xóa dòng nào',
    [docLog(oLucRong).map((dong) => dong[6]).join(' | '), oLucRong.dem.deleteRows - xoaTruocRong],
    ['không có ô Lúc | cũ 1 | mới', 0]);

  // Lưới sheet hết chỗ. Đây là lỗi đã nổ trên sheet thật, và nó nổ theo cách tệ nhất: `setValues` không tự nới sheet, `getRange`
  // chạm quá hàng cuối là ném lỗi, `flushLog` bắt mọi lỗi rồi đi tiếp — nên log tắt hẳn trong im lặng. Sheet `Log` thật lúc đó
  // có lưới 7 hàng vì phép đo `measureDeleteRows` đã co lưới xuống, nên hoàn cảnh dựng ở đây là hoàn cảnh có thật, không phải giả định.
  const chatCho = dungLog();
  nhoiLog(chatCho, [['2026-09-05 08:00:01', 'cũ 1'], ['2026-09-05 08:00:02', 'cũ 2'], ['2026-09-05 08:00:03', 'cũ 3']]);
  chatCho.Log.sheet._datLuoi(chatCho.Log.sheet.getLastRow());
  const ghiTruocChat = chatCho.dem.setValues;
  chatCho.hop.logEvent({ source: 'core', action: 'save', outcome: '✅ ok', reason: 'ghi khi lưới đã hết chỗ' });
  const daGhiChat = chatCho.hop.flushLog();
  check(so, 'lưới sheet hết chỗ thì tự nới ra rồi ghi, không tắt log trong im lặng',
    [daGhiChat, docLog(chatCho).map((dong) => dong[6]).join(' | ')],
    [1, 'cũ 1 | cũ 2 | cũ 3 | ghi khi lưới đã hết chỗ']);
  check(so, 'nới lưới không phá luật một lượt một lệnh ghi', chatCho.dem.setValues - ghiTruocChat, 1);
  check(so, 'nới thừa LOG_GRID_SLACK hàng nên lượt nhả sau không phải nới lại',
    chatCho.Log.sheet.getMaxRows() - chatCho.Log.sheet.getLastRow() >= chatCho.hop.LOG_GRID_SLACK - 1, true);

  // Hai phép chặn của tệp Sheet giả. Chúng canh chính tệp giả, không canh code dự án: nếu một lần sửa nào làm tệp giả
  // dễ tính hơn Google thì bộ kiểm mất đúng khả năng vừa bắt được lỗi trên, và mất trong im lặng.
  const chanLuoi = dungLog();
  chanLuoi.Log.sheet._datLuoi(5);
  check(so, 'tệp giả ném lỗi khi vùng ghi vượt lưới, đúng như Google',
    (() => { try { chanLuoi.Log.sheet.getRange(5, 1, 2, 9).setValues([[], []]); return 'KHÔNG NÉM LỖI'; } catch (err) { return String(err.message).indexOf('chỉ có 5 hàng') !== -1; } })(),
    true);
  check(so, 'tệp giả từ chối xóa hết các hàng không đóng băng, đúng như Google',
    (() => { try { chanLuoi.Log.sheet.deleteRows(1, 5); return 'KHÔNG NÉM LỖI'; } catch (err) { return String(err.message).indexOf('không thể xóa tất cả các hàng không được cố định') !== -1; } })(),
    true);

  return so;
}

module.exports = { chay };
