// audio.js - محرك الأصوات والتنبيهات المخصص مع ميزة كتم الأصوات الأخرى وتحميل ملفات MP3
const audioStorage = (typeof window !== 'undefined' && window.safeStorage) ? window.safeStorage : {
    getItem: function(k) { try { return localStorage.getItem(k); } catch(e) { return null; } },
    setItem: function(k, v) { try { localStorage.setItem(k, v); } catch(e) {} },
    removeItem: function(k) { try { localStorage.removeItem(k); } catch(e) {} }
};

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.synth = window.speechSynthesis || null;
        this.arabicVoice = null;
        this.customAudioBuffer = null;
        this.currentAudioSource = null;
        this.masterGain = null;
        this.customAudioElement = new Audio();
        this.customAudioUrl = audioStorage.getItem('smart_custom_audio_data') || null;
        if (this.customAudioUrl) {
            this.customAudioElement.src = this.customAudioUrl;
        }
        this.initVoice();
    }

    initContext() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    initVoice() {
        if (!this.synth) return;
        const loadVoices = () => {
            const voices = this.synth.getVoices();
            this.arabicVoice = voices.find(v => v.lang.startsWith('ar') || v.lang.includes('SA') || v.lang.includes('EG')) || null;
        };
        loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = loadVoices;
        }
    }

    // حفظ ملف صوتي مخصص MP3 تم اختياره من الهاتف
    setCustomAudio(base64Data, filename) {
        this.customAudioUrl = base64Data;
        this.customAudioElement.src = base64Data;
        try {
            audioStorage.setItem('smart_custom_audio_data', base64Data);
            audioStorage.setItem('smart_custom_audio_name', filename);
        } catch (e) {
            console.warn('File too large for storage, keeping in session', e);
        }
    }

    clearCustomAudio() {
        this.customAudioUrl = null;
        this.customAudioElement.src = '';
        audioStorage.removeItem('smart_custom_audio_data');
        audioStorage.removeItem('smart_custom_audio_name');
    }

    // كتم فوري لأي صوت شغال إلى نسبة 0% بسرعة قياسية
    duckAllOtherSounds() {
        if (this.currentAudioSource) {
            try { this.currentAudioSource.stop(); } catch(e){}
        }
        if (this.customAudioElement && !this.customAudioElement.paused) {
            this.customAudioElement.pause();
            this.customAudioElement.currentTime = 0;
        }
        if (this.synth) {
            this.synth.cancel(); // كتم وإلغاء أي نطق جاري فوراً
        }
    }

    // تشغيل جرس المدرسة أو الملف المخصص مع كتم كافة الأصوات الأخرى فوراً
    playSchoolBell(durationSeconds = 5, volume = 1.0) {
        this.duckAllOtherSounds();
        this.initContext();

        // إذا كان المستخدم قد اختار ملف MP3 مخصص من الهاتف
        if (this.customAudioUrl) {
            this.customAudioElement.currentTime = 0;
            this.customAudioElement.volume = Math.min(1.0, volume);
            this.customAudioElement.play().catch(err => {
                console.warn('Custom audio playback failed, falling back to synthesized chime', err);
                this.synthesizeBell(durationSeconds, volume);
            });

            // إيقاف الصوت بعد انقضاء مدة التنبيه المحددة
            setTimeout(() => {
                if (!this.customAudioElement.paused) {
                    this.customAudioElement.pause();
                    this.customAudioElement.currentTime = 0;
                }
            }, durationSeconds * 1000);
            return;
        }

        this.synthesizeBell(durationSeconds, volume);
    }

    synthesizeBell(durationSeconds, volume) {
        const now = this.ctx.currentTime;
        const mainGain = this.ctx.createGain();
        mainGain.gain.setValueAtTime(volume, now);
        mainGain.connect(this.ctx.destination);

        const strikeRate = 18;
        const totalStrikes = Math.floor(durationSeconds * strikeRate);

        for (let i = 0; i < totalStrikes; i++) {
            const strikeTime = now + (i / strikeRate);
            [820, 1280, 2400].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = idx === 0 ? 'sine' : 'triangle';
                osc.frequency.setValueAtTime(freq + (Math.random() * 20 - 10), strikeTime);

                const strikeVol = (1 - (i / totalStrikes) * 0.4) * (idx === 0 ? 0.4 : 0.2);
                gain.gain.setValueAtTime(strikeVol, strikeTime);
                gain.gain.exponentialRampToValueAtTime(0.001, strikeTime + 0.12);

                osc.connect(gain);
                gain.connect(mainGain);

                osc.start(strikeTime);
                osc.stop(strikeTime + 0.15);
            });
        }
    }

    playSoftChime(volume = 0.8) {
        this.duckAllOtherSounds();
        this.initContext();
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50];

        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + (i * 0.1));

            gain.gain.setValueAtTime(0, now + (i * 0.1));
            gain.gain.linearRampToValueAtTime(volume * 0.4, now + (i * 0.1) + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, now + (i * 0.1) + 1.2);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now + (i * 0.1));
            osc.stop(now + (i * 0.1) + 1.3);
        });
    }

    speakArabic(text, onComplete = null) {
        if (!this.synth) {
            if (onComplete) onComplete();
            return;
        }

        this.synth.cancel(); // كتم أي كلام سابق

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA';
        const savedRate = parseFloat(audioStorage.getItem('smart_app_speech_rate') || '0.95');
        utterance.rate = savedRate;
        utterance.pitch = 1.05;

        if (!this.arabicVoice) {
            this.initVoice();
        }
        if (this.arabicVoice) {
            utterance.voice = this.arabicVoice;
        }

        if (onComplete) {
            utterance.onend = onComplete;
            utterance.onerror = onComplete;
        }

        this.synth.speak(utterance);
    }

    playAlertWithVoice(voiceText, playChimeBefore = true, volume = 0.8) {
        this.duckAllOtherSounds();
        if (playChimeBefore) {
            this.playSoftChime(volume);
            setTimeout(() => {
                this.speakArabic(voiceText);
            }, 650);
        } else {
            this.speakArabic(voiceText);
        }
    }
}

window.soundEngine = new SoundEngine();
