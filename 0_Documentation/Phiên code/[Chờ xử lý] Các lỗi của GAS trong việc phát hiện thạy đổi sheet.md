Dưới đây là cuộc thảo luận giữa tôi và 1 AI khác, do AI đó không đọc toàn bộ repo nên có nhiều thiếu sót hoặc nhận định chưa đúng. Bạn hãy rà soát thật kỹ từng ý kiến với sự thật tài liệu/ code trong repo của nó xem cái nào đúng cái nào sai, không tin tuyệt đối,

# Các vấn đề phát hiện trong hệ thống hiện tại và hướng xử lý gợi ý

**Phạm vi và giới hạn của tài liệu này:** những điều dưới đây rút ra từ số liệu thực nghiệm, từ nhật ký thực thi, và từ một bản khảo sát code do một agent khác thực hiện. Tôi **chưa đọc trực tiếp source code**. Người đọc toàn bộ code hiểu hệ thống sâu hơn tôi và hoàn toàn có quyền bác bỏ bất kỳ gợi ý nào ở đây. Mỗi mục đều ghi rõ đâu là quan sát cứng và đâu là suy luận.

Các vấn đề xếp theo mức độ nguy hiểm, không theo thứ tự phát hiện.

---

## Vấn đề 1 — Thay đổi từ máy khác không làm tăng revision

**Mức độ: chặn tiến độ. Phải giải quyết trước khi viết bất kỳ dòng nào của Extension.**

**Quan sát cứng.** Gõ một ô từ phiên thứ hai, đợi 25 giây, `reloadRevision` đứng nguyên ở 156 và `reloadChangedAt` không đổi. Trong khi đó backchannel của phiên thứ nhất bắt được nội dung gõ nguyên văn ở các thí nghiệm trước. Sáu trigger đang tồn tại và hoạt động, trong đó có `shinOnEdit | ON_EDIT | SPREADSHEETS` và `shinOnChange | ON_CHANGE | SPREADSHEETS` — điều này đã được xác minh, đây không phải vấn đề trigger chưa cài.

**Tại sao nó chặn tiến độ.** Toàn bộ giá trị của Tín hiệu B nằm ở chỗ Sidebar biết được thay đổi từ máy khác. Nếu Extension bắn tín hiệu hoàn hảo nhưng server trả `null` vì nó không biết gì, thì ta vừa xây một hệ thống báo sót tinh vi hơn hệ thống cũ — tinh vi hơn vì bây giờ sẽ có cảm giác an tâm giả.

**Suy luận về nguyên nhân, xếp theo khả năng.** Nghi ngờ mạnh nhất của tôi là bộ phân loại phạm vi trong `shinOnEdit` (theo khảo sát: phân loại theo view-control `!`, schema/header, `Category`, `Config`, `Customer`, `Activity`) đã bỏ qua ô được sửa vì nó nằm ngoài các nhóm đó. Nếu đúng vậy thì đây không phải bug của trigger mà là **hệ quả của thiết kế danh sách trắng ở phía server** — cùng đúng cái sai lầm mà tài liệu nghiên cứu cảnh báo, chỉ là nó nằm ở tầng khác. Khả năng thứ hai là trigger bắn nhưng thất bại im lặng. Khả năng thứ ba liên quan tới danh tính phiên thứ hai.

**Hướng chẩn đoán gợi ý.** Cài tạm một trigger `ON_EDIT` thứ hai, độc lập, không có bất kỳ bộ lọc phạm vi nào, chỉ ghi log mọi thứ nó nhận được:

```js
function diagOnEdit(e) {
  var info = {
    at: new Date().toISOString(),
    user: (e && e.user && e.user.getEmail && e.user.getEmail()) || 'unknown',
    sheet: e && e.range && e.range.getSheet().getName(),
    a1: e && e.range && e.range.getA1Notation(),
    value: e && String(e.value).slice(0, 40),
    changeType: e && e.changeType
  };
  console.log(JSON.stringify(info));
  PropertiesService.getDocumentProperties()
    .setProperty('diagLastEdit', JSON.stringify(info));
}
```

