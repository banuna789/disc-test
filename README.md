# Trắc nghiệm DISC

Bài trắc nghiệm tính cách DISC miễn phí: 60 câu hỏi (bài nhanh 30 câu hoặc đầy đủ 60 câu),
3 ngôn ngữ (Tiếng Việt, English, 日本語), kết quả có giải thích chi tiết và trợ lý AI tư vấn.

Trang chạy trên **Cloudflare Pages**. Người làm bài nhập họ tên và ngày sinh trước khi bắt đầu.
Kết quả được lưu vào **Cloudflare D1** và chỉ quản trị viên xem được ở `/admin` (đăng nhập Google).

## Cấu trúc

| Đường dẫn | Nội dung |
| --- | --- |
| `index.html`, `js/` | Giao diện: câu hỏi (`questions.js`), bản dịch (`i18n.js`), logic (`app.js`) |
| `admin.html`, `js/admin.js` | Trang quản trị: danh sách kết quả, tìm kiếm, xuất CSV, xóa |
| `functions/_middleware.js` | Kiểm soát truy cập: đăng nhập Google, khu vực admin, công tắc `REQUIRE_LOGIN` |
| `functions/api/results.js` | `POST /api/results`: lưu kết quả bài test |
| `functions/api/admin/results.js` | `GET` / `DELETE /api/admin/results`: chỉ admin |
| `functions/api/chat.js` | Trợ lý AI chạy trên Cloudflare Workers AI (miễn phí theo hạn mức ngày) |
| `lib/session.js` | Ký và kiểm tra cookie phiên đăng nhập |
| `lib/db.js` | Tạo bảng `results` trong D1 khi dùng lần đầu |
| `privacy.html` | Chính sách quyền riêng tư (công khai) |

## Cài đặt trên Cloudflare Pages

Pages project → **Settings**:

1. **Variables and Secrets** (Production):
   - `GOOGLE_CLIENT_ID` (Text): Client ID loại *Web application* tạo ở Google Cloud Console →
     Google Auth Platform → Clients. Mục *Authorized JavaScript origins* phải có địa chỉ trang,
     ví dụ `https://disc-test-6xo.pages.dev`.
   - `SESSION_SECRET` (Secret): một chuỗi ngẫu nhiên dài (từ 32 ký tự), dùng để ký cookie đăng nhập.
   - `ADMIN_EMAILS` (Text): email Google của quản trị viên, nhiều email thì ngăn cách bằng dấu phẩy.
   - (Tùy chọn) `REQUIRE_LOGIN` (Text) = `false` để mở phần làm bài cho mọi người, không cần đăng nhập.
     Xóa biến hoặc đặt `true` để bắt đăng nhập. Trang `/admin` luôn yêu cầu đăng nhập bằng email admin.
2. **Bindings**:
   - **Workers AI**, tên biến `AI`.
   - **D1 database**, tên biến `DB` (tạo database ở Storage & databases → D1). Bảng tự được tạo.
3. Runtime → **Fail open/closed** = Fail closed.
4. Deployments → Retry deployment (hoặc push một commit mới) để áp dụng.

Gói Free: Workers AI 10.000 neuron/ngày (khoảng 400–500 lượt hỏi), D1 5 GB và 100.000 lượt ghi/ngày.
Hết hạn mức thì dừng chứ không tính tiền. Muốn đổi model AI, thêm biến `MODEL`.

## Chạy thử trên máy

Mở `index.html` qua một web server tĩnh bất kỳ. Ở chế độ này không có đăng nhập, chat AI bị ẩn
và kết quả không được gửi đi đâu.
