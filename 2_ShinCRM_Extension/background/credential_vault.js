/**
 * Kho khóa giải mã mật khẩu FBM của Extension và bước điền ô đăng nhập. Kho chỉ giữ khóa theo mã tham chiếu, bản mã nằm ở GAS: lộ một bên chưa lộ mật khẩu. Mật khẩu và hash chỉ sống trong lời gọi `credentialFill` và request gửi FBM, không về GAS, không vào vết.
 * Tệp nạp vào service worker bằng `importScripts`; dùng `storageGet`, `storageSet`, `codedError` của service worker.
 */
var CREDENTIAL_VAULT_PREFIX = 'fbmCredentialVault:';
function bytesToBase64(bytes) { var text = ''; for (var i = 0; i < bytes.length; i += 1) { text += String.fromCharCode(bytes[i]); } return btoa(text); }
function base64ToBytes(value) { var text = atob(String(value || '')), bytes = new Uint8Array(text.length); for (var i = 0; i < text.length; i += 1) { bytes[i] = text.charCodeAt(i); } return bytes; }
function credentialRef() { var bytes = new Uint8Array(12); crypto.getRandomValues(bytes); return 'cred-' + bytesToBase64(bytes).replace(/[+/=]/g, '').slice(0, 16); }
/** Mã các khóa giải mã mật khẩu FBM Extension máy này đang giữ (chỉ mã, không có khóa): GAS cần biết để chỉ cho máy đăng nhập lại được FBM tự nhận chạy nền. */
function credentialRefsHeld() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(null, function (all) {
      resolve(Object.keys(all || {}).filter(function (key) { return key.indexOf(CREDENTIAL_VAULT_PREFIX) === 0; }).map(function (key) { return key.slice(CREDENTIAL_VAULT_PREFIX.length); }));
    });
  });
}

