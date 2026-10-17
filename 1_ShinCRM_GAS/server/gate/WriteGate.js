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
var WRITE_GATE_SOURCES = ['user', 'pull', 'push', 'background'];

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

/**
 * Trường máy điền cho bản ghi **người dùng** tạo mới; người dùng không sửa được chúng ở bất kỳ lượt lưu nào.
 *
 * Khác `WRITE_GATE_MACHINE_FIELDS` ở chỗ nguồn `pull` được ghi thẳng: `enteredBy` là người tạo trên FBM, lượt kéo mang giá trị thật của FBM (09/03 mục "Người tạo trên FBM"). Bản ghi người dùng tạo lấy tên ở tham số `USER_NAME` của Config chứ không hỏi module FBM, vì lõi không được phụ thuộc `fbm_sync`; người dùng gõ đúng tên tài khoản FBM thì hai đường ra cùng một tên.
 */
var WRITE_GATE_CREATOR_CONFIG_NAME = 'USER_NAME';
var WRITE_GATE_USER_CREATE_FIELDS = {
  enteredBy: function () { return String(configGet(WRITE_GATE_CREATOR_CONFIG_NAME, '') || '').trim(); }
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
 * Giá trị này đã có ở cột `unique` nào khác chưa. Đọc **cột trên sheet**, không đọc bộ nhớ, và **đếm cả dòng đã xóa mềm** `[RÀNG BUỘC CỨNG]`.
 *
 * Vì sao đếm cả dòng đã xóa mềm: một khách bị xóa mềm vẫn còn nguyên trên sheet, nên cấp lại mã số thuế của họ cho khách mới là dựng hai dòng cùng mã số thuế — và ngày nào đó có người hoàn tác việc xóa.
 *
 * Vì sao đọc sheet mà không đọc bộ nhớ: bộ nhớ là ảnh chụp lúc mở sidebar. Người khác vừa thêm một khách xong thì bộ nhớ của máy này không biết, và `unique` mà tin vào một ảnh chụp cũ thì nó không còn là `unique`.
 */
function writeGateUniqueTaken(context, spec, value, selfId) {
  if (value === null || value === undefined || String(value).trim() === '') { return false; }
  if (context.rowCount <= 0) { return false; }

  var column = entityReadColumnWithIds(context, spec.code);
  var can = String(value).trim();

  for (var i = 0; i < column.values.length; i++) {
    if (selfId && String(column.ids[i]).trim() === selfId) { continue; }
    if (String(column.values[i]).trim() === can) { return true; }
  }
  return false;
}

/** Một dòng trong danh sách trường không đạt. Có cả `label` để client không phải tra lại bảng khai chỉ để in một câu lỗi. */
function writeGateInvalid(plan, field, spec, reason) {
  return { index: plan.index, id: plan.id, field: field, label: (spec && spec.label) || field, reason: reason };
}

/**
 * Xếp từng bản ghi vào một trong hai đường: thêm mới hay sửa. Mã đang sửa có trên sheet hay không do `entityPlace` kiểm ngay sau bước này.
 *
 * **Mã rỗng là bản ghi mới**, và mã do cửa cấp mã cấp bên trong khóa. Client tuyệt đối không được gửi mã xem trước lên đây: mã xem trước tính lúc mở form, mà giữa lúc mở form và lúc bấm Lưu thì người khác hoàn toàn có thể đã dùng đúng mã đó.
 *
 * Cùng một mã hai lần trong một lượt cũng ném lỗi: hai lệnh ghi vào cùng một dòng thì lệnh sau thắng, và bên gọi không có cách nào biết mình vừa mất một nửa dữ liệu.
 */
function writeGatePlans(records, olds) {
  var daGap = {};

  return records.map(function (record, index) {
    var ban = record || {};
    var id = String(ban.id === null || ban.id === undefined ? '' : ban.id).trim();

    var old = olds && olds[index] ? olds[index] : null;
    if (!id) { return { index: index, record: ban, id: '', moi: true, values: {}, old: old }; }

    if (daGap.hasOwnProperty(id)) {
      throw new Error('Mã "' + id + '" xuất hiện hai lần trong cùng một lượt lưu (bản ghi thứ ' + (daGap[id] + 1) + ' và thứ ' + (index + 1) + ').');
    }
    daGap[id] = index;

    return { index: index, record: ban, id: id, moi: false, values: {}, old: old };
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
    if (WRITE_GATE_MACHINE_FIELDS[ten] || (laUser && WRITE_GATE_USER_CREATE_FIELDS[ten])) { return; }

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
      // Trường có danh sách cố định trong schema (không lấy từ Category) thì so khớp đúng chữ: logic đồng bộ đọc đúng chuỗi này.
      if (!loi && spec.type === 'SELECT' && spec.options && String(ep.value) !== '' && spec.options.indexOf(String(ep.value)) < 0) {
        loi = '"' + (spec.label || ten) + '" chỉ nhận một trong các giá trị: ' + spec.options.join(', ') + '.';
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

      if (writeGateUniqueTaken(context, spec, giaTri, plan.id)) {
        invalid.push(writeGateInvalid(plan, ten, spec, 'Đã có bản ghi khác mang ' + String(spec.label || ten).toLowerCase() + ' "' + giaTri + '".'));
      }
    });
  });
}

