/**
 * Chính sách theo loại sheet của tầng 1 đọc/ghi Sheet (tài liệu 06 Phần 2): sheet nào được nhớ trong tờ nháp của lần gọi, được ghi hay không, ghi có bắt buộc đang cầm khóa tài liệu không. Khai một chỗ để nơi gọi không phải nhớ.
 */

/** `store`: bốn sheet kho; `view`: sheet quản trị tên bắt đầu bằng `!`; `log`: sheet nhật ký (chỉ nối thêm, không ai đọc ngược); `free`: sheet tự do của người dùng. */
function sheetPolicy(sheetName) {
  var layout = SHEET_LAYOUT[sheetName];
  if (layout && layout.plainHeaders) { return { kind: 'log', remembers: false, writable: true, needsLock: false }; }
  if (layout) { return { kind: 'store', remembers: true, writable: true, needsLock: true }; }
  // Sheet `!` chưa được nhớ: bộ vẽ còn gọi thẳng lệnh Google không qua `SheetCellWrite`, nhớ lúc này là đọc giá trị cũ sau lượt vẽ.
  if (String(sheetName || '').charAt(0) === '!') { return { kind: 'view', remembers: false, writable: true, needsLock: true }; }
  return { kind: 'free', remembers: false, writable: false, needsLock: false };
}

/** Chặn trước mọi lệnh ghi của tầng 1: sheet tự do không được ghi; sheet kho và sheet quản trị chỉ ghi khi đang cầm khóa tài liệu, nên quên cầm khóa không có đường ghi được. */
function sheetPolicyAssertWritable(sheet) {
  var name = sheet.getName();
  var policy = sheetPolicy(name);
  if (!policy.writable) { throw new Error('Sheet "' + name + '" là sheet tự do của người dùng, ShinCRM không ghi vào đó.'); }
  if (policy.needsLock && !(DOCUMENT_STORE.docLockDepth > 0)) {
    throw new Error('Ghi sheet "' + name + '" ngoài khóa tài liệu. Việc ghi phải bọc trong documentLockRun.');
  }
}
