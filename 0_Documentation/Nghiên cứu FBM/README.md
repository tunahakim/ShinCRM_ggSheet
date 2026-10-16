# Tài liệu 6 - FBM Integration Reference

- Nguồn chính cho tích hợp FBM Phase 2.
- Các file trong thư mục này được tách bằng script từ tài liệu gốc 06.
- Bản monolithic gốc nếu còn trong docs/ chỉ là bản tạm trước khi archive; AI coding dùng bản split này làm nguồn chính.
- Chương 01–15 tách nguyên văn từ tài liệu gốc 06. Chương từ 16 trở đi là kết quả nghiên cứu ghi thêm sau, mỗi chương ghi ngày thử và request mẫu.

## Chương ghi thêm

| Tệp | Nội dung |
|---|---|
| `ch16-activity-owner-lookup.md` | Tra khách đang giữ một giao dịch qua câu lọc `externalKey` trên grid khách; đường `GetCompletionList` với bảng giao dịch đã thử và bị chặn; request không kèm điều kiện quyền thấy cả khách thuộc quyền người khác |