/** Giá trị đã qua bộ đổi kiểu của đường nạp, thành chuỗi để so: hai phía cùng đi qua đúng một bộ đổi kiểu thì ngày dạng `Date` và chữ không báo khác giả. */
function writeGateComparable(value, spec, timezone) {
  var cell = entityReadCell(value, spec, timezone);
  return cell === null || cell === undefined ? '' : String(cell).trim();
}

/**
 * Kiểm xung đột bằng giá trị cũ (tài liệu 06 Phần 4), chỉ nguồn `user` sửa bản ghi đã có. `rows` là các dòng hiện tại trên Sheet của `plans` sửa, đọc trong khóa, cùng thứ tự.
 * Trường là xung đột khi Sheet đã khác giá trị lúc mở form và giá trị gửi lên cũng khác giá trị đang có; đổi một phía thì không. Thiếu `old` thì ném lỗi: không có đường lưu nào bỏ qua phép này.
 */
function writeGateConflicts(plans, rows, fields, context) {
  var conflicts = [];
  plans.forEach(function (plan, i) {
    if (!plan.old) { throw new Error('Lưu bản ghi "' + plan.id + '" thiếu giá trị lúc mở form nên không kiểm được xung đột; không ghi gì. Tải lại Sidebar rồi thử lại.'); }
    Object.keys(plan.values).forEach(function (name) {
      var at = context.names.indexOf(name);
      if (at < 0) { return; }
      if (!Object.prototype.hasOwnProperty.call(plan.old, name)) { throw new Error('Lưu bản ghi "' + plan.id + '" thiếu giá trị lúc mở form của trường "' + name + '"; không ghi gì. Tải lại Sidebar rồi thử lại.'); }
      var spec = fields[name];
      var old = writeGateComparable(plan.old[name], spec, context.timezone);
      var current = writeGateComparable(rows[i][at], spec, context.timezone);
      var mine = writeGateComparable(plan.values[name], spec, context.timezone);
      if (current !== old && mine !== current) {
        conflicts.push({ index: plan.index, id: plan.id, field: name, label: spec.label || name, old: old, current: current, mine: mine });
      }
    });
  });
  return conflicts;
}

/**
 * Xác nhận sau ghi (tài liệu 06 Phần 4) trên chính các dòng của lần đọc lại vốn có (`rows`, cùng thứ tự `plans`), nên không tốn lệnh đọc nào thêm: ô mã phải đúng mã bản ghi và mọi trường vừa ghi có trong bối cảnh nạp phải khớp giá trị đọc lại. Trường ngoài bối cảnh (cột riêng của đồng bộ) không được nạp nên không kiểm; ô mã đúng đã chặn được ca dòng bị đổi chủ.
 * Lệch nghĩa là Sheet bị sắp xếp, chèn, xóa hàng đúng lúc ghi hoặc Google tự đổi giá trị: đánh dấu nạp lại trọn thực thể, ghi Log mức lỗi rồi ném lỗi bằng tiếng người, không bao giờ để thành lỗi âm thầm.
 */
