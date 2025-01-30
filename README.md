# Webpage Cloner

> This README.md is AI generated because I was too lazy to write it myself 😅

A web application that allows you to clone any webpage by downloading all its assets locally. It creates a zip file containing the webpage with all assets (images, stylesheets, scripts, etc.) downloaded and properly linked.

## Features

- Web interface for easy use
- Downloads and processes:
  - Images (including background images)
  - CSS stylesheets
  - JavaScript files
  - Favicons
  - Other media assets
- Handles both relative and absolute URLs
- Maintains the original webpage structure
- Updates asset references to point to local files
- Creates a zip file containing everything
- Supports concurrent requests with isolated outputs
- CORS enabled for cross-origin requests

## Prerequisites

- [Bun](https://bun.sh) (latest version)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/gentritbiba/webpage-cloner.git
cd webpage-cloner
```

2. Install dependencies:
```bash
bun install
```

## Running the Application

Start the server:
```bash
bun run index.ts
```

The application will be available at `http://localhost:3001`

## Usage

### Web Interface

1. Open your browser and navigate to `http://localhost:3001`
2. Enter the URL of the webpage you want to clone
3. Click "Clone" or press Enter
4. Wait for the process to complete
5. The zip file will automatically download

### API Endpoint

You can also use the API endpoint directly:

```bash
curl "http://localhost:3001/api?url=https://example.com" --output webpage-clone.zip
```

The API endpoint accepts GET requests with a `url` query parameter.

## Output Structure

The downloaded zip file contains:
```
webpage-clone.zip
├── index.html           # The cloned webpage
└── assets/             # Directory containing all downloaded assets
    ├── images
    ├── stylesheets
    ├── scripts
    └── other assets
```

## Notes

- Only assets with HTTP/HTTPS URLs will be downloaded
- Some websites may block automated access
- Dynamic content loaded via JavaScript might not be captured
- Data URLs and blob URLs are skipped
- The application creates temporary directories for processing which are automatically cleaned up

## Error Handling

- Invalid URLs will be rejected with appropriate error messages
- Network errors are handled gracefully
- Failed asset downloads are logged but won't stop the process
- Each request uses a unique directory to prevent conflicts

## Development

The application is built with:
- Bun.js for runtime and package management
- TypeScript for type safety
- Puppeteer for web scraping
- Archiver for zip file creation
