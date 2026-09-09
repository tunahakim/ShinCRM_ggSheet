/**
 * Nhóm ca kiểm kỷ luật vùng tên toàn cục — cái bẫy số một của Apps Script.
 *
 * Apps Script không có `import` và không có `module`. Mọi tệp máy chủ dùng chung **một** vùng tên; mọi tệp client được nhồi vào cùng **một** trang nên cũng vậy. Hệ quả: hai tệp khai cùng một tên thì bản nạp sau lặng lẽ thắng, không một lời cảnh báo. Đây là loại lỗi đắt nhất vì nó không hiện ra ở chỗ mình vừa sửa.
 *
 * Tệp này quét khai báo ở cột 0 của mọi tệp trong dự án và bắt hai thứ:
 * một, cùng một tên khai ở hai tệp; hai, tệp lõi có nhắc tới `SYNC_SCHEMA` hoặc `FbmSync` — phép tự kiểm mà tài liệu 09 Phần 13 đòi, vì chiều phụ thuộc một hướng giữa lõi và module đồng bộ là kỷ luật chứ không phải cơ chế, máy không chặn hộ.
 *
 * Phép quét bằng biểu thức chính quy chứ không phân tích cú pháp. Nó chỉ đúng khi mọi khai báo tầng ngoài cùng đều bắt đầu ở cột 0 — và đó là quy ước của dự án này, nên phép quét thô mà đọc được thì hơn một bộ phân tích đầy đủ mà không ai mở ra xem.
 */

const fs = require('fs');
const path = require('path');
const { GAS_DIR, catRuotScript } = require('../lib/load-gas');
const { stripComments } = require('../lib/strip-comments');
const { section, check, ghiTruot, ghiDat } = require('../lib/assert');

/** Khai báo ở cột 0: `var TÊN` hoặc `function TÊN(`. */
const MO_KHAI_BAO = /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)|^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;

/** Liệt kê tệp theo đuôi trong một thư mục con của dự án GAS. Thư mục không có thì trả về mảng rỗng, vì có thư mục chưa dựng là chuyện bình thường. */
function liet(thuMuc, duoi) {
  const goc = path.join(GAS_DIR, thuMuc);
  if (!fs.existsSync(goc)) { return []; }

  const ra = [];
  (function di(hienTai) {
    fs.readdirSync(hienTai, { withFileTypes: true }).forEach((muc) => {
      const day = path.join(hienTai, muc.name);
      if (muc.isDirectory()) { di(day); }
      else if (muc.name.endsWith(duoi)) { ra.push(path.relative(GAS_DIR, day).split(path.sep).join('/')); }
    });
  })(goc);
  return ra.sort();
}

/** Lấy danh sách tên khai báo ở tầng ngoài cùng của một đoạn mã. */
function tenKhaiBao(code) {
  const ten = [];
  let khop;
  MO_KHAI_BAO.lastIndex = 0;
  while ((khop = MO_KHAI_BAO.exec(code)) !== null) {
    ten.push(khop[1] || khop[2]);
  }
  return ten;
}

/**
 * Đọc phần mã thật của một tệp: tệp `.html` thì cắt ruột thẻ `<script>`, tệp `.js` thì lấy nguyên.
 *
 * Tệp client chỉ có `<style>` — `client/style/tokens.html` và `client/style/frame.html` — không khai tên nào nên trả về chuỗi rỗng. Nhưng tệp **không có cả hai** thẻ thì ném lỗi: một tệp client rỗng ruột là tệp bị nhúng vào trang mà chẳng đưa gì vào, và nó sẽ lặng lẽ không làm gì thay vì báo lỗi ở chỗ dùng.
 */
function docMa(duongDanTuongDoi) {
  const raw = fs.readFileSync(path.join(GAS_DIR, duongDanTuongDoi), 'utf8');
  if (!duongDanTuongDoi.endsWith('.html')) { return raw; }

  if (/<script\b/i.test(raw)) { return catRuotScript(raw, duongDanTuongDoi); }
  if (/<style\b/i.test(raw)) { return ''; }

  throw new Error('Tệp client "' + duongDanTuongDoi + '" không có thẻ <script> cũng không có thẻ <style>. Nhúng nó vào trang thì không đưa gì vào cả.');
}

/** Kiểm một vùng tên: không tên nào được khai ở hai tệp. */
function kiemMotVungTen(so, nhan, tepList) {
  if (!tepList.length) {
    ghiTruot(so, nhan + ' — có tệp để quét', ['không thấy tệp nào. Hoặc chưa dựng, hoặc đường quét đã hỏng.']);
    return;
  }

  const chuSoHuu = {};
  const trung = [];

  tepList.forEach((tep) => {
    tenKhaiBao(docMa(tep)).forEach((ten) => {
      if (chuSoHuu[ten]) {
        trung.push('"' + ten + '" khai ở cả ' + chuSoHuu[ten] + ' và ' + tep);
      } else {
        chuSoHuu[ten] = tep;
      }
    });
  });

  if (trung.length) {
    ghiTruot(so, nhan + ' — không tên nào khai ở hai tệp', trung);
  } else {
    ghiDat(so, nhan + ' — ' + tepList.length + ' tệp, ' + Object.keys(chuSoHuu).length + ' tên, không trùng tên nào');
  }
}

