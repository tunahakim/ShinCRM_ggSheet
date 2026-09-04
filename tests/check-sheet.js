/**
 * Nghiệm thu khung sheet thật, chạy bằng Node trên máy, không cần mở editor Apps Script.
 *
 * Vì sao nó tồn tại: `verifySheets` trong SetupSheets.gs làm đúng việc này nhưng phải có người bấm chạy trong editor. Tệp Sheet đang mở quyền đọc theo đường liên kết, nên bản dựng hàng 1 tải về được bằng đường xuất CSV của Google — tức một phiên code không có người ngồi cạnh vẫn tự nghiệm thu được khung sheet.
 *
 * Nó đọc bảng khai từ chính SetupSheets.gs chứ không giữ bản sao thứ hai. Hai bản sao là hai chỗ để lệch nhau trong im lặng, đúng cái bệnh mà tài liệu 00 Phần 6 ghi lại từ `Schema.js` và `mapKH`.
 *
 * Chạy: node tests/check-sheet.js
 * Đạt thì mã thoát 0, không đạt thì khác 0.
 *
 * Giới hạn phải biết: đường xuất CSV chỉ đọc, nên tệp này KHÔNG thay được `verifySheets` ở phần đóng băng hàng — CSV không mang thông tin đó. Phần ấy vẫn phải chạy trong editor.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SETUP_FILE = path.join(__dirname, '..', '1_ShinCRM_GAS', 'server', 'SetupSheets.gs');

/**
 * Nạp các biến khai báo của SetupSheets.gs vào một hộp cát.
 * Thân hàm không chạy nên không cần SpreadsheetApp; chỉ các `var` ở tầng ngoài cùng trở thành thuộc tính của hộp cát.
 */
function loadDeclaration() {
  const source = fs.readFileSync(SETUP_FILE, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: SETUP_FILE });
  return sandbox;
}

/** Tách một dòng CSV có bọc nháy kép, kể cả khi giá trị chứa dấu phẩy hoặc nháy kép đôi. */
function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

/**
 * Tải hàng 1 của một sheet về bằng đường xuất CSV. `headers=0` bắt Google coi mọi hàng là dữ liệu, không tự đoán hàng tiêu đề.
 *
 * Nết lạ của Google phải biết: `sheet=` trỏ vào tên không tồn tại thì Google KHÔNG báo lỗi mà lặng lẽ trả về sheet đầu tiên. Nên đừng bao giờ suy ra "tải được là có sheet đó" — chỉ phép so mã cột bên dưới mới nói được điều đó.
 */
async function fetchRow1(fileId, sheetName) {
  const url = 'https://docs.google.com/spreadsheets/d/' + fileId
    + '/gviz/tq?tqx=out:csv&headers=0&sheet=' + encodeURIComponent(sheetName);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Tải sheet ' + sheetName + ' thất bại: HTTP ' + response.status);
  }

  const text = await response.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error('Sheet ' + sheetName + ': Google trả về trang HTML thay vì CSV. Hoặc tên sheet sai, hoặc tệp không còn mở quyền đọc theo liên kết.');
  }

  const firstLine = text.split(/\r?\n/)[0] || '';
  return parseCsvLine(firstLine);
}

/** So hàng 1 đọc về với danh sách mã mong đợi. Trả về danh sách vấn đề, rỗng là đạt. */
function compareCodes(actual, expected) {
  const problems = [];

  expected.forEach((code, index) => {
    if (actual[index] !== code) {
      problems.push('cột ' + (index + 1) + ' mong "' + code + '" nhưng thấy "' + (actual[index] || '') + '"');
    }
  });

  if (actual.length > expected.length) {
    const extra = actual.slice(expected.length).filter((cell) => cell !== '');
    if (extra.length) {
      problems.push('có ' + extra.length + ' cột lạ phía sau: ' + extra.join(', '));
    }
  }

  // Luật một-mã-một-cột của tài liệu 02 Phần 3: trùng mã là báo lỗi, không tự chọn một cột.
  const seen = new Set();
  actual.forEach((code) => {
    if (!code) { return; }
    if (seen.has(code)) { problems.push('mã trùng: ' + code); }
    seen.add(code);
  });

  return problems;
}

async function main() {
  const decl = loadDeclaration();
  const fileId = decl.SETUP_EXPECTED_SPREADSHEET_ID;

  console.log('ShinCRM — nghiệm thu khung sheet thật qua đường xuất CSV');
  console.log('Tệp: ' + fileId);
  console.log('='.repeat(60));

  const targets = Object.keys(decl.SETUP_SHEETS).map((name) => ({
    name,
    expected: decl.SETUP_SHEETS[name].map((column) => column[0])
  }));
  targets.push({ name: 'Log', expected: decl.SETUP_LOG_HEADERS });

  let failed = 0;

  for (const target of targets) {
    let actual;
    try {
      actual = await fetchRow1(fileId, target.name);
    } catch (err) {
      failed += 1;
      console.log('❌ ' + target.name + ' — ' + err.message);
      continue;
    }

    const problems = compareCodes(actual, target.expected);
    if (problems.length) {
      failed += 1;
      console.log('❌ ' + target.name + ' — ' + problems.join('; '));
    } else {
      console.log('✅ ' + target.name + ' — ' + target.expected.length + ' cột đúng');
    }
  }

  console.log('');
  if (failed) {
    console.log('❌ KHÔNG ĐẠT — ' + failed + ' sheet sai');
    process.exit(1);
  }
  console.log('✅ ĐẠT — hàng 1 của cả năm sheet khớp bảng khai trong SetupSheets.gs');
  process.exit(0);
}

main().catch((err) => {
  console.log('❌ Lỗi không lường được: ' + err.message);
  process.exit(2);
});

