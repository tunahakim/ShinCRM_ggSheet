/**
 * Bộ nạp code Apps Script vào hộp cát của Node, để bộ kiểm offline gọi được hàm thật chứ không phải chép lại logic sang chỗ khác.
 *
 * Vì sao phải có tệp này: Apps Script không có require, không có module.exports — mọi tệp dùng chung một vùng tên toàn cục.
 * Muốn kiểm hàm thật mà không chép lại code thì phải dựng lại đúng cái vùng tên đó, nên ở đây một hộp cát `vm` được giữ chung
 * cho nhiều tệp, đúng như cách Google chạy chúng.
 *
 * Phía client là tệp `.html` bọc thẻ `<script>`, nên trước khi nạp phải cắt lấy phần ruột. Phép cắt nằm ngay trong tệp này,
 * đọc được và sửa được — khác hẳn với việc đi đoán luật đổi ký tự của Google.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAS_DIR = path.join(__dirname, '..', '..', '1_ShinCRM_GAS');

/**
 * Dựng một hộp cát rỗng. Truyền `stubs` để đặt sẵn những thứ chỉ có trên Google — ví dụ một `SpreadsheetApp` giả.
 * Không đặt sẵn gì thì hàm nào đụng tới `SpreadsheetApp` sẽ ném lỗi "is not defined", và đó là điều mong muốn:
 * hàm thuần thì không được đụng vào nó.
 */
function taoHopCat(stubs) {
  const hopCat = Object.assign({ console: console }, stubs || {});
  vm.createContext(hopCat);
  return hopCat;
}

/**
 * Cắt lấy phần ruột của các thẻ `<script>` trong một tệp client.
 *
 * Mỗi đoạn bị cắt bỏ được thay bằng đúng số dòng trống tương ứng, nên số dòng trong thông báo lỗi vẫn trỏ đúng dòng của tệp gốc.
 * Không có thẻ `<script>` nào thì ném lỗi chứ không trả về chuỗi rỗng: nạp một tệp rỗng trong im lặng là cách chắc chắn nhất
 * để có một bộ kiểm xanh mà chẳng kiểm gì.
 */
function catRuotScript(raw, nhan) {
  const mo = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const phan = [];
  let daDoc = 0;
  let khop;

  const demDong = (text) => text.split('\n').length - 1;

  while ((khop = mo.exec(raw)) !== null) {
    const truoc = raw.slice(daDoc, khop.index + khop[0].indexOf(khop[1]));
    phan.push('\n'.repeat(demDong(truoc)));
    phan.push(khop[1]);
    daDoc = khop.index + khop[0].length;
  }

  if (!phan.length) {
    throw new Error('Tệp client "' + nhan + '" không có thẻ <script> nào. Không nạp được gì, nên coi là lỗi chứ không im lặng.');
  }

  return phan.join('');
}

/** Đọc một tệp trong dự án GAS. Thiếu tệp thì nói rõ thiếu tệp nào, vì đây là lỗi hay gặp nhất lúc mới dựng. */
function docTep(duongDanTuongDoi) {
  const duongDan = path.join(GAS_DIR, duongDanTuongDoi);
  if (!fs.existsSync(duongDan)) {
    throw new Error('Không thấy tệp "' + duongDanTuongDoi + '" trong 1_ShinCRM_GAS. Chưa dựng hoặc đặt sai chỗ.');
  }
  return fs.readFileSync(duongDan, 'utf8');
}

/** Nạp một hoặc nhiều tệp `.js` phía máy chủ vào hộp cát, theo đúng thứ tự truyền vào. */
function napServer(hopCat, ...duongDans) {
  duongDans.forEach((duongDan) => {
    vm.runInContext(docTep(duongDan), hopCat, { filename: duongDan });
  });
  return hopCat;
}

/** Nạp một hoặc nhiều tệp client `.html`, cắt thẻ `<script>` rồi chạy phần ruột trong cùng hộp cát. */
function napClient(hopCat, ...duongDans) {
  duongDans.forEach((duongDan) => {
    const js = catRuotScript(docTep(duongDan), duongDan);
    vm.runInContext(js, hopCat, { filename: duongDan });
  });
  return hopCat;
}

/**
 * Nạp một tệp vào hộp cát **riêng** của nó. Dùng cho phép so hai bản sinh đôi server và client:
 * hai bản cùng tên hàm, nạp chung một hộp thì bản sau ghi đè bản trước và phép so trở thành vô nghĩa.
 */
function napRieng(duongDan, stubs) {
  const hopCat = taoHopCat(stubs);
  return duongDan.endsWith('.html') ? napClient(hopCat, duongDan) : napServer(hopCat, duongDan);
}

module.exports = { GAS_DIR, taoHopCat, napServer, napClient, napRieng, catRuotScript, docTep };
