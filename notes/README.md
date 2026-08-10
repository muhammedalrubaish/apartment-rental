# ملاحظات المشروع (Obsidian Vault)

هذا المجلد مخصص ليكون Obsidian vault لمتابعة أفكار وحجوزات مشروع تأجير الشقق.

## الهيكل

- `ideas.md` — صندوق الأفكار وسجلها حسب التاريخ.
- `bookings/` — سجل حجوزات شهري، ملف لكل شهر بصيغة `YYYY-MM.md`.
- `templates/booking.md` — قالب لإنشاء حجز جديد.

## طريقة الربط بـ Obsidian على آيفون

1. اجعل مجلد الريبو متاحًا على الجهاز (عبر iCloud Drive أو تطبيق Working Copy لعمل clone).
2. في Obsidian، افتح هذا المجلد (`notes/`) كـ Vault: "Open folder as vault".
3. عند التعديل، احفظ (Obsidian يحفظ تلقائيًا) ثم اعمل `git add . && git commit && git push` من Working Copy أو من جهاز فيه git.

## نصيحة

فعّل خطة "Daily notes" أو "Templates" داخل إعدادات Obsidian واربطها بمجلد `templates/`
لتسريع إنشاء حجز جديد بضغطة واحدة.
