/**
 * Nhóm ca kiểm vùng tên của **lớp CSS** — cùng cái bẫy "bản sau lặng lẽ thắng" như vùng tên JavaScript, nhưng không ai canh.
 *
 * Vì sao cần: mọi tệp client bị nhồi vào **một** trang, nên mọi thẻ `<style>` rơi vào **một** bảng luật. Hai tệp khai cùng một tên lớp thì tệp nạp sau thắng ở mọi thuộc tính nó nhắc tới, và trình duyệt coi đó là hợp lệ nên không có một lời cảnh báo nào. `tests/cases/namespace.js` bắt được ca này với tên hàm và tên biến, nhưng nó cắt lấy ruột thẻ `<script>` nên hoàn toàn không thấy CSS.
 *
 * Đúng chuyện đã xảy ra và là lý do tệp này ra đời: `.shin-box` khai ở cả `client/style/components.html` (`display: block`) và `client/screen/statusScreen.html` (`padding: 12px; border: 1px solid`). Tệp màn được `include` ở khu script, tức **sau** toàn bộ `client/style/`, nên bản của màn chặn thắng — và mọi dòng lịch sử trên màn xem mọc thêm một cái khung với lề trong 12 pixel, ăn 26 pixel bề ngang của một sidebar rộng 300. Không có lỗi nào để đọc; nó chỉ hiện ra dưới dạng "tên sản phẩm bị cắt thành Ống t…".
 *
 * Hai phép quét ở đây, cộng phần tự kiểm chính phép quét:
 * một, không tên lớp nào có **luật trần** ở hai tệp khác nhau;
 * hai, mọi tên lớp mà bản khai giao diện gọi bằng `className` đều có luật CSS ở đâu đó.
 *
 * "Luật trần" nghĩa là bộ chọn chỉ có đúng một mắt và mắt đó chỉ có một tên lớp — `.shin-box`, `.shin-box:hover`. Bộ chọn nhiều mắt như `.shin-note .shin-readtext` **không** tính là sở hữu: đó là một luật đè có phạm vi, cố ý, và tính nó vào thì phép quét đầy báo giả rồi không ai đọc nữa.
 */

const { docTep } = require('../lib/load-gas');
const { section, check, checkContains, ghiTruot, ghiDat } = require('../lib/assert');
const { liet } = require('./namespace');

/** Ruột mọi thẻ `<style>` của một tệp client, đã bỏ chú thích CSS. Tệp không có `<style>` thì trả chuỗi rỗng — phần lớn tệp client là vậy. */
function catRuotStyle(raw) {
  const mo = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  const phan = [];
  let khop;
  while ((khop = mo.exec(raw)) !== null) { phan.push(khop[1]); }
  return phan.join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Tên lớp mà một đoạn CSS **sở hữu**: các bộ chọn chỉ có một mắt, và mắt đó chỉ có một tên lớp.
 *
 * Cắt phần thân luật `{...}` trước rồi mới đọc bộ chọn, nên một giá trị như `content: '.x'` không bị đọc thành tên lớp. Bỏ qua khối `@media` và `@keyframes` bằng cách bỏ mọi dòng bắt đầu bằng `@`: phần trăm của keyframes không phải bộ chọn, và một luật trong `@media` vẫn là cùng một tên lớp nên nó không phải ca cần bắt ở đây.
 */
function lopSoHuu(css) {
  const ra = [];
  const mo = /([^{}]+)\{[^{}]*\}/g;
  let khop;

  while ((khop = mo.exec(css)) !== null) {
    khop[1].split(',').forEach((bo) => {
      const sach = bo.trim();
      if (!sach || sach.charAt(0) === '@' || /\d%$/.test(sach)) { return; }
      // Một mắt: không dấu cách, không `>`, `+`, `~`. Bỏ phần giả (`:hover`, `::before`, `:not(...)`) rồi mới đếm tên lớp.
      if (/[\s>+~]/.test(sach)) { return; }
      const cot = sach.replace(/::?[a-z-]+(\([^)]*\))?/gi, '');
      const ten = cot.match(/\.([A-Za-z_][\w-]*)/g);
      if (ten && ten.length === 1 && cot === ten[0]) { ra.push(ten[0].slice(1)); }
    });
  }
  return ra;
}

/** Mọi tên lớp có mặt trong một đoạn CSS, kể cả trong bộ chọn nhiều mắt. Dùng cho phép quét "khai `className` mà không có luật". */
function lopCoLuat(css) {
  const ra = {};
  const mo = /([^{}]+)\{[^{}]*\}/g;
  let khop;
  while ((khop = mo.exec(css)) !== null) {
    (khop[1].match(/\.([A-Za-z_][\w-]*)/g) || []).forEach((t) => { ra[t.slice(1)] = true; });
  }
  return Object.keys(ra);
}

/** Tên lớp mà bản khai giao diện và các hàm slot gọi qua `className: '...'`. Đây là cửa duy nhất để bản khai đặt lớp lên một Block. */
function lopBanKhaiGoi(tepList) {
  const ra = {};
  tepList.forEach((tep) => {
    const mo = /className:\s*'([^']*)'/g;
    let khop;
    while ((khop = mo.exec(docTep(tep))) !== null) {
      khop[1].split(/\s+/).forEach((t) => { if (t) { ra[t] = ra[t] || []; ra[t].push(tep); } });
    }
  });
  return ra;
}

