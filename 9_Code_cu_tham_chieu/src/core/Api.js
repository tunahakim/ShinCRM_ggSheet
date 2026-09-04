/**
 * PROJECT: ShinCRM_Master_Workspace
 * FILE: Api.gs
 * TITLE: Lõi CRUD
 * ROLE: Data-Layer
 * -------------------------------------------------------------------------
 * CHI TIẾT ĐẶC TẢ:
 * CRUD chính: saveCustomer, saveTx (LockService 15s).
 * -------------------------------------------------------------------------
 * NGÀY KHỞI TẠO: 06/03/2026
 */


// === 3. NÂNG CẤP: LOAD DATA (CHIA TÁCH & NÉN) ===

/**
 * API 1: getInitialData
 * Thay thế hàm getAllData cũ.
 * Nhiệm vụ: Chỉ tải ListKH, Help, QL_System và Maps. KHÔNG tải toàn bộ Act.
 * [TỐI ƯU]: Trả về dạng { headers: [], data: [][] } (Mảng 2 chiều) thay vì Array of Objects.
 */
function getInitialData() {

  // Nếu quá tải, dừng ngay lập tức, không tải data nào cả.
  var safetyCheck = checkSystemOverload();
  if (safetyCheck.isOverload) {
    return { 
      error: "OVERLOAD", 
      details: safetyCheck 
    };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties(); // [MỚI]
  // Khởi tạo cấu trúc kết quả
  var result = {
    listKH: { headers: [], data: [] },
    help: { status: [], product: [], group: [], verify: [], fbm: [], source: [], users: [], pins: [], companies: [], defaults: {} },
    maps: {},
    versions: {}, // [MỚI] Thêm object này
    qlSystem: {}, // [MỚI] Chứa cấu hình QL_System
    qlConfig: {}, // [MỚI] Chứa vị trí cột Sort của các sheet
    sysVer: PropertiesService.getScriptProperties().getProperty("SYS_VERSION") || "0"
  };

  // --- A. LOAD LIST KHÁCH HÀNG (Sheet: ListKH) ---
  var shKH = ss.getSheetByName("ListKH");
  if (shKH && shKH.getLastRow() >= 4) {
    var rawData = shKH.getDataRange().getValues(); // Lấy values gốc để giữ Date Object
    var h = rawData[0];

    // Định nghĩa Mapping (Thêm các trường mới theo yêu cầu V14.2)
    var mapKH = [
      { key: "id", cols: ["@KH_MA_KH"] },
      { key: "name", cols: ["@KH_TEN_CTY"] },
      { key: "tax", cols: ["@KH_MST"] },
      { key: "contact", cols: ["@KH_NGUOI_LIEN_HE"] },
      { key: "phone", cols: ["@KH_PHONE"] },
      { key: "email", cols: ["@KH_EMAIL"] },
      { key: "addr", cols: ["@KH_DIA_CHI"] },
      { key: "web", cols: ["@KH_WEBSITE"] },
      { key: "parent", cols: ["@KH_CONG_TY_ME"] },
      { key: "group", cols: ["@KH_NHOM_KH"] },
      { key: "prod", cols: ["@KH_SAN_PHAM"] },
      { key: "bid", cols: ["@KH_NGAY_DONG_THAU"] }, // Date
      { key: "note", cols: ["@KH_GHI_CHU"] },
      { key: "verify", cols: ["@KH_XAC_THUC"] },
      { key: "source", cols: ["@KH_NGUON_KH"] }, // [MỚI]
      { key: "fbm", cols: ["@KH_FBM_STATUS"] },   // [MỚI]
      { key: "created", cols: ["@KH_NGAY_NHAP_LIEU"] } // Date
    ];

    // Tạo Header và Index
    var headers = mapKH.map(m => m.key);
    var indices = mapKH.map(m => findIdx(h, m.cols));
    var idxID = findIdx(h, ["@KH_MA_KH"]);

    if (idxID > -1) {
      result.listKH.headers = headers; // Gửi header về để Client tự map
      
      // Duyệt data (Bỏ qua 3 dòng đầu)
      for (var i = 3; i < rawData.length; i++) {
        if (!rawData[i][idxID]) continue; // Bỏ dòng trống Mã KH
        
        var rowOut = [];
        for (var k = 0; k < indices.length; k++) {
          var val = (indices[k] > -1) ? rawData[i][indices[k]] : "";
          // Xử lý ngày tháng: Chuyển thành String dd-mm-yyyy ngay tại Server
          if (val instanceof Date) val = formatDateForClient(val);
          rowOut.push(val);
        }
        result.listKH.data.push(rowOut);
      }
    }
  }

  // --- B. LOAD CONFIG & HELP (Sheet: Help) ---
  var shHelp = ss.getSheetByName("Help");
  if (shHelp && shHelp.getLastRow() >= 4) {
    var d = shHelp.getDataRange().getDisplayValues();
    var h = d[0];
    
    // Tìm index các cột
    var idxXT = findIdx(h, ["@DM_XAC_THUC"]);
    var idxCV = findIdx(h, ["@DM_CONG_VIEC"]);
    var idxSP = findIdx(h, ["@DM_SAN_PHAM"]);
    var idxNH = findIdx(h, ["@DM_NHOM_KH"]);
    var idxNG = findIdx(h, ["@DM_NGUON_KH"]);   // [MỚI]
    var idxFBM = findIdx(h, ["@DM_FBM_STATUS"]);// [MỚI]
    var idxUser = findIdx(h, ["@DM_NGUOI_NHAP_LIEU"]);
    var idxPin = findIdx(h, ["@DM_GHIM"]); // [MỚI] Tìm cột danh mục Ghim
    var idxKey = findIdx(h, ["@DM_NGAM_DINH_MA_COT"]);
    var idxVal = findIdx(h, ["@DM_NGAM_DINH_GIA_TRI"]);

    for (var i = 3; i < d.length; i++) {
      if (idxCV > -1 && d[i][idxCV]) result.help.status.push(d[i][idxCV]);
      if (idxSP > -1 && d[i][idxSP]) result.help.product.push(d[i][idxSP]);
      if (idxNH > -1 && d[i][idxNH]) result.help.group.push(d[i][idxNH]);
      if (idxXT > -1 && d[i][idxXT]) result.help.verify.push(d[i][idxXT]);
      if (idxNG > -1 && d[i][idxNG]) result.help.source.push(d[i][idxNG]);
      if (idxFBM > -1 && d[i][idxFBM]) result.help.fbm.push(d[i][idxFBM]);
      if (idxUser > -1 && d[i][idxUser]) result.help.users.push(d[i][idxUser]);
      if (idxPin > -1 && d[i][idxPin]) result.help.pins.push(d[i][idxPin]);
      
      // [GIỮ NGUYÊN] Logic load defaults
      if (idxKey > -1 && idxVal > -1 && d[i][idxKey]) {
        result.help.defaults[d[i][idxKey]] = d[i][idxVal];
      }
    }
    // [GIỮ NGUYÊN] Logic lấy danh sách công ty mẹ sẽ xử lý ở Client (từ ListKH)
  }

  // --- C. LOAD QL_SYSTEM (Cấu hình sắp xếp Global) ---
  var shSys = ss.getSheetByName("QL_System");
  if (shSys && shSys.getLastRow() >= 4) {
      // Logic load QL_System đơn giản, lấy các dòng cấu hình sắp xếp
      var d = shSys.getDataRange().getDisplayValues();
      var idxSort = findIdx(d[0], ["@SYS_SORT"]);
      var idxLevel = findIdx(d[0], ["@SYS_SORT_LEVEL"]);
      if (idxSort > -1) {
          result.qlSystem.sort = [];
          for(var i=3; i<d.length; i++) {
              if(d[i][idxSort]) result.qlSystem.sort.push({ col: d[i][idxSort], level: d[i][idxLevel] });
          }
      }
  }

  // --- D. LOAD MAPS (CHO CÁC SHEET QUẢN LÝ !) ---
  // [TỐI ƯU]: Chỉ lấy cột Mã KH và loại bỏ ô trống để giảm dung lượng
  var sheets = ss.getSheets();
  sheets.forEach(s => {
    var name = s.getName();
    if (name.startsWith("!") && s.getLastRow() >= 4) {
      // Dùng API getOnlyMap logic (nhúng thẳng vào đây cho init)
      var h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
      var colMa = findIdx(h, ["@KH_MA_KH", "@ACT_MA_KH", "MA_KH"]); // Support nhiều tên cột
      
      // [MỚI] Tìm vị trí cột Sort và Level (trả về index 0-based: A=0, B=1)
      var idxSort = findIdx(h, ["@QL_SORT"]);
      var idxLevel = findIdx(h, ["@QL_SORT_LEVEL"]);
      
      // Lưu vào config để gửi về client
      result.qlConfig[name] = { 
        sort: idxSort, 
        level: idxLevel 
      };

      if (colMa > -1) {
        // Lấy toàn bộ cột đó
        var colData = s.getRange(4, colMa + 1, s.getLastRow() - 3, 1).getValues();
        // Flatten và lọc rỗng ngay lập tức
        var mapArr = [];
        for(var k=0; k<colData.length; k++) {
             mapArr.push(colData[k][0] || ""); 
        }
        result.maps[name] = mapArr;
      }
      var ver = props.getProperty("VER_" + name) || "0";
      result.versions[name] = ver;
    }
  });

  return result;
}

/**
 * API 2: getActData (Chunking)
 * Load dữ liệu Sheet Act theo từng phần để tránh Timeout.
 * @param {Number} startRow - Dòng bắt đầu load (0-based tính từ dòng dữ liệu đầu tiên)
 * @param {Number} chunkSize - Số lượng dòng muốn lấy (VD: 10000)
 */
function getActData(startRow, chunkSize) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shAct = ss.getSheetByName("Act");
  if (!shAct || shAct.getLastRow() < 4) return { acts: { headers: [], data: [] }, hasMore: false };

  var rawData = shAct.getDataRange().getValues();
  var h = rawData[0];
  var totalRows = rawData.length - 3; // Trừ 3 dòng tiêu đề

  // Mapping cột Act (Thêm mới theo V14.2)
  var mapAct = [
    { key: "row", cols: ["ROW_INDEX"] }, // Cột ảo để lưu vị trí dòng thực
    { key: "stt", cols: ["@ACT_STT"] },
    { key: "id", cols: ["@ACT_MA_KH"] },
    { key: "date", cols: ["@ACT_NGAY_LAM_VIEC"] },
    { key: "prod", cols: ["@ACT_SAN_PHAM"] },
    { key: "job", cols: ["@ACT_CONG_VIEC"] },
    { key: "content", cols: ["@ACT_NOI_DUNG_CONG_VIEC"] },
    { key: "val", cols: ["@ACT_GIA_TRI_HOP_DONG"] },
    { key: "pin", cols: ["@ACT_GHIM"] },           // [MỚI]
    { key: "user", cols: ["@ACT_NGUOI_NHAP_LIEU"] },// [MỚI]
    { key: "fbm", cols: ["@ACT_FBM_STATUS"] },      // [MỚI]
    { key: "created", cols: ["@ACT_NGAY_NHAP_LIEU"] }
  ];
  
  var headers = mapAct.map(m => m.key);
  var indices = mapAct.map(m => (m.key === "row") ? -99 : findIdx(h, m.cols));

  var dataChunk = [];
  // Tính toán vùng lặp
  var start = 3 + startRow; // Bắt đầu từ dòng 4
  var end = Math.min(start + chunkSize, rawData.length);

  for (var i = start; i < end; i++) {
    // Chỉ lấy dòng có Mã KH
    var idxID = indices[2]; // Vị trí cột ID trong mảng indices
    if (!rawData[i][idxID]) continue;

    var rowOut = [];
    for (var k = 0; k < indices.length; k++) {
      if (headers[k] === "row") {
        rowOut.push(i + 1); // Lưu dòng thực tế (1-based) để update sau này
      } else {
        var val = (indices[k] > -1) ? rawData[i][indices[k]] : "";
        if (val instanceof Date) val = formatDateForClient(val);
        rowOut.push(val);
      }
    }
    dataChunk.push(rowOut);
  }

  return {
    acts: { headers: headers, data: dataChunk },
    hasMore: end < rawData.length, // Báo cho Client biết còn dữ liệu không
    nextRow: startRow + chunkSize
  };
}

