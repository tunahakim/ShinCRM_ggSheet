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
    fields: ['protocol', 'version', 'contract', 'id', 'url', 'method', 'headers', 'body', 'bodyText', 'meta'],
    meta: ['kind', 'trace', 'transport', 'waitMs', 'force', 'credentialRef', 'openFbmContext', 'afterLoginUrl'],
    transport: ['captures', 'replacements']
  },
  // Extension → GAS: response FBM thô. `transport.contract` là mã phiên bản Extension đang chạy.
  response: {
    fields: ['ok', 'status', 'headers', 'body', 'transport'],
    transport: ['contract', 'trace', 'captures', 'loginStage', 'loginBlocked']
  },
  // Extension → Web App GAS (nhịp nền).
  relay: {
    kinds: ['heartbeat_request', 'heartbeat', 'heartbeat_transport_failure', 'background_sync'],
    commands: ['continue', 'transport_failure']
  },
  // Sidebar ↔ Extension qua postMessage.
  bridge: {
    toExtension: ['CRM_HANDSHAKE', 'CRM_FBM_CONFIG', 'CRM_FBM_REQUEST', 'CRM_FBM_CREDENTIALS', 'CRM_FBM_CREDENTIAL_METADATA', 'CRM_FBM_CREDENTIAL_CLEAR'],
    toSidebar: ['CRM_HANDSHAKE_ACK', 'CRM_FBM_CONFIG_ACK', 'CRM_FBM_RESPONSE', 'CRM_FBM_CREDENTIALS_RESULT', 'CRM_FBM_CREDENTIAL_METADATA_RESULT', 'CRM_FBM_CREDENTIAL_CLEAR_RESULT']
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
