/**
 * Ca kiểm luật che bí mật của `server/log/LogGate.js`. Tài liệu 10 Phần 7.
 *
 * Đây là nhóm ca đáng có nhất của cả tệp `LogGate`, vì cách nó hỏng là cách hỏng **im lặng và một chiều**: log vẫn ghi, lượt chạy vẫn xanh, chỉ có điều cookie phiên đăng nhập FBM nằm nguyên văn trong một ô sheet — và một bí mật đã ghi ra thì không thu lại được.
 *
 * Tách khỏi `logGate.js` vì hai nhóm này kiểm hai thứ khác nhau: ở đây là hàm thuần, vào gì ra nấy; ở kia là kỷ luật bộ đệm và số lệnh ghi xuống sheet.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check, ghiLoiNap } = require('../lib/assert');

/** Một chuỗi trông đúng như cookie thật của FBM: dài, có tên khóa, có dấu `=`. */
const BI_MAT = 'ASP.NET_SessionId=abc123def456';

function chay(so) {
  section('Che bí mật khi ghi log — sai một lần là bí mật ra sheet không thu lại được');

  let hop;
  try {
    hop = dungHop({ sheets: ['Config'] }).hop;
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/log/LogGate.js', err);
  }

  check(so, 'nhận đúng tên khóa giữ bí mật, kể cả khi tên khóa chỉ chứa từ khóa đó',
    ['cookie', 'payloadCookie', 'ASP.NET_SessionId', 'Authorization', 'access_token', 'ghiChu', 'tenKhachHang', ''].map((ten) => hop.logIsSecretKey(ten)),
    [true, true, true, true, true, false, false, false]);

  // `monkey` chứa `key` nên bị che oan. Ghi hẳn thành phép kiểm chứ không coi là lỗi: danh sách khớp theo chuỗi con là
  // lựa chọn có ý thức, và chiều sai của nó là che oan một ô — chiều sai kia là để lọt một bí mật.
  check(so, 'khớp theo chuỗi con nên có che oan, và đó là chiều sai chấp nhận được', hop.logIsSecretKey('monkey'), true);

  check(so, 'nhãn che giữ độ dài, bốn ký tự đầu và một mã băm bốn chữ số hex',
    /^\[30 ký tự · ASP\. · #[0-9a-f]{4}\]$/.test(hop.logMaskLabel(BI_MAT)), true);
  check(so, 'nhãn che không chứa giá trị thật', hop.logMaskLabel(BI_MAT).indexOf('abc123def456'), -1);
  check(so, 'cùng một bí mật ra cùng một nhãn, nên so được hai lượt chạy',
    hop.logMaskLabel(BI_MAT), hop.logMaskLabel(BI_MAT));
  check(so, 'hai bí mật khác nhau ra hai nhãn khác nhau',
    hop.logMaskLabel('cookie-mot') === hop.logMaskLabel('cookie-hai'), false);
  check(so, 'nhãn che của giá trị rỗng không ném lỗi', hop.logMaskLabel(null).indexOf('0 ký tự'), 1);

  const trongChuoi = hop.logMaskText('cookie=' + BI_MAT + '; ghiChu=không phải bí mật');
  check(so, 'che được bí mật nằm trong chuỗi dạng khóa=giá trị', trongChuoi.indexOf('abc123def456'), -1);
  check(so, 'khóa thường trong cùng chuỗi đó vẫn nguyên vẹn', trongChuoi.indexOf('ghiChu=không phải bí mật') !== -1, true);
  check(so, 'che được cả dạng có nháy kép bọc giá trị',
    hop.logMaskText('token: "xyz987"').indexOf('xyz987'), -1);
  check(so, 'chuỗi không có tên khóa nào thì để nguyên — giới hạn đã biết của phép che theo chuỗi',
    hop.logMaskText('abc123def456'), 'abc123def456');

  const long = hop.logMaskCopy({ khach: { lienHe: { cookie: BI_MAT, ten: 'Hakim' } }, ds: [{ token: 'xyz987' }, 'session=qwe123'] }, 0);
  const longText = JSON.stringify(long);
  check(so, 'che được bí mật nằm sâu trong đối tượng và trong mảng',
    [longText.indexOf('abc123def456'), longText.indexOf('xyz987'), longText.indexOf('qwe123')],
    [-1, -1, -1]);
  check(so, 'giá trị thường nằm cạnh bí mật vẫn nguyên vẹn', long.khach.lienHe.ten, 'Hakim');

  // Một cấu trúc lồng sâu phải dừng, không được chạy tới hết bộ nhớ. Đây là lưới chặn cho ca `detail` tự trỏ vào chính nó.
  check(so, 'lồng quá sâu thì dừng lại chứ không treo lượt chạy',
    JSON.stringify(hop.logMaskCopy({ a: { b: { c: { d: { e: { f: { g: 'x' } } } } } } }, 0)).indexOf('lồng quá sâu') !== -1, true);

  check(so, 'Date thành chuỗi theo đúng khuôn cột Lúc, không thành chuỗi ISO của máy',
    hop.logMaskCopy(new Date(2026, 8, 5, 13, 4, 5), 0), '2026-09-05 13:04:05');
  check(so, 'số và luận lý đi qua nguyên vẹn', hop.logMaskCopy([42, true, null], 0), [42, true, null]);

  const cheThuong = hop.logDetailToText({ cookie: BI_MAT, ghiChu: 'ô này không phải bí mật' }, 'core');
  check(so, 'chế độ thường: chi tiết ra chuỗi đã che', cheThuong.indexOf('abc123def456'), -1);
  check(so, 'chế độ thường: khóa thường vẫn đọc được nguyên văn', cheThuong.indexOf('ô này không phải bí mật') !== -1, true);
  check(so, 'chi tiết rỗng thì ra chuỗi rỗng, không ra chữ "undefined"',
    [hop.logDetailToText(undefined, 'core'), hop.logDetailToText(null, 'core'), hop.logDetailToText('', 'core')],
    ['', '', '']);

  // Chế độ vết ghi nguyên văn — đó là thiết kế, không phải lỗi (tài liệu 10 Phần 7). Kiểm nó ở đây để cái giá của việc
  // bật `LOG_TRACE` là một điều đã chứng minh chứ không phải một điều người ta đoán: bật là tệp Sheet không được chia sẻ.
  const batVet = dungHop({ sheets: ['Config'], thamSo: [['LOG_TRACE', 'core']] }).hop;
  check(so, 'chế độ vết: đúng nguồn được bật thì chi tiết ra NGUYÊN VĂN',
    batVet.logDetailToText({ cookie: BI_MAT }, 'core').indexOf('abc123def456') !== -1, true);
  check(so, 'chế độ vết: nguồn không được bật thì vẫn che',
    batVet.logDetailToText({ cookie: BI_MAT }, 'bot').indexOf('abc123def456'), -1);

  return so;
}

module.exports = { chay };
