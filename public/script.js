document.addEventListener('DOMContentLoaded', () => {
    const topicForm = document.getElementById('topic-form');
    const pdfUploadForm = document.getElementById('pdf-upload-form');
    const gradeSection = document.getElementById('grade-section');
    const pathwaySection = document.getElementById('pathway-section');
    const outputSection = document.getElementById('output-section');
    const loader = document.getElementById('loader');
    const pdfAnalysisResult = document.getElementById('pdf-analysis-result');

    let currentTopic = '';
    let currentGrade = '';

    function showLoader() {
        if (loader) {
            loader.style.display = 'flex';
        }
    }

    function hideLoader() {
        if (loader) {
            loader.style.display = 'none';
        }
    }

    if (topicForm) {
        topicForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoader();
            currentTopic = document.getElementById('topic')?.value || '';
            currentGrade = document.getElementById('grade')?.value || '';
            try {
                if (currentGrade) {
                    await generatePathway();
                } else if (gradeSection) {
                    gradeSection.style.display = 'block';
                    if (pathwaySection) pathwaySection.style.display = 'none';
                    if (outputSection) outputSection.style.display = 'none';
                }
            } catch (error) {
                console.error('Error generating pathway:', error);
                alert(`An error occurred while generating the pathway: ${error.message}`);
            } finally {
                hideLoader();
            }
        });
    }

 // In script.js - Find the PDF upload form event listener
if (pdfUploadForm) {
    pdfUploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader();
        
        const formData = new FormData();
        const pdfFile = document.getElementById('pdf-file').files[0];
        
        if (!pdfFile) {
            hideLoader();
            if (pdfAnalysisResult) {
                pdfAnalysisResult.style.display = 'block';
                pdfAnalysisResult.innerHTML = '<p class="error">Please select a PDF file.</p>';
            }
            return;
        }

        console.log('Uploading file:', {
            name: pdfFile.name,
            size: pdfFile.size,
            type: pdfFile.type
        });
        
        formData.append('pdf', pdfFile);
        
        try {
            const response = await fetch('/upload-pdf', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            console.log('Server response:', data);

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }
            
            // Update form fields
            if (document.getElementById('topic')) {
                document.getElementById('topic').value = data.topic || '';
            }
            if (document.getElementById('grade')) {
                document.getElementById('grade').value = data.grade || '';
            }
            
            // Display detailed analysis result
            if (pdfAnalysisResult) {
                pdfAnalysisResult.style.display = 'block';
                pdfAnalysisResult.innerHTML = `
                    <div class="analysis-info">
                        <p><strong>Detected Topic:</strong> ${data.topic || 'Not detected'}</p>
                        <p><strong>Academic Level:</strong> ${data.grade || 'Not detected'}</p>
                        ${data.subtopics && data.subtopics.length > 0 ? `
                            <p><strong>Subtopics:</strong></p>
                            <ul>
                                ${data.subtopics.map(subtopic => `<li>${subtopic}</li>`).join('')}
                            </ul>
                        ` : ''}
                        ${data.mainConcepts && data.mainConcepts.length > 0 ? `
                            <p><strong>Main Concepts:</strong></p>
                            <ul>
                                ${data.mainConcepts.map(concept => `<li>${concept}</li>`).join('')}
                            </ul>
                        ` : ''}
                        ${data.textPreview ? `
                            <div class="text-preview">
                                <p><strong>Text Preview:</strong></p>
                                <p class="preview-content">${data.textPreview}</p>
                            </div>
                        ` : ''}
                        <p><strong>Pages:</strong> ${data.numPages || 'Unknown'}</p>
                    </div>
                `;
            }
            
            // Set current values and generate pathway
            currentTopic = data.topic || '';
            currentGrade = data.grade || '';
            if (currentTopic && currentGrade) {
                await generatePathway();
            }
            
        } catch (error) {
            console.error('Error uploading PDF:', error);
            if (pdfAnalysisResult) {
                pdfAnalysisResult.style.display = 'block';
                pdfAnalysisResult.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            }
        } finally {
            hideLoader();
        }
    });
}
    const pathwayTimeline = document.getElementById('pathway-timeline');
    if (pathwayTimeline) {
        pathwayTimeline.addEventListener('click', (e) => {
            if (e.target.classList.contains('content-btn')) {
                e.preventDefault();
                const contentType = e.target.dataset.type;
                const stage = e.target.closest('.timeline-item')?.querySelector('h3')?.textContent || '';
                const contentOutputDiv = e.target.closest('.timeline-item')?.querySelector('.content-output');
                if (contentOutputDiv) {
                    showLoader();
                    fetchContent(currentTopic, currentGrade, contentType, stage, contentOutputDiv)
                        .catch(error => {
                            console.error('Error fetching content:', error);
                            contentOutputDiv.innerHTML = '<p class="error">Error fetching content. Please try again.</p>';
                        })
                        .finally(hideLoader);
                }
            }
        });
    }

    async function generatePathway() {
        try {
            showLoader();
            const pathway = await fetchPathway(currentTopic, currentGrade);
            const timelineHTML = createTimelineHTML(pathway);
            const pathwayTimelineElement = document.getElementById('pathway-timeline');
            if (pathwayTimelineElement) {
                pathwayTimelineElement.innerHTML = timelineHTML;
            }
            if (gradeSection) gradeSection.style.display = 'none';
            if (pathwaySection) pathwaySection.style.display = 'block';
            if (outputSection) outputSection.style.display = 'block';
        } catch (error) {
            console.error('Error generating pathway:', error);
            const pathwayTimelineElement = document.getElementById('pathway-timeline');
            if (pathwayTimelineElement) {
                pathwayTimelineElement.innerHTML = `
                    <div class="error-message">
                        <p>Sorry, we encountered an error while generating your pathway.</p>
                        <p>Please try again in a few moments.</p>
                        <p class="error-details">Error: ${error.message}</p>
                    </div>
                `;
            }
            if (pathwaySection) pathwaySection.style.display = 'block';
        } finally {
            hideLoader();
        }
    }

    // Update the fetchPathway function in script.js
