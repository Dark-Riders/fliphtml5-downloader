# FlipHTML5 to PDF Downloader (Side Panel)

A lightweight, powerful Google Chrome extension (Manifest V3) that runs in your browser's **Side Panel** to extract high-resolution pages from FlipHTML5 publications and merge them into a single, clean PDF file.

## Why Side Panel?

Unlike traditional popups that automatically close (and abort your download) if you click anywhere else on the screen, the **Chrome Side Panel** stays open persistently while you browse, switch tabs, or inspect documents.

## Features

- **Side Panel Architecture**: Stays open reliably during downloads without accidental interruptions.
- **Active Tab Auto-Detection**: Automatically detects FlipHTML5 books, publication titles, and total page counts as you browse between tabs.
- **Visual Progress Bar**: Real-time percentage, page counters, and status updates throughout PDF generation.
- **Dynamic Format Support**: Auto-detects page image formats (`WEBP`, `JPEG`, `PNG`) for optimal jsPDF rendering.
- **Cancel Support**: Abort long downloads cleanly at any point with a single click.
- **Network Resilience**: Automatic retry mechanism if an individual page asset encounters a temporary network glitch.
- **Sanitized Filenames**: Automatically uses the publication's real title to name your PDF file.
- **100% Client-Side Privacy**: Runs completely inside your browser using bundled `jsPDF`. No external servers or API calls are used.

## Installation

1. Clone or download this repository to your computer:
   ```bash
   git clone https://github.com/mlintangmz2765/fliphtml5-downloader.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** via the toggle in the top-right corner.
4. Click **Load unpacked** and select the directory:
   `d:\Projects\fliphtml5-downloader\fliphtml5-downloader-1.0`
5. The extension is now installed!

## How to Use

1. Navigate to any FlipHTML5 publication (e.g. `https://online.fliphtml5.com/...`).
2. Click the **FlipHTML5 Downloader** icon in your Chrome toolbar. This opens the extension in the **Chrome Side Panel**.
3. The side panel automatically inspects the active tab, displays the book title, and calculates the total pages.
4. Click **"Start Processing PDF"**.
5. Watch the progress bar as each page is fetched and compiled into the PDF.
6. Once complete, your combined PDF file is automatically saved to your downloads folder.

## Requirements

- Google Chrome (version 116+ recommended for full Side Panel support) or any compatible Chromium browser.
- Manifest V3 compliant.
- `jspdf.umd.min.js` bundled locally for offline PDF generation.

## Disclaimer

This extension is provided for educational and personal archiving purposes only. Users are solely responsible for ensuring they have the right to download and store the content they access. Do not use this tool to violate copyright laws or redistribute protected content without authorization.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
