/* ==========================================================================
   إعدادات الاتصال بـ Supabase — مشتركة بين صفحة الشقة ولوحة التحكم
   المفتاح هنا "publishable" (عام) وآمن للنشر في كود العميل؛ كل الحماية
   الفعلية تتم عبر سياسات RLS في قاعدة البيانات، وليس بإخفاء هذا المفتاح.
   ========================================================================== */
window.SUPABASE_URL = 'https://divoyxodxkioxugrphby.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_qw9IiQ52_WFip-4gNX4lkA_CZA0VFzf';

window.getSupabaseClient = function () {
    if (window.__sb) return window.__sb;
    if (!window.supabase || !window.supabase.createClient) {
        console.error('[supabase] مكتبة العميل لم تُحمَّل');
        return null;
    }
    window.__sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return window.__sb;
};
