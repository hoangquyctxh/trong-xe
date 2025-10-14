// ai_worker.js - Multi-Layer AI Core with Advanced Image Processing Pipeline

self.importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

let tesseractWorker = null;
let isTesseractReady = false;

/**
 * LAYER 1: Initializes the local Tesseract AI worker.
 */
async function initializeTesseract() {
    if (isTesseractReady) return;
    try {
        tesseractWorker = await Tesseract.createWorker('vie+eng', 1, {
            logger: m => self.postMessage({ type: 'progress', data: m }),
        });
        await tesseractWorker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
        });
        isTesseractReady = true;
        self.postMessage({ type: 'ready' });
    } catch (error) {
        self.postMessage({ type: 'error', data: 'Could not initialize local AI Core.' });
        console.error('Tesseract Worker initialization error:', error);
    }
}

// --- ADVANCED IMAGE PRE-PROCESSING PIPELINE ---

/**
 * Stage 1: Converts image to grayscale using the luminosity method.
 * @param {ImageData} imageData The image data to process.
 */
function grayscale(imageData) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = gray;
    }
}

/**
 * Stage 2: Increases the image contrast.
 * @param {ImageData} imageData The image data to process.
 * @param {number} factor The contrast factor.
 */
function increaseContrast(imageData, factor) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
        let val = factor * (d[i] - 128) + 128;
        val = Math.max(0, Math.min(255, val));
        d[i] = d[i + 1] = d[i + 2] = val;
    }
}

/**
 * Stage 3: Binarizes the image, turning it into pure black and white.
 * @param {ImageData} imageData The image data to process.
 * @param {number} threshold The brightness threshold (0-255).
 */
function binarize(imageData, threshold) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
        const val = d[i] > threshold ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = val;
    }
}

/**
 * Runs the full image processing pipeline for Tesseract.
 * @param {ImageData} imageData The raw image data.
 * @returns {ImageData} The processed image data.
 */
function preprocessImageForTesseract(imageData) {
    grayscale(imageData);
    increaseContrast(imageData, 2.5); // Aggressive contrast
    binarize(imageData, 128); // Threshold at mid-gray
    return imageData;
}

// --- END OF PIPELINE ---


/**
 * Converts ImageData to a Base64-encoded JPEG string for API calls.
 * @param {ImageData} imageData The raw image data.
 * @returns {Promise<string>} A promise that resolves with the Base64 encoded string.
 */
function imageDataToBase64(imageData) {
    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
    canvas.getContext('2d').putImageData(imageData, 0, 0);
    return canvas.convertToBlob({ type: 'image/jpeg' }).then(blob => {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
        });
    });
}

/**
 * Cleans and validates the recognized text to fit the license plate format.
 * @param {string} rawText The text from OCR.
 * @returns {string|null} A cleaned plate string or null.
 */
function postProcessPlate(rawText) {
    if (!rawText) return null;
    const cleanedText = rawText.toUpperCase().replace(/[\s.-]/g, '');
    if (cleanedText.length >= 7 && cleanedText.length <= 9) {
        return cleanedText;
    }
    return null;
}

/**
 * LAYER 2: The powerful Gemini Vision fallback function.
 * @param {ImageData} imageData The original, unprocessed image data.
 */
async function recognizeWithGemini(imageData) {
    self.postMessage({ type: 'progress', data: { status: 'Phân tích chuyên sâu với AI đám mây...', progress: 0.5 } });
    const base64ImageData = await imageDataToBase64(imageData);
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const prompt = `
        You are an expert Vietnamese license plate recognition system.
        Analyze this image and return ONLY the characters of the license plate.
        The result must be a single line of text containing only letters and numbers, with no extra formatting, symbols, explanations, or whitespace.
        For example, if you see '30T2- 982.23', you must return '30T298223'.
        If you cannot find a clear license plate, return an empty string.
    `;
    const payload = {
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64ImageData } }] }]
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`API request failed with status ${response.status}`);

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (text && text.trim().length > 0) {
        self.postMessage({ type: 'result', data: { text: text.trim().toUpperCase() } });
    } else {
        self.postMessage({ type: 'no_result' });
    }
}


/**
 * Main message handler for the worker.
 */
self.onmessage = async (e) => {
    const { type, data } = e.data;

    if (type === 'init') {
        await initializeTesseract();
    } else if (type === 'recognize') {
        if (!isTesseractReady) {
            self.postMessage({ type: 'error', data: 'AI Core is not ready. Please wait.' });
            return;
        }

        try {
            // --- LAYER 1: ATTEMPT WITH FAST, LOCAL TESSERACT ---
            const processedImageData = preprocessImageForTesseract(data.imageData);
            const tesseractResult = await tesseractWorker.recognize(processedImageData);
            const finalPlate = postProcessPlate(tesseractResult.data.text);
            
            // Check for a high-confidence result from Tesseract
            if (finalPlate && tesseractResult.data.confidence > 70) { // Slightly lower threshold to catch more cases
                self.postMessage({ type: 'result', data: { text: finalPlate, source: 'Tesseract' } });
                return; // Success! No need for Gemini.
            }

            // --- LAYER 2: FALLBACK TO POWERFUL GEMINI VISION ---
            // If Tesseract failed or had low confidence, use the original image for Gemini.
            await recognizeWithGemini(data.imageData);

        } catch (error) {
            self.postMessage({ type: 'error', data: 'An error occurred during AI recognition.' });
            console.error('Multi-layer AI error:', error);
        }
    }
};

