const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ytdl = require('ytdl-core');
const axios = require('axios');

// Improved sanitizeFilename function
function sanitizeFilename(filename) {
    if (!filename) return `video_${Date.now()}`;
    
    // Remove emojis and special characters, keep basic punctuation
    const sanitized = filename
        .replace(/[\u{1F600}-\u{1F6FF}]/gu, '') // Remove emojis
        .replace(/[<>:"\/\\|?*]/g, '') // Remove illegal Windows characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .substring(0, 100) // Limit length
        .trim();
    
    return sanitized || `video_${Date.now()}`;
}

// Check if we're running locally (can use yt-dlp.exe)
const isLocal = fs.existsSync(path.join(__dirname, '../../backend/yt-dlp.exe'));
const ytDlpPath = isLocal ? path.join(__dirname, '../../backend/yt-dlp.exe') : null;

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, '../../backend/downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

const getVideoInfo = async (url) => {
    try {
        if (!isLocal && (url.includes('youtube.com') || url.includes('youtu.be'))) {
            return await getYouTubeInfo(url);
        }
        else if (!isLocal && url.includes('instagram.com')) {
            return await getInstagramInfo(url);
        }
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
        title: sanitizeFilename(info.videoDetails.title),
        thumbnail: info.videoDetails.thumbnails.sort((a, b) => b.width - a.width)[0].url,
        description: info.videoDetails.description || 'No description',
        duration: info.videoDetails.lengthSeconds,
        formats: formats,
        url: info.videoDetails.video_url
    };
};

const getInstagramInfo = async (url) => {
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
                    title: sanitizeFilename(info.title),
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
        if (!isLocal && (url.includes('youtube.com') || url.includes('youtu.be'))) {
            return await downloadYouTube(url, format);
        }
        else if (!isLocal && url.includes('instagram.com')) {
            return await downloadInstagram(url);
        }
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

const downloadYouTube = async (url, formatId) => {
    const info = await ytdl.getInfo(url);
    const title = sanitizeFilename(info.videoDetails.title);
    const filePath = path.join(downloadsDir, `${title}.mp4`);

    await new Promise((resolve, reject) => {
        ytdl(url, { quality: formatId })
            .pipe(fs.createWriteStream(filePath))
            .on('finish', resolve)
            .on('error', reject);
    });

    return filePath;
};

const downloadInstagram = async (url) => {
    const fileName = `instagram_${Date.now()}.mp4`;
    const filePath = path.join(downloadsDir, fileName);

    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.promises.writeFile(filePath, response.data);
    return filePath;
};

const downloadWithYtDlp = (url, format) => {
    return new Promise((resolve, reject) => {
        const safeFilename = `video_${Date.now()}.mp4`;
        const outputPath = path.join(downloadsDir, safeFilename);
        
        console.log('Attempting to download to:', outputPath);
        const command = `"${ytDlpPath}" -f "${format}" -o "${outputPath}" --no-playlist "${url}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Download error:', stderr);
                return reject(stderr);
            }

            console.log('Download output:', stdout);
            
            if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                if (stats.size > 0) {
                    return resolve(outputPath);
                }
                fs.unlinkSync(outputPath);
            }

            // Fallback: find the newest valid file
            const files = fs.readdirSync(downloadsDir)
                .map(file => ({
                    path: path.join(downloadsDir, file),
                    time: fs.statSync(path.join(downloadsDir, file)).mtime.getTime(),
                    size: fs.statSync(path.join(downloadsDir, file)).size
                }))
                .filter(file => file.size > 0)
                .sort((a, b) => b.time - a.time);

            if (files.length > 0) {
                resolve(files[0].path);
            } else {
                reject(new Error('No valid downloaded file found'));
            }
        });
    });
};

module.exports = {
    getVideoInfo,
    downloadVideo
};