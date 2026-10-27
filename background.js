// FlipHTML5 Downloader - Background Service Worker
// Opens the side panel when the extension's toolbar icon is clicked.
//
// NOTE: When openPanelOnActionClick is true, chrome.action.onClicked will
// NOT fire (Chrome suppresses it in favour of opening the panel automatically).
// We therefore only need the onInstalled handler — the fallback listener has
// been removed because it is dead code that can never execute while the
// panel-on-click behaviour is active.

chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error("Error setting panel behavior:", error));
});
