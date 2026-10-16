// ===================================================================
        // Mission Sequencer - フェーズ2 実装
        // ===================================================================

        // グローバル状態
        const missionState = {
            targetTime: null,
            currentPhase: 'STANDBY',
            missionActive: false,
            ghostModeActive: false,
            escKeyPressCount: 0,
            escKeyResetTimer: null,
            mouseVelocity: { x: 0, y: 0 },
            lastMousePos: { x: 0, y: 0 }
        };

        // Phase定義
        const PHASES = {
            STANDBY: { name: 'STANDBY', offset: 0, description: 'ミッション待機中' },
            RECON: { name: 'RECON', offset: -30, description: '周囲警戒・ルート確認' },
            DECOY: { name: 'DECOY', offset: -15, description: '物理デコイチェック' },
            CAMOUFLAGE: { name: 'CAMOUFLAGE', offset: -5, description: 'ブラフ画面準備' },
            EGRESS: { name: 'EGRESS', offset: 0, description: '脱出待機中' },
            POST_OPS: { name: 'POST_OPS', offset: 30, description: 'アリバイ偽装実行' }
        };

        // イベントシステム
        class MissionEventBus {
            constructor() {
                this.listeners = {};
            }

            on(eventName, callback) {
                if (!this.listeners[eventName]) {
                    this.listeners[eventName] = [];
                }
                this.listeners[eventName].push(callback);
            }

            emit(eventName, data = {}) {
                if (this.listeners[eventName]) {
                    this.listeners[eventName].forEach(callback => callback(data));
                }
            }

            off(eventName, callback) {
                if (this.listeners[eventName]) {
                    this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
                }
            }
        }

        const eventBus = new MissionEventBus();

        // ===================================================================
        // Timeline管理
        // ===================================================================
        function updateTimeline() {
            if (!missionState.targetTime) return;

            const now = new Date();
            const [targetHour, targetMin] = missionState.targetTime.split(':');
            const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, targetMin, 0);

            // 既に過ぎていたら翌日に
            if (targetDate < now) {
                targetDate.setDate(targetDate.getDate() + 1);
            }

            const diffMinutes = Math.round((targetDate - now) / 60000);

            // Phase判定
            let currentPhase = 'STANDBY';
            if (diffMinutes <= -1) {
                currentPhase = 'POST_OPS';
            } else if (diffMinutes <= 0) {
                currentPhase = 'EGRESS';
            } else if (diffMinutes <= 5) {
                currentPhase = 'CAMOUFLAGE';
            } else if (diffMinutes <= 15) {
                currentPhase = 'DECOY';
            } else if (diffMinutes <= 30) {
                currentPhase = 'RECON';
            }

            // Phase変更時イベント
            if (currentPhase !== missionState.currentPhase) {
                missionState.currentPhase = currentPhase;
                eventBus.emit('MissionStageChange', { phase: currentPhase });
            }

            // HUD更新
            updateHUDCountdown(diffMinutes, currentPhase);
            updateTimelineUI();

            // ブラウザ通知（Phase遷移時）
            if (currentPhase === 'DECOY' && missionState.missionActive && 'Notification' in window) {
                new Notification('🎭 DECOY Phase開始', {
                    body: '物理デコイチェックを開始してください',
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎭</text></svg>'
                });
            }
        }

        function updateHUDCountdown(minutes, phase) {
            const hudCountdown = document.getElementById('hud-countdown');
            const hudPhase = document.getElementById('hud-phase');

            if (hudCountdown) {
                if (minutes < 0) {
                    hudCountdown.textContent = `T+${Math.abs(minutes).toString().padStart(2, '0')}m`;
                    hudCountdown.style.color = '#ff0000';
                } else if (minutes === 0) {
                    hudCountdown.textContent = 'T-0m NOW';
                    hudCountdown.style.color = '#ffff00';
                    hudCountdown.style.animation = 'pulse-active 0.5s infinite';
                } else {
                    hudCountdown.textContent = `T-${minutes.toString().padStart(2, '0')}m`;
                    hudCountdown.style.color = '#00ff00';
                    hudCountdown.style.animation = 'none';
                }
            }

            if (hudPhase) {
                hudPhase.textContent = phase;
            }
        }

        function updateTimelineUI() {
            const items = document.querySelectorAll('.timeline-item');
            items.forEach(item => {
                const phase = item.dataset.phase;
                item.classList.remove('active', 'completed');

                if (phase === missionState.currentPhase) {
                    item.classList.add('active');
                } else {
                    // 過ぎたPhaseはcompletedに
                    const phaseOrder = ['RECON', 'DECOY', 'CAMOUFLAGE', 'EGRESS', 'POST_OPS'];
                    const currentIdx = phaseOrder.indexOf(missionState.currentPhase);
                    const itemIdx = phaseOrder.indexOf(phase);
                    if (itemIdx < currentIdx) {
                        item.classList.add('completed');
                    }
                }
            });
        }

        // ===================================================================
        // Excuse Generator
        // ===================================================================
        function generateExcuse() {
            const excuses = [
                '申し訳ございません。緊急でデータベースの最適化を行っていました。',
                'システムエラーが発生したため、ログファイルの確認に時間がかかりました。',
                '本社からの重要な報告書作成が入り、優先対応していました。',
                'セキュリティ監査の準備で、全ファイルのバックアップを実施していました。',
                'クライアント対応のため、緊急会議に出席していました。',
                'パッチ更新のテストで、複数の環境検証が必要でした。',
                'チームメンバーのオンボーディング資料を急遽作成していました。',
                'システム監視で異常値を検出し、原因調査を行っていました。'
            ];
            return excuses[Math.floor(Math.random() * excuses.length)];
        }

        // ===================================================================
        // Slack Alibi Message
        // ===================================================================
        function generateSlackMessage() {
            const messages = [
                '今、DB最適化のテスト実行中です。結果待ちです... 🔄',
                '新機能のコードレビュー中です。複数の観点から確認しています 📝',
                'ドキュメント整備をしています。重要な手順の可視化を進めています 📚',
                'パフォーマンス分析ツール走らせてます。データを集計中です ⚡',
                'セキュリティログ確認中です。何か異常がないか監視しています 🔐',
                'チーム間の情報共有ドキュメント更新しています 📊',
                'テスト環境の構築中です。複数パターン検証予定です 🧪'
            ];
            return messages[Math.floor(Math.random() * messages.length)];
        }

        // ===================================================================
        // ワンアクション脱出トリガー
        // ===================================================================
        function triggerEscape() {
            if (missionState.ghostModeActive) return;

            missionState.ghostModeActive = true;
            missionState.currentPhase = 'POST_OPS';

            eventBus.emit('MissionTriggered', {});

            // Ghost Mode表示
            showGhostMode();

            // Bluff Screen表示
            showBluffScreen();

            // Slack偽装メッセージ予約
            scheduleSlackMessage();

            // ローカルストレージに記録
            localStorage.setItem('ghostModeActive', 'true');
            localStorage.setItem('ghostModeTimestamp', new Date().toISOString());
        }

        function showGhostMode() {
            let ghostIndicator = document.getElementById('ghost-mode-indicator');
            if (!ghostIndicator) {
                ghostIndicator = document.createElement('div');
                ghostIndicator.id = 'ghost-mode-indicator';
                ghostIndicator.className = 'ghost-mode-active';
                ghostIndicator.textContent = '👻 GHOST MODE ACTIVE';
                document.body.appendChild(ghostIndicator);
            }
        }

        function showBluffScreen() {
            const bluffScreen = document.createElement('div');
            bluffScreen.className = 'bluff-screen';
            bluffScreen.innerHTML = `
                <div class="bluff-error-icon">⚠️</div>
                <div class="bluff-error-text">CRITICAL SYSTEM ERROR</div>
                <div class="bluff-error-details">
                    エラーコード: E_CRITICAL_FAILURE<br>
                    原因: 予期しないシステムエラーが発生しました<br>
                    復旧中...
                </div>
                <div class="bluff-progress">
                    <div class="bluff-progress-bar"></div>
                </div>
            `;
            document.body.appendChild(bluffScreen);
        }

        function scheduleSlackMessage() {
            const message = generateSlackMessage();
            const timestamp = new Date().toISOString();

            // ローカルストレージに保存
            const slackQueue = JSON.parse(localStorage.getItem('slackQueue') || '[]');
            slackQueue.push({
                message,
                scheduledTime: new Date(Date.now() + 30 * 60000).toISOString(),
                sent: false
            });
            localStorage.setItem('slackQueue', JSON.stringify(slackQueue));

            console.log('📨 Slack予約送信: ', message);
        }

        // ===================================================================
        // Checklist管理
        // ===================================================================
        function setupChecklistToggle() {
            document.querySelectorAll('.checklist-item input[type="checkbox"]').forEach(checkbox => {
                checkbox.addEventListener('change', function() {
                    const item = this.closest('.checklist-item');
                    if (this.checked) {
                        item.classList.add('checked');
                    } else {
                        item.classList.remove('checked');
                    }
                });
            });
        }

        // ===================================================================
        // Keyboard shortcuts
        // ===================================================================
        document.addEventListener('keydown', (e) => {
            // Escape key 3連打検出（Abort Switch）
            if (e.key === 'Escape') {
                missionState.escKeyPressCount++;

                if (missionState.escKeyResetTimer) {
                    clearTimeout(missionState.escKeyResetTimer);
                }

                if (missionState.escKeyPressCount === 3) {
                    triggerAbort();
                    missionState.escKeyPressCount = 0;
                } else {
                    missionState.escKeyResetTimer = setTimeout(() => {
                        missionState.escKeyPressCount = 0;
                    }, 1000);
                }
            }

            // Ctrl+Shift+G: 脱出トリガー
            if (e.ctrlKey && e.shiftKey && e.key === 'G') {
                e.preventDefault();
                triggerEscape();
            }
        });

        // ===================================================================
        // Mouse shake detection
        // ===================================================================
        let mouseShakeVelocity = 0;
        let lastMouseShakeTime = 0;

        document.addEventListener('mousemove', (e) => {
            const now = Date.now();
            const dx = e.clientX - missionState.lastMousePos.x;
            const dy = e.clientY - missionState.lastMousePos.y;

            mouseShakeVelocity = Math.sqrt(dx * dx + dy * dy) * 1000 / (now - lastMouseShakeTime || 16);

            if (mouseShakeVelocity > 1000) {
                // 高速シェイク検知→脱出トリガー前のカウント
                console.log('🐭 Mouse shake detected:', mouseShakeVelocity);
            }

            missionState.lastMousePos = { x: e.clientX, y: e.clientY };
            lastMouseShakeTime = now;
        });

        // ===================================================================
        // Abort Switch処理
        // ===================================================================
        function triggerAbort() {
            const modal = document.getElementById('abort-modal');
            if (modal) {
                modal.classList.add('show');
            }
            alert('⚠️ ABORT SEQUENCE TRIGGERED\n\n上司が迫ってきた場合、このジェネレーターを使用してください。');

            // 言い訳表示
            const excuseOutput = document.getElementById('excuse-output');
            if (excuseOutput) {
                excuseOutput.textContent = generateExcuse();
            }
        }

        // ===================================================================
        // Mission タイムライン作成
        // ===================================================================
        function createTimeline() {
            const timelineContainer = document.getElementById('timeline-container');
            if (!timelineContainer) return;

            timelineContainer.innerHTML = '';

            const timeline = [
                { phase: 'RECON', time: 'T-30m', desc: '周囲警戒・脱出ルート確認' },
                { phase: 'DECOY', time: 'T-15m', desc: '物理デコイ(飲料/ジャケット)の配置' },
                { phase: 'CAMOUFLAGE', time: 'T-5m', desc: 'ブラフ画面スタンバイ' },
                { phase: 'EGRESS', time: 'T-0m', desc: '脱出トリガー待機' },
                { phase: 'POST_OPS', time: 'T+30m', desc: 'Slack偽装アリバイ送信' }
            ];

            timeline.forEach(item => {
                const timelineItem = document.createElement('div');
                timelineItem.className = 'timeline-item';
                timelineItem.dataset.phase = item.phase;
                timelineItem.innerHTML = `
                    <div class="timeline-time">${item.time}</div>
                    <div class="timeline-phase">
                        <div class="timeline-phase-name">${item.phase}</div>
                        <div class="timeline-phase-desc">${item.desc}</div>
                    </div>
                    <div class="timeline-indicator"></div>
                `;
                timelineContainer.appendChild(timelineItem);
            });
        }

        // ===================================================================
        // UI初期化
        // ===================================================================
        function initializeUI() {
            createTimeline();
            setupChecklistToggle();

            // Target Time入力
            const targetTimeInput = document.getElementById('target-time');
            if (targetTimeInput) {
                targetTimeInput.addEventListener('change', (e) => {
                    missionState.targetTime = e.target.value;
                    if (missionState.targetTime) {
                        missionState.missionActive = true;
                        console.log('🎯 Mission activated. Target:', missionState.targetTime);
                        eventBus.emit('MissionStarted', { targetTime: missionState.targetTime });
                    }
                });
            }

            // GO GHOST ボタン
            const goGhostBtn = document.getElementById('go-ghost-btn');
            if (goGhostBtn) {
                goGhostBtn.addEventListener('click', triggerEscape);
            }

            // Generate Excuse
            const genExcuseBtn = document.getElementById('gen-excuse-btn');
            if (genExcuseBtn) {
                genExcuseBtn.addEventListener('click', () => {
                    const excuseOutput = document.getElementById('excuse-output');
                    if (excuseOutput) {
                        excuseOutput.textContent = generateExcuse();
                    }
                });
            }

            // Generate Slack Message
            const genSlackBtn = document.getElementById('gen-slack-btn');
            if (genSlackBtn) {
                genSlackBtn.addEventListener('click', () => {
                    const slackPreview = document.getElementById('slack-preview');
                    if (slackPreview) {
                        slackPreview.textContent = generateSlackMessage();
                    }
                });
            }

            // Theme Toggle
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                themeToggle.addEventListener('click', () => {
                    document.body.classList.toggle('stealth-mode');
                    const isStealthMode = document.body.classList.contains('stealth-mode');
                    localStorage.setItem('stealthMode', isStealthMode);
                    themeToggle.textContent = isStealthMode ? '🟠 STEALTH MODE OFF' : '🟢 STEALTH MODE ON';
                });

                // 初期状態読み込み
                const savedStealthMode = localStorage.getItem('stealthMode') === 'true';
                if (savedStealthMode) {
                    document.body.classList.add('stealth-mode');
                    themeToggle.textContent = '🟠 STEALTH MODE OFF';
                }
            }

            // Modal close
            document.querySelectorAll('.modal-close').forEach(closeBtn => {
                closeBtn.addEventListener('click', (e) => {
                    e.target.closest('.modal').classList.remove('show');
                });
            });

            // Notification権限要求
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
        }

        // ===================================================================
        // Main Loop
        // ===================================================================
        setInterval(() => {
            if (missionState.missionActive) {
                updateTimeline();
            }
        }, 1000);

        // ===================================================================
        // 初期化実行
        // ===================================================================
        document.addEventListener('DOMContentLoaded', () => {
            initializeUI();

            // Slack予約送信チェック
            setInterval(() => {
                checkSlackQueue();
            }, 5000);
        });

        function checkSlackQueue() {
            const slackQueue = JSON.parse(localStorage.getItem('slackQueue') || '[]');
            const now = new Date();

            slackQueue.forEach((item, index) => {
                if (!item.sent && new Date(item.scheduledTime) <= now) {
                    console.log('📨 Slack Message Sent:', item.message);
                    item.sent = true;
                    // 実際のSlack送信処理はここで実行（WebhookなどAPI呼び出し）
                }
            });

            localStorage.setItem('slackQueue', JSON.stringify(slackQueue));
        }

// ===================================================================
        // ユーティリティ関数
        // ===================================================================
        function copyToClipboard(selector) {
            const element = document.querySelector(selector);
            if (element) {
                const text = element.textContent;
                navigator.clipboard.writeText(text).then(() => {
                    alert('✓ Copied to clipboard!');
                });
            }
        }

        // Abort Modalが表示されたとき自動的に言い訳を生成
        const abortModal = document.getElementById('abort-modal');
        const abortObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    if (abortModal.classList.contains('show')) {
                        const abortExcuse = document.getElementById('abort-excuse');
                        if (abortExcuse && abortExcuse.textContent === '[言い訳を生成してください]') {
                            abortExcuse.textContent = generateExcuse();
                        }
                    }
                }
            });
        });

        abortObserver.observe(abortModal, { attributes: true });