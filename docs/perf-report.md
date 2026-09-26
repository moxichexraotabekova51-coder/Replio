# Replio — tezlik o'lchovi (8-bo'lim)

Sana: 2026-09-26T10:29:54.939Z · muhit: http://localhost:3100 (lokal Supabase + mock Telegram/checkout)

| Amal | n | o'rtacha | p50 | p95 | p99 | Maqsad (o'rtacha) | p99 ≤ 2 000 ms |
|---|---:|---:|---:|---:|---:|---:|:---:|
| Bot: xabarga javob (100 parallel foydalanuvchi) | 300 | 289 | 276 | 540 | 610 | ≤ 500 | ✓ |
| Bot: inline tugmaga javob (100 parallel) | 200 | 324 | 282 | 636 | 670 | ≤ 400 | ✓ |
| Sayt: landing birinchi ochilish (LCP) | 8 | 164 | 152 | 204 | 204 | ≤ 1200 | ✓ |
| Login (email) → ilova | 5 | 587 | 577 | 674 | 674 | ≤ 800 | ✓ |
| Dashboard grafiklari yuklanishi | 5 | 568 | 532 | 673 | 673 | ≤ 700 | ✓ |
| Ilova ichida sahifadan sahifaga o'tish | 24 | 214 | 88 | 888 | 1085 | ≤ 300 | ✓ |
| Trigger / teg / field yaratish | 8 | 193 | 172 | 266 | 266 | ≤ 300 | ✓ |
| Contacts: 50 000 kontaktda qidiruv / filtr | 16 | 249 | 241 | 429 | 429 | ≤ 500 | ✓ |
| Flow builder: 200 stepli flow (to'g'ridan-to'g'ri URL, to'liq yuklash) | 6 | 1007 | 1006 | 1283 | 1283 | ≤ 800 | ✓ |
| Flow builder: 200 stepli flowni ochish (ro'yxatdan) | 6 | 677 | 624 | 1073 | 1073 | ≤ 800 | ✓ |
| Flow: saqlash / Publish (200 step) | 6 | 99 | 88 | 144 | 144 | ≤ 500 | ✓ |
| Live Chat: foydalanuvchi xabari → inbox'da | 8 | 358 | 380 | 405 | 405 | ≤ 500 | ✓ |
| Live Chat: operator xabari → foydalanuvchiga | 8 | 121 | 108 | 152 | 152 | ≤ 500 | ✓ |
| Broadcast: Send → birinchi xabar | 4 | 330 | 323 | 342 | 342 | ≤ 1000 | ✓ |
| To'lov: Upgrade → checkout sahifasi | 5 | 510 | 521 | 545 | 545 | ≤ 1000 | ✓ |
| To'lov: webhook → tarif faollashishi | 5 | 167 | 170 | 183 | 183 | ≤ 500 | ✓ |
