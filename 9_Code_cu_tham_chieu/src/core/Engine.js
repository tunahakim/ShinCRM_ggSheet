/**
 * PROJECT: ShinCRM_Master_Workspace
 * FILE: Engine.gs
 * TITLE: Cỗ máy lọc
 * ROLE: Logic-Layer
 * -------------------------------------------------------------------------
 * CHI TIẾT ĐẶC TẢ:
 * Thuật toán lọc (>, <, -, ", <>) & Sắp xếp đa cấp.
 * -------------------------------------------------------------------------
 * NGÀY KHỞI TẠO: 06/03/2026
 */

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

