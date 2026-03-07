/**
 * ==========================================
 * CRM BIG DATA V14.2 - SERVER SIDE (Code.gs)
 * ==========================================
 */



// === 2. GIỮ NGUYÊN: HÀM TÌM CỘT THÔNG MINH (CORE LOGIC) ===
/**
 * Hàm này bạn viết rất tốt, tôi giữ nguyên 100% logic để đảm bảo
 * tính năng nhận diện cột (Suffix, Contains) vẫn hoạt động như cũ.
 */
function findIdx(headerRow, possibleNames) {
  if (!headerRow) return -1;
  for (var i = 0; i < possibleNames.length; i++) {
    var key = possibleNames[i].toUpperCase();
    var idx = headerRow.indexOf(possibleNames[i]); // 1. Chính xác
    if (idx > -1) return idx;
    
    idx = headerRow.findIndex(function (cell) { // 2. Khớp đuôi
      var c = String(cell).toUpperCase();
      return c.endsWith("_" + key) || c === key;
    });
    if (idx > -1) return idx;

    idx = headerRow.findIndex(function (cell) { // 3. Chứa từ khóa
      return String(cell).toUpperCase().includes(key);
    });
    if (idx > -1) return idx;
  }
  return -1;
}

// [MỚI] Hàm hỗ trợ format ngày tháng chuẩn VN để gửi về Client
function formatDateVN(dateObj) {
  if (!dateObj || !(dateObj instanceof Date)) return "";
  return Utilities.formatDate(dateObj, "GMT+7", "dd-MM-yyyy");
}

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

// === 5. CƠ CHẾ SYNC: LƯU VERSION KHI CÓ EDIT ===
// === TRIGGER TỰ ĐỘNG: KHI SỬA DỮ LIỆU ===
// Hàm này tự động chạy mỗi khi bạn gõ/sửa bất kỳ ô nào trên bảng tính
function onEdit(e) {
  // 1. Lấy thông tin cơ bản về nơi vừa xảy ra sự kiện sửa
  var s = e.source.getActiveSheet(); // Lấy Sheet hiện tại đang đứng
  var name = s.getName();            // Lấy Tên Sheet (VD: "!Khách hàng", "ListKH")
  var r = e.range.getRow();          // Lấy số Hàng vừa sửa (VD: 3)
  var c = e.range.getColumn();       // Lấy số Cột vừa sửa (VD: 5)
  
  // Lấy dịch vụ Properties (Bộ nhớ đệm/Bảng tin chung của Server)
  var props = PropertiesService.getScriptProperties();

  // ========================================================================
  // TRƯỜNG HỢP A: SỬA TRỰC TIẾP TRÊN SHEET QUẢN LÝ (Có dấu !)
  // Mục đích: Đáp ứng yêu cầu "Tắt Sidebar vẫn dùng được tính năng Lọc/Sort"
  // ========================================================================
  if (name.startsWith("!")) {
      
      var needRender = false; // Biến cờ: Mặc định là KHÔNG cần vẽ lại bảng

      // Kiểm tra 1: Sửa Hàng 1 (Mã cột) hoặc Hàng 3 (Bộ lọc)
      // Đây là 2 hàng cấu hình cứng, sửa ở đây chắc chắn phải chạy lại dữ liệu
      if (r === 1 || r === 3) {
          needRender = true;
      } 
      // Kiểm tra 2: Sửa các hàng khác (VD: Hàng 4, 5...)
      // Lúc này Server không biết cột bạn đang sửa có phải là cột Sort không (vì cột Sort có thể nằm bất kỳ đâu)
      // -> Server phải "ngước lên" Hàng 1 của chính cột đó để xem Mã cột là gì.
      else {
          // Lấy giá trị ô header tại: Hàng 1, Cột hiện tại (c)
          var headerCode = s.getRange(1, c).getValue();
          
          // Nếu header là mã cột sắp xếp -> Có nghĩa là bạn đang nhập thứ tự ưu tiên
          if (headerCode === "@QL_SORT" || headerCode === "@QL_SORT_LEVEL") {
              needRender = true; // -> Bật cờ cho phép vẽ lại
          }
      }

      // Nếu cờ needRender đã được bật -> Gọi hàm vẽ bảng (Engine)
      if (needRender) {
          // Hàm này đã có LockService bên trong nên không lo xung đột với Sidebar
          renderManagementSheet(s); 
      }
      
      // Xong việc của Sheet Quản lý rồi thì THOÁT NGAY.
      // Không chạy xuống dưới để tiết kiệm tài nguyên.
      return; 
  }

  // ========================================================================
  // TRƯỜNG HỢP B: SỬA DỮ LIỆU GỐC (HYBRID LOGIC - DEBOUNCE 3S)
  // Mục đích: Tự động vẽ lại báo cáo sau 3 giây nếu người dùng ngừng nhập liệu
  // ========================================================================
  if (name === "ListKH" || name === "Act" || name === "Help") {
      
      // 1. Kiểm tra xem người dùng có sửa vào 3 dòng đầu (Tiêu đề) không?
      // Nếu sửa tiêu đề thì bỏ qua (trừ khi sửa cấu hình mã cột thì tính sau)
      if (r < 4) return;

      // 2. [QUAN TRỌNG] Kiểm tra xem cột vừa sửa có Mã Cột (@) không?
      // Nếu sửa cột ghi chú nháp (không có @) -> Dừng ngay, không làm gì cả.
      if (!checkColumnHasCode(s, e.range)) return;

      // 3. Bật cờ "Dữ liệu bẩn" (Để Sidebar biết nếu người dùng chuyển tab gấp)
      props.setProperty("IS_DATA_DIRTY", "TRUE");
      
      // 4. Ghi dấu thời gian sửa đổi hiện tại (Timestamp)
      var myTimeStamp = new Date().getTime().toString();
      props.setProperty("LAST_EDIT_TIME", myTimeStamp);

      // 5. [SERVER NGỦ] Chờ 3 giây (Debounce)
      // Trong lúc này Server ngủ, nhưng bạn vẫn gõ phím bình thường ở Client
      Utilities.sleep(3000); 

      // 6. Tỉnh dậy và kiểm tra lại dấu thời gian
      var latestTimeStamp = props.getProperty("LAST_EDIT_TIME");
      
      // Nếu thời gian trong database KHÁC với thời gian mình đã ghi
      // -> Nghĩa là có một lệnh sửa MỚI HƠN đã chen ngang trong lúc mình ngủ.
      // -> Mình tự hủy, để thằng mới hơn kia lo việc render.
      if (latestTimeStamp !== myTimeStamp) {
          return; 
      }

      // 7. Nếu không ai chen ngang -> TIẾN HÀNH VẼ LẠI
      console.log("⏰ Hết 3s chờ -> Server tự động vẽ lại bảng...");
      forceRenderAllManagementSheets();
      
      // (Lưu ý: Hàm forceRender... đã tự tắt cờ IS_DATA_DIRTY rồi)
      return;
  }
  
  // ========================================================================
  // TRƯỜNG HỢP C: SỬA CẤU HÌNH HỆ THỐNG (QL_System)
  // ========================================================================
  else if (name === "QL_System") {
      // Bật cờ báo hiệu "Cấu hình hệ thống thay đổi"
      props.setProperty("IS_SYSTEM_DIRTY", "TRUE");
      
      // Cũng cần lưu ngay lập tức
      SpreadsheetApp.flush(); 
  }
}

