/**
 * Chạy một hàm GAS trên tệp Sheet thật từ dòng lệnh, không cần mở editor và không cần ai bấm Run.
 *
 * Dùng: node tests/gas.js <tênHàm>
 * Ví dụ: node tests/gas.js verifySheets
 *
 * Vì sao có tệp này: phiên code chạy đêm cần một đường chạy hàm thật, và Apps Script API (clasp run-function) không dùng được
 * với script gắn vào tệp Sheet — nó trả lỗi "reading from storage ... NOT_FOUND" trước khi chạm tới code. Đường thay thế là
 * bản triển khai web app trong server/DevRunner.gs. Tệp này chỉ là lớp gọi cho gọn, mọi cổng chặn nằm ở phía GAS.
 *
 * Địa chỉ và thẻ bí mật đọc từ 1_ShinCRM_GAS/.dev-runner.json — tệp đó bị .gitignore chặn, không vào git.
 *
 * Mã thoát: 0 khi phía GAS trả về OK, 1 với mọi trường hợp còn lại. Không có đường nào cho lỗi lặng lẽ thoát 0.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', '1_ShinCRM_GAS', '.dev-runner.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error('Thiếu tệp ' + CONFIG_FILE + '. Nó chứa deploymentId và token của cửa chạy hàm, và không nằm trong git nên máy mới phải tạo lại.');
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (!config.deploymentId || !config.token) {
    throw new Error('Tệp .dev-runner.json thiếu deploymentId hoặc token.');
  }
  return config;
}

async function callGas(functionName) {
  const config = loadConfig();
  const url = 'https://script.google.com/macros/s/' + config.deploymentId + '/exec'
    + '?token=' + encodeURIComponent(config.token)
    + '&fn=' + encodeURIComponent(functionName);

  const response = await fetch(url, { redirect: 'follow' });
  const text = await response.text();

  if (!response.ok) {
    throw new Error('Gọi cửa chạy hàm thất bại: HTTP ' + response.status + '\n' + text.slice(0, 500));
  }
  if (text.trimStart().startsWith('<')) {
    throw new Error('Google trả về trang HTML thay vì văn bản. Thường là bản triển khai đã bị xóa, hoặc chủ tệp cần cấp quyền lại cho script.\n' + text.slice(0, 300));
  }
  return text;
}

async function main() {
  const functionName = process.argv[2];
  if (!functionName) {
    console.error('Thiếu tên hàm. Dùng: node tests/gas.js <tênHàm>');
    process.exit(1);
  }

  let output;
  try {
    output = await callGas(functionName);
  } catch (loi) {
    console.error('❌ ' + loi.message);
    process.exit(1);
  }

  console.log(output);

  // Phía GAS luôn mở đầu bằng OK hoặc LOI. Bất cứ gì khác cũng coi là thất bại, vì nghĩa là hợp đồng đã lệch.
  const firstLine = output.split(/\r?\n/)[0].trim();
  if (firstLine === 'OK') {
    process.exit(0);
  }
  process.exit(1);
}

main();