async function fetchPathway(topic, grade) {
    const maxRetries = 3;
    const retryDelay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt}: Fetching pathway for topic: ${topic}, grade: ${grade}`);
            const response = await fetch(`/study-pathway?topic=${encodeURIComponent(topic)}&grade=${encodeURIComponent(grade)}`, {
                signal: AbortSignal.timeout(30000) // 30 second timeout
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error response:', errorText);
                
                // If it's the last attempt, throw the error
                if (attempt === maxRetries) {
                    throw new Error(errorText || `HTTP error! status: ${response.status}`);
                }
                
                // If not the last attempt, wait and retry
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue;
            }

            const data = await response.text();
            console.log('Received pathway data:', data.substring(0, 100) + '...');
            
            if (data.includes('Error generating study pathway')) {
                throw new Error(data);
            }
            
            return data;
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error);
            
            if (attempt === maxRetries) {
                throw new Error(`Failed to fetch pathway after ${maxRetries} attempts: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
}

// Update the error handling in the form submit handler
if (topicForm) {
    topicForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader();
        currentTopic = document.getElementById('topic')?.value || '';
        currentGrade = document.getElementById('grade')?.value || '';
        
        try {
            if (currentGrade) {
                await generatePathway();
            } else if (gradeSection) {
                gradeSection.style.display = 'block';
                if (pathwaySection) pathwaySection.style.display = 'none';
                if (outputSection) outputSection.style.display = 'none';
            }
        } catch (error) {
            console.error('Error generating pathway:', error);
            const errorMessage = error.message.includes('504') 
                ? 'The request took too long to process. Please try again with a more specific topic.'
                : `An error occurred while generating the pathway: ${error.message}`;
            
            if (pathwaySection) {
                const pathwayTimeline = document.getElementById('pathway-timeline');
                if (pathwayTimeline) {
                    pathwayTimeline.innerHTML = `
                        <div class="error-message" style="color: #721c24; background-color: #f8d7da; padding: 1rem; border-radius: 4px; margin: 1rem 0;">
                            <h3>Error</h3>
                            <p>${errorMessage}</p>
                            <button onclick="location.reload()" class="retry-btn" style="margin-top: 1rem; padding: 0.5rem 1rem; background-color: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                Try Again
                            </button>
                        </div>
                    `;
                }
                pathwaySection.style.display = 'block';
            }
        } finally {
            hideLoader();
        }
    });
}

    async function fetchContent(topic, grade, contentType, stage, contentOutputDiv) {
        try {
            const initiateResponse = await fetch(`/initiate-content-generation?topic=${encodeURIComponent(topic)}&grade=${encodeURIComponent(grade)}&type=${encodeURIComponent(contentType)}&stage=${encodeURIComponent(stage)}`);
            if (!initiateResponse.ok) {
                throw new Error(`HTTP error! status: ${initiateResponse.status}`);
            }
            const { taskId } = await initiateResponse.json();

            let content = await pollContent(taskId);
            contentOutputDiv.innerHTML = content;
        } catch (error) {
            console.error('Error fetching content:', error);
            contentOutputDiv.innerHTML = '<p class="error">Error fetching content. Please try again.</p>';
        }
    }

   // Update these values in your script.js
