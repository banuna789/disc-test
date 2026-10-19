# Bật trợ lý AI (Claude) cho trang DISC

Trang web chạy tĩnh trên GitHub Pages nên không thể giữ bí mật API key. File `worker.js` là một
Cloudflare Worker nhỏ đứng giữa: giữ API key, cố định system prompt, giới hạn độ dài và số lượt hỏi,
rồi chuyển câu trả lời của Claude về trình duyệt theo dạng stream.

Khi chưa bật Worker, ô chat trên trang vẫn dùng được: bấm gửi sẽ mở Claude.ai trong tab mới với
kết quả DISC và câu hỏi đã điền sẵn (người dùng cần tài khoản Claude.ai).

## Chi phí

- Cloudflare Workers: gói miễn phí 100.000 request/ngày, đủ dùng.
- Claude API: **trả phí theo lượng dùng**. Mặc định Worker dùng `claude-opus-5-5`
  ($4 / $20 cho mỗi 1 triệu token vào/ra). Một lượt hỏi đáp ngắn thường tốn khoảng 1–3 cent.
  Muốn rẻ hơn nhiều, đổi `MODEL` trong `worker.js` thành `claude-haiku-5-5` ($0.10 / $0.50).
- Hãy đặt **giới hạn chi tiêu hằng tháng** trong console.anthropic.com → Billing → Limits.
  Giới hạn trong Worker (20 lượt / 10 phút / IP) chỉ là lớp bảo vệ phụ.

## Các bước

1. Tạo API key tại https://console.anthropic.com → API Keys (nạp tiền ở mục Billing).
2. Đăng nhập https://dash.cloudflare.com (tạo tài khoản miễn phí nếu chưa có).
3. Workers & Pages → Create → Create Worker → đặt tên, ví dụ `disc-ai` → Deploy.
4. Edit code → xóa code mẫu, dán toàn bộ nội dung `worker.js` → Deploy.
5. Settings → Variables and Secrets:
   - Add → Type **Secret**, tên `ANTHROPIC_API_KEY`, giá trị là API key của bạn.
   - Add → Type **Text**, tên `ALLOWED_ORIGINS`, giá trị `https://banuna789.github.io`.
6. Copy địa chỉ Worker (dạng `https://disc-ai.<tên-bạn>.workers.dev`) và dán vào `aiEndpoint`
   trong `js/config.js`, rồi commit lên GitHub.