Lặp lại đúng Thí nghiệm 5 với trigger này đang chạy. Nếu `diagLastEdit` được ghi thì `shinOnEdit` có nhận sự kiện và vấn đề nằm ở bộ phân loại. Nếu không được ghi thì vấn đề nằm ở tầng nền tảng và phải điều tra theo hướng khác. Đây là thí nghiệm rẻ và nó phân biệt dứt khoát hai nhánh.

**Hướng xử lý gợi ý, nếu nguyên nhân là bộ phân loại.** Áp dụng nguyên tắc danh sách đen xuống tầng server: thay vì chỉ tăng revision cho các phạm vi đã nhận diện, tăng revision cho **mọi** sự kiện, và dùng kết quả phân loại chỉ để quyết định *phạm vi reload* chứ không để quyết định *có reload hay không*. Sự kiện không phân loại được thì gán phạm vi rộng nhất. Chi phí là thêm vài lần reload thừa; lợi ích là không còn khả năng báo sót âm thầm. Điều này cũng áp dụng cho `shinOnChange`, nơi theo khảo sát chỉ sáu `changeType` được xử lý còn lại `return null` — nên có một nhánh bắt-tất-cả ở cuối.

---

## Vấn đề 2 — Không tồn tại một hàm hỏi-thăm rẻ

**Mức độ: nghiêm trọng. Đây là thứ làm tiền đề "báo nhầm miễn phí" trở thành sai.**

**Quan sát cứng.** Agent khảo sát grep toàn repo và không tìm thấy `getChanges` ở bất cứ đâu — không định nghĩa, không lời gọi. Hàm gần nhất là `probeSelectionAndReload`, và nhật ký thực thi cho bốn mẫu thời gian chạy: **1,533 / 3,412 / 4,996 / 14,414 giây**.

**Tại sao nghiêm trọng.** Toàn bộ thiết kế tín hiệu dựa trên giả định "hỏi nhầm tốn khoảng 100ms, coi như miễn phí". Con số thực tế trung bình khoảng 6 giây, cực đại quan sát được 14,4 giây. Với tài khoản Gmail cá nhân có hạn ngạch 90 phút thời gian chạy mỗi ngày, mỗi lần hỏi nhầm không còn miễn phí chút nào.

Theo khảo sát, `probeSelectionAndReload` đi qua `selectionProbeContext()` → `shinOpenBook()` → `SpreadsheetApp.getActiveSpreadsheet()` hoặc fallback `openById`. Mở spreadsheet là thao tác đắt, và nó nằm trên đường đi của mọi lần hỏi thăm.

**Hướng xử lý gợi ý.** Tách bạch hai việc đang bị gộp làm một. Việc thứ nhất là **hỏi có gì mới không** — phải cực rẻ, chỉ đọc `DocumentProperties`, tuyệt đối không chạm `SpreadsheetApp`, không lấy lock, không tính toán gì. Việc thứ hai là **lấy dữ liệu về** — được phép đắt, nhưng chỉ chạy khi việc thứ nhất trả lời "có".

Đặc tả cho hàm mới:

```js
/**
 * Cổng hỏi-thăm siêu rẻ. KHÔNG được phép chạm SpreadsheetApp, LockService,
 * hay bất cứ thứ gì ngoài một lần đọc DocumentProperties.
 * Trả null nếu không có gì mới.
 */
function getChanges(lastSeenRevision) {
  var props = PropertiesService.getDocumentProperties().getProperties();
  var rev = Number(props['reloadRevision'] || 0);
  var seen = Number(lastSeenRevision || 0);
  if (rev <= seen) return null;

  return {
    revision: rev,
    changedAt: Number(props['reloadChangedAt'] || 0),
    scopes: {
      records:  props['reloadRecords']  === '1',
      category: props['reloadCategory'] === '1',
      config:   props['reloadConfig']   === '1',
      schema:   props['reloadSchema']   === '1'
      // tên khóa thực tế lấy theo DirtyState hiện có
    }
  };
}
```

