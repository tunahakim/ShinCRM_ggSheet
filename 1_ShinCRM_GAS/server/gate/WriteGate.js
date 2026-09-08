/**
 * Cửa ghi duy nhất xuống sheet `Customer` và `Activity`. Tài liệu 06 Phần 1 tới Phần 4.
 *
 * Mọi thao tác làm đổi dữ liệu đi qua đây: sidebar, lệnh menu, và về sau là `fbm_sync`. Không nơi nào được tự mở sheet ra ghi `[RÀNG BUỘC CỨNG]`. Cửa làm đúng bốn việc theo thứ tự cố định: **lấy khóa, cấp mã nếu là bản ghi mới, ghi, ép dữ liệu xuống rồi nhả khóa.** Không có bước nào chen vào.
 *
 * Ba luật của tệp này đáng đọc trước khi sửa một dòng nào:
 *
 * **Một — chỉ ghi cột có khai, và chỉ ghi khóa bản ghi thật sự mang.** Cột có khai mà bản ghi không mang khóa thì bỏ qua, không ghi rỗng; chuỗi rỗng tường minh thì vẫn ghi, nên xóa nội dung một ô vẫn chạy `[RÀNG BUỘC CỨNG]`. Nhờ luật này, tám cột thuần đồng bộ được bảo vệ mà không cần thêm cơ chế nào — chúng không có trong `DATA_SCHEMA` nên lõi không có đường chạm tới. Và cũng nhờ nó, công thức người dùng tự thêm ở cột ngoài schema an toàn tuyệt đối: cửa ghi không bao giờ đọc cả dòng rồi ghi lại cả dòng.
 *
 * **Hai — hoặc trọn vẹn, hoặc không xảy ra.** Mọi phép kiểm chạy xong trước khi có lệnh ghi đầu tiên. Có một trường không đạt thì cửa trả về danh sách trường không đạt và **không ghi gì cả**. Không có ghi một nửa, không có hàng đợi, không có bản nháp.
 *
 * **Ba — cửa không bao giờ trả về số dòng** `[RÀNG BUỘC CỨNG]`. Số dòng là thứ đổi ngay khi ai đó sắp lại sheet, nên một số dòng gửi ra ngoài là một cái bẫy chờ sẵn. Bên gọi nhận bản ghi kèm mã, và mã là địa chỉ duy nhất.
 */

/** Hai nguồn gọi, quyết định phép kiểm nào chạy. Tài liệu 06 Phần 4. */
var WRITE_GATE_SOURCES = ['user', 'pull'];

/**
 * Những trường mà **máy** điền cho bản ghi mới, bất kể bên gọi gửi gì.
 *
 * Cả ba đều là trường `readonly` trong `DATA_SCHEMA`, và lý do máy giành lấy chúng khác nhau ở từng cái. `id` phải do cửa cấp mã cấp bên trong khóa, nếu nhận mã của client thì hai người bấm Lưu cùng lúc sẽ ghi lên nhau. `createdAt` lấy đồng hồ máy chủ vì đồng hồ máy người dùng có thể sai cả tháng, mà mốc tạo lệch là thứ không có cách nào phát hiện về sau. `recordStatus` chỉ có `DeleteGate` được đổi, nên đường ghi bình thường luôn đặt lại `active`.
 *
 * `customerId` cố ý **không** ở đây dù nó cũng `readonly`: nó là dữ liệu do màn hình đang mở quyết định, không phải do máy sinh ra. Nó đi theo bản ghi như mọi trường khác.
 */
var WRITE_GATE_MACHINE_FIELDS = {
  id: function (boiCanh) { return boiCanh.id; },
  createdAt: function (boiCanh) { return writeGateNow(boiCanh.spec.precision); },
  recordStatus: function () { return 'active'; }
};

/** Mốc hiện tại theo độ mịn của trường. `precision: 'day'` thì cắt phần giờ, để ô ngày là ngày trơn chứ không phải ngày kèm giờ ẩn. */
function writeGateNow(precision) {
  var bay = new Date();
  if (precision === 'day') { return new Date(bay.getFullYear(), bay.getMonth(), bay.getDate()); }
  return new Date(bay.getFullYear(), bay.getMonth(), bay.getDate(), bay.getHours(), bay.getMinutes());
}

