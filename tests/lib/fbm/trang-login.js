/** Câu trả lời mặc định của FBM giả cho từng bước trang Login (salt, database, đơn vị, Login nhận, trang tài khoản không có giá trị kiểm khóa trang, lệnh ghi khóa và mở trang chủ) và cách nộp lần lượt các bước đó. */
const TRA_BUOC = {
  page: '<script>var o = {"ChallengeScript":"eval(\u0027ab12\u0027+\u0027cd34\u0027)"};</script>',
  entity: '{"d":[{"Ma_DL":"FHN_CRM_App"}]}', unit: '{"d":[{"Ma_Dvcs":"CTY"}]}', login: '{"d":true}', account: '<html></html>',
  pageKey: '{"code":"LOGIN_PAGE_KEY_STORED"}', home: '{"code":"FBM_PAGE_OPENED"}'
};

/** Nộp lần lượt các bước trang Login bằng `nop(response)` bắt đầu từ request `first`; `doi` thay câu trả lời theo bước, `them` thêm trường vào `transport`. Trả kết quả lần nộp cuối: request kế không còn là bước trang Login. */
function quaTrangLogin(nop, first, contract, doi, them) {
  let res = { ok: true, request: first };
  while (res.request && res.request.meta.kind === 'login_step') {
    const step = res.request.meta.step;
    res = nop({ ok: true, status: 200, body: (doi && doi[step]) || TRA_BUOC[step], transport: Object.assign({ contract, trace: [{ stage: 'executor_response_sent', requestId: res.request.id }] }, them || {}) });
  }
  return res;
}

module.exports = { TRA_BUOC, quaTrangLogin };
