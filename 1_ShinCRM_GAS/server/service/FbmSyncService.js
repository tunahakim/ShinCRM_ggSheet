/** Entry point ổn định cho Sidebar; mọi call đi qua runEntryPoint. */
/** Bắt đầu một phiên đọc/ghi theo mode được chọn. */
function fbmStartSync(mode) { return runEntryPoint('fbmStartSync', 'sidebar', 'throw', function () { var result = fbmSyncStart(mode); if (result && result.status) { FbmSync.logStatus(result.status, 'start'); } return result; }); }
/** Gửi response thô của Extension cho cursor hiện tại. */
function fbmContinueSync(response) { return runEntryPoint('fbmContinueSync', 'sidebar', 'throw', function () { var result = fbmSyncContinue(response); if (result && result.status) { FbmSync.logStatus(result.status, 'slice'); } return result; }); }
/** Dừng phiên đồng bộ mà không đụng dữ liệu nghiệp vụ. */
function fbmCancelSync() { return runEntryPoint('fbmCancelSync', 'sidebar', 'throw', function () { var result = fbmSyncCancel(); if (result && result.status) { FbmSync.logStatus(result.status, 'cancel'); } return result; }); }
/** Đọc snapshot tiến độ hiện tại; Sidebar chỉ polling khi đang chạy. */
function fbmGetSyncStatus() { return runEntryPoint('fbmGetSyncStatus', 'sidebar', 'throw', function () { return fbmSyncStatus(); }); }
/** Ghi lỗi cầu nối do Sidebar phát hiện trước khi có response FBM. */
function fbmLogSyncError(message) { return runEntryPoint('fbmLogSyncError', 'sidebar', 'throw', function () { return FbmSync.logTransportError(message); }); }
/** Đọc cờ cho phép ghi; mặc định tắt để không chạm dữ liệu FBM ngoài ý muốn. */
function fbmGetWriteMode() { return runEntryPoint('fbmGetWriteMode', 'sidebar', 'throw', function () { return { enabled: FbmSync.writeAllowed() }; }); }
/** Đổi cờ ghi thật theo thao tác chủ động của người dùng trên Sidebar. */
function fbmSetWriteMode(enabled) { return runEntryPoint('fbmSetWriteMode', 'sidebar', 'throw', function () { return fbmSyncSetWriteMode(enabled === true); }); }
/** Khóa record khi người dùng bắt đầu sửa. */
function fbmBeginEdit(entity, id, revision) { return runEntryPoint('fbmBeginEdit', 'sidebar', 'throw', function () { return fbmSyncEditBegin(entity, id, revision); }); }
/** Mở khóa record khi người dùng kết thúc sửa. */
function fbmEndEdit(entity, id) { return runEntryPoint('fbmEndEdit', 'sidebar', 'throw', function () { return fbmSyncEditEnd(entity, id); }); }
/** Kiểm tra revision trước khi lưu form. */
function fbmCheckSave(entity, id, revision) { return runEntryPoint('fbmCheckSave', 'sidebar', 'throw', function () { return fbmSyncSaveAllowed(entity, id, revision); }); }
