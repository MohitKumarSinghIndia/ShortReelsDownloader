const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ytdl = require('ytdl-core');
const axios = require('axios');

// Check if we're running locally (can use yt-dlp.exe)
const isLocal = fs.existsSync(path.join(__dirname, '../../backend/yt-dlp.exe'));
const ytDlpPath = isLocal ? path.join(__dirname, '../../backend/yt-dlp.exe') : null;

const getVideoInfo = async (url) => {
    try {
        // Handle YouTube with ytdl-core if not local
        if (!isLocal && (url.includes('youtube.com') || url.includes('youtu.be'))) {
            return await getYouTubeInfo(url);
        }
        // Handle Instagram with API if not local
        else if (!isLocal && url.includes('instagram.com')) {
            return await getInstagramInfo(url);
        }
        // Local environment - use yt-dlp for everything
        else if (isLocal) {
            return await getYtDlpInfo(url);
        }
        else {
            throw new Error('Unsupported platform in cloud environment');
        }
    } catch (error) {
        console.error('Error getting video info:', error);
        throw new Error('Failed to get video info');
    }
};

// YouTube handler (using ytdl-core)
const getYouTubeInfo = async (url) => {
    const info = await ytdl.getInfo(url);
    
    const formats = info.formats
        .filter(format => format.qualityLabel)
        .map(format => ({
            id: format.itag,
            quality: format.qualityLabel,
            ext: format.container,
            type: format.hasVideo ? 'video' : 'audio',
            filesize: format.contentLength
        }));

    return {
        title: info.videoDetails.title,
        thumbnail: info.videoDetails.thumbnails.sort((a, b) => b.width - a.width)[0].url,
        description: info.videoDetails.description || 'No description',
        duration: info.videoDetails.lengthSeconds,
        formats: formats,
        url: info.videoDetails.video_url
    };
};

// Instagram handler (using free API)
const getInstagramInfo = async (url) => {
    // Using a free Instagram API service
    const apiUrl = `https://www.instagram.com/graphql/query/?query_hash=2b0673e0dc4580674a88d426fe00ea90&variables={"shortcode":"${url.split('/').filter(Boolean).pop()}"}`;
    
    const response = await axios.get(apiUrl);
    const data = response.data.data.shortcode_media;

    return {
        title: 'Instagram Video',
        thumbnail: data.display_url,
        description: data.accessibility_caption || 'Instagram Video',
        duration: data.is_video ? data.video_duration : 0,
        formats: [{
            id: 'best',
            quality: 'Original',
            ext: data.is_video ? 'mp4' : 'jpg',
            type: data.is_video ? 'video' : 'image',
            filesize: null
        }],
        url: url
    };
};

// Local yt-dlp handler
const getYtDlpInfo = (url) => {
    return new Promise((resolve, reject) => {
        exec(`"${ytDlpPath}" --dump-json --no-playlist "${url}"`, (error, stdout, stderr) => {
            if (error) return reject(stderr);
            
            try {
                const info = JSON.parse(stdout);
                const formats = info.formats.map(format => ({
                    id: format.format_id,
                    quality: format.height ? `${format.height}p` : (format.quality || ''),
                    ext: format.ext,
                    type: format.vcodec !== 'none' ? 'video' : 'audio',
                    filesize: format.filesize,
                    height: format.height || 0
                }));

                resolve({
                    title: info.title,
                    thumbnail: info.thumbnail,
                    description: info.description,
                    duration: info.duration_string,
                    formats: formats,
                    url: info.webpage_url
                });
            } catch (e) {
                reject(e);
            }
        });
    });
};

const downloadVideo = async (url, format) => {
    try {
        // YouTube in cloud
        if (!isLocal && (url.includes('youtube.com') || url.includes('youtu.be'))) {
            return await downloadYouTube(url, format);
        }
        // Instagram in cloud
        else if (!isLocal && url.includes('instagram.com')) {
            return await downloadInstagram(url);
        }
        // Local environment
        else if (isLocal) {
            return await downloadWithYtDlp(url, format);
        }
        else {
            throw new Error('Unsupported platform in cloud environment');
        }
    } catch (error) {
        console.error('Error downloading video:', error);
        throw new Error('Failed to download video');
    }
};

// YouTube downloader (cloud)
const downloadYouTube = async (url, formatId) => {
    const downloadsDir = path.join(__dirname, '../../backend/downloads');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');
    const filePath = path.join(downloadsDir, `${title}.mp4`);

    await new Promise((resolve, reject) => {
        ytdl(url, { quality: formatId })
            .pipe(fs.createWriteStream(filePath))
            .on('finish', resolve)
            .on('error', reject);
    });

    return filePath;
};

// Instagram downloader (cloud)
const downloadInstagram = async (url) => {
    const downloadsDir = path.join(__dirname, '../../backend/downloads');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const fileName = `instagram_${Date.now()}.mp4`;
    const filePath = path.join(downloadsDir, fileName);

    await fs.promises.writeFile(filePath, response.data);
    return filePath;
};

// Local yt-dlp downloader
const downloadWithYtDlp = (url, format) => {
    return new Promise((resolve, reject) => {
        const downloadDir = path.join(__dirname, '../../backend/downloads');
        const command = `"${ytDlpPath}" -f "${format}" -o "${downloadDir}/%(title)s.%(ext)s" "${url}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) return reject(stderr);

            const outputMatch = stdout.match(/\[download\] Destination: (.+)/);
            if (outputMatch && outputMatch[1]) {
                resolve(outputMatch[1]);
            } else {
                const files = fs.readdirSync(downloadDir)
                    .map(file => ({
                        name: file,
                        time: fs.statSync(path.join(downloadDir, file)).mtime.getTime()
                    }))
                    .sort((a, b) => b.time - a.time)
                    .map(file => file.name);

                if (files.length > 0) {
                    resolve(path.join(downloadDir, files[0]));
                } else {
                    reject(new Error('Could not determine downloaded file'));
                }
            }
        });
    });
};

module.exports = {
    getVideoInfo,
    downloadVideo
};