/**
 * Hai bảng hàm của cửa ghi: `NORMALIZERS` (làm sạch) và `VALIDATORS` (kiểm định dạng), cộng ba phép mặc định của bộ máy. Tài liệu 03 Phần 6 và 06 Phần 4.
 *
 * Hai bảng chỉ có **một bản, phía máy chủ** — bài học của `normalizeText`: một hàm nuôi hai bản thì sẽ có ngày hai bản lệch nhau trong im lặng. Đừng lẫn với `normalizeText` ở `server/util/TextNormalize.js`: hàm đó đưa chuỗi về dạng **so khớp** và không bao giờ ghi xuống ô, còn các hàm ở đây làm sạch chính giá trị sẽ ghi xuống sheet.
 */

/** Trần độ dài mọi trường chữ. Tài liệu 03 Phần 6: hành vi mặc định của bộ máy, không khai trong schema. */
var FIELD_TEXT_MAX = 50000;

/**
 * Bảng làm sạch, tra theo `normalize` của `DATA_SCHEMA`. Chữ ký: `(giá trị) => giá trị`.
 *
 * `codeLike` **giữ nguyên dấu gạch ngang** — nó là phần thật của mã số thuế chi nhánh (`0101243150-001`), bỏ đi là làm hỏng dữ liệu chứ không phải làm sạch.
 */
var NORMALIZERS = {
  codeLike: function (value) {
    return String(value === null || value === undefined ? '' : value).replace(/[.,\s]/g, '');
  },

  newlineLf: function (value) {
    return String(value === null || value === undefined ? '' : value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
};

/**
 * Bảng kiểm định dạng, tra theo `validate`. Chữ ký: `(giá trị, bản ghi) => null hoặc chuỗi lỗi`.
 *
 * **Giá trị rỗng luôn đạt** — rỗng là việc của `required`, hai phép chạy độc lập nên một trường rỗng không sinh hai dòng lỗi. `taxNumberFormat` chạy sau `codeLike` và cố ý chỉ chặn thứ chắc chắn sai, không đoán mọi khuôn lạ cơ quan thuế có thể đã cấp.
 */
var VALIDATORS = {
  taxNumberFormat: function (value) {
    var text = String(value === null || value === undefined ? '' : value).trim();
    if (!text) { return null; }
    if (/^\d{10}(-\d{3})?$/.test(text)) { return null; }
    return 'Mã số thuế phải là 10 chữ số, hoặc 10 chữ số kèm "-" và 3 chữ số của chi nhánh. Đang là "' + text + '".';
  }
};

/** Ba phép mặc định, áp cho **mọi** giá trị chữ kể cả nguồn `pull`: xuống dòng về `\n`, cắt hai đầu, cắt trần. Tài liệu 06 Phần 4 `[RÀNG BUỘC CỨNG]`. Số và ngày đi qua nguyên vẹn — ép chúng thành chuỗi ở đây là làm cột số trên sheet thành cột chữ. */
function fieldLogicEngineText(value) {
  if (value === null || value === undefined) { return ''; }
  if (typeof value !== 'string') { return value; }

  var text = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  return text.length > FIELD_TEXT_MAX ? text.slice(0, FIELD_TEXT_MAX) : text;
}

/** Làm sạch một giá trị theo khai của trường. Thứ tự không đổi được: **`normalize` chạy trước, cắt khoảng trắng và cắt trần chạy sau** `[RÀNG BUỘC CỨNG]` — hàm làm sạch có quyền sinh khoảng trắng thừa, chiều ngược lại thì không. */
function fieldLogicClean(value, spec, chayNormalize) {
  var ra = value;

  if (chayNormalize && spec && spec.normalize) {
    var ham = NORMALIZERS[spec.normalize];
    if (!ham) {
      throw new Error('Trường "' + (spec.label || '?') + '" khai normalize "' + spec.normalize + '" mà bảng NORMALIZERS không có. Tên có: ' + Object.keys(NORMALIZERS).join(', ') + '.');
    }
    ra = ham(ra);
  }

  return fieldLogicEngineText(ra);
}

/** Kiểm định dạng một giá trị. Trả về `null` khi đạt, chuỗi lỗi bằng tiếng người khi không. Trường không khai `validate` thì luôn đạt. */
function fieldLogicValidate(value, spec, record) {
  if (!spec || !spec.validate) { return null; }

  var ham = VALIDATORS[spec.validate];
  if (!ham) {
    throw new Error('Trường "' + (spec.label || '?') + '" khai validate "' + spec.validate + '" mà bảng VALIDATORS không có. Tên có: ' + Object.keys(VALIDATORS).join(', ') + '.');
  }

  var loi = ham(value, record);
  return loi ? String(loi) : null;
}

/** Trường bắt buộc mà rỗng thì trả chuỗi lỗi. Số `0` **không** phải rỗng — chỗ hụt của mọi phép kiểm viết bằng `if (!value)`, mà hợp đồng giá 0 đồng là con số có thật. */
function fieldLogicRequired(value, spec) {
  if (!spec || spec.required !== true) { return null; }
  if (value === 0) { return null; }
  if (value === null || value === undefined || String(value).trim() === '') {
    return 'Thiếu "' + (spec.label || '?') + '".';
  }
  return null;
}