/**
 * API 3: getOnlyMap (Smart Sync)
 * [MỚI] API siêu nhẹ để Client gọi khi cần update vị trí khách hàng sau khi lọc/sort.
 */
/**
 * API 3: getOnlyMap (Smart Sync & Wait)
 * [UPDATE]: Có cơ chế chờ nếu Server đang bận render (tránh lấy data cũ)
 */
function getOnlyMap(sheetName) {
  var props = PropertiesService.getScriptProperties();
  var lockKey = "LOCK_" + sheetName;
  
  // [BƯỚC 3] VÒNG LẶP KIỂM TRA KHÓA (Tối đa 10 lần x 500ms = 5 giây)
  for (var i = 0; i < 10; i++) {
    var isLocked = props.getProperty(lockKey);
    
    // Nếu không bị khóa (FALSE hoặc null) -> Thoát vòng lặp để lấy data
    if (isLocked !== "TRUE") {
      break; 
    }
    
    // Nếu đang khóa -> Ngủ 0.5s rồi check lại
    Utilities.sleep(500); 
  }

  // --- Sau khi chờ xong thì lấy dữ liệu như bình thường ---
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(sheetName);
  if (!s) return null;

  var h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  var colMa = findIdx(h, ["@KH_MA_KH", "@ACT_MA_KH", "MA_KH"]);
  
  if (colMa > -1) {
    var lastRow = s.getLastRow();
    if (lastRow < 4) return []; // Không có dữ liệu
    
    // Chỉ lấy đúng cột Mã KH
    var raw = s.getRange(4, colMa + 1, lastRow - 3, 1).getValues();
    var mapArr = [];
    for(var j=0; j<raw.length; j++) mapArr.push(raw[j][0] || "");
    return mapArr;
  }
  return [];
}