/**
 * Gộp các bảng schema mà bên gọi đưa vào thành một bảng trường. Khai một tên trường ở hai bảng thì ném lỗi.
 *
 * Lõi chỉ truyền `DATA_SCHEMA`. `fbm_sync` truyền `DATA_SCHEMA`, `SYNC_SCHEMA`, hoặc cả hai trong cùng một lời gọi — vì chiều lấy về phải ghi nội dung nghiệp vụ và ghi baseline (mốc đối soát) trong đúng một lần khóa. Tách ra là mở đường cho một bản ghi mang baseline không ứng với nội dung của nó.
 */
function writeGateFields(entity, schemas) {
  var ds = (schemas && schemas.length) ? schemas : [DATA_SCHEMA];
  var ra = {};

  ds.forEach(function (schema) {
    var phan = schema && schema[entity];
    if (!phan) { return; }
    Object.keys(phan).forEach(function (ten) {
      if (ra[ten]) {
        throw new Error('Trường "' + ten + '" của "' + entity + '" khai ở hai bảng schema cùng lúc. Hai tập cột không được giao nhau.');
      }
      ra[ten] = phan[ten];
    });
  });

  if (!Object.keys(ra).length) {
    throw new Error('Không có bảng schema nào khai thực thể "' + entity + '". Bên gọi phải truyền schema, cửa ghi không tự đoán.');
  }
  return ra;
}

/**
 * Chuỗi hay số thành giá trị ghi vào ô `NUMBER`. Trả về `{ value }` khi được, `{ reason }` khi không phải số.
 *
 * Nhận cả khuôn người Việt gõ — `1.500.000,50` — vì đó là khuôn `valueTextNumber` bày ra trên form, nên nó cũng là khuôn quay về nếu bộ thu thập gửi thẳng chữ đang hiện. Bộ thu thập vốn đã ép kiểu, nên đường này là đường đỡ; nhưng một đường đỡ ở đây rẻ hơn nhiều so với một cột số lẫn chữ trên sheet.
 *
 * Không phải số thì trả lý do chứ không ném lỗi: đây là lỗi người dùng gõ, và lỗi người dùng gõ phải hiện lên đúng ô đó bằng màu đỏ, không phải hiện thành một hộp báo lỗi hệ thống.
 */
function writeGateNumber(value, spec) {
  if (value === null || value === undefined || value === '') { return { value: '' }; }
  if (typeof value === 'number') { return isNaN(value) ? { reason: 'Trường "' + spec.label + '" phải là số.' } : { value: value }; }

  var text = String(value).trim();
  if (!text) { return { value: '' }; }

  var thuan = text.replace(/\./g, '').replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(thuan)) {
    return { reason: 'Trường "' + spec.label + '" phải là số. Đang là "' + text + '".' };
  }
  return { value: Number(thuan) };
}

/**
 * Làm sạch rồi ép kiểu một giá trị theo khai của trường. Trả về `{ value }` hoặc `{ reason }`.
 *
 * Thứ tự: hàm `normalize` của trường chạy trước, cắt khoảng trắng và cắt trần chạy sau, rồi mới ép kiểu `[RÀNG BUỘC CỨNG]`. Ép kiểu phải đứng cuối vì `codeLike` làm việc trên chuỗi, mà một `Date` đi qua nó sẽ thành chữ.
 */
function writeGateCast(value, spec, chayNormalize) {
  var sach = fieldLogicClean(value, spec, chayNormalize);

  if (spec.type === 'DATE') { return { value: textToDate(sach, spec.precision) }; }
  if (spec.type === 'NUMBER') { return writeGateNumber(sach, spec); }
  return { value: sach };
}

