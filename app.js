// app.js - محرك المنبه المدرسي المطور بالكامل حسب متطلبات المستخدم بدقة

const storage = (typeof window !== 'undefined' && window.safeStorage) ? window.safeStorage : {
    getItem: function(k) { try { return localStorage.getItem(k); } catch(e) { return null; } },
    setItem: function(k, v) { try { localStorage.setItem(k, v); } catch(e) {} },
    removeItem: function(k) { try { localStorage.removeItem(k); } catch(e) {} },
    clear: function() { try { localStorage.clear(); } catch(e) {} }
};

document.addEventListener('DOMContentLoaded', () => {

    // =========================================================================
    // 1. هيكل البيانات وإدارة التخزين (الأيام، الحصص، الاستراحة، والضبط العام)
    // =========================================================================
    const DAYS_KEYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'];
    const DAYS_NAMES = {
        sat: 'السبت',
        sun: 'الأحد',
        mon: 'الإثنين',
        tue: 'الثلاثاء',
        wed: 'الأربعاء',
        thu: 'الخميس'
    };

    // الإعدادات العامة الافتراضية
    const defaultGeneralSettings = {
        globalStartTime: '07:00',
        globalPeriodDuration: 45,
        globalPeriodCount: 7,
        bellDurationSeconds: 5,
        preAlertMinutes: 5,
        autoBellEnabled: true,
        duckOtherSounds: true,
        activeDays: ['sun', 'mon', 'tue', 'wed', 'thu'], // السبت معطل افتراضياً
        appVolume: 1.0
    };

    let generalSettings = JSON.parse(storage.getItem('smart_general_settings')) || defaultGeneralSettings;

    // تهيئة جداول الأيام (كل يوم له حصصه واستراحته المستقلة)
    let daySchedules = JSON.parse(storage.getItem('smart_day_schedules')) || null;

    if (!daySchedules) {
        daySchedules = {};
        DAYS_KEYS.forEach(day => {
            daySchedules[day] = {
                enabled: generalSettings.activeDays.includes(day),
                customStartTime: null, // إذا كان null يأخذ وقت البداية العام
                breakEnabled: true,
                breakDuration: 20,
                breakAfterPeriod: 3, // الاستراحة بعد الحصة الثالثة
                classes: [] // تبدأ فارغة لتكون الحصص حقيقية يضيفها المستخدم بيده
            };
        });

        // وضع أمثلة أولية ليوم الأحد فقط حتى لا تكون الشاشة ميتة أول مرة، مع زر التصفير
        daySchedules['sun'].classes = [
            { id: 1, name: 'الحصة الأولى', subject: 'رياضيات', room: 'فصل 3/أ', duration: 45, icon: 'purple', iconChar: '📅', enabled: true },
            { id: 2, name: 'الحصة الثانية', subject: 'علوم', room: 'معمل العلوم', duration: 45, icon: 'blue', iconChar: '💼', enabled: true },
            { id: 3, name: 'الحصة الثالثة', subject: 'لغتي', room: 'فصل 3/أ', duration: 40, icon: 'cyan', iconChar: '🏃', enabled: true },
            { id: 4, name: 'الحصة الرابعة', subject: 'قرآن كريم', room: 'المصلى', duration: 35, icon: 'orange', iconChar: '🔔', enabled: true },
            { id: 5, name: 'الحصة الخامسة', subject: 'إنجليزي', room: 'معمل اللغات', duration: 35, icon: 'blue', iconChar: '💼', enabled: true },
            { id: 6, name: 'الحصة السادسة', subject: 'تربية بدنية', room: 'الملعب', duration: 30, icon: 'green', iconChar: '🏃', enabled: true }
        ];
        saveDaySchedules();
    }

    // تنبيهات المشرف المخصصة
    let supervisorAlerts = JSON.parse(storage.getItem('smart_supervisor_alerts')) || [
        { id: 1, type: 'elapsed', minute: 15, text: 'مرت 15 دقيقة', enabled: true },
        { id: 2, type: 'elapsed', minute: 30, text: 'مرت 30 دقيقة', enabled: true },
        { id: 3, type: 'remaining', minute: 5, text: 'متبقي 5 دقائق على نهاية الحصة', enabled: true }
    ];

    let currentDay = storage.getItem('smart_active_day') || 'sun';
    if (!DAYS_KEYS.includes(currentDay)) currentDay = 'sun';

    // متغيرات مؤقت المشرف
    let timerTotalSeconds = 45 * 60;
    let timerElapsedSeconds = 0;
    let timerInterval = null;
    let timerRunning = false;
    let triggeredSupervisorAlerts = new Set();
    let lastRungTimeKey = null;
    let lastPreAlertKey = null;

    // عناصر الواجهة
    const liveTimeClock = document.getElementById('liveTimeClock');
    const liveStatusBanner = document.getElementById('liveStatusBanner');
    const currentDayToggleChk = document.getElementById('currentDayToggleChk');
    const currentDayStateLabel = document.getElementById('currentDayStateLabel');
    const dayDisabledNotice = document.getElementById('dayDisabledNotice');
    const dayBreakCard = document.getElementById('dayBreakCard');
    const breakSummaryText = document.getElementById('breakSummaryText');
    const breakEnableChk = document.getElementById('breakEnableChk');
    const alarmCardsContainer = document.getElementById('alarmCardsContainer');
    const daysBar = document.getElementById('daysBar');

    const bigTimerDisplay = document.getElementById('bigTimerDisplay');
    const elapsedMinsDisplay = document.getElementById('elapsedMinsDisplay');
    const remainingMinsDisplay = document.getElementById('remainingMinsDisplay');
    const neonProgressFill = document.getElementById('neonProgressFill');
    const lessonStageBadge = document.getElementById('lessonStageBadge');
    const timerManualMinutesInput = document.getElementById('timerManualMinutesInput');
    const startTimerBtn = document.getElementById('startTimerBtn');
    const pauseTimerBtn = document.getElementById('pauseTimerBtn');
    const resetTimerBtn = document.getElementById('resetTimerBtn');
    const supervisorAlertsList = document.getElementById('supervisorAlertsList');

    // عناصر الضبط العام
    const globalStartTimeInput = document.getElementById('globalStartTimeInput');
    const globalPeriodDurationInput = document.getElementById('globalPeriodDurationInput');
    const globalPeriodCountInput = document.getElementById('globalPeriodCountInput');
    const configPreAlertSelect = document.getElementById('configPreAlertSelect');
    const configAutoBellChk = document.getElementById('configAutoBellChk');
    const bellDurationSelect = document.getElementById('bellDurationSelect');
    const duckOtherSoundsChk = document.getElementById('duckOtherSoundsChk');
    const configVolumeSlider = document.getElementById('configVolumeSlider');
    const volumePercentDisplay = document.getElementById('volumePercentDisplay');
    const configVoiceSelect = document.getElementById('configVoiceSelect');
    const toastContainer = document.getElementById('toastContainer');

    // =========================================================================
    // 2. دوال الحفظ والتحميل
    // =========================================================================
    function saveGeneralSettings() {
        storage.setItem('smart_general_settings', JSON.stringify(generalSettings));
    }

    function saveDaySchedules() {
        storage.setItem('smart_day_schedules', JSON.stringify(daySchedules));
    }

    function saveSupervisorAlerts() {
        storage.setItem('smart_supervisor_alerts', JSON.stringify(supervisorAlerts));
    }

    // =========================================================================
    // 3. التوقيت بنظام 12 ساعة مطابق للهاتف تماماً
    // =========================================================================
    function get12HourFormatted(dateObj) {
        let h = dateObj.getHours();
        const m = String(dateObj.getMinutes()).padStart(2, '0');
        const s = String(dateObj.getSeconds()).padStart(2, '0');
        const ampm = h >= 12 ? 'م' : 'ص';
        h = h % 12 || 12;
        const hStr = String(h).padStart(2, '0');
        return {
            fullWithSeconds: `${hStr}:${m}:${s} ${ampm}`,
            timeOnly: `${hStr}:${m}`,
            ampm: ampm
        };
    }

    function convert24to12(time24) {
        if (!time24) return { time: '--:--', ampm: 'ص' };
        const [h24, min] = time24.split(':').map(Number);
        const ampm = h24 >= 12 ? 'م' : 'ص';
        const h12 = h24 % 12 || 12;
        return {
            time: `${String(h12).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
            ampm: ampm
        };
    }

    // =========================================================================
    // نافذة تأكيد الإجراءات والحذف المخصصة الفاخرة
    // =========================================================================
    function showConfirmDialog(title, message, onApprove) {
        const modal = document.getElementById('confirmActionModal');
        if (!modal) {
            if (confirm(`${title}\n${message}`)) {
                if (onApprove) onApprove();
            }
            return;
        }

        document.getElementById('confirmModalTitle').textContent = title || '⚠️ تأكيد الحذف';
        document.getElementById('confirmModalMessage').textContent = message || 'هل أنت متأكد من رغبتك في إتمام هذا الإجراء؟';
        modal.classList.add('open');

        const approveBtn = document.getElementById('confirmModalApproveBtn');
        const cancelBtn = document.getElementById('confirmModalCancelBtn');

        const cleanup = () => {
            modal.classList.remove('open');
            approveBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        cancelBtn.onclick = () => {
            cleanup();
        };

        approveBtn.onclick = () => {
            cleanup();
            if (onApprove) onApprove();
        };
    }

    // تحديث الساعة الحية ومراقبة التنبيهات كل ثانية
    function updateClock() {
        const now = new Date();
        const formatted12 = get12HourFormatted(now);
        liveTimeClock.textContent = formatted12.fullWithSeconds;

        const current24H = String(now.getHours()).padStart(2, '0');
        const currentMin = String(now.getMinutes()).padStart(2, '0');
        const currentSec = now.getSeconds();
        const timeKey = `${current24H}:${currentMin}`;

        // فحص التنبيهات والجدولة المسبقة في كل ثانية مع ضمان عدم التكرار
        checkCurrentDayAlarms(now, timeKey);
        checkAutoScheduledPresetTrigger(now, timeKey);
    }
    setInterval(updateClock, 1000);
    updateClock();

    // =========================================================================
    // 4. حساب مواعيد الحصص والاستراحة لليوم المختار
    // =========================================================================
    function getCalculatedTimelineForDay(dayKey) {
        const dayData = daySchedules[dayKey];
        if (!dayData || !dayData.enabled) return [];

        const startTimeStr = dayData.customStartTime || generalSettings.globalStartTime || '07:00';
        const [startH, startM] = startTimeStr.split(':').map(Number);
        let currentTotalMins = (startH * 60) + startM;

        const resultTimeline = [];
        const classesList = dayData.classes || [];

        classesList.forEach((cls, index) => {
            const classNumber = index + 1;

            // حساب وقت بداية الحصة
            const startHStr = String(Math.floor(currentTotalMins / 60) % 24).padStart(2, '0');
            const startMStr = String(currentTotalMins % 60).padStart(2, '0');
            const classStartTime = `${startHStr}:${startMStr}`;

            currentTotalMins += parseInt(cls.duration, 10) || generalSettings.globalPeriodDuration;

            // حساب وقت نهاية الحصة
            const endHStr = String(Math.floor(currentTotalMins / 60) % 24).padStart(2, '0');
            const endMStr = String(currentTotalMins % 60).padStart(2, '0');
            const classEndTime = `${endHStr}:${endMStr}`;

            resultTimeline.push({
                isBreak: false,
                classNumber: classNumber,
                ...cls,
                startTime: classStartTime,
                endTime: classEndTime,
                startTotalMins: currentTotalMins - cls.duration,
                endTotalMins: currentTotalMins
            });

            // إدراج الاستراحة بعد الحصة المحددة إذا كانت مفعلة
            if (dayData.breakEnabled && dayData.breakAfterPeriod === classNumber && dayData.breakDuration > 0) {
                const bStartHStr = String(Math.floor(currentTotalMins / 60) % 24).padStart(2, '0');
                const bStartMStr = String(currentTotalMins % 60).padStart(2, '0');
                const breakStartTime = `${bStartHStr}:${bStartMStr}`;

                currentTotalMins += parseInt(dayData.breakDuration, 10);

                const bEndHStr = String(Math.floor(currentTotalMins / 60) % 24).padStart(2, '0');
                const bEndMStr = String(currentTotalMins % 60).padStart(2, '0');
                const breakEndTime = `${bEndHStr}:${bEndMStr}`;

                resultTimeline.push({
                    isBreak: true,
                    id: `break_${dayKey}_${classNumber}`,
                    name: 'استراحة / فسحة',
                    subject: 'استراحة المعلمين والطلاب',
                    duration: dayData.breakDuration,
                    startTime: breakStartTime,
                    endTime: breakEndTime,
                    startTotalMins: currentTotalMins - dayData.breakDuration,
                    endTotalMins: currentTotalMins,
                    icon: 'magenta',
                    iconChar: '☕',
                    enabled: true
                });
            }
        });

        return resultTimeline;
    }

    // =========================================================================
    // 5. رسم واجهة الحصص والبطاقات لليوم المحدد
    // =========================================================================
    function renderDayView() {
        const dayData = daySchedules[currentDay];
        if (!dayData) return;

        // تحديث شريط الأيام بالأعلى
        document.querySelectorAll('.day-chip').forEach(chip => {
            const d = chip.getAttribute('data-day');
            chip.classList.toggle('active', d === currentDay);
            // تمييز الأيام المعطلة
            if (daySchedules[d] && !daySchedules[d].enabled) {
                chip.style.opacity = '0.45';
                chip.style.textDecoration = 'line-through';
            } else {
                chip.style.opacity = '1';
                chip.style.textDecoration = 'none';
            }
        });

        // حالة اليوم الحالي (مفعل أو معطل)
        currentDayToggleChk.checked = dayData.enabled;
        currentDayStateLabel.textContent = dayData.enabled ? 'يوم دراسي نشط' : 'معطل (إجازة)';
        currentDayStateLabel.style.color = dayData.enabled ? '#34d399' : '#f87171';

        if (!dayData.enabled) {
            dayDisabledNotice.style.display = 'block';
            dayBreakCard.style.display = 'none';
            alarmCardsContainer.style.display = 'none';
            document.getElementById('addPeriodQuickBtn').style.display = 'none';
            liveStatusBanner.textContent = `🏖️ يوم ${DAYS_NAMES[currentDay]} محدد كإجازة`;
            return;
        }

        dayDisabledNotice.style.display = 'none';
        dayBreakCard.style.display = 'flex';
        alarmCardsContainer.style.display = 'flex';
        document.getElementById('addPeriodQuickBtn').style.display = 'inline-flex';

        // تحديث كرت الاستراحة
        breakEnableChk.checked = dayData.breakEnabled;
        breakSummaryText.textContent = dayData.breakEnabled 
            ? `مفعلة (${dayData.breakDuration} دقيقة بعد الحصة ${dayData.breakAfterPeriod})`
            : 'ملغاة لهذا اليوم';

        // حساب الجدول الزمني لليوم
        const timeline = getCalculatedTimelineForDay(currentDay);
        alarmCardsContainer.innerHTML = '';

        if (timeline.length === 0) {
            alarmCardsContainer.innerHTML = `
                <div style="text-align: center; padding: 2.5rem 1rem; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px dashed var(--border-card);">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">📝</div>
                    <h3 style="font-size: 1.1rem; color: white; margin-bottom: 0.3rem;">لا توجد حصص مضافة ليوم ${DAYS_NAMES[currentDay]}</h3>
                    <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1rem;">
                        أضف حصصك الفعلية بيدك بالضغط على الزر أدناه، أو طبّق الضبط العام من صفحة الجدول.
                    </p>
                </div>
            `;
            liveStatusBanner.textContent = `لا توجد حصص مجدولة ليوم ${DAYS_NAMES[currentDay]}`;
            return;
        }

        const now = new Date();
        const nowTotalMins = (now.getHours() * 60) + now.getMinutes();

        let activeFound = null;
        let nextFound = null;

        timeline.forEach((item) => {
            const isCurrent = nowTotalMins >= item.startTotalMins && nowTotalMins < item.endTotalMins;
            const isUpcoming = nowTotalMins < item.startTotalMins && !nextFound;

            if (isCurrent) activeFound = item;
            if (isUpcoming) nextFound = item;

            const time12 = convert24to12(item.startTime);
            const iconColorClass = `icon-${item.icon || 'purple'}`;
            const tagColorClass = `tag-${item.icon || 'purple'}`;

            const card = document.createElement('div');
            card.className = `alarm-card ${isCurrent ? 'is-active-now' : ''}`;
            card.id = `item-card-${item.id}`;

            const subInfo = item.isBreak 
                ? `استراحة • ${item.duration} دقيقة (إلى ${convert24to12(item.endTime).time} ${convert24to12(item.endTime).ampm})`
                : `${item.room || 'الفصل'} • ${item.duration} دقيقة (إلى ${convert24to12(item.endTime).time} ${convert24to12(item.endTime).ampm})`;

            card.innerHTML = `
                <div class="card-left-section" style="flex: 1;">
                    <div class="card-icon-box ${iconColorClass}">
                        ${item.iconChar || (item.isBreak ? '☕' : '📅')}
                    </div>
                    <div class="card-details">
                        <div class="card-time-row">
                            <span class="card-time">${time12.time}</span>
                            <span class="card-ampm">${time12.ampm}</span>
                        </div>
                        <div class="card-tag ${tagColorClass}">
                            ${item.subject || item.name}
                        </div>
                        <div class="card-subtext">
                            ${item.name} • ${subInfo}
                        </div>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 0.6rem;">
                    ${!item.isBreak ? `
                    <button class="icon-btn-round edit-class-quick-btn" data-id="${item.id}" style="width: 34px; height: 34px; font-size: 0.85rem;" title="تعديل مدة أو تفاصيل الحصة">
                        ✏️
                    </button>
                    <button class="icon-btn-round delete-class-quick-btn" data-id="${item.id}" style="width: 34px; height: 34px; font-size: 0.85rem; color: var(--accent-red);" title="حذف الحصة">
                        🗑️
                    </button>
                    <label class="glow-switch" title="تفعيل أو كتم التنبيه لهذه الحصة">
                        <input type="checkbox" class="class-toggle-chk" data-id="${item.id}" ${item.enabled !== false ? 'checked' : ''}>
                        <span class="glow-slider"></span>
                    </label>
                    ` : `
                    <span style="font-size: 0.8rem; color: #e879f9; font-weight: 700; padding: 0.3rem 0.6rem; background: rgba(217, 70, 239, 0.15); border-radius: 10px;">
                        فسحة
                    </span>
                    `}
                </div>
            `;

            // عند النقر على محتوى البطاقة (وليس الأزرار) نفتح مؤقت المشرف للحصة
            card.querySelector('.card-left-section').addEventListener('click', () => {
                if (!item.isBreak) {
                    setupTimerForClass(item);
                }
            });

            alarmCardsContainer.appendChild(card);
        });

        // ربط أزرار التعديل والحذف والسويتشات
        document.querySelectorAll('.class-toggle-chk').forEach(chk => {
            chk.addEventListener('change', (e) => {
                e.stopPropagation();
                const id = parseInt(chk.getAttribute('data-id'), 10);
                const cls = dayData.classes.find(c => c.id === id);
                if (cls) {
                    cls.enabled = chk.checked;
                    saveDaySchedules();
                    showToast(cls.enabled ? `تم تفعيل منبه ${cls.name}` : `تم كتم منبه ${cls.name}`, 'info');
                }
            });
        });

        document.querySelectorAll('.delete-class-quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.getAttribute('data-id'), 10);
                const cls = dayData.classes.find(c => c.id === id);
                const clsName = cls ? `${cls.name} (${cls.subject || 'بدون مادة'})` : 'هذه الحصة';
                showConfirmDialog(
                    '⚠️ تأكيد حذف الحصة',
                    `هل أنت متأكد من رغبتك في حذف "${clsName}" من جدول يوم ${DAYS_NAMES[currentDay]}؟`,
                    () => {
                        dayData.classes = dayData.classes.filter(c => c.id !== id);
                        saveDaySchedules();
                        renderDayView();
                        showToast(`تم حذف ${clsName} بنجاح`, 'success');
                    }
                );
            });
        });

        document.querySelectorAll('.edit-class-quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.getAttribute('data-id'), 10);
                const cls = dayData.classes.find(c => c.id === id);
                if (cls) {
                    openEditClassModal(cls);
                }
            });
        });

        // تحديث لافتة الحالة الحية
        if (activeFound) {
            const minsLeft = activeFound.endTotalMins - nowTotalMins;
            liveStatusBanner.innerHTML = `🔴 الحصة الحالية: <span style="color: #c084fc;">${activeFound.subject || activeFound.name}</span> (متبقي ${minsLeft} د)`;
        } else if (nextFound) {
            const minsUntil = nextFound.startTotalMins - nowTotalMins;
            liveStatusBanner.innerHTML = `⏳ القادمة: <span style="color: #22d3ee;">${nextFound.subject || nextFound.name}</span> بعد ${minsUntil} دقيقة`;
        } else {
            liveStatusBanner.innerHTML = `🌙 انتهت أوقات الحصص المجدولة ليوم ${DAYS_NAMES[currentDay]}`;
        }
    }

    // إعداد مؤقت المشرف لحصة محددة
    function setupTimerForClass(cls) {
        timerDurationMinutes = cls.duration;
        timerManualMinutesInput.value = cls.duration;
        timerTotalSeconds = cls.duration * 60;
        timerElapsedSeconds = 0;
        triggeredSupervisorAlerts.clear();
        document.getElementById('activeClassTitle').textContent = `${cls.name}: ${cls.subject || ''}`;
        updateTimerDisplay();
        navItems[1].click(); // الانتقال لتبويب المشرف
        showToast(`تم تجهيز مؤقت المشرف لـ ${cls.name} (${cls.duration} دقيقة)`, 'success');
    }

    // =========================================================================
    // 6. مراقبة التنبيهات المسبقة ورنين جرس المدرسة لليوم الحي
    // =========================================================================
    function checkCurrentDayAlarms(now, currentTimeKey) {
        // إذا كان نظام الأجراس معطلاً رئيسياً (وضع الغياب / الإجازة) لا تصدر أي تنبيهات
        if (generalSettings.masterAlarmsActive === false) return;

        // نحدد مفتاح اليوم بحسب يوم الجهاز الفعلي
        const jsDayIndex = now.getDay(); // 0 = الأحد, 1 = الإثنين ... 6 = السبت
        const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const todayKey = dayMap[jsDayIndex];

        // إذا كان اليوم الجمعة أو يوماً معطلاً لا نطلق المنبه
        if (!daySchedules[todayKey] || !daySchedules[todayKey].enabled) return;

        const nowTotalMins = (now.getHours() * 60) + now.getMinutes();
        const timeline = getCalculatedTimelineForDay(todayKey);

        timeline.forEach(item => {
            if (item.enabled === false) return;

            // 1. التنبيه الاستباقي قبل بداية الحصة التالية (حرية تحديد الوقت وزمن الرنين للمعلم)
            const preMins = (generalSettings.preClassReminderEnabled !== false) ? (generalSettings.preClassReminderMinutes || 3) : 0;
            if (preMins > 0 && !item.isBreak) {
                const triggerMins = item.startTotalMins - preMins;
                if (nowTotalMins === triggerMins && lastPreAlertKey !== `pre_${item.id}_${currentTimeKey}`) {
                    lastPreAlertKey = `pre_${item.id}_${currentTimeKey}`;
                    const ringDur = generalSettings.preClassRingDuration || 3;
                    triggerPreClassAlert(item, preMins, ringDur);
                }
            }

            // 2. جرس بداية الحصة الأساسي (بالثانية وبالضبط على الوقت المحدد لبداية الحصة التالية)
            if (generalSettings.autoBellEnabled && item.startTime === currentTimeKey && lastRungTimeKey !== `start_${item.id}_${currentTimeKey}`) {
                lastRungTimeKey = `start_${item.id}_${currentTimeKey}`;
                triggerBell(`بداية ${item.name}: ${item.subject || ''}`);
                if (todayKey === currentDay) renderDayView();
            }

            // 3. جرس نهاية الحصة
            if (generalSettings.autoBellEnabled && item.endTime === currentTimeKey && lastRungTimeKey !== `end_${item.id}_${currentTimeKey}`) {
                lastRungTimeKey = `end_${item.id}_${currentTimeKey}`;
                triggerBell(`نهاية ${item.name}`);
                if (todayKey === currentDay) renderDayView();
            }
        });
    }

    function triggerPreClassAlert(item, mins, ringDur = 3) {
        const text = `تذكير: متبقي ${mins} دقائق على بداية ${item.name} (${item.subject || ''}) في ${item.room || 'فصلك'}`;
        showToast(`⏳ ${text}`, 'info');

        if (generalSettings.duckOtherSounds && window.soundEngine) {
            window.soundEngine.duckAllOtherSounds();
        }

        if (window.soundEngine) {
            window.soundEngine.playSchoolBell(ringDur, generalSettings.appVolume);
            setTimeout(() => {
                window.soundEngine.speakArabic(text);
            }, (ringDur * 1000) + 400);
        }

        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('المنبه المدرسي الذكي', { body: text });
        }
    }

    function triggerBell(reason) {
        showToast(`🔔 جرس المدرسة: ${reason}`, 'success');
        if (window.soundEngine) {
            window.soundEngine.playSchoolBell(generalSettings.bellDurationSeconds, generalSettings.appVolume);
        }
    }

    // =========================================================================
    // 7. مؤقت المشرف وإدارة أوقات الحصة يدوياً
    // =========================================================================
    function formatTimeSecs(totalSecs) {
        const m = Math.floor(Math.max(0, totalSecs) / 60);
        const s = Math.max(0, totalSecs) % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function updateTimerDisplay() {
        const remainingSecs = Math.max(0, timerTotalSeconds - timerElapsedSeconds);
        bigTimerDisplay.textContent = formatTimeSecs(remainingSecs);
        elapsedMinsDisplay.textContent = formatTimeSecs(timerElapsedSeconds);
        remainingMinsDisplay.textContent = formatTimeSecs(remainingSecs);

        const pct = Math.min(100, (timerElapsedSeconds / timerTotalSeconds) * 100);
        neonProgressFill.style.width = `${pct}%`;

        const elapsedMins = Math.floor(timerElapsedSeconds / 60);
        const totalMins = Math.max(1, Math.floor(timerTotalSeconds / 60));

        const stg1End = Math.max(2, Math.round(totalMins * 0.12));
        const stg2End = Math.round(totalMins * 0.55);
        const stg3End = Math.round(totalMins * 0.85);

        document.getElementById('stg1Time').textContent = `0-${stg1End} د`;
        document.getElementById('stg2Time').textContent = `${stg1End}-${stg2End} د`;
        document.getElementById('stg3Time').textContent = `${stg2End}-${stg3End} د`;
        document.getElementById('stg4Time').textContent = `${stg3End}-${totalMins} د`;

        ['stg1', 'stg2', 'stg3', 'stg4'].forEach(id => document.getElementById(id).classList.remove('active'));

        if (elapsedMins < stg1End) {
            lessonStageBadge.textContent = '1. التهيئة والتمهيد وعرض الأهداف';
            document.getElementById('stg1').classList.add('active');
        } else if (elapsedMins < stg2End) {
            lessonStageBadge.textContent = '2. الشرح والمناقشة والتفاعل الصفي';
            document.getElementById('stg2').classList.add('active');
        } else if (elapsedMins < stg3End) {
            lessonStageBadge.textContent = '3. الأنشطة والتعلم الجماعي/الفردي';
            document.getElementById('stg3').classList.add('active');
        } else {
            lessonStageBadge.textContent = '4. الغلق والتقويم النهائي والتكليفات';
            document.getElementById('stg4').classList.add('active');
        }

        checkSupervisorAlertsTrigger(timerElapsedSeconds, remainingSecs);
    }

    function checkSupervisorAlertsTrigger(elapsedSecs, remainingSecs) {
        if (!timerRunning) return;
        const elapsedMins = Math.floor(elapsedSecs / 60);
        const remainingMins = Math.floor(remainingSecs / 60);
        const secInMin = elapsedSecs % 60;

        supervisorAlerts.forEach(alert => {
            if (!alert.enabled) return;
            let isHit = false;
            let key = '';

            if (alert.type === 'elapsed' && elapsedMins === alert.minute && secInMin === 0) {
                isHit = true;
                key = `elapsed_${alert.minute}`;
            } else if (alert.type === 'remaining' && remainingMins === alert.minute && secInMin === 0) {
                isHit = true;
                key = `remaining_${alert.minute}`;
            }

            if (isHit && !triggeredSupervisorAlerts.has(key)) {
                triggeredSupervisorAlerts.add(key);
                fireSupervisorAlert(alert);
            }
        });
    }

    function fireSupervisorAlert(alert) {
        showToast(`🗣️ تنبيه المشرف: "${alert.text}"`, 'info');

        const el = document.getElementById(`sup-alert-${alert.id}`);
        if (el) {
            el.style.borderColor = 'var(--accent-purple)';
            el.style.background = 'rgba(139, 92, 246, 0.35)';
            setTimeout(() => {
                el.style.borderColor = '';
                el.style.background = '';
            }, 10000);
        }

        if (generalSettings.duckOtherSounds && window.soundEngine) {
            window.soundEngine.duckAllOtherSounds();
        }

        if (window.soundEngine) {
            window.soundEngine.playAlertWithVoice(alert.text, true, generalSettings.appVolume);
        }
    }

    startTimerBtn.addEventListener('click', () => {
        if (window.soundEngine) window.soundEngine.initContext();
        timerRunning = true;
        startTimerBtn.disabled = true;
        pauseTimerBtn.disabled = false;
        timerManualMinutesInput.disabled = true;

        if (!timerInterval) {
            timerInterval = setInterval(() => {
                timerElapsedSeconds++;
                updateTimerDisplay();

                if (timerElapsedSeconds >= timerTotalSeconds) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    timerRunning = false;
                    startTimerBtn.disabled = false;
                    pauseTimerBtn.disabled = true;
                    timerManualMinutesInput.disabled = false;

                    showToast('🎉 انتهى زمن الحصة بالكامل!', 'success');
                    if (window.soundEngine) {
                        window.soundEngine.playSchoolBell(generalSettings.bellDurationSeconds, generalSettings.appVolume);
                        setTimeout(() => {
                            window.soundEngine.speakArabic('انتهى وقت الحصة تماماً، شكراً لكم');
                        }, 3000);
                    }
                }
            }, 1000);
        }
    });

    pauseTimerBtn.addEventListener('click', () => {
        timerRunning = false;
        clearInterval(timerInterval);
        timerInterval = null;
        startTimerBtn.disabled = false;
        pauseTimerBtn.disabled = true;
        showToast('تم إيقاف المؤقت مؤقتاً', 'info');
    });

    resetTimerBtn.addEventListener('click', () => {
        clearInterval(timerInterval);
        timerInterval = null;
        timerRunning = false;
        timerElapsedSeconds = 0;
        triggeredSupervisorAlerts.clear();
        startTimerBtn.disabled = false;
        pauseTimerBtn.disabled = true;
        timerManualMinutesInput.disabled = false;
        updateTimerDisplay();
        showToast('تمت إعادة ضبط المؤقت', 'info');
    });

    timerManualMinutesInput.addEventListener('change', () => {
        const mins = parseInt(timerManualMinutesInput.value, 10) || 45;
        timerTotalSeconds = mins * 60;
        timerElapsedSeconds = 0;
        triggeredSupervisorAlerts.clear();
        updateTimerDisplay();
    });

    // =========================================================================
    // 7.1. ميزة الضبط المسبق التلقائي للحصة (بدون الحاجة لفتح الجوال والضغط على البدء)
    // =========================================================================
    const timerModeManualBtn = document.getElementById('timerModeManualBtn');
    const timerModeScheduledBtn = document.getElementById('timerModeScheduledBtn');
    const scheduledPresetCard = document.getElementById('scheduledPresetCard');
    const enableAutoScheduleChk = document.getElementById('enableAutoScheduleChk');
    const autoScheduleStateText = document.getElementById('autoScheduleStateText');
    const presetTargetDaySelect = document.getElementById('presetTargetDaySelect');
    const presetTargetClassSelect = document.getElementById('presetTargetClassSelect');
    const customTimeRangeBox = document.getElementById('customTimeRangeBox');
    const presetManualStartInput = document.getElementById('presetManualStartInput');
    const presetManualEndInput = document.getElementById('presetManualEndInput');
    const autoScheduleBanner = document.getElementById('autoScheduleBanner');

    let autoScheduledPreset = JSON.parse(storage.getItem('smart_auto_schedule_preset')) || {
        enabled: false,
        day: 'thu',
        classId: 'custom',
        startTime: '08:35',
        endTime: '09:15',
        duration: 40,
        className: 'الحصة المستهدفة'
    };

    let lastAutoScheduledDateKey = null;

    // تبديل الأزرار بين البدء الفوري والجدولة المسبقة
    timerModeManualBtn.addEventListener('click', () => {
        timerModeManualBtn.classList.add('active');
        timerModeScheduledBtn.classList.remove('active');
        scheduledPresetCard.style.display = 'none';
    });

    timerModeScheduledBtn.addEventListener('click', () => {
        timerModeScheduledBtn.classList.add('active');
        timerModeManualBtn.classList.remove('active');
        scheduledPresetCard.style.display = 'block';
        updatePresetClassDropdown(presetTargetDaySelect.value);
    });

    function updatePresetClassDropdown(dayKey) {
        presetTargetClassSelect.innerHTML = '';
        let actualDayKey = dayKey;
        if (dayKey === 'today' || dayKey === 'all') {
            const dMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
            actualDayKey = dMap[new Date().getDay()];
        }
        const timeline = getCalculatedTimelineForDay(actualDayKey);
        const classesOnly = timeline.filter(item => !item.isBreak);

        classesOnly.forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c.id;
            const t12Start = convert24to12(c.startTime);
            const t12End = convert24to12(c.endTime);
            opt.textContent = `${c.name}: ${c.subject || ''} (${t12Start.time} ${t12Start.ampm} - ${t12End.time} ${t12End.ampm}) • ${c.duration}د`;
            presetTargetClassSelect.appendChild(opt);
        });

        const customOpt = document.createElement('option');
        customOpt.value = 'custom';
        customOpt.textContent = '✏️ تحديد وقت بداية ونهاية مخصص يدوياً...';
        presetTargetClassSelect.appendChild(customOpt);

        if (autoScheduledPreset.classId && Array.from(presetTargetClassSelect.options).some(o => o.value == autoScheduledPreset.classId)) {
            presetTargetClassSelect.value = autoScheduledPreset.classId;
        } else if (classesOnly.length > 0) {
            presetTargetClassSelect.value = classesOnly[0].id;
        } else {
            presetTargetClassSelect.value = 'custom';
        }

        applyPresetSelection();
    }

    function applyPresetSelection() {
        const dayKey = presetTargetDaySelect.value;
        const selectedVal = presetTargetClassSelect.value;
        let actualDayKey = dayKey;
        if (dayKey === 'today' || dayKey === 'all') {
            const dMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
            actualDayKey = dMap[new Date().getDay()];
        }

        if (selectedVal === 'custom') {
            customTimeRangeBox.style.display = 'block';
            const [sh, sm] = presetManualStartInput.value.split(':').map(Number);
            const [eh, em] = presetManualEndInput.value.split(':').map(Number);
            let dur = (eh * 60 + em) - (sh * 60 + sm);
            if (dur <= 0) dur = 40;

            autoScheduledPreset.day = dayKey;
            autoScheduledPreset.classId = 'custom';
            autoScheduledPreset.startTime = presetManualStartInput.value;
            autoScheduledPreset.endTime = presetManualEndInput.value;
            autoScheduledPreset.duration = dur;
            autoScheduledPreset.className = `حصة المشرف المخصصة (${convert24to12(autoScheduledPreset.startTime).time} ${convert24to12(autoScheduledPreset.startTime).ampm})`;

            timerManualMinutesInput.value = dur;
            timerTotalSeconds = dur * 60;
            updateTimerDisplay();

            const dayLabel = (dayKey === 'today') ? 'اليوم' : ((dayKey === 'all') ? 'كل يوم' : DAYS_NAMES[dayKey]);
            autoScheduleBanner.innerHTML = `🟢 مجدولة: ستبدأ الحصة تلقائياً الساعة <strong>${convert24to12(autoScheduledPreset.startTime).time} ${convert24to12(autoScheduledPreset.startTime).ampm}</strong> (<strong>${dayLabel}</strong>) وتطلق تنبيهاتك المحددة بالأسفل!`;
        } else {
            customTimeRangeBox.style.display = 'none';
            const timeline = getCalculatedTimelineForDay(actualDayKey);
            const cls = timeline.find(item => item.id == selectedVal);
            if (cls) {
                autoScheduledPreset.day = dayKey;
                autoScheduledPreset.classId = cls.id;
                autoScheduledPreset.startTime = cls.startTime;
                autoScheduledPreset.endTime = cls.endTime;
                autoScheduledPreset.duration = cls.duration;
                autoScheduledPreset.className = `${cls.name}: ${cls.subject || ''}`;

                timerManualMinutesInput.value = cls.duration;
                timerTotalSeconds = cls.duration * 60;
                document.getElementById('activeClassTitle').textContent = autoScheduledPreset.className;
                updateTimerDisplay();

                const tStart = convert24to12(cls.startTime);
                const tEnd = convert24to12(cls.endTime);
                const dayLabel = (dayKey === 'today') ? 'اليوم' : ((dayKey === 'all') ? 'كل يوم' : DAYS_NAMES[dayKey]);
                autoScheduleBanner.innerHTML = `🟢 مجدولة: <strong>${cls.name} (${cls.subject || ''})</strong> (<strong>${dayLabel}</strong>) ستبدأ تلقائياً (${tStart.time} ${tStart.ampm} إلى ${tEnd.time} ${tEnd.ampm}) وتطلق التنبيهات دون لمس الجوال!`;
            }
        }

        saveAutoScheduledPreset();
    }

    function saveAutoScheduledPreset() {
        storage.setItem('smart_auto_schedule_preset', JSON.stringify(autoScheduledPreset));
        enableAutoScheduleChk.checked = autoScheduledPreset.enabled;
        autoScheduleStateText.textContent = autoScheduledPreset.enabled ? 'مفعلة وتنتظر الوقت' : 'معطلة';
        autoScheduleStateText.style.color = autoScheduledPreset.enabled ? '#34d399' : 'var(--text-muted)';
    }

    presetTargetDaySelect.addEventListener('change', () => {
        updatePresetClassDropdown(presetTargetDaySelect.value);
    });

    presetTargetClassSelect.addEventListener('change', () => {
        applyPresetSelection();
    });

    presetManualStartInput.addEventListener('change', () => {
        autoScheduledPreset.enabled = true;
        applyPresetSelection();
    });
    presetManualEndInput.addEventListener('change', () => {
        autoScheduledPreset.enabled = true;
        applyPresetSelection();
    });

    enableAutoScheduleChk.addEventListener('change', () => {
        autoScheduledPreset.enabled = enableAutoScheduleChk.checked;
        saveAutoScheduledPreset();
        if (autoScheduledPreset.enabled) {
            showToast('✅ تم تفعيل الجدولة الآلية بنجاح! سيبدأ المؤقت وتنبيهاتك تلقائياً عند حلول موعد الحصة.', 'success');
        } else {
            showToast('تم تعطيل الجدولة الآلية.', 'info');
        }
    });

    function autoTriggerScheduledClass() {
        showToast(`🚀 بدأت ${autoScheduledPreset.className} تلقائياً بدون لمس الجوال!`, 'success');
        document.getElementById('activeClassTitle').textContent = `${autoScheduledPreset.className} (بدء تلقائي)`;
        timerDurationMinutes = autoScheduledPreset.duration;
        timerManualMinutesInput.value = autoScheduledPreset.duration;
        timerTotalSeconds = autoScheduledPreset.duration * 60;
        timerElapsedSeconds = 0;
        triggeredSupervisorAlerts.clear();
        updateTimerDisplay();

        if (generalSettings.duckOtherSounds && window.soundEngine) {
            window.soundEngine.duckAllOtherSounds();
        }

        if (window.soundEngine) {
            window.soundEngine.playSchoolBell(generalSettings.bellDurationSeconds, generalSettings.appVolume);
            setTimeout(() => {
                window.soundEngine.speakArabic(`بدأت ${autoScheduledPreset.className}، تم تفعيل تنبيهات إدارة الحصة.`);
            }, 3000);
        }

        // إطلاق العد التنازلي فورياً
        startTimerBtn.click();
    }

    function checkAutoScheduledPresetTrigger(now, timeKey) {
        if (!autoScheduledPreset || !autoScheduledPreset.enabled || timerRunning) return;

        const jsDayIdx = now.getDay();
        const dMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const todayK = dMap[jsDayIdx];

        // هل اليوم يطابق (اليوم الحالي أو كل الأيام أو اليوم المختار بالاسم)
        const dayMatches = (!autoScheduledPreset.day || 
                            autoScheduledPreset.day === 'today' || 
                            autoScheduledPreset.day === 'all' || 
                            autoScheduledPreset.day === todayK);

        // توحيد صيغة التوقيت لضمان مطابقة 8:25 مع 08:25
        let targetTime = autoScheduledPreset.startTime || '';
        if (targetTime.includes(':')) {
            const parts = targetTime.split(':').map(p => String(p).trim().padStart(2, '0'));
            targetTime = `${parts[0]}:${parts[1]}`;
        }

        if (dayMatches && timeKey === targetTime) {
            const dateKey = `${now.toDateString()}_${timeKey}`;
            if (lastAutoScheduledDateKey !== dateKey) {
                lastAutoScheduledDateKey = dateKey;
                autoTriggerScheduledClass();
            }
        }
    }

    // التهيئة المسبقة لحقول الجدولة
    presetTargetDaySelect.value = autoScheduledPreset.day || 'today';
    presetManualStartInput.value = autoScheduledPreset.startTime || '08:25';
    presetManualEndInput.value = autoScheduledPreset.endTime || '09:05';
    updatePresetClassDropdown(presetTargetDaySelect.value);
    saveAutoScheduledPreset();

    // =========================================================================
    // 8. رسم وإدارة تنبيهات المشرف اليدوية
    // =========================================================================
    function renderSupervisorAlerts() {
        supervisorAlertsList.innerHTML = '';
        if (supervisorAlerts.length === 0) {
            supervisorAlertsList.innerHTML = `
                <div style="text-align: center; padding: 1.5rem; background: rgba(255, 255, 255, 0.03); border-radius: var(--radius-lg); border: 1px dashed var(--border-card); color: var(--text-muted); font-size: 0.85rem;">
                    لا توجد تنبيهات حالياً. اضغط على <strong>＋ إضافة تذكير</strong> لإضافة تنبيهاتك حسب رغبتك (تنبيه واحد أو أكثر).
                </div>
            `;
            return;
        }

        supervisorAlerts.forEach(alert => {
            const card = document.createElement('div');
            card.id = `sup-alert-${alert.id}`;
            card.className = 'alarm-card';
            card.style.padding = '0.85rem 1rem';

            const badgeText = alert.type === 'elapsed' ? `بعد ${alert.minute} د` : `متبقي ${alert.minute} د`;
            const typeClass = alert.type === 'elapsed' ? 'tag-purple' : 'tag-orange';

            card.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span style="background: rgba(139, 92, 246, 0.2); color: #c084fc; font-weight: 800; font-size: 0.85rem; padding: 0.35rem 0.65rem; border-radius: 10px;">
                        ${badgeText}
                    </span>
                    <div>
                        <div class="card-tag ${typeClass}" style="font-size: 0.9rem;">"${alert.text}"</div>
                        <div class="card-subtext" style="font-size: 0.75rem;">
                            ${alert.type === 'elapsed' ? 'تذكير تصاعدي بعد بداية الحصة' : 'تذكير تنازلي قبل نهاية الحصة'}
                        </div>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 0.4rem;">
                    <button class="icon-btn-round test-sup-alert-btn" data-id="${alert.id}" style="width: 32px; height: 32px; font-size: 0.85rem;" title="سماع التنبيه">
                        ▶️
                    </button>
                    <button class="icon-btn-round del-sup-alert-btn" data-id="${alert.id}" style="width: 32px; height: 32px; font-size: 0.85rem; color: var(--accent-red);" title="حذف هذا التنبيه">
                        🗑️
                    </button>
                    <label class="glow-switch" style="width: 44px; height: 24px;">
                        <input type="checkbox" class="sup-alert-chk" data-id="${alert.id}" ${alert.enabled ? 'checked' : ''}>
                        <span class="glow-slider" style="border-radius: 20px;"></span>
                    </label>
                </div>
            `;

            supervisorAlertsList.appendChild(card);
        });

        document.querySelectorAll('.sup-alert-chk').forEach(chk => {
            chk.addEventListener('change', () => {
                const id = parseInt(chk.getAttribute('data-id'), 10);
                const a = supervisorAlerts.find(item => item.id === id);
                if (a) {
                    a.enabled = chk.checked;
                    saveSupervisorAlerts();
                }
            });
        });

        document.querySelectorAll('.test-sup-alert-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'), 10);
                const a = supervisorAlerts.find(item => item.id === id);
                if (a && window.soundEngine) {
                    window.soundEngine.playAlertWithVoice(a.text, true, generalSettings.appVolume);
                }
            });
        });

        document.querySelectorAll('.del-sup-alert-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'), 10);
                const a = supervisorAlerts.find(item => item.id === id);
                const alertText = a ? `"${a.text}"` : 'هذا التذكير';
                showConfirmDialog(
                    '⚠️ تأكيد حذف التذكير',
                    `هل أنت متأكد من رغبتك في حذف تذكير المشرف: ${alertText}؟`,
                    () => {
                        supervisorAlerts = supervisorAlerts.filter(item => item.id !== id);
                        saveSupervisorAlerts();
                        renderSupervisorAlerts();
                        showToast('تم حذف التذكير بنجاح', 'info');
                    }
                );
            });
        });
    }

    // زر مسح كافة تنبيهات المشرف
    document.getElementById('clearSupervisorAlertsBtn').addEventListener('click', () => {
        showConfirmDialog(
            '⚠️ مسح كافة التنبيهات',
            'هل أنت متأكد من رغبتك في مسح كافة تنبيهات المشرف المخصصة والبدء من الصفر؟',
            () => {
                supervisorAlerts = [];
                saveSupervisorAlerts();
                renderSupervisorAlerts();
                showToast('تم مسح تنبيهات المشرف بالكامل. يمكنك الآن إضافة تنبيهاتك بيدك.', 'success');
            }
        );
    });

    // Modal تنبيهات المشرف
    const supervisorAlertModal = document.getElementById('supervisorAlertModal');
    document.getElementById('addSupervisorAlertBtn').addEventListener('click', () => {
        document.getElementById('supAlertMinute').value = '';
        document.getElementById('supAlertText').value = '';
        supervisorAlertModal.classList.add('open');
    });

    document.getElementById('closeSupModalBtn').addEventListener('click', () => {
        supervisorAlertModal.classList.remove('open');
    });

    document.getElementById('saveSupModalBtn').addEventListener('click', () => {
        const type = document.getElementById('supAlertType').value;
        const minute = parseInt(document.getElementById('supAlertMinute').value, 10);
        const text = document.getElementById('supAlertText').value.trim();

        if (!minute || !text) {
            alert('يرجى إدخال الدقيقة والنص المنطوق');
            return;
        }

        supervisorAlerts.push({
            id: Date.now(),
            type,
            minute,
            text,
            enabled: true
        });

        saveSupervisorAlerts();
        renderSupervisorAlerts();
        supervisorAlertModal.classList.remove('open');
        showToast('تمت إضافة التنبيه بنجاح', 'success');
    });

    // =========================================================================
    // 9. إدارة الحصص اليدوية (إضافة، تعديل الحصة الأخيرة، وغيرها)
    // =========================================================================
    const editClassModal = document.getElementById('editClassModal');
    let editingClassId = null;

    function openEditClassModal(cls = null) {
        let dayData = daySchedules[currentDay];
        if (!dayData) {
            daySchedules[currentDay] = {
                enabled: true,
                customStartTime: null,
                breakEnabled: true,
                breakDuration: 20,
                breakAfterPeriod: 3,
                classes: []
            };
            dayData = daySchedules[currentDay];
        }

        // إذا كان اليوم معطلاً، نفعله تلقائياً عند إضافة حصة
        if (!dayData.enabled) {
            dayData.enabled = true;
            saveDaySchedules();
            renderDayView();
        }

        const durationInput = document.getElementById('modalClassDuration');
        const updateChips = (durVal) => {
            document.querySelectorAll('.duration-quick-chip').forEach(ch => {
                ch.classList.toggle('active', parseInt(ch.getAttribute('data-dur'), 10) === parseInt(durVal, 10));
            });
        };

        if (cls) {
            editingClassId = cls.id;
            document.getElementById('modalClassName').value = cls.name;
            document.getElementById('modalClassSubject').value = cls.subject || '';
            document.getElementById('modalClassRoom').value = cls.room || '';
            durationInput.value = cls.duration || generalSettings.globalPeriodDuration || 45;
            document.getElementById('modalClassIconColor').value = cls.icon || 'purple';
        } else {
            editingClassId = null;
            const count = (dayData.classes || []).length;
            document.getElementById('modalClassName').value = `الحصة ${count + 1}`;
            document.getElementById('modalClassSubject').value = '';
            document.getElementById('modalClassRoom').value = '';
            durationInput.value = generalSettings.globalPeriodDuration || 45;
            document.getElementById('modalClassIconColor').value = 'purple';
        }

        updateChips(durationInput.value);
        editClassModal.classList.add('open');

        setTimeout(() => {
            document.getElementById('modalClassSubject').focus();
        }, 150);
    }

    // ربط أزرار المدة السريعة (35د، 40د، 45د، 50د)
    document.querySelectorAll('.duration-quick-chip').forEach(ch => {
        ch.addEventListener('click', (e) => {
            e.preventDefault();
            const dur = ch.getAttribute('data-dur');
            document.getElementById('modalClassDuration').value = dur;
            document.querySelectorAll('.duration-quick-chip').forEach(c => c.classList.remove('active'));
            ch.classList.add('active');
        });
    });

    document.getElementById('modalClassDuration').addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        document.querySelectorAll('.duration-quick-chip').forEach(ch => {
            ch.classList.toggle('active', parseInt(ch.getAttribute('data-dur'), 10) === val);
        });
    });

    document.getElementById('topAddBtn').addEventListener('click', () => openEditClassModal(null));
    document.getElementById('addPeriodQuickBtn').addEventListener('click', () => openEditClassModal(null));
    document.getElementById('closeClassModalBtn').addEventListener('click', () => editClassModal.classList.remove('open'));

    // دعم مفتاح Enter للحفظ الفوري
    ['modalClassName', 'modalClassSubject', 'modalClassRoom', 'modalClassDuration'].forEach(id => {
        const inp = document.getElementById(id);
        if (inp) {
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('saveClassModalBtn').click();
                }
            });
        }
    });

    document.getElementById('saveClassModalBtn').addEventListener('click', () => {
        const dayData = daySchedules[currentDay];
        if (!dayData) return;

        let name = document.getElementById('modalClassName').value.trim();
        const subject = document.getElementById('modalClassSubject').value.trim();
        const room = document.getElementById('modalClassRoom').value.trim();
        let duration = parseInt(document.getElementById('modalClassDuration').value, 10);
        const icon = document.getElementById('modalClassIconColor').value;

        const iconChars = {
            purple: '📅',
            blue: '💼',
            cyan: '🏃',
            orange: '🔔',
            green: '📚'
        };

        const count = (dayData.classes || []).length;
        if (!name) {
            name = subject ? `حصة ${subject}` : `الحصة ${count + 1}`;
        }
        if (!duration || isNaN(duration) || duration <= 0) {
            duration = generalSettings.globalPeriodDuration || 45;
        }

        if (editingClassId) {
            const cls = dayData.classes.find(c => c.id === editingClassId);
            if (cls) {
                cls.name = name;
                cls.subject = subject || name;
                cls.room = room;
                cls.duration = duration;
                cls.icon = icon;
                cls.iconChar = iconChars[icon] || '📅';
            }
            showToast(`تم تعديل بيانات ${name} بنجاح`, 'success');
        } else {
            dayData.classes.push({
                id: Date.now(),
                name,
                subject: subject || name,
                room: room,
                duration,
                icon,
                iconChar: iconChars[icon] || '📅',
                enabled: true
            });
            showToast(`تمت إضافة ${name} (${duration} دقيقة) بنجاح!`, 'success');
        }

        saveDaySchedules();
        renderDayView();
        editClassModal.classList.remove('open');
    });

    // =========================================================================
    // 10. ضبط الاستراحة / الفسحة لليوم المختار
    // =========================================================================
    const breakModal = document.getElementById('breakModal');
    const breakDurationInput = document.getElementById('breakDurationInput');
    const breakAfterPeriodSelect = document.getElementById('breakAfterPeriodSelect');

    document.getElementById('editBreakBtn').addEventListener('click', () => {
        const dayData = daySchedules[currentDay];
        if (!dayData) return;
        breakDurationInput.value = dayData.breakDuration || 20;
        breakAfterPeriodSelect.value = String(dayData.breakAfterPeriod || 3);
        breakModal.classList.add('open');
    });

    document.getElementById('closeBreakModalBtn').addEventListener('click', () => breakModal.classList.remove('open'));

    document.getElementById('saveBreakModalBtn').addEventListener('click', () => {
        const dayData = daySchedules[currentDay];
        if (!dayData) return;

        dayData.breakDuration = parseInt(breakDurationInput.value, 10) || 20;
        dayData.breakAfterPeriod = parseInt(breakAfterPeriodSelect.value, 10) || 3;
        dayData.breakEnabled = true;

        saveDaySchedules();
        renderDayView();
        breakModal.classList.remove('open');
        showToast('تم تحديث إعدادات الاستراحة بنجاح', 'success');
    });

    breakEnableChk.addEventListener('change', () => {
        const dayData = daySchedules[currentDay];
        if (!dayData) return;
        dayData.breakEnabled = breakEnableChk.checked;
        saveDaySchedules();
        renderDayView();
        showToast(dayData.breakEnabled ? 'تم تفعيل الاستراحة لهذا اليوم' : 'تم إلغاء الاستراحة لهذا اليوم', 'info');
    });

    // تفعيل أو تعطيل اليوم الحالي بالكامل
    currentDayToggleChk.addEventListener('change', () => {
        const dayData = daySchedules[currentDay];
        if (!dayData) return;
        dayData.enabled = currentDayToggleChk.checked;

        // تحديث مصفوفة الأيام النشطة
        if (dayData.enabled && !generalSettings.activeDays.includes(currentDay)) {
            generalSettings.activeDays.push(currentDay);
        } else if (!dayData.enabled) {
            generalSettings.activeDays = generalSettings.activeDays.filter(d => d !== currentDay);
        }
        saveGeneralSettings();
        saveDaySchedules();
        renderDayView();
        updateWeekDaysCheckboxes();
        showToast(dayData.enabled ? `تم تفعيل يوم ${DAYS_NAMES[currentDay]}` : `تم تعطيل يوم ${DAYS_NAMES[currentDay]} كإجازة`, 'info');
    });

    document.getElementById('enableDayBtn').addEventListener('click', () => {
        currentDayToggleChk.checked = true;
        currentDayToggleChk.dispatchEvent(new Event('change'));
    });

    // التبديل بين الأيام في الشريط العلوي
    document.querySelectorAll('.day-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            currentDay = chip.getAttribute('data-day');
            storage.setItem('smart_active_day', currentDay);
            renderDayView();
        });
    });

    // =========================================================================
    // 11. الضبط العام وتوليد الحصص
    // =========================================================================
    globalStartTimeInput.value = generalSettings.globalStartTime;
    globalPeriodDurationInput.value = generalSettings.globalPeriodDuration;
    globalPeriodCountInput.value = generalSettings.globalPeriodCount;
    configPreAlertSelect.value = generalSettings.preAlertMinutes;
    configAutoBellChk.checked = generalSettings.autoBellEnabled;
    bellDurationSelect.value = generalSettings.bellDurationSeconds;
    duckOtherSoundsChk.checked = generalSettings.duckOtherSounds;
    configVolumeSlider.value = generalSettings.appVolume;
    volumePercentDisplay.textContent = Math.round(generalSettings.appVolume * 100) + '%';

    globalStartTimeInput.addEventListener('change', () => {
        generalSettings.globalStartTime = globalStartTimeInput.value;
        saveGeneralSettings();
        renderDayView();
        showToast('تم تحديث وقت بداية الحصة الأولى العام', 'info');
    });

    globalPeriodDurationInput.addEventListener('change', () => {
        generalSettings.globalPeriodDuration = parseInt(globalPeriodDurationInput.value, 10) || 45;
        saveGeneralSettings();
    });

    globalPeriodCountInput.addEventListener('change', () => {
        generalSettings.globalPeriodCount = parseInt(globalPeriodCountInput.value, 10) || 7;
        saveGeneralSettings();
    });

    configPreAlertSelect.addEventListener('change', () => {
        generalSettings.preAlertMinutes = parseInt(configPreAlertSelect.value, 10);
        saveGeneralSettings();
        showToast(`تم ضبط التنبيه المسبق بـ ${generalSettings.preAlertMinutes} دقائق`, 'info');
    });

    configAutoBellChk.addEventListener('change', () => {
        generalSettings.autoBellEnabled = configAutoBellChk.checked;
        saveGeneralSettings();
    });

    bellDurationSelect.addEventListener('change', () => {
        generalSettings.bellDurationSeconds = parseInt(bellDurationSelect.value, 10) || 5;
        saveGeneralSettings();
        showToast(`تم ضبط مدة رنين التنبيه إلى ${generalSettings.bellDurationSeconds} ثواني`, 'info');
    });

    duckOtherSoundsChk.addEventListener('change', () => {
        generalSettings.duckOtherSounds = duckOtherSoundsChk.checked;
        saveGeneralSettings();
    });

    configVolumeSlider.addEventListener('input', () => {
        generalSettings.appVolume = parseFloat(configVolumeSlider.value);
        volumePercentDisplay.textContent = Math.round(generalSettings.appVolume * 100) + '%';
        saveGeneralSettings();
    });

    // =========================================================================
    // التحكم الشامل بنظام الأجراس والتنبيهات (وضع الغياب / الإجازة)
    // =========================================================================
    const masterAlarmMainToggle = document.getElementById('masterAlarmMainToggle');
    const masterAlarmStatusIcon = document.getElementById('masterAlarmStatusIcon');
    const masterAlarmStatusTitle = document.getElementById('masterAlarmStatusTitle');
    const masterAlarmBadge = document.getElementById('masterAlarmBadge');
    const masterAlarmStatusSubtitle = document.getElementById('masterAlarmStatusSubtitle');

    function updateMasterAlarmUI() {
        if (!masterAlarmMainToggle) return;
        const isActive = generalSettings.masterAlarmsActive !== false;
        masterAlarmMainToggle.checked = isActive;
        if (isActive) {
            masterAlarmStatusIcon.textContent = '🔔';
            masterAlarmStatusIcon.style.filter = 'drop-shadow(0 0 10px rgba(52, 211, 153, 0.6))';
            masterAlarmBadge.textContent = 'مفعل وشغال';
            masterAlarmBadge.style.background = 'rgba(52, 211, 153, 0.2)';
            masterAlarmBadge.style.color = '#34d399';
            masterAlarmBadge.style.borderColor = 'rgba(52, 211, 153, 0.4)';
            masterAlarmStatusSubtitle.textContent = 'تصدر الأجراس والتنبيهات تلقائياً. يمكنك إيقافه فوراً في حال الغياب مع بقاء الحصص والإعدادات محفوظة 100%.';
        } else {
            masterAlarmStatusIcon.textContent = '🔕';
            masterAlarmStatusIcon.style.filter = 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.6))';
            masterAlarmBadge.textContent = 'متوقف مؤقتاً (وضع الغياب)';
            masterAlarmBadge.style.background = 'rgba(245, 158, 11, 0.25)';
            masterAlarmBadge.style.color = '#fbbf24';
            masterAlarmBadge.style.borderColor = 'rgba(245, 158, 11, 0.5)';
            masterAlarmStatusSubtitle.textContent = '⚠️ الأجراس والتنبيهات مكتومة اليوم بالكامل (وضع الغياب). جميع جداولك وحصصك محفوظة بنسبة 100% ولن تُمس.';
        }
    }

    if (masterAlarmMainToggle) {
        masterAlarmMainToggle.addEventListener('change', () => {
            generalSettings.masterAlarmsActive = masterAlarmMainToggle.checked;
            saveGeneralSettings();
            updateMasterAlarmUI();
            if (generalSettings.masterAlarmsActive) {
                showToast('🔔 تم تشغيل نظام الأجراس والتنبيهات بنجاح!', 'success');
            } else {
                showToast('🔕 تم تفعيل وضع الغياب: تم كتم الأجراس مؤقتاً مع الحفاظ التام على الحصص', 'info');
            }
        });
    }

    // =========================================================================
    // التذكير الاستباقي قبل بداية الحصة التالية (حرية تحديد الوقت وزمن الرنين)
    // =========================================================================
    const preClassReminderToggleChk = document.getElementById('preClassReminderToggleChk');
    const preClassReminderMinutesInput = document.getElementById('preClassReminderMinutesInput');
    const preClassRingDurationSelect = document.getElementById('preClassRingDurationSelect');
    const preClassReminderStatusNote = document.getElementById('preClassReminderStatusNote');

    function updatePreClassReminderUI() {
        if (!preClassReminderToggleChk) return;
        preClassReminderToggleChk.checked = generalSettings.preClassReminderEnabled !== false;
        preClassReminderMinutesInput.value = generalSettings.preClassReminderMinutes || 3;
        preClassRingDurationSelect.value = String(generalSettings.preClassRingDuration || 3);
        
        const mins = preClassReminderMinutesInput.value;
        const dur = preClassRingDurationSelect.value;
        if (preClassReminderToggleChk.checked) {
            preClassReminderStatusNote.innerHTML = `✓ سيصدر تذكير صوتي قبل الحصة بـ <strong>${mins} دقائق</strong> (رنين ${dur} ثوانٍ)، ثم ينطلق الجرس الرسمي بالضبط بالثانية عند موعد البداية.`;
            preClassReminderStatusNote.style.color = '#34d399';
        } else {
            preClassReminderStatusNote.innerHTML = `معطل: لن يصدر تذكير مسبق، وسينطلق فقط الجرس الرسمي عند بداية الحصة بالضبط.`;
            preClassReminderStatusNote.style.color = 'var(--text-muted)';
        }
    }

    if (preClassReminderToggleChk) {
        preClassReminderToggleChk.addEventListener('change', () => {
            generalSettings.preClassReminderEnabled = preClassReminderToggleChk.checked;
            saveGeneralSettings();
            updatePreClassReminderUI();
            showToast(generalSettings.preClassReminderEnabled ? 'تم تفعيل التذكير المسبق قبل الحصص' : 'تم تعطيل التذكير المسبق', 'info');
        });

        preClassReminderMinutesInput.addEventListener('change', () => {
            generalSettings.preClassReminderMinutes = parseInt(preClassReminderMinutesInput.value, 10) || 3;
            saveGeneralSettings();
            updatePreClassReminderUI();
        });

        preClassRingDurationSelect.addEventListener('change', () => {
            generalSettings.preClassRingDuration = parseInt(preClassRingDurationSelect.value, 10) || 3;
            saveGeneralSettings();
            updatePreClassReminderUI();
        });
    }

    updateMasterAlarmUI();
    updatePreClassReminderUI();

    // تحديث شيك بوكس أيام الأسبوع في الضبط العام
    function updateWeekDaysCheckboxes() {
        document.querySelectorAll('.day-active-chk').forEach(chk => {
            const dayKey = chk.getAttribute('data-day');
            chk.checked = daySchedules[dayKey] && daySchedules[dayKey].enabled;
        });
    }

    document.querySelectorAll('.day-active-chk').forEach(chk => {
        chk.addEventListener('change', () => {
            const dayKey = chk.getAttribute('data-day');
            if (daySchedules[dayKey]) {
                daySchedules[dayKey].enabled = chk.checked;
                if (chk.checked && !generalSettings.activeDays.includes(dayKey)) {
                    generalSettings.activeDays.push(dayKey);
                } else if (!chk.checked) {
                    generalSettings.activeDays = generalSettings.activeDays.filter(d => d !== dayKey);
                }
                saveGeneralSettings();
                saveDaySchedules();
                renderDayView();
            }
        });
    });

    // تطبيق الضبط العام وتوليد الحصص للأيام المفعلة
    document.getElementById('applyGlobalToAllDaysBtn').addEventListener('click', () => {
        if (confirm(`هل تريد توليد جدول ${generalSettings.globalPeriodCount} حصص (مدة كل حصة ${generalSettings.globalPeriodDuration} د) لجميع أيام الدوام المفعلة؟`)) {
            const count = generalSettings.globalPeriodCount;
            const dur = generalSettings.globalPeriodDuration;

            DAYS_KEYS.forEach(day => {
                if (daySchedules[day] && daySchedules[day].enabled) {
                    daySchedules[day].classes = [];
                    for (let i = 1; i <= count; i++) {
                        daySchedules[day].classes.push({
                            id: Date.now() + (i * 10) + Math.floor(Math.random() * 100),
                            name: `الحصة ${i}`,
                            subject: `مادة الحصة ${i}`,
                            room: 'الفصل',
                            duration: dur,
                            icon: i % 2 === 0 ? 'blue' : 'purple',
                            iconChar: i % 2 === 0 ? '💼' : '📅',
                            enabled: true
                        });
                    }
                }
            });

            saveDaySchedules();
            renderDayView();
            showToast('تم تطبيق الضبط العام وتوليد الحصص بنجاح', 'success');
        }
    });

    // =========================================================================
    // 12. اختيار ملف صوتي MP3 من الهاتف
    // =========================================================================
    const customAudioFileInput = document.getElementById('customAudioFileInput');
    const chooseCustomAudioBtn = document.getElementById('chooseCustomAudioBtn');
    const testCustomAudioBtn = document.getElementById('testCustomAudioBtn');
    const removeCustomAudioBtn = document.getElementById('removeCustomAudioBtn');
    const customAudioNameDisplay = document.getElementById('customAudioNameDisplay');

    function updateCustomAudioUI() {
        const savedName = storage.getItem('smart_custom_audio_name');
        if (savedName) {
            customAudioNameDisplay.innerHTML = `🎵 الملف المخصص: <strong style="color:#c084fc;">${savedName}</strong>`;
            removeCustomAudioBtn.style.display = 'inline-flex';
        } else {
            customAudioNameDisplay.textContent = 'الصوت المستخدم: جرس المدرسة الذكي الافتراضي';
            removeCustomAudioBtn.style.display = 'none';
        }
    }
    updateCustomAudioUI();

    chooseCustomAudioBtn.addEventListener('click', () => {
        customAudioFileInput.click();
    });

    customAudioFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('audio/')) {
            alert('يرجى اختيار ملف صوتي بصيغة MP3 أو WAV أو OGG');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(evt) {
            const base64Data = evt.target.result;
            if (window.soundEngine) {
                window.soundEngine.setCustomAudio(base64Data, file.name);
            }
            updateCustomAudioUI();
            showToast(`تم تعيين ملف "${file.name}" كنغمة التنبيه بنجاح!`, 'success');
        };
        reader.readAsDataURL(file);
    });

    testCustomAudioBtn.addEventListener('click', () => {
        if (window.soundEngine) {
            window.soundEngine.playSchoolBell(generalSettings.bellDurationSeconds, generalSettings.appVolume);
        }
    });

    removeCustomAudioBtn.addEventListener('click', () => {
        showConfirmDialog(
            '⚠️ استعادة نغمة الجرس',
            'هل أنت متأكد من رغبتك في إزالة الملف الصوتي الخاص واستعادة رنة الجرس الافتراضية؟',
            () => {
                if (window.soundEngine) {
                    window.soundEngine.clearCustomAudio();
                }
                updateCustomAudioUI();
                showToast('تمت استعادة نغمة الجرس الافتراضية', 'info');
            }
        );
    });

    // =========================================================================
    // 13. زر تصفير البيانات التجريبية (للبدء من الصفر)
    // =========================================================================
    document.getElementById('wipeAllDataBtn').addEventListener('click', () => {
        showConfirmDialog(
            '⚠️ تصفير البيانات والبدء من الصفر',
            'تحذير هام: سيتم مسح كافة الحصص في جميع الأيام وتفريغ كافة تنبيهات المشرف للبدء من الصفر تماماً. هل أنت متأكد؟',
            () => {
                // تفريغ كافة الحصص في كل الأيام
                DAYS_KEYS.forEach(day => {
                    if (daySchedules[day]) {
                        daySchedules[day].classes = [];
                    }
                });
                // تفريغ تنبيهات المشرف
                supervisorAlerts = [];

                saveDaySchedules();
                saveSupervisorAlerts();
                renderDayView();
                renderSupervisorAlerts();
                showToast('تم تصفير البيانات بنجاح! يمكنك الآن إضافة حصصك الحقيقية وتنبيهاتك بيدك.', 'success');
            }
        );
    });

    // ضرب الجرس اليدوي
    document.getElementById('manualRingBellBtn').addEventListener('click', () => {
        if (window.soundEngine) {
            window.soundEngine.playSchoolBell(generalSettings.bellDurationSeconds, generalSettings.appVolume);
            showToast('تم تشغيل التنبيه يدوياً!', 'info');
        }
    });

    // التنقل بين شاشات التطبيق
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    const viewPanels = {
        viewAlarms: document.getElementById('viewAlarms'),
        viewTimer: document.getElementById('viewTimer'),
        viewSchedule: document.getElementById('viewSchedule'),
        viewSettings: document.getElementById('viewSettings')
    };

    const viewTitles = {
        viewAlarms: 'الحصص والتنبيهات',
        viewTimer: 'مؤقت إدارة الحصة والمشرف',
        viewSchedule: 'الضبط العام وجدول الحصص',
        viewSettings: 'إعدادات الصوت والنظام'
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.getAttribute('data-view');
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            Object.keys(viewPanels).forEach(key => {
                viewPanels[key].style.display = key === targetView ? 'block' : 'none';
            });

            document.getElementById('currentViewTitle').textContent = viewTitles[targetView] || 'المنبه المدرسي الذكي';
        });
    });

    // توسيع الشاشة
    document.getElementById('expandViewBtn').addEventListener('click', () => {
        document.getElementById('deviceContainer').classList.toggle('expanded-mode');
    });

    // الأصوات الناطقة
    function loadVoices() {
        if (!('speechSynthesis' in window)) return;
        const voices = window.speechSynthesis.getVoices();
        configVoiceSelect.innerHTML = '';
        voices.forEach((v, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `${v.name} (${v.lang})`;
            if (v.lang.startsWith('ar') || v.lang.includes('SA') || v.lang.includes('EG')) {
                opt.selected = true;
            }
            configVoiceSelect.appendChild(opt);
        });
    }

    if ('speechSynthesis' in window) {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    configVoiceSelect.addEventListener('change', () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices[configVoiceSelect.value] && window.soundEngine) {
            window.soundEngine.arabicVoice = voices[configVoiceSelect.value];
        }
    });

    // إشعارات عائمة (Toast)
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'toast';
        const icon = type === 'success' ? '✅' : (type === 'warning' ? '⚠️' : '🔔');
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // دعم تثبيت PWA للأندرويد
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    let deferredPrompt = null;
    const installAppBtn = document.getElementById('installAppBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installAppBtn) installAppBtn.style.display = 'inline-flex';
    });

    if (installAppBtn) {
        installAppBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
                installAppBtn.style.display = 'none';
            }
        });
    }

    // التهيئة الأولية
    updateWeekDaysCheckboxes();
    renderDayView();
    renderSupervisorAlerts();
    updateTimerDisplay();
});