/**
 * Hàm update ghi chú nhanh (Giữ nguyên từ code cũ vì logic đơn giản)
 */
function updateNoteOnly(id, newNote) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("ListKH");
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var idxMA = findIdx(h, ["@KH_MA_KH"]);
  var idxNote = findIdx(h, ["@KH_GHI_CHU"]);
  
  var success = false;
  if (idxMA > -1 && idxNote > -1) {
    var codes = sh.getRange(4, idxMA + 1, sh.getLastRow() - 3, 1).getValues().flat();
    var rIdx = codes.findIndex(c => String(c) == String(id));
    if (rIdx > -1) {
      sh.getRange(rIdx + 4, idxNote + 1).setValue(newNote);
      success = true;
    }
  }

  if (!success) return { error: "Không tìm thấy KH" };

  // === [BỔ SUNG QUAN TRỌNG: KÍCH HOẠT RENDER] ===
  PropertiesService.getScriptProperties().setProperty("IS_DATA_DIRTY", "TRUE");
  var activeSheet = ss.getActiveSheet();
  if (activeSheet.getName().startsWith("!")) {
      renderManagementSheet(activeSheet);
  }
  // ===============================================

  return { success: true };
}

// ======================================================
// PHẦN BỔ SUNG: ENGINE XỬ LÝ SHEET QUẢN LÝ (SERVER SIDE)
// ======================================================


/**
 * HÀM RENDER SHEET QUẢN LÝ (CORE ENGINE) - CÓ LOCK & CACHE
 */
