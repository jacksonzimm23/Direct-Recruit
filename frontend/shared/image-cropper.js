// Image Cropper Component - Circular crop with drag & zoom
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
        this.minScale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        // Circle dimensions
        this.circleSize = 0;
        this.circleCenterX = 0;
        this.circleCenterY = 0;

        // Dragging state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragStartOffsetX = 0;
        this.dragStartOffsetY = 0;

        this.init();
    }

    init() {
        // Remove existing modal if present
        const existing = document.getElementById('cropperModal');
        if (existing) {
            existing.remove();
        }

        // Create modal HTML with SVG overlay for circular cutout
        const modalHTML = `
            <div class="cropper-modal" id="cropperModal">
                <div class="cropper-container">
                    <div class="cropper-header">
                        <h2 class="cropper-title">Crop Profile Picture</h2>
                        <button class="cropper-close" id="cropperClose">&times;</button>
                    </div>

                    <div class="cropper-canvas-container" id="cropperCanvasContainer">
                        <img class="cropper-image" id="cropperImage" alt="Crop preview">
                        <svg class="crop-overlay" id="cropOverlay" width="100%" height="100%">
                            <defs>
                                <mask id="cropMask">
                                    <rect width="100%" height="100%" fill="white"/>
                                    <circle id="cropMaskCircle" fill="black"/>
                                </mask>
                            </defs>
                            <rect width="100%" height="100%" fill="rgba(0,0,0,0.7)" mask="url(#cropMask)"/>
                        </svg>
                        <div class="crop-circle" id="cropCircle"></div>
                    </div>

                    <div class="cropper-hint">
                        Drag to reposition &bull; Use slider to zoom
                    </div>

                    <div class="cropper-controls">
                        <div class="control-group">
                            <label class="control-label">Zoom</label>
                            <input type="range" class="control-slider" id="zoomSlider"
                                   min="100" max="300" value="100" step="1">
                        </div>
                    </div>

                    <div class="cropper-actions">
                        <button class="btn-cropper btn-cropper-cancel" id="cropperCancel">Cancel</button>
                        <button class="btn-cropper btn-cropper-confirm" id="cropperConfirm">
                            Save Photo
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Get elements
        this.modal = document.getElementById('cropperModal');
        this.container = document.getElementById('cropperCanvasContainer');
        this.imageElement = document.getElementById('cropperImage');
        this.cropCircle = document.getElementById('cropCircle');
        this.cropOverlay = document.getElementById('cropOverlay');
        this.cropMaskCircle = document.getElementById('cropMaskCircle');
        this.zoomSlider = document.getElementById('zoomSlider');

        // Setup event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Close button (X) — same as cancel
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

        // Mouse wheel zoom
        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -5 : 5;
            const newValue = parseInt(this.zoomSlider.value) + delta;
            this.zoomSlider.value = Math.max(this.zoomSlider.min, Math.min(this.zoomSlider.max, newValue));
            this.scale = this.zoomSlider.value / 100;
            this.render();
        }, { passive: false });

        // Background click — do not close (only cancel/save buttons close the modal)
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                // Intentionally do nothing
            }
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
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
                // Small delay to ensure container is visible and has dimensions
                requestAnimationFrame(() => {
                    this.modal.classList.add('active');
                    document.body.style.overflow = 'hidden';
                    // Another frame to get accurate dimensions
                    requestAnimationFrame(() => {
                        this.setupImage();
                    });
                });
            };
            this.img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    setupImage() {
        // Get container dimensions
        const containerWidth = this.container.offsetWidth;
        const containerHeight = this.container.offsetHeight;

        // Circle size is 80% of the smaller dimension
        this.circleSize = Math.min(containerWidth, containerHeight) * 0.8;

        // Center of the circle
        this.circleCenterX = containerWidth / 2;
        this.circleCenterY = containerHeight / 2;

        const circleRadius = this.circleSize / 2;
        const circleLeft = this.circleCenterX - circleRadius;
        const circleTop = this.circleCenterY - circleRadius;

        // Style the visible crop circle border
        this.cropCircle.style.width = `${this.circleSize}px`;
        this.cropCircle.style.height = `${this.circleSize}px`;
        this.cropCircle.style.left = `${circleLeft}px`;
        this.cropCircle.style.top = `${circleTop}px`;

        // Update SVG mask circle
        this.cropMaskCircle.setAttribute('cx', this.circleCenterX);
        this.cropMaskCircle.setAttribute('cy', this.circleCenterY);
        this.cropMaskCircle.setAttribute('r', circleRadius);

        // Calculate minimum scale so image covers the circle
        const imgAspect = this.img.width / this.img.height;

        // We want the image to at minimum fill the circle
        // Start by fitting image to container
        let fitWidth, fitHeight;
        if (imgAspect > containerWidth / containerHeight) {
            // Image is wider than container
            fitHeight = containerHeight;
            fitWidth = fitHeight * imgAspect;
        } else {
            // Image is taller than container
            fitWidth = containerWidth;
            fitHeight = fitWidth / imgAspect;
        }

        // Minimum scale must ensure both dimensions cover the circle
        this.minScale = Math.max(
            this.circleSize / fitWidth,
            this.circleSize / fitHeight
        );

        // Start at minimum scale
        this.scale = this.minScale;
        this.offsetX = 0;
        this.offsetY = 0;

        // Update slider range
        const minSliderValue = Math.ceil(this.minScale * 100);
        this.zoomSlider.min = minSliderValue;
        this.zoomSlider.value = minSliderValue;
        this.zoomSlider.max = Math.max(300, minSliderValue * 3);

        // Store base dimensions for rendering
        this.baseFitWidth = fitWidth;
        this.baseFitHeight = fitHeight;

        // Initial render
        this.render();
    }

    render() {
        if (!this.baseFitWidth) return;

        const containerWidth = this.container.offsetWidth;
        const containerHeight = this.container.offsetHeight;

        // Scaled dimensions
        const scaledWidth = this.baseFitWidth * this.scale;
        const scaledHeight = this.baseFitHeight * this.scale;

        // Position centered with offset
        const left = (containerWidth - scaledWidth) / 2 + this.offsetX;
        const top = (containerHeight - scaledHeight) / 2 + this.offsetY;

        this.imageElement.src = this.img.src;
        this.imageElement.style.width = `${scaledWidth}px`;
        this.imageElement.style.height = `${scaledHeight}px`;
        this.imageElement.style.left = `${left}px`;
        this.imageElement.style.top = `${top}px`;
    }

    startDrag(e) {
        e.preventDefault();
        this.isDragging = true;

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        this.dragStartX = clientX;
        this.dragStartY = clientY;
        this.dragStartOffsetX = this.offsetX;
        this.dragStartOffsetY = this.offsetY;

        this.container.style.cursor = 'grabbing';
    }

    drag(e) {
        if (!this.isDragging) return;
        e.preventDefault();

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        const newOffsetX = this.dragStartOffsetX + (clientX - this.dragStartX);
        const newOffsetY = this.dragStartOffsetY + (clientY - this.dragStartY);

        // Calculate bounds to keep image covering the circle
        const containerWidth = this.container.offsetWidth;
        const containerHeight = this.container.offsetHeight;
        const scaledWidth = this.baseFitWidth * this.scale;
        const scaledHeight = this.baseFitHeight * this.scale;

        const circleRadius = this.circleSize / 2;
        const circleLeft = this.circleCenterX - circleRadius;
        const circleRight = this.circleCenterX + circleRadius;
        const circleTop = this.circleCenterY - circleRadius;
        const circleBottom = this.circleCenterY + circleRadius;

        // Image bounds with new offset
        const imgLeft = (containerWidth - scaledWidth) / 2 + newOffsetX;
        const imgRight = imgLeft + scaledWidth;
        const imgTop = (containerHeight - scaledHeight) / 2 + newOffsetY;
        const imgBottom = imgTop + scaledHeight;

        // Constrain offset so image always covers circle
        let constrainedOffsetX = newOffsetX;
        let constrainedOffsetY = newOffsetY;

        // Don't allow image left edge to be right of circle left
        if (imgLeft > circleLeft) {
            constrainedOffsetX = newOffsetX - (imgLeft - circleLeft);
        }
        // Don't allow image right edge to be left of circle right
        if (imgRight < circleRight) {
            constrainedOffsetX = newOffsetX + (circleRight - imgRight);
        }
        // Don't allow image top edge to be below circle top
        if (imgTop > circleTop) {
            constrainedOffsetY = newOffsetY - (imgTop - circleTop);
        }
        // Don't allow image bottom edge to be above circle bottom
        if (imgBottom < circleBottom) {
            constrainedOffsetY = newOffsetY + (circleBottom - imgBottom);
        }

        this.offsetX = constrainedOffsetX;
        this.offsetY = constrainedOffsetY;

        this.render();
    }

    stopDrag() {
        if (this.isDragging) {
            this.isDragging = false;
            this.container.style.cursor = 'grab';
        }
    }

    async cropAndReturn() {
        const confirmBtn = document.getElementById('cropperConfirm');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Processing...';

        try {
            const containerWidth = this.container.offsetWidth;
            const containerHeight = this.container.offsetHeight;
            const scaledWidth = this.baseFitWidth * this.scale;
            const scaledHeight = this.baseFitHeight * this.scale;

            // Image position in container
            const imgLeft = (containerWidth - scaledWidth) / 2 + this.offsetX;
            const imgTop = (containerHeight - scaledHeight) / 2 + this.offsetY;

            // Circle position
            const circleRadius = this.circleSize / 2;
            const circleLeft = this.circleCenterX - circleRadius;
            const circleTop = this.circleCenterY - circleRadius;

            // Calculate crop area in original image coordinates
            const scaleToOriginal = this.img.width / scaledWidth;

            const sourceX = (circleLeft - imgLeft) * scaleToOriginal;
            const sourceY = (circleTop - imgTop) * scaleToOriginal;
            const sourceSize = this.circleSize * scaleToOriginal;

            // Create output canvas (square)
            const outputSize = 400;
            const canvas = document.createElement('canvas');
            canvas.width = outputSize;
            canvas.height = outputSize;
            const ctx = canvas.getContext('2d');

            // Fill with a neutral background
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, outputSize, outputSize);

            // Draw the cropped square portion
            ctx.drawImage(
                this.img,
                Math.max(0, sourceX),
                Math.max(0, sourceY),
                Math.min(sourceSize, this.img.width - sourceX),
                Math.min(sourceSize, this.img.height - sourceY),
                0,
                0,
                outputSize,
                outputSize
            );

            // Convert to blob (JPEG)
            const blob = await new Promise((resolve) => {
                canvas.toBlob(resolve, 'image/jpeg', 0.9);
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
            showToast('Failed to crop image. Please try again.', 'error');
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Save Photo';
        }
    }

    close() {
        this.modal.classList.remove('active');
        document.body.style.overflow = '';

        // Reset state
        this.imageElement.src = '';
        this.img.src = '';
        this.originalFile = null;
        this.callback = null;
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.baseFitWidth = 0;
        this.baseFitHeight = 0;

        // Reset button
        const confirmBtn = document.getElementById('cropperConfirm');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Save Photo';
        }
    }
}

// Create global instance
window.imageCropper = new ImageCropper();
