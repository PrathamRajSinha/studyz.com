document.addEventListener('DOMContentLoaded', () => {
    // Get base URL for API calls
    const baseURL = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000'
        : 'https://' + window.location.hostname;

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

    // Update the PDF upload form handler in your script.js
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
            const response = await fetch(`${baseURL}/upload-pdf`, {
                method: 'POST',
                body: formData
            });
            
            // First check if the response is OK
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // Try to parse the response as text first
            const responseText = await response.text();
            let data;
            
            try {
                // Attempt to parse the text as JSON
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Response parsing error:', parseError);
                console.log('Raw response:', responseText);
                throw new Error('Invalid response format from server');
            }

            console.log('Server response:', data);
            
            // Update form fields
            if (document.getElementById('topic')) {
                document.getElementById('topic').value = data.topic || '';
            }
            if (document.getElementById('grade')) {
                document.getElementById('grade').value = data.grade || '';
            }
            
            // Display analysis result
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
            
            // Generate pathway if we have topic and grade
            currentTopic = data.topic || '';
            currentGrade = data.grade || '';
            if (currentTopic && currentGrade) {
                await generatePathway();
            }
            
        } catch (error) {
            console.error('Error uploading PDF:', error);
            if (pdfAnalysisResult) {
                pdfAnalysisResult.style.display = 'block';
                pdfAnalysisResult.innerHTML = `
                    <div class="error-message" style="color: #721c24; background-color: #f8d7da; padding: 1rem; border-radius: 4px;">
                        <h3>Error</h3>
                        <p>${error.message}</p>
                        <button onclick="location.reload()" class="retry-btn" style="margin-top: 1rem; padding: 0.5rem 1rem; background-color: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Try Again
                        </button>
                    </div>
                `;
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

    async function fetchPathway(topic, grade) {
        const maxRetries = 3;
        const retryDelay = 2000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Attempt ${attempt}: Fetching pathway for topic: ${topic}, grade: ${grade}`);
                const response = await fetch(`${baseURL}/study-pathway?topic=${encodeURIComponent(topic)}&grade=${encodeURIComponent(grade)}`, {
                    signal: AbortSignal.timeout(30000)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Error response:', errorText);
                    
                    if (attempt === maxRetries) {
                        throw new Error(errorText || `HTTP error! status: ${response.status}`);
                    }
                    
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

    async function fetchContent(topic, grade, contentType, stage, contentOutputDiv) {
        try {
            const initiateResponse = await fetch(`${baseURL}/initiate-content-generation?topic=${encodeURIComponent(topic)}&grade=${encodeURIComponent(grade)}&type=${encodeURIComponent(contentType)}&stage=${encodeURIComponent(stage)}`);
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

    async function pollContent(taskId, maxAttempts = 60, interval = 1000) {
        showLoader();
        
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, interval));
            try {
                const statusResponse = await fetch(`${baseURL}/check-content-status?taskId=${taskId}`);
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
            if (pdfAnalysisResult) {
                pdfAnalysisResult.style.display = 'none';
                pdfAnalysisResult.innerHTML = '';
            }

            // Clear form fields
            if (document.getElementById('topic')) {
                document.getElementById('topic').value = '';
            }
            if (document.getElementById('grade')) {
                document.getElementById('grade').value = '';
            }

            // Clear pathway section
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

            // Show confirmation message
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