// === 4. NÂNG CẤP: HÀM LƯU DỮ LIỆU (OPTIMIZED) ===

/**
 * Lưu Giao Dịch (Act) - [ĐÃ SỬA ĐỂ TRẢ VỀ MAP MỚI]
 */
function saveTransaction(form) {
  var lock = LockService.getScriptLock();
  try {
    // Thời gian chờ tối đa là 30s theo quy giới hạn thời gian xử lý của AppScript 
    lock.waitLock(15000);
  } catch (e) {
    return { error: "Hệ thống bận. Vui lòng thử lại!" };
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName("Act");
    var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

    // Map cột (Giữ nguyên cấu trúc cũ của bạn)
    var idx = {
      STT: findIdx(h, ["@ACT_STT"]), MA: findIdx(h, ["@ACT_MA_KH"]),
      NGAY: findIdx(h, ["@ACT_NGAY_LAM_VIEC"]), SP: findIdx(h, ["@ACT_SAN_PHAM"]),
      TT: findIdx(h, ["@ACT_CONG_VIEC"]), ND: findIdx(h, ["@ACT_NOI_DUNG_CONG_VIEC"]),
      VAL: findIdx(h, ["@ACT_GIA_TRI_HOP_DONG"]), PIN: findIdx(h, ["@ACT_GHIM"]),            
      USER: findIdx(h, ["@ACT_NGUOI_NHAP_LIEU"]), FBM: findIdx(h, ["@ACT_FBM_STATUS"]),       
      CREATED: findIdx(h, ["@ACT_NGAY_NHAP_LIEU"])
    };

    var dateValToSave = form.date; 
    var result = {};

    // === TRƯỜNG HỢP 1: SỬA GIAO DỊCH (EDIT MODE) ===
    if (form.row && form.row !== "") {
      var r = parseInt(form.row);
      if (idx.NGAY > -1) { var cell = sh.getRange(r, idx.NGAY + 1); cell.setValue(dateValToSave); cell.setNumberFormat("dd-mm-yyyy"); }
      if (idx.SP > -1) sh.getRange(r, idx.SP + 1).setValue(form.prod);
      if (idx.TT > -1) sh.getRange(r, idx.TT + 1).setValue(form.status);
      if (idx.ND > -1) sh.getRange(r, idx.ND + 1).setValue(form.content);
      if (idx.VAL > -1) sh.getRange(r, idx.VAL + 1).setValue(form.val);
      if (idx.PIN > -1) sh.getRange(r, idx.PIN + 1).setValue(form.pin);
      if (idx.FBM > -1) sh.getRange(r, idx.FBM + 1).setValue(form.fbm);
      if (idx.USER > -1) sh.getRange(r, idx.USER + 1).setValue(form.user);
      result = { success: true, row: r }; 
    } 
    // === TRƯỜNG HỢP 2: THÊM MỚI (ADD NEW MODE) ===
    else {
      var nextSTT = 1; var lastRow = sh.getLastRow();
      if (idx.STT > -1 && lastRow >= 4) { var lastSTTVal = sh.getRange(lastRow, idx.STT + 1).getValue(); if (!isNaN(parseInt(lastSTTVal))) nextSTT = parseInt(lastSTTVal) + 1; }
      var row = new Array(h.length).fill("");
      if (idx.STT > -1) row[idx.STT] = nextSTT;row[idx.MA] = form.id; row[idx.NGAY] = ""; 
      if (idx.SP > -1) row[idx.SP] = form.prod; if (idx.TT > -1) row[idx.TT] = form.status;
      if (idx.ND > -1) row[idx.ND] = form.content; if (idx.VAL > -1) row[idx.VAL] = form.val;
      if (idx.PIN > -1) row[idx.PIN] = form.pin || ""; if (idx.FBM > -1) row[idx.FBM] = form.fbm;
      if (idx.USER > -1) row[idx.USER] = form.user; if (idx.CREATED > -1) row[idx.CREATED] = ""; 
      sh.appendRow(row);
      var newRowIdx = sh.getLastRow(); 
      if (idx.NGAY > -1) { var cell = sh.getRange(newRowIdx, idx.NGAY + 1); cell.setValue(dateValToSave); cell.setNumberFormat("dd-mm-yyyy"); }
      if (idx.CREATED > -1) { var cellCreated = sh.getRange(newRowIdx, idx.CREATED + 1); var todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd"); cellCreated.setValue(todayStr); cellCreated.setNumberFormat("dd-mm-yyyy"); }
      result = { success: true, row: newRowIdx, stt: nextSTT };
    }

    // ===============================================
    // [UPDATE QUAN TRỌNG: LẤY MAP MỚI NGAY LẬP TỨC]
    // ===============================================
    
    // 1. Đánh dấu dữ liệu đã thay đổi & Flush
    PropertiesService.getScriptProperties().setProperty("IS_DATA_DIRTY", "TRUE");
    SpreadsheetApp.flush(); 

    // 2. Kiểm tra xem người dùng có đang đứng ở sheet Quản lý (!) không
    var activeSheet = ss.getActiveSheet();
    if (activeSheet.getName().startsWith("!")) {
        // A. Vẽ lại sheet đó ngay lập tức (để nó sắp xếp lại các dòng)
        renderManagementSheet(activeSheet);
        
        // B. Lấy ngay danh sách Mã KH mới (New Map) để gửi về Sidebar
        // Hàm getOnlyMap này đã có sẵn trong file code.gs của bạn
        var newMap = getOnlyMap(activeSheet.getName());
        
        // C. Đóng gói vào kết quả trả về
        result.newMap = newMap; 
        result.sheetName = activeSheet.getName();
    }
    // ===============================================

    return result;

  } catch (e) {
    return { error: "Lỗi Server: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lưu Khách Hàng (ListKH) - Đã có Flush để sửa lỗi không load
 */
function saveCustomer(form) {
  var lock = LockService.getScriptLock();

  // Thời gian chờ tối đa là 30s theo quy giới hạn thời gian xử lý của AppScript
  try { lock.waitLock(15000); } catch (e) { return { error: "Hệ thống bận..." }; }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName("ListKH");
    var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

    // Map cột
    var idx = { 
      STT: findIdx(h, ["@KH_STT"]), MA: findIdx(h, ["@KH_MA_KH"]), 
      TEN: findIdx(h, ["@KH_TEN_CTY"]), MST: findIdx(h, ["@KH_MST"]), 
      LH: findIdx(h, ["@KH_NGUOI_LIEN_HE"]), SDT: findIdx(h, ["@KH_PHONE"]), 
      EMAIL: findIdx(h, ["@KH_EMAIL"]), ADDR: findIdx(h, ["@KH_DIA_CHI"]), 
      WEB: findIdx(h, ["@KH_WEBSITE"]), PARENT: findIdx(h, ["@KH_CONG_TY_ME"]), 
      GROUP: findIdx(h, ["@KH_NHOM_KH"]), PROD: findIdx(h, ["@KH_SAN_PHAM"]), 
      BID: findIdx(h, ["@KH_NGAY_DONG_THAU"]), NOTE: findIdx(h, ["@KH_GHI_CHU"]), 
      VERIFY: findIdx(h, ["@KH_XAC_THUC"]), 
      SOURCE: findIdx(h, ["@KH_NGUON_KH"]),       
      FBM: findIdx(h, ["@KH_FBM_STATUS"]),        
      CREATED: findIdx(h, ["@KH_NGAY_NHAP_LIEU"]) 
    };

    var rowIdx = -1;
    if (sh.getLastRow() >= 4 && idx.MA > -1) {
      var codes = sh.getRange(4, idx.MA + 1, sh.getLastRow() - 3, 1).getValues().flat();
      rowIdx = codes.findIndex(c => String(c).toLowerCase() == String(form.code).toLowerCase());
    }

    // === UPDATE KHÁCH CŨ ===
    if (rowIdx > -1) {
      var r = rowIdx + 4;
      if (idx.TEN > -1) sh.getRange(r, idx.TEN + 1).setValue(form.name);
      if (idx.MST > -1) sh.getRange(r, idx.MST + 1).setNumberFormat("@").setValue(form.tax);
      if (idx.LH > -1) sh.getRange(r, idx.LH + 1).setValue(form.contact);
      if (idx.SDT > -1) sh.getRange(r, idx.SDT + 1).setNumberFormat("@").setValue(form.phone);
      if (idx.EMAIL > -1) sh.getRange(r, idx.EMAIL + 1).setValue(form.email);
      if (idx.ADDR > -1) sh.getRange(r, idx.ADDR + 1).setValue(form.addr);
      if (idx.WEB > -1) sh.getRange(r, idx.WEB + 1).setValue(form.web);
      if (idx.PARENT > -1) sh.getRange(r, idx.PARENT + 1).setValue(form.parent);
      if (idx.GROUP > -1) sh.getRange(r, idx.GROUP + 1).setValue(form.group);
      if (idx.PROD > -1) sh.getRange(r, idx.PROD + 1).setValue(form.prod);
      if (idx.NOTE > -1) sh.getRange(r, idx.NOTE + 1).setValue(form.note);
      if (idx.VERIFY > -1) sh.getRange(r, idx.VERIFY + 1).setValue(form.verify);
      if (idx.SOURCE > -1) sh.getRange(r, idx.SOURCE + 1).setValue(form.source);
      if (idx.FBM > -1) sh.getRange(r, idx.FBM + 1).setValue(form.fbm);

      // Code mới sửa lỗi (Bỏ new Date đi)
      if (idx.BID > -1 && form.bid) {
        sh.getRange(r, idx.BID + 1).setValue(form.bid).setNumberFormat("dd-mm-yyyy");
      }
    } 
    // === THÊM KHÁCH MỚI ===
    else {
      var nextSTT = 1;
      var lastRow = sh.getLastRow();
      if (idx.STT > -1 && lastRow >= 4) {
         var lastVal = sh.getRange(lastRow, idx.STT+1).getValue();
         if(!isNaN(parseInt(lastVal))) nextSTT = parseInt(lastVal) + 1;
      }
      var rowData = new Array(h.length).fill("");
      if (idx.STT > -1) rowData[idx.STT] = nextSTT;
      rowData[idx.MA] = form.code;
      if (idx.TEN > -1) rowData[idx.TEN] = form.name;
      if (idx.MST > -1) rowData[idx.MST] = form.tax;
      if (idx.LH > -1) rowData[idx.LH] = form.contact;
      if (idx.SDT > -1) rowData[idx.SDT] = form.phone;
      if (idx.EMAIL > -1) rowData[idx.EMAIL] = form.email;
      if (idx.ADDR > -1) rowData[idx.ADDR] = form.addr;
      if (idx.WEB > -1) rowData[idx.WEB] = form.web;
      if (idx.PARENT > -1) rowData[idx.PARENT] = form.parent;
      if (idx.GROUP > -1) rowData[idx.GROUP] = form.group;
      if (idx.PROD > -1) rowData[idx.PROD] = form.prod;
      if (idx.NOTE > -1) rowData[idx.NOTE] = form.note;
      if (idx.VERIFY > -1) rowData[idx.VERIFY] = form.verify || "0. Đã XT";
      if (idx.SOURCE > -1) rowData[idx.SOURCE] = form.source;
      if (idx.FBM > -1) rowData[idx.FBM] = form.fbm;
      
      // Để trống ngày BID và CREATED
      if (idx.BID > -1 && form.bid) rowData[idx.BID] = ""; 
      if (idx.CREATED > -1) rowData[idx.CREATED] = "";

      sh.appendRow(rowData);
      
      // [QUAN TRỌNG] Lấy dòng mới thêm
      var newR = sh.getLastRow();

      // 1. Xử lý Ngày đóng thầu (Nếu có nhập)
      if (idx.BID > -1 && form.bid) {
         var cellBid = sh.getRange(newR, idx.BID + 1);
         cellBid.setValue(form.bid); // Ghi chuỗi yyyy-mm-dd
         cellBid.setNumberFormat("dd-mm-yyyy");
      }

      // 2. Xử lý Ngày nhập liệu (Tự động điền - Chuẩn giờ VN)
      if (idx.CREATED > -1) {
        var cellCreated = sh.getRange(newR, idx.CREATED + 1);
        var todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
        cellCreated.setValue(todayStr);
        cellCreated.setNumberFormat("dd-mm-yyyy");
      }
      
      if (idx.MST > -1) sh.getRange(newR, idx.MST + 1).setNumberFormat("@").setValue(form.tax);
      if (idx.SDT > -1) sh.getRange(newR, idx.SDT + 1).setNumberFormat("@").setValue(form.phone);
    }

    // === QUAN TRỌNG: FLUSH DỮ LIỆU & RENDER ===
    PropertiesService.getScriptProperties().setProperty("IS_DATA_DIRTY", "TRUE");
    
    SpreadsheetApp.flush(); // <--- CHÌA KHÓA Ở ĐÂY

    var activeSheet = ss.getActiveSheet();
    if (activeSheet.getName().startsWith("!")) {
        renderManagementSheet(activeSheet);
    }

    return { success: true };
  } catch (e) {
    return { error: "Lỗi Server: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}