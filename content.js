// content.js

// Check for Auto Mode & Settings
const urlParams = new URLSearchParams(window.location.search);
const isAutoMode = urlParams.get('auto') === 'true';
const settingScrollSpeed = parseInt(urlParams.get('speed')) || 200;
const settingCloseDelay = parseInt(urlParams.get('delay')) || 3;
const downloadFormat = urlParams.get('format') || 'images'; // 'images', 'pdf', 'zip'

// --- Configuration ---
const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;

// Global state
let allFoundCandidates = [];
let globalSeenUrls = new Set();
let processedCanvases = new WeakSet();
let autoScrollTimer = null;

// ========== PROGRESS INDICATOR ==========
function createProgressOverlay() {
    if (document.getElementById('ed-progress-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'ed-progress-overlay';
    overlay.innerHTML = `
        <div id="ed-progress-box">
            <div id="ed-progress-title">Epsilon Downloader</div>
            <div id="ed-progress-status">Initializing...</div>
            <div id="ed-progress-bar-container">
                <div id="ed-progress-bar"></div>
            </div>
            <div id="ed-progress-count"></div>
        </div>
    `;
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7); z-index: 999999;
        display: flex; align-items: center; justify-content: center;
    `;

    const box = overlay.querySelector('#ed-progress-box');
    box.style.cssText = `
        background: #1a1a1a; border-radius: 12px; padding: 24px 32px;
        min-width: 300px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;

    overlay.querySelector('#ed-progress-title').style.cssText = `
        color: #dc2626; font-size: 18px; font-weight: bold; margin-bottom: 16px;
    `;
    overlay.querySelector('#ed-progress-status').style.cssText = `
        color: #fff; font-size: 14px; margin-bottom: 12px;
    `;
    overlay.querySelector('#ed-progress-bar-container').style.cssText = `
        background: #333; border-radius: 8px; height: 8px; overflow: hidden; margin-bottom: 8px;
    `;
    overlay.querySelector('#ed-progress-bar').style.cssText = `
        background: linear-gradient(90deg, #dc2626, #f87171); height: 100%; width: 0%;
        transition: width 0.3s ease;
    `;
    overlay.querySelector('#ed-progress-count').style.cssText = `
        color: #888; font-size: 12px;
    `;

    document.body.appendChild(overlay);
}

function updateProgress(status, percent, count) {
    const statusEl = document.getElementById('ed-progress-status');
    const barEl = document.getElementById('ed-progress-bar');
    const countEl = document.getElementById('ed-progress-count');

    if (statusEl) statusEl.textContent = status;
    if (barEl) barEl.style.width = `${percent}%`;
    if (countEl) countEl.textContent = count || '';
}

function removeProgressOverlay() {
    const overlay = document.getElementById('ed-progress-overlay');
    if (overlay) overlay.remove();
}

// ========== ZIP GENERATION ==========
async function generateZip(imageUrls) {
    if (!window.JSZip) {
        throw new Error('JSZip library not loaded');
    }

    const zip = new JSZip();
    const total = imageUrls.length;

    for (let i = 0; i < total; i++) {
        updateProgress('Creating ZIP...', ((i + 1) / total) * 100, `${i + 1} / ${total} images`);

        const url = imageUrls[i];
        const filename = `${String(i + 1).padStart(3, '0')}.jpg`;

        try {
            // Convert data URL to blob
            if (url.startsWith('data:')) {
                const response = await fetch(url);
                const blob = await response.blob();
                zip.file(filename, blob);
            } else {
                // For regular URLs, try to fetch
                const response = await fetch(url);
                const blob = await response.blob();
                zip.file(filename, blob);
            }
        } catch (e) {
            console.warn(`Failed to add image ${i + 1} to ZIP:`, e);
        }
    }

    updateProgress('Compressing ZIP...', 100, 'Please wait...');
    const blob = await zip.generateAsync({ type: 'blob' });
    return URL.createObjectURL(blob);
}

// ========== FINISH AUTO DOWNLOAD ==========
async function finishAutoDownload() {
    console.log(`Auto Scroll Finished. Format: ${downloadFormat}`);

    createProgressOverlay();
    updateProgress('Processing images...', 10, '');

    const candidates = getAllCandidates();
    const selectedUrls = candidates.map(c => c.src);

    // Get title
    let title = document.title;
    const h1 = document.querySelector('h1');
    if (h1) title = h1.innerText;
    title = title.replace(/[<>:"/\\|?*]/g, "").trim();

    if (selectedUrls.length === 0) {
        removeProgressOverlay();
        console.warn("No images found during auto-scroll.");
        alert("Epsilon Downloader: No images found. Scroll might have failed.");
        return;
    }

    updateProgress(`Found ${selectedUrls.length} images`, 20, '');

    // ===== PDF FORMAT =====
    if (downloadFormat === 'pdf') {
        try {
            updateProgress('Generating PDF...', 30, '');

            if (!window.jspdf || !window.jspdf.jsPDF) {
                throw new Error('jsPDF library not loaded');
            }

            const pdfUrl = await generatePdf(selectedUrls);
            updateProgress('Downloading PDF...', 90, '');

            chrome.runtime.sendMessage({
                action: "download_images",
                isPdf: true,
                pdfUrl: pdfUrl,
                chapterTitle: title,
                autoClose: true
            });

            setTimeout(removeProgressOverlay, 1500);
            return;

        } catch (e) {
            removeProgressOverlay();
            console.error("PDF generation failed:", e);
            alert("Error generating PDF: " + e.message);
            return;
        }
    }

    // ===== ZIP FORMAT =====
    if (downloadFormat === 'zip') {
        try {
            updateProgress('Creating ZIP archive...', 30, '');

            if (!window.JSZip) {
                throw new Error('JSZip library not loaded');
            }

            const zipUrl = await generateZip(selectedUrls);
            updateProgress('Downloading ZIP...', 90, '');

            chrome.runtime.sendMessage({
                action: "download_images",
                isZip: true,
                zipUrl: zipUrl,
                chapterTitle: title,
                autoClose: true
            });

            setTimeout(removeProgressOverlay, 1500);
            return;

        } catch (e) {
            removeProgressOverlay();
            console.error("ZIP generation failed:", e);
            alert("Error generating ZIP: " + e.message);
            return;
        }
    }

    // ===== IMAGES FORMAT (Default) =====
    updateProgress('Downloading images...', 50, `${selectedUrls.length} files`);

    chrome.runtime.sendMessage({
        action: "download_images",
        images: selectedUrls,
        chapterTitle: title,
        autoClose: true
    });

    setTimeout(removeProgressOverlay, 1500);
}

async function generatePdf(imageUrls) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'px',
        format: 'a4',
        putOnlyUsedFonts: true
    });

    doc.deletePage(1); // Remove default first page

    const total = imageUrls.length;

    for (let i = 0; i < total; i++) {
        const url = imageUrls[i];
        updateProgress('Creating PDF...', 30 + ((i + 1) / total) * 50, `${i + 1} / ${total} images`);

        try {
            const img = await loadImage(url);
            const imgWidth = img.width;
            const imgHeight = img.height;

            doc.addPage([imgWidth, imgHeight]);
            doc.addImage(img, 'JPEG', 0, 0, imgWidth, imgHeight);

        } catch (e) {
            console.warn("Skipping bad image for PDF:", url);
        }
    }

    updateProgress('Finalizing PDF...', 85, '');
    return doc.output('datauristring');
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function createDownloadButton() {
    const existing = document.getElementById('epsilon-downloader-btn');
    if (existing) existing.remove();

    const btn = document.createElement('button');
    btn.id = 'epsilon-downloader-btn';
    btn.innerText = 'Download Chapter (0)';
    document.body.appendChild(btn);

    btn.addEventListener('click', () => {
        scanAndShowModal();
    });

    startAutoCapture();

    if (isAutoMode) {
        console.log(`Auto Mode: speed=${settingScrollSpeed}ms, delay=${settingCloseDelay}s, format=${downloadFormat}`);
        // Show progress overlay during scrolling
        createProgressOverlay();
        updateProgress('Scrolling page...', 5, 'Capturing images');
        setTimeout(startAutoScroll, 1000);
    }
}

function startAutoScroll() {
    console.log("Starting reliable auto-scroll...");

    // We aim for 100px every 'settingScrollSpeed' ms.
    // In background, intervals might throttle to 1000ms.
    // If we rely on fixed distance per tick, it becomes very slow.
    // Solution: Time-based scrolling.

    const speedPerSec = (1000 / settingScrollSpeed) * 100; // pixels per second target
    const stepInterval = 100; // Try to run logic every 100ms

    let lastScrollY = window.scrollY;
    let samePosCount = 0;

    autoScrollTimer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        const currentScroll = window.scrollY;
        const targetScroll = currentScroll + (speedPerSec * (stepInterval / 1000));

        window.scrollTo(0, targetScroll);

        // Check progress
        if (Math.abs(window.scrollY - lastScrollY) < 10) {
            samePosCount++;
        } else {
            samePosCount = 0;
            // Scan for new content while scrolling
            scanForNewCanvases();
        }

        lastScrollY = window.scrollY;

        // Update progress indicator during scroll
        const scrollPercent = Math.min(100, (currentScroll / (scrollHeight - window.innerHeight)) * 100);
        const capturedCount = allFoundCandidates.length;
        updateProgress('Scrolling page...', Math.max(5, scrollPercent * 0.5), `Captured: ${capturedCount} images`);

        // End Condition: Bottom reached OR Stuck for too long (loading finished)
        if ((window.innerHeight + window.scrollY) >= scrollHeight - 50 || samePosCount > 20) {

            // If we are stuck but height is small, maybe just loading?
            // But if we are at bottom, we are good.
            if ((window.innerHeight + window.scrollY) >= scrollHeight - 50) {
                clearInterval(autoScrollTimer);
                console.log(`Bottom reached. Waiting ${settingCloseDelay}s...`);
                updateProgress('Scroll complete!', 50, `Found ${capturedCount} images. Processing...`);
                setTimeout(finishAutoDownload, settingCloseDelay * 1000);
            }
        }
    }, stepInterval);
}