function renderManagementSheet(sheet) {
  // [LOCK] BẮT ĐẦU KHÓA AN TOÀN (tránh trường hợp nhiều người cùng sửa)
  var lock = LockService.getScriptLock();
  try {
      // Chờ tối đa 15 giây. Nếu quá đông thì hủy lệnh này.
      // Thời gian chờ tối đa là 30s theo quy giới hạn thời gian xử lý của AppScript 
      lock.waitLock(15000); 
  } catch (e) {
      console.log("Server bận, hủy lệnh render thừa.");
      return null;
  }

  try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheetName = sheet.getName();

      // === 🚨 CHỐT CHẶN AN TOÀN TUYỆT ĐỐI ===
      // Nếu tên sheet KHÔNG bắt đầu bằng dấu "!" -> Dừng ngay lập tức!
      // Điều này bảo vệ sheet Act, ListKH, Help không bao giờ bị code đụng vào.
      if (!sheetName.startsWith("!")) return null;

      // [CHECK TIME] KIỂM TRA LẦN VẼ CUỐI (Tránh vẽ lặp lại quá nhanh)
      var props = PropertiesService.getScriptProperties();
      var lastRun = parseFloat(props.getProperty("LAST_RENDER_" + sheetName) || "0");
      var now = new Date().getTime();
      
      // Nếu mới vẽ cách đây dưới 2 giây -> Bỏ qua,  không vẽ lại nữa
      if (now - lastRun < 2000) {
          return props.getProperty("VER_" + sheetName);
      }

      // === [CACHE LOGIC] XÁC ĐỊNH & GHI NHỚ TRẠNG THÁI LOCAL SORT ===
      var hasLocalSort = "FALSE"; 
      
      // Kiểm tra xem sheet này có nhập cột Sort riêng không?
      var sysRange = sheet.getRange(1, 1, 1, 20).getValues()[0];
      var idxSortCol = findIdx(sysRange, ["@QL_SORT"]);
      
      if (idxSortCol > -1) {
          var lastR = sheet.getLastRow();
          if(lastR >= 4) {
             var sortData = sheet.getRange(4, idxSortCol + 1, lastR - 3, 1).getValues();
             // Nếu có bất kỳ ô nào có dữ liệu -> Có Sort Riêng
             if (sortData.some(r => r[0] && String(r[0]).trim() !== "")) {
                 hasLocalSort = "TRUE";
             }
          }
      }
      // Ghi vào Cache để checkSyncStatus dùng sau này
      props.setProperty("HAS_LOCAL_SORT_" + sheetName, hasLocalSort);
      // =============================================================

      // === BẮT ĐẦU LOGIC RENDER CŨ (GIỮ NGUYÊN) ===
      // 1. Đọc cấu hình Sheet
      var lastCol = sheet.getLastColumn();
      if (lastCol < 1) return null;

      var headerData = sheet.getRange(1, 1, 3, lastCol).getValues(); 
      var colCodes = headerData[0]; 
      var filters = headerData[2]; 
      var sortRules = getSortRules(sheet, ss);

      // 2. Lấy dữ liệu nguồn
      var rawKH = getSourceData(ss, "ListKH");
      if (!rawKH.data || rawKH.data.length === 0) return null;

      // 3. Lấy dữ liệu Act
      var needAct = colCodes.some(c => String(c).toUpperCase().includes("@ACT"));
      var latestActs = {}; 
      if (needAct) latestActs = getLatestActs(ss);

      // 4. JOIN DATA & FILTER
      var outputRows = [];
      var idxMA = findIdx(rawKH.headers, ["@KH_MA_KH"]);
      if (idxMA === -1) return null;

      for (var i = 0; i < rawKH.data.length; i++) {
        var rowKH = rawKH.data[i];
        var khID = rowKH[idxMA];
        if (!khID) continue;
        var masterObj = createMasterObject(rowKH, rawKH.headers);
        if (needAct) {
          var actObj = latestActs[khID] || {}; 
          for (var key in actObj) masterObj[key] = actObj[key];
        }
        var isPass = true;
        for (var c = 0; c < colCodes.length; c++) {
          var code = String(colCodes[c]).trim().toUpperCase();
          var filterVal = String(filters[c]).trim();
          if (code && (code.startsWith("@KH_") || code.startsWith("@ACT_")) && filterVal) {
            var cellVal = masterObj[code];
            if (!checkCondition(cellVal, filterVal)) {
              isPass = false;
              break;
            }
          }
        }
        if (isPass) outputRows.push(masterObj);
      }

      // 5. SORT
      if (sortRules.length > 0) {
        outputRows.sort(function(a, b) {
          for (var k = 0; k < sortRules.length; k++) {
            var rule = sortRules[k];
            var colCode = rule.col;
            var valA = a[colCode];
            var valB = b[colCode];

            // [MỚI] Xử lý dữ liệu Rỗng: Luôn đẩy xuống dưới đáy (return 1)
            var emptyA = (valA === "" || valA === null || valA === undefined);
            var emptyB = (valB === "" || valB === null || valB === undefined);

            if (emptyA && !emptyB) return 1;   // A rỗng -> A nằm dưới
            if (!emptyA && emptyB) return -1;  // B rỗng -> B nằm dưới
            if (emptyA && emptyB) continue;    // Cả 2 rỗng -> Xét tiêu chí tiếp theo

            // [MỚI] Nếu có dữ liệu thì mới so sánh giá trị
            var cmp = compareValues(valA, valB);

          // Chỉ đảo chiều (Z->A) khi so sánh giá trị thực
          // Dữ liệu rỗng đã được return 1 ở trên nên không bị ảnh hưởng bởi dòng này
            if (cmp !== 0) return (rule.order === "Z -> A") ? -cmp : cmp;
          }
          return 0;
        });
      }

      // 6. GHI DỮ LIỆU
      for (var col = 0; col < colCodes.length; col++) {
        var rawCode = String(colCodes[col]).trim().toUpperCase();
        if (rawCode.startsWith("@KH_") || rawCode.startsWith("@ACT_")) {
          var lastRow = sheet.getLastRow();
          if (lastRow >= 4) {
            sheet.getRange(4, col + 1, lastRow - 3, 1).clearContent();
          }
          if (outputRows.length > 0) {
            var columnData = outputRows.map(rowObj => {
              var val = rowObj[rawCode];
              return [ (val !== undefined) ? val : "" ];
            });
            sheet.getRange(4, col + 1, columnData.length, 1).setValues(columnData);
          }
        }
      }
      // === KẾT THÚC LOGIC RENDER CŨ ===

      // Cập nhật Version & THỜI GIAN
      var newVer = new Date().getTime().toString();
      props.setProperty("VER_" + sheetName, newVer);
      props.setProperty("LAST_RENDER_" + sheetName, newVer); // Lưu thời gian vừa vẽ xong
      
      // [BẮT BUỘC] Flush để lưu dữ liệu hiển thị lên Sheet ngay lập tức
      SpreadsheetApp.flush();
      return newVer;

  } catch (err) {
      console.error("Render Error: " + err.toString());
      return null;
  } finally {
      // [LOCK] MỞ KHÓA
      lock.releaseLock();
  }
}

