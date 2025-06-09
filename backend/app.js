const path = require('path');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const downloader = require('./utils/downloader');

const app = express();
const PORT = process.env.PORT || 3000;

// Windows-specific fixes
if (process.platform === 'win32') {
    process.env.NODE_ENV = 'production';
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Routes
app.post('/api/fetch-info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        const info = await downloader.getVideoInfo(url);
        res.json(info);
    } catch (error) {
        console.error('Error fetching video info:', error);
        res.status(500).json({ error: 'Failed to fetch video info' });
    }
});

app.post('/api/download', async (req, res) => {
    try {
        const { url, format } = req.body;
        if (!url || !format) {
            return res.status(400).json({ error: 'URL and format are required' });
        }

        const filePath = await downloader.downloadVideo(url, format);
        const fileName = path.basename(filePath);

        res.json({ 
            downloadUrl: `/downloads/${encodeURIComponent(fileName)}`,
            fileName
        });
    } catch (error) {
        console.error('Error downloading video:', error);
        res.status(500).json({ error: 'Failed to download video' });
    }
});

app.get('/downloads/:filename', (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        const filePath = path.join(downloadsDir, filename);
        
        if (!fs.existsSync(filePath)) {
            console.error('File not found:', filePath);
            return res.status(404).json({ error: 'File not found' });
        }

        // Verify file is valid
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            fs.unlinkSync(filePath);
            return res.status(500).json({ error: 'File is empty' });
        }

        res.download(filePath, filename, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Error sending file' });
                }
            }
            
            // Clean up file after download
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (unlinkErr) {
                console.error('Error deleting file:', unlinkErr);
            }
        });
    } catch (error) {
        console.error('Error handling download request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/results.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Downloads directory: ${downloadsDir}`);
});