/**
 * Bảng tra mã bản ghi sang số dòng, đọc cột mã bằng một lệnh. Trả về `{ '<mã>': số dòng }`.
 *
 * Mã trùng trên sheet thì ném lỗi kèm mã bị trùng. Đây là chỗ **phải** ném: hai dòng cùng mã nghĩa là mỗi lần sửa sẽ sửa một dòng và bỏ dòng kia, và người dùng thấy sửa xong rồi mở lại thì giá trị cũ quay về. Không có triệu chứng nào khó tìm hơn thế.
 */
function writeGateRowById(context) {
  var ra = {};
  if (context.rowCount <= 0) { return ra; }

  var cot = context.indexes[context.idAt] + 1;
  var values = context.sheet.getRange(SHEET_FIRST_DATA_ROW, cot, context.rowCount, 1).getValues();

  for (var i = 0; i < values.length; i++) {
    var ma = String(values[i][0]).trim();
    if (!ma) { continue; }
    if (ra[ma]) {
      throw new Error('Sheet "' + context.sheetName + '" có hai dòng cùng mã "' + ma + '" (dòng ' + ra[ma] + ' và dòng ' + (SHEET_FIRST_DATA_ROW + i) + '). Sửa trên sheet trước khi lưu.');
    }
    ra[ma] = SHEET_FIRST_DATA_ROW + i;
  }
  return ra;
}

/**
 * Giá trị này đã có ở cột `unique` nào khác chưa. Đọc **cột trên sheet**, không đọc bộ nhớ, và **đếm cả dòng đã xóa mềm** `[RÀNG BUỘC CỨNG]`.
 *
 * Vì sao đếm cả dòng đã xóa mềm: một khách bị xóa mềm vẫn còn nguyên trên sheet, nên cấp lại mã số thuế của họ cho khách mới là dựng hai dòng cùng mã số thuế — và ngày nào đó có người hoàn tác việc xóa.
 *
 * Vì sao đọc sheet mà không đọc bộ nhớ: bộ nhớ là ảnh chụp lúc mở sidebar. Người khác vừa thêm một khách xong thì bộ nhớ của máy này không biết, và `unique` mà tin vào một ảnh chụp cũ thì nó không còn là `unique`.
 */
function writeGateUniqueTaken(context, spec, value, dongMinh) {
  if (value === null || value === undefined || String(value).trim() === '') { return false; }
  if (context.rowCount <= 0) { return false; }

  var cot = columnIndex(context.columnMap, spec.code);
  var values = context.sheet.getRange(SHEET_FIRST_DATA_ROW, cot, context.rowCount, 1).getValues();
  var can = String(value).trim();

  for (var i = 0; i < values.length; i++) {
    if (SHEET_FIRST_DATA_ROW + i === dongMinh) { continue; }
    if (String(values[i][0]).trim() === can) { return true; }
  }
  return false;
}

/**
 * Gom một danh sách số nguyên thành các dải liền nhau. Vào `[0,1,2,5,6,18]`, ra `[[0,1,2],[5,6],[18]]`.
 *
 * Đây là chỗ luật "một lần lưu thường tốn một tới hai lệnh ghi" thành sự thật. Mỗi dải là một `setValues`. Dải **chỉ được chứa cột sắp ghi**: chèn một cột không ghi vào giữa dải là ghi rỗng lên nó, và cột đó có thể là cột công thức của người dùng.
 *
 * Dùng cho cả **số dòng** ở đường đọc lại sau khi ghi, vì luật gom là một: mấy dòng liền nhau thì đọc bằng một lệnh.
 */
function writeGateRanges(indexes) {
  var sorted = indexes.slice().sort(function (a, b) { return a - b; });
  var ra = [];

  sorted.forEach(function (idx) {
    var cuoi = ra[ra.length - 1];
    if (cuoi && idx === cuoi[cuoi.length - 1] + 1) { cuoi.push(idx); return; }
    ra.push([idx]);
  });

  return ra;
}

/** Một dòng trong danh sách trường không đạt. Có cả `label` để client không phải tra lại bảng khai chỉ để in một câu lỗi. */
function writeGateInvalid(plan, field, spec, reason) {
  return { index: plan.index, id: plan.id, field: field, label: (spec && spec.label) || field, reason: reason };
}

