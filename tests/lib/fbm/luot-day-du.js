/**
 * Lượt đồng bộ đầy đủ Khách + Giao dịch dựng sẵn cho các ca kiểm đường truyền: GAS thật, executor thật trong tab giả, Sheet giả trong RAM và FBM giả phân trang theo khóa như FBM thật. Tệp ca chỉ đặt `options` rồi đọc kết quả.
 *
 * Các `options` đổi đúng một hành vi của FBM giả hoặc của đường truyền: `customers`, `failing`, `localActivity`, `manyActivities`, `ignoreActivityKey`, `cutColumn`, `cutCustomerColumn`, `editBatch`, `loseTab`, `rounds`, `scanCustomerRows`, `activityCustomerRows`, `goneCustomers`, `owners`, `exists`.
 */
const { workflowGas, khoDongBo } = require('./hop-dong-bo');
const { datState } = require('./dat-state');
const { USER_BODY } = require('./tu-dang-nhap');
const { tabGia, rawExecutor, guiLo, traLoiGhi, luoiFbm, dongFbm } = require('./tab-fbm-gia');

/** Phản hồi HTTP 500 của một phần tử lô, dùng để giả một khách (hoặc yêu cầu đọc khách chung) lỗi. */
const LOI_HTTP_500 = { ok: false, status: 500, headers: {}, body: JSON.stringify({ d: { Bugs: { Message: 'Lỗi máy chủ FBM' } } }) };

/** Chỉ phần tử giao dịch của một lô (khóa `stt_rec`); phần tử đầu đọc thông tin khách của lô. */
function khoaLoGiaoDich(request) {
  return (request && request.items || []).filter((item) => item.body.externalKey[0].Name === 'stt_rec').map((item) => item.body.externalKey[0].Value);
}

