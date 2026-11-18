/** Dựng form sửa Activity gửi FBM: mở form đúng type và token, id FBM thay id nội bộ, ngày phát sinh đổi sang Date .NET 0 giờ UTC theo ngày VN (không lùi 7 tiếng như mốc form FBM trả), fileticket, comment và các ô nullable theo fixture. */
const { section, check } = require('../../lib/assert');
const { dungHopDay } = require('../../lib/fbm/hop-day');

async function chay(so) {
  section('FBM sync — push: form sửa Activity');
  const { push } = dungHopDay();
  push.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '1.test', accountName: 'Lê Tuấn Anh' });
  const settings = () => push.FbmSync.scriptSettings(push.FbmSync.stateRead());
  const memvar = (request, name) => request.body.memvars.filter((item) => item.Name === name)[0];
  const activityEditOpen = push.FbmSync.activityEditOpenRequest('174813', settings());
  check(so, 'Activity edit mo form dung type 0 va token activity',
    [activityEditOpen.body.type, activityEditOpen.body.viewPage, activityEditOpen.body.authorized, activityEditOpen.meta.kind],
    [0, true, '1.test', 'activity_edit_open']);
  const activityEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008600', fbmId: '174813', content: 'Noi dung moi', taskType: 'Gọi', workDate: '2026-09-09' }, { id: 174813, ma_cv: 'GD', details: 'Noi dung cu', start_date: new Date('2026-09-09T00:00:00Z'), end_date: new Date('2026-09-09T00:00:00Z'), fileticket: 'ticket' }, {}, settings());
  check(so, 'Activity edit gui id FBM thay vi id noi bo', memvar(activityEdit, 'id').NewValue, 174813);
  check(so, 'Activity edit khong tra Date trong ket qua GAS',
    JSON.stringify(activityEdit).indexOf('2026-09-09T00:00:00.000Z') < 0 && String(memvar(activityEdit, 'start_date').OldValue || '').indexOf('/Date(') === 0 && String(memvar(activityEdit, 'start_date').NewValue || '').indexOf('/Date(') === 0 && String(memvar(activityEdit, 'end_date').NewValue || '').indexOf('/Date(') === 0,
    true);
  check(so, 'Activity edit doi ngay Sheet thanh Date .NET dung fixture',
    [memvar(activityEdit, 'start_date').NewValue, memvar(activityEdit, 'end_date').NewValue],
    ['/Date(1788912000000)/', '/Date(1788912000000)/']);
  const unchangedDateEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008600', fbmId: '174813', content: 'Noi dung moi', taskType: 'Gọi', workDate: '2026-09-09' }, { id: 174813, start_date: new Date('2026-09-09T00:00:00Z'), end_date: new Date('2026-09-09T16:59:59Z'), details: 'Noi dung cu', fileticket: 'ticket' }, {}, settings());
  check(so, 'Activity edit Sheet không đổi ngày thì gửi lại đúng ngày của form ở dạng 0 giờ UTC',
    [memvar(unchangedDateEdit, 'start_date').NewValue, memvar(unchangedDateEdit, 'end_date').NewValue],
    ['/Date(1788912000000)/', '/Date(1788912000000)/']);
  const formDateEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008601', fbmId: '174813', content: 'Noi dung moi', taskType: 'GD', workDate: '2026-09-09' }, { id: 174813, start_date: new Date('2026-09-08T17:00:00Z'), end_date: new Date('2026-09-09T16:59:00Z'), details: 'Noi dung cu', fileticket: 'ticket' }, {}, settings());
  check(so, 'Activity edit gửi ngày form dạng 0 giờ UTC theo ngày VN như giao diện FBM, không gửi lại mốc FBM trả (lùi 7 tiếng)', [
    memvar(formDateEdit, 'start_date').OldValue,
    memvar(formDateEdit, 'start_date').NewValue,
    memvar(formDateEdit, 'end_date').OldValue,
    memvar(formDateEdit, 'end_date').NewValue
  ], ['/Date(1788912000000)/', '/Date(1788912000000)/', '/Date(1788912000000)/', '/Date(1788912000000)/']);
  const changedWorkDateEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008601', fbmId: '174813', content: 'Noi dung moi', taskType: 'GD', workDate: '2026-10-11' }, { id: 174813, start_date: new Date('2026-09-08T17:00:00Z'), end_date: new Date('2026-09-09T16:59:00Z'), details: 'Noi dung cu', fileticket: 'ticket' }, {}, settings());
  check(so, 'Activity edit doi ngay phat sinh nhung giu ngay bat dau', [
    memvar(changedWorkDateEdit, 'start_date').OldValue,
    memvar(changedWorkDateEdit, 'start_date').NewValue,
    memvar(changedWorkDateEdit, 'end_date').OldValue,
    memvar(changedWorkDateEdit, 'end_date').NewValue
  ], ['/Date(1788912000000)/', '/Date(1788912000000)/', '/Date(1788912000000)/', '/Date(1791676800000)/']);
  // Ca gặp thật 2026-10-07: form trả 22/09 01:00 VN thành 21/09 18:00 UTC; gửi lại nguyên mốc thì FBM lưu thành 21/09.
  const shiftedEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008616', fbmId: '176920', content: 'Noi dung', taskType: 'GD', workDate: '2026-09-22' }, { id: 176920, start_date: '/Date(1790010000000)/', end_date: '/Date(1790013600000)/', details: 'Noi dung #SC-ACT-008616', fileticket: 'ticket' }, {}, settings());
  check(so, 'Activity edit không lùi ngày khi form FBM trả mốc giờ VN lùi 7 tiếng (ACT-008616)',
    ['start_date', 'end_date'].map((name) => memvar(shiftedEdit, name).NewValue),
    ['/Date(1790035200000)/', '/Date(1790035200000)/']);
  check(so, 'Activity edit gui fileticket theo OldValue/NewValue cua fixture',
    [memvar(activityEdit, 'fileticket').OldValue, memvar(activityEdit, 'fileticket').NewValue],
    ['', 'ticket']);
  check(so, 'Activity edit cap nhat datetime0 moi',
    memvar(activityEdit, 'datetime0').NewValue !== memvar(activityEdit, 'datetime0').OldValue,
    true);
  check(so, 'Activity edit de comment rong thanh null', memvar(activityEdit, 'comment').NewValue, null);
  check(so, 'Activity edit comment rong van co NewValue',
    Object.prototype.hasOwnProperty.call(memvar(activityEdit, 'comment'), 'NewValue'),
    true);
  check(so, 'Activity edit giu OldValue rong cho field form khong co Row',
    [memvar(activityEdit, 'ma_kh').OldValue, memvar(activityEdit, 'fileupload').OldValue, memvar(activityEdit, 'filekey').OldValue],
    ['', '', '']);
  check(so, 'Activity edit giu null cho field nullable cua fixture',
    [memvar(activityEdit, 'ngay_nhac').OldValue, memvar(activityEdit, 'ma_nhom').OldValue],
    [null, null]);
}

module.exports = { chay };