function writeGateConfirm(entity, plans, fields, context, rows) {
  var mismatches = [];
  plans.forEach(function (plan, i) {
    var onSheet = String(rows[i][context.idAt]).trim();
    if (onSheet !== plan.id) { mismatches.push({ id: plan.id, field: 'id', onSheet: onSheet }); return; }
    Object.keys(plan.values).forEach(function (name) {
      var at = context.names.indexOf(name);
      if (at < 0) { return; }
      var wrote = writeGateComparable(plan.values[name], fields[name], context.timezone);
      var read = writeGateComparable(rows[i][at], fields[name], context.timezone);
      if (wrote !== read) { mismatches.push({ id: plan.id, field: name, wrote: wrote, onSheet: read }); }
    });
  });
  if (!mismatches.length) { return; }

  var mark = dirtyStateBlankMark();
  mark[entity + 'All'] = true;
  dirtyStateMarkSignal(mark);
  logEvent({
    source: 'core', action: 'writeGateConfirm', outcome: LOG_ERROR, entity: entity,
    recordId: mismatches.map(function (item) { return item.id; }).join(' '),
    reason: 'Đọc lại sau ghi không khớp trên sheet "' + context.sheetName + '"',
    detail: { lech: mismatches }
  });
  throw new Error('Sheet "' + context.sheetName + '" vừa bị đổi đúng lúc lưu (sắp xếp, chèn hoặc xóa hàng), hoặc Google tự đổi giá trị: dòng vừa ghi không còn khớp ở ' + mismatches.map(function (item) { return item.id + ' / ' + item.field; }).join(', ') + '. Sidebar sẽ nạp lại; kiểm tra lại các bản ghi này trên Sheet.');
}

/** Giá trị trường RAM hiện có trên Sheet của các bản ghi, theo mã, cùng bộ đổi kiểu với `writeGateReadBack` để so được với bản đọc lại. */
function writeGateRowSnapshot(plans, context, placement) {
  var snap = {};
  if (!plans.length) { return snap; }
  entityReadPlaced(context, placement, plans.map(function (plan) { return plan.id; })).rows.forEach(function (row) { snap[String(row[context.idAt]).trim()] = JSON.stringify(row); });
  return snap;
}

/**
 * Đọc lại đúng những dòng vừa ghi, trả về đúng hình dạng của đường nạp: `{ fields, rows }`.
 *
 * Đọc lại chứ không trả về thứ vừa gửi lên. Bên gọi chỉ gửi vài trường, mà `Store.upsertRecord` thay **cả** bản ghi trong bộ nhớ — trả về một bản ghi thiếu trường là xóa trắng phần còn lại của nó trong bộ nhớ. Đọc lại còn trả lời luôn câu "sheet thật sự đang giữ gì", nên bộ nhớ và sheet không thể lệch nhau sau một lượt lưu.
 *
 * Đọc qua tờ nháp của lần gọi; công cụ ghi ô đã quên các dòng vừa ghi và ép lệnh ghi xuống trước lần đọc này, nên dòng đọc lại là giá trị thật và cũng thành bản nhớ mới của các dòng đó cho phần còn lại của lần gọi. Dùng chung bộ đổi kiểu với đường nạp, nên giá trị về client đi qua đúng một bộ đổi kiểu — ngày ra chữ, số ra số. Hai bộ đổi kiểu là hai cơ hội lệch nhau.
 */
function writeGateReadBack(plans, context, placement) {
  return { fields: context.names, rows: entityReadPlaced(context, placement, plans.map(function (plan) { return plan.id; })).rows };
}