Một lần `getProperties()` gộp thay vì nhiều lần `getProperty()`. Nhánh trả `null` không làm gì khác. Ước tính thời gian chạy dưới 200ms, nhưng **con số này phải đo chứ không được tin** — thêm một trường `ms` và đọc nhật ký thực thi sau vài chục lần gọi thật.

Một điểm cần làm rõ về hạn ngạch: khảo sát ghi nhận một phép đo cũ khoảng 2208ms cho chi phí đi đường mỗi vòng `google.script.run`. Con số đó là **độ trễ mạng**, không phải thời gian chạy script, nên nó không tiêu hạn ngạch. Thứ tiêu hạn ngạch là thời gian hàm chạy trên server. Vì vậy mục tiêu tối ưu là **thời gian chạy**, còn độ trễ cảm nhận là chuyện thứ yếu — và đó là thêm một lý do nữa để lịch bắn lại `[0, +5s, +15s]` là chấp nhận được.

---

## Vấn đề 3 — Hệ thống đang polling ở chu kỳ rất ngắn với hàm rất đắt

**Mức độ: nghiêm trọng về hạn ngạch.**

**Quan sát cứng.** Theo khảo sát, `selectionPoll` gọi `probeSelectionAndReload` mặc định mỗi **2 giây**, giãn ra 6 giây sau ba lần vị trí ổn định, cộng safety poll 60 giây. Nhật ký thực thi cho thấy các lần gọi thực tế cách nhau khoảng 15–25 giây (10:09:44, 10:12:04, 10:12:19, 10:13:26), thấp hơn chu kỳ danh nghĩa — có thể nhờ in-flight guard và bộ lọc vùng hợp lệ.

**Ước tính thô, cần kiểm chứng.** Bốn mẫu cho thời gian chạy trung bình khoảng 6 giây, xảy ra khoảng mỗi 20 giây. Đó là hệ số sử dụng khoảng 30%. Trong một ngày làm việc 8 tiếng với sidebar mở liên tục, con số này quy ra khoảng 2,4 giờ thời gian chạy script — vượt xa hạn ngạch 90 phút của tài khoản cá nhân và tiệm cận giới hạn 6 giờ của Workspace. Tôi nhấn mạnh **n=4, đây là ước tính thô**, nhưng ngay cả khi sai một nửa thì vẫn đáng báo động.

**Hướng xử lý gợi ý.** Đây thực ra là tin tốt bị che khuất, vì nó đổi bản chất của việc tích hợp Extension. Extension **không phải là một kênh mới thêm vào bên cạnh polling** — nó là thứ cho phép nới polling ra và cắt phần lớn tải hiện tại. Lợi ích chính là **giảm hạn ngạch**, không phải giảm độ trễ.

Kiến trúc đích gợi ý: giữ nguyên vòng polling nhưng nới chu kỳ lên 20–30 giây và đổi nó thành gọi `getChanges` rẻ thay vì `probeSelectionAndReload` đắt; dùng tín hiệu từ Extension để rút ngắn độ trễ trong trường hợp thường; khi watchdog báo cơ chế chết thì kéo chu kỳ về mức ngắn như cũ. Như vậy **phương án dự phòng trong tiêu chí nghiệm thu đã có sẵn trong code**, chỉ cần biến nó thành một tham số thay vì một hằng số.

Ngoài ra nên tách bạch hai loại poll đang bị gộp: theo dõi vị trí con trỏ (thuần client, có thể làm hoàn toàn trong trình duyệt, không cần gọi server) và theo dõi thay đổi dữ liệu (phải gọi server). Hiện tại chúng đi chung một RPC nên mỗi lần muốn biết con trỏ ở đâu là phải trả giá một lần mở spreadsheet.

