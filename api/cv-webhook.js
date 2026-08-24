// api/cv-webhook.js - Webhook الوكيل الهجين لبوت السيرة الذاتية (iDes CV)
const { createClient } = require('@supabase/supabase-js');

// إعدادات Supabase لمشروع malrubaish
const SUPABASE_URL = 'https://inmqzoxyawhypoaosede.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_qw9IiQ52_WFip-4gNX4lkA_CZA0VFzf'; // أو مفتاح السيرفس
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// إعدادات UltraMsg
const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE || 'instance109439';
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN || 'jjpmfq1bJsywSuml';

async function sendWhatsAppMessage(to, body) {
    try {
        const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`;
        const params = new URLSearchParams();
        params.append('token', ULTRAMSG_TOKEN);
        params.append('to', to);
        params.append('body', body);
        params.append('priority', '10');

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        return await res.json();
    } catch (e) {
        console.error('[UltraMsg Send Error]:', e);
    }
}

// تدفق جمع بيانات السيرة الذاتية خطوة بخطوة
const STEPS = {
    WELCOME: 'welcome',
    FULL_NAME: 'name',
    JOB_TITLE: 'job_title',
    EXPERIENCE: 'experience',
    EDUCATION: 'education',
    SKILLS: 'skills',
    CITY_EMAIL: 'city_email',
    CONFIRMATION: 'done'
};

const WELCOME_MSG = `🌟 *أهلاً بك في iDes لتصميم السيرة الذاتية!*

نحن نصمم لك سيرة ذاتية *احترافية متوافقة مع نظام ATS* يقرأها الذكاء الاصطناعي للشركات.

✅ تصميم احترافي ومخصص
✅ متوافق مع ATS بنسبة 100%
✅ تسليم خلال 24 ساعة
✅ السعر: *50 ريال فقط* 💰

---
للبدء، تفضل بكتابة *اسمك الكامل* كما تريده في السيرة الذاتية:
_(مثال: محمد عبدالله الأحمدي)_`;

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(200).send('CV Webhook is running active!');
    }

    try {
        const data = req.body?.data || req.body;
        if (!data) return res.status(200).json({ status: 'no_data' });

        const from = data.from; // رقم المرسل (العميل) مثل 966549814764@c.us
        const body = (data.body || '').trim();
        const fromMe = data.fromMe; // هل الرسالة مرسلة من صاحب الجوال نفسه
        const id = data.id;

        if (!from || !body) return res.status(200).json({ status: 'ignored' });

        // تنظيف رقم الهاتف
        const phone = from.replace('@c.us', '').replace('+', '').trim();

        // 1. إذا كان صاحب الحساب هو الذي أرسل رسالة للعميل (تدخل بشري)
        if (fromMe) {
            console.log(`[Human Takeover] Manual message detected to ${phone}`);
            // تحويل المحادثة للوضع اليدوي وإيقاف البوت
            await supabase.from('conversations').upsert({
                phone,
                mode: 'manual',
                last_message_at: new Date().toISOString()
            }, { onConflict: 'phone' });

            await supabase.from('messages').insert({
                phone,
                dir: 'out',
                actor: 'owner',
                text: body,
                ts: Date.now()
            });

            return res.status(200).json({ status: 'human_outgoing_recorded' });
        }

        // 2. إذا كانت الرسالة واردة من عميل
        // تسجيل الرسالة الواردة
        await supabase.from('messages').insert({
            phone,
            dir: 'in',
            actor: 'customer',
            text: body,
            ts: Date.now()
        });

        // جلب سجل المحادثة للعميل
        let { data: conv } = await supabase.from('conversations').select('*').eq('phone', phone).maybeSingle();

        // إذا كان العميل جديداً
        if (!conv) {
            conv = {
                phone,
                name: '',
                step: STEPS.FULL_NAME,
                cv_data: { personalInfo: { phone }, experience: [], education: [], skills: [] },
                mode: 'auto',
                unread: 1,
                created_at: new Date().toISOString(),
                last_message_at: new Date().toISOString()
            };
            await supabase.from('conversations').insert(conv);
            await sendWhatsAppMessage(phone, WELCOME_MSG);
            return res.status(200).json({ status: 'new_lead_welcomed' });
        }

        // إذا كانت المحادثة في وضع التحويل البشري (manual)، لا يرد البوت إلا إذا طلب العميل إعادة التشغيل
        if (conv.mode === 'manual') {
            if (body.toLowerCase() === 'تفعيل' || body.toLowerCase() === 'بدء' || body.toLowerCase() === 'reset') {
                conv.mode = 'auto';
                conv.step = STEPS.FULL_NAME;
                await supabase.from('conversations').update({ mode: 'auto', step: STEPS.FULL_NAME }).eq('phone', phone);
                await sendWhatsAppMessage(phone, WELCOME_MSG);
                return res.status(200).json({ status: 'bot_reactivated' });
            }
            console.log(`[Manual Mode] Bot is muted for ${phone}`);
            return res.status(200).json({ status: 'bot_muted_manual_mode' });
        }

        // 3. معالجة خطوات البوت الذكي
        let reply = '';
        let nextStep = conv.step;
        const cvData = conv.cv_data || { personalInfo: { phone }, experience: [], education: [], skills: [] };

        switch (conv.step) {
            case STEPS.FULL_NAME:
                conv.name = body;
                cvData.personalInfo = cvData.personalInfo || {};
                cvData.personalInfo.fullName = body;
                nextStep = STEPS.JOB_TITLE;
                reply = `تشرفنا يا أستاذ *${body}* 🤝\n\nما هو *المسمى الوظيفي أو التخصص* الذي تستهدفه؟\n_(مثال: مهندس برمجيات / أخصائي موارد بشرية / محاسب)_`;
                break;

            case STEPS.JOB_TITLE:
                cvData.personalInfo.jobTitle = body;
                nextStep = STEPS.EXPERIENCE;
                reply = `ممتاز! 💼\n\nتفضل بكتابة *الخبرات المهنية السابقة* (الشركة، المسمى، وسنوات العمل إن وُجدت):\n_(أو اكتب "خريج جديد / لا يوجد" إذا كنت لا تملك خبرات بعد)_`;
                break;

            case STEPS.EXPERIENCE:
                cvData.experienceRaw = body;
                nextStep = STEPS.EDUCATION;
                reply = `رائع! 🎓\n\nما هو *المؤهل التعليمي*؟ (الجامعة/الكلية، التخصص، وسنة التخرج):\n_(مثال: بكالوريوس إدارة أعمال - جامعة الملك سعود 2024)_`;
                break;

            case STEPS.EDUCATION:
                cvData.educationRaw = body;
                nextStep = STEPS.SKILLS;
                reply = `أحسنت! ⚡\n\nما هي أبرز *المهارات والبرامج أو اللغات* التي تتقنها؟\n_(مثال: إدارة المشاريع، Excel، العمل الجماعي، لغة إنجليزية)_`;
                break;

            case STEPS.SKILLS:
                cvData.skillsRaw = body;
                nextStep = STEPS.CITY_EMAIL;
                reply = `ممتاز جداً! 📍\n\nأخيراً، لطفاً اكتب *المدينة والبريد الإلكتروني*:\n_(مثال: الرياض - info@example.com)_`;
                break;

            case STEPS.CITY_EMAIL:
                cvData.contactRaw = body;
                nextStep = STEPS.CONFIRMATION;
                reply = `🎉 *تم استلام جميع بياناتك بنجاح!*\n\nسيبدأ فريق *iDes* الآن في صياغة وتنسيق سيرتك الذاتية وفق معايير الـ ATS العالمية 📄✨\n\n💳 *قيمة الخدمة:* 50 ريال\nلإتمام الطلب وتأكيد البدء، يمكنك التحويل عبر الحساب البنكي أو STC Pay وسيتم تزويدك بالملف PDF + Word جاهزاً للطباعة والتقديم.\n\nهل ترغب في إضافة أي ملاحظات أو شهادات دورات إضافية؟`;
                break;

            default:
                reply = `شكراً لتواصلك! تم تسجيل رسالتك وسيتواصل معك المصمم مباشرة للإجابة على أي استفسار. ✨`;
                break;
        }

        // تحديث قاعدة البيانات
        await supabase.from('conversations').update({
            name: conv.name || conv.personalInfo?.fullName || '',
            step: nextStep,
            cv_data: cvData,
            last_message_at: new Date().toISOString()
        }).eq('phone', phone);

        // إرسال الرد للعميل
        if (reply) {
            await sendWhatsAppMessage(phone, reply);
            await supabase.from('messages').insert({
                phone,
                dir: 'out',
                actor: 'bot',
                text: reply,
                ts: Date.now()
            });
        }

        return res.status(200).json({ status: 'success', nextStep });
    } catch (error) {
        console.error('[Webhook Error]:', error);
        return res.status(500).json({ error: error.message });
    }
};
