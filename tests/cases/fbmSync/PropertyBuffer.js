/** Kiểm bộ đệm DocumentProperties của đồng bộ FBM: lượt khác ghi trong lúc chờ khóa phải được thấy; lỗi giữa chừng vẫn lưu phần đã ghi và giữ lỗi gốc. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');

async function chay(so) {
  section("FBM sync — bộ đệm kho thuộc tính");
  // Bộ đệm DocumentProperties: lượt khác ghi trong lúc chờ khóa phải được thấy; lỗi giữa chừng vẫn lưu phần đã ghi và giữ lỗi gốc.
  const bufferData = {};
  const buffered = taoHopCat({ FbmSync: {}, PropertiesService: taoPropertiesService({ doc: bufferData }) });
  napServer(buffered, 'fbm_sync/state/PropertyBuffer.js');
  const fs = buffered.FbmSync;
  bufferData.k = 'v1';
  fs.propertyBufferBegin();
  const firstScope = fs.withPropertyBuffer(() => fs.props().getProperty('k'));
  bufferData.k = 'v2';
  const secondScope = fs.withPropertyBuffer(() => fs.props().getProperty('k'));
  fs.propertyBufferEnd();
  check(so, 'bộ đệm kho FBM: lấy khóa lần sau trong cùng lần gọi đọc lại kho, thấy giá trị lượt khác vừa ghi',
    [firstScope, secondScope],
    ['v1', 'v2']);
  bufferData.gone = 'x';
  let workError = null;
  try {
    fs.withPropertyBuffer(() => {
      fs.props().setProperty('k', 'v3');
      fs.props().deleteProperty('gone');
      check(so, 'bộ đệm kho FBM: trong khóa, ghi chỉ chờ, kho chưa đổi', [bufferData.k, bufferData.gone], ['v2', 'x']);
      throw new Error('work-failed');
    });
  } catch (err) { workError = err.message; }
  check(so, 'bộ đệm kho FBM: phần việc lỗi giữa chừng vẫn ghi gộp phần đã ghi và ném nguyên lỗi gốc',
    [workError, bufferData.k, 'gone' in bufferData, buffered.DOCUMENT_STORE.lockDepth],
    ['work-failed', 'v3', false, 0]);
}

module.exports = { chay };
