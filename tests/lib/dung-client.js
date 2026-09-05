/**
 * Dựng hộp cát phía **client**, song sinh với `dung-hop.js` của phía máy chủ.
 *
 * Vì sao tách hẳn hai hộp: code client và code máy chủ có những cái tên trùng nhau — `normalizeText` là ví dụ, nó có hai bản sinh đôi cố ý. Nạp chung một hộp thì bản nạp sau ghi đè bản nạp trước, và mọi phép kiểm sau đó thực chất chỉ kiểm một bản. Hai hộp riêng thì cái nào là cái nào không còn phải đoán.
 *
 * Hộp này **không** có `google` và **không** có `document`: các tệp nạp ở đây là tầng dữ liệu, chúng không được phép chạm vào lời gọi máy chủ hay DOM. Tệp nào chạm thì sẽ nổ "is not defined" ngay lúc nạp, và đó là điều mong muốn.
 */

const { napClient, taoHopCat } = require('./load-gas');

/**
 * Tầng dữ liệu phía sidebar, xếp theo chiều phụ thuộc để người đọc thấy tầng: chuẩn hóa chữ → cửa đọc bảng khai → bộ tự kiểm → kho → đường bung gói.
 *
 * Ba nhóm tệp client cố ý **không** có ở đây: `client/util/serverCall.html` cần `google.script.run`, còn `client/ui/*` và `client/screen/*` cần DOM, và `client/ram/bootstrap.html` cần cả hai. Phép nghiệm thu của chúng là mở sidebar thật trên Google.
 */
const TEP_CLIENT = [
  'client/util/textNormalize.html',
  'client/schema/schemaAccess.html',
  'client/schema/schemaCheck.html',
  'client/ram/store.html',
  'client/ram/ingest.html'
];

/** Dựng hộp cát client. Truyền `tep` để nạp một danh sách khác, dùng khi chỉ cần kiểm đúng một tệp. */
function dungClient(chon) {
  const y = chon || {};
  return napClient(taoHopCat(y.stubs), ...(y.tep || TEP_CLIENT));
}

module.exports = { dungClient, TEP_CLIENT };
