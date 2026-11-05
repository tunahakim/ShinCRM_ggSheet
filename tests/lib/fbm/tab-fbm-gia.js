/**
 * Tab FBM giả cho test luồng quét: chạy `executor.js` thật của Extension trong một hộp giữ nguyên giữa các request (RAM việc quét còn đến khi gọi `reload()`), cùng các hàm dựng response lưới và trả lời giả cho phần tử cửa ghi. Mọi tệp ca FBM lấy tab giả từ đây.
 */
const { napExtension } = require('../ext/nap-extension');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

function luoiFbm(fields, rows, total) {
  return JSON.stringify({ d: {
    TotalRowCount: total === undefined ? rows.length : total,
    Rows: rows,
    ViewPage: { Fields: fields.map((AliasName) => ({ AliasName })) }
  } });
}

function dongFbm(fields, values) {
  const output = [];
  fields.forEach((field, index) => { output[index] = values[field] === undefined ? '' : values[field]; });
  return output;
}

function phanHoiFbm(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer)
  };
}

/** Một tab FBM giả: executor thật chạy trong một context giữ nguyên giữa các request, nên RAM việc quét còn đến khi gọi `reload()`. */
function tabGia() {
  let listener = null, responseBody = '', fetches = 0, sent = null;
  const load = () => {
    listener = null;
    const context = {
      console: { log() {}, warn() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout,
      Blob, Response, TextDecoder, TextEncoder, DecompressionStream: undefined,
      document: { documentElement: { innerHTML: '<script>var payload={"cookie":"461020379855cFHN_CRM_App"};</script><script>var menu={"username":"Le Tuan Anh"};</script>', textContent: '' } },
      fetch(url, options) {
        fetches += 1;
        sent = { url: String(url), body: options && options.body };
        return Promise.resolve(phanHoiFbm(responseBody));
      },
      chrome: { runtime: { getManifest: () => ({ version: '22.0' }), onMessage: { addListener(fn) { listener = fn; }, removeListener() {} } } }
    };
    napExtension('executor', context);
  };
  load();
  return {
    reload: load,
    fetches: () => fetches,
    send(request, body) {
      responseBody = body; sent = null;
      return new Promise((resolve, reject) => {
        if (!listener) { reject(new Error('Executor không đăng ký kênh FBM_EXECUTE_V2.')); return; }
        listener({ type: 'FBM_EXECUTE_V2', request }, null, (reply) => resolve({ reply, sent }));
      });
    }
  };
}

function guiQuaExecutor(request, responseBody) {
  return tabGia().send(request, responseBody);
}

function rawExecutor(reply, requestId) {
  const result = reply && reply.result || {};
  return {
    ok: result.ok === true,
    status: Number(result.status || 0),
    body: String(result.body || ''),
    job: result.job,
    // Giữ giá trị executor bắt từ trang như Extension thật gửi về (payload cookie, mã và tên người đăng nhập trên trang).
    transport: { contract: MA_HOP_DONG, captures: result.transport && result.transport.captures, trace: [{ stage: 'executor_response_sent', requestId: String(requestId) }] }
  };
}

/**
 * Chạy lô như service worker: từng phần tử qua executor thật với hạn fetch của lô; `itemReply` trả `{ body }` hoặc `{ raw }` để giả lỗi HTTP một khách.
 * Vết của lô là vết executor thật trả về, như `executeBatch`; không tự điền mã lô, để test bắt được executor đóng dấu sai mã request.
 */
async function guiLo(envelope, itemReply) {
  const items = [];
  let trace = [];
  for (const item of envelope.items) {
    const reply = itemReply(item);
    if (reply.raw) { items.push(Object.assign({ id: item.id }, reply.raw)); trace = trace.concat([{ stage: 'executor_response_sent', requestId: String(item.meta.trace.requestId) }]); continue; }
    const result = (await guiQuaExecutor(Object.assign({}, item, { meta: Object.assign({}, item.meta, { fetchMs: envelope.meta.fetchMs }) }), reply.body)).reply.result || {};
    trace = trace.concat(result.transport && result.transport.trace || []);
    items.push({ id: item.id, ok: result.ok === true, status: Number(result.status || 0), headers: result.headers || {}, body: String(result.body || '') });
  }
  return { ok: true, status: 200, items, transport: { contract: MA_HOP_DONG, trace } };
}

/**
 * FBM giả cho các phần tử cửa ghi không phải giao dịch: phần tử đọc thông tin khách của lô (`stt_rec_kh in ('…')`) và hai kiểu tra mã khách không lọc quyền. Trả `null` khi phần tử là giao dịch.
 * `ctx`: `fields`, `rows` (dòng khách dạng mảng theo `fields`), `gone` (mã khách FBM không còn trả trong quyền), `owners` (id giao dịch → `stt_rec_kh` đang giữ), `exists` (mã khách còn tồn tại ngoài quyền).
 */
function traLoiGhi(item, ctx) {
  const keys = item.body.externalKey || [], sttIndex = ctx.fields.indexOf('stt_rec_kh');
  const batchKey = keys.find((k) => /^stt_rec_kh in \('/.test(k.Name)), ownerKey = keys.find((k) => /sysevents/.test(k.Name)), existKey = keys.find((k) => k.Name === 'stt_rec_kh' && k.Opr === '=');
  if (batchKey) {
    const ids = batchKey.Name.match(/'([^']+)'/g).map((text) => text.slice(1, -1)), gone = ctx.gone || [];
    const dongKhach = ctx.rows.filter((dong) => ids.indexOf(dong[sttIndex]) >= 0 && gone.indexOf(dong[sttIndex]) < 0);
    // FBM chỉ trả tiêu đề cột khi `type: 0`; `cutColumn` cắt một cột ở trang không tiêu đề để giả FBM đổi cấu trúc.
    if (ctx.customerItemTypes) { ctx.customerItemTypes.push(item.body.type); }
    const body = JSON.parse(luoiFbm(ctx.fields, item.body.type !== 0 && ctx.cutColumn ? dongKhach.map((dong) => dong.slice(1)) : dongKhach, dongKhach.length));
    if (item.body.type !== 0) { delete body.d.ViewPage; }
    return { body: JSON.stringify(body) };
  }
  if (!ownerKey && !existKey) { return null; }
  // `fail`: FBM trả lỗi nghiệp vụ cho request tra mã này.
  if (ctx.fail && ctx.fail(item)) { return { body: JSON.stringify({ d: { Bugs: { FieldName: 'stt_rec_kh', Message: 'Lỗi tra giả lập' } } }) }; }
  const found = ownerKey ? (ctx.owners || {})[ownerKey.Name.match(/id = '(\d+)'/)[1]] : (ctx.exists || []).indexOf(existKey.Value) >= 0 ? existKey.Value : '';
  return { body: JSON.stringify({ d: { TotalRowCount: found ? 1 : 0, ViewPage: { Fields: [{ AliasName: 'stt_rec_kh' }] }, Rows: found ? [[found]] : [] } }) };
}

module.exports = { tabGia, rawExecutor, guiLo, traLoiGhi, luoiFbm, dongFbm };
