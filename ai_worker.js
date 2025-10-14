// ai_worker.js - Upgraded AI Core
// This worker runs on a separate thread to handle heavy AI tasks without freezing the main UI.

// Import the Tesseract.js library
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
        // Create a new Tesseract worker with Vietnamese and English languages for better accuracy.
        worker = await Tesseract.createWorker('vie+eng', 1, {
            logger: m => {
                // Send progress updates back to the main thread
                self.postMessage({ type: 'progress', data: m });
            }
        });
        
        // Configure the worker to only recognize characters found on Vietnamese license plates.
        await worker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
        });
        
        isReady = true;
        // Notify the main thread that the AI core is ready.
        self.postMessage({ type: 'ready' });
    } catch (error) {
        // Report an error if initialization fails.
        self.postMessage({ type: 'error', data: 'Could not initialize AI Core.' });
        console.error('Tesseract Worker initialization error:', error);
    }
}

/**
 * Processes the raw text recognized by Tesseract to clean and validate it as a Vietnamese license plate.
 * @param {string} rawText - The raw text output from Tesseract.
 * @returns {string|null} A cleaned, valid license plate string, or null if invalid.
 */
function postProcessPlate(rawText) {
    if (!rawText) return null;

    // 1. Clean the text: Remove all dots, dashes, and whitespace.
    const cleanedText = rawText.toUpperCase().replace(/[\s.-]/g, '');

    // 2. Validate the result: A valid plate in Vietnam typically has 7 to 9 characters.
    // This simple rule helps filter out a lot of noise and incorrect readings.
    if (cleanedText.length >= 7 && cleanedText.length <= 9) {
        return cleanedText;
    }

    // Return null if the text doesn't look like a valid plate.
    return null;
}

// Listen for messages from the main thread (index.html)
self.onmessage = async (e) => {
    const { type, data } = e.data;

    if (type === 'init') {
        // Initialize the AI when requested.
        await initializeAI();
    } else if (type === 'recognize') {
        if (!isReady || !worker) {
            self.postMessage({ type: 'error', data: 'AI Core is not ready. Please wait.' });
            return;
        }

        const { imageData } = data;
        
        try {
            // Perform recognition on the provided image data.
            const result = await worker.recognize(imageData);
            
            // **INTELLIGENT POST-PROCESSING STEP**
            const processedPlate = postProcessPlate(result.data.text);
            
            if (processedPlate) {
                // If a valid plate is found, send the cleaned result back.
                self.postMessage({ type: 'result', data: { text: processedPlate } });
            } else {
                // If the result is invalid after cleaning, do not send it back.
                // The main thread will continue scanning.
                // You can optionally send a 'no_result' message for debugging.
                 self.postMessage({ type: 'no_result' });
            }

        } catch (error) {
            self.postMessage({ type: 'error', data: 'Error during recognition.' });
            console.error('Recognition error:', error);
        }
    }
};
