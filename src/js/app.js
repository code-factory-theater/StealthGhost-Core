// ============================================================================
        // STEALTH WORK SUITE - PHASE 3: ACOUSTIC STEALTH SONAR
        // Web Audio API Integration for Auto-Panic Triggering
        // ============================================================================

        class AcousticStealth {
            constructor() {
                this.audioContext = null;
                this.analyser = null;
                this.microphone = null;
                this.isListening = false;
                this.baselineNoise = null;
                this.calibrationTime = 3000; // 3 seconds
                this.isCalibrated = false;
                this.sensitivity = 1.0; // 1.0 = standard
                this.defconLevel = 4; // 4=safe, 1=emergency
                this.lastPanicTime = 0;
                this.panicLockoutTime = 15000; // 15 seconds minimum
                this.enableTypingSFX = false;
                this.lastSpikeTime = 0;
                this.spikeDebounce = 300; // 300ms debounce
                this.dataArray = new Uint8Array(256);
                this.frequencyData = new Uint8Array(256);
                this.sonarCanvas = null;
                this.sonarCtx = null;
                this.metrics = {
                    falseTriggers: 0,
                    successfulDetections: 0,
                    averageResponseTime: 0,
                    calibrationStatus: 'pending'
                };
            }

            async initialize() {
                try {
                    if (this.audioContext) return;
                    
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    this.analyser = this.audioContext.createAnalyser();
                    this.analyser.fftSize = 512;
                    
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        audio: { 
                            echoCancellation: true,
                            noiseSuppression: false,
                            autoGainControl: false 
                        } 
                    });
                    
                    this.microphone = this.audioContext.createMediaStreamSource(stream);
                    this.microphone.connect(this.analyser);
                    
                    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
                    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
                    
                    this.updateUI('micStatus', 'active');
                    this.startListening();
                    
                    return { success: true, message: 'Microphone initialized' };
                } catch (error) {
                    console.error('Microphone initialization failed:', error);
                    this.updateUI('micStatus', 'error');
                    this.fallbackToMouseMode();
                    return { success: false, message: error.message };
                }
            }

            startListening() {
                if (this.isListening) return;
                this.isListening = true;
                this.metrics.calibrationStatus = 'calibrating';
                this.updateUI('calibrationStatus', 'Calibrating...');
                
                // Calibrate for 3 seconds
                this.calibrate();
            }

            calibrate() {
                let calibrationSamples = [];
                let sampleCount = 0;
                const samplesNeeded = 30; // Collect 30 samples over 3 seconds
                
                const collectSample = () => {
                    if (sampleCount < samplesNeeded) {
                        this.analyser.getByteFrequencyData(this.frequencyData);
                        const average = this.frequencyData.reduce((a, b) => a + b) / this.frequencyData.length;
                        calibrationSamples.push(average);
                        sampleCount++;
                        setTimeout(collectSample, 100);
                    } else {
                        // Calculate baseline
                        this.baselineNoise = calibrationSamples.reduce((a, b) => a + b) / calibrationSamples.length;
                        this.isCalibrated = true;
                        this.metrics.calibrationStatus = 'complete';
                        this.updateUI('calibrationStatus', `Calibrated: ${this.baselineNoise.toFixed(1)}dB`);
                        this.continuousMonitoring();
                    }
                };
                
                collectSample();
            }

            continuousMonitoring() {
                const monitor = () => {
                    if (!this.isListening) return;
                    
                    this.analyser.getByteFrequencyData(this.frequencyData);
                    this.analyser.getByteTimeDomainData(this.dataArray);
                    
                    const currentLevel = this.frequencyData.reduce((a, b) => a + b) / this.frequencyData.length;
                    const rms = this.calculateRMS(this.dataArray);
                    
                    this.updateDefconLevel(currentLevel, rms);
                    this.checkForSpike(currentLevel, rms);
                    this.renderSonarHUD(currentLevel);
                    
                    requestAnimationFrame(monitor);
                };
                
                monitor();
            }

            calculateRMS(data) {
                let sum = 0;
                for (let i = 0; i < data.length; i++) {
                    const normalized = (data[i] - 128) / 128;
                    sum += normalized * normalized;
                }
                return Math.sqrt(sum / data.length);
            }

            checkForSpike(currentLevel, rms) {
                if (!this.isCalibrated) return;
                
                const now = Date.now();
                const threshold = this.baselineNoise + (18 * this.sensitivity);
                const rmsThreshold = 0.15 * this.sensitivity;
                
                const hasSpike = (currentLevel > threshold) || (rms > rmsThreshold);
                
                if (hasSpike && (now - this.lastSpikeTime) > this.spikeDebounce) {
                    const timeSinceLastPanic = now - this.lastPanicTime;
                    
                    if (timeSinceLastPanic > this.panicLockoutTime) {
                        this.triggerEmergencyPanic();
                        this.lastSpikeTime = now;
                        this.metrics.successfulDetections++;
                    }
                }
            }

            updateDefconLevel(currentLevel, rms) {
                if (!this.isCalibrated) {
                    this.defconLevel = 4;
                    return;
                }
                
                const delta = currentLevel - this.baselineNoise;
                
                if (delta < 2) {
                    this.defconLevel = 4; // Green - Safe
                } else if (delta < 6) {
                    this.defconLevel = 3; // Yellow - Caution
                } else if (delta < 12) {
                    this.defconLevel = 2; // Orange - Warning
                } else {
                    this.defconLevel = 1; // Red - Emergency
                }
                
                this.updateSonarHUD();
            }

            renderSonarHUD(level) {
                if (!this.sonarCanvas) return;
                
                const size = 200;
                this.sonarCanvas.width = size;
                this.sonarCanvas.height = size;
                
                const ctx = this.sonarCtx;
                const centerX = size / 2;
                const centerY = size / 2;
                
                // Clear
                ctx.fillStyle = 'rgba(20, 30, 60, 0.2)';
                ctx.fillRect(0, 0, size, size);
                
                // Draw concentric circles
                ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
                ctx.lineWidth = 1;
                for (let i = 1; i <= 4; i++) {
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, (size / 2) * (i / 4), 0, Math.PI * 2);
                    ctx.stroke();
                }
                
                // Draw cross
                ctx.strokeStyle = 'rgba(0, 255, 0, 0.15)';
                ctx.beginPath();
                ctx.moveTo(centerX, 0);
                ctx.lineTo(centerX, size);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, centerY);
                ctx.lineTo(size, centerY);
                ctx.stroke();
                
                // Draw audio wave as radar blip
                const normalized = Math.min(level / 100, 1);
                const radius = (size / 2) * 0.8 * normalized;
                const angle = (Date.now() % 3000) / 3000 * Math.PI * 2;
                
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;
                
                ctx.fillStyle = this.getDefconColor();
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw ping radius
                ctx.strokeStyle = this.getDefconColor();
                ctx.globalAlpha = 0.3;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }

            getDefconColor() {
                switch(this.defconLevel) {
                    case 4: return '#00ff00';
                    case 3: return '#ffff00';
                    case 2: return '#ff8800';
                    case 1: return '#ff0000';
                    default: return '#00ff00';
                }
            }

            updateSonarHUD() {
                const widget = document.querySelector('.sonar-hud');
                if (!widget) return;
                
                // Update class
                widget.className = `sonar-hud defcon-${this.defconLevel}`;
                
                // Update content
                const statusText = ['CRITICAL', 'WARNING', 'CAUTION', 'SAFE'][4 - this.defconLevel];
                const color = this.getDefconColor();
                
                const content = widget.querySelector('.sonar-content');
                if (content) {
                    content.innerHTML = `
                        <div class="sonar-defcon" style="color: ${color};">DEFCON ${this.defconLevel}</div>
                        <div class="sonar-status">${statusText}</div>
                        <div class="sonar-level">${this.baselineNoise ? (this.baselineNoise + 3).toFixed(0) + ' dB' : '---'}</div>
                    `;
                }
            }

            triggerEmergencyPanic() {
                console.log('🚨 SPIKE DETECTED - TRIGGERING EMERGENCY PANIC');
                this.lastPanicTime = Date.now();
                
                if (this.enableTypingSFX) {
                    this.playTypingSFX();
                }
                
                // Dispatch custom event for integration with existing panic system
                window.dispatchEvent(new CustomEvent('stealth:emergency-panic', {
                    detail: { source: 'acoustic-sonar', timestamp: Date.now() }
                }));
                
                // Update metrics
                this.metrics.successfulDetections++;
            }

            playTypingSFX() {
                // Generate simple typing sound using Web Audio API
                try {
                    const audioCtx = this.audioContext;
                    const now = audioCtx.currentTime;
                    
                    // Create a quick "tap" sound
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    
                    osc.frequency.setValueAtTime(800, now);
                    osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
                    
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                    
                    osc.start(now);
                    osc.stop(now + 0.05);
                } catch (e) {
                    // Silent fail
                }
            }

            setSensitivity(value) {
                this.sensitivity = parseFloat(value);
                this.updateUI('sensitivityValue', `${(this.sensitivity * 100).toFixed(0)}%`);
            }

            setSFX(enabled) {
                this.enableTypingSFX = enabled;
            }

            stopListening() {
                this.isListening = false;
                if (this.microphone) {
                    this.microphone.disconnect();
                }
            }

            updateUI(element, value) {
                const el = document.getElementById(element);
                if (el) el.textContent = value;
            }

            fallbackToMouseMode() {
                console.warn('Falling back to mouse-based panic mode');
                document.getElementById('panicMode').value = 'mouse';
            }

            getMetrics() {
                return this.metrics;
            }
        }

        // ============================================================================
        // BLUFF SCREEN SYSTEM - Existing Phase 2 Integration
        // ============================================================================

        class BluffScreen {
            constructor() {
                this.currentMode = 'excel';
                this.isActive = false;
                this.activationTime = null;
            }

            activate(mode = null) {
                if (mode) this.currentMode = mode;
                this.isActive = true;
                this.activationTime = Date.now();
                
                document.body.classList.add('bluff-active');
                this.renderBluffScreen();
                console.log(`🎭 Bluff Screen Activated: ${this.currentMode}`);
            }

            deactivate() {
                this.isActive = false;
                document.body.classList.remove('bluff-active');
                console.log('✅ Bluff Screen Deactivated');
            }

            renderBluffScreen() {
                let html = '';
                
                switch(this.currentMode) {
                    case 'excel':
                        html = this.generateExcelHtml();
                        break;
                    case 'hacker':
                        html = this.generateHackerHtml();
                        break;
                    case 'error':
                        html = this.generateErrorHtml();
                        break;
                }
                
                // Store in a data attribute or create fullscreen overlay
                const existing = document.getElementById('bluff-overlay');
                if (existing) existing.remove();
                
                const overlay = document.createElement('div');
                overlay.id = 'bluff-overlay';
                overlay.innerHTML = html;
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: white;
                    z-index: 8000;
                    overflow: auto;
                `;
                
                document.body.appendChild(overlay);
            }

            generateExcelHtml() {
                return `
                    <div style="font-family: Calibri, sans-serif; padding: 20px; background: #f2f2f2; min-height: 100vh;">
                        <div style="background: white; margin: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                            <h2 style="color: #333; margin-bottom: 10px;">Q4 Financial Analysis Spreadsheet</h2>
                            <table style="width: 100%; border-collapse: collapse; background: white;">
                                <thead>
                                    <tr style="background: #4472c4; color: white;">
                                        <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Department</th>
                                        <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Revenue</th>
                                        <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Expenses</th>
                                        <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Margin %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${Array.from({length: 10}, (_, i) => `
                                        <tr style="background: ${i % 2 ? '#f0f0f0' : 'white'};">
                                            <td style="padding: 8px; border: 1px solid #ddd;">Department ${i+1}</td>
                                            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${(Math.random()*1000000).toFixed(0)}</td>
                                            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${(Math.random()*500000).toFixed(0)}</td>
                                            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${(Math.random()*50).toFixed(1)}%</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }

            generateHackerHtml() {
                return `
                    <div style="background: #0a0e27; color: #00ff00; font-family: 'Courier New', monospace; min-height: 100vh; padding: 20px; overflow: auto; text-shadow: 0 0 10px rgba(0,255,0,0.3);">
                        <div style="font-size: 12px; line-height: 1.8;">
                            <div>$ analyzing_database_integrity.sh</div>
                            <div style="margin: 20px 0;">Analyzing database integrity...</div>
                            ${Array.from({length: 15}, () => `<div>├─ PASS: Sector ${Math.floor(Math.random()*9999)} verified</div>`).join('')}
                            <div style="margin: 10px 0; color: #ffff00;">⚠ WARNING: Anomaly detected in sector 7742</div>
                            <div>$ investigating_anomaly.sh</div>
                            <div style="margin: 10px 0; animation: pulse 1s infinite;">█ Scanning...</div>
                        </div>
                    </div>
                `;
            }

            generateErrorHtml() {
                return `
                    <div style="background: #f0f0f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;">
                        <div style="background: white; border: 3px solid #ff0000; border-radius: 8px; padding: 40px; text-align: center; max-width: 500px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                            <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
                            <h1 style="color: #d32f2f; margin: 10px 0;">CRITICAL SYSTEM ERROR</h1>
                            <p style="color: #666; margin: 20px 0; font-size: 14px; line-height: 1.6;">
                                A critical system error has been detected. The system will attempt to recover.<br/>
                                <strong>Error Code: 0x80004005</strong><br/>
                                Technical details logged for administrator review.
                            </p>
                            <div style="background: #f5f5f5; border: 1px solid #ddd; padding: 15px; margin: 20px 0; border-radius: 4px; text-align: left; font-family: 'Courier New', monospace; font-size: 11px; color: #333;">
                                KERNEL_MODE_EXCEPTION_NOT_HANDLED<br/>
                                0x0000007E: SYSTEM_THREAD_EXCEPTION_NOT_HANDLED<br/>
                                Address fffff8000123abcd base at fffff800001abcd00<br/>
                            </div>
                            <button style="padding: 10px 30px; background: #d32f2f; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">Retry</button>
                        </div>
                    </div>
                `;
            }

            isDisplayed() {
                return this.isActive && document.getElementById('bluff-overlay') !== null;
            }
        }

        // ============================================================================
        // PANIC SYSTEM - Mouse-based trigger (Phase 2 legacy)
        // ============================================================================

        class PanicSystem {
            constructor(bluffScreen) {
                this.bluffScreen = bluffScreen;
                this.mouseSensitivity = 8;
                this.lastMouseX = 0;
                this.lastMouseY = 0;
                this.velocityThreshold = 15;
                this.panicActive = false;
                this.panicLockout = 5000;
                this.lastPanicTime = 0;
            }

            initMouseTracking() {
                document.addEventListener('mousemove', (e) => {
                    const dx = e.clientX - this.lastMouseX;
                    const dy = e.clientY - this.lastMouseY;
                    const velocity = Math.sqrt(dx * dx + dy * dy);
                    
                    if (velocity > this.velocityThreshold && !this.bluffScreen.isDisplayed()) {
                        const now = Date.now();
                        if (now - this.lastPanicTime > this.panicLockout) {
                            this.trigger();
                            this.lastPanicTime = now;
                        }
                    }
                    
                    this.lastMouseX = e.clientX;
                    this.lastMouseY = e.clientY;
                });

                // Keyboard shortcut: Ctrl+Alt+P
                document.addEventListener('keydown', (e) => {
                    if (e.ctrlKey && e.altKey && e.code === 'KeyP') {
                        this.trigger();
                    }
                    
                    // Double Esc to exit
                    if (e.code === 'Escape') {
                        if (this.bluffScreen.isDisplayed()) {
                            this.deactivate();
                        }
                    }
                });
            }

            trigger() {
                console.log('🎯 PANIC TRIGGERED');
                this.bluffScreen.activate();
                this.panicActive = true;
            }

            deactivate() {
                this.bluffScreen.deactivate();
                this.panicActive = false;
            }
        }

        // ============================================================================
        // GLOBAL INITIALIZATION
        // ============================================================================

        let sonar = null;
        let bluffScreen = null;
        let panicSystem = null;

        document.addEventListener('DOMContentLoaded', () => {
            // Initialize systems
            bluffScreen = new BluffScreen();
            panicSystem = new PanicSystem(bluffScreen);
            sonar = new AcousticStealth();

            // Setup UI
            setupUI();
            panicSystem.initMouseTracking();

            // Listen for acoustic panic events
            window.addEventListener('stealth:emergency-panic', (e) => {
                if (!bluffScreen.isDisplayed()) {
                    console.log('📡 Acoustic panic event received');
                    panicSystem.trigger();
                }
            });

            // Listen for escape key exit with double-tap detection
            let escapeCount = 0;
            document.addEventListener('keydown', (e) => {
                if (e.code === 'Escape') {
                    escapeCount++;
                    if (escapeCount >= 2) {
                        panicSystem.deactivate();
                        escapeCount = 0;
                    }
                    setTimeout(() => escapeCount = 0, 500);
                }
            });

            // Also allow clicking on safety label twice to exit
            const safetyLabel = document.querySelector('.safety-hint');
            if (safetyLabel) {
                let clickCount = 0;
                safetyLabel.addEventListener('click', () => {
                    clickCount++;
                    if (clickCount >= 2) {
                        panicSystem.deactivate();
                        clickCount = 0;
                    }
                    setTimeout(() => clickCount = 0, 1000);
                });
            }
        });

        // ============================================================================
        // UI SETUP & HANDLERS
        // ============================================================================

        function setupUI() {
            // Sonar canvas setup
            const sonarWidget = document.querySelector('.sonar-hud');
            const canvas = document.createElement('canvas');
            canvas.className = 'sonar-canvas';
            sonarWidget.insertBefore(canvas, sonarWidget.firstChild);
            
            sonar.sonarCanvas = canvas;
            sonar.sonarCtx = canvas.getContext('2d');

            // Sensitivity slider
            const sensitivitySlider = document.getElementById('sensitivitySlider');
            if (sensitivitySlider) {
                sensitivitySlider.addEventListener('input', (e) => {
                    sonar.setSensitivity(e.target.value);
                });
            }

            // SFX toggle
            const sfxToggle = document.getElementById('sfxToggle');
            if (sfxToggle) {
                sfxToggle.addEventListener('click', () => {
                    sfxToggle.classList.toggle('active');
                    sonar.setSFX(sfxToggle.classList.contains('active'));
                });
            }

            // Start listening button
            const startBtn = document.getElementById('startAudioBtn');
            if (startBtn) {
                startBtn.addEventListener('click', async () => {
                    const result = await sonar.initialize();
                    if (result.success) {
                        startBtn.disabled = true;
                        document.getElementById('stopAudioBtn').disabled = false;
                    }
                });
            }

            // Stop listening button
            const stopBtn = document.getElementById('stopAudioBtn');
            if (stopBtn) {
                stopBtn.addEventListener('click', () => {
                    sonar.stopListening();
                    stopBtn.disabled = true;
                    startBtn.disabled = false;
                    document.getElementById('micStatus').textContent = 'Inactive';
                });
            }

            // Bluff screen mode selector
            const modeSelector = document.getElementById('bluffMode');
            if (modeSelector) {
                modeSelector.addEventListener('change', (e) => {
                    bluffScreen.currentMode = e.target.value;
                });
            }

            // Manual panic button
            const panicBtn = document.getElementById('manualPanicBtn');
            if (panicBtn) {
                panicBtn.addEventListener('click', () => {
                    panicSystem.trigger();
                });
            }

            // Exit button
            const exitBtn = document.getElementById('exitBtn');
            if (exitBtn) {
                exitBtn.addEventListener('click', () => {
                    panicSystem.deactivate();
                });
            }

            // Metrics update loop
            setInterval(updateMetrics, 1000);
        }

        function updateMetrics() {
            if (!sonar) return;
            
            const metrics = sonar.getMetrics();
            document.getElementById('metricsSuccessful').textContent = metrics.successfulDetections;
            document.getElementById('metricsFalse').textContent = metrics.falseTriggers;
            document.getElementById('metricsCalib').textContent = metrics.calibrationStatus;
        }