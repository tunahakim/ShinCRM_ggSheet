/**
 * Lệnh giao và gỡ máy chạy nền qua cửa lệnh `controlDispatch` như Sidebar gọi thật: kiểm kết quả lệnh trả và máy đang được lưu sau đó, kèm Log; không chỉ kiểm hàm có được gọi.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { datCongTac } = require('../../lib/fbm/cai-dat-thu');

const HOP = { LOG_WARN: 'warn' };

/** Hộp GAS mới, công tắc tổng bật, gom mọi dòng Log. */
function taoBo() {
  const { hop } = workflowGas(HOP), logs = [];
  hop.logEvent = (line) => { logs.push(line); };
  datCongTac(hop, true);
  return { F: hop.FbmSync, logs };
}
const dong = (logs, action) => logs.filter((line) => line.action === action);

function testGiao(so) {
  const { F, logs } = taoBo();
  const rong = F.backgroundMachineRead();
  const kq = F.controlDispatch('assign_background_machine', { machineId: 'may-A', name: '  Máy   bàn  ' });
  const may = F.backgroundMachineRead(), log = dong(logs, 'background_machine_assign');
  check(so, 'giao máy: lệnh trả ok kèm status, kho lưu đúng mã máy và tên đã chuẩn hóa, lần hỏi cuối còn 0, status thấy máy đã giao, ghi một dòng Log giao máy',
    [rong.machineId, kq.ok, !!kq.status, may.machineId, may.name, may.assignedAt > 0, may.lastAskAt, F.statusView().backgroundMachine.assigned, log.length, log[0] && log[0].detail.machineId],
    ['', true, true, 'may-A', 'Máy bàn', true, 0, true, 1, 'may-A']);

  const thay = F.controlDispatch('assign_background_machine', { machineId: 'may-B', name: '' });
  const sau = F.backgroundMachineRead(), log2 = dong(logs, 'background_machine_assign');
  check(so, 'giao máy khác: thay máy cũ, tên trống lấy đuôi mã máy, Log ghi máy bị thay',
    [thay.ok, sau.machineId, sau.name, log2.length, log2[1].detail.fromMachineId, log2[1].reason.indexOf('thay máy "Máy bàn"') >= 0],
    [true, 'may-B', 'Máy may-B', 2, 'may-A', true]);

  const thieu = taoBo();
  let ma = '';
  try { thieu.F.controlDispatch('assign_background_machine', { name: 'Máy lạ' }); } catch (error) { ma = error.code; }
  check(so, 'giao máy thiếu mã máy: ném MACHINE_ID_REQUIRED, kho vẫn chưa giao máy nào',
    [ma, thieu.F.backgroundMachineRead().machineId], ['MACHINE_ID_REQUIRED', '']);
}

function testGo(so) {
  const { F, logs } = taoBo();
  F.controlDispatch('assign_background_machine', { machineId: 'may-A', name: 'Máy bàn' });
  const kq = F.controlDispatch('release_background_machine', {});
  const may = F.backgroundMachineRead(), log = dong(logs, 'background_machine_release');
  check(so, 'gỡ máy: lệnh trả ok kèm status, kho trống, status báo chưa giao, Log ghi tên máy vừa gỡ',
    [kq.ok, !!kq.status, may.machineId, may.name, F.statusView().backgroundMachine.assigned, log.length, log[0].detail.machineId, log[0].reason.indexOf('"Máy bàn"') >= 0],
    [true, true, '', '', false, 1, 'may-A', true]);

  const lai = F.controlDispatch('release_background_machine', {});
  const log2 = dong(logs, 'background_machine_release');
  check(so, 'gỡ khi chưa giao máy nào: vẫn ok, kho vẫn trống, Log nói rõ chưa giao máy',
    [lai.ok, F.backgroundMachineRead().machineId, log2.length, log2[1].reason.indexOf('chưa giao máy nào') >= 0],
    [true, '', 2, true]);
}

async function chay(so) {
  section('FBM sync — lệnh giao và gỡ máy chạy nền');
  testGiao(so);
  testGo(so);
}

module.exports = { chay };