// Chạy cả pipeline Customer + Activity. `withTrace` nạp thêm Trace.js như GAS thật (có sổ bước nghiệp vụ thay cho dòng Log tóm tắt mỗi lát), dùng cho phép đếm lần gọi kho.
async function chayLuotDayDu(withTrace, mode, options) {
  const soKhach = options && options.customers || 2, khachLoi = options && options.failing || {};
  const fullLogs = [], fullWrites = [], fullLocal = { customer: [], activity: (options && options.localActivity || []).slice() };
  // Đếm mọi lần gọi kho DocumentProperties để chốt đợt 1 bước A: một lát Activity không được đọc/ghi kho theo số sự kiện.
  const fullProps = khoDongBo(), fullPropCalls = { count: 0 }, fullSheetReads = { customer: 0, activity: 0, category: 0 };
  ['getProperty', 'setProperty', 'deleteProperty', 'getProperties'].forEach((name) => { const original = fullProps[name]; fullProps[name] = function () { fullPropCalls.count += 1; return original.apply(this, arguments); }; });
  fullProps.setProperties = function (batch) { fullPropCalls.count += 1; Object.keys(batch).forEach((key) => { fullProps.data[key] = String(batch[key]); }); };
  const fullFlow = workflowGas({
    documentProperties: fullProps,
    extraFiles: withTrace ? ['fbm_sync/diagnostic/Trace.js'] : [],
    logEvent: (event) => fullLogs.push(event),
    LOG_OK: 'ok', LOG_WARN: 'warn', LOG_ERROR: 'error', LOG_CONFLICT: 'conflict',
    readLocal: 'sheet', DATA_SCHEMA: {}, SYNC_SCHEMA: {},
    entityReadAllCombined: (entity) => {
      fullSheetReads[entity] += 1;
      const fields = Array.from(new Set(fullLocal[entity].flatMap((record) => Object.keys(record))));
      return { fields, rows: fullLocal[entity].map((record) => fields.map((field) => record[field])) };
    },
    writeGateSave: (request) => {
      fullWrites.push(request);
      const entity = request.entity;
      (request.records || []).forEach((patch) => {
        let index = fullLocal[entity].findIndex((item) => String(item.id || '') === String(patch.id || ''));
        if (index < 0) {
          index = fullLocal[entity].length;
          const prefix = entity === 'customer' ? 'CUS-' : 'ACT-';
          fullLocal[entity].push(Object.assign({}, patch, { id: patch.id || prefix + String(index + 1).padStart(6, '0') }));
        } else {
          fullLocal[entity][index] = Object.assign({}, fullLocal[entity][index], patch);
        }
      });
      const fields = fullLocal[entity].length ? Object.keys(fullLocal[entity][0]) : [];
      return { ok: true, fields, rows: fullLocal[entity].map((record) => fields.map((field) => record[field])) };
    }
  });
  fullFlow.hop.FbmSync.prepareCategoryGate = () => ({ map: {}, names: {}, valid: {}, warnings: [] });
  fullFlow.hop.FbmSync.readCategoryGate = () => { fullSheetReads.category += 1; return { map: {}, names: {}, namesBySource: {}, valid: {}, warnings: [] }; };
  fullFlow.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
  if (options && options.scanCustomerRows) { fullFlow.hop.FbmSync.BUDGET.scanCustomerRows = options.scanCustomerRows; }
  if (options && options.activityCustomerRows) { fullFlow.hop.FbmSync.BUDGET.activityCustomerRows = options.activityCustomerRows; }
  const fullCustomerFields = fullFlow.hop.FbmSync.GRID_FIELDS.customer;
  const fullActivityFields = fullFlow.hop.FbmSync.GRID_FIELDS.activity;
  const gio = (i, base) => new Date(Date.UTC(2026, 8, 20, base, 0, 0) + (i - 1) * 60000).toISOString().slice(0, 19);
  const so2 = (i) => String(i).padStart(2, '0');
  const customerRows = Array.from({ length: soKhach }, (_, k) => k + 1).map((i) => dongFbm(fullCustomerFields, { stt_rec_kh: 'FBM-C' + i, ma_kh: 'ALT' + String(i).padStart(5, '0'), ten_kh: 'Cong ty ' + i, ma_so_thue: '0100' + so2(i), ong_ba: String.fromCharCode(65 + (i - 1) % 26), dc_lh: 'Ha Noi', dien_thoai: '09' + so2(i), email: 'c' + i + '@example.test', ngay_gd: '/Date(' + Date.UTC(2026, 8, 20) + ')/', datetime0: '/Date(' + Date.parse(gio(i, 1) + 'Z') + ')/', xorder: i }));
  const activityRows = Object.fromEntries(customerRows.map((_, k) => k + 1).map((i) => ['FBM-C' + i, [dongFbm(fullActivityFields, { id: 'FBM-A' + i, details: 'Goi dien ' + i, end_date: '2026-09-20', owner: 'Owner ' + i, datetime0: gio(i, 3), line_nbr: 1 })]]));
  // `manyActivities`: khách có nhiều giao dịch, mã số `900000 + n`, xếp như FBM (`end_date desc, datetime0 desc, id, line_nbr`), ngày ở dạng `/Date(ms)/`.
  Object.keys(options && options.manyActivities || {}).forEach((key) => {
    activityRows[key] = Array.from({ length: options.manyActivities[key] }, (_, n) => dongFbm(fullActivityFields, { id: String(900000 + n), details: 'Giao dich ' + n, end_date: '/Date(' + (Date.UTC(2026, 8, 20) - n * 3600000) + ')/', owner: 'Owner', datetime0: '/Date(' + (Date.UTC(2026, 8, 1) - n * 3600000) + ')/', line_nbr: 1 }));
  });
  const gdKhoa = ['end_date', 'datetime0', 'id', 'line_nbr'].map((field) => fullActivityFields.indexOf(field));
  const msCua = (value) => Number(String(value).match(/-?\d+/)[0]);
  const gdNgay = (value) => new Date(msCua(value) + 7 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
  // Trang giao dịch kế theo keyset như trang khách: khóa và mô tả trang phải khớp dòng cuối trang trước và tổng số dòng, lệch thì trang rỗng; `ignoreActivityKey` giả FBM bỏ qua khóa và trả lại trang đầu.
  const activityPage = (rows, body) => {
    if (!body.gridPageValue || options && options.ignoreActivityKey) { return { rows: rows.slice(0, Number(body.count)), total: rows.length }; }
    const at = rows.findIndex((dong) => JSON.stringify(gdKhoa.map((index, k) => (k < 2 ? '/Date(' + (msCua(dong[index]) + 7 * 3600000) + ')/' : dong[index]))) === JSON.stringify(body.gridPageValue)), keyRow = rows[at];
    const dung = keyRow && body.lastPageItem === gdNgay(keyRow[gdKhoa[0]]) + gdNgay(keyRow[gdKhoa[1]]) + keyRow[gdKhoa[2]] + keyRow[gdKhoa[3]] && body.lastRowCount === rows.length;
    const start = dung ? at + 1 : rows.length;
    return { rows: rows.slice(start, start + Number(body.count)), total: 0 };
  };
  const customerPageIndexes = [], activityItemTypes = [], customerItemTypes = [], fullKinds = [], fullStatuses = [], fullActivityPropCalls = [], fullActivitySheetReads = [], fullBatches = [], fullLookupFields = [];
  let fullStep = null;
  const fbmTab = tabGia();
  // `rounds` chạy lại cả lượt trên cùng Sheet; `loseTab` làm mọi lô giao dịch của lượt đầu đứt đường truyền, `loseTab: 1` chỉ lô đầu tiên.
  let lanMat = 0;
  for (let round = 0; round < (options && options.rounds || 1); round += 1) {
  datState(fullFlow.hop.FbmSync, { session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  fullStep = fullFlow.hop.FbmSync.runSlice(() => fullFlow.hop.FbmSync.start({ mode: mode || 'read', origin: 'manual', manual: true }, fullFlow.hop.FbmSync.stateRead()));
  for (let hop = 0; fullStep && fullStep.request && hop < 60; hop += 1) {
    const request = fullStep.request;
    const kind = String(request.meta && request.meta.kind || '');
    fullKinds.push(kind + ':' + String(request.meta && (request.meta.entity || request.meta.field) || ''));
    // Lô danh mục chỉ cần đi qua executor; số đo chi phí và các ca phá lô chỉ nhắm lô giao dịch.
    const activityBatch = kind === 'batch' && request.meta.entity === 'activity';
    if (kind === 'batch' && request.meta.entity === 'category') { fullLookupFields.push(request.items.map((item) => item.body.controller)); }
    if (activityBatch) { fullBatches.push(request); }
    if (activityBatch && round === 0 && options && options.loseTab && (options.loseTab === true || lanMat++ < options.loseTab)) {
      fullStep = fullFlow.hop.FbmSync.controlDispatch('continue', { error: { requestId: request.id, code: 'FBM_TRANSPORT_UNAVAILABLE', message: 'Mất tab FBM' } }, 'relay');
      fullStatuses.push(fullStep.status);
      continue;
    }
    let body;
    if (kind === 'session_probe' || kind === 'identity_user_grid') {
      body = USER_BODY;
    } else if (kind === 'authorize') {
      body = JSON.stringify({ d: { Authorized: 'auth-' + request.meta.entity } });
    } else if (kind === 'completion') {
      body = JSON.stringify({ d: [['CODE', 'Ten danh muc']] });
    } else if (kind === 'scan_chunk') {
      body = '';
    } else if ((kind === 'grid' || kind === 'scan_job' || kind === 'customer_count') && request.meta.entity === 'customer') {
      // FBM phân trang keyset: trang kế bắt đầu sau dòng có đúng bốn giá trị khóa đã gửi, ngày ở dạng `/Date(ms)/`; khóa lệch thì trang rỗng. Chỉ trang đầu báo `TotalRowCount` (Nghiên cứu FBM ch03 mục 3.3, ch04 mục 4.10).
      const pageSize = Number(request.body.count), pageValue = request.body.gridPageValue, khoa = ['ngay_gd', 'datetime0', 'xorder', 'stt_rec_kh'].map((field) => fullCustomerFields.indexOf(field));
      // Trang sau chỉ có dữ liệu khi request mô tả đúng dòng cuối trang đang đứng và tổng số dòng, như FBM thật (yyyyMMdd theo giờ Việt Nam).
      const ngayFbm = (value) => new Date(Number(String(value).match(/\d+/)[0]) + 7 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
      // FBM đọc ngày trong khóa trang như giờ UTC: khóa chỉ khớp khi ngày đã cộng 7 giờ như giao diện FBM gửi.
      const gioMayChu = (value) => '/Date(' + (Number(String(value).match(/\d+/)[0]) + 7 * 3600000) + ')/';
      const keyIndex = pageValue ? customerRows.findIndex((item) => JSON.stringify(khoa.map((index, k) => (k < 2 ? gioMayChu(item[index]) : item[index]))) === JSON.stringify(pageValue)) : -1, keyRow = customerRows[keyIndex];
      const moTaDung = keyRow && request.body.lastPageItem === ngayFbm(keyRow[khoa[0]]) + ngayFbm(keyRow[khoa[1]]) + keyRow[khoa[2]] + keyRow[khoa[3]] && request.body.lastRowCount === customerRows.length;
      const pageStart = !pageValue ? 0 : moTaDung ? keyIndex + 1 : customerRows.length;
      if (kind === 'scan_job') { customerPageIndexes.push([request.body.gridPageIndex, request.body.lastPageIndex]); }
      body = luoiFbm(fullCustomerFields, customerRows.slice(pageStart, pageStart + pageSize), pageStart ? 0 : customerRows.length);
    } else if (kind !== 'batch') {
      throw new Error('Ca mô phỏng pipeline gặp request không mong đợi: ' + kind);
    }
    let raw = kind === 'batch' ? await guiLo(request, (item) => {
      if (/GetCompletionList/.test(item.url)) { return { body: JSON.stringify({ d: [['CODE', 'Ten danh muc']] }) }; }
      const gateReply = traLoiGhi(item, { customerItemTypes, cutColumn: options && options.cutCustomerColumn, fields: fullCustomerFields, rows: customerRows, gone: options && options.goneCustomers, owners: options && options.owners, exists: options && options.exists });
      if (gateReply) { return gateReply; }
      const key = item.body.externalKey[0].Value;
      if (khachLoi[key]) { return { raw: khachLoi[key] }; }
      // FBM chỉ trả tiêu đề cột khi `type: 0`; trang không tiêu đề chỉ có `Rows`.
      activityItemTypes.push(item.body.type);
      const trang = activityPage(activityRows[key] || [], item.body);
      const dongs = trang.rows.map((dong) => options && options.cutColumn === key ? dong.slice(1) : dong);
      const body = JSON.parse(luoiFbm(fullActivityFields, dongs, trang.total));
      if (item.body.type !== 0) { delete body.d.ViewPage; }
      return { body: JSON.stringify(body) };
    }) : rawExecutor((await fbmTab.send(request, body)).reply, request.id);
    if (activityBatch && options && options.editBatch) { raw = options.editBatch(raw, fullBatches.length); }
    if (activityBatch) {
      // Đi đúng đường của fbmContinueSync (bộ đệm một lần gọi, khóa điều phối) để đếm số lần gọi kho của một lát Activity.
      const callsBefore = fullPropCalls.count, readsBefore = Object.assign({}, fullSheetReads), writesBefore = fullWrites.length;
      fullFlow.hop.FbmSync.propertyBufferBegin();
      // Chặng ném lỗi có mã thì lát đã đóng lượt lỗi rồi ném tiếp, như cửa relay thật nhận lỗi; ca kiểm đọc kết quả qua ô lượt.
      try { fullStep = fullFlow.hop.FbmSync.controlDispatch('continue', { response: raw }, 'relay'); }
      catch (stageError) { if (!stageError.code) { throw stageError; } fullStep = { ok: false, code: stageError.code, request: null, status: fullFlow.hop.FbmSync.statusView() }; }
      if (withTrace) { fullFlow.hop.FbmSync.traceEvent({}, 'engine_after', { operation: 'fbmContinueSync' }); }
      fullFlow.hop.FbmSync.propertyBufferEnd();
      fullActivityPropCalls.push(fullPropCalls.count - callsBefore);
      const sliceReads = Object.keys(fullSheetReads).reduce((out, key) => Object.assign(out, { [key]: fullSheetReads[key] - readsBefore[key] }), {});
      const sliceWrites = fullWrites.slice(writesBefore).reduce((out, item) => Object.assign(out, { [item.entity]: (out[item.entity] || 0) + 1 }), {});
      fullActivitySheetReads.push({ reads: sliceReads, writes: sliceWrites });
      fullStatuses.push(fullStep.status);
      continue;
    }
    fullStep = fullFlow.hop.FbmSync.runSlice(() => fullFlow.hop.FbmSync.continue(raw));
    fullStatuses.push(fullStep.status);
  }
  }
  return { customerPageIndexes, activityItemTypes, customerItemTypes, fullFlow, fullLogs, fullWrites, fullLocal, fullStep, fullKinds, fullStatuses, fullActivityPropCalls, fullActivitySheetReads, fullBatches, fullLookupFields };
}

module.exports = { chayLuotDayDu, LOI_HTTP_500, khoaLoGiaoDich };