/** Mã hóa ngay trên Extension: kho Extension chỉ giữ khóa giải mã theo mã tham chiếu, bản mã chỉ nằm ở GAS. Hai nửa tách nhau nên lộ một bên chưa lộ mật khẩu. */
function saveCredentialEnvelope(input) {
  var value = input || {}, ref = String(value.credentialRef || '').trim() || credentialRef(), username = String(value.username || ''), password = String(value.password || '');
  if (!username || !password) { return Promise.resolve({ ok: false, code: 'LOGIN_FIELDS_REQUIRED', error: 'Cần nhập username và mật khẩu FBM.' }); }
  var payload = JSON.stringify({ username: username, password: password, userId: String(value.userId || ''), spreadsheetId: String(value.spreadsheetId || ''), database: String(value.database || ''), unit: String(value.unit || ''), language: String(value.language || 'v') });
  var iv = crypto.getRandomValues(new Uint8Array(12));
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']).then(function (key) {
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(payload)).then(function (cipher) {
      return crypto.subtle.exportKey('jwk', key).then(function (jwk) {
        var envelope = { version: 1, alg: 'AES-GCM', iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(cipher)) };
        return storageSet({ [CREDENTIAL_VAULT_PREFIX + ref]: { ref: ref, key: jwk } }).then(function () {
          return { ok: true, credentialRef: ref, envelope: envelope, public: { usernameHint: username, database: String(value.database || ''), unit: String(value.unit || ''), language: String(value.language || 'v') } };
        });
      });
    });
  }).catch(function (error) { return { ok: false, code: 'LOGIN_ENCRYPT_FAILED', error: String(error && error.message || error) }; });
}
function md5(value) {
  function rotate(x, n) { return (x << n) | (x >>> (32 - n)); }
  function add(x, y) { return (x + y) | 0; }
  function ff(a, b, c, d, x, s, t) { return add(rotate(add(add(a, (b & c) | (~b & d)), add(x, t)), s), b); }
  function gg(a, b, c, d, x, s, t) { return add(rotate(add(add(a, (b & d) | (c & ~d)), add(x, t)), s), b); }
  function hh(a, b, c, d, x, s, t) { return add(rotate(add(add(a, b ^ c ^ d), add(x, t)), s), b); }
  function ii(a, b, c, d, x, s, t) { return add(rotate(add(add(a, c ^ (b | ~d)), add(x, t)), s), b); }
  var input = unescape(encodeURIComponent(String(value))), bytes = [], i, j, a, b, c, d, olda, oldb, oldc, oldd, x = [];
  for (i = 0; i < input.length; i += 1) { bytes[i >> 2] = (bytes[i >> 2] || 0) | input.charCodeAt(i) << ((i % 4) * 8); }
  bytes[input.length >> 2] = (bytes[input.length >> 2] || 0) | 0x80 << ((input.length % 4) * 8);
  bytes[(((input.length + 8) >> 6) + 1) * 16 - 2] = input.length * 8;
  bytes[(((input.length + 8) >> 6) + 1) * 16 - 1] = 0;
  a = 0x67452301; b = 0xefcdab89; c = 0x98badcfe; d = 0x10325476;
  for (i = 0; i < bytes.length; i += 16) {
    for (j = 0; j < 16; j += 1) { x[j] = bytes[i + j] || 0; }
    olda = a; oldb = b; oldc = c; oldd = d;
    a = ff(a,b,c,d,x[0],7,-680876936); d = ff(d,a,b,c,x[1],12,-389564586); c = ff(c,d,a,b,x[2],17,606105819); b = ff(b,c,d,a,x[3],22,-1044525330);
    a = ff(a,b,c,d,x[4],7,-176418897); d = ff(d,a,b,c,x[5],12,1200080426); c = ff(c,d,a,b,x[6],17,-1473231341); b = ff(b,c,d,a,x[7],22,-45705983);
    a = ff(a,b,c,d,x[8],7,1770035416); d = ff(d,a,b,c,x[9],12,-1958414417); c = ff(c,d,a,b,x[10],17,-42063); b = ff(b,c,d,a,x[11],22,-1990404162);
    a = ff(a,b,c,d,x[12],7,1804603682); d = ff(d,a,b,c,x[13],12,-40341101); c = ff(c,d,a,b,x[14],17,-1502002290); b = ff(b,c,d,a,x[15],22,1236535329);
    a = gg(a,b,c,d,x[1],5,-165796510); d = gg(d,a,b,c,x[6],9,-1069501632); c = gg(c,d,a,b,x[11],14,643717713); b = gg(b,c,d,a,x[0],20,-373897302);
    a = gg(a,b,c,d,x[5],5,-701558691); d = gg(d,a,b,c,x[10],9,38016083); c = gg(c,d,a,b,x[15],14,-660478335); b = gg(b,c,d,a,x[4],20,-405537848);
    a = gg(a,b,c,d,x[9],5,568446438); d = gg(d,a,b,c,x[14],9,-1019803690); c = gg(c,d,a,b,x[3],14,-187363961); b = gg(b,c,d,a,x[8],20,1163531501);
    a = gg(a,b,c,d,x[13],5,-1444681467); d = gg(d,a,b,c,x[2],9,-51403784); c = gg(c,d,a,b,x[7],14,1735328473); b = gg(b,c,d,a,x[12],20,-1926607734);
    a = hh(a,b,c,d,x[5],4,-378558); d = hh(d,a,b,c,x[8],11,-2022574463); c = hh(c,d,a,b,x[11],16,1839030562); b = hh(b,c,d,a,x[14],23,-35309556);
    a = hh(a,b,c,d,x[1],4,-1530992060); d = hh(d,a,b,c,x[4],11,1272893353); c = hh(c,d,a,b,x[7],16,-155497632); b = hh(b,c,d,a,x[10],23,-1094730640);
    a = hh(a,b,c,d,x[13],4,681279174); d = hh(d,a,b,c,x[0],11,-358537222); c = hh(c,d,a,b,x[3],16,-722521979); b = hh(b,c,d,a,x[6],23,76029189);
    a = hh(a,b,c,d,x[9],4,-640364487); d = hh(d,a,b,c,x[12],11,-421815835); c = hh(c,d,a,b,x[15],16,530742520); b = hh(b,c,d,a,x[2],23,-995338651);
    a = ii(a,b,c,d,x[0],6,-198630844); d = ii(d,a,b,c,x[7],10,1126891415); c = ii(c,d,a,b,x[14],15,-1416354905); b = ii(b,c,d,a,x[5],21,-57434055);
    a = ii(a,b,c,d,x[12],6,1700485571); d = ii(d,a,b,c,x[3],10,-1894986606); c = ii(c,d,a,b,x[10],15,-1051523); b = ii(b,c,d,a,x[1],21,-2054922799);
    a = ii(a,b,c,d,x[8],6,1873313359); d = ii(d,a,b,c,x[15],10,-30611744); c = ii(c,d,a,b,x[6],15,-1560198380); b = ii(b,c,d,a,x[13],21,1309151649);
    a = ii(a,b,c,d,x[4],6,-145523070); d = ii(d,a,b,c,x[11],10,-1120210379); c = ii(c,d,a,b,x[2],15,718787259); b = ii(b,c,d,a,x[9],21,-343485551);
    a = add(a, olda); b = add(b, oldb); c = add(c, oldc); d = add(d, oldd);
  }
  function hex(n) { var out = '', k; for (k = 0; k < 4; k += 1) { out += ('0' + ((n >> (k * 8)) & 255).toString(16)).slice(-2); } return out; }
  return hex(a) + hex(b) + hex(c) + hex(d);
}
/**
 * Điền phần cần mật khẩu vào request đăng nhập GAS dựng sẵn (`meta.fill`): đọc khóa theo mã tham chiếu, giải mã bản mã GAS gửi kèm, tính tên đăng nhập, hash Login và khóa trang rồi điền đúng ô `slots` chỉ định. Mật khẩu và hash chỉ có ở đây và trong request gửi FBM; không về GAS, không vào vết.
 * Lệnh `pageKeyStore`: chỉ cho tab ghi khóa trang khi khóa khớp giá trị kiểm trang tài khoản (`md5(khóa + cookie trang) = check`); không khớp thì gửi khóa rỗng để tab trả mã lệch, vì ghi khóa sai làm bảng FBM trắng.
 */
