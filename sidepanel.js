// FlipHTML5 to PDF Downloader - Side Panel Logic
// Handles tab tracking, page extraction, resilient image fetching, and PDF assembly

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const downloadBtn = document.getElementById('downloadBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const refreshBtn = document.getElementById('refreshBtn');

    const statusBadge = document.getElementById('statusBadge');
    const statusText = document.getElementById('statusText');
    const bookTitleElem = document.getElementById('bookTitle');
    const pageCountBadge = document.getElementById('pageCountBadge');
    const tabDomainElem = document.getElementById('tabDomain');

    const progressSection = document.getElementById('progressSection');
    const progressStep = document.getElementById('progressStep');
    const progressPercent = document.getElementById('progressPercent');
    const progressBarFill = document.getElementById('progressBarFill');
    const progressStatus = document.getElementById('progressStatus');
    const alertBox = document.getElementById('alertBox');

    // State
    let currentBook = null;
    let isProcessing = false;
    let abortController = null;

    // Helper: Sanitize string for valid filenames on Windows/Linux/Mac
    function sanitizeFilename(name) {
        if (!name) return 'FlipHTML5_Book';
        return name
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100) || 'FlipHTML5_Book';
    }

    // Helper: Determine image format supported by jsPDF
    function detectImageFormat(blob, dataUrl) {
        if (blob && blob.type) {
            if (blob.type.includes('png')) return 'PNG';
            if (blob.type.includes('jpeg') || blob.type.includes('jpg')) return 'JPEG';
            if (blob.type.includes('webp')) return 'WEBP';
        }
        if (dataUrl.startsWith('data:image/png')) return 'PNG';
        if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
        if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
        return 'WEBP'; // default fallback for FlipHTML5
    }

    // Helper: Show alert message
    function showAlert(message, type = 'success') {
        alertBox.className = `alert ${type}`;
        alertBox.innerHTML = message;
        alertBox.style.display = 'block';
    }

    function clearAlert() {
        alertBox.style.display = 'none';
        alertBox.innerHTML = '';
    }

    // Helper: Set status badge UI
    function setBadge(state, label) {
        statusBadge.className = `status-badge ${state}`;
        statusText.innerText = label;
    }

    // Helper: Load image into HTML Image object to read natural dimensions
    function loadImageDetails(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image element'));
            img.src = dataUrl;
        });
    }

    // Helper: Fetch with retry for network resilience
    async function fetchWithRetry(url, retries = 2, signal) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                let response = await fetch(url, { signal });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.blob();
            } catch (err) {
                if (signal && signal.aborted) throw err;
                if (attempt === retries) throw err;
                await new Promise(r => setTimeout(r, 600));
            }
        }
    }

    // Scan active tab to detect FlipHTML5 book
    async function scanActiveTab() {
        if (isProcessing) return; // Don't interrupt active download

        clearAlert();
        setBadge('waiting', 'Scanning...');
        bookTitleElem.innerText = "Checking active tab...";
        pageCountBadge.style.display = 'none';
        tabDomainElem.innerText = '';
        downloadBtn.disabled = true;
        currentBook = null;

        try {
            let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab || !tab.url) {
                setBadge('idle', 'No Tab');
                bookTitleElem.innerText = "No active tab detected";
                return;
            }

            // Reject chrome:// , edge://, about:, etc. — new URL() would succeed
            // but scripting.executeScript would throw.
            if (/^(chrome|edge|brave|about|chrome-extension):/.test(tab.url)) {
                setBadge('idle', 'Unsupported Tab');
                bookTitleElem.innerText = "Cannot access browser internal pages.";
                tabDomainElem.innerText = tab.url.split('/')[0];
                return;
            }

            let tabUrl;
            try {
                tabUrl = new URL(tab.url);
            } catch {
                setBadge('idle', 'Invalid URL');
                bookTitleElem.innerText = "Active tab URL is not valid.";
                return;
            }

            tabDomainElem.innerText = tabUrl.hostname;

            // Only attempt injection on http/https pages
            if (tabUrl.protocol !== 'http:' && tabUrl.protocol !== 'https:') {
                setBadge('idle', 'Unsupported Tab');
                bookTitleElem.innerText = "Only works on web pages (http/https).";
                return;
            }

            // Execute script in the MAIN world of the active tab to inspect reader state.
            // This also detects fliphtml5.com book detail pages that embed the reader in an iframe.
            let executionResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: "MAIN",
                func: () => {
                    let title = document.title || "FlipHTML5 Book";
                    if (window.bookConfig && window.bookConfig.bookTitle) {
                        title = window.bookConfig.bookTitle;
                    } else if (window.bookConfig && window.bookConfig.title) {
                        title = window.bookConfig.title;
                    }

                    // Case 1: Direct reader page (online.fliphtml5.com or custom domain)
                    if (window.fliphtml5_pages && Array.isArray(window.fliphtml5_pages) && window.fliphtml5_pages.length > 0) {
                        return {
                            title: title,
                            pages: window.fliphtml5_pages.map(p => ({
                                n: p.n || null,
                                l: p.l || null
                            }))
                        };
                    }

                    // Case 2: fliphtml5.com book detail page — reader is inside an iframe
                    if (window.bookData && window.bookData.bookLink) {
                        return {
                            title: title,
                            readerUrl: window.bookData.bookLink
                        };
                    }

                    if (window.bookConfig && window.bookConfig.totalPageCount) {
                        return {
                            title: title,
                            error: "Book detected, but pages array is not directly accessible (it may be protected or still loading)."
                        };
                    }

                    return {
                        title: title,
                        pages: null
                    };
                }
            });

            let res = executionResults && executionResults[0] ? executionResults[0].result : null;

            if (!res) {
                setBadge('waiting', 'Waiting for Page');
                bookTitleElem.innerText = "FlipHTML5 page is still loading...";
                return;
            }

            // If on a book detail page, try to extract pages from the embedded iframe
            if (res.readerUrl && !res.pages) {
                try {
                    let iframeResults = await chrome.scripting.executeScript({
                        target: { tabId: tab.id, allFrames: true },
                        world: "MAIN",
                        func: () => {
                            if (window.fliphtml5_pages && Array.isArray(window.fliphtml5_pages) && window.fliphtml5_pages.length > 0) {
                                return {
                                    pages: window.fliphtml5_pages.map(p => ({
                                        n: p.n || null,
                                        l: p.l || null
                                    }))
                                };
                            }
                            return null;
                        }
                    });

                    // Find the frame that had fliphtml5_pages
                    let iframeRes = null;
                    if (iframeResults) {
                        for (let frame of iframeResults) {
                            if (frame.result && frame.result.pages && frame.result.pages.length > 0) {
                                iframeRes = frame.result;
                                break;
                            }
                        }
                    }

                    if (iframeRes && iframeRes.pages) {
                        res.pages = iframeRes.pages;
                    }
                } catch (iframeErr) {
                    console.warn("Could not inject into iframe:", iframeErr);
                }
            }

            if (res.error) {
                setBadge('error', 'Protected / Locked');
                bookTitleElem.innerText = res.title || "FlipHTML5 Book";
                showAlert(res.error, 'error');
                return;
            }

            if (res.pages && res.pages.length > 0) {
                // Book is ready — determine the base URL for fetching page images.
                // If we got a readerUrl from bookData, use that as the base (it points to
                // the online.fliphtml5.com reader). Otherwise derive it from the tab URL.
                let baseOrigin;
                if (res.readerUrl) {
                    // Ensure trailing slash
                    baseOrigin = res.readerUrl.endsWith('/') ? res.readerUrl : res.readerUrl + '/';
                } else {
                    let basePath = tabUrl.pathname.split('/').slice(0, 3).join('/') + '/';
                    baseOrigin = tabUrl.origin + basePath;
                }

                currentBook = {
                    tabId: tab.id,
                    url: tab.url,
                    baseOrigin: baseOrigin,
                    title: res.title,
                    pages: res.pages
                };

                setBadge('detected', 'Book Ready');
                bookTitleElem.innerText = res.title;
                pageCountBadge.innerText = `${res.pages.length} pages`;
                pageCountBadge.style.display = 'inline-block';
                downloadBtn.disabled = false;

            } else if (res.readerUrl) {
                // We found bookData.bookLink but couldn't get pages from the iframe
                // (maybe it hasn't loaded yet). Show a helpful message.
                setBadge('waiting', 'Reader Loading');
                bookTitleElem.innerText = res.title || "FlipHTML5 Book";
                tabDomainElem.innerText = "The reader iframe is still loading. Wait a moment and click Re-scan.";

            } else {
                setBadge('idle', 'Not Detected');
                bookTitleElem.innerText = res.title || "No FlipHTML5 book found";
                tabDomainElem.innerText = "This page doesn't appear to contain a FlipHTML5 reader. If it's still loading, click Re-scan.";
            }

        } catch (err) {
            console.error("Scan tab error:", err);
            setBadge('error', 'Scan Error');
            bookTitleElem.innerText = "Unable to inspect active tab";
        }
    }

    // Auto-detect when switching tabs
    chrome.tabs.onActivated.addListener(() => {
        if (!isProcessing) scanActiveTab();
    });

    // Auto-detect when a tab in the *current window* finishes loading.
    // Filter to only re-scan when the *active* tab updates, not every tab.
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
        if (isProcessing) return;
        if (changeInfo.status !== 'complete') return;
        try {
            let [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab && activeTab.id === tabId) {
                scanActiveTab();
            }
        } catch {
            // Ignore — tab may have been closed mid-query
        }
    });

    // Refresh button manually re-scans
    refreshBtn.addEventListener('click', () => {
        scanActiveTab();
    });

    // Cancel download
    cancelBtn.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
        }
    });

    // Start Processing PDF
    downloadBtn.addEventListener('click', async () => {
        if (!currentBook || !currentBook.pages || currentBook.pages.length === 0) {
            showAlert("No pages found to download. Please re-scan.", "error");
            return;
        }

        isProcessing = true;
        abortController = new AbortController();
        clearAlert();

        downloadBtn.style.display = 'none';
        refreshBtn.style.display = 'none';
        cancelBtn.style.display = 'flex';
        progressSection.classList.add('active');

        const pages = currentBook.pages;
        const total = pages.length;
        const { jsPDF } = window.jspdf;
        let pdf = null;
        let processedCount = 0;
        let skippedCount = 0;
        let isCancelled = false;

        progressStep.innerText = `Downloading 0 / ${total}`;
        progressPercent.innerText = "0%";
        progressBarFill.style.width = "0%";
        progressStatus.innerText = "Initializing PDF generation...";

        try {
            for (let i = 0; i < total; i++) {
                if (abortController.signal.aborted) {
                    isCancelled = true;
                    break;
                }

                let pageObj = pages[i];
                let relativePath = pageObj.l || pageObj.n; // Prefer large/high-res if available
                if (!relativePath) {
                    skippedCount++;
                    continue;
                }

                let fileUrl = relativePath.startsWith('http') ? relativePath : currentBook.baseOrigin + relativePath;

                progressStatus.innerText = `Fetching page ${i + 1} of ${total}...`;

                try {
                    let blob = await fetchWithRetry(fileUrl, 2, abortController.signal);

                    // Convert Blob to Base64 Data URL
                    let base64Data = await new Promise((resolve, reject) => {
                        let reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });

                    let img = await loadImageDetails(base64Data);
                    let format = detectImageFormat(blob, base64Data);
                    let orientation = img.naturalWidth > img.naturalHeight ? 'l' : 'p';

                    if (pdf === null) {
                        pdf = new jsPDF({
                            orientation: orientation,
                            unit: 'px',
                            format: [img.naturalWidth, img.naturalHeight],
                            compress: true
                        });
                        pdf.addImage(base64Data, format, 0, 0, img.naturalWidth, img.naturalHeight);
                    } else {
                        pdf.addPage([img.naturalWidth, img.naturalHeight], orientation);
                        pdf.addImage(base64Data, format, 0, 0, img.naturalWidth, img.naturalHeight);
                    }

                    processedCount++;

                } catch (pageErr) {
                    if (abortController.signal.aborted) {
                        isCancelled = true;
                        break;
                    }
                    console.warn(`Failed page ${i + 1}: ${fileUrl}`, pageErr);
                    skippedCount++;
                }

                // Update UI progress
                let pct = Math.round(((i + 1) / total) * 100);
                progressPercent.innerText = `${pct}%`;
                progressBarFill.style.width = `${pct}%`;
                progressStep.innerText = `Processed ${processedCount} of ${total}`;

                // Small throttle to yield UI rendering
                await new Promise(r => setTimeout(r, 60));
            }

            if (isCancelled) {
                showAlert("Download was cancelled. Partial PDF was not saved.", "error");
            } else if (processedCount > 0 && pdf) {
                progressStatus.innerText = "Building & saving PDF...";
                let filename = `${sanitizeFilename(currentBook.title)}.pdf`;
                pdf.save(filename);
                let skippedMsg = skippedCount > 0 ? ` (${skippedCount} pages skipped)` : '';
                showAlert(`<strong>Success!</strong> Downloaded <strong>${filename}</strong> — ${processedCount} pages${skippedMsg}.`, "success");
            } else {
                showAlert("Could not process any pages from this book.", "error");
            }

        } catch (err) {
            console.error("Critical error during processing:", err);
            showAlert("An error occurred during PDF generation. Check console.", "error");
        } finally {
            isProcessing = false;
            abortController = null;
            cancelBtn.style.display = 'none';
            downloadBtn.style.display = 'flex';
            refreshBtn.style.display = 'flex';
            progressSection.classList.remove('active');
            downloadBtn.disabled = false;
        }
    });

    // Initial scan on sidepanel load
    scanActiveTab();
});
