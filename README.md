# Trắc nghiệm DISC

Bài trắc nghiệm tính cách DISC miễn phí: 60 câu hỏi (bài nhanh 30 câu hoặc đầy đủ 60 câu),
3 ngôn ngữ (Tiếng Việt, English, 日本語), kết quả có giải thích chi tiết và trợ lý AI tư vấn.

Trang chạy trên **Cloudflare Pages** và yêu cầu **đăng nhập bằng Google**.

## Cấu trúc

| Đường dẫn | Nội dung |
| --- | --- |
| `index.html`, `js/` | Giao diện: câu hỏi (`questions.js`), bản dịch (`i18n.js`), logic (`app.js`) |
| `functions/_middleware.js` | Cổng đăng nhập Google cho toàn bộ trang |
| `functions/api/chat.js` | Trợ lý AI chạy trên Cloudflare Workers AI (miễn phí theo hạn mức ngày) |
| `lib/session.js` | Ký và kiểm tra cookie phiên đăng nhập |

## Cài đặt trên Cloudflare Pages

Pages project → **Settings**:

1. **Variables and Secrets** (Production):
   - `GOOGLE_CLIENT_ID` (Text): Client ID loại *Web application* tạo ở Google Cloud Console →
     Google Auth Platform → Clients. Mục *Authorized JavaScript origins* phải có địa chỉ trang,
     ví dụ `https://disc-test-6xo.pages.dev`.
   - `SESSION_SECRET` (Secret): một chuỗi ngẫu nhiên dài (từ 32 ký tự), dùng để ký cookie đăng nhập.
2. **Bindings** → Add → **Workers AI**, tên biến `AI`.
3. (Tùy chọn) `REQUIRE_LOGIN` (Text) = `false` để mở trang cho mọi người, không cần đăng nhập. Xóa biến hoặc đặt `true` để bật lại đăng nhập.
4. Deployments → Retry deployment (hoặc push một commit mới) để áp dụng.

Workers AI gói Free cho 10.000 neuron/ngày (khoảng 400–500 lượt hỏi), hết thì dừng chứ không tính tiền.
Muốn đổi model, thêm biến `MODEL`, ví dụ `@cf/meta/llama-4-scout-17b-16e-instruct`.

## Chạy thử trên máy

Mở `index.html` qua một web server tĩnh bất kỳ. Ở chế độ này không có đăng nhập và chat AI bị ẩn.