// Throttling utility
function throttle(func, limit) {
    let inThrottle;
    return function () {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

function startAutoCapture() {
    console.log("Starting auto-capture observer...");

    // Check immediately
    scanForNewCanvases();

    // Check on scroll (throttled to 150ms for faster capture)
    window.addEventListener('scroll', throttle(scanForNewCanvases, 150));

    // Also check periodically (500ms for faster detection of lazy-loaded content)
    setInterval(scanForNewCanvases, 500);
}

function scanForNewCanvases() {
    const container = document.querySelector('section.flex.flex-col.mx-auto.gap-0');
    if (!container) return; // Not on the manga page yet

    const canvases = container.querySelectorAll('canvas');
    let addedCount = 0;

    canvases.forEach((canvas, idx) => {
        // Skip if already snapped
        if (processedCanvases.has(canvas)) return;

        // Skip if not fully loaded/rendered
        if (canvas.width < MIN_WIDTH || canvas.height < MIN_HEIGHT) return;

        try {
            // Snapshot!
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

            // Double check dedup by content (just in case)
            if (!globalSeenUrls.has(dataUrl)) {
                allFoundCandidates.push({
                    element: canvas,
                    type: 'canvas_snapshot',
                    src: dataUrl,
                    width: canvas.width,
                    height: canvas.height,
                    isCanvas: true,
                    id: `canvas-${Date.now()}-${idx}`,
                    isSigned: false,
                    selected: true // Auto-select captured ones
                });
                globalSeenUrls.add(dataUrl);
            }

            // Mark element as processed so we don't snapshot it again
            processedCanvases.add(canvas);
            addedCount++;

        } catch (e) {
            // console.warn('Snapshot failed', e);
        }
    });

    if (addedCount > 0) {
        // Update button text
        const btn = document.getElementById('epsilon-downloader-btn');
        if (btn) btn.innerText = `Download Chapter (${allFoundCandidates.length})`;
    }
}

// Scrape page for anything looking like an image
function getAllCandidates() {
    // Just return what we have accumulated, plus maybe a quick check for non-canvas images

    // STRATEGY 1: Check for JSON data (Run once if empty)
    if (allFoundCandidates.length === 0) {
        const appEl = document.getElementById('app');
        if (appEl) {
            const rawData = appEl.getAttribute('data-page');
            if (rawData) {
                try {
                    const data = JSON.parse(rawData);
                    const signedUrls = data?.props?.data?.signed_urls;
                    if (Array.isArray(signedUrls)) {
                        signedUrls.forEach(url => {
                            if (!globalSeenUrls.has(url)) {
                                allFoundCandidates.push({ type: 'json', src: url, width: 1000, height: 1500, isSigned: true, selected: true });
                                globalSeenUrls.add(url);
                            }
                        });
                    }
                } catch (e) { }
            }
        }
    }

    return allFoundCandidates;
}

function scanAndShowModal() {
    const candidates = getAllCandidates();

    // Initial Filter: select likely candidates if they are new
    candidates.forEach(c => {
        if (c.selected === undefined) {
            if (c.type === 'json') c.selected = true;
            else {
                const isBigEnough = (c.width > MIN_WIDTH || c.height > MIN_HEIGHT);
                c.selected = isBigEnough;
            }
        }
    });

    if (candidates.length === 0) {
        alert("No images found yet. Please scroll down to load canvases and try again.");
        return;
    }

    showSelectionModal(candidates);
}

function showSelectionModal(candidates) {
    // defined in a way to easily remove it later
    const modalId = 'ed-modal-overlay';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    // HTML Structure
    const overlay = document.createElement('div');
    overlay.id = modalId;

    const content = document.createElement('div');
    content.id = 'ed-modal-content';

    // Title
    let title = document.title;
    const h1 = document.querySelector('h1');
    if (h1) title = h1.innerText;
    title = title.replace(/[<>:"/\\|?*]/g, "").trim(); // Sanitize

    content.innerHTML = `
      <div class="ed-modal-header">
        <h2>Found ${candidates.length} Images - ${title}</h2>
        <button class="ed-modal-close">&times;</button>
      </div>
      <div class="ed-modal-toolbar">
        <button id="ed-btn-all" class="ed-btn-sm">Select All</button>
        <button id="ed-btn-none" class="ed-btn-sm">Select None</button>
        <button id="ed-btn-big" class="ed-btn-sm">Smart Select (>200px)</button>
        <div style="flex:1;"></div>
        <select id="ed-format-select" style="padding:6px 10px; border-radius:4px; background:#333; color:#fff; border:1px solid #555; margin-right:8px;">
          <option value="images">📁 Images</option>
          <option value="pdf">📄 PDF</option>
          <option value="zip">📦 ZIP</option>
        </select>
        <button id="ed-btn-download" class="ed-btn-sm ed-btn-primary">Download (<span id="ed-count">0</span>)</button>
      </div>
      <div class="ed-image-grid" id="ed-grid"></div>
    `;

    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // Render Grid
    const grid = content.querySelector('#ed-grid');
    const updateCount = () => {
        const count = candidates.filter(c => c.selected).length;
        content.querySelector('#ed-count').innerText = count;
    };

    candidates.forEach((c, index) => {
        const card = document.createElement('div');
        card.className = `ed-image-card ${c.selected ? 'selected' : ''}`;
        card.innerHTML = `
            <img src="${c.src}" loading="lazy">
            <div class="ed-checkbox-overlay"></div>
            <div class="ed-res-tag">${c.isSigned ? 'HD Source' : (c.width || '?') + ' x ' + (c.height || '?')}</div>
        `;

        // Toggle Logic
        card.addEventListener('click', () => {
            c.selected = !c.selected;
            if (c.selected) card.classList.add('selected');
            else card.classList.remove('selected');
            updateCount();
        });

        grid.appendChild(card);
        c.cardElement = card; // Store ref to update UI from toolbar
    });

    updateCount();

    // Event Listeners
    content.querySelector('.ed-modal-close').addEventListener('click', () => overlay.remove());

    // Toolbar Actions
    content.querySelector('#ed-btn-all').addEventListener('click', () => {
        candidates.forEach(c => {
            c.selected = true;
            c.cardElement.classList.add('selected');
        });
        updateCount();
    });

    content.querySelector('#ed-btn-none').addEventListener('click', () => {
        candidates.forEach(c => {
            c.selected = false;
            c.cardElement.classList.remove('selected');
        });
        updateCount();
    });

    content.querySelector('#ed-btn-big').addEventListener('click', () => {
        candidates.forEach(c => {
            if (c.type === 'json') c.selected = true;
            else c.selected = (c.width > MIN_WIDTH || c.height > MIN_HEIGHT);

            if (c.selected) c.cardElement.classList.add('selected');
            else c.cardElement.classList.remove('selected');
        });
        updateCount();
    });

    content.querySelector('#ed-btn-download').addEventListener('click', async () => {
        const selectedUrls = candidates.filter(c => c.selected).map(c => c.src);
        if (selectedUrls.length === 0) {
            alert("No images selected!");
            return;
        }

        const formatSelect = content.querySelector('#ed-format-select');
        const selectedFormat = formatSelect ? formatSelect.value : 'images';

        // Close modal first
        overlay.remove();

        // Show progress overlay
        createProgressOverlay();
        updateProgress('Preparing download...', 10, `${selectedUrls.length} images`);

        try {
            if (selectedFormat === 'pdf') {
                // PDF Generation
                updateProgress('Generating PDF...', 20, '');

                if (!window.jspdf || !window.jspdf.jsPDF) {
                    throw new Error('jsPDF library not loaded');
                }

                const pdfUrl = await generatePdf(selectedUrls);
                updateProgress('Downloading PDF...', 90, '');

                chrome.runtime.sendMessage({
                    action: "download_images",
                    isPdf: true,
                    pdfUrl: pdfUrl,
                    chapterTitle: title
                });

            } else if (selectedFormat === 'zip') {
                // ZIP Generation
                updateProgress('Creating ZIP...', 20, '');

                if (!window.JSZip) {
                    throw new Error('JSZip library not loaded');
                }

                const zipUrl = await generateZip(selectedUrls);
                updateProgress('Downloading ZIP...', 90, '');

                chrome.runtime.sendMessage({
                    action: "download_images",
                    isZip: true,
                    zipUrl: zipUrl,
                    chapterTitle: title
                });

            } else {
                // Default: Individual images
                updateProgress('Downloading images...', 50, `${selectedUrls.length} files`);

                chrome.runtime.sendMessage({
                    action: "download_images",
                    images: selectedUrls,
                    chapterTitle: title
                });
            }

            setTimeout(removeProgressOverlay, 2000);

        } catch (e) {
            removeProgressOverlay();
            console.error("Download failed:", e);
            alert("Download failed: " + e.message);
        }
    });
}
// Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createDownloadButton);
} else {
    createDownloadButton();
}
