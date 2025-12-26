document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    loadSettings();

    const downloadView = document.getElementById('view-download');

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('epsilonscan.to')) {
        downloadView.innerHTML = '<div class="loading">Please navigate to an Epsilon Scan manga page.</div>';
        return;
    }

    // Execute script in the context of the page to scrape details
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeMangaDetails,
    }, (results) => {
        if (chrome.runtime.lastError || !results || !results[0]) {
            downloadView.innerHTML = '<div class="loading">Failed to extract data. Make sure you are on a specific manga page.</div>';
            return;
        }

        const data = results[0].result;
        try {
            if (!data) {
                downloadView.innerHTML = '<div class="loading">No manga details found on this page.</div>';
                return;
            }
            renderUI(data);
        } catch (e) {
            downloadView.innerHTML = `<div class="loading">Error rendering UI: ${e.message}</div>`;
        }
    });
});

function initTabs() {
    const tabDownload = document.getElementById('tab-download');
    const tabSettings = document.getElementById('tab-settings');
    const viewDownload = document.getElementById('view-download');
    const viewSettings = document.getElementById('view-settings');

    if (tabDownload && tabSettings) {
        tabDownload.addEventListener('click', () => {
            tabDownload.classList.add('active');
            tabSettings.classList.remove('active');
            tabDownload.style.borderBottom = "2px solid #dc2626";
            tabDownload.style.color = "#fff";
            tabSettings.style.borderBottom = "none";
            tabSettings.style.color = "#888";

            viewDownload.style.display = 'block';
            viewSettings.style.display = 'none';
        });

        tabSettings.addEventListener('click', () => {
            tabSettings.classList.add('active');
            tabDownload.classList.remove('active');
            tabSettings.style.borderBottom = "2px solid #dc2626";
            tabSettings.style.color = "#fff";
            tabDownload.style.borderBottom = "none";
            tabDownload.style.color = "#888";

            viewSettings.style.display = 'block';
            viewDownload.style.display = 'none';
        });
    }

    const saveBtn = document.getElementById('btn-save-settings');
    if (saveBtn) saveBtn.addEventListener('click', saveSettings);
}

function loadSettings() {
    let settings = { scrollSpeed: 200, closeDelay: 3, format: 'images' };
    try {
        const saved = localStorage.getItem('ed-settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            settings = { ...settings, ...parsed };
            // Migrate old pdfMode setting
            if (parsed.pdfMode === true && !parsed.format) {
                settings.format = 'pdf';
            }
        }
    } catch (e) { }

    const speedInput = document.getElementById('setting-scroll-speed');
    const delayInput = document.getElementById('setting-close-delay');
    const formatSelect = document.getElementById('setting-format');

    if (speedInput) speedInput.value = settings.scrollSpeed;
    if (delayInput) delayInput.value = settings.closeDelay;
    if (formatSelect) formatSelect.value = settings.format;
}

function saveSettings() {
    const speed = parseInt(document.getElementById('setting-scroll-speed').value) || 200;
    const delay = parseInt(document.getElementById('setting-close-delay').value) || 3;
    const format = document.getElementById('setting-format').value || 'images';

    localStorage.setItem('ed-settings', JSON.stringify({
        scrollSpeed: speed,
        closeDelay: delay,
        format: format
    }));

    const msg = document.getElementById('settings-msg');
    if (msg) {
        msg.style.display = 'block';
        setTimeout(() => msg.style.display = 'none', 2000);
    }
}