--> nhận xét từ người dùng: việc polling mỗi 2 giây là để xác định mã khách hàng đang được click và hiển thị kịp thời trên sidebar. Do AI kia không biết việc này nên nhận xét có nhiều thiếu xót, cần check kỹ.

---

## Vấn đề 4 — Handler trigger chạy quá lâu

**Mức độ: đáng kể, ảnh hưởng cả độ trễ lẫn hạn ngạch.**

**Quan sát cứng.** `shinOnEdit` chạy **12,456 giây** cho một lần sửa một ô. `shinOnChange` chạy 1,762 giây. Cả hai cùng bắn lúc 10:12:00 cho cùng một thao tác. Việc cập nhật revision xảy ra ở giây thứ ~4,2 của quá trình 12,5 giây.

**Ba hệ quả suy ra.** Thứ nhất, các trigger của cùng một người dùng được xếp hàng tuần tự — nếu người dùng gõ nhanh nhiều ô, hàng đợi trigger sẽ dài ra và độ trễ 5 giây có thể thành hàng chục giây. Thứ hai, 12,5 giây mỗi lần sửa ô là một khoản tiêu hạn ngạch rất lớn, cộng dồn với Vấn đề 3. Thứ ba, revision được cập nhật ở giây thứ 4 nhưng handler còn chạy tiếp 8 giây nữa — nếu nó thất bại sau điểm đó, trạng thái có thể không nhất quán với những gì revision đã hứa.

**Hướng xử lý gợi ý.** Nguyên tắc chung cho installable trigger là làm ít nhất có thể rồi thoát. Gợi ý: `shinOnEdit` chỉ làm đúng ba việc — phân loại phạm vi ở mức thô nhất, ghi property, tăng revision, rồi return. Mọi công việc nặng còn lại (render view, tính toán dẫn xuất, đồng bộ phụ) chuyển sang chạy lazy khi có ai đó thực sự cần, hoặc chuyển sang một time-driven trigger riêng. Nếu làm được điều này, độ trễ edit-to-revision có thể xuống dưới 2 giây và lịch bắn lại ở Tài liệu 1 có thể rút ngắn tương ứng.

Cũng nên kiểm tra xem `shinOnEdit` và `shinOnChange` có đang làm trùng việc không, vì cả hai cùng bắn cho một thao tác.

---

## Vấn đề 5 — Không có mutex toàn cục cho lời gọi server

**Mức độ: trung bình hiện tại, sẽ thành nghiêm trọng sau khi tích hợp Extension.**

**Quan sát cứng.** Theo khảo sát, đã có nhiều guard cục bộ (`SHEET_LINK_SELECTION_PENDING`, `SHEET_LINK_DATA_PENDING`, `SHEET_LINK_RELOAD_CHECKING`, `state.pending`, `SELECTION_POLL.inFlight`, `FBM_SYNC_CLIENT.running`), nhưng `callServer()` tự thân không có mutex hay debounce toàn cục, và hai tên RPC khác nhau có thể chạy song song.

**Tại sao nó xấu đi sau tích hợp.** Tín hiệu từ Extension đến bất chợt và theo chùm ba. Cộng với các guard rải rác theo từng luồng, sẽ rất khó lý luận về việc tại một thời điểm có bao nhiêu lời gọi đang bay.

**Hướng xử lý gợi ý.** Gom tất cả các đường dẫn tới "kiểm tra thay đổi" (tín hiệu Extension, selection poll, safety poll, wake sau edit, visibilitychange) vào **đúng một cổng duy nhất** theo mẫu `createChangeGate` ở Tài liệu 1 Phần III.6. Các guard cục bộ hiện có vẫn giữ cho các luồng khác, nhưng luồng kiểm-tra-thay-đổi thì chỉ có một cửa. Điều này làm cho hành vi hệ thống trở nên dễ suy luận và dễ đo.

---