function chay(so) {
  section('Vùng tên lớp CSS — cùng một trang, nên trùng tên là bản nạp sau lặng lẽ thắng');

  const tepClient = liet('client', '.html');
  if (!tepClient.length) {
    return ghiTruot(so, 'có tệp client để quét', ['không thấy tệp nào. Hoặc chưa dựng, hoặc đường quét đã hỏng.']);
  }

  const cssTheoTep = {};
  tepClient.forEach((tep) => {
    const css = catRuotStyle(docTep(tep));
    if (css.trim()) { cssTheoTep[tep] = css; }
  });

  const soTepCoStyle = Object.keys(cssTheoTep).length;
  if (soTepCoStyle < 2) {
    return ghiTruot(so, 'có ít nhất hai tệp client mang CSS', [
      'chỉ thấy ' + soTepCoStyle + ' tệp. Phép quét trùng tên cần ít nhất hai tệp mới có nghĩa, nên đây là dấu hiệu phép cắt <style> đã hỏng.']);
  }

  const trung = timTrung(cssTheoTep);
  if (trung.length) {
    ghiTruot(so, 'không tên lớp nào có luật trần ở hai tệp client', trung);
  } else {
    ghiDat(so, 'không tên lớp nào có luật trần ở hai tệp client (' + soTepCoStyle + ' tệp mang CSS)');
  }

  kiemBanKhai(so, tepClient, cssTheoTep);
  tuKiemPhepQuet(so);
}

/** Ghép sổ sở hữu của mọi tệp lại rồi kể ra các tên đứng hai chỗ. */
function timTrung(cssTheoTep) {
  const chuSoHuu = {};
  const trung = [];

  Object.keys(cssTheoTep).forEach((tep) => {
    lopSoHuu(cssTheoTep[tep]).forEach((ten) => {
      if (chuSoHuu[ten] && chuSoHuu[ten] !== tep) {
        trung.push('."' + ten + '" có luật trần ở cả ' + chuSoHuu[ten] + ' và ' + tep);
      } else {
        chuSoHuu[ten] = tep;
      }
    });
  });
  return trung;
}

/**
 * Mọi tên lớp bản khai gọi qua `className` phải có luật CSS ở đâu đó.
 *
 * Nửa còn lại của cùng một loại lỗi: khai xong mà không tới được màn hình. Gõ `shin-not` thay vì `shin-note` thì bản khai vẫn chạy, Block vẫn dựng, thẻ vẫn mang lớp đó — và hình thức thì không đổi một pixel. Không có gì để đọc ra, đúng loại lỗi tệ nhất với người không đọc được code.
 */
function kiemBanKhai(so, tepClient, cssTheoTep) {
  const coLuat = {};
  Object.keys(cssTheoTep).forEach((tep) => {
    lopCoLuat(cssTheoTep[tep]).forEach((ten) => { coLuat[ten] = true; });
  });

  const goi = lopBanKhaiGoi(tepClient);
  const thieu = Object.keys(goi).filter((ten) => !coLuat[ten]);

  if (thieu.length) {
    ghiTruot(so, 'mọi lớp bản khai gọi qua className đều có luật CSS', thieu.map((ten) =>
      '."' + ten + '" gọi ở ' + goi[ten].join(', ') + ' mà không tệp nào có luật cho nó — khai xong mà hình thức không đổi'));
  } else {
    ghiDat(so, 'mọi lớp bản khai gọi qua className đều có luật CSS (' + Object.keys(goi).length + ' lớp)');
  }
}

/**
 * Tự kiểm chính hai phép quét trên.
 *
 * Một phép quét hỏng thì không đỏ, nó **xanh** — vì nó chẳng tìm thấy gì. Đó là một cái phanh giả, nguy hơn không có phanh, nên bốn ca dưới đây kiểm cả hai chiều: quét bắt được ca thật, và quét không báo giả ở ba lối viết hợp lệ hay gặp.
 */
function tuKiemPhepQuet(so) {
  check(so, 'phép quét bắt được đúng ca đã xảy ra: cùng một tên lớp khai trần ở hai tệp',
    timTrung({ 'a.html': '.shin-box { display: block; }', 'b.html': '.shin-box { padding: 12px; }' }).length, 1);

  check(so, 'luật đè có phạm vi không bị báo giả — `.shin-note .shin-readtext` không phải một lần khai `.shin-readtext`',
    timTrung({ 'a.html': '.shin-readtext { color: red; }', 'b.html': '.shin-note .shin-readtext { color: blue; }' }), []);

  check(so, 'cùng một tên lớp nhiều luật trong cùng một tệp là chuyện thường, không báo',
    timTrung({ 'a.html': '.x { color: red; } .x:hover { color: blue; } .x::before { content: ".y"; }' }), []);

  check(so, 'bộ chọn nhiều mắt vẫn đếm là "có luật", nên một lớp chỉ được đè ở tệp khác không bị báo thiếu',
    lopCoLuat('.shin-note .shin-readtext:not(:empty) { color: red; }').sort(), ['shin-note', 'shin-readtext']);

  check(so, 'phép cắt <style> lấy đúng ruột và bỏ chú thích CSS',
    catRuotStyle('<style>/* .bay { } */\n.thuc { color: red; }</style>').includes('bay'), false);

  // Tệp `client/style/` nào cũng chỉ có `<style>`, còn tệp màn có cả hai thẻ. Kiểm để chắc phép cắt không bỏ sót loại thứ hai.
  check(so, 'phép cắt lấy được cả <style> của tệp màn — tệp có cả hai thẻ là loại tệp gây ra lỗi ban đầu',
    catRuotStyle(docTep('client/screen/statusScreen.html')).includes('.shin-status-box'), true);

  checkContains(so, 'thông báo trượt nói rõ hai tệp nào đang tranh nhau một tên lớp',
    timTrung({ 'a.html': '.shin-box { display: block; }', 'b.html': '.shin-box { padding: 12px; }' }), 'a.html');
}

module.exports = { chay, lopSoHuu, lopCoLuat };