// Update these values in your script.js
async function pollContent(taskId, maxAttempts = 60, interval = 1000) {
    showLoader(); // Make sure loader is visible during polling
    
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, interval));
        try {
            const statusResponse = await fetch(`/check-content-status?taskId=${taskId}`);
            if (!statusResponse.ok) {
                throw new Error(`HTTP error! status: ${statusResponse.status}`);
            }
            const status = await statusResponse.json();
            if (status.status === 'completed') {
                hideLoader();
                return status.content;
            }
        } catch (error) {
            console.error('Error polling content:', error);
            if (i === maxAttempts - 1) {
                hideLoader();
                throw new Error('Content generation timed out. Please try again.');
            }
        }
    }
    hideLoader();
    throw new Error('Content generation timed out. Please try again.');
}

// Add or update these utility functions if they don't exist
function showLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'flex';
    }
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'none';
    }
}

    function createTimelineHTML(pathwayContent) {
        console.log('Creating timeline from:', pathwayContent);
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(pathwayContent, 'text/html');
        const stages = Array.from(doc.querySelectorAll('h2'));
        
        console.log('Found stages:', stages.length);
    
        if (stages.length === 0) {
            console.error('No stages found in pathway content');
            return '<p>No stages found in the generated pathway. Please try again.</p>';
        }
    
        return stages.map((stage, index) => {
            console.log(`Processing stage ${index + 1}:`, stage.textContent);
            
            let stageContent = '';
            let currentElement = stage.nextElementSibling;
            
            while (currentElement && currentElement.tagName !== 'H2') {
                stageContent += currentElement.outerHTML;
                currentElement = currentElement.nextElementSibling;
            }
    
            return `
                <div class="timeline-item">
                    <h3>${stage.textContent}</h3>
                    <div class="stage-content">
                        ${stageContent}
                    </div>
                    <div class="content-section">
                        <button class="content-btn" data-type="video">Videos</button>
                        <button class="content-btn" data-type="books">Books</button>
                        <button class="content-btn" data-type="websites">Websites</button>
                        <button class="content-btn" data-type="ai-notes">AI Notes</button>
                        <button class="content-btn" data-type="ai-questions">AI Questions</button>
                    </div>
                    <div class="content-output"></div>
                </div>
            `;
        }).join('');
    }
    const clearButton = document.getElementById('clear-content');
    
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            // Clear file input
            const fileInput = document.getElementById('pdf-file');
            if (fileInput) {
                fileInput.value = '';
            }

            // Clear analysis result
            const analysisResult = document.getElementById('pdf-analysis-result');
            if (analysisResult) {
                analysisResult.style.display = 'none';
                analysisResult.innerHTML = '';
            }

            // Clear form fields
            if (document.getElementById('topic')) {
                document.getElementById('topic').value = '';
            }
            if (document.getElementById('grade')) {
                document.getElementById('grade').value = '';
            }

            // Clear pathway section
            const pathwaySection = document.getElementById('pathway-section');
            if (pathwaySection) {
                pathwaySection.style.display = 'none';
            }
            const pathwayTimeline = document.getElementById('pathway-timeline');
            if (pathwayTimeline) {
                pathwayTimeline.innerHTML = '';
            }

            // Reset current values
            currentTopic = '';
            currentGrade = '';

            // Optional: Show confirmation message
            const uploadSection = document.querySelector('.upload-section');
            const message = document.createElement('div');
            message.className = 'clear-message';
            message.textContent = 'Content cleared successfully';
            uploadSection.appendChild(message);

            // Remove message after 3 seconds
            setTimeout(() => {
                message.remove();
            }, 3000);
        });
    }
});
// Add this to your script.js