function chay(so) {
  section('Vùng tên toàn cục — Apps Script không có import nên đây là kỷ luật, không phải cơ chế');

  const tepMayChu = liet('server', '.js').concat(liet('fbm_sync', '.js'));
  const tepClient = liet('client', '.html');

  kiemMotVungTen(so, 'vùng tên máy chủ', tepMayChu);
  kiemMotVungTen(so, 'vùng tên sidebar', tepClient);

  // Phép kiểm chiều phụ thuộc bên dưới đứng trên vai `stripComments`, nên kiểm chính nó trước.
  // Ba ca: chú thích dòng, chú thích khối, và chuỗi có chứa thứ trông như chú thích — ca thứ ba là ca dễ làm hỏng nhất.
  check(so, 'stripComments bỏ chú thích dòng', stripComments('var a = 1; // SYNC_SCHEMA').includes('SYNC_SCHEMA'), false);
  check(so, 'stripComments bỏ chú thích khối', stripComments('/* SYNC_SCHEMA */ var a = 1;').includes('SYNC_SCHEMA'), false);
  check(so, 'stripComments giữ nguyên chuỗi trông như chú thích', stripComments('var a = "// SYNC_SCHEMA";').includes('SYNC_SCHEMA'), true);
  check(so, 'stripComments giữ nguyên số dòng', stripComments('a\n/* x\ny */\nb').split('\n').length, 4);

  // Chiều phụ thuộc một hướng, tài liệu 09 Phần 13 và tài liệu 03 Phần 1: fbm_sync đọc được DATA_SCHEMA, lõi không đọc được SYNC_SCHEMA.
  // Chỉ quét phần mã. Docstring của tệp lõi ĐƯỢC phép nhắc tới tên bảng kia, và nên nhắc: giải thích vì sao chỗ này cố ý không đọc nó là thứ đáng có nhất trong tệp.
  // Entry point FBM nằm trong server/service nhưng thuộc module đồng bộ, không phải lõi độc lập.
  const tepLoi = liet('server', '.js').concat(tepClient)
    .filter((tep) => !/server[\\/]service[\\/]FbmSyncService\.js$/.test(tep));
  const viPham = tepLoi.filter((tep) => /SYNC_SCHEMA|FbmSync/.test(stripComments(docMa(tep))));

  if (viPham.length) {
    ghiTruot(so, 'không mã lõi nào nhắc tới SYNC_SCHEMA hoặc FbmSync', viPham.map((tep) => tep + ' có nhắc tới'));
  } else {
    ghiDat(so, 'không mã lõi nào nhắc tới SYNC_SCHEMA hoặc FbmSync (' + tepLoi.length + ' tệp lõi)');
  }

  // Phép quét trên chỉ có giá trị nếu nó thật sự tìm được chuỗi đó ở chỗ có. Kiểm chính phép quét.
  const tepDongBo = liet('fbm_sync', '.js');
  check(so, 'phép quét tìm được SYNC_SCHEMA trong mã của chính tệp khai nó',
    tepDongBo.filter((tep) => /SYNC_SCHEMA/.test(stripComments(docMa(tep)))).length > 0, true);

  kiemDuDuongNhung(so, tepClient);
}

/**
 * Mọi tệp client đều có một dòng `include` trong `Sidebar.html`, và mọi dòng `include` đều trỏ tới một tệp có thật.
 *
 * Đây là **phép kiểm offline duy nhất** bắt được một dòng `include` bị thiếu. Hộp cát của các nhóm ca khác tự liệt kê tệp nó cần, nên một tệp không được nhúng vẫn kiểm xanh ở đây rồi im lặng vắng mặt trên Google — hàm trong đó thành `is not defined`, hoặc tệ hơn: rơi vào một nhánh dò bằng `typeof` và bị bỏ qua không một lời nào. `ingestCore` có đúng một nhánh như thế cho ba bảng khai giao diện, và nó chỉ an toàn nhờ phép kiểm này.
 */
function kiemDuDuongNhung(so, tepClient) {
  const raw = fs.readFileSync(path.join(GAS_DIR, 'client/Sidebar.html'), 'utf8');
  const mo = /include\(\s*['"]([^'"]+)['"]\s*\)/g;
  const daNhung = [];
  let khop;
  while ((khop = mo.exec(raw)) !== null) { daNhung.push(khop[1]); }

  const canNhung = tepClient.filter((tep) => tep !== 'client/Sidebar.html');
  const thieu = canNhung.filter((tep) => daNhung.indexOf(tep.replace(/\.html$/, '')) === -1);
  const treoLo = daNhung.filter((duong) => canNhung.indexOf(duong + '.html') === -1);

  if (thieu.length || treoLo.length) {
    ghiTruot(so, 'Sidebar.html nhúng đủ và chỉ nhúng tệp có thật', [].concat(
      thieu.map((tep) => tep + ' không có dòng include nào — trên Google nó vắng mặt hoàn toàn'),
      treoLo.map((duong) => "include('" + duong + "') trỏ tới tệp không có")));
  } else {
    ghiDat(so, 'Sidebar.html nhúng đủ ' + canNhung.length + ' tệp client, không dòng nào trỏ vào chỗ trống');
  }

  // Đuôi tệp trong `include` là lỗi chỉ lộ ra lúc chạy thật, vì tên tệp trên Google không có đuôi.
  check(so, 'không dòng include nào mang đuôi tệp', daNhung.filter((d) => /\.html$|\.js$/.test(d)), []);
}

module.exports = { chay, liet, tenKhaiBao };