function renderUI(data) {
    const mainDiv = document.getElementById('view-download');

    let html = `
        <div class="header">
            <img src="${data.cover}" class="cover-img" alt="Cover" style="background:#333;">
            <div class="info">
                <div class="title">${data.title}</div>
                <div class="alt-title">${data.altTitle || ''}</div>
                <div style="display:flex; gap: 4px; flex-wrap:wrap; margin-top:4px;">
                    ${data.genres.map(g => `<span style="font-size:10px; background:#333; padding:2px 4px; border-radius:3px; color:#ccc;">${g}</span>`).join('')}
                </div>
            </div>
        </div>
        
        <div class="desc">${data.synopsis}</div>
        
        <div style="font-size:13px; font-weight:bold; margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>Chapter List (${data.chapters.length})</span>
            <div>
                <button class="btn" style="font-size:10px; padding:2px 6px; background:#444;" id="btn-select-all">All</button>
                <button class="btn" style="font-size:10px; padding:2px 6px; background:#444;" id="btn-select-none">None</button>
            </div>
        </div>
        <div class="chapters-container" id="chapters-list">
    `;

    if (data.chapters.length === 0) {
        html += '<div style="padding:10px; text-align:center; color:#666;">No chapters found.</div>';
    } else {
        data.chapters.forEach((ch, idx) => {
            const isInvalid = (!ch.url || ch.url === '#' || !ch.url.startsWith('http'));

            html += `
                <div class="chapter-item" ${isInvalid ? 'style="opacity:0.5; pointer-events:none;"' : ''}>
                    <input type="checkbox" id="ch-${idx}" data-url="${ch.url}" style="cursor:pointer;" ${isInvalid ? 'disabled' : ''}>
                    <label for="ch-${idx}" style="flex:1; cursor:pointer; margin-left:8px; display:flex; justify-content:space-between;">
                        <span>${ch.title} ${isInvalid ? '(Unavailable)' : ''}</span>
                        <span class="chapter-date">${ch.date}</span>
                    </label>
                </div>
            `;
        });
    }

    html += `</div>
        <button id="btn-download-selected" class="btn" style="width:100%; margin-top:10px;">Download Selected</button>
    `;
    mainDiv.innerHTML = html;

    // Attach Events
    const btnAll = document.getElementById('btn-select-all');
    const btnNone = document.getElementById('btn-select-none');
    const btnDl = document.getElementById('btn-download-selected');

    if (btnAll) btnAll.addEventListener('click', () => toggleAll(true));
    if (btnNone) btnNone.addEventListener('click', () => toggleAll(false));
    if (btnDl) btnDl.addEventListener('click', startBatchDownload);
}

function toggleAll(state) {
    const checks = document.querySelectorAll('.chapter-item input[type="checkbox"]:not([disabled])');
    checks.forEach(c => c.checked = state);
}

function startBatchDownload() {
    const checks = document.querySelectorAll('.chapter-item input[type="checkbox"]:checked');
    const urls = Array.from(checks).map(c => c.getAttribute('data-url'));

    if (urls.length === 0) {
        alert("Please select at least one chapter.");
        return;
    }

    // Get Settings
    const speedInput = document.getElementById('setting-scroll-speed');
    const delayInput = document.getElementById('setting-close-delay');
    const formatSelect = document.getElementById('setting-format');

    const speed = speedInput ? (parseInt(speedInput.value) || 200) : 200;
    const delay = delayInput ? (parseInt(delayInput.value) || 3) : 3;
    const format = formatSelect ? formatSelect.value : 'images';

    // Send to background to process
    chrome.runtime.sendMessage({
        action: "queue_downloads",
        urls: urls,
        settings: {
            scrollSpeed: speed,
            closeDelay: delay,
            format: format
        }
    });

    // Feedback
    const btn = document.getElementById('btn-download-selected');
    btn.innerText = "Started! Check your tabs.";
    btn.disabled = true;
    setTimeout(() => window.close(), 1500);
}

