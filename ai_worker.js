// ai_worker.js - Gemini Vision AI Core
// This worker leverages Google's Gemini model for superior speed and accuracy.

/**
 * Converts ImageData to a Base64-encoded JPEG string.
 * @param {ImageData} imageData The raw image data from a canvas.
 * @returns {string} The Base64 encoded string, without the 'data:image/jpeg;base64,' prefix.
 */
function imageDataToBase64(imageData) {
    // Use an offscreen canvas for performance, if available. Otherwise, a regular canvas.
    const canvas = typeof OffscreenCanvas !== 'undefined' 
        ? new OffscreenCanvas(imageData.width, imageData.height) 
        : document.createElement('canvas');
    
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    // Convert canvas to Base64 data URL and strip the prefix.
    // Using JPEG format for smaller file size and faster API calls.
    const dataUrl = canvas.toDataURL('image/jpeg');
    return dataUrl.split(',')[1];
}

/**
 * Main message handler for the worker.
 * Listens for 'recognize' messages from the main thread.
 */
self.onmessage = async (e) => {
    const { type, data } = e.data;

    if (type === 'recognize') {
        self.postMessage({ type: 'progress', data: { status: 'processing', progress: 0.5 } });

        try {
            // Step 1: Convert image data to Base64 for the API request.
            const base64ImageData = imageDataToBase64(data.imageData);

            // Step 2: Prepare the payload for the Gemini API.
            const apiKey = ""; // Left blank to be handled by the user's environment.
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
            
            // This is the "brain" of the operation. We instruct Gemini on exactly what to do.
            const prompt = `
                You are an expert Vietnamese license plate recognition system.
                Analyze this image and return ONLY the characters of the license plate.
                The result must be a single line of text containing only letters and numbers, with no extra formatting, symbols, explanations, or whitespace.
                For example, if you see '30T2- 982.23', you must return '30T298223'.
                If you cannot find a clear license plate, return an empty response.
            `;

            const payload = {
                contents: [
                    {
                        parts: [
                            { text: prompt },
                            {
                                inlineData: {
                                    mimeType: "image/jpeg",
                                    data: base64ImageData
                                }
                            }
                        ]
                    }
                ]
            };
            
            // Step 3: Make the API call to Gemini.
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const result = await response.json();
            
            // Step 4: Extract and clean the result.
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (text && text.trim().length > 0) {
                // Gemini has already been instructed to return clean text.
                // We just trim any potential whitespace as a final safety check.
                const finalPlate = text.trim();
                self.postMessage({ type: 'result', data: { text: finalPlate } });
            } else {
                // If Gemini returns no text, it means no valid plate was found.
                self.postMessage({ type: 'no_result' });
            }

        } catch (error) {
            self.postMessage({ type: 'error', data: 'Error during AI recognition.' });
            console.error('Gemini recognition error:', error);
        }
    }
};

// Notify the main thread that the worker is ready to receive messages immediately.
self.postMessage({ type: 'ready' });