/**
 * Xếp từng bản ghi vào một trong hai đường: thêm mới, hay sửa dòng nào.
 *
 * **Mã rỗng là bản ghi mới**, và mã do cửa cấp mã cấp bên trong khóa. Client tuyệt đối không được gửi mã xem trước lên đây: mã xem trước tính lúc mở form, mà giữa lúc mở form và lúc bấm Lưu thì người khác hoàn toàn có thể đã dùng đúng mã đó.
 *
 * **Mã có mà không có trên sheet thì ném lỗi**, không âm thầm thêm dòng mới. Bản ghi đang sửa mà biến mất khỏi sheet nghĩa là có người vừa xóa dòng đó, hoặc bộ nhớ của sidebar đã cũ; thêm một dòng mới trong hoàn cảnh đó là dựng ra một bản ghi thứ hai mà người dùng tin là mình vừa sửa bản ghi cũ.
 *
 * Cùng một mã hai lần trong một lượt cũng ném lỗi: hai lệnh ghi vào cùng một dòng thì lệnh sau thắng, và bên gọi không có cách nào biết mình vừa mất một nửa dữ liệu.
 */
function writeGatePlans(records, rowById, context) {
  var daGap = {};

  return records.map(function (record, index) {
    var ban = record || {};
    var id = String(ban.id === null || ban.id === undefined ? '' : ban.id).trim();

    if (!id) { return { index: index, record: ban, id: '', row: 0, moi: true, values: {} }; }

    if (daGap.hasOwnProperty(id)) {
      throw new Error('Mã "' + id + '" xuất hiện hai lần trong cùng một lượt lưu (bản ghi thứ ' + (daGap[id] + 1) + ' và thứ ' + (index + 1) + ').');
    }
    daGap[id] = index;

    var row = rowById[id];
    if (!row) {
      throw new Error('Không tìm thấy mã "' + id + '" trên sheet "' + context.sheetName + '". Có thể dòng đó vừa bị xóa. Bấm Nạp lại rồi thử lại.');
    }

    return { index: index, record: ban, id: id, row: row, moi: false, values: {} };
  });
}

/**
 * Dựng bảng tra "mã danh mục → tập giá trị hợp lệ" cho các trường SELECT trong lô ghi.
 *
 * Đọc sheet `Category` **một lần** cho cả lô chứ không đọc mỗi trường một lần — một lần mở sheet là một vòng gọi mạng, và một lô ghi thường có nhiều trường SELECT cùng lúc.
 *
 * Trường không có `source` (chỉ có `options`) thì không cần tra sheet, nên bỏ qua ở đây và phép kiểm `selectAllowed[spec.source]` trả `undefined` cho chúng.
 */
function writeGateSelectCatalog(fields) {
  var sources = {};
  Object.keys(fields).forEach(function (ten) {
    var spec = fields[ten];
    if (spec.type === 'SELECT' && spec.source) { sources[spec.source] = true; }
  });

  var sourceNames = Object.keys(sources);
  if (!sourceNames.length) { return {}; }

  var cat = categoryReadAll();
  var allowed = {};
  sourceNames.forEach(function (src) {
    var values = cat.categories[src];
    if (!values || !values.length) { return; }
    allowed[src] = {};
    values.forEach(function (v) { allowed[src][String(v).trim()] = true; });
  });
  return allowed;
}

/**
 * Làm sạch, ép kiểu và kiểm từng trường của một bản ghi. Trả về qua `plan.values`, dồn lỗi vào `invalid`.
 *
 * **Ba trường của máy bị bỏ qua hoàn toàn ở đây.** Bản ghi mới thì chúng được điền sau, ngay trước lệnh ghi; bản ghi đã có thì đường ghi thường không bao giờ chạm tới chúng — `id` là địa chỉ nên sửa nó là đổi bản ghi thành bản ghi khác, `createdAt` là mốc quá khứ nên ghi lại nó bằng bất cứ giá trị nào cũng chỉ có thể làm nó sai đi, và `recordStatus` chỉ `DeleteGate` được đổi.
 *
 * **Trường bắt buộc chỉ bị kiểm khi bản ghi thật sự nói về nó.** Bản ghi mới thì mọi trường bắt buộc đều phải có, kể cả trường bên gọi quên gửi. Bản ghi đã có thì chỉ kiểm những khóa bên gọi gửi lên, vì một lượt sửa được phép chỉ mang vài trường — đòi đủ trường bắt buộc ở đó là chặn đúng đường sửa một ô.
 *
 * Nguồn `pull` không chạy `normalize`, `validate`, `required`. Nó vẫn chạy ba phép mặc định của bộ máy, vì ba phép đó là hình dạng ô chứ không phải phán xét nội dung. Tài liệu 06 Phần 4.
 */
