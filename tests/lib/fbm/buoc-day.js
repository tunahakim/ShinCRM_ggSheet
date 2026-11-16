/**
 * Lối gọi chặng đẩy cho ca kiểm, đúng như khung lát gọi: chặng chạy trên bản sao ô lượt qua `stageCall`, patch gộp và ghi xuống kho, `end` chốt lượt bằng `pushEndApply`. Ca kiểm đi qua cửa của chặng chứ không gọi thẳng từng bước bên trong, nên đổi cách chia bước bên trong chặng không làm vỡ ca.
 * `F` là `FbmSync` của hộp thử, ô lượt đã nằm trong kho (cursor `push_wait` hoặc `push_lookup`).
 */

/** Một response về cho request đang chờ của chặng đẩy. Trả request kế (chưa bọc phong bì) hoặc `null` khi lượt đã chốt. */
function buocDay(F, reply) {
  const state = F.stateRead();
  const out = F.stageCall(state, (copy) => F.pushStage({ state: copy, reply, inputs: F.pushInputs(), settings: F.scriptSettings(copy), now: Date.now() }));
  if (out.end) { F.pushEndApply(state, out.end); return null; }
  return out.next || null;
}

/** Bước của ứng viên đang đẩy lỗi (`fromReply`: FBM trả lỗi; ngược lại bước xử lý response ném). Trả `{ ok, request }` như lời trả của lát: request kế đã bọc phong bì (`nextEnvelope` ghi mã request đang chờ), nên ca kiểm đưa thẳng response của nó vào `continue` được. */
function buocDayLoi(F, failure, fromReply) {
  const state = F.stateRead(), settings = F.scriptSettings(state), threshold = F.pushInputs().threshold;
  const out = F.stageCall(state, (copy) => {
    const logs = [];
    let step = F.pushErrorDecide(copy, failure, !!fromReply, settings);
    if (!step.next && !step.end) { step = F.pushNext(copy, settings, logs, threshold); }
    return Object.assign({ patch: F.pushPatch(copy, logs) }, step);
  });
  if (out.end) { return F.pushEndApply(state, out.end); }
  return { ok: true, request: out.next ? F.sliceIssue(out.next) : null };
}

/** Danh sách ứng viên một thực thể trên lần quét cả sheet, với ô lượt đang có trong kho: như chặng đẩy đọc một lần rồi truyền vào phép xét. */
function ungVienDay(F, entity) {
  const scan = F.localScan();
  return F.pushCandidates(entity, scan, F.pushReviewContext(F.stateRead(), scan));
}

module.exports = { buocDay, buocDayLoi, ungVienDay };