/**
 * Bốn bước bên trong khóa: đọc bối cảnh, kiểm hết, cấp mã, ghi. Tách khỏi `writeGateSave` để phần lấy và nhả khóa còn đọc được bằng mắt.
 *
 * **Cấp mã đứng sau mọi phép kiểm.** Cấp mã là một lệnh ghi — nó ghi bộ đếm xuống `Config`. Cấp trước rồi kiểm sau nghĩa là một lượt lưu bị chặn vì lỗi gõ vẫn làm bộ đếm nhảy, và luật "hoặc trọn vẹn, hoặc không xảy ra" đã hỏng ngay ở lệnh ghi đầu tiên.
 */
function writeGateRun(entity, records, source, fields, batDau, olds) {
  var context = entityReadContext(entity);
  var names = Object.keys(fields);

  var plans = writeGatePlans(records, olds);
  var placement = entityPlace(context, plans.filter(function (plan) { return !plan.moi; }).map(function (plan) { return plan.id; }));
  var invalid = [];

  // Đọc bảng danh mục một lần cho cả lô, chỉ khi nguồn là `user` — nguồn `pull` bỏ qua mọi phép kiểm giá trị. `Category` đọc từ sheet chứ không từ bộ nhớ, vì giá trị danh mục có thể đã đổi giữa hai lượt mở sidebar.
  var selectAllowed = null;
  if (source === 'user') { selectAllowed = writeGateSelectCatalog(fields); }

  plans.forEach(function (plan) { writeGateBuild(plan, names, fields, source, invalid, selectAllowed); });
  var edits = plans.filter(function (plan) { return !plan.moi; });
  var conflicts = source === 'user' && edits.length ? writeGateConflicts(edits, entityReadPlaced(context, placement, edits.map(function (plan) { return plan.id; })).rows, fields, context) : [];
  writeGateUniqueCheck(plans, names, fields, source, context, invalid);

  if (invalid.length) {
    logTrace({
      source: 'core', action: 'writeGateSave', outcome: LOG_WARN, entity: entity,
      reason: 'Chặn vì có trường không đạt, không ghi gì',
      detail: { banGhi: plans.length, khongDat: invalid.length, truong: invalid.map(function (o) { return o.field; }).join(', ') }
    });
    return { ok: false, entity: entity, invalid: invalid, ms: Date.now() - batDau };
  }

  if (conflicts.length) {
    logEvent({
      source: 'core', action: 'writeGateSave', outcome: LOG_WARN, entity: entity,
      recordId: conflicts.map(function (item) { return item.id; }).join(' '),
      reason: 'Chặn vì trường đã bị đổi trên Sheet trong lúc sửa, không ghi gì',
      detail: { truong: conflicts.map(function (item) { return item.field; }).join(', ') }
    });
    return { ok: false, entity: entity, conflicts: conflicts, ms: Date.now() - batDau };
  }

  var moi = plans.filter(function (plan) { return plan.moi; });
  var cu = edits;

  idGateIssue(entity, moi.length, context).forEach(function (ma, i) {
    moi[i].id = ma;
    Object.keys(WRITE_GATE_MACHINE_FIELDS).forEach(function (ten) {
      if (!fields[ten]) { return; }
      moi[i].values[ten] = WRITE_GATE_MACHINE_FIELDS[ten]({ id: ma, spec: fields[ten] });
    });
    if (source !== 'user') { return; }
    Object.keys(WRITE_GATE_USER_CREATE_FIELDS).forEach(function (ten) {
      if (fields[ten]) { moi[i].values[ten] = WRITE_GATE_USER_CREATE_FIELDS[ten](); }
    });
  });

  // Chụp giá trị cũ của bản ghi sửa có chạm trường RAM, để chỉ bản ghi đổi thật mới báo Sidebar nạp lại.
  var touched = cu.filter(function (plan) { return Object.keys(plan.values).some(function (ten) { return context.names.indexOf(ten) >= 0; }); });
  var before = writeGateRowSnapshot(touched, context, placement);

  var written = entityWriteRecords(context, fields, placement, plans.map(function (plan) { return { id: plan.id, values: plan.values, append: plan.moi }; }));
  var doc = writeGateReadBack(plans, context, written);
  writeGateConfirm(entity, plans, fields, context, doc.rows);
  var after = {};
  doc.rows.forEach(function (row) { after[String(row[context.idAt]).trim()] = JSON.stringify(row); });
  var ms = Date.now() - batDau;

  logEvent({
    source: 'core', action: 'writeGateSave', outcome: LOG_OK, entity: entity,
    recordId: plans.map(function (plan) { return plan.id; }).join(' '),
    reason: 'Lưu ' + moi.length + ' bản ghi mới, ' + cu.length + ' bản ghi sửa',
    detail: { nguon: source, cot: names.length, ms: ms }
  });

  return {
    ok: true,
    entity: entity,
    fields: doc.fields,
    rows: doc.rows,
    recordIds: plans.map(function (plan) { return String(plan.id || '').trim(); }).filter(function (id) { return !!id; }),
    // Bản ghi mới, hoặc bản ghi sửa có trường RAM khác giá trị cũ. Ghi lại y hệt hoặc chỉ ghi cột đồng bộ (ngoài RAM) không vào đây.
    changedIds: moi.map(function (plan) { return String(plan.id || '').trim(); }).concat(touched.filter(function (plan) {
      return after[plan.id] !== before[plan.id];
    }).map(function (plan) { return plan.id; })).filter(function (id) { return !!id; }),
    // Cấp mã mới chỉ đổi bộ đếm (DocumentProperties), không đổi Config; Sidebar nhận bộ đếm mới qua đây để mã xem trước trên form khách mới đúng.
    counters: moi.length ? idGateCounterValues() : undefined,
    ms: ms
  };
}

