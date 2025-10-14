// ai_worker.js - Upgraded AI Core with Advanced Image Pre-processing
// This worker runs on a separate thread to handle heavy AI tasks without freezing the main UI.

self.importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

let worker = null;
let isReady = false;

/**
 * Initializes the Tesseract AI worker.
 * This function creates and configures the OCR engine.
 */
async function initializeAI() {
    if (isReady) return;
    try {
        worker = await Tesseract.createWorker('vie+eng', 1, {
            logger: m => self.postMessage({ type: 'progress', data: m }),
        });
        
        await worker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
        });
        
        isReady = true;
        self.postMessage({ type: 'ready' });
    } catch (error) {
        self.postMessage({ type: 'error', data: 'Could not initialize AI Core.' });
        console.error('Tesseract Worker initialization error:', error);
    }
}

/**
 * **ADVANCED IMAGE PRE-PROCESSING**
 * Cleans the image to improve OCR accuracy.
 * @param {ImageData} imageData - The raw image data from the camera.
 * @returns {ImageData} The processed image data.
 */
function preprocessImage(imageData) {
    const data = imageData.data;
    const contrastFactor = 2.0; // Increase contrast significantly

    for (let i = 0; i < data.length; i += 4) {
        // 1. Convert to grayscale using the luminosity method (more accurate than averaging)
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        
        // 2. Apply contrast enhancement
        let contrastGray = contrastFactor * (gray - 128) + 128;
        
        // Clamp the values to ensure they are within the 0-255 range
        if (contrastGray > 255) contrastGray = 255;
        if (contrastGray < 0) contrastGray = 0;

        // Apply the new value to all R, G, B channels
        data[i] = contrastGray;     // red
        data[i + 1] = contrastGray; // green
        data[i + 2] = contrastGray; // blue
    }
    return imageData;
}


/**
 * Processes the raw text recognized by Tesseract to clean and validate it.
 * @param {string} rawText - The raw text output from Tesseract.
 * @returns {string|null} A cleaned, valid license plate string, or null if invalid.
 */
function postProcessPlate(rawText) {
    if (!rawText) return null;

    // Clean the text: Remove all dots, dashes, and whitespace.
    const cleanedText = rawText.toUpperCase().replace(/[\s.-]/g, '');

    // Validate the result: A valid plate in Vietnam typically has 7 to 9 characters.
    if (cleanedText.length >= 7 && cleanedText.length <= 9) {
        return cleanedText;
    }
    return null;
}

// Listen for messages from the main thread (index.html)
self.onmessage = async (e) => {
    const { type, data } = e.data;

    if (type === 'init') {
        await initializeAI();
    } else if (type === 'recognize') {
        if (!isReady || !worker) {
            self.postMessage({ type: 'error', data: 'AI Core is not ready. Please wait.' });
            return;
        }

        const { imageData } = data;
        
        try {
            // **STEP 1: Pre-process the image for better accuracy**
            const processedImageData = preprocessImage(imageData);

            // **STEP 2: Perform recognition on the cleaned image**
            const result = await worker.recognize(processedImageData);
            
            // **STEP 3: Post-process the text to validate and format**
            const processedPlate = postProcessPlate(result.data.text);
            
            if (processedPlate) {
                // If a valid plate is found, send the final result back.
                self.postMessage({ type: 'result', data: { text: processedPlate } });
            } else {
                // If the result is invalid, notify the main thread to continue scanning.
                 self.postMessage({ type: 'no_result' });
            }

        } catch (error) {
            self.postMessage({ type: 'error', data: 'Error during recognition.' });
            console.error('Recognition error:', error);
        }
    }
};