// --- CÁC HÀM HỖ TRỢ (HELPER FUNCTIONS) ---

// Helper 1: Đọc dữ liệu nguồn thành dạng { headers: [], data: [] }
function getSourceData(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 4) return { headers: [], data: [] };
  var raw = sh.getDataRange().getValues();
  var headers = raw[0].map(h => String(h).trim().toUpperCase());
  // Dữ liệu từ dòng 4 (index 3)
  var data = raw.slice(3);
  return { headers: headers, data: data };
}

// Helper 2: Tạo Master Object từ 1 dòng ListKH
function createMasterObject(rowArr, headers) {
  var obj = {};
  headers.forEach((h, i) => {
    obj[h] = rowArr[i];
  });
  return obj;
}

// Helper 3: Lấy danh sách giao dịch mới nhất (Latest Acts) - Đã Fix
function getLatestActs(ss) {
  var rawAct = getSourceData(ss, "Act");
  var acts = {}; 
  
  var idxID = rawAct.headers.indexOf("@ACT_MA_KH");
  var idxDate = rawAct.headers.indexOf("@ACT_NGAY_LAM_VIEC");
  var idxSTT = rawAct.headers.indexOf("@ACT_STT");
  
  if (idxID === -1) return {};

  rawAct.data.forEach(row => {
    var id = row[idxID];
    if (!id) return;
    
    var actItem = createMasterObject(row, rawAct.headers);
    
    if (!acts[id]) {
      acts[id] = actItem;
    } else {
      var curr = acts[id];
      // Dùng hàm getRawDateValue để so sánh ngày chính xác
      var newDateVal = getRawDateValue(row[idxDate]);
      var currDateVal = getRawDateValue(curr["@ACT_NGAY_LAM_VIEC"]);
      
      if (newDateVal > currDateVal) {
        acts[id] = actItem;
      } else if (newDateVal === currDateVal) {
        var newSTT = parseInt(row[idxSTT]) || 0;
        var currSTT = parseInt(curr["@ACT_STT"]) || 0;
        if (newSTT > currSTT) acts[id] = actItem;
      }
    }
  });
  return acts;
}