## Vấn đề 6 — Bộ lọc vùng hợp lệ có thể nuốt tín hiệu

**Mức độ: trung bình. Cần làm rõ trước khi tích hợp.**

Bạn có nhắc rằng Sidebar hiện có cơ chế lọc để chỉ gửi request khi tương tác trong vùng hợp lệ. Điều này đúng với thiết kế cũ, nơi lời gọi server luôn xuất phát từ hành động của chính người dùng. Nhưng tín hiệu từ Extension có bản chất khác: nó báo rằng **ai đó ở đâu đó** vừa đổi gì đó, và người dùng cục bộ hoàn toàn có thể đang đứng ở một vùng "không hợp lệ" vào lúc đó.

**Hướng xử lý gợi ý.** Đường đi của tín hiệu Extension phải **bỏ qua** mọi bộ lọc dựa trên vị trí con trỏ. Nó chỉ đi qua cổng gom (chống dồn và rate-limit) rồi gọi thẳng `getChanges`. Bộ lọc vùng hợp lệ nên được giữ nguyên cho đường đi cũ nhưng không được đặt trên đường đi mới.

---

## Vấn đề 7 — Một listener postMessage không kiểm tra origin

**Mức độ: an ninh, độc lập với dự án này nhưng nên sửa nhân dịp.**

**Quan sát từ khảo sát.** Sidebar có hai listener `message`. Cái ở `sheetLink` kiểm tra `event.origin === 'https://docs.google.com'` cùng nonce và session — đúng chuẩn. Cái ở `fbmSync` kiểm tra nonce và session nhưng **không có phép so sánh `event.origin`**.

**Tại sao đáng quan tâm hơn sau tích hợp.** Kiến trúc mới thêm một đường truyền postMessage từ bên ngoài vào sidebar. Nếu dùng Cách B (broadcast với target `'*'`), tin nhắn sẽ lọt sang mọi frame. Điều này an toàn với tín hiệu rỗng, nhưng nó có nghĩa là mọi listener trong sidebar sẽ nhận thêm traffic từ nguồn mới, và một listener không kiểm origin là chỗ yếu.

**Hướng xử lý gợi ý.** Bổ sung kiểm tra origin cho listener `fbmSync` theo đúng mẫu của `sheetLink`. Với đường truyền tín hiệu mới, dùng một listener riêng biệt, kiểm tra cả origin lẫn một nonce sinh ngẫu nhiên mỗi phiên, và tuyệt đối không cho tín hiệu mang theo dữ liệu nào — nó chỉ là một cú "ting" rỗng, đúng như thiết kế.

Tiện thể ghi nhận, không phải phát hiện của phiên này nhưng khảo sát có nêu: webapp đang cấu hình `access: ANYONE_ANONYMOUS`. Đáng rà lại xem có thực sự cần không.

---

## Thứ tự công việc gợi ý

Việc đầu tiên và không thể bỏ qua là chẩn đoán Vấn đề 1 bằng trigger `diagOnEdit`. Nếu thay đổi từ xa không bao giờ đến được server thì không nên viết một dòng Extension nào cả — móng phải xong trước.

Việc thứ hai là viết `getChanges` rẻ theo Vấn đề 2 và **đo thời gian chạy thực tế** của nó qua nhật ký thực thi. Con số đo được sẽ quyết định giá trị `minGapMs` của cổng gom.

Việc thứ ba là làm nhẹ `shinOnEdit` theo Vấn đề 4, rồi đo lại độ trễ edit-to-revision. Con số mới sẽ quyết định lịch bắn lại.

Chỉ sau ba việc đó mới nên chuyển selection poll sang dùng `getChanges` và nới chu kỳ, rồi cuối cùng mới viết Extension theo đặc tả ở Tài liệu 1. Extension là phần cuối cùng và cũng là phần dễ nhất, vì nó đã được kiểm chứng đầy đủ; phần khó và chưa chắc chắn nằm ở phía server.