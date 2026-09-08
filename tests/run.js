/**
 * Bộ kiểm thử chạy bằng Node trên máy, không cần mạng và không cần Google.
 *
 * Vì sao nó tồn tại: Apps Script không có khung kiểm thử, mà phần lớn luật của ShinCRM lại là hàm thuần — vào gì ra nấy, không đụng SpreadsheetApp. Những hàm đó kiểm được ở đây, và đó là cái phanh cho một phiên code chạy không có người ngồi cạnh.
 *
 * Tệp này chỉ làm một việc: gọi từng nhóm ca rồi in tổng kết. Ca kiểm nằm ở `tests/cases/`, mỗi tệp một chủ đề; các phép so nằm ở `tests/lib/assert.js`. Thêm một chủ đề thì thêm một tệp vào `cases/` rồi thêm một dòng vào danh sách dưới đây — không sửa gì khác.
 *
 * Chạy: node tests/run.js
 * Đạt thì mã thoát 0, không đạt thì khác 0 — nên một phiên tự động biết mình vừa làm hỏng cái gì mà không cần hỏi ai.
 *
 * Hai bộ kiểm cần mạng nằm riêng, cố ý không gọi từ đây: `node tests/check-sheet.js` đối chiếu hàng 1 của sheet thật, `node tests/gas.js <tên hàm>` chạy một hàm thật trên Google. Trộn vào đây thì mất mạng là bộ kiểm đỏ, và một bộ kiểm đỏ vì lý do không liên quan tới code là bộ kiểm người ta sẽ thôi đọc.
 */

const { taoSo, section } = require('./lib/assert');

const NHOM_CA = [
  require('./cases/textNormalize'),
  require('./cases/schemaCheck'),
  require('./cases/namespace'),
  require('./cases/settings'),
  require('./cases/logMask'),
  require('./cases/logGate'),
  require('./cases/dateText'),
  require('./cases/sheetGrid'),
  require('./cases/cellBudget'),
  require('./cases/setupSheets'),
  require('./cases/columnFormat'),
  require('./cases/entityRead'),
  require('./cases/categoryRead'),
  require('./cases/configRead'),
  require('./cases/dirtyState'),
  require('./cases/userPrefs'),
  require('./cases/schemaAccess'),
  require('./cases/fieldLogic'),
  require('./cases/loadService'),
  require('./cases/selectionService'),
  require('./cases/ramStore'),
  require('./cases/screenState'),
  require('./cases/prefs'),
  require('./cases/callTiming'),
  require('./cases/bootstrap'),
  require('./cases/uiBuilder'),
  require('./cases/blockKeys'),
  require('./cases/cssClass'),
  require('./cases/uiSchema'),
  require('./cases/renderEngine'),
  require('./cases/slots'),
  require('./cases/viewScreen'),
  require('./cases/formScreen'),
  require('./cases/actions'),
  require('./cases/selectionPoll'),
  require('./cases/viewLanguage')];

console.log('ShinCRM — bộ kiểm thử offline');
console.log('='.repeat(60));

const so = taoSo();
NHOM_CA.forEach((nhom) => nhom.chay(so));

section('Tổng kết');
console.log('  Đạt: ' + so.passed + '   Không đạt: ' + so.failed);

// Không có phép kiểm nào chạy cũng là hỏng. Nếu không chặn ở đây, một lỗi nạp tệp sẽ cho ra "đạt" trong khi thực tế chẳng kiểm gì — một cái phanh giả nguy hơn không có phanh.
if (so.passed === 0 && so.failed === 0) {
  console.log('');
  console.log('❌ KHÔNG một phép kiểm nào chạy. Hoặc chưa dựng hàm nào, hoặc đường nạp tệp đã hỏng.');
  process.exit(2);
}

if (so.failed > 0) {
  console.log('');
  console.log('Các phép kiểm không đạt:');
  so.failures.forEach((name) => console.log('  - ' + name));
  process.exit(1);
}

process.exit(0);
