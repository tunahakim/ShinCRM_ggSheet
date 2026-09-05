/**
 * Ca kiểm cho `server/util/DateText.js`: biên giới duy nhất giữa `Date` và hai dạng chuỗi thời gian của dự án.
 *
 * Chỗ đáng kiểm nhất ở đây **không** phải phép đổi khuôn — mà là ba luật im lặng khi sai. Một, ô rỗng phải ra chuỗi rỗng chứ không ra chữ `"undefined"`, vì chuỗi đó sẽ hiện lên form như một giá trị người dùng đã gõ. Hai, ô gõ lạ phải đi qua nguyên văn chứ không ném lỗi, vì một ô lạ ở khách thứ chín trăm không được phép làm sập lượt mở sidebar. Ba, `precision` gõ sai **phải** ném lỗi, vì đó là sai bảng khai chứ không phải sai dữ liệu.
 *
 * Điều tệp này **không** chứng minh được, và phải nói ra: `Utilities.formatDate` giả bỏ qua tham số múi giờ, nên xanh ở đây không có nghĩa là cột ngày ghi đúng giờ Việt Nam. Câu đó chỉ trả lời được bằng `probeDateText` trên Google.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('Chuỗi thời gian — hai dạng rộng cố định, và ba luật im lặng khi sai');

  let nen;
  try {
    nen = dungHop({ sheets: [] });
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/util/DateText.js', err);
  }

  const hop = nen.hop;
  const moc = new Date(2026, 0, 5, 7, 30, 45);

  check(so, 'hai dạng chuỗi đúng tài liệu 05 Phần 3', [hop.DATE_TEXT_DAY_FORMAT, hop.DATE_TEXT_MINUTE_FORMAT], ['yyyy-MM-dd', 'yyyy-MM-dd HH:mm']);
  check(so, 'dạng minute KHÔNG có giây', hop.DATE_TEXT_MINUTE_FORMAT.includes(':ss'), false);

  check(so, 'precision day ra YYYY-MM-DD', hop.dateToText(moc, 'day'), '2026-01-05');
  check(so, 'precision minute ra YYYY-MM-DD HH:mm, cắt giây đi', hop.dateToText(moc, 'minute'), '2026-01-05 07:30');

  // Cả bốn ca rỗng đều phải ra chuỗi rỗng. Ra chữ "undefined" hay "null" thì nó sẽ hiện lên form như một giá trị đã gõ,
  // rồi người dùng bấm Lưu và chuỗi đó xuống ô sheet — một giá trị rác tự ghi mình vào dữ liệu thật.
  check(so, 'ô rỗng, null, undefined đều ra chuỗi rỗng',
    [hop.dateToText('', 'day'), hop.dateToText(null, 'day'), hop.dateToText(undefined, 'minute'), hop.dateToText(new Date('không phải ngày'), 'day')],
    ['', '', '', '']);

  check(so, 'ô gõ lạ đi qua nguyên văn đã cắt khoảng trắng, KHÔNG ném lỗi', hop.dateToText('  chưa rõ  ', 'day'), 'chưa rõ');
  check(so, 'ô chứa số cũng đi qua thành chuỗi', hop.dateToText(2026, 'day'), '2026');

  checkThrows(so, 'precision lạ thì ném lỗi có nêu chỗ phải sửa', () => hop.dateToText(moc, 'giây'), 'DataSchema');
  checkThrows(so, 'thiếu precision cũng ném lỗi chứ không đoán', () => hop.dateToText(moc, undefined), 'precision');

  // Vì sao `dateTextIsDate` không dùng `instanceof`: hộp cát `vm` là một vùng chạy (realm) khác, nên nó có `Date` riêng và
  // `moc instanceof Date` bên trong hộp sẽ trả về `false` cho một `Date` sinh ở ngoài. Phép kiểm dưới đây đi đúng đường đó —
  // `moc` dựng bằng `Date` của Node rồi đưa vào hàm chạy trong hộp cát — nên nó xanh chính là bằng chứng phép nhận dạng
  // theo `Object.prototype.toString` chịu được nhiều vùng chạy. Không dựng thêm hộp cát chỉ để bày ra vế ngược lại:
  // thứ đó cần đưa một biến chỉ có trong phép kiểm vào hộp cát, mà một thứ giả không ai kiểm là một chỗ để lỗi nằm im.
  check(so, 'Date sinh ngoài hộp cát vẫn được nhận là Date', hop.dateTextIsDate(moc), true);
  check(so, 'chuỗi và số thì không phải Date', [hop.dateTextIsDate('2026-01-05'), hop.dateTextIsDate(20260105)], [false, false]);

  // Tính chất mà cả dự án dựa vào: hai chuỗi rộng cố định so bằng phép so chữ là ra đúng thứ tự thời gian.
  // Nhờ nó mà dự án không có hàm so sánh hai mốc, và phép sắp `workDate` giảm dần chỉ là `b < a`.
  const sapGiam = ['2026-01-05', '2025-12-31', '2026-01-12', '2026-01-05'].sort((a, b) => (b < a ? -1 : b > a ? 1 : 0));
  check(so, 'so chữ thuần cho ra đúng thứ tự thời gian giảm dần', sapGiam, ['2026-01-12', '2026-01-05', '2026-01-05', '2025-12-31']);
  check(so, 'dạng minute cũng so được bằng phép so chữ', hop.dateToText(new Date(2026, 0, 5, 9, 0), 'minute') > hop.dateToText(new Date(2026, 0, 5, 8, 59), 'minute'), true);

  return so;
}

module.exports = { chay };
