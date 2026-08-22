/* ============================================================
   بوابة دخول المالك الموحّدة — تُستخدم في admin.html و collection.html
   1) بصمة/وجه الجهاز عبر WebAuthn (تحقق محلي لا يغادر الجهاز)
   2) كلمة سر احتياطية ثابتة إذا تعذّرت البصمة: 12091209
   3) جلسة موحّدة: الدخول من أي صفحة يفتح الأخرى تلقائياً لمدة 12 ساعة
   ملاحظة: حماية بسيطة من طرف المتصفح (الموقع ثابت بدون سيرفر خاص بها)،
   البصمة أولاً ثم يتبعها توثيق Supabase الحقيقي في admin.html فقط.
   ============================================================ */
(function (global) {
    'use strict';

    const CRED_KEY = 'rhsa_owner_cred_id';
    const SESSION_KEY = 'rhsa_owner_session';
    const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 ساعة
    const FALLBACK_PASSWORD = '12091209';

    function b64urlToBuf(b64url) {
        const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64url.length + (4 - b64url.length % 4) % 4, '=');
        const bin = atob(b64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf.buffer;
    }

    function bufToB64url(buf) {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function isSessionValid() {
        const ts = Number(localStorage.getItem(SESSION_KEY) || 0);
        return ts > 0 && (Date.now() - ts) < SESSION_TTL_MS;
    }

    function markUnlocked() {
        localStorage.setItem(SESSION_KEY, String(Date.now()));
    }

    function lock() {
        localStorage.removeItem(SESSION_KEY);
    }

    function hasBiometricSupport() {
        return !!(global.PublicKeyCredential && navigator.credentials);
    }

    function hasRegisteredBiometric() {
        return !!localStorage.getItem(CRED_KEY);
    }

    async function registerBiometric() {
        if (!hasBiometricSupport()) return false;
        try {
            const cred = await navigator.credentials.create({
                publicKey: {
                    challenge: crypto.getRandomValues(new Uint8Array(32)),
                    rp: { name: 'RentAPA لوحة المالك' },
                    user: {
                        id: crypto.getRandomValues(new Uint8Array(16)),
                        name: 'owner@rentapa',
                        displayName: 'مالك العقار',
                    },
                    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
                    timeout: 60000,
                },
            });
            if (!cred) return false;
            localStorage.setItem(CRED_KEY, bufToB64url(cred.rawId));
            return true;
        } catch (e) {
            console.warn('[owner-gate] تعذّر تسجيل البصمة:', e);
            return false;
        }
    }

    async function tryBiometric() {
        if (!hasBiometricSupport() || !hasRegisteredBiometric()) return false;
        try {
            const credId = localStorage.getItem(CRED_KEY);
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: crypto.getRandomValues(new Uint8Array(32)),
                    allowCredentials: [{ id: b64urlToBuf(credId), type: 'public-key' }],
                    userVerification: 'required',
                    timeout: 60000,
                },
            });
            return !!assertion;
        } catch (e) {
            console.warn('[owner-gate] فشل التحقق بالبصمة:', e);
            return false;
        }
    }

    function isFallbackPassword(value) {
        return String(value || '').trim() === FALLBACK_PASSWORD;
    }

    global.OwnerGate = {
        FALLBACK_PASSWORD,
        isSessionValid,
        markUnlocked,
        lock,
        hasBiometricSupport,
        hasRegisteredBiometric,
        registerBiometric,
        tryBiometric,
        isFallbackPassword,
    };
})(window);
