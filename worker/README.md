# Trợ lý AI cho trang DISC (Cloudflare Workers AI, miễn phí)

`worker.js` là một Cloudflare Worker chạy model AI mã nguồn mở qua Workers AI.
Không cần API key, không cần thẻ thanh toán.

## Chi phí và giới hạn

- Gói Workers Free: 10.000 "neuron" mỗi ngày, reset lúc 00:00 UTC (7 giờ sáng giờ Việt Nam).
- Model mặc định `@cf/qwen/qwen3-30b-a3b-fp8` tốn khoảng 20 neuron mỗi lượt hỏi,
  tức khoảng 400–500 lượt mỗi ngày.
- Hết hạn mức thì chat báo "hết lượt hôm nay" cho đến khi reset. Ở gói Free **không bao giờ bị tính tiền**.
- Mỗi IP được hỏi tối đa 20 lượt / 10 phút.

## Cài đặt

1. https://dash.cloudflare.com → Workers & Pages → Create → Create Worker → đặt tên `disc-ai` → Deploy.
2. Edit code → dán toàn bộ `worker.js` → Deploy.
3. Settings → Bindings → Add → **Workers AI**, tên biến `AI`.
4. Settings → Variables and Secrets → Add → Text `ALLOWED_ORIGINS` = `https://banuna789.github.io`.
5. Dán địa chỉ Worker vào `aiEndpoint` trong `js/config.js`.

Muốn thử model khác, thêm biến Text `MODEL` (ví dụ `@cf/meta/llama-4-scout-17b-16e-instruct`
hoặc `@cf/openai/gpt-oss-20b`). Model khác tốn neuron khác, xem bảng giá:
https://developers.cloudflare.com/workers-ai/platform/pricing/