document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('file-input');
    const uploadButton = document.getElementById('upload-button');
    const clearButton = document.getElementById('clear-button');
    const analysisSection = document.getElementById('analysis-section');
    
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleUpload);
    }
    
    if (clearButton) {
        clearButton.addEventListener('click', clearContent);
    }

    async function handleUpload(e) {
        e.preventDefault();
        showLoader();

        const file = fileInput.files[0];
        if (!file) {
            hideLoader();
            showError('Please select a PDF file');
            return;
        }

        if (file.type !== 'application/pdf') {
            hideLoader();
            showError('Please upload only PDF files');
            return;
        }

        const formData = new FormData();
        formData.append('pdf', file);

        try {
            const response = await fetch('/upload-pdf', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                displayAnalysis(result.analysis);
                await generatePathway(result.analysis.topic, result.analysis.academicLevel);
            } else {
                showError(result.error || 'Error processing PDF');
            }

        } catch (error) {
            console.error('Upload error:', error);
            showError('Error uploading file: ' + error.message);
        } finally {
            hideLoader();
        }
    }

    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = 'color: #721c24; background-color: #f8d7da; padding: 1rem; border-radius: 4px; margin: 1rem 0;';
        errorDiv.innerHTML = `
            <strong>Error:</strong> ${message}
            <button onclick="this.parentElement.remove()" style="float: right; background: none; border: none; color: #721c24; cursor: pointer;">×</button>
        `;
        uploadForm.insertAdjacentElement('afterend', errorDiv);
    }

    function displayAnalysis(analysis) {
        if (analysisSection) {
            analysisSection.innerHTML = `
                <div class="analysis-results">
                    <h3>Document Analysis</h3>
                    <p><strong>Detected Topic:</strong> ${analysis.topic}</p>
                    <p><strong>Academic Level:</strong> ${analysis.academicLevel}</p>
                    <p><strong>Pages:</strong> ${analysis.pageCount}</p>
                    <p><strong>Word Count:</strong> ${analysis.wordCount}</p>
                    <h4>Text Preview:</h4>
                    <div class="text-preview">${analysis.preview}</div>
                </div>
            `;
            analysisSection.style.display = 'block';
        }
    }

    function clearContent() {
        if (fileInput) {
            fileInput.value = '';
        }
        if (analysisSection) {
            analysisSection.innerHTML = '';
            analysisSection.style.display = 'none';
        }
        const pathwaySection = document.getElementById('pathway-section');
        if (pathwaySection) {
            pathwaySection.style.display = 'none';
        }
        const errorMessages = document.querySelectorAll('.error-message');
        errorMessages.forEach(msg => msg.remove());
    }
});