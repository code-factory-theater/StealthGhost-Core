// ========== Phantom Call Engine - Core System ==========

        class PhantomCallEngine {
            constructor() {
                this.audioContext = null;
                this.isRinging = false;
                this.isInCall = false;
                this.callStartTime = 0;
                this.callTimerInterval = null;
                this.selectedPreset = 'teams';
                this.callerName = 'AWS CloudWatch Alert';
                this.delaySeconds = 0;
                this.delayTimeout = null;
                this.volumeLevel = 0.7;
                this.isMuted = false;
                this.muteMode = false; // バイブレーション・画面点滅のみ

                this.presets = {
                    teams: {
                        name: 'Teams',
                        emoji: '💼',
                        caller: 'System Monitoring',
                        detail: 'Incoming call',
                        cardClass: 'teams',
                        sound: 'beep',
                        color: '#0078d4'
                    },
                    slack: {
                        name: 'Slack',
                        emoji: '💬',
                        caller: 'Slack Huddle',
                        detail: 'Room call',
                        cardClass: 'slack',
                        sound: 'chime',
                        color: '#36c5f0'
                    },
                    legacy: {
                        name: 'Legacy',
                        emoji: '☎️',
                        caller: 'Internal Line',
                        detail: 'Line incoming',
                        cardClass: 'legacy',
                        sound: 'pulltone',
                        color: '#ff6b6b'
                    },
                    alert: {
                        name: 'Alert',
                        emoji: '🚨',
                        caller: 'Incident Alert',
                        detail: 'Critical event',
                        cardClass: 'alert',
                        sound: 'alarm',
                        color: '#f59e0b'
                    }
                };

                this.scripts = [
                    "はい、お電話代わりました。……えっ、ステージング環境が？ 分かりました、すぐ確認します。",
                    "承知しました。今すぐ対応に当たります。",
                    "インシデント発生ですね。直ちに現場に向かいます。",
                    "データベース接続ですか？ 早急に確認いたします。",
                    "ネットワーク障害の報告ありがとうございます。フィールドに赴きます。",
                    "API のレスポンスが異常？ すぐさま調査に参ります。",
                    "本当に申し訳ありません。今から対応室に直行します。"
                ];

                this.escapeCount = 0;
                this.escapeResetTimer = null;

                this.init();
            }

            init() {
                this.setupAudioContext();
                this.setupEventListeners();
                this.setupHotkeys();
                this.loadSettings();
            }

            setupAudioContext() {
                if (!window.AudioContext && !window.webkitAudioContext) {
                    console.warn('Web Audio API not supported');
                    return;
                }
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioCtx();
            }

            setupEventListeners() {
                // プリセット選択
                document.querySelectorAll('.preset-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        this.selectedPreset = btn.dataset.preset;
                        this.callerName = this.presets[this.selectedPreset].caller;
                        document.getElementById('callerNameInput').value = this.callerName;
                    });
                });

                // 設定入力
                document.getElementById('callerNameInput').addEventListener('change', (e) => {
                    this.callerName = e.target.value || this.presets[this.selectedPreset].caller;
                });

                document.getElementById('delaySlider').addEventListener('input', (e) => {
                    this.delaySeconds = parseInt(e.target.value);
                    document.getElementById('delayValue').textContent = 
                        this.delaySeconds > 0 ? `${this.delaySeconds}秒後` : '即時';
                });

                document.getElementById('volumeSlider').addEventListener('input', (e) => {
                    this.volumeLevel = parseFloat(e.target.value);
                });

                // マナーモード
                document.getElementById('muteToggle').addEventListener('click', () => {
                    const toggle = document.getElementById('muteToggle');
                    this.muteMode = !this.muteMode;
                    toggle.classList.toggle('active', this.muteMode);
                });

                // トリガーボタン
                document.getElementById('triggerNowBtn').addEventListener('click', () => {
                    this.fireIncoming();
                });

                document.getElementById('triggerScheduleBtn').addEventListener('click', () => {
                    if (this.delaySeconds > 0) {
                        alert(`${this.delaySeconds}秒後に着信します…`);
                        this.scheduleIncoming(this.delaySeconds);
                    } else {
                        alert('遅延秒数を設定してください');
                    }
                });

                // 着信画面ボタン
                document.getElementById('acceptBtn').addEventListener('click', () => {
                    this.acceptCall();
                });

                document.getElementById('rejectBtn').addEventListener('click', () => {
                    this.rejectCall();
                });

                // 通話終了ボタン
                document.getElementById('endCallBtn').addEventListener('click', () => {
                    this.endCall();
                });

                // 通話画面でESCキー検知
                document.addEventListener('keydown', (e) => {
                    if ((this.isRinging || this.isInCall) && e.key === 'Escape') {
                        e.preventDefault();
                        this.escapeCount++;
                        
                        if (this.escapeCount >= 2) {
                            this.emergencyAbort();
                            this.escapeCount = 0;
                        } else {
                            clearTimeout(this.escapeResetTimer);
                            this.escapeResetTimer = setTimeout(() => {
                                this.escapeCount = 0;
                            }, 2000);
                        }
                    }
                });

                // QRコード生成
                document.getElementById('generateQrBtn').addEventListener('click', () => {
                    this.generateQRCode();
                });
            }

            setupHotkeys() {
                document.addEventListener('keydown', (e) => {
                    // Ctrl + Shift + X で即座に着信
                    if (e.ctrlKey && e.shiftKey && e.code === 'KeyX') {
                        e.preventDefault();
                        this.fireIncoming();
                    }
                });
            }

            loadSettings() {
                const saved = localStorage.getItem('phantom-call-settings');
                if (saved) {
                    const settings = JSON.parse(saved);
                    this.selectedPreset = settings.preset || 'teams';
                    this.callerName = settings.caller || this.presets[this.selectedPreset].caller;
                    this.volumeLevel = settings.volume || 0.7;
                }
                this.updateUI();
            }

            updateUI() {
                document.querySelectorAll('.preset-btn').forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.dataset.preset === this.selectedPreset) {
                        btn.classList.add('active');
                    }
                });
                document.getElementById('callerNameInput').value = this.callerName;
                document.getElementById('volumeSlider').value = this.volumeLevel;
            }

            scheduleIncoming(delaySeconds) {
                if (this.delayTimeout) clearTimeout(this.delayTimeout);
                this.delayTimeout = setTimeout(() => {
                    this.fireIncoming();
                }, delaySeconds * 1000);
            }

            fireIncoming() {
                if (this.isRinging || this.isInCall) return;
                this.isRinging = true;
                this.showIncomingCall();
                this.playRingtoneSoundEffect();
                this.triggerVibration();
            }

            showIncomingCall() {
                const overlay = document.getElementById('incomingCallOverlay');
                const card = overlay.querySelector('.incoming-call-card');
                const preset = this.presets[this.selectedPreset];

                card.className = `incoming-call-card ${preset.cardClass}`;
                overlay.querySelector('.pulse-icon').textContent = preset.emoji;
                overlay.querySelector('.caller-name').textContent = this.callerName;
                overlay.querySelector('.caller-detail').textContent = preset.detail;

                overlay.classList.add('active');
            }

            playRingtoneSoundEffect() {
                if (!this.audioContext || this.muteMode) return;
                const preset = this.presets[this.selectedPreset];
                
                try {
                    switch (preset.sound) {
                        case 'beep':
                            this.playBeepSound();
                            break;
                        case 'chime':
                            this.playChimeSound();
                            break;
                        case 'pulltone':
                            this.playPulltoneSound();
                            break;
                        case 'alarm':
                            this.playAlarmSound();
                            break;
                    }
                } catch (e) {
                    console.warn('Sound playback error:', e);
                }
            }

            playBeepSound() {
                const ctx = this.audioContext;
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.frequency.value = 600;
                gain.gain.setValueAtTime(this.volumeLevel * 0.5, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

                osc.start(now);
                osc.stop(now + 0.3);

                setTimeout(() => {
                    const osc2 = ctx.createOscillator();
                    const gain2 = ctx.createGain();
                    osc2.connect(gain2);
                    gain2.connect(ctx.destination);
                    osc2.frequency.value = 800;
                    gain2.gain.setValueAtTime(this.volumeLevel * 0.5, ctx.currentTime);
                    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                    osc2.start(ctx.currentTime);
                    osc2.stop(ctx.currentTime + 0.3);
                }, 400);
            }

            playChimeSound() {
                const ctx = this.audioContext;
                const now = ctx.currentTime;
                const frequencies = [523.25, 659.25, 783.99]; // C, E, G
                
                frequencies.forEach((freq, index) => {
                    setTimeout(() => {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.frequency.value = freq;
                        gain.gain.setValueAtTime(this.volumeLevel * 0.4, ctx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
                        osc.start(ctx.currentTime);
                        osc.stop(ctx.currentTime + 0.4);
                    }, index * 150);
                });
            }

            playPulltoneSound() {
                const ctx = this.audioContext;
                const pattern = [200, 200, 200, 300]; // on, off, on, off (ms)
                let totalTime = 0;

                for (let i = 0; i < 6; i++) {
                    const freq = i % 2 === 0 ? 450 : 300;
                    const duration = pattern[i % 4] / 1000;
                    
                    setTimeout(() => {
                        if (i % 2 === 0) {
                            const osc = ctx.createOscillator();
                            const gain = ctx.createGain();
                            osc.connect(gain);
                            gain.connect(ctx.destination);
                            osc.frequency.value = freq;
                            gain.gain.setValueAtTime(this.volumeLevel * 0.6, ctx.currentTime);
                            gain.gain.linearRampToValueAtTime(this.volumeLevel * 0.6, ctx.currentTime + duration);
                            osc.start(ctx.currentTime);
                            osc.stop(ctx.currentTime + duration);
                        }
                    }, totalTime);
                    
                    totalTime += pattern[i % 4];
                }
            }

            playAlarmSound() {
                const ctx = this.audioContext;
                const now = ctx.currentTime;
                
                for (let i = 0; i < 3; i++) {
                    setTimeout(() => {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.frequency.setValueAtTime(1000, ctx.currentTime);
                        osc.frequency.linearRampToValueAtTime(1500, ctx.currentTime + 0.2);
                        gain.gain.setValueAtTime(this.volumeLevel * 0.7, ctx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
                        osc.start(ctx.currentTime);
                        osc.stop(ctx.currentTime + 0.2);
                    }, i * 300);
                }
            }

            triggerVibration() {
                if (navigator.vibrate && !this.muteMode) {
                    navigator.vibrate([200, 100, 200, 100, 200]);
                }
            }

            acceptCall() {
                this.isRinging = false;
                this.isInCall = true;
                this.callStartTime = Date.now();

                document.getElementById('incomingCallOverlay').classList.remove('active');
                document.getElementById('callScreenOverlay').classList.add('active');

                this.startCallTimer();
                this.displayPromptScript();
                this.createFlashEffect();
            }

            rejectCall() {
                this.stopAllSounds();
                document.getElementById('incomingCallOverlay').classList.remove('active');
                this.isRinging = false;
            }

            startCallTimer() {
                let elapsedSeconds = 0;
                this.callTimerInterval = setInterval(() => {
                    elapsedSeconds++;
                    const minutes = Math.floor(elapsedSeconds / 60);
                    const seconds = elapsedSeconds % 60;
                    document.getElementById('callTimer').textContent =
                        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                }, 1000);
            }

            displayPromptScript() {
                const script = this.scripts[Math.floor(Math.random() * this.scripts.length)];
                document.getElementById('prompterText').textContent = `「${script}」`;
            }

            createFlashEffect() {
                if (!this.muteMode) {
                    const overlay = document.getElementById('callScreenOverlay');
                    overlay.style.background = 'rgba(0, 0, 0, 0.95)';
                    let flashCount = 0;
                    const flashInterval = setInterval(() => {
                        if (flashCount >= 2 || !this.isInCall) {
                            clearInterval(flashInterval);
                            overlay.style.background = 'rgba(0, 0, 0, 0.95)';
                            return;
                        }
                        overlay.style.background = overlay.style.background === 'rgba(0, 0, 0, 0.95)' 
                            ? 'rgba(100, 100, 100, 0.95)' 
                            : 'rgba(0, 0, 0, 0.95)';
                        flashCount++;
                    }, 200);
                }
            }

            endCall() {
                this.isInCall = false;
                if (this.callTimerInterval) clearInterval(this.callTimerInterval);
                document.getElementById('callScreenOverlay').classList.remove('active');
                document.getElementById('callTimer').textContent = '00:00';
                alert('通話終了。堂々とオフィスを脱出してください… 🍋');
            }

            emergencyAbort() {
                this.stopAllSounds();
                this.isRinging = false;
                this.isInCall = false;
                if (this.callTimerInterval) clearInterval(this.callTimerInterval);
                document.getElementById('incomingCallOverlay').classList.remove('active');
                document.getElementById('callScreenOverlay').classList.remove('active');
                alert('緊急中止。システムをリセットしました。');
            }

            stopAllSounds() {
                if (this.audioContext) {
                    this.audioContext.getDestination().disconnect();
                }
            }

            generateQRCode() {
                // 簡易 QRコード生成（Canvas）
                const canvas = document.getElementById('qrCanvas');
                if (!canvas) {
                    const qrDisplay = document.getElementById('qrDisplay');
                    const newCanvas = document.createElement('canvas');
                    newCanvas.id = 'qrCanvas';
                    newCanvas.width = 200;
                    newCanvas.height = 200;
                    qrDisplay.insertBefore(newCanvas, qrDisplay.firstChild);
                }

                const displayDiv = document.getElementById('qrDisplay');
                displayDiv.classList.toggle('show');

                if (displayDiv.classList.contains('show')) {
                    // 簡易ドットパターンQR（実装簡略版）
                    const canvas = document.getElementById('qrCanvas');
                    const ctx = canvas.getContext('2d');
                    
                    // 白背景
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, 200, 200);

                    // 黒ドット（パターン例）
                    ctx.fillStyle = '#000';
                    const data = this.generateSimpleQRPattern();
                    data.forEach((row, y) => {
                        row.forEach((cell, x) => {
                            if (cell) {
                                ctx.fillRect(x * 10, y * 10, 10, 10);
                            }
                        });
                    });
                }
            }

            generateSimpleQRPattern() {
                // 簡易パターン（実装簡略版 - フローシング・ドット）
                const size = 20;
                const pattern = [];
                for (let i = 0; i < size; i++) {
                    pattern[i] = [];
                    for (let j = 0; j < size; j++) {
                        pattern[i][j] = Math.random() > 0.5;
                    }
                }
                return pattern;
            }

            saveSettings() {
                localStorage.setItem('phantom-call-settings', JSON.stringify({
                    preset: this.selectedPreset,
                    caller: this.callerName,
                    volume: this.volumeLevel
                }));
            }
        }

        // ========== アプリケーション初期化 ==========
        document.addEventListener('DOMContentLoaded', () => {
            const engine = new PhantomCallEngine();
        });