function writeGateBuild(plan, names, fields, source, invalid, selectAllowed) {
  var laUser = source === 'user';

  names.forEach(function (ten) {
    if (WRITE_GATE_MACHINE_FIELDS[ten]) { return; }

    var spec = fields[ten];
    var coKhoa = Object.prototype.hasOwnProperty.call(plan.record, ten);

    if (!coKhoa) {
      if (plan.moi && laUser) {
        var thieu = fieldLogicRequired('', spec);
        if (thieu) { invalid.push(writeGateInvalid(plan, ten, spec, thieu)); }
      }
      return;
    }

    var ep = writeGateCast(plan.record[ten], spec, laUser);
    if (ep.reason) { invalid.push(writeGateInvalid(plan, ten, spec, ep.reason)); return; }

    if (laUser) {
      var loi = fieldLogicRequired(ep.value, spec) || fieldLogicValidate(ep.value, spec, plan.record);
      if (!loi && spec.type === 'SELECT' && spec.source && selectAllowed
          && selectAllowed[spec.source] && String(ep.value).trim()
          && !selectAllowed[spec.source][String(ep.value).trim()]) {
        loi = '"' + (spec.label || ten) + '" không chấp nhận giá trị "' + ep.value + '".';
      }
      if (loi) { invalid.push(writeGateInvalid(plan, ten, spec, loi)); return; }
    }

    plan.values[ten] = ep.value;
  });
}

/**
 * Phép kiểm trùng, chạy sau khi cả lô đã ép kiểu xong. Chỉ nguồn `user`.
 *
 * Hai phép trùng, không phải một. Trùng **với sheet** là ca thường. Trùng **trong cùng một lô** là ca chỉ `fbm_sync` và lệnh menu gặp, và nó không bắt được bằng phép đọc sheet vì cả hai giá trị đều chưa xuống sheet — bỏ qua nó là để một lượt lưu tự dựng ra hai dòng cùng mã số thuế.
 */
function writeGateUniqueCheck(plans, names, fields, source, context, invalid) {
  if (source !== 'user') { return; }

  var uniques = names.filter(function (ten) { return fields[ten].unique === true; });
  if (!uniques.length) { return; }

  var trongLo = {};

  plans.forEach(function (plan) {
    uniques.forEach(function (ten) {
      if (!Object.prototype.hasOwnProperty.call(plan.values, ten)) { return; }

      var spec = fields[ten];
      var giaTri = String(plan.values[ten]).trim();
      if (!giaTri) { return; }

      var khoa = ten + '\u0000' + giaTri;
      if (trongLo.hasOwnProperty(khoa)) {
        invalid.push(writeGateInvalid(plan, ten, spec, 'Giá trị "' + giaTri + '" xuất hiện hai lần trong cùng một lượt lưu.'));
        return;
      }
      trongLo[khoa] = true;

      if (writeGateUniqueTaken(context, spec, giaTri, plan.row)) {
        invalid.push(writeGateInvalid(plan, ten, spec, 'Đã có bản ghi khác mang ' + String(spec.label || ten).toLowerCase() + ' "' + giaTri + '".'));
      }
    });
  });
}

