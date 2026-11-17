/* Biến response FBM thành thứ gửi về GAS: đọc body có trần cỡ (giải nén gzip), giữ cột theo lệnh `keep` của GAS và cắt lưới thành gói dưới trần đường relay. Không hiểu nghiệp vụ: không đổi giá trị ô, không chọn dòng ngoài danh sách id GAS gửi.
 * Nạp trước `executor.js` (manifest và `FBM_EXECUTOR_FILES` của service worker cùng thứ tự); nạp lại khi tab nhận executor mới thì chỉ ghi đè cùng một đối tượng. */
(function () {
  /** Việc quét vượt trần cỡ response: không gửi gì về GAS ngoài mã lỗi, GAS tự chia nhỏ theo khoảng ngày. */
  function responseTooLarge(maxBytes) {
    var error = new Error('Response FBM vượt ' + Math.round(maxBytes / 1048576) + ' MB của một lần quét.');
    error.code = 'FBM_SCAN_TOO_LARGE';
    return error;
  }
  /** Có trần thì đọc dần và dừng ngay khi vượt, để tab không phải giữ cả response khổng lồ rồi mới biết. */
  function readResponseBytes(response, maxBytes) {
    var limit = Number(maxBytes || 0);
    if (!(limit > 0) || !response.body || typeof response.body.getReader !== 'function') {
      return response.arrayBuffer().then(function (buffer) {
        if (limit > 0 && buffer.byteLength > limit) { throw responseTooLarge(limit); }
        return new Uint8Array(buffer);
      });
    }
    var reader = response.body.getReader(), parts = [], total = 0;
    function pump() {
      return reader.read().then(function (step) {
        if (step.done) {
          var bytes = new Uint8Array(total), offset = 0;
          parts.forEach(function (part) { bytes.set(part, offset); offset += part.length; });
          return bytes;
        }
        total += step.value.length;
        if (total > limit) { reader.cancel(); throw responseTooLarge(limit); }
        parts.push(step.value);
        return pump();
      });
    }
    return pump();
  }
  /** Đọc body thành văn bản để GAS tự parse; response gzip FBM trả thô thì giải nén, tránh GAS nhận chuỗi 1F 8B. */
  function readResponseText(response, maxBytes) {
    var limit = Number(maxBytes || 0);
    return readResponseBytes(response, limit).then(function (bytes) {
      var gzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
      if (gzip && typeof DecompressionStream === 'function') {
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).text().then(function (text) {
          if (limit > 0 && text.length > limit) { throw responseTooLarge(limit); }
          return text;
        });
      }
      if (typeof TextDecoder === 'function') { return new TextDecoder('utf-8').decode(bytes); }
      return String.fromCharCode.apply(null, bytes);
    });
  }
  function utf8Length(text) { return new TextEncoder().encode(text).length; }
  /** Byte của đoạn văn bản khi nằm trong chuỗi `body` của response JSON (đã thoát ký tự), vì trần đo trên gói đã serialize. */
  function quotedLength(text) { return utf8Length(JSON.stringify(String(text))) - 2; }
  /** Lưới là response có mảng `Rows`; response khác (lỗi FBM, trang đăng nhập) trả null để đi nguyên về GAS. */
  function gridData(text) {
    var parsed = JSON.parse(String(text || '')), data = parsed && parsed.d !== undefined ? parsed.d : parsed;
    if (typeof data === 'string') { data = JSON.parse(data); }
    return data && Array.isArray(data.Rows) ? data : null;
  }
  function fieldName(field) { return String(field && (field.AliasName || field.aliasName || field.Name || field.name) || ''); }
  /**
   * Cắt response lưới theo lệnh `keep` của GAS: dòng chỉ còn các cột GAS cần, đúng thứ tự GAS gửi; bỏ mô tả cột, bố cục và script của FBM. Tên cột cần không gửi về vì GAS đã biết.
   * `keep.fields` (trang có tiêu đề): tìm vị trí theo tên trong tiêu đề, trả thêm `SourceFields` là tên cột gốc để GAS tính vị trí cho các trang không tiêu đề. `keep.positions` với `keep.width` (trang không tiêu đề): cắt theo vị trí GAS tính.
   * Thiếu cột theo tên, hoặc có dòng mang số cột khác, thì không trả dòng mà báo `MissingFields`/`ShapeMismatch` để GAS dừng: cắt tiếp thì ô bị dồn và GAS đọc nhầm trường.
   * Giữ `Authorized` và `Bugs` để cổng phiên và cổng lỗi của GAS vẫn phân loại được (FBM báo chưa đăng nhập bằng `Authorized:false` với lưới rỗng). Chạy trong tab vì response quét có thể vài MB, không ra khỏi tab được.
   */
  function replyPick(data, keep) {
    var source = data.ViewPage && Array.isArray(data.ViewPage.Fields) ? data.ViewPage.Fields.map(fieldName) : null, byName = Array.isArray(keep.fields);
    var positions = byName ? keep.fields.map(function (name) { return source ? source.indexOf(String(name)) : -1; }) : (Array.isArray(keep.positions) ? keep.positions : []).map(Number);
    var width = source ? source.length : keep.width, out = { Rows: [], TotalRowCount: Number(data.TotalRowCount || 0) };
    if (data.Authorized !== undefined) { out.Authorized = data.Authorized; }
    if (data.Bugs !== undefined && data.Bugs !== null) { out.Bugs = data.Bugs; }
    if (source) { out.SourceFields = source; }
    var missing = byName ? keep.fields.filter(function (name, index) { return positions[index] < 0; }).map(String) : [];
    if (missing.length) { out.MissingFields = missing; return out; }
    if (width !== undefined && width !== null && data.Rows.some(function (row) { return !Array.isArray(row) || row.length !== Number(width); })) { out.ShapeMismatch = { width: Number(width) }; return out; }
    out.Rows = data.Rows.map(function (row) { return positions.map(function (position) { return row[position] === undefined ? null : row[position]; }); });
    return out;
  }
  /** Response lưới thì giữ cột theo `keep`; không phải lưới hoặc không có `keep` thì trả nguyên văn bản. */
  function replyPickText(text, keep) {
    if (!keep) { return text; }
    var data = null;
    try { data = gridData(text); } catch (notGrid) { return text; }
    return data ? JSON.stringify({ d: replyPick(data, keep) }) : text;
  }
  /** Cắt gói từ lưới đã qua `replyPick`; một dòng không bao giờ bị cắt đôi, dòng riêng nó đã vượt trần thì không gửi mà báo id trong `oversize`. Vị trí cột mã (`job.idIndex`) do GAS tính; tên cột gốc chỉ đi trong gói 0. */
  function scanChunks(data, job) {
    var idIndex = Number(job.idIndex), keep = Array.isArray(job.keepIds) ? {} : null, total = Number(data.TotalRowCount || 0), head = {};
    if (keep) { job.keepIds.forEach(function (id) { keep[String(id)] = true; }); }
    Object.keys(data).forEach(function (key) { if (key !== 'Rows' && key !== 'SourceFields') { head[key] = data[key]; } });
    var headText = JSON.stringify(head).slice(1, -1), firstText = data.SourceFields ? JSON.stringify({ SourceFields: data.SourceFields }).slice(1, -1) : '';
    var shell = function (rowsText, first) { return '{"d":{"Rows":[' + rowsText + ']' + (headText ? ',' + headText : '') + (first && firstText ? ',' + firstText : '') + '}}'; };
    // Phần cố định của một gói: thân rỗng (gói 0 có thêm tên cột gốc), khối `job` và dấu vết vận chuyển; dư 4 KiB cho trace, mã hợp đồng và wrapper relay.
    var fixed = quotedLength(shell('', true)) + utf8Length(JSON.stringify({ ok: true, status: 200, headers: { contentType: 'application/json; charset=utf-8' }, body: '', job: { jobId: job.jobId, chunkIndex: 0, chunkCount: 0, rowCount: 0, keptCount: 0, totalRowCount: total, oversize: [] } })) + 4096;
    var target = Number(job.chunkTargetBytes || 0), max = Number(job.chunkMaxBytes || 0), chunks = [], current = [], size = fixed, oversize = [], kept = 0;
    data.Rows.forEach(function (row) {
      if (keep && !keep[String(row[idIndex])]) { return; }
      var text = JSON.stringify(row), bytes = quotedLength(text) + 1;
      kept += 1;
      if (fixed + bytes > max) { oversize.push(String(row[idIndex] === undefined ? '' : row[idIndex])); return; }
      if (current.length && size + bytes > target) { chunks.push(shell(current.join(','), !chunks.length)); current = []; size = fixed; }
      current.push(text); size += bytes;
    });
    if (current.length || !chunks.length) { chunks.push(shell(current.join(','), !chunks.length)); }
    return { chunks: chunks, rowCount: data.Rows.length, keptCount: kept, totalRowCount: total, oversize: oversize };
  }
  globalThis.ShinFbmResponse = { readResponseText: readResponseText, gridData: gridData, replyPick: replyPick, replyPickText: replyPickText, scanChunks: scanChunks };
})();