// Helper 4: Logic kiểm tra điều kiện lọc (Mạnh mẽ)
function checkCondition(val, filter) {
  if (filter === "") return true; // Không lọc
  val = (val === undefined || val === null) ? "" : val;
  
  // Xử lý ngày tháng: Nếu val là Date, chuyển về chuỗi dd-mm-yyyy để so sánh text (hoặc so sánh time)
  // Để đơn giản hóa cho text filter:
  var valStr = String(val).toLowerCase();
  var filterStr = String(filter).toLowerCase();

  // 1. Lọc chính xác (" ")
  if (filterStr.startsWith('"') && filterStr.endsWith('"')) {
    return valStr === filterStr.slice(1, -1);
  }
  
  // 2. Lọc phủ định (<>)
  if (filterStr.startsWith("<>")) {
    var notVal = filterStr.substring(2).trim();
    return !valStr.includes(notVal);
  }
  
  // 3. Lọc khoảng ( - ) dùng cho Ngày hoặc Số
  if (filterStr.includes(" - ")) {
     var parts = filterStr.split(" - ");
     if (parts.length === 2) {
        // [UPDATE] Dùng hàm helper để chuyển mọi thứ về số YYYYMMDD
        var startNum = getRawDateValue(parts[0]); 
        var endNum = getRawDateValue(parts[1]);   
        var valNum = getRawDateValue(val);        

        // Nếu cả 3 đều là ngày hợp lệ -> So sánh số
        if (startNum > 0 && endNum > 0 && valNum > 0) {
           return (valNum >= startNum && valNum <= endNum);
        }
        // Fallback: Nếu không phải ngày (ví dụ số thường), xử lý so sánh số thường ở đây (nếu cần)
     }
  }

  // [UPDATE] Lọc toán tử so sánh (>, <, >=, <=) cho ngày tháng
  if (val instanceof Date || (typeof val === 'string' && val.match(/\d/))) {
      var matchOp = filterStr.match(/^([<>]=?)(.+)/);
      if (matchOp) {
          var op = matchOp[1];
          var criteria = getRawDateValue(matchOp[2]);
          var valNum = getRawDateValue(val);
          
          if (criteria > 0 && valNum > 0) {
              if (op === ">") return valNum > criteria;
              if (op === ">=") return valNum >= criteria;
              if (op === "<") return valNum < criteria;
              if (op === "<=") return valNum <= criteria;
          }
      }
  }
  
  // 4. Mặc định: Chứa (Contains)
  return valStr.includes(filterStr);
}

// Helper 5: Lấy quy tắc Sort (Sheet Priority > System Priority)
/**
 * Helper 5: Lấy quy tắc Sort (Sheet Priority > System Priority)
 * [FIX]: Chỉ nhận quy tắc khi có ĐỦ cả Mã cột VÀ Kiểu sắp xếp (Level)
 */
function getSortRules(sheet, ss) {
  var rules = [];
  
  // A. Lấy Sort của Sheet hiện tại
  var sysRange = sheet.getRange(1, 1, 1, 20).getValues()[0];
  var idxSortCol = findIdx(sysRange, ["@QL_SORT"]);
  var idxLevelCol = findIdx(sysRange, ["@QL_SORT_LEVEL"]);
  
  if (idxSortCol > -1) {
     var lastR = sheet.getLastRow();
     if(lastR >= 4) {
         // Lấy dữ liệu cột Sort Code
         var sortData = sheet.getRange(4, idxSortCol + 1, lastR - 3, 1).getValues();
         // Lấy dữ liệu cột Sort Level (Kiểm tra nếu cột Level tồn tại)
         var levelData = (idxLevelCol > -1) ? sheet.getRange(4, idxLevelCol + 1, lastR - 3, 1).getValues() : [];
         
         for(var i=0; i<sortData.length; i++) {
             var col = String(sortData[i][0] || "").trim();
             // Lấy level tương ứng, nếu không có cột level hoặc ô trống -> trả về rỗng
             var lvl = (levelData.length > i) ? String(levelData[i][0] || "").trim() : "";
             
             // [QUAN TRỌNG] Chỉ thêm rule nếu CÓ CẢ Mã Cột VÀ Level
             if(col && lvl) {
                 rules.push({ col: col.toUpperCase(), order: lvl });
             }
         }
     }
  }

  // B. Nếu Sheet không có Sort (hoặc rules rỗng), lấy từ QL_System
  if (rules.length === 0) {
     var shSys = ss.getSheetByName("QL_System");
     if (shSys && shSys.getLastRow() >= 4) {
         var d = shSys.getDataRange().getValues();
         var sysH = d[0];
         var sCol = findIdx(sysH, ["@SYS_SORT"]);
         var sLvl = findIdx(sysH, ["@SYS_SORT_LEVEL"]);
         
         if(sCol > -1 && sLvl > -1) {
             for(var i=3; i<d.length; i++) {
                 var colSys = String(d[i][sCol] || "").trim();
                 var lvlSys = String(d[i][sLvl] || "").trim();
                 
                 // [QUAN TRỌNG] Cũng áp dụng logic bắt buộc phải có cả 2 ở System
                 if(colSys && lvlSys) {
                     rules.push({ col: colSys.toUpperCase(), order: lvlSys });
                 }
             }
         }
     }
  }
  return rules;
}

