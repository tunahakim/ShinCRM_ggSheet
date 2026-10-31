/**
 * Kho thuộc tính giả (`DocumentProperties`, `UserProperties`, `ScriptProperties`) theo đúng hành vi của `PropertiesService` thật. Mọi hộp cát dựng kho từ đây, không tự dựng kho trong tệp ca.
 *
 * Vì sao chỉ một bản: trước đây mỗi tệp ca tự dựng kho và các bản trả khác nhau (`|| null` biến chuỗi rỗng đã lưu thành `null`, khóa chưa có trả `''`, có bản thiếu `deleteProperty`). Test xanh trên một kho như thế không chứng minh được gì về kho thật.
 *
 * Hành vi theo kho thật: khóa chưa có trả `null`; giá trị lưu thành chuỗi; `setProperty`, `setProperties`, `deleteProperty`, `deleteAllProperties` trả lại chính kho để gọi nối. Kho thiếu phương thức nào thì lời gọi nổ "is not a function", không có đường vá im lặng.
 */

const coKhoa = (duLieu, key) => Object.prototype.hasOwnProperty.call(duLieu, key);

/**
 * Dựng một kho trên đối tượng `duLieu` (giữ nguyên tham chiếu để ca kiểm soi trực tiếp). `dem` là bộ đếm tùy chọn `{ doc, ghi }`; mỗi lệnh gọi kho tăng đúng một, như một lệnh gọi kho thật tốn một lượt. `dem.lenh` đếm riêng từng lệnh theo tên, cho phép kiểm "chỉ một lệnh setProperties, không lệnh xóa nào".
 */
function taoKhoThuocTinh(duLieu, dem) {
  const d = duLieu || {};
  const tinh = dem || { doc: 0, ghi: 0 };
  tinh.lenh = tinh.lenh || {};
  const goc = {
    getProperty: (key) => { tinh.doc += 1; return coKhoa(d, key) ? d[key] : null; },
    getProperties: () => { tinh.doc += 1; return Object.assign({}, d); },
    getKeys: () => { tinh.doc += 1; return Object.keys(d); },
    setProperty: (key, value) => { tinh.ghi += 1; d[key] = String(value); return kho; },
    setProperties: (values, deleteAllOthers) => {
      tinh.ghi += 1;
      if (deleteAllOthers === true) { Object.keys(d).forEach((key) => { delete d[key]; }); }
      Object.keys(values).forEach((key) => { d[key] = String(values[key]); });
      return kho;
    },
    deleteProperty: (key) => { tinh.ghi += 1; delete d[key]; return kho; },
    deleteAllProperties: () => { tinh.ghi += 1; Object.keys(d).forEach((key) => { delete d[key]; }); return kho; }
  };
  const kho = {};
  Object.keys(goc).forEach((ten) => { kho[ten] = function () { tinh.lenh[ten] = (tinh.lenh[ten] || 0) + 1; return goc[ten].apply(null, arguments); }; });
  return kho;
}

/** `PropertiesService` mà mọi lần lấy kho đều ném `thongBao`, cho nhánh "kho của Google gãy". */
function khoGay(thongBao) {
  const nem = () => { throw new Error(thongBao); };
  return { getDocumentProperties: nem, getUserProperties: nem, getScriptProperties: nem };
}

/** `PropertiesService` giả gồm ba kho riêng; hai kho trộn nhau thì một phép kiểm về núm chọn người dùng sẽ ăn phải khóa trạng thái tài liệu. */
function taoPropertiesService(chon) {
  const y = chon || {};
  const doc = taoKhoThuocTinh(y.doc, y.demDoc);
  const user = taoKhoThuocTinh(y.user, y.demUser);
  const script = taoKhoThuocTinh(y.script, y.demScript);
  return {
    getDocumentProperties: () => doc,
    getUserProperties: () => user,
    getScriptProperties: () => script
  };
}

module.exports = { taoKhoThuocTinh, taoPropertiesService, khoGay };
