# AI v3.0 — 8 WEB RIÊNG (19 tín hiệu + 63 cầu mẫu + Regime + Wilson)
Gộp thuật toán từ server_ai.py (63 cầu mẫu, 6 lớp):
- Lớp 1: Bệt 3-4 (theo) / 5-6 / 7-8 / 9+ (đảo)
- Lớp 2: Chu kỳ 1-1 → 7-7 (đảo)
- Lớp 3: Nhịp phức 30+ mẫu (3-2-2-3, 1-2-1, 3-1-3, đảo bệt 1-6...)
- Lớp 4: Đối xứng/Gương 5/7/9/11 (đảo)
- Lớp 5: Hồi quy 20 (lệch ≥6 → về thiểu số)
- Lớp 6: Anti-trap (8 đảo liên tiếp → bẫy, theo cuối)
+ Markov fallback + 17 tín hiệu ensemble cũ + Regime Detection + Wilson Lower Bound
Giao diện hiển thị tên cầu mẫu đã khớp (vd: 🎯 NHIPHUC_3-1-3).
Chạy: npm install && node <file>.js
