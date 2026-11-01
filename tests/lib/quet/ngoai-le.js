/**
 * Danh sách ngoại lệ chỉ được co lại: so vi phạm quét được với số đã ghi cho từng tệp. Vi phạm mới, số tăng, số giảm mà chưa hạ, tệp hết vi phạm mà chưa xóa đều là lỗi, nên danh sách không thể lặng lẽ phình ra hay đứng yên khi code đã sạch.
 */

/** So vi phạm thật với ngoại lệ đã ghi; trả danh sách thông báo lỗi (rỗng là đạt). Sắp theo tên tệp để kết quả ổn định. */
function compareExceptions(ruleId, actual, listed) {
  const problems = [];
  Object.keys(actual).sort().forEach((file) => {
    const have = actual[file].length;
    if (!Object.prototype.hasOwnProperty.call(listed, file)) {
      problems.push(ruleId + ': vi phạm mới ở ' + file + ' (' + have + '): ' + actual[file].map((v) => 'dòng ' + v.line + ' `' + v.text + '`').join(' | '));
    } else if (have > listed[file]) {
      problems.push(ruleId + ': ' + file + ' có ' + have + ' vi phạm, nhiều hơn ' + listed[file] + ' đã ghi; vi phạm ở dòng ' + actual[file].map((v) => v.line).join(', '));
    } else if (have < listed[file]) {
      problems.push(ruleId + ': ' + file + ' đã giảm, hạ số trong danh sách ngoại lệ xuống ' + have);
    }
  });
  Object.keys(listed).sort().forEach((file) => {
    if (!actual[file]) { problems.push(ruleId + ': ' + file + ' không còn vi phạm, xóa khỏi danh sách ngoại lệ'); }
  });
  return problems;
}

module.exports = { compareExceptions };