/**
 * **Cửa vào duy nhất của mọi lượt ghi dữ liệu.** Nhận `{ entity, records, source, schemas, old }`.
 *
 * `records` là mảng bản ghi phẳng, khóa là **tên trường** chứ không phải mã cột. Mã rỗng là thêm mới. `source` là `'user'` hay `'pull'` (tài liệu 06 Phần 4); bỏ trống thì hiểu là `'user'`, vì đó là đường của người ngồi trước máy và đường của người thì phải được kiểm nhiều nhất. `schemas` là mảng bảng khai; bỏ trống thì chỉ `DATA_SCHEMA`. `old` là mảng cùng thứ tự `records`, mỗi phần tử là giá trị lúc mở form của các trường gửi lên; bắt buộc với bản ghi sửa của nguồn `user`.
 *
 * Trả về `{ ok: true, entity, fields, rows, ms }` — đúng hình dạng của đường nạp, để client dùng lại đúng một bộ đổi hàng-thành-bản-ghi. Có trường không đạt thì trả về `{ ok: false, entity, invalid: [ { index, id, field, label, reason } ], ms }` và **không ghi gì**. Trường bị đổi trên Sheet trong lúc người dùng sửa thì trả `{ ok: false, entity, conflicts: [ { index, id, field, label, old, current, mine } ], ms }` và cũng không ghi gì.
 *
 * Ném lỗi chỉ ở chuyện hạ tầng: không lấy được khóa, mã đang sửa biến mất khỏi sheet, sheet có hai dòng cùng mã, bảng khai sai, thiếu `old`, dòng vừa ghi đọc lại không khớp. Lỗi người dùng gõ thì không bao giờ ném — nó đi về theo `invalid` để hiện đỏ ngay tại ô đó.
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

  if (typeof writeCommitAssertAvailable !== 'function') {
    throw new Error('Thiếu WriteCommit; không ghi dữ liệu để tránh mất signal reload.');
  }
  writeCommitAssertAvailable();

  return documentLockRun(function () {
    var result = writeGateRun(entity, records, source, fields, batDau, req.old);
    if (result && result.ok && result.changedIds && result.changedIds.length) {
      result.reloadDecision = writeCommitAfterSuccess({
        source: source,
        surface: 'record',
        entity: entity,
        recordIds: result.changedIds
      }).reloadDecision;
    }
    return result;
  });
}