// Helper 6: So sánh giá trị để Sort (Đã nâng cấp)
function compareValues(a, b) {
  if (a === b) return 0;
  // Đẩy giá trị rỗng xuống cuối
  if (a === "" || a === null || a === undefined) return 1; 
  if (b === "" || b === null || b === undefined) return -1;

  // [QUAN TRỌNG] Chuyển cả 2 về số để so sánh (Bất chấp là Date hay Text)
  var numA = getRawDateValue(a);
  var numB = getRawDateValue(b);

  // Nếu cả 2 đều là ngày tháng hợp lệ
  if (numA > 0 && numB > 0) {
      return numA - numB; // So sánh số: 20251211 > 20230729 -> Kết quả dương -> A lớn hơn B
  }

  // So sánh số thường (cho cột STT, Giá trị)
  if (!isNaN(parseFloat(a)) && !isNaN(parseFloat(b))) {
      return parseFloat(a) - parseFloat(b);
  }

  // Fallback: So sánh chuỗi
  return String(a).localeCompare(String(b));
}

// === API KIỂM TRA TRẠNG THÁI & RENDER THÔNG MINH ===

/**
 * API KIỂM TRA TRẠNG THÁI & RENDER THÔNG MINH (HYBRID)
 * Sidebar gọi hàm này khi chuyển sang tab Quản lý.
 */
function checkSyncStatus(sheetName) {
  var props = PropertiesService.getScriptProperties();
  
  // 1. Kiểm tra dữ liệu bẩn (IS_DATA_DIRTY)
  var isDataDirty = props.getProperty("IS_DATA_DIRTY") === "TRUE";
  
  // [LOGIC HYBRID MỚI]: Nếu bẩn -> ÉP VẼ NGAY LẬP TỨC
  // Lý do: Cờ vẫn True nghĩa là onEdit chưa kịp chạy xong (đang ngủ 3s).
  // Khách hàng đã chuyển tab rồi, không thể bắt họ chờ nốt 3s được.
  if (isDataDirty) {
      console.log("⚡ Sidebar yêu cầu vẽ gấp -> Ép Server chạy ngay!");
      forceRenderAllManagementSheets(); // Hàm này vẽ xong sẽ tắt cờ Dirty
      
      // Trả về 'UPDATED' để Sidebar biết là dữ liệu mới tinh rồi
      return { action: "RELOAD_DONE" }; 
  }

  // 2. Kiểm tra cấu hình hệ thống (Sử dụng Cache thông minh)
  var isSysDirty = props.getProperty("IS_SYSTEM_DIRTY") === "TRUE";
  if (isSysDirty) {
      // Đọc Cache xem sheet này có dùng Sort riêng không? (Mất 0.001s)
      var hasLocal = props.getProperty("HAS_LOCAL_SORT_" + sheetName);
      
      // Nếu nó có Sort riêng ("TRUE") -> KỆ NÓ, KHÔNG RELOAD (Thông minh)
      if (hasLocal === "TRUE") {
          return { action: "NONE" };
      }
      
      // Nếu nó dùng Sort chung -> RELOAD MAP
      return { action: "MAP_LOAD" };
  }
  
  return { action: "NONE" };
}

// Hàm kiểm tra xem Sheet có quy tắc Sort riêng không (@QL_SORT có dữ liệu không)
function checkLocalSort(sheet) {
  try {
    // Lấy hàng 1 để tìm cột @QL_SORT
    var h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var idx = h.indexOf("@QL_SORT"); // Tìm chính xác mã cột
    if (idx === -1) return false;
    
    // Kiểm tra dòng 4 (dòng dữ liệu đầu tiên) của cột đó có gì không
    if (sheet.getLastRow() < 4) return false;
    var val = sheet.getRange(4, idx + 1).getValue();
    return (val && String(val).trim() !== "");
  } catch (e) {
    return false;
  }
}

