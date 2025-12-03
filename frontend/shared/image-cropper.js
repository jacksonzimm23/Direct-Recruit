// Simple Image Cropper Component with Circular Crop
class ImageCropper {
    constructor() {
        this.modal = null;
        this.container = null;
        this.imageElement = null;
        this.cropCircle = null;
        this.originalFile = null;
        this.callback = null;

        // Image state
        this.img = new Image();
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        // Dragging state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragStartOffsetX = 0;
        this.dragStartOffsetY = 0;

        this.init();
    }

    init() {
        // Create modal HTML
        const modalHTML = `
            <div class="cropper-modal" id="cropperModal">
                <div class="cropper-container">
                    <div class="cropper-header">
                        <h2 class="cropper-title">Crop Profile Picture</h2>
                        <button class="cropper-close" id="cropperClose">&times;</button>
                    </div>

                    <div class="cropper-canvas-container" id="cropperCanvasContainer">
                        <img class="cropper-image" id="cropperImage" alt="Crop preview">
                        <div class="crop-overlay">
                            <div class="crop-circle" id="cropCircle"></div>
                        </div>
                    </div>

                    <div class="cropper-controls">
                        <div class="control-group">
                            <label class="control-label">Zoom</label>
                            <input type="range" class="control-slider" id="zoomSlider"
                                   min="100" max="300" value="100" step="1">
                        </div>
                    </div>

                    <div class="cropper-hint">
                        Drag to reposition • Use slider to zoom
                    </div>

                    <div class="cropper-actions">
                        <button class="btn-cropper btn-cropper-cancel" id="cropperCancel">Cancel</button>
                        <button class="btn-cropper btn-cropper-confirm" id="cropperConfirm">
                            Use This Photo
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add to document if not exists
        if (!document.getElementById('cropperModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }

        // Get elements
        this.modal = document.getElementById('cropperModal');
        this.container = document.getElementById('cropperCanvasContainer');
        this.imageElement = document.getElementById('cropperImage');
        this.cropCircle = document.getElementById('cropCircle');
        this.cropOverlay = this.cropCircle.parentElement; // Get the overlay div
        this.zoomSlider = document.getElementById('zoomSlider');

        // Setup event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Close button
        document.getElementById('cropperClose').addEventListener('click', () => {
            this.close();
        });

        // Cancel button
        document.getElementById('cropperCancel').addEventListener('click', () => {
            this.close();
        });

        // Confirm button
        document.getElementById('cropperConfirm').addEventListener('click', () => {
            this.cropAndReturn();
        });

        // Zoom slider
        this.zoomSlider.addEventListener('input', (e) => {
            this.scale = e.target.value / 100;
            this.render();
        });

        // Mouse events for dragging
        this.container.addEventListener('mousedown', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.stopDrag());

        // Touch events for mobile
        this.container.addEventListener('touchstart', (e) => this.startDrag(e), { passive: false });
        document.addEventListener('touchmove', (e) => this.drag(e), { passive: false });
        document.addEventListener('touchend', () => this.stopDrag());

        // Close on overlay click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
    }

    open(file, callback) {
        this.originalFile = file;
        this.callback = callback;

        // Read file and display
        const reader = new FileReader();
        reader.onload = (e) => {
            this.img.onload = () => {
                this.setupImage();
                this.modal.classList.add('active');
            };
            this.img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    setupImage() {
        // Get container dimensions
        const containerRect = this.container.getBoundingClientRect();
        const containerSize = Math.min(containerRect.width, containerRect.height);

        // Calculate crop circle size - 90% of container to be larger but still fit
        const circleSize = containerSize * 0.9;

        // Position circle in center - FORCE EQUAL WIDTH AND HEIGHT FOR CIRCLE
        this.cropCircle.style.width = `${circleSize}px`;
        this.cropCircle.style.height = `${circleSize}px`;
        this.cropCircle.style.minWidth = `${circleSize}px`;
        this.cropCircle.style.minHeight = `${circleSize}px`;
        this.cropCircle.style.maxWidth = `${circleSize}px`;
        this.cropCircle.style.maxHeight = `${circleSize}px`;
        this.cropCircle.style.left = `${(containerSize - circleSize) / 2}px`;
        this.cropCircle.style.top = `${(containerSize - circleSize) / 2}px`;
        this.cropCircle.style.borderRadius = '50%';
        this.cropCircle.style.border = '4px solid #1282A2';
        this.cropCircle.style.position = 'absolute';
        this.cropCircle.style.pointerEvents = 'none';
        this.cropCircle.style.zIndex = '100';
        this.cropCircle.style.background = 'transparent';
        this.cropCircle.style.boxSizing = 'border-box';

        // Update overlay with radial gradient centered on the circle
        const circleRadiusPercent = (circleSize / containerSize) * 50; // Convert to percentage from center
        this.cropOverlay.style.background = `radial-gradient(circle at center, transparent ${circleRadiusPercent}%, rgba(0, 0, 0, 0.75) ${circleRadiusPercent}%)`;

        console.log('Circle setup:', {
            circleSize,
            containerSize,
            width: this.cropCircle.style.width,
            height: this.cropCircle.style.height,
            borderRadius: this.cropCircle.style.borderRadius,
            overlayBackground: this.cropOverlay.style.background,
            left: this.cropCircle.style.left,
            top: this.cropCircle.style.top
        });

        // Calculate initial scale to fit image in circle
        const imgAspect = this.img.width / this.img.height;
        let imgWidth, imgHeight;

        if (imgAspect > 1) {
            // Landscape
            imgHeight = circleSize;
            imgWidth = imgHeight * imgAspect;
        } else {
            // Portrait or square
            imgWidth = circleSize;
            imgHeight = imgWidth / imgAspect;
        }

        // Ensure image covers the entire circle
        const minScale = Math.max(
            circleSize / imgWidth,
            circleSize / imgHeight
        );

        this.scale = minScale;
        this.offsetX = 0;
        this.offsetY = 0;

        // Update slider
        this.zoomSlider.min = Math.floor(minScale * 100);
        this.zoomSlider.value = Math.floor(minScale * 100);
        this.zoomSlider.max = Math.floor(minScale * 300);

        // Initial render
        this.render();
    }

    startDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        this.dragStartX = clientX;
        this.dragStartY = clientY;
        this.dragStartOffsetX = this.offsetX;
        this.dragStartOffsetY = this.offsetY;

        this.container.style.cursor = 'grabbing';
        console.log('Drag started at:', { clientX, clientY, target: e.target, currentTarget: e.currentTarget });
    }

    drag(e) {
        if (!this.isDragging) return;
        e.preventDefault();

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        this.offsetX = this.dragStartOffsetX + (clientX - this.dragStartX);
        this.offsetY = this.dragStartOffsetY + (clientY - this.dragStartY);

        console.log('Dragging:', { offsetX: this.offsetX, offsetY: this.offsetY });
        this.render();
    }

    stopDrag() {
        this.isDragging = false;
        this.container.style.cursor = 'move';
    }

    render() {
        const containerRect = this.container.getBoundingClientRect();
        const containerSize = Math.min(containerRect.width, containerRect.height);

        const imgAspect = this.img.width / this.img.height;
        let baseWidth, baseHeight;

        if (imgAspect > 1) {
            baseHeight = containerSize;
            baseWidth = baseHeight * imgAspect;
        } else {
            baseWidth = containerSize;
            baseHeight = baseWidth / imgAspect;
        }

        const scaledWidth = baseWidth * this.scale;
        const scaledHeight = baseHeight * this.scale;

        // Position image
        const left = (containerSize / 2) - (scaledWidth / 2) + this.offsetX;
        const top = (containerSize / 2) - (scaledHeight / 2) + this.offsetY;

        this.imageElement.src = this.img.src;
        this.imageElement.style.width = `${scaledWidth}px`;
        this.imageElement.style.height = `${scaledHeight}px`;
        this.imageElement.style.left = `${left}px`;
        this.imageElement.style.top = `${top}px`;
    }

    async cropAndReturn() {
        const confirmBtn = document.getElementById('cropperConfirm');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Processing...';

        try {
            // Get dimensions
            const containerRect = this.container.getBoundingClientRect();
            const containerSize = Math.min(containerRect.width, containerRect.height);
            const circleRect = this.cropCircle.getBoundingClientRect();

            const circleSize = circleRect.width;
            const circleX = circleRect.left - containerRect.left;
            const circleY = circleRect.top - containerRect.top;

            const imageRect = this.imageElement.getBoundingClientRect();
            const imageX = imageRect.left - containerRect.left;
            const imageY = imageRect.top - containerRect.top;
            const imageWidth = imageRect.width;
            const imageHeight = imageRect.height;

            // Calculate crop area in original image coordinates
            const scaleRatio = this.img.width / imageWidth;
            const sourceX = (circleX - imageX) * scaleRatio;
            const sourceY = (circleY - imageY) * scaleRatio;
            const sourceSize = circleSize * scaleRatio;

            // Create canvas for final circular image
            const outputSize = 500;
            const canvas = document.createElement('canvas');
            canvas.width = outputSize;
            canvas.height = outputSize;
            const ctx = canvas.getContext('2d');

            // Make circular clip
            ctx.beginPath();
            ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();

            // Draw the cropped portion
            ctx.drawImage(
                this.img,
                sourceX, sourceY, sourceSize, sourceSize,
                0, 0, outputSize, outputSize
            );

            // Convert to blob
            const blob = await new Promise((resolve) => {
                canvas.toBlob(resolve, 'image/jpeg', 0.92);
            });

            // Create file from blob
            const croppedFile = new File(
                [blob],
                this.originalFile.name.replace(/\.[^/.]+$/, '.jpg'),
                { type: 'image/jpeg' }
            );

            // Return via callback
            if (this.callback) {
                this.callback(croppedFile);
            }

            this.close();

        } catch (error) {
            console.error('Crop error:', error);
            alert('Failed to crop image. Please try again.');
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Use This Photo';
        }
    }

    close() {
        this.modal.classList.remove('active');
        this.imageElement.src = '';
        this.img.src = '';
        this.originalFile = null;
        this.callback = null;
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;

        // Reset button
        const confirmBtn = document.getElementById('cropperConfirm');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Use This Photo';
        }
    }
}

// Create global instance
window.imageCropper = new ImageCropper();