/**
 * Đặt lại khuôn văn bản thuần cho các ô của cột chữ sắp ghi, **ngay trước** lệnh ghi.
 *
 * Vì sao phải làm ở đây chứ không chỉ làm một lần lúc dựng khung: khuôn cột là thứ người dùng đổi được bằng hai cú bấm trên sheet, và đổi rồi thì lượt Lưu sau đó ghi `'0101243150'` vào một ô số — Sheets cắt số 0 đầu, không báo gì, và không có đường nào lấy lại. `verifySheets` phát hiện được chuyện đó nhưng chỉ khi có người chạy nó.
 *
 * **Chỉ cột chữ, và chỉ những ô sắp ghi.** Cột số và cột ngày không đặt lại: ghi số vào ô đang ở khuôn nào cũng không mất chữ số nào, nên đặt lại chỉ để xóa mất khuôn hiển thị người dùng tự chọn cho hàng của họ. Gom dải liền nhau bằng đúng `writeGateRanges` của đường ghi, nên một lượt lưu thường tốn thêm một lệnh.
 */
function writeGateForceTextFormat(context, firstRow, soDong, cotChu) {
  if (!cotChu.length || soDong <= 0) { return; }

  writeGateRanges(cotChu).forEach(function (dai) {
    context.sheet.getRange(firstRow, dai[0] + 1, soDong, dai.length).setNumberFormat(COLUMN_FORMAT_TEXT);
  });
}

/**
 * Ghi các bản ghi mới thành **một khối liền mạch** ngay dưới dòng cuối đang có dữ liệu.
 *
 * Tập cột của khối là **hợp** các khóa mà các bản ghi trong lô mang; bản ghi nào thiếu một khóa của tập đó thì ô ấy ghi rỗng. Đây là chỗ duy nhất cửa ghi ghi rỗng lên một khóa bản ghi không mang, và nó đúng vì dòng đang được dựng mới: ô đó vốn trống.
 *
 * Nới lưới trước khi ghi, vì `setValues` không tự nới — bài học ở `SheetGrid.gs`.
 */
function writeGateWriteNew(moi, context, colOf, nameAt, laCotChu) {
  if (!moi.length) { return; }

  var keys = {};
  moi.forEach(function (plan) { Object.keys(plan.values).forEach(function (ten) { keys[ten] = true; }); });

  var firstRow = SHEET_FIRST_DATA_ROW + context.rowCount;
  sheetGridEnsureRoom(context.sheet, firstRow + moi.length - 1, SHEET_GRID_SLACK);

  var cols = Object.keys(keys).map(function (ten) { return colOf[ten]; });
  writeGateForceTextFormat(context, firstRow, moi.length, cols.filter(function (at) { return laCotChu[at]; }));

  writeGateRanges(cols).forEach(function (dai) {
    var values = moi.map(function (plan) {
      return dai.map(function (at) {
        var ten = nameAt[at];
        return Object.prototype.hasOwnProperty.call(plan.values, ten) ? plan.values[ten] : '';
      });
    });
    context.sheet.getRange(firstRow, dai[0] + 1, moi.length, dai.length).setValues(values);
  });

  moi.forEach(function (plan, i) { plan.row = firstRow + i; });
}

/** Ghi các bản ghi đã có, mỗi bản ghi một dòng, mỗi dải cột liền nhau một lệnh. Bản ghi không mang khóa nào thì không tốn lệnh nào. */
function writeGateWriteExisting(cu, context, colOf, nameAt, laCotChu) {
  cu.forEach(function (plan) {
    var names = Object.keys(plan.values);
    if (!names.length) { return; }

    var cols = names.map(function (ten) { return colOf[ten]; });
    writeGateForceTextFormat(context, plan.row, 1, cols.filter(function (at) { return laCotChu[at]; }));

    writeGateRanges(cols).forEach(function (dai) {
      var dong = dai.map(function (at) { return plan.values[nameAt[at]]; });
      context.sheet.getRange(plan.row, dai[0] + 1, 1, dai.length).setValues([dong]);
    });
  });
}

