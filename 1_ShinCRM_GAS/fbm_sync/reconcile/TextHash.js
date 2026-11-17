/** Hàm băm chữ dùng chung của đồng bộ FBM: dấu vân bản ghi (`hash`) và dấu phạm vi khách (`scopeMark`). Tệp riêng để nơi chỉ cần băm không phải nạp cả bộ dấu vân. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Băm FNV-1a 32 bit của một chuỗi thành 8 chữ hex: dấu nhận dạng ngắn để so, không phải phép bảo vệ. Đổi công thức là đổi mọi dấu vân và dấu phạm vi đã lưu. */
FbmSync.textHash = function (text) {
  var hash = 2166136261, value = String(text);
  for (var i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
  return ('00000000' + hash.toString(16)).slice(-8);
};