// This function runs INSIDE the web page (async to handle image conversion)
async function scrapeMangaDetails() {
    try {
        const result = {
            title: document.title,
            cover: '',
            synopsis: '',
            genres: [],
            chapters: []
        };

        const origin = window.location.origin;

        // Helper: Convert image URL to data URL
        const imageToDataUrl = (imgUrl) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas.toDataURL('image/jpeg', 0.9));
                    } catch (e) {
                        resolve(imgUrl); // Fallback to original URL
                    }
                };
                img.onerror = () => resolve(imgUrl);
                // Timeout fallback
                setTimeout(() => resolve(imgUrl), 3000);
                img.src = imgUrl;
            });
        };

        // ========== STRATEGY 1: Parse JSON from #app data-page (MOST RELIABLE) ==========
        const appEl = document.getElementById('app');
        if (appEl && appEl.hasAttribute('data-page')) {
            try {
                const pageData = JSON.parse(appEl.getAttribute('data-page'));
                const props = pageData?.props;
                const serie = props?.serie;

                if (serie) {
                    // Extract series info
                    result.title = serie.name || serie.title || result.title;
                    result.synopsis = serie.description || '';

                    // Cover image - convert to data URL
                    if (serie.cover_image) {
                        const coverUrl = serie.cover_image.startsWith('http')
                            ? serie.cover_image
                            : origin + serie.cover_image;
                        result.cover = await imageToDataUrl(coverUrl);
                    }

                    // Genres
                    if (serie.genres && Array.isArray(serie.genres)) {
                        result.genres = serie.genres.map(g => g.name || g);
                    }

                    // Chapters - THE GOLD MINE!
                    const chaptersData = serie.chapters;
                    if (Array.isArray(chaptersData) && chaptersData.length > 0) {
                        const seriesSlug = serie.slug;

                        result.chapters = chaptersData.map(ch => {
                            // Build URL directly from the slug!
                            let url = "#";
                            if (ch.slug && seriesSlug) {
                                url = `${origin}/serie/${seriesSlug}/chapter/${ch.slug}`;
                            }

                            // Parse date
                            let dateStr = '';
                            if (ch.createdAt) {
                                try {
                                    dateStr = new Date(ch.createdAt).toLocaleDateString();
                                } catch (e) {
                                    dateStr = ch.createdAt;
                                }
                            }

                            return {
                                title: ch.title || `Chapter ${ch.chapterNumber}`,
                                date: dateStr,
                                url: url,
                                views: ch.views || 0,
                                isPremium: ch.isPremium || false
                            };
                        });

                        console.log(`[Epsilon] Found ${result.chapters.length} chapters from JSON data!`);
                        return result;
                    }
                }
            } catch (jsonErr) {
                console.warn("[Epsilon] JSON parsing failed, falling back to DOM:", jsonErr);
            }
        }

        // ========== STRATEGY 2: DOM Scraping Fallback ==========
        console.log("[Epsilon] Using DOM scraping fallback...");

        const titleEl = document.querySelector('h1.text-white.font-bold, h1');
        if (titleEl) result.title = titleEl.innerText.trim();

        const coverEl = document.querySelector('img.bg-card[src*="/storage/series/covers/"], img[src*="/storage"]');
        if (coverEl) result.cover = coverEl.src;

        const synopsisEl = document.querySelector('p.text-justify.line-clamp-6, p.text-justify');
        if (synopsisEl) result.synopsis = synopsisEl.innerText;

        const genreLinks = document.querySelectorAll('a[href*="/library?include_genres="]');
        result.genres = Array.from(genreLinks).map(a => a.innerText.trim());

        // Try to get series slug from URL
        const getSlugFromUrl = () => {
            const parts = window.location.pathname.split('/');
            let idx = parts.indexOf('serie');
            if (idx === -1) idx = parts.indexOf('series');
            if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
            return '';
        };
        const seriesSlug = getSlugFromUrl();

        // Target chapter buttons
        const chapterButtons = document.querySelectorAll('button[title^="Chapitre"], button[title^="Chapter"]');

        result.chapters = Array.from(chapterButtons).map(btn => {
            const title = btn.getAttribute('title');

            // Try thumbnail extraction as last resort
            let uniqueHash = "";
            let img = btn.querySelector('img[src*="/thumbnails/"]');
            if (!img) img = btn.querySelector('img');

            if (img && img.src) {
                const parts = img.src.split('/');
                const filename = parts[parts.length - 1];
                uniqueHash = filename.split('.')[0];
            }

            let chapterNum = "";
            const numMatch = title.match(/[\d\.]+/);
            if (numMatch) chapterNum = numMatch[0];

            const dateEl = btn.querySelector('span.whitespace-nowrap');
            const date = dateEl ? dateEl.innerText : '';

            let url = "#";
            if (uniqueHash && seriesSlug && chapterNum) {
                let typeSlug = "chapitre";
                if (title.toLowerCase().startsWith('chapter')) typeSlug = "chapter";
                url = `${origin}/serie/${seriesSlug}/chapter/${uniqueHash}-${typeSlug}-${chapterNum}`;
            }

            return { title, date, url };
        });

        return result;
    } catch (e) {
        console.error("Popup scrape error:", e);
        return null;
    }
}
