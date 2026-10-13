/**
 * Hợp đồng dữ liệu giữa GAS (gồm Sidebar) và Extension; nguồn là Tài liệu 09.01 mục "Mã phiên bản hợp đồng GAS–Extension".
 *
 * GAS và Extension cài ở hai nơi nên có thể lệch bản. Mã phiên bản là SHA-256 của dữ liệu dưới đây (không tính chú thích), hai bên chép mã vào hằng của mình; test `gasExtensionContract` báo mã mới cần chép khi dữ liệu đổi.
 * Đổi bất kỳ trường nào bên dưới thì mã đổi, Extension cũ sẽ bị GAS từ chối cho tới khi chủ dự án tải lại Extension.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONTRACT = {
  // GAS → Extension: envelope một request FBM. Extension chỉ đọc các trường này và không suy luận nghiệp vụ.
  request: {
    fields: ['protocol', 'version', 'contract', 'id', 'url', 'method', 'headers', 'body', 'bodyText', 'meta', 'items'],
    meta: ['kind', 'trace', 'transport', 'requestGap', 'force', 'credentialRef', 'openFbmContext', 'afterLoginUrl', 'timeoutMs', 'fetchMs', 'gasReplyMs', 'batch', 'job'],
    transport: ['captures', 'replacements'],
    // Khoảng nghỉ ngẫu nhiên Extension chờ trước mỗi request gọi FBM (kể cả từng phần tử của lô), tính từ lúc request FBM trước kết thúc.
    requestGap: ['minMs', 'maxMs'],
    // Lô request đọc độc lập (`meta.kind = 'batch'`): Extension chạy lần lượt, dừng khi tổng thân vượt `batch.maxBytes`.
    batch: ['maxBytes'],
    // Việc quét: `scan_job` gọi FBM một lần, chiếu cột, cắt gói và giữ trong RAM tab; `scan_chunk` trả gói theo số thứ tự, không gọi FBM.
    scanKinds: ['scan_job', 'scan_chunk'],
    job: ['jobId', 'fields', 'idField', 'keepIds', 'chunkTargetBytes', 'chunkMaxBytes', 'maxResponseBytes', 'chunkIndex'],
    item: ['id', 'url', 'method', 'headers', 'body', 'bodyText', 'meta'],
    itemMeta: ['kind', 'trace']
  },
  // Extension → GAS: response FBM thô. `transport.contract` là mã phiên bản Extension đang chạy.
  response: {
    fields: ['ok', 'status', 'headers', 'body', 'transport', 'items', 'job'],
    transport: ['contract', 'trace', 'captures', 'loginStage', 'loginBlocked'],
    // Response lô chỉ gồm phần tử đã chạy, đúng thứ tự gửi.
    item: ['id', 'ok', 'status', 'headers', 'body'],
    // Gói của việc quét giữ dạng response grid FBM; `job` cho GAS đối chiếu với cursor trước khi ghi.
    job: ['jobId', 'chunkIndex', 'chunkCount', 'rowCount', 'keptCount', 'totalRowCount', 'oversize'],
    // Tab không còn giữ việc quét (tải lại, Extension khởi động lại): GAS chạy lại cả việc. Quá trần cỡ, không đọc được dạng bảng hoặc hết hạn fetch: GAS chia giao dịch theo khoảng ngày.
    codes: ['FBM_SCAN_JOB_GONE', 'FBM_SCAN_TOO_LARGE', 'FBM_SCAN_UNPARSEABLE', 'FBM_FETCH_TIMEOUT']
  },
  // Extension → Web App GAS (nhịp nền).
  relay: {
    kinds: ['heartbeat_request', 'heartbeat', 'heartbeat_transport_failure', 'background_sync', 'transport_probe'],
    commands: ['continue', 'transport_failure']
  },
  // Sidebar ↔ Extension qua postMessage.
  bridge: {
    toExtension: ['CRM_HANDSHAKE', 'CRM_FBM_CONFIG', 'CRM_FBM_REQUEST', 'CRM_FBM_CREDENTIALS', 'CRM_FBM_CREDENTIAL_METADATA', 'CRM_FBM_CREDENTIAL_CLEAR', 'CRM_FBM_CANCEL', 'CRM_FBM_TRANSPORT_PROBE'],
    toSidebar: ['CRM_HANDSHAKE_ACK', 'CRM_FBM_CONFIG_ACK', 'CRM_FBM_RESPONSE', 'CRM_FBM_CREDENTIALS_RESULT', 'CRM_FBM_CREDENTIAL_METADATA_RESULT', 'CRM_FBM_CREDENTIAL_CLEAR_RESULT', 'CRM_FBM_TRANSPORT_PROBE_RESULT']
  }
};

function contractVersion(contract) {
  return crypto.createHash('sha256').update(JSON.stringify(contract || CONTRACT)).digest('hex').slice(0, 12);
}

/** Mã Extension đang công bố; response giả trong test dùng mã này để giống đúng thứ Extension thật gửi về. */
function extensionContractVersion() {
  const worker = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'background', 'service_worker.js');
  return (fs.readFileSync(worker, 'utf8').match(/var FBM_CONTRACT_VERSION = '([^']*)';/) || [])[1];
}

module.exports = { CONTRACT, contractVersion, extensionContractVersion };