// Xóa cờ (Sidebar gọi sau khi Load xong)
function clearFlags(type) {
  var props = PropertiesService.getScriptProperties();
  if (type === "FULL") props.setProperty("IS_DATA_DIRTY", "FALSE");
  if (type === "SYS") props.setProperty("IS_SYSTEM_DIRTY", "FALSE"); // Reset cờ hệ thống
}

// Hàm cho nút Reload
function triggerFullReload() {
  // 1. Đánh dấu dữ liệu bẩn (để các sheet khác biết mà reload sau này)
  PropertiesService.getScriptProperties().setProperty("IS_DATA_DIRTY", "TRUE");

  // 2. [MỚI] Kiểm tra ngay sheet đang đứng
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getActiveSheet();
  
  // Nếu đang ở sheet Quản lý (!) -> Render lại ngay lập tức
  if (s.getName().startsWith("!")) {
      renderManagementSheet(s);
  }
}

// [MỚI] Hàm cưỡng chế Render và lấy Map ngay lập tức (Xử lý Race Condition)
function forceRefreshMap(sheetName) {
  var lock = LockService.getScriptLock();
  try {
    // Chờ tối đa 5s để tránh xung đột nếu onEdit đang chạy song song
    // Thời gian chờ tối đa là 30s theo quy giới hạn thời gian xử lý của AppScript 
    lock.waitLock(15000); 
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var s = ss.getSheetByName(sheetName);
    if (!s) return [];

    // 1. Chủ động chạy Render ngay lập tức (Synchronous)
    // Việc này đảm bảo khi hàm này chạy xong, dữ liệu trên Sheet đã là MỚI NHẤT
    renderManagementSheet(s);

    // 2. Sau khi Render xong, lấy Map mới luôn
    // Copy logic lấy map từ getOnlyMap để tránh việc gọi lại hàm kia phải chờ loop
    var h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
    var colMa = findIdx(h, ["@KH_MA_KH", "@ACT_MA_KH", "MA_KH"]);
    
    if (colMa > -1 && s.getLastRow() >= 4) {
      var raw = s.getRange(4, colMa + 1, s.getLastRow() - 3, 1).getValues();
      var mapArr = [];
      for(var j=0; j<raw.length; j++) mapArr.push(raw[j][0] || "");
      return mapArr;
    }
    return [];

  } catch (e) {
    return { error: "TIMEOUT" }; // [SỬA] Trả về mã lỗi này khi quá timeout
  } finally {
    lock.releaseLock();
  }
}

// --- CÁC HÀM XỬ LÝ NGÀY THÁNG CỐT LÕI (CORE DATE ENGINE) ---

/**
 * Chuyển đổi mọi loại dữ liệu ngày tháng sang số nguyên YYYYMMDD để so sánh/lọc/sort
 * Đầu vào: Date Object, hoặc chuỗi "dd-mm-yyyy", hoặc chuỗi "yyyy-mm-dd"
 * Đầu ra: Số 20250120 (nếu lỗi trả về 0)
 */
function getRawDateValue(val) {
  if (!val) return 0;
  
  // Trường hợp 1: Là Date Object (Do Google Sheet trả về)
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = val.getMonth() + 1; // 0-11
    var d = val.getDate();
    return y * 10000 + m * 100 + d;
  }
  
  // Trường hợp 2: Là chuỗi văn bản
  var s = String(val).trim();
  
  // Dạng dd-mm-yyyy (Việt Nam)
  if (s.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/)) {
    var p = s.split(/[-/]/);
    return parseInt(p[2]) * 10000 + parseInt(p[1]) * 100 + parseInt(p[0]);
  }
  
  // Dạng yyyy-mm-dd (ISO)
  if (s.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/)) {
    var p = s.split(/[-/]/);
    return parseInt(p[0]) * 10000 + parseInt(p[1]) * 100 + parseInt(p[2]);
  }
  
  return 0; // Không xác định
}

/**
 * Chuẩn hóa ngày tháng để gửi về Sidebar hiển thị (dạng dd-mm-yyyy)
 */
function formatDateForClient(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "GMT+7", "dd-MM-yyyy");
  }
  // Nếu là chuỗi yyyy-mm-dd thì xoay lại
  var s = String(val);
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) {
    var p = s.split("-");
    return p[2] + "-" + p[1] + "-" + p[0];
  }
  return s;
}