function credentialFill(request) {
  var meta = request && request.meta || {}, fill = meta.fill;
  if (!fill) { return Promise.resolve(request); }
  return storageGet(CREDENTIAL_VAULT_PREFIX + String(fill.credentialRef || '')).then(function (saved) {
    var cipher = fill.ciphertext || {};
    if (!saved || !saved.key || !cipher.ciphertext) { throw codedError('LOGIN_KEY_MISSING', 'Extension trên máy này không giữ khóa giải mã mật khẩu FBM của kết nối đang lưu; hãy lưu lại kết nối trên máy này.'); }
    return crypto.subtle.importKey('jwk', saved.key, { name: 'AES-GCM' }, false, ['decrypt']).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(cipher.iv) }, key, base64ToBytes(cipher.ciphertext));
    }).then(function (plain) { return JSON.parse(new TextDecoder().decode(plain)); }, function () { throw codedError('LOGIN_KEY_MISSING', 'Khóa trên Extension máy này không giải mã được bản mã mật khẩu FBM; hãy lưu lại kết nối trên máy này.'); });
  }).then(function (credentials) {
    var salt = String(fill.salt || ''), passwordHash = md5(String(credentials && credentials.password || '')), pageKey = md5(md5(salt) + passwordHash);
    var values = { username: String(credentials && credentials.username || ''), loginHash: md5(salt + passwordHash) }, nextMeta = Object.assign({}, meta);
    delete nextMeta.fill; delete nextMeta.pageKey;
    if (meta.command === 'pageKeyStore') {
      var check = meta.pageKey || {};
      nextMeta.pageKeyWrite = md5(pageKey + String(check.pageCookie || '')) === String(check.check || '').toLowerCase() ? pageKey : '';
      return Object.assign({}, request, { meta: nextMeta });
    }
    var body = Object.assign({}, request.body || {});
    Object.keys(fill.slots || {}).forEach(function (slot) {
      var name = String(fill.slots[slot]);
      if (!Object.prototype.hasOwnProperty.call(values, name)) { throw codedError('LOGIN_FILL_SLOT_UNKNOWN', 'GAS yêu cầu điền ô đăng nhập lạ; Extension không gửi request.'); }
      body[slot] = values[name];
    });
    return Object.assign({}, request, { body: body, bodyText: JSON.stringify(body), meta: nextMeta });
  });
}
/**
 * Kho đời cũ giữ cả bản mã cạnh khóa. GAS báo các mã tham chiếu nó đang giữ bản mã (`credentialRefs` trong trả lời nhịp hỏi) thì viết lại mục kho đó chỉ còn khóa; mục GAS không giữ bản mã thì để nguyên (còn là nguồn duy nhất cho lần lưu lại). Chạy lại không đổi gì.
 */
function credentialVaultSlim(refs) {
  if (!Array.isArray(refs) || !refs.length) { return Promise.resolve(); }
  var keys = refs.map(function (ref) { return CREDENTIAL_VAULT_PREFIX + String(ref || ''); });
  return new Promise(function (resolve) { chrome.storage.local.get(keys, function (all) { resolve(all || {}); }); }).then(function (all) {
    var rewrite = {};
    keys.forEach(function (key) { var saved = all[key]; if (saved && saved.key && saved.envelope) { rewrite[key] = { ref: String(saved.ref || ''), key: saved.key }; } });
    return Object.keys(rewrite).length ? storageSet(rewrite) : null;
  });
}