/**
 * Đọc lại đúng những dòng vừa ghi, trả về đúng hình dạng của đường nạp: `{ fields, rows }`.
 *
 * Đọc lại chứ không trả về thứ vừa gửi lên. Bên gọi chỉ gửi vài trường, mà `Store.upsertRecord` thay **cả** bản ghi trong bộ nhớ — trả về một bản ghi thiếu trường là xóa trắng phần còn lại của nó trong bộ nhớ. Đọc lại còn trả lời luôn câu "sheet thật sự đang giữ gì", nên bộ nhớ và sheet không thể lệch nhau sau một lượt lưu.
 *
 * Dùng chung `entityReadRange` với đường nạp, nên giá trị về client đi qua đúng một bộ đổi kiểu — ngày ra chữ, số ra số. Hai bộ đổi kiểu là hai cơ hội lệch nhau.
 */
function writeGateReadBack(plans, context) {
  var rows = [];

  writeGateRanges(plans.map(function (plan) { return plan.row; })).forEach(function (dai) {
    entityReadRange(context, dai[0], dai.length).rows.forEach(function (row) { rows.push(row); });
  });

  return { fields: context.names, rows: rows };
}

/**
 * Bốn bước bên trong khóa: đọc bối cảnh, kiểm hết, cấp mã, ghi. Tách khỏi `writeGateSave` để phần lấy và nhả khóa còn đọc được bằng mắt.
 *
 * **Cấp mã đứng sau mọi phép kiểm.** Cấp mã là một lệnh ghi — nó ghi bộ đếm xuống `Config`. Cấp trước rồi kiểm sau nghĩa là một lượt lưu bị chặn vì lỗi gõ vẫn làm bộ đếm nhảy, và luật "hoặc trọn vẹn, hoặc không xảy ra" đã hỏng ngay ở lệnh ghi đầu tiên.
 *
 * `flush` trước khi đọc lại: Apps Script gộp lệnh ghi, và đọc lại một vùng vừa ghi mà chưa ép xuống là đường ngắn nhất tới một phản hồi mang giá trị cũ.
 */
function writeGateRun(entity, records, source, fields, batDau) {
  var context = entityReadContext(entity);
  var names = Object.keys(fields);
  var colOf = {};
  var nameAt = {};
  var laCotChu = {};

  names.forEach(function (ten) {
    var at = columnIndex(context.columnMap, fields[ten].code) - 1;
    colOf[ten] = at;
    nameAt[at] = ten;
    if (columnFormatIsText(fields[ten])) { laCotChu[at] = true; }
  });

  var plans = writeGatePlans(records, writeGateRowById(context), context);
  var invalid = [];

  // Đọc bảng danh mục một lần cho cả lô, chỉ khi nguồn là `user` — nguồn `pull` bỏ qua mọi phép kiểm giá trị. `Category` đọc từ sheet chứ không từ bộ nhớ, vì giá trị danh mục có thể đã đổi giữa hai lượt mở sidebar.
  var selectAllowed = null;
  if (source === 'user') { selectAllowed = writeGateSelectCatalog(fields); }

  plans.forEach(function (plan) { writeGateBuild(plan, names, fields, source, invalid, selectAllowed); });
  writeGateUniqueCheck(plans, names, fields, source, context, invalid);

  if (invalid.length) {
    logTrace({
      source: 'core', action: 'writeGateSave', outcome: LOG_WARN, entity: entity,
      reason: 'Chặn vì có trường không đạt, không ghi gì',
      detail: { banGhi: plans.length, khongDat: invalid.length, truong: invalid.map(function (o) { return o.field; }).join(', ') }
    });
    return { ok: false, entity: entity, invalid: invalid, ms: Date.now() - batDau };
  }

  var moi = plans.filter(function (plan) { return plan.moi; });
  var cu = plans.filter(function (plan) { return !plan.moi; });

  idGateIssue(entity, moi.length, context).forEach(function (ma, i) {
    moi[i].id = ma;
    Object.keys(WRITE_GATE_MACHINE_FIELDS).forEach(function (ten) {
      if (!fields[ten]) { return; }
      moi[i].values[ten] = WRITE_GATE_MACHINE_FIELDS[ten]({ id: ma, spec: fields[ten] });
    });
  });

  writeGateWriteNew(moi, context, colOf, nameAt, laCotChu);
  writeGateWriteExisting(cu, context, colOf, nameAt, laCotChu);
  SpreadsheetApp.flush();

  var doc = writeGateReadBack(plans, context);
  var ms = Date.now() - batDau;

  logEvent({
    source: 'core', action: 'writeGateSave', outcome: LOG_OK, entity: entity,
    recordId: plans.map(function (plan) { return plan.id; }).join(' '),
    reason: 'Lưu ' + moi.length + ' bản ghi mới, ' + cu.length + ' bản ghi sửa',
    detail: { nguon: source, cot: Object.keys(colOf).length, ms: ms }
  });

  return { ok: true, entity: entity, fields: doc.fields, rows: doc.rows, ms: ms };
}