// [MỚI] Hàm biến đổi mọi thứ (Date hoặc Text) thành số YYYYMMDD
function getRawDateValue(val) {
  if (!val) return 0;
  // Nếu là Date Object (như log bạn vừa check)
  if (val instanceof Date) {
    return val.getFullYear() * 10000 + (val.getMonth() + 1) * 100 + val.getDate();
  }
  // Nếu là Chuỗi Text (các dòng cũ nhập tay)
  var s = String(val).trim();
  if (s.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/)) { // Dạng dd-mm-yyyy
    var p = s.split(/[-/]/);
    return parseInt(p[2]) * 10000 + parseInt(p[1]) * 100 + parseInt(p[0]);
  }
  if (s.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/)) { // Dạng yyyy-mm-dd
    var p = s.split(/[-/]/);
    return parseInt(p[0]) * 10000 + parseInt(p[1]) * 100 + parseInt(p[2]);
  }
  return 0; 
}

// === 6. TÍNH NĂNG AN TOÀN: KIỂM TRA QUÁ TẢI ===

function checkSystemOverload() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var totalCells = 0;
  var LIMIT = 500000; // Giới hạn an toàn (khớp với thông báo ở HTML) (mặc định là 500000 ô)

  // Quét nhanh qua tất cả các sheet
  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    // Chỉ tính vùng có dữ liệu thực tế (LastRow * LastColumn)
    // Cách này rất nhẹ, không tốn tài nguyên như getValues()
    var cells = s.getLastRow() * s.getLastColumn();
    totalCells += cells;
  }

  // Nếu vượt quá giới hạn -> Trả về cảnh báo
  if (totalCells > LIMIT) {
    return { isOverload: true, count: totalCells, limit: LIMIT };
  }

  // An toàn
  return { isOverload: false };
}

// ==========================================================
// [MỚI] BỔ SUNG LOGIC HYBRID (SERVER-SIDE RENDERING)
// ==========================================================

// 1. Hàm kiểm tra xem cột bị sửa có mã @ hay không (Fast Fail)
function checkColumnHasCode(sheet, range) {
  var colStart = range.getColumn(); // Lấy số thứ tự cột bắt đầu
  var colEnd = range.getLastColumn(); // Lấy số thứ tự cột kết thúc
  // Lấy dòng tiêu đề (Dòng 1) của các cột bị ảnh hưởng
  var headers = sheet.getRange(1, colStart, 1, (colEnd - colStart + 1)).getValues()[0];
  
  // Duyệt qua các tiêu đề, nếu thấy cái nào bắt đầu bằng @ thì trả về TRUE
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().startsWith("@")) {
      return true; // Có mã cột -> Quan trọng -> Cần xử lý
    }
  }
  return false; // Toàn bộ là cột rác -> Bỏ qua
}

// 2. Hàm cưỡng chế vẽ lại TẤT CẢ các sheet quản lý (!)
// Hàm này được gọi bởi onEdit (sau 3s) hoặc Sidebar (nếu cần gấp)
function forceRenderAllManagementSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var renderedCount = 0;

  // Duyệt qua tất cả các sheet
  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    // Chỉ vẽ lại các sheet bắt đầu bằng dấu chấm than (!)
    if (s.getName().startsWith("!")) {
      // Gọi hàm engine cũ của bạn để vẽ (đã có LockService bên trong hàm này rồi)
      renderManagementSheet(s);
      renderedCount++;
    }
  }
  
  // Vẽ xong thì tắt cờ bẩn đi
  PropertiesService.getScriptProperties().setProperty("IS_DATA_DIRTY", "FALSE");
  console.log("✅ Đã render xong " + renderedCount + " sheet quản lý.");
}

/**
 * Hàm hỗ trợ nhúng nội dung từ một file HTML/JS/CSS khác vào file hiện tại.
 * (Hàm hỗ trợ nạp các file HTML con vào Sidebar chính)
 * Thường dùng để chia nhỏ các thành phần giao diện (UI) trong Google Apps Script.
 * * @param {string} filename - Tên file cần lấy nội dung (không bao gồm đuôi file .html).
 * @return {string} Nội dung văn bản thuần túy của file đó.
 */
function include(filename) {
  // 1. HtmlService.createHtmlOutputFromFile(filename): 
  //    Tạo một đối tượng Output từ file có tên tương ứng trong dự án.
  // 2. .getContent(): 
  //    Lấy toàn bộ nội dung text bên trong file đó để trả về cho trình duyệt.
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
