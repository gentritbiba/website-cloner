import homepage from './homepage.html';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveUrl(baseUrl: string, relativeUrl: string) {
    try {
        return new URL(relativeUrl, baseUrl).toString();
    } catch {
        return null;
    }
}

async function downloadFile(url: string, outputPath: string) {
    try {
        // Skip blob URLs and other unsupported protocols
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            console.log(`Skipping unsupported URL protocol: ${url}`);
            return false;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        await writeFile(outputPath, Buffer.from(buffer));
        return true;
    } catch (error) {
        console.error(`Failed to download ${url}:`, error);
        return false;
    }
}

async function createZip(sourceDir: string, outputPath: string): Promise<void> {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver.create('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
        output.on('close', () => resolve());
        archive.on('error', reject);
        archive.pipe(output);
        
        archive.file(path.join(sourceDir, 'index.html'), { name: 'index.html' });
        
        archive.directory(path.join(sourceDir, 'assets'), 'assets');
        
        archive.finalize();
    });
}

async function clearDirectory(directory: string) {
    try {
        await rm(directory, { recursive: true, force: true });
    } catch (error) {
        console.error(`Failed to clear directory ${directory}:`, error);
    }
}

async function clonePage(url: string, outputDir: string = 'output'): Promise<string> {
    const assetsDir = path.join(outputDir, 'assets');
    const zipPath = path.join(outputDir, 'webpage-clone.zip');
    
    await clearDirectory(outputDir);
    
    // Create output directories
    await mkdir(outputDir, { recursive: true });
    await mkdir(assetsDir, { recursive: true });

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    try {
        await page.goto(url, { 
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 30010 
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const assets = await page.evaluate((baseUrl) => {
            const getAssets = () => {
                const getComputedUrl = (element: HTMLElement, attr: string) => {
                    const value = element.getAttribute(attr) || '';
                    if (value.startsWith('data:') || value.startsWith('blob:')) {
                        return '';
                    }
                    return value;
                };

                const getBackgroundImages = () => {
                    const elements = document.querySelectorAll('*');
                    const bgImages: { url: string; type: string; element: string }[] = [];
                    
                    elements.forEach(el => {
                        const style = window.getComputedStyle(el);
                        const bgImage = style.backgroundImage;
                        if (bgImage && bgImage !== 'none') {
                            const url = bgImage.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
                            if (!url.startsWith('data:') && !url.startsWith('blob:')) {
                                bgImages.push({
                                    url,
                                    type: 'img',
                                    element: `<div style="background-image: url('${url}')"></div>`
                                });
                            }
                        }
                    });
                    return bgImages;
                };

                const images = Array.from(document.getElementsByTagName('img'))
                    .map(img => ({
                        url: getComputedUrl(img, 'src'),
                        type: 'img',
                        element: img.outerHTML
                    }))
                    .filter(img => img.url);

                const styles = Array.from(document.getElementsByTagName('link'))
                    .filter(link => link.rel === 'stylesheet' || link.type === 'text/css')
                    .map(link => ({
                        url: getComputedUrl(link, 'href'),
                        type: 'css',
                        element: link.outerHTML
                    }))
                    .filter(style => style.url);

                const scripts = Array.from(document.getElementsByTagName('script'))
                    .filter(script => script.src)
                    .map(script => ({
                        url: getComputedUrl(script, 'src'),
                        type: 'js',
                        element: script.outerHTML
                    }))
                    .filter(script => script.url);

                const favicons = Array.from(document.getElementsByTagName('link'))
                    .filter(link => link.rel?.includes('icon'))
                    .map(link => ({
                        url: getComputedUrl(link, 'href'),
                        type: 'icon',
                        element: link.outerHTML
                    }))
                    .filter(favicon => favicon.url);

                const backgroundImages = getBackgroundImages();

                return [...images, ...styles, ...scripts, ...favicons, ...backgroundImages];
            };

            return {
                html: document.documentElement.outerHTML,
                assets: getAssets()
            };
        }, url);

        const assetMap = new Map();
        for (const asset of assets.assets) {
            const absoluteUrl = resolveUrl(url, asset.url);
            if (!absoluteUrl) continue;
            
            try {
                const urlObj = new URL(absoluteUrl);
                const filename = `${Date.now()}-${path.basename(urlObj.pathname) || 'index'}`
                    .replace(/[^a-zA-Z0-9.-]/g, '_')
                    .split('?')[0];
                
                const filePath = path.join(assetsDir, filename);
                
                if (await downloadFile(absoluteUrl, filePath)) {
                    assetMap.set(asset.url, `assets/${filename}`);
                    assetMap.set(absoluteUrl, `assets/${filename}`);
                }
            } catch (error) {
                console.error(`Failed to process asset ${asset.url}:`, error);
            }
        }

        // Replace asset URLs in HTML
        let modifiedHtml = assets.html;
        for (const [originalUrl, newPath] of assetMap.entries()) {
            modifiedHtml = modifiedHtml.replace(new RegExp(escapeRegExp(originalUrl), 'g'), newPath);
        }

        await writeFile(path.join(outputDir, 'index.html'), modifiedHtml);

        await createZip(outputDir, zipPath);
        
        return zipPath;
    } catch (error) {
        console.error('Error cloning webpage:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

const server = Bun.serve({
    static: {
      "/": homepage,
    },
    idleTimeout: 120,
    port: 3001,
    async fetch(req) {
        const url = new URL(req.url);

        if (req.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }
        console.log(url.pathname);
        if (url.pathname === '/') {
            return new Response(homepage, {
                headers: {
                    'Content-Type': 'text/html'
                }
            });
        }

        if (url.pathname === '/api') {
            const targetUrl = url.searchParams.get('url');

            if (!targetUrl) {
                return new Response('URL parameter is required (e.g. ?url=https://example.com)', { 
                    status: 400,
                    headers: {
                        'Content-Type': 'text/plain',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }

            try {
                const requestId = Date.now().toString();
                const outputDir = path.join('output', requestId);
              
                const zipPath = await clonePage(targetUrl, outputDir);

                const zipContent = await readFile(zipPath);

                await clearDirectory(outputDir);

                return new Response(zipContent, {
                    headers: {
                        'Content-Type': 'application/zip',
                        'Content-Disposition': `attachment; filename="webpage-clone.zip"`,
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            } catch (error) {
                console.error('Server error:', error);
                return new Response('Internal server error', { 
                    status: 500,
                    headers: {
                        'Content-Type': 'text/plain',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        }

        return new Response('Not Found', { 
            status: 404,
            headers: {
                'Content-Type': 'text/plain'
            }
        });
    }
});

console.log(`Server running at http://localhost:${server.port}`);