/**
 * **Cửa vào duy nhất của mọi lượt ghi dữ liệu.** Nhận `{ entity, records, source, schemas }`.
 *
 * `records` là mảng bản ghi phẳng, khóa là **tên trường** chứ không phải mã cột. Mã rỗng là thêm mới. `source` là `'user'` hay `'pull'` (tài liệu 06 Phần 4); bỏ trống thì hiểu là `'user'`, vì đó là đường của người ngồi trước máy và đường của người thì phải được kiểm nhiều nhất. `schemas` là mảng bảng khai; bỏ trống thì chỉ `DATA_SCHEMA`.
 *
 * Trả về `{ ok: true, entity, fields, rows, ms }` — đúng hình dạng của đường nạp, để client dùng lại đúng một bộ đổi hàng-thành-bản-ghi. Có trường không đạt thì trả về `{ ok: false, entity, invalid: [ { index, id, field, label, reason } ], ms }` và **không ghi gì**.
 *
 * Ném lỗi chỉ ở chuyện hạ tầng: không lấy được khóa, mã đang sửa biến mất khỏi sheet, sheet có hai dòng cùng mã, bảng khai sai. Lỗi người dùng gõ thì không bao giờ ném — nó đi về theo `invalid` để hiện đỏ ngay tại ô đó.
 *
 * `tryLock` chứ không `waitLock`, để câu báo hết giờ là câu tiếng người của dự án chứ không phải câu tiếng Anh của Google. Mười lăm giây là con số bản cũ đã chạy thật.
 */
function writeGateSave(yeuCau) {
  var batDau = Date.now();
  var req = yeuCau || {};
  var entity = req.entity;
  var records = req.records;
  var source = req.source === undefined || req.source === null || req.source === '' ? 'user' : req.source;

  if (WRITE_GATE_SOURCES.indexOf(source) < 0) {
    throw new Error('Nguồn ghi "' + source + '" không có trong bảng. Chỉ có: ' + WRITE_GATE_SOURCES.join(', ') + '.');
  }
  if (req.foreignKey) {
    throw new Error('Đường ghi theo mã bên hệ ngoài ("' + req.foreignKey + '") chưa dựng — nó thuộc chặng đồng bộ FBM, tài liệu 06 Phần 4.');
  }
  if (!Array.isArray(records)) {
    throw new Error('Cửa ghi cần `records` là một mảng bản ghi. Nhận được: ' + (records === undefined ? 'không có' : typeof records) + '.');
  }

  var fields = writeGateFields(entity, req.schemas);

  // Lô rỗng không lấy khóa: lấy khóa rồi nhả ngay là chặn người khác một nhịp để làm đúng không việc gì.
  if (!records.length) {
    return { ok: true, entity: entity, fields: entityReadFields(entity), rows: [], ms: Date.now() - batDau };
  }

  var khoa = LockService.getDocumentLock();
  if (!khoa.tryLock(SETTINGS.LOCK_WAIT_MS)) {
    throw new Error('Hệ thống bận. Vui lòng thử lại!');
  }

  try {
    return writeGateRun(entity, records, source, fields, batDau);
  } finally {
    // `flush` rồi mới nhả khóa, tài liệu 06 Phần 2 `[RÀNG BUỘC CỨNG]`. Bọc lồng nhau để `flush` có ném lỗi thì khóa vẫn được nhả.
    try { SpreadsheetApp.flush(); } finally { khoa.releaseLock(); }
  }
}

