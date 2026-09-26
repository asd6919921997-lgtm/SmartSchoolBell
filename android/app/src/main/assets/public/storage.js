// storage.js - نظام التخزين الآمن والمقاوم لقيود المتصفحات والأطر (Safe Storage Wrapper)
// يمنع أي توقف أو أخطاء برمجية في حال فتح التطبيق داخل iframe أو عبر بروتوكول file:///

(function () {
    'use strict';

    var memStore = {};
    var storageAvailable = false;

    // فحص ما إذا كان localStorage متاحاً ومسموحاً به دون إلقاء استثناءات أمان
    try {
        if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null) {
            var testKey = '__smart_bell_test__';
            window.localStorage.setItem(testKey, '1');
            window.localStorage.removeItem(testKey);
            storageAvailable = true;
        }
    } catch (e) {
        console.warn('LocalStorage is restricted in this context (e.g. file:/// iframe). Using safe in-memory store.', e);
        storageAvailable = false;
    }

    var safeStorage = {
        isAvailable: function () {
            return storageAvailable;
        },
        getItem: function (key) {
            if (storageAvailable) {
                try {
                    return window.localStorage.getItem(key);
                } catch (e) {
                    return Object.prototype.hasOwnProperty.call(memStore, key) ? memStore[key] : null;
                }
            }
            return Object.prototype.hasOwnProperty.call(memStore, key) ? memStore[key] : null;
        },
        setItem: function (key, value) {
            var strVal = String(value);
            memStore[key] = strVal;
            if (storageAvailable) {
                try {
                    window.localStorage.setItem(key, strVal);
                } catch (e) {
                    console.warn('Failed to save to localStorage, cached in memory:', key, e);
                }
            }
        },
        removeItem: function (key) {
            delete memStore[key];
            if (storageAvailable) {
                try {
                    window.localStorage.removeItem(key);
                } catch (e) {
                    // ignore
                }
            }
        },
        clear: function () {
            memStore = {};
            if (storageAvailable) {
                try {
                    window.localStorage.clear();
                } catch (e) {
                    // ignore
                }
            }
        }
    };

    if (typeof window !== 'undefined') {
        window.safeStorage = safeStorage;
    }
})();
