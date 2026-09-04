/**
 * Bộ kiểm thử chạy bằng Node trên máy, không cần mạng và không cần Google.
 *
 * Vì sao nó tồn tại: Apps Script không có khung kiểm thử, mà phần lớn luật của ShinCRM lại là hàm thuần — vào gì ra nấy, không đụng SpreadsheetApp. Những hàm đó kiểm được ở đây, và đó là cái phanh cho một phiên code chạy không có người ngồi cạnh.
 *
 * Chạy: node tests/run.js
 * Đạt thì mã thoát 0, không đạt thì khác 0 — nên một phiên tự động biết mình vừa làm hỏng cái gì mà không cần hỏi ai.
 */

let passed = 0;
let failed = 0;
const failures = [];

/** So một giá trị với giá trị mong đợi, in ra một dòng đạt hoặc không đạt. */
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log('  ✅ ' + label);
  } else {
    failed += 1;
    failures.push(label);
    console.log('  ❌ ' + label);
    console.log('     mong đợi: ' + JSON.stringify(expected));
    console.log('     nhận được: ' + JSON.stringify(actual));
  }
}

/** Kiểm rằng một lời gọi ném lỗi, và thông báo lỗi có chứa một mẩu chữ nhất định. */
function checkThrows(label, fn, expectedFragment) {
  try {
    fn();
    failed += 1;
    failures.push(label);
    console.log('  ❌ ' + label);
    console.log('     mong đợi ném lỗi, nhưng chạy trót lọt');
  } catch (err) {
    if (String(err.message).includes(expectedFragment)) {
      passed += 1;
      console.log('  ✅ ' + label);
    } else {
      failed += 1;
      failures.push(label);
      console.log('  ❌ ' + label);
      console.log('     lỗi ném ra thiếu mẩu chữ "' + expectedFragment + '": ' + err.message);
    }
  }
}

function section(title) {
  console.log('');
  console.log(title);
}

console.log('ShinCRM — bộ kiểm thử offline');
console.log('='.repeat(60));

// ---------------------------------------------------------------------------
// Bảng ca chuẩn của normalizeText, chép nguyên từ tài liệu 02 Phần 12.
// Hàm này có hai bản sao, một ở server một ở client, và tài liệu bắt hai bản không được lệch nhau trong im lặng. Bảng này là chỗ bắt lệch.
// ---------------------------------------------------------------------------
const NORMALIZE_TEXT_CASES = [
  ['Hà Nội', 'ha noi'],
  ['CÔNG TY TNHH', 'cong ty tnhh'],
  ['  Đà   Nẵng  ', 'da nang'],
  ['Nguyễn Văn Đức', 'nguyen van duc'],
  ['0101-002', '0101-002'],
  ['81. Tiềm năng cao', '81. tiem nang cao'],
  ['', '']
];

section('normalizeText — bảng ca chuẩn của tài liệu 02 Phần 12');

if (typeof globalThis.normalizeText === 'function') {
  NORMALIZE_TEXT_CASES.forEach(([input, expected]) => {
    check('normalizeText(' + JSON.stringify(input) + ')', globalThis.normalizeText(input), expected);
  });
} else {
  console.log('  ⏭  Chưa có hàm normalizeText — chặng 1.1 dựng xong thì bộ kiểm này tự chạy');
}

section('Tổng kết');
console.log('  Đạt: ' + passed + '   Không đạt: ' + failed);

// Không có phép kiểm nào chạy cũng là hỏng. Nếu không chặn ở đây, một lỗi nạp tệp sẽ cho ra "đạt" trong khi thực tế chẳng kiểm gì — một cái phanh giả nguy hơn không có phanh.
if (passed === 0 && failed === 0) {
  console.log('');
  console.log('❌ KHÔNG một phép kiểm nào chạy. Hoặc chưa dựng hàm nào, hoặc đường nạp tệp đã hỏng.');
  process.exit(2);
}

if (failed > 0) {
  console.log('');
  console.log('Các phép kiểm không đạt:');
  failures.forEach((name) => console.log('  - ' + name));
  process.exit(1);
}

process.exit(0);
