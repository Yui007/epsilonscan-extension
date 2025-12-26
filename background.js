// background.js

let downloadQueue = [];
let isProcessingQueue = false;
let currentDownloadSettings = { scrollSpeed: 200, closeDelay: 3, format: 'images' };

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === "download_images") {
    const { chapterTitle, autoClose } = request;
    const folderName = (chapterTitle || "Unknown_Chapter").replace(/[<>:"/\\|?*]/g, "").trim();

    // Handle PDF download
    if (request.isPdf) {
      console.log(`Downloading PDF for ${chapterTitle}`);
      chrome.downloads.download({
        url: request.pdfUrl,
        filename: `EpsilonDownloader/${folderName}/${folderName}.pdf`,
        conflictAction: 'overwrite'
      });

      if (autoClose && sender.tab) {
        setTimeout(() => { chrome.tabs.remove(sender.tab.id); processQueue(); }, 2000);
      }
      return;
    }

    // Handle ZIP download
    if (request.isZip) {
      console.log(`Downloading ZIP for ${chapterTitle}`);
      chrome.downloads.download({
        url: request.zipUrl,
        filename: `EpsilonDownloader/${folderName}.zip`,
        conflictAction: 'overwrite'
      });

      if (autoClose && sender.tab) {
        setTimeout(() => { chrome.tabs.remove(sender.tab.id); processQueue(); }, 2000);
      }
      return;
    }

    // Handle individual images download
    const { images } = request;
    console.log(`Downloading ${images.length} images for ${chapterTitle}`);

    images.forEach((url, index) => {
      const paddedIndex = String(index + 1).padStart(3, '0');
      let ext = 'jpg';
      if (url.startsWith('data:')) {
        if (url.includes('image/png')) ext = 'png';
        else if (url.includes('image/webp')) ext = 'webp';
      } else {
        let parts = url.split('.').pop().split(/[?#]/)[0];
        if (parts && parts.length <= 4) ext = parts;
      }

      chrome.downloads.download({
        url: url,
        filename: `EpsilonDownloader/${folderName}/${paddedIndex}.${ext}`,
        conflictAction: 'overwrite'
      });
    });

    if (autoClose && sender.tab) {
      console.log(`Auto-download finished for tab ${sender.tab.id}. Closing...`);
      chrome.tabs.remove(sender.tab.id);
      setTimeout(() => { processQueue(); }, 3000);
    }

    sendResponse({ status: "started" });
  }

  if (request.action === "queue_downloads") {
    const { urls, settings } = request;
    if (urls && urls.length > 0) {
      downloadQueue.push(...urls);

      if (settings) {
        currentDownloadSettings = settings;
      }

      console.log(`Added ${urls.length} chapters to queue. Total: ${downloadQueue.length}`);
      if (!isProcessingQueue) {
        processQueue();
      }
    }
  }
});

function processQueue() {
  if (downloadQueue.length === 0) {
    isProcessingQueue = false;
    console.log("Queue finished.");
    return;
  }

  isProcessingQueue = true;
  const url = downloadQueue.shift();
  console.log("Processing:", url);

  // Open tab with auto param + settings + format
  const separator = url.includes('?') ? '&' : '?';
  const targetUrl = `${url}${separator}auto=true&speed=${currentDownloadSettings.scrollSpeed}&delay=${currentDownloadSettings.closeDelay}&format=${currentDownloadSettings.format}`;

  // Open in background (active: false)
  chrome.tabs.create({ url: targetUrl, active: false });
}
