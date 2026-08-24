// api/cv-webhook.js - Webhook الوكيل الهجين لبوت السيرة الذاتية عبر Green API
const SUPABASE_URL = 'https://inmqzoxyawhypoaosede.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_qw9IiQ52_WFip-4gNX4lkA_CZA0VFzf';

// إعدادات Green API
const GREEN_API_URL = process.env.GREEN_API_URL || 'https://7107.api.greenapi.com';
const GREEN_ID_INSTANCE = process.env.GREEN_ID_INSTANCE || '710722718573';
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN || '490178eb5b4c462380cf28482cbc847b47939e79d69b4a9aa2';

// دوال Supabase REST API مباشرة
async function sbQuery(table, query = '') {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        return await res.json();
    } catch (e) {
        console.error('[SB Query Error]:', e);
        return [];
    }
}

async function sbInsert(table, data) {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error('[SB Insert Error]:', e);
    }
}

async function sbUpsert(table, data) {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error('[SB Upsert Error]:', e);
    }
}

async function sbUpdate(table, query, data) {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error('[SB Update Error]:', e);
    }
}

// دالة إرسال رسالة عبر Green API
async function sendGreenMessage(chatId, message) {
    try {
        const url = `${GREEN_API_URL}/waInstance${GREEN_ID_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: chatId.includes('@') ? chatId : `${chatId}@c.us`,
                message: message
            })
        });
        return await res.json();
    } catch (e) {
        console.error('[Green API Send Error]:', e);
    }
}

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
    if (req.method === 'GET') {
        return res.status(200).send('Green API CV Webhook is running active and healthy! 🚀');
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const body = req.body || {};
        const typeWebhook = body.typeWebhook;

        // تجاهل أي إشعارات غير الرسائل الواردة/الصادرة
        if (!typeWebhook || (!typeWebhook.startsWith('incomingMessageReceived') && !typeWebhook.startsWith('outgoingMessageReceived') && !typeWebhook.startsWith('outgoingAPIMessageReceived'))) {
            return res.status(200).json({ status: 'ignored_type', typeWebhook });
        }

        const msgData = body.messageData;
        const senderData = body.senderData || {};
        const chatId = senderData.chatId || body.chatId || '';
        
        // استخراج نص الرسالة
        const textMessage = msgData?.textMessageData?.textMessage 
                         || msgData?.extendedTextMessageData?.text 
                         || '';

        if (!chatId || !textMessage) {
            return res.status(200).json({ status: 'no_chat_or_text' });
        }

        // تنظيف رقم الهاتف
        const phone = chatId.replace('@c.us', '').replace('@g.us', '').replace('+', '').trim();

        // تجنب الرد داخل المجموعات
        if (chatId.includes('@g.us')) {
            return res.status(200).json({ status: 'ignored_group' });
        }

        // 1. إذا كانت الرسالة صادرة من صاحب الجوال يدوياً (تدخل بشري)
        if (typeWebhook === 'outgoingMessageReceived') {
            console.log(`[Human Takeover] Manual outgoing message to ${phone}`);
            await sbUpsert('conversations', {
                phone,
                mode: 'manual',
                last_message_at: new Date().toISOString()
            });

            await sbInsert('messages', {
                phone,
                dir: 'out',
                actor: 'owner',
                text: textMessage,
                ts: Date.now()
            });

            return res.status(200).json({ status: 'human_takeover_recorded' });
        }

        // إذا كانت صادرة من الـ API الخاص بنا، نسجلها فقط ولا نعيد معالجتها
        if (typeWebhook === 'outgoingAPIMessageReceived') {
            return res.status(200).json({ status: 'api_message_acknowledged' });
        }

        // 2. معالجة الرسائل الواردة من العميل (incomingMessageReceived)
        await sbInsert('messages', {
            phone,
            dir: 'in',
            actor: 'customer',
            text: textMessage,
            ts: Date.now()
        });

        // جلب سجل المحادثة
        const convList = await sbQuery('conversations', `?phone=eq.${phone}&limit=1`);
        let conv = convList && convList.length ? convList[0] : null;

        // إذا كان العميل جديداً
        if (!conv) {
            conv = {
                phone,
                name: senderData.senderName || '',
                step: STEPS.FULL_NAME,
                cv_data: { personalInfo: { phone }, experience: [], education: [], skills: [] },
                mode: 'auto',
                unread: 1,
                created_at: new Date().toISOString(),
                last_message_at: new Date().toISOString()
            };
            await sbInsert('conversations', conv);
            await sendGreenMessage(chatId, WELCOME_MSG);
            return res.status(200).json({ status: 'welcomed' });
        }

        // إذا كانت المحادثة في وضع التحويل البشري (manual)
        if (conv.mode === 'manual') {
            if (textMessage.toLowerCase() === 'تفعيل' || textMessage.toLowerCase() === 'بدء' || textMessage.toLowerCase() === 'reset') {
                await sbUpdate('conversations', `?phone=eq.${phone}`, { mode: 'auto', step: STEPS.FULL_NAME });
                await sendGreenMessage(chatId, WELCOME_MSG);
                return res.status(200).json({ status: 'bot_reactivated' });
            }
            return res.status(200).json({ status: 'manual_mode_active' });
        }

        // 3. مسار البوت الذكي خطوة بخطوة
        let reply = '';
        let nextStep = conv.step;
        const cvData = conv.cv_data || { personalInfo: { phone }, experience: [], education: [], skills: [] };

        switch (conv.step) {
            case STEPS.FULL_NAME:
                conv.name = textMessage;
                cvData.personalInfo = cvData.personalInfo || {};
                cvData.personalInfo.fullName = textMessage;
                nextStep = STEPS.JOB_TITLE;
                reply = `تشرفنا يا أستاذ *${textMessage}* 🤝\n\nما هو *المسمى الوظيفي أو التخصص* الذي تستهدفه؟\n_(مثال: مهندس برمجيات / أخصائي موارد بشرية / محاسب)_`;
                break;

            case STEPS.JOB_TITLE:
                cvData.personalInfo.jobTitle = textMessage;
                nextStep = STEPS.EXPERIENCE;
                reply = `ممتاز! 💼\n\nتفضل بكتابة *الخبرات المهنية السابقة* (الشركة، المسمى، وسنوات العمل إن وُجدت):\n_(أو اكتب "خريج جديد / لا يوجد" إذا كنت لا تملك خبرات بعد)_`;
                break;

            case STEPS.EXPERIENCE:
                cvData.experienceRaw = textMessage;
                nextStep = STEPS.EDUCATION;
                reply = `رائع! 🎓\n\nما هو *المؤهل التعليمي*؟ (الجامعة/الكلية، التخصص، وسنة التخرج):\n_(مثال: بكالوريوس إدارة أعمال - جامعة الملك سعود 2024)_`;
                break;

            case STEPS.EDUCATION:
                cvData.educationRaw = textMessage;
                nextStep = STEPS.SKILLS;
                reply = `أحسنت! ⚡\n\nما هي أبرز *المهارات والبرامج أو اللغات* التي تتقنها؟\n_(مثال: إدارة المشاريع، Excel، العمل الجماعي، لغة إنجليزية)_`;
                break;

            case STEPS.SKILLS:
                cvData.skillsRaw = textMessage;
                nextStep = STEPS.CITY_EMAIL;
                reply = `ممتاز جداً! 📍\n\nأخيراً، لطفاً اكتب *المدينة والبريد الإلكتروني*:\n_(مثال: الرياض - info@example.com)_`;
                break;

            case STEPS.CITY_EMAIL:
                cvData.contactRaw = textMessage;
                nextStep = STEPS.CONFIRMATION;
                reply = `🎉 *تم استلام جميع بياناتك بنجاح!*\n\nسيبدأ فريق *iDes* الآن في صياغة وتنسيق سيرتك الذاتية وفق معايير الـ ATS العالمية 📄✨\n\n💳 *قيمة الخدمة:* 50 ريال\nلإتمام الطلب وتأكيد البدء، يمكنك التحويل عبر الحساب البنكي أو STC Pay وسيتم تزويدك بالملف PDF + Word جاهزاً للطباعة والتقديم.\n\nهل ترغب في إضافة أي ملاحظات أو شهادات دورات إضافية؟`;
                break;

            default:
                reply = `شكراً لتواصلك! تم تسجيل رسالتك وسيتواصل معك المصمم مباشرة للإجابة على أي استفسار. ✨`;
                break;
        }

        // تحديث قاعدة البيانات
        await sbUpdate('conversations', `?phone=eq.${phone}`, {
            name: conv.name || cvData.personalInfo?.fullName || '',
            step: nextStep,
            cv_data: cvData,
            last_message_at: new Date().toISOString()
        });

        // إرسال الرد للعميل
        if (reply) {
            await sendGreenMessage(chatId, reply);
            await sbInsert('messages', {
                phone,
                dir: 'out',
                actor: 'bot',
                text: reply,
                ts: Date.now()
            });
        }

        return res.status(200).json({ status: 'ok', nextStep });
    } catch (err) {
        console.error('[Green Webhook Global Error]:', err);
        return res.status(500).json({ error: err.message });
    }
};
