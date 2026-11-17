/** Dựng ô lượt cho test qua đúng cổng đọc và ghi state của GAS (`stateRead`, `stateWrite`): GAS không có cửa vá state riêng, mọi thay đổi state đi qua người điều phối. */
function datState(F, patch) {
  return F.stateWrite(Object.assign(F.stateRead(), patch || {}));
}

module.exports = { datState };
