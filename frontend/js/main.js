document.addEventListener('DOMContentLoaded', function() {
    // Check which page we're on
    if (document.getElementById('fetch-btn')) {
        // Index page - handle URL submission
        const fetchBtn = document.getElementById('fetch-btn');
        const videoUrlInput = document.getElementById('video-url');
        const loadingIndicator = document.getElementById('loading');
        const errorContainer = document.getElementById('error');
        const errorMessage = document.getElementById('error-message');

        fetchBtn.addEventListener('click', fetchVideoInfo);
        videoUrlInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                fetchVideoInfo();
            }
        });

        function fetchVideoInfo() {
            const url = videoUrlInput.value.trim();
            
            // Basic URL validation
            if (!url) {
                showError('Please enter a video URL');
                return;
            }

            if (!isValidUrl(url)) {
                showError('Please enter a valid YouTube or Instagram URL');
                return;
            }

            // Show loading indicator
            loadingIndicator.classList.remove('hidden');
            errorContainer.classList.add('hidden');

            // Send request to backend
            fetch('/api/fetch-info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url }),
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw err; });
                }
                return response.json();
            })
            .then(data => {
                // Store data in sessionStorage to pass to results page
                sessionStorage.setItem('videoInfo', JSON.stringify(data));
                // Redirect to results page
                window.location.href = '/results.html';
            })
            .catch(error => {
                console.error('Error:', error);
                showError(error.error || 'Failed to fetch video information. Please check the URL and try again.');
            })
            .finally(() => {
                loadingIndicator.classList.add('hidden');
            });
        }

        function showError(message) {
            errorMessage.textContent = message;
            errorContainer.classList.remove('hidden');
        }

        function isValidUrl(url) {
            // Simple validation for YouTube and Instagram URLs
            return url.includes('youtube.com') || 
                   url.includes('youtu.be') || 
                   url.includes('instagram.com');
        }
    } else if (document.getElementById('video-title')) {
        // Results page - display video info and options
        const videoInfo = JSON.parse(sessionStorage.getItem('videoInfo'));
        
        if (!videoInfo) {
            // No data, redirect back
            window.location.href = '/results';
            return;
        }

        // Populate video info
        document.getElementById('video-title').textContent = videoInfo.title;
        document.getElementById('video-thumbnail').src = videoInfo.thumbnail;
        document.getElementById('video-duration').textContent = videoInfo.duration || 'N/A';
        document.getElementById('video-description').textContent = 
            videoInfo.description || 'No description available.';
        document.getElementById('original-url').href = videoInfo.url;

        // Populate format select dropdown and format cards
        const formatSelect = document.getElementById('format-select');
        const formatsContainer = document.getElementById('formats-container');

        // Group formats by type (video/audio)
        const videoFormats = videoInfo.formats.filter(f => f.type === 'video');
        const audioFormats = videoInfo.formats.filter(f => f.type === 'audio');

        // Add video formats first
        if (videoFormats.length > 0) {
            const videoGroup = document.createElement('div');
            videoGroup.className = 'mb-6';
            videoGroup.innerHTML = `
                <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                    <i class="fas fa-video mr-2 text-blue-600"></i> Video Formats
                </h3>
                <div class="grid md:grid-cols-2 gap-4" id="video-formats-group"></div>
            `;
            formatsContainer.appendChild(videoGroup);

            const videoGroupContainer = document.getElementById('video-formats-group');
            videoFormats.forEach(format => {
                const formatCard = createFormatCard(format);
                videoGroupContainer.appendChild(formatCard);
                
                // Add to select dropdown
                const option = document.createElement('option');
                option.value = format.id;
                option.textContent = `${format.quality} (${format.ext.toUpperCase()})${format.filesize ? ` - ${formatSize(format.filesize)}` : ''}`;
                formatSelect.appendChild(option);
            });
        }

        // Add audio formats
        if (audioFormats.length > 0) {
            const audioGroup = document.createElement('div');
            audioGroup.className = 'mb-6';
            audioGroup.innerHTML = `
                <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                    <i class="fas fa-music mr-2 text-blue-600"></i> Audio Formats
                </h3>
                <div class="grid md:grid-cols-2 gap-4" id="audio-formats-group"></div>
            `;
            formatsContainer.appendChild(audioGroup);

            const audioGroupContainer = document.getElementById('audio-formats-group');
            audioFormats.forEach(format => {
                const formatCard = createFormatCard(format);
                audioGroupContainer.appendChild(formatCard);
                
                // Add to select dropdown
                const option = document.createElement('option');
                option.value = format.id;
                option.textContent = `Audio (${format.ext.toUpperCase()})${format.filesize ? ` - ${formatSize(format.filesize)}` : ''}`;
                formatSelect.appendChild(option);
            });
        }

        // Handle format selection from dropdown
        formatSelect.addEventListener('change', function() {
            const formatId = this.value;
            if (!formatId) return;
            
            // Find the selected format
            const selectedFormat = videoInfo.formats.find(f => f.id === formatId);
            if (selectedFormat) {
                downloadVideo(selectedFormat);
            }
        });

        function createFormatCard(format) {
            const card = document.createElement('div');
            card.className = 'bg-gray-50 p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition cursor-pointer';
            card.dataset.formatId = format.id;
            
            const typeIcon = format.type === 'video' ? 
                '<i class="fas fa-video text-blue-600 mr-2"></i>' : 
                '<i class="fas fa-music text-blue-600 mr-2"></i>';
            
            const sizeInfo = format.filesize ? 
                `<div class="mt-2 text-sm text-gray-600">
                    <i class="fas fa-database mr-1"></i> ${formatSize(format.filesize)}
                </div>` : '';
            
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-medium text-gray-800 flex items-center">
                            ${typeIcon}
                            ${format.type === 'video' ? format.quality : 'Audio Only'}
                        </h4>
                        <span class="inline-block bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded-full mt-1">
                            ${format.ext.toUpperCase()}
                        </span>
                    </div>
                    <button class="download-btn bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition">
                        Download
                    </button>
                </div>
                ${sizeInfo}
            `;
            
            // Add click handler to the card and button
            const downloadBtn = card.querySelector('.download-btn');
            const downloadHandler = () => downloadVideo(format);
            
            card.addEventListener('click', (e) => {
                // Don't trigger if clicking on the download button
                if (!downloadBtn.contains(e.target)) {
                    downloadHandler();
                }
            });
            
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                downloadHandler();
            });
            
            return card;
        }

        function formatSize(bytes) {
            if (!bytes) return 'Unknown size';
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            if (bytes === 0) return '0 Byte';
            const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
            return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
        }

        function downloadVideo(format) {
            const progressContainer = document.getElementById('download-progress');
            const progressBar = document.getElementById('progress-bar');
            const progressText = document.getElementById('progress-text');
            const downloadComplete = document.getElementById('download-complete');
            const downloadLink = document.getElementById('download-link');
            
            // Show progress container
            progressContainer.classList.remove('hidden');
            progressBar.style.width = '0%';
            progressText.textContent = 'Preparing download...';
            downloadComplete.classList.add('hidden');
            
            // Scroll to progress section
            progressContainer.scrollIntoView({ behavior: 'smooth' });
            
            // Send download request to backend
            fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    url: videoInfo.url, 
                    format: format.id 
                }),
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw err; });
                }
                return response.json();
            })
            .then(data => {
                // Update progress to 100%
                progressBar.style.width = '100%';
                progressText.textContent = 'Download ready!';
                
                // Show download button
                downloadLink.href = data.downloadUrl;
                downloadLink.download = data.fileName;
                downloadComplete.classList.remove('hidden');
            })
            .catch(error => {
                console.error('Download error:', error);
                progressText.textContent = 'Error: ' + (error.error || 'Download failed');
                progressBar.style.backgroundColor = '#ef4444'; // red
            });
        }
